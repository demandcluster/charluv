# Inference Concurrency Queue — Design

Date: 2026-06-26
Status: Approved (design), pending implementation plan

## Problem

A single NVIDIA DGX hosts both inference backends:

- **Text** — self-hosted **vLLM** (OpenAI-compatible streaming). GPU can run ~16
  concurrent, and vLLM has its own internal wait queue beyond that.
- **Image** — self-hosted SD-compatible / Z-Image endpoint, ~4 concurrent.

Today the app fires generations with no gating, so under load it over-feeds vLLM
(its internal `num_requests_waiting` grows = latency spikes for everyone) and
over-feeds the image endpoint. We want an app-side queue that (a) keeps total
outbound concurrency bounded so we never hammer vLLM, (b) serves premium members
first when there's contention, and (c) never exceeds the image backend's 4.

## Deployment

Everything runs on **one DGX**. The app itself runs as **multiple processes**
(workers/containers) sharing that one box and one Redis (Redis pub/sub already
backs the websocket bus in `srv/api/ws/bus.ts`). So all concurrency counting must
be **shared state in Redis**, not per-process. All caps are config-driven.

## The model (decided during brainstorming)

Two layers of control, plus a circuit breaker:

1. **Global soft admission cap = 10 (combined text + image).** A request is
   admitted to run immediately only while total in-flight (text + image) `< 10`.
   At 10, further requests **wait** in a priority queue. This is the primary
   "don't hammer vLLM" control. Flat for everyone — premium does **not** raise it.
2. **Image sub-cap = 4.** Within the admitted set, no more than 4 image requests
   run at once (the image backend's hard limit). A text-only path is never gated
   by this.
3. **Premium priority.** When requests are waiting, the highest-priority *eligible*
   waiter goes next. Premium > free > guest > background. Premium jumps the line;
   it does not get a bigger cap.
4. **vLLM circuit breaker (hybrid signal).** Our Redis counter is the fast, exact
   admission gate. Additionally we poll vLLM `/metrics` and, if
   `vllm:num_requests_waiting` exceeds a threshold, we **stop admitting new text**
   (they keep waiting) even when in-flight `< 10` — until it drains. Catches the
   case where heavy prompts or other clients back vLLM up. Image is unaffected.

`num_requests_running` from the same endpoint is also scraped for
observability/cross-checking our counter, but admission is driven by our counter,
not the metric (poll lag would race under burst).

### Note on the hard caps

- **Text 16** is now non-binding: text alone can't exceed the combined 10, so it
  never gates. Kept only as a config safety rail (`TEXT_HARD_CAP`).
- **Image 4** is the real, enforced image sub-cap.

## Requirements

1. Total in-flight (text + image) capped at **10** cluster-wide (Redis-shared
   across the app's processes). Configurable.
2. Image in-flight capped at **4**. Configurable.
3. **FIFO wait, no rejection** when at cap — requests block until a slot frees.
   The queue never rejects (no timeout).
4. **Premium priority** in the wait queue (premium → free → guest → background).
   Background LLM work (moderation, summary, RAG, guidance) shares the same pool
   at lowest priority.
5. **Show queue position** to the waiting user ("Queued #N").
6. **Heartbeat lease TTL** — a slot is a short-TTL lease (~30s) refreshed every
   ~10s while the stream runs, so a crashed/stuck node frees its slot within ~30s.
7. **vLLM circuit breaker** — pause text admission while
   `vllm:num_requests_waiting` is over threshold.

## Non-goals

- No per-user concurrency cap. (Priority handles fairness; the global cap of 10
  bounds total load. Revisit only if one user is observed monopolizing the queue.)
- No per-request reject/timeout.
- No job-worker / offload model — streaming replies must run in the web process
  holding the socket (rules out BullMQ).
- No data migration; queue state is ephemeral Redis only.

## Architecture

### `PriorityGate` (new: `srv/queue/`)

A single global gate instance with a priority wait queue and a kind-aware
admission predicate. (One gate, not one-per-endpoint, because the binding cap is
the combined 10; the image 4 is a sub-condition inside it.)

```ts
type Kind = 'text' | 'image'

type GateOpts = {
  kind: Kind
  userId?: string        // for position events
  socketId?: string      // guest fan-out target
  requestId?: string
  priority: number       // 0 premium, 1 free, 2 guest, 3 background
}

// Acquire (blocking, priority + eligibility), run fn, release in finally.
gate.run<T>(opts: GateOpts, fn: () => Promise<T>): Promise<T>

// Wrap an async generator: acquire before the first chunk is pulled,
// release when it finishes/throws. Slot held for the stream's lifetime.
gate.gateStream<T>(opts: GateOpts, makeGen: () => AsyncGenerator<T>): AsyncGenerator<T>
```

### Admission predicate (eligibility)

A waiter at the head of its priority class is admitted only if its predicate holds
*now*:

- `text`: `inflight < 10` **and** circuit breaker closed (`vllmWaiting <= threshold`).
- `image`: `inflight < 10` **and** `imageInflight < 4`.

If the highest-priority head is ineligible (e.g. an image request blocked on the
image sub-cap, or text blocked by the breaker), the gate admits the
**highest-priority waiter whose predicate currently passes** instead — so an image
backlog never stalls ready text, and a breaker-paused text backlog never stalls
ready image. (Eligibility-aware, not strict positional FIFO; FIFO still holds
within a {priority, kind} group.)

### Priority tiers

| Priority | Who |
|----------|-----|
| 0 | Premium member (active subscription tier via `getUserSubscriptionTier`) |
| 1 | Free signed-in user, user-facing chat/image |
| 2 | Guest |
| 3 | Background/utility (moderation, summary, RAG, guidance) |

Lower served first; FIFO by enqueue time within a tier.

### Redis data model

- `gate:active` — hash `leaseId -> "{kind}:{expiryMs}"`. Live slots.
  `inflight = HLEN`; `imageInflight = count where kind == image`.
- `gate:wait` — ZSET of waiters. score = `priority * 1e13 + enqueueMs`
  (priority dominates; timestamp = FIFO tiebreak).
- `gate:meta` — small hash storing the latest scraped `vllmWaiting` /
  `vllmRunning` (written by the metrics poller, read inside the acquire Lua).
- Pub/sub channel `gate:free` — published on every release to wake waiters.

### Lua scripts (atomicity)

- **acquire(leaseId, kind, myScore, caps, ttlMs, nowMs)**
  1. Reap `active` entries with `expiry < now`.
  2. Compute `inflight`, `imageInflight`; read `vllmWaiting` from `gate:meta`.
  3. Among `wait` members ordered by score, find the **highest-priority eligible**
     one (predicate above). If it's me → `ZREM` self, `HSET active leaseId
     "{kind}:{now+ttl}"`, return `{acquired:1}`. Else return `{acquired:0,
     position:<my ZRANK+1>}`.
- **release(leaseId)** — `HDEL active leaseId`; caller then `PUBLISH gate:free`.
- **heartbeat(leaseId, ttlMs, nowMs)** — if lease exists, reset expiry; else tell
  caller the lease was reaped.

### Acquire flow (per waiter)

1. `ZADD wait myScore leaseId`; ensure subscribed to `gate:free`.
2. Try `acquire`. If acquired → start heartbeat interval, return.
3. Else → emit position event (throttled, on change); `await` next `gate:free`
   publish OR a ~1s safety re-poll (covers missed publishes and breaker-state
   changes that produce no publish). Loop to 2.
4. On caller abort / client disconnect → `ZREM` self (or `release` if already
   acquired) and `PUBLISH gate:free`.

### Release flow

`clearInterval(heartbeat)` → `release` Lua → `PUBLISH gate:free`. Always in a
`finally`.

### vLLM metrics poller

One lightweight interval (guarded so only one process polls at a time — reuse the
existing `obtainManagerLock` pattern in `srv/domains/lock.ts`, or just let each
node poll and write its own view; cheap) fetches `VLLM_METRICS_URL`, parses the
Prometheus text for `vllm:num_requests_waiting` and `vllm:num_requests_running`,
and writes them to `gate:meta` with a freshness timestamp. If the scrape is stale
(poller down) the breaker fails **open** (admit normally) so a metrics outage can't
freeze generation.

### In-process fallback

When `config.redis.host` is unset / not connected (single-node dev; mirrors
`bus.ts` dual-mode), `PriorityGate` uses a local implementation: integer
`inflight`/`imageInflight` + a priority-sorted wait list, same predicate, same API.
The metrics poll (if configured) still drives a local breaker flag. No Redis,
no heartbeat needed (process-local).

## Wrap sites

All inference funnels through three points; one gate, kind-tagged:

1. **`srv/adapter/generate.ts → createInferenceStream`** — wrap the returned
   `stream` with `gate.gateStream({ kind: 'text', priority: 3, ... })`. Covers
   `inferenceAsync` (background/utility, guidance). Priority defaults to 3 unless
   the caller overrides (see below).
2. **`srv/adapter/generate.ts → createChatStream`** — wrap the returned `stream`
   with `gate.gateStream({ kind: 'text', priority: <by tier>, ... })`. Covers
   user-facing chat replies.
3. **`srv/image/index.ts → generateImage`** — wrap the `handle*Image(...)` call
   with `gate.run({ kind: 'image', priority: <by tier>, ... })`. Covers all image
   generation.

Priority from the request user: `getUserSubscriptionTier(user, getCachedTiers())`
→ active tier ⇒ 0; signed-in no tier ⇒ 1; guest ⇒ 2. Background utility callers
pass explicit priority 3 via a new optional field:
- `InferenceRequest.queuePriority?: number` (srv/adapter/generate.ts).
- `GenerateRequestV2` already carries user/guest; priority derived at the wrap site.

## Client UX — queue position

While waiting (not yet admitted), throttled on position change:

```ts
sendOne(userId,  { type: 'queue-position', kind, position, requestId })  // signed-in
sendGuest(socketId, { type: 'queue-position', kind, position, requestId }) // guest
```

On admission, emit `position: 0` (or `queue-cleared`) so the client drops the
badge. Web store (`web/store/message.ts`) renders "Queued #N" on the pending
message / image spinner.

## Configuration

| Env | Default | Meaning |
|-----|---------|---------|
| `INFERENCE_GLOBAL_CONCURRENCY` | 10 | Combined text+image soft admission cap |
| `IMAGE_CONCURRENCY` | 4 | Image sub-cap |
| `TEXT_HARD_CAP` | 16 | Non-binding safety rail for text |
| `VLLM_METRICS_URL` | (unset) | Prometheus metrics endpoint; breaker disabled if unset |
| `VLLM_WAITING_THRESHOLD` | 1 | Pause text admission while `num_requests_waiting` exceeds this |
| `VLLM_METRICS_POLL_MS` | 1500 | Scrape interval |

Added under `config.inference` (alongside the existing image settings).

## Error handling

- **Redis unavailable mid-run**: heartbeat failure → log; let the in-flight
  generation finish (don't kill a live user reply); new requests use the
  in-process fallback gate until reconnect.
- **Client disconnect while queued/running**: existing socket lifecycle → abort
  the gate wait, `ZREM`/`release`, publish free. No leaked slots.
- **Lease reaped while still streaming** (heartbeat lost a race): best-effort
  re-acquire; if it can't, the stream continues (already in flight) but is no
  longer counted — acceptable, self-corrects on completion.
- **Metrics scrape fails / stale**: breaker fails **open** (admit normally).
- **Missed wake publish**: the ~1s safety re-poll guarantees liveness.

## Testing

- Unit (in-process gate, deterministic): combined cap never exceeds 10; image
  sub-cap never exceeds 4; text never gated by the image sub-cap; priority
  ordering (premium → free → background); FIFO within a tier; eligibility-skip
  (image blocked on sub-cap doesn't stall ready text, and vice-versa); release
  wakes the correct next waiter; disconnect removes a waiter; heartbeat keeps a
  lease past base TTL; reaper frees an expired lease.
- Circuit breaker: text admission pauses when `vllmWaiting > threshold` and
  resumes when it drops; breaker fails open on stale metrics; image admission
  ignores the breaker.
- Lua scripts vs a real/embedded Redis: K simulated nodes acquiring concurrently
  never exceed 10 combined / 4 image; eligibility + priority respected.
- `pnpm checks` stays green.

## Implementation notes

- Reuse the `redis` v4 client; load Lua via `SCRIPT LOAD` + `EVALSHA`, `EVAL`
  fallback on `NOSCRIPT`.
- `gate:free` pub/sub needs its own subscriber connection (a subscribed client
  can't issue other commands) — add one alongside the bus `sub`.
- Throttle position events (emit only when N changes) to avoid socket spam.
- Parse Prometheus text minimally (regex the two metric lines); no extra dep.
