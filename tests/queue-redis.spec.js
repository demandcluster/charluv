"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const chai_1 = require("chai");
const redis_1 = require("redis");
const redis_2 = require("/srv/queue/redis");
const tick = (ms = 50) => new Promise((r) => setTimeout(r, ms));
describe('RedisBackend acquire cleanup (stubbed)', () => {
    it('ZREMs its waiter from gate:wait when the acquire eval throws', async () => {
        const { RedisBackend } = require('/srv/queue/redis');
        const scripts = [];
        const cmd = {
            eval: (script) => {
                if (script.includes('ZREM')) {
                    scripts.push('zrem');
                    return Promise.resolve(1);
                }
                scripts.push('acquire');
                return Promise.reject(new Error('redis down'));
            },
            publish: () => Promise.resolve(1),
            hSet: () => Promise.resolve(1),
        };
        const sub = { subscribe: () => Promise.resolve() };
        const backend = new RedisBackend({
            caps: { global: 10, image: 4 },
            cmd: cmd,
            sub: sub,
            keyPrefix: 'test-cleanup',
        });
        let threw = false;
        await backend.acquire({ id: 'a', kind: 'text', priority: 1, enqueuedAt: 1 }).catch(() => {
            threw = true;
        });
        (0, chai_1.expect)(threw).to.equal(true);
        (0, chai_1.expect)(scripts).to.include('zrem');
    });
});
describe('RedisBackend (requires local redis)', function () {
    this.timeout(8000);
    let cmd;
    let sub;
    let available = true;
    const prefix = 'test-gate-' + process.pid + '-' + Math.floor(Math.random() * 1e6);
    before(async () => {
        try {
            cmd = (0, redis_1.createClient)({ url: 'redis://127.0.0.1:6379' });
            sub = cmd.duplicate();
            await cmd.connect();
            await sub.connect();
        }
        catch {
            available = false;
        }
    });
    after(async () => {
        if (!available)
            return;
        const keys = await cmd.keys(prefix + ':*');
        if (keys.length)
            await cmd.del(keys);
        await cmd.quit();
        await sub.quit();
    });
    it('caps combined inflight and serves premium first', async function () {
        if (!available)
            this.skip();
        const b = new redis_2.RedisBackend({ caps: { global: 1, image: 4 }, cmd, sub, keyPrefix: prefix });
        const order = [];
        await b
            .acquire({ id: 'hold', kind: 'text', priority: 1, enqueuedAt: 1 })
            .then(() => order.push('hold'));
        b.acquire({ id: 'free', kind: 'text', priority: 1, enqueuedAt: 2 }).then(() => order.push('free'));
        b.acquire({ id: 'prem', kind: 'text', priority: 0, enqueuedAt: 3 }).then(() => order.push('prem'));
        await tick();
        await b.release('hold');
        await tick();
        (0, chai_1.expect)(order).to.deep.equal(['hold', 'prem']);
        await b.release('prem');
        await tick();
        (0, chai_1.expect)(order).to.deep.equal(['hold', 'prem', 'free']);
    });
});
//# sourceMappingURL=queue-redis.spec.js.map