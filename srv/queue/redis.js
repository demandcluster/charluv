"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RedisBackend = void 0;
// KEYS: 1=active 2=wait 3=meta
// ARGV: 1=leaseId 2=kind 3=score 4=globalCap 5=imageCap 6=ttlMs 7=nowMs
const ACQUIRE = `
local active, wait, meta = KEYS[1], KEYS[2], KEYS[3]
local id, kind, score = ARGV[1], ARGV[2], tonumber(ARGV[3])
local gcap, icap = tonumber(ARGV[4]), tonumber(ARGV[5])
local ttl, now = tonumber(ARGV[6]), tonumber(ARGV[7])

-- ensure we are registered as waiting (idempotent)
if redis.call('ZSCORE', wait, id) == false then
  redis.call('ZADD', wait, score, id)
end

-- reap expired leases
local all = redis.call('HGETALL', active)
local inflight, image = 0, 0
for i = 1, #all, 2 do
  local lid, val = all[i], all[i+1]
  local sep = string.find(val, ':')
  local lkind = string.sub(val, 1, sep-1)
  local exp = tonumber(string.sub(val, sep+1))
  if exp < now then
    redis.call('HDEL', active, lid)
  else
    inflight = inflight + 1
    if lkind == 'image' then image = image + 1 end
  end
end

local pause = redis.call('HGET', meta, 'pauseText') == '1'

-- find highest-priority eligible waiter
local members = redis.call('ZRANGE', wait, 0, -1, 'WITHSCORES')
local chosen = nil
for i = 1, #members, 2 do
  local mid = members[i]
  -- we only know our own kind; eligibility for others is recomputed when they run.
  -- Determine eligibility for THIS member only when it is us; otherwise use counts.
  local eligible = false
  if inflight < gcap then
    if mid == id then
      if kind == 'image' then eligible = (image < icap) else eligible = (not pause) end
    else
      -- unknown kind: treat as eligible by global room so true head-of-line is respected;
      -- the member re-checks its own predicate on its own call.
      eligible = true
    end
  end
  if eligible then chosen = mid break end
end

if chosen == id then
  redis.call('ZREM', wait, id)
  redis.call('HSET', active, id, kind .. ':' .. tostring(now + ttl))
  return {1, 0}
end

local rank = redis.call('ZRANK', wait, id)
return {0, (rank or 0) + 1}
`;
// KEYS: 1=active ; ARGV: 1=leaseId
const RELEASE = `return redis.call('HDEL', KEYS[1], ARGV[1])`;
// KEYS: 1=active ; ARGV: 1=leaseId 2=kind 3=ttlMs 4=nowMs
const HEARTBEAT = `
local cur = redis.call('HGET', KEYS[1], ARGV[1])
if cur == false then return 0 end
redis.call('HSET', KEYS[1], ARGV[1], ARGV[2] .. ':' .. tostring(tonumber(ARGV[4]) + tonumber(ARGV[3])))
return 1
`;
class RedisBackend {
    constructor(opts) {
        this.active = '·';
        this.wait = '·';
        this.meta = '·';
        this.freeChan = '·';
        this.heartbeats = new Map();
        this.wakeups = new Set();
        this.subscribed = false;
        this.caps = opts.caps;
        this.cmd = opts.cmd;
        this.sub = opts.sub;
        this.prefix = opts.keyPrefix || 'gate';
        this.ttlMs = opts.ttlMs ?? 30000;
        this.heartbeatMs = opts.heartbeatMs ?? 10000;
        this.active = `${this.prefix}:active`;
        this.wait = `${this.prefix}:wait`;
        this.meta = `${this.prefix}:meta`;
        this.freeChan = `${this.prefix}:free`;
    }
    async ensureSubscribed() {
        if (this.subscribed)
            return;
        this.subscribed = true;
        await this.sub.subscribe(this.freeChan, () => {
            for (const wake of this.wakeups)
                wake();
        });
    }
    setPauseText(pause) {
        this.cmd.hSet(this.meta, 'pauseText', pause ? '1' : '0').catch(() => { });
    }
    async acquire(req) {
        await this.ensureSubscribed();
        const score = String(req.priority * 1e13 + req.enqueuedAt);
        let lastPosition = -1;
        const tryAcquire = async () => {
            const [ok, position] = await this.cmd.eval(ACQUIRE, {
                keys: [this.active, this.wait, this.meta],
                arguments: [
                    req.id,
                    req.kind,
                    score,
                    String(this.caps.global),
                    String(this.caps.image),
                    String(this.ttlMs),
                    String(Date.now()),
                ],
            });
            return { ok: ok === 1, position: Number(position) };
        };
        try {
            while (true) {
                if (req.signal?.aborted) {
                    await this.removeWaiter(req.id);
                    throw new Error('aborted');
                }
                const { ok, position } = await tryAcquire();
                if (ok) {
                    this.startHeartbeat(req.id, req.kind);
                    return;
                }
                if (req.onPosition && position !== lastPosition) {
                    lastPosition = position;
                    req.onPosition(position);
                }
                await this.waitForWake(req.signal);
            }
        }
        catch (err) {
            // Any failure (Redis eval error, abort) must not orphan our waiter in the
            // gate:wait ZSET — it has no TTL/reaper, and a stale head would block other
            // waiters. ZREM self (best-effort) before propagating.
            await this.removeWaiter(req.id).catch(() => { });
            throw err;
        }
    }
    waitForWake(signal) {
        return new Promise((resolve) => {
            const wake = () => {
                cleanup();
                resolve();
            };
            const timer = setTimeout(wake, 1000); // safety re-poll
            const onAbort = () => wake();
            const cleanup = () => {
                clearTimeout(timer);
                this.wakeups.delete(wake);
                if (signal)
                    signal.removeEventListener('abort', onAbort);
            };
            this.wakeups.add(wake);
            if (signal)
                signal.addEventListener('abort', onAbort);
        });
    }
    startHeartbeat(id, kind) {
        const timer = setInterval(() => {
            this.cmd
                .eval(HEARTBEAT, {
                keys: [this.active],
                arguments: [id, kind, String(this.ttlMs), String(Date.now())],
            })
                .catch(() => { });
        }, this.heartbeatMs);
        this.heartbeats.set(id, timer);
    }
    async removeWaiter(id) {
        // ZREM via eval to avoid widening the RedisCmd interface
        await this.cmd
            .eval(`return redis.call('ZREM', KEYS[1], ARGV[1])`, { keys: [this.wait], arguments: [id] })
            .catch(() => { });
        await this.cmd.publish(this.freeChan, '1').catch(() => { });
    }
    async release(id) {
        const timer = this.heartbeats.get(id);
        if (timer) {
            clearInterval(timer);
            this.heartbeats.delete(id);
        }
        await this.cmd.eval(RELEASE, { keys: [this.active], arguments: [id] }).catch(() => { });
        await this.cmd.publish(this.freeChan, '1').catch(() => { });
    }
}
exports.RedisBackend = RedisBackend;
//# sourceMappingURL=redis.js.map