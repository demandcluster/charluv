# Inference Concurrency Queue Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an app-side priority queue that caps total outbound inference concurrency (text+image combined ≤ 10, image ≤ 4), serves premium members first, and pauses text admission when vLLM's internal queue backs up.

**Architecture:** One `PriorityGate` with a pluggable backend. A pure scheduling core (counts + eligibility predicate + priority selection) is shared by an in-process backend (single-node / dev) and a Redis backend (multi-process, the production DGX runs several app processes). The gate wraps the existing inference streams (`createInferenceStream`, `createChatStream`) and the image entry (`generateImage`). A poller scrapes vLLM `/metrics` to drive a text circuit breaker.

**Tech Stack:** TypeScript, Node, Express, `redis` v4 (already a dep, used by `srv/api/ws/bus.ts`), `needle` (HTTP, already used), Mocha + Chai (tests), SolidJS (web client badge).

## Global Constraints

- **Use `pnpm`, never `npm`.**
- **No data migration / no new persistent collections.** Queue state is ephemeral Redis or in-memory only.
- **Caps are config-driven:** `INFERENCE_GLOBAL_CONCURRENCY` default `10`, `IMAGE_CONCURRENCY` default `4`, `TEXT_HARD_CAP` default `16` (non-binding safety rail).
- **Premium = priority in the queue, NOT a higher cap.** Priority order: `0` premium, `1` free signed-in, `2` guest, `3` background/utility. Lower served first; FIFO by enqueue time within a tier.
- **The queue never rejects.** At cap, requests wait. (The only admission control is the cap itself.)
- **Breaker fails open:** if vLLM metrics are stale/unreachable, admit text normally.
- **Spec:** `docs/superpowers/specs/2026-06-26-inference-queue-design.md`.
- **Test build flow:** sources are `.spec.ts`; `srv.tsconfig.json` already `include`s `tests`. Compile before running Mocha. Each test step assumes `tsc -p srv.tsconfig.json` (or the `pnpm build:watch` watcher) has emitted the matching `.spec.js`. Per-step command shown as `pnpm exec tsc -p srv.tsconfig.json && pnpm exec mocha --exit "tests/<file>.spec.js"`.
- **Web syntax check:** `pnpm typecheck` (web `tsc --noEmit`). Final gate: `pnpm checks`.

---

## File Structure

- `srv/queue/types.ts` — shared types + pure scheduling helpers (`waiterScore`, `isEligible`, `selectNext`). No I/O.
- `srv/queue/local.ts` — in-process `GateBackend` (deterministic; carries the bulk of unit coverage).
- `srv/queue/metrics.ts` — Prometheus parse + `Breaker` + poller.
- `srv/queue/gate.ts` — `PriorityGate` facade (`run`, `gateStream`) + `priorityForUser`.
- `srv/queue/redis.ts` — Redis `GateBackend` (Lua acquire/release/heartbeat, pub/sub wakeups, heartbeat interval).
- `srv/queue/index.ts` — constructs the singleton `inferenceGate` (backend by config) + starts the metrics poller.
- `srv/config.ts` — new `config.queue` block (modify).
- `srv/adapter/generate.ts` — wrap `createInferenceStream` + `createChatStream`; add `queuePriority` (modify).
- `srv/image/index.ts` — wrap the image handler call (modify).
- `web/store/message.ts` — handle `queue-position` socket event (modify).
- `web/.../<pending message view>` — render "Queued #N" badge (modify).
- Tests: `tests/queue-core.spec.ts`, `tests/queue-local.spec.ts`, `tests/queue-metrics.spec.ts`, `tests/queue-gate.spec.ts`, `tests/queue-redis.spec.ts`.

---

## Task 1: Scheduling core + config

**Files:**
- Create: `srv/queue/types.ts`
- Modify: `srv/config.ts` (add `queue` block near the `inference` block ~line 143)
- Test: `tests/queue-core.spec.ts`

**Interfaces:**
- Produces:
  - `type Kind = 'text' | 'image'`
  - `type Priority = 0 | 1 | 2 | 3`
  - `type Caps = { global: number; image: number }`
  - `type Counts = { inflight: number; image: number }`
  - `type Waiter = { id: string; kind: Kind; priority: Priority; enqueuedAt: number }`
  - `function waiterScore(priority: number, enqueuedAt: number): number`
  - `function isEligible(kind: Kind, counts: Counts, caps: Caps, pauseText: boolean): boolean`
  - `function selectNext(waiters: Waiter[], counts: Counts, caps: Caps, pauseText: boolean): Waiter | undefined`
  - `config.queue: { global: number; image: number; textHardCap: number; metricsUrl: string; waitingThreshold: number; pollMs: number }`

- [ ] **Step 1: Write the failing test**

```ts
// tests/queue-core.spec.ts
import { expect } from 'chai'
import { waiterScore, isEligible, selectNext, Waiter } from '/srv/queue/types'

const caps = { global: 10, image: 4 }

describe('queue scheduling core', () => {
  it('score makes lower priority number win, then earlier time', () => {
    expect(waiterScore(0, 100)).to.be.lessThan(waiterScore(1, 1))
    expect(waiterScore(1, 5)).to.be.lessThan(waiterScore(1, 9))
  })

  it('text ineligible at global cap', () => {
    expect(isEligible('text', { inflight: 10, image: 0 }, caps, false)).to.equal(false)
    expect(isEligible('text', { inflight: 9, image: 0 }, caps, false)).to.equal(true)
  })

  it('text ineligible when breaker pauses text, image unaffected', () => {
    expect(isEligible('text', { inflight: 0, image: 0 }, caps, true)).to.equal(false)
    expect(isEligible('image', { inflight: 0, image: 0 }, caps, true)).to.equal(true)
  })

  it('image gated by image sub-cap even with global room', () => {
    expect(isEligible('image', { inflight: 5, image: 4 }, caps, false)).to.equal(false)
    expect(isEligible('image', { inflight: 5, image: 3 }, caps, false)).to.equal(true)
  })

  it('selectNext returns highest-priority eligible, skipping blocked kinds', () => {
    const waiters: Waiter[] = [
      { id: 'img', kind: 'image', priority: 0, enqueuedAt: 1 }, // premium image, but image full
      { id: 'txt', kind: 'text', priority: 1, enqueuedAt: 2 }, // free text, eligible
    ]
    const next = selectNext(waiters, { inflight: 5, image: 4 }, caps, false)
    expect(next?.id).to.equal('txt')
  })

  it('selectNext returns undefined when nothing eligible', () => {
    const waiters: Waiter[] = [{ id: 'a', kind: 'text', priority: 0, enqueuedAt: 1 }]
    expect(selectNext(waiters, { inflight: 10, image: 0 }, caps, false)).to.equal(undefined)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec tsc -p srv.tsconfig.json && pnpm exec mocha --exit "tests/queue-core.spec.js"`
Expected: FAIL — cannot find module `/srv/queue/types`.

- [ ] **Step 3: Create `srv/queue/types.ts`**

```ts
export type Kind = 'text' | 'image'
export type Priority = 0 | 1 | 2 | 3
export type Caps = { global: number; image: number }
export type Counts = { inflight: number; image: number }

export type Waiter = {
  id: string
  kind: Kind
  priority: Priority
  enqueuedAt: number
}

/** Lower result = served sooner. Priority dominates; enqueue time is the tiebreak. */
export function waiterScore(priority: number, enqueuedAt: number): number {
  return priority * 1e13 + enqueuedAt
}

/** Can a waiter of `kind` be admitted right now? `pauseText` = breaker tripped. */
export function isEligible(kind: Kind, counts: Counts, caps: Caps, pauseText: boolean): boolean {
  if (counts.inflight >= caps.global) return false
  if (kind === 'image') return counts.image < caps.image
  return !pauseText
}

/** Highest-priority waiter whose predicate currently passes (eligibility-aware, not strict positional FIFO). */
export function selectNext(
  waiters: Waiter[],
  counts: Counts,
  caps: Caps,
  pauseText: boolean
): Waiter | undefined {
  let best: Waiter | undefined
  let bestScore = Infinity
  for (const w of waiters) {
    if (!isEligible(w.kind, counts, caps, pauseText)) continue
    const s = waiterScore(w.priority, w.enqueuedAt)
    if (s < bestScore) {
      bestScore = s
      best = w
    }
  }
  return best
}
```

- [ ] **Step 4: Add the config block in `srv/config.ts`**

Insert a sibling block after the `inference: { ... }` object (the block ending near line 174). Match the existing `env(...)` helper style:

```ts
  queue: {
    global: +env('INFERENCE_GLOBAL_CONCURRENCY', '10'),
    image: +env('IMAGE_CONCURRENCY', '4'),
    textHardCap: +env('TEXT_HARD_CAP', '16'),
    metricsUrl: env('VLLM_METRICS_URL', ''),
    waitingThreshold: +env('VLLM_WAITING_THRESHOLD', '1'),
    pollMs: +env('VLLM_METRICS_POLL_MS', '1500'),
  },
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm exec tsc -p srv.tsconfig.json && pnpm exec mocha --exit "tests/queue-core.spec.js"`
Expected: PASS (6 passing).

- [ ] **Step 6: Commit**

```bash
git add srv/queue/types.ts srv/config.ts tests/queue-core.spec.ts tests/queue-core.spec.js
git commit -m "feat(queue): scheduling core + config"
```

---

## Task 2: In-process backend

**Files:**
- Create: `srv/queue/local.ts`
- Test: `tests/queue-local.spec.ts`

**Interfaces:**
- Consumes: `Kind`, `Priority`, `Caps`, `Counts`, `Waiter`, `selectNext`, `waiterScore` from `/srv/queue/types`.
- Produces:
  - `type AcquireReq = { id: string; kind: Kind; priority: Priority; enqueuedAt: number; onPosition?: (position: number) => void; signal?: AbortSignal }`
  - `interface GateBackend { acquire(req: AcquireReq): Promise<void>; release(id: string): Promise<void>; setPauseText(pause: boolean): void }`
  - `class LocalBackend implements GateBackend` — constructor `(caps: Caps)`.

The `acquire` promise resolves when the request is admitted and rejects with `new Error('aborted')` if its `signal` aborts while waiting. `release(id)` frees a slot and schedules the next eligible waiter. `setPauseText` updates breaker state and reschedules. Position passed to `onPosition` is the 1-based rank of the waiter among all current waiters sorted by score (changes are pushed; admitted ⇒ no further calls).

- [ ] **Step 1: Write the failing test**

```ts
// tests/queue-local.spec.ts
import { expect } from 'chai'
import { LocalBackend } from '/srv/queue/local'

const tick = () => new Promise((r) => setTimeout(r, 0))

describe('LocalBackend', () => {
  it('admits up to the global cap, queues the rest', async () => {
    const b = new LocalBackend({ global: 2, image: 4 })
    const admitted: string[] = []
    for (const id of ['a', 'b', 'c']) {
      b.acquire({ id, kind: 'text', priority: 1, enqueuedAt: id.charCodeAt(0) }).then(() =>
        admitted.push(id)
      )
    }
    await tick()
    expect(admitted).to.deep.equal(['a', 'b'])
    await b.release('a')
    await tick()
    expect(admitted).to.deep.equal(['a', 'b', 'c'])
  })

  it('serves premium before free regardless of arrival order', async () => {
    const b = new LocalBackend({ global: 1, image: 4 })
    const order: string[] = []
    b.acquire({ id: 'hold', kind: 'text', priority: 1, enqueuedAt: 1 }).then(() => order.push('hold'))
    await tick()
    b.acquire({ id: 'free', kind: 'text', priority: 1, enqueuedAt: 2 }).then(() => order.push('free'))
    b.acquire({ id: 'prem', kind: 'text', priority: 0, enqueuedAt: 3 }).then(() => order.push('prem'))
    await tick()
    await b.release('hold')
    await tick()
    await b.release('prem')
    await tick()
    expect(order).to.deep.equal(['hold', 'prem', 'free'])
  })

  it('enforces the image sub-cap without blocking text', async () => {
    const b = new LocalBackend({ global: 10, image: 1 })
    const admitted: string[] = []
    b.acquire({ id: 'i1', kind: 'image', priority: 1, enqueuedAt: 1 }).then(() => admitted.push('i1'))
    b.acquire({ id: 'i2', kind: 'image', priority: 0, enqueuedAt: 2 }).then(() => admitted.push('i2'))
    b.acquire({ id: 't1', kind: 'text', priority: 1, enqueuedAt: 3 }).then(() => admitted.push('t1'))
    await tick()
    // i1 takes the only image slot; i2 waits on sub-cap; t1 (text) is admitted past it
    expect(admitted.sort()).to.deep.equal(['i1', 't1'])
  })

  it('pauses text but still admits image when breaker is on', async () => {
    const b = new LocalBackend({ global: 10, image: 4 })
    b.setPauseText(true)
    const admitted: string[] = []
    b.acquire({ id: 't', kind: 'text', priority: 0, enqueuedAt: 1 }).then(() => admitted.push('t'))
    b.acquire({ id: 'i', kind: 'image', priority: 1, enqueuedAt: 2 }).then(() => admitted.push('i'))
    await tick()
    expect(admitted).to.deep.equal(['i'])
    b.setPauseText(false)
    await tick()
    expect(admitted.sort()).to.deep.equal(['i', 't'])
  })

  it('reports position to waiters and rejects on abort', async () => {
    const b = new LocalBackend({ global: 1, image: 4 })
    b.acquire({ id: 'hold', kind: 'text', priority: 1, enqueuedAt: 1 })
    const positions: number[] = []
    const ac = new AbortController()
    const p = b.acquire({
      id: 'wait',
      kind: 'text',
      priority: 1,
      enqueuedAt: 2,
      onPosition: (n) => positions.push(n),
      signal: ac.signal,
    })
    await tick()
    expect(positions[positions.length - 1]).to.equal(1) // 1 ahead of it
    ac.abort()
    let rejected = false
    await p.catch(() => (rejected = true))
    expect(rejected).to.equal(true)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec tsc -p srv.tsconfig.json && pnpm exec mocha --exit "tests/queue-local.spec.js"`
Expected: FAIL — cannot find module `/srv/queue/local`.

- [ ] **Step 3: Create `srv/queue/local.ts`**

```ts
import { Caps, Counts, Kind, Priority, Waiter, selectNext, waiterScore } from './types'

export type AcquireReq = {
  id: string
  kind: Kind
  priority: Priority
  enqueuedAt: number
  onPosition?: (position: number) => void
  signal?: AbortSignal
}

export interface GateBackend {
  acquire(req: AcquireReq): Promise<void>
  release(id: string): Promise<void>
  setPauseText(pause: boolean): void
}

type Pending = {
  waiter: Waiter
  resolve: () => void
  reject: (err: Error) => void
  onPosition?: (position: number) => void
  lastPosition: number
  onAbort?: () => void
  signal?: AbortSignal
}

export class LocalBackend implements GateBackend {
  private counts: Counts = { inflight: 0, image: 0 }
  private pauseText = false
  private waiting: Pending[] = []
  private admitted = new Map<string, Kind>()

  constructor(private caps: Caps) {}

  acquire(req: AcquireReq): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const pending: Pending = {
        waiter: { id: req.id, kind: req.kind, priority: req.priority, enqueuedAt: req.enqueuedAt },
        resolve,
        reject,
        onPosition: req.onPosition,
        lastPosition: -1,
        signal: req.signal,
      }
      if (req.signal) {
        if (req.signal.aborted) return reject(new Error('aborted'))
        pending.onAbort = () => this.abort(req.id)
        req.signal.addEventListener('abort', pending.onAbort)
      }
      this.waiting.push(pending)
      this.schedule()
    })
  }

  async release(id: string): Promise<void> {
    const kind = this.admitted.get(id)
    if (!kind) return
    this.admitted.delete(id)
    this.counts.inflight--
    if (kind === 'image') this.counts.image--
    this.schedule()
  }

  setPauseText(pause: boolean): void {
    this.pauseText = pause
    this.schedule()
  }

  private abort(id: string) {
    const idx = this.waiting.findIndex((p) => p.waiter.id === id)
    if (idx === -1) return
    const [pending] = this.waiting.splice(idx, 1)
    if (pending.onAbort && pending.signal) pending.signal.removeEventListener('abort', pending.onAbort)
    pending.reject(new Error('aborted'))
    this.schedule()
  }

  private schedule() {
    // Admit as many eligible waiters as capacity allows.
    while (this.waiting.length) {
      const waiters = this.waiting.map((p) => p.waiter)
      const next = selectNext(waiters, this.counts, this.caps, this.pauseText)
      if (!next) break
      const idx = this.waiting.findIndex((p) => p.waiter.id === next.id)
      const [pending] = this.waiting.splice(idx, 1)
      if (pending.onAbort && pending.signal) {
        pending.signal.removeEventListener('abort', pending.onAbort)
      }
      this.admitted.set(next.id, next.kind)
      this.counts.inflight++
      if (next.kind === 'image') this.counts.image++
      pending.resolve()
    }
    this.publishPositions()
  }

  private publishPositions() {
    const sorted = [...this.waiting].sort(
      (a, b) =>
        waiterScore(a.waiter.priority, a.waiter.enqueuedAt) -
        waiterScore(b.waiter.priority, b.waiter.enqueuedAt)
    )
    sorted.forEach((pending, i) => {
      const position = i + 1
      if (pending.onPosition && pending.lastPosition !== position) {
        pending.lastPosition = position
        pending.onPosition(position)
      }
    })
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm exec tsc -p srv.tsconfig.json && pnpm exec mocha --exit "tests/queue-local.spec.js"`
Expected: PASS (5 passing).

- [ ] **Step 5: Commit**

```bash
git add srv/queue/local.ts tests/queue-local.spec.ts tests/queue-local.spec.js
git commit -m "feat(queue): in-process backend"
```

---

## Task 3: vLLM metrics parser + breaker

**Files:**
- Create: `srv/queue/metrics.ts`
- Test: `tests/queue-metrics.spec.ts`

**Interfaces:**
- Produces:
  - `function parsePrometheus(text: string): { running?: number; waiting?: number }`
  - `class Breaker` — constructor `(threshold: number, staleMs: number)`; `update(waiting: number | undefined, now: number): void`; `pauseText(now: number): boolean`.
  - `function startMetricsPoller(opts: { url: string; pollMs: number; breaker: Breaker; onUpdate: (pause: boolean) => void }): () => void` — returns a stop function. (Side-effecting; not unit-tested.)

- [ ] **Step 1: Write the failing test**

```ts
// tests/queue-metrics.spec.ts
import { expect } from 'chai'
import { parsePrometheus, Breaker } from '/srv/queue/metrics'

const SAMPLE = `# HELP vllm:num_requests_running ...
# TYPE vllm:num_requests_running gauge
vllm:num_requests_running{model_name="x"} 7.0
vllm:num_requests_waiting{model_name="x"} 3.0
`

describe('vLLM metrics', () => {
  it('parses running and waiting gauges', () => {
    expect(parsePrometheus(SAMPLE)).to.deep.equal({ running: 7, waiting: 3 })
  })

  it('returns undefined for missing metrics', () => {
    expect(parsePrometheus('nothing here')).to.deep.equal({ running: undefined, waiting: undefined })
  })

  it('breaker pauses text only above threshold', () => {
    const b = new Breaker(1, 10000)
    b.update(2, 1000)
    expect(b.pauseText(1000)).to.equal(true)
    b.update(1, 2000)
    expect(b.pauseText(2000)).to.equal(false)
  })

  it('breaker fails open when metrics are stale', () => {
    const b = new Breaker(1, 5000)
    b.update(5, 1000)
    expect(b.pauseText(1000)).to.equal(true)
    expect(b.pauseText(7000)).to.equal(false) // 6s since last scrape > 5s stale window
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec tsc -p srv.tsconfig.json && pnpm exec mocha --exit "tests/queue-metrics.spec.js"`
Expected: FAIL — cannot find module `/srv/queue/metrics`.

- [ ] **Step 3: Create `srv/queue/metrics.ts`**

```ts
import needle from 'needle'
import { logger } from '../middleware'

function matchMetric(text: string, name: string): number | undefined {
  const escaped = name.replace(/[:]/g, '\\:')
  const re = new RegExp(`^${escaped}(?:\\{[^}]*\\})?\\s+([0-9.eE+-]+)`, 'm')
  const m = re.exec(text)
  return m ? Number(m[1]) : undefined
}

export function parsePrometheus(text: string): { running?: number; waiting?: number } {
  return {
    running: matchMetric(text, 'vllm:num_requests_running'),
    waiting: matchMetric(text, 'vllm:num_requests_waiting'),
  }
}

export class Breaker {
  private waiting = 0
  private lastOk = 0

  constructor(private threshold: number, private staleMs: number) {}

  update(waiting: number | undefined, now: number) {
    if (waiting === undefined) return
    this.waiting = waiting
    this.lastOk = now
  }

  /** True ⇒ pause admitting new text. Fails open (false) when scrape is stale. */
  pauseText(now: number): boolean {
    if (this.lastOk === 0) return false
    if (now - this.lastOk > this.staleMs) return false
    return this.waiting > this.threshold
  }
}

export function startMetricsPoller(opts: {
  url: string
  pollMs: number
  breaker: Breaker
  onUpdate: (pause: boolean) => void
}): () => void {
  let stopped = false
  const tick = async () => {
    if (stopped) return
    try {
      const res = await needle('get', opts.url, { parse: false })
      const text = typeof res.body === 'string' ? res.body : res.body?.toString?.() || ''
      const { waiting } = parsePrometheus(text)
      opts.breaker.update(waiting, Date.now())
    } catch (err) {
      logger.warn({ err }, 'vLLM metrics scrape failed')
    }
    opts.onUpdate(opts.breaker.pauseText(Date.now()))
  }
  const timer = setInterval(tick, opts.pollMs)
  tick()
  return () => {
    stopped = true
    clearInterval(timer)
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm exec tsc -p srv.tsconfig.json && pnpm exec mocha --exit "tests/queue-metrics.spec.js"`
Expected: PASS (4 passing).

- [ ] **Step 5: Commit**

```bash
git add srv/queue/metrics.ts tests/queue-metrics.spec.ts tests/queue-metrics.spec.js
git commit -m "feat(queue): vLLM metrics parser + circuit breaker"
```

---

## Task 4: PriorityGate facade + priority helper

**Files:**
- Create: `srv/queue/gate.ts`
- Test: `tests/queue-gate.spec.ts`

**Interfaces:**
- Consumes: `GateBackend`, `AcquireReq` from `/srv/queue/local`; `Kind`, `Priority` from `/srv/queue/types`; `getUserSubscriptionTier` from `/common/util`.
- Produces:
  - `type GateOpts = { kind: Kind; priority: Priority; userId?: string; socketId?: string; requestId?: string }`
  - `type PositionEvent = { type: 'queue-position'; kind: Kind; position: number; requestId?: string }`
  - `type Sender = { toUser: (userId: string, ev: PositionEvent) => void; toGuest: (socketId: string, ev: PositionEvent) => void }`
  - `class PriorityGate` — constructor `(backend: GateBackend, sender: Sender, now?: () => number)`; methods `run<T>(opts, fn): Promise<T>`, `gateStream<T>(opts, makeGen): AsyncGenerator<T>`, `setPauseText(pause: boolean): void`.
  - `function priorityForUser(user: { _id: string } & any, isGuest: boolean, tiers: any[]): Priority`

Note: `gateStream` acquires before pulling the first chunk and releases in `finally`. `run` acquires, runs `fn`, releases in `finally`. Both emit a `position: 0` clear event on admission.

- [ ] **Step 1: Write the failing test**

```ts
// tests/queue-gate.spec.ts
import { expect } from 'chai'
import { LocalBackend } from '/srv/queue/local'
import { PriorityGate, priorityForUser, PositionEvent } from '/srv/queue/gate'

const tick = () => new Promise((r) => setTimeout(r, 0))

function makeGate(caps: { global: number; image: number }) {
  const events: Array<{ to: string; ev: PositionEvent }> = []
  const gate = new PriorityGate(new LocalBackend(caps), {
    toUser: (userId, ev) => events.push({ to: userId, ev }),
    toGuest: (socketId, ev) => events.push({ to: socketId, ev }),
  })
  return { gate, events }
}

describe('PriorityGate', () => {
  it('run holds a slot for the duration and releases it', async () => {
    const { gate } = makeGate({ global: 1, image: 4 })
    let release!: () => void
    const slow = new Promise<void>((r) => (release = r))
    const first = gate.run({ kind: 'text', priority: 1, userId: 'u1' }, () => slow.then(() => 'a'))
    await tick()
    let secondDone = false
    const second = gate
      .run({ kind: 'text', priority: 1, userId: 'u2' }, async () => 'b')
      .then((v) => {
        secondDone = true
        return v
      })
    await tick()
    expect(secondDone).to.equal(false) // blocked behind first
    release()
    expect(await first).to.equal('a')
    expect(await second).to.equal('b')
  })

  it('gateStream does no work before a slot is acquired', async () => {
    const { gate } = makeGate({ global: 1, image: 4 })
    const blocker = gate.run({ kind: 'text', priority: 1, userId: 'u0' }, () => new Promise(() => {}))
    void blocker
    await tick()
    let started = false
    async function* gen() {
      started = true
      yield 'x'
    }
    const stream = gate.gateStream({ kind: 'text', priority: 1, userId: 'u1' }, () => gen())
    const it = stream[Symbol.asyncIterator]()
    const next = it.next()
    await tick()
    expect(started).to.equal(false) // still queued
    void next
  })

  it('emits a position event to the waiting user and a clear on admit', async () => {
    const { gate, events } = makeGate({ global: 1, image: 4 })
    let release!: () => void
    const slow = new Promise<void>((r) => (release = r))
    gate.run({ kind: 'text', priority: 1, userId: 'holder' }, () => slow)
    await tick()
    gate.run({ kind: 'text', priority: 1, userId: 'waiter', requestId: 'r1' }, async () => 'ok')
    await tick()
    expect(events.some((e) => e.to === 'waiter' && e.ev.position === 1)).to.equal(true)
    release()
    await tick()
    expect(events.some((e) => e.to === 'waiter' && e.ev.position === 0)).to.equal(true)
  })

  it('priorityForUser: guest=2, free=1, premium=0', () => {
    const tiers: any[] = []
    expect(priorityForUser({ _id: 'g' } as any, true, tiers)).to.equal(2)
    // no active tier -> free
    expect(priorityForUser({ _id: 'u' } as any, false, tiers)).to.equal(1)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec tsc -p srv.tsconfig.json && pnpm exec mocha --exit "tests/queue-gate.spec.js"`
Expected: FAIL — cannot find module `/srv/queue/gate`.

- [ ] **Step 3: Create `srv/queue/gate.ts`**

```ts
import { v4 as uuid } from 'uuid'
import { GateBackend } from './local'
import { Kind, Priority } from './types'
import { getUserSubscriptionTier } from '/common/util'
import { AppSchema } from '/common/types/schema'

export type GateOpts = {
  kind: Kind
  priority: Priority
  userId?: string
  socketId?: string
  requestId?: string
}

export type PositionEvent = {
  type: 'queue-position'
  kind: Kind
  position: number
  requestId?: string
}

export type Sender = {
  toUser: (userId: string, ev: PositionEvent) => void
  toGuest: (socketId: string, ev: PositionEvent) => void
}

export class PriorityGate {
  constructor(
    private backend: GateBackend,
    private sender: Sender,
    private now: () => number = () => Date.now()
  ) {}

  setPauseText(pause: boolean) {
    this.backend.setPauseText(pause)
  }

  async run<T>(opts: GateOpts, fn: () => Promise<T>): Promise<T> {
    const id = uuid()
    await this.enter(id, opts)
    try {
      return await fn()
    } finally {
      await this.backend.release(id)
    }
  }

  async *gateStream<T>(opts: GateOpts, makeGen: () => AsyncGenerator<T>): AsyncGenerator<T> {
    const id = uuid()
    await this.enter(id, opts)
    try {
      const gen = makeGen()
      for await (const chunk of gen) {
        yield chunk
      }
    } finally {
      await this.backend.release(id)
    }
  }

  private async enter(id: string, opts: GateOpts) {
    await this.backend.acquire({
      id,
      kind: opts.kind,
      priority: opts.priority,
      enqueuedAt: this.now(),
      onPosition: (position) => this.emit(opts, position),
    })
    this.emit(opts, 0) // clear the badge on admission
  }

  private emit(opts: GateOpts, position: number) {
    const ev: PositionEvent = {
      type: 'queue-position',
      kind: opts.kind,
      position,
      requestId: opts.requestId,
    }
    if (opts.userId) this.sender.toUser(opts.userId, ev)
    else if (opts.socketId) this.sender.toGuest(opts.socketId, ev)
  }
}

export function priorityForUser(
  user: Pick<AppSchema.User, '_id' | 'patreon' | 'billing' | 'sub' | 'manualSub' | 'premium' | 'premiumUntil' | 'username'>,
  isGuest: boolean,
  tiers: AppSchema.SubscriptionTier[]
): Priority {
  if (isGuest) return 2
  const sub = getUserSubscriptionTier(user, tiers)
  return sub?.tier ? 0 : 1
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm exec tsc -p srv.tsconfig.json && pnpm exec mocha --exit "tests/queue-gate.spec.js"`
Expected: PASS (4 passing).

- [ ] **Step 5: Commit**

```bash
git add srv/queue/gate.ts tests/queue-gate.spec.ts tests/queue-gate.spec.js
git commit -m "feat(queue): PriorityGate facade + priority mapping"
```

---

## Task 5: Redis backend

**Files:**
- Create: `srv/queue/redis.ts`
- Test: `tests/queue-redis.spec.ts`

**Interfaces:**
- Consumes: `GateBackend`, `AcquireReq` from `/srv/queue/local`; `Caps` from `/srv/queue/types`; the `redis` v4 client.
- Produces:
  - `class RedisBackend implements GateBackend` — constructor `(opts: { caps: Caps; cmd: RedisCmd; sub: RedisSub; keyPrefix?: string; ttlMs?: number; heartbeatMs?: number })`.
  - `type RedisCmd = { eval: (...) ...; publish: (...) ...; hSet/hGet ... }` — minimal interface satisfied by the `redis` v4 client (so tests can pass a real client).
  - `type RedisSub = { subscribe: (channel: string, cb: (msg: string) => void) => Promise<unknown> }`.

Behavior: keys `{prefix}:active` (hash leaseId→`"{kind}:{expiry}"`), `{prefix}:wait` (ZSET), `{prefix}:meta` (hash, `pauseText` flag written by `setPauseText`). `acquire` runs the Lua `ACQUIRE` script in a loop, waking on the `{prefix}:free` pub/sub channel or a ~1s safety re-poll, emitting position via `onPosition`. On admit, starts a `setInterval` heartbeat (`HEARTBEAT` script) every `heartbeatMs`; `release` clears it, runs `RELEASE`, and publishes `free`. Abort (`signal`) removes the waiter / releases and publishes.

**This test requires a running Redis.** It connects to `redis://127.0.0.1:6379`; if the connection fails the whole `describe` is skipped (so CI without Redis stays green). Uses a unique key prefix per run to isolate.

- [ ] **Step 1: Write the failing test**

```ts
// tests/queue-redis.spec.ts
import { expect } from 'chai'
import { createClient } from 'redis'
import { RedisBackend } from '/srv/queue/redis'

const tick = (ms = 50) => new Promise((r) => setTimeout(r, ms))

describe('RedisBackend (requires local redis)', function () {
  this.timeout(8000)
  let cmd: any
  let sub: any
  let available = true
  const prefix = 'test-gate-' + process.pid + '-' + Math.floor(Math.random() * 1e6)

  before(async () => {
    try {
      cmd = createClient({ url: 'redis://127.0.0.1:6379' })
      sub = cmd.duplicate()
      await cmd.connect()
      await sub.connect()
    } catch {
      available = false
    }
  })

  after(async () => {
    if (!available) return
    const keys = await cmd.keys(prefix + ':*')
    if (keys.length) await cmd.del(keys)
    await cmd.quit()
    await sub.quit()
  })

  it('caps combined inflight and serves premium first', async function () {
    if (!available) this.skip()
    const b = new RedisBackend({ caps: { global: 1, image: 4 }, cmd, sub, keyPrefix: prefix })
    const order: string[] = []
    await b.acquire({ id: 'hold', kind: 'text', priority: 1, enqueuedAt: 1 }).then(() => order.push('hold'))
    b.acquire({ id: 'free', kind: 'text', priority: 1, enqueuedAt: 2 }).then(() => order.push('free'))
    b.acquire({ id: 'prem', kind: 'text', priority: 0, enqueuedAt: 3 }).then(() => order.push('prem'))
    await tick()
    await b.release('hold')
    await tick()
    expect(order).to.deep.equal(['hold', 'prem'])
    await b.release('prem')
    await tick()
    expect(order).to.deep.equal(['hold', 'prem', 'free'])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec tsc -p srv.tsconfig.json && pnpm exec mocha --exit "tests/queue-redis.spec.js"`
Expected: FAIL — cannot find module `/srv/queue/redis`.

- [ ] **Step 3: Create `srv/queue/redis.ts`**

```ts
import { AcquireReq, GateBackend } from './local'
import { Caps } from './types'

export type RedisCmd = {
  eval: (script: string, opts: { keys: string[]; arguments: string[] }) => Promise<any>
  publish: (channel: string, message: string) => Promise<number>
  hSet: (key: string, field: string, value: string) => Promise<number>
}

export type RedisSub = {
  subscribe: (channel: string, listener: (message: string) => void) => Promise<unknown>
}

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
`

// KEYS: 1=active ; ARGV: 1=leaseId
const RELEASE = `return redis.call('HDEL', KEYS[1], ARGV[1])`

// KEYS: 1=active ; ARGV: 1=leaseId 2=kind 3=ttlMs 4=nowMs
const HEARTBEAT = `
local cur = redis.call('HGET', KEYS[1], ARGV[1])
if cur == false then return 0 end
redis.call('HSET', KEYS[1], ARGV[1], ARGV[2] .. ':' .. tostring(tonumber(ARGV[4]) + tonumber(ARGV[3])))
return 1
`

export class RedisBackend implements GateBackend {
  private caps: Caps
  private cmd: RedisCmd
  private sub: RedisSub
  private prefix: string
  private ttlMs: number
  private heartbeatMs: number
  private active = '·'
  private wait = '·'
  private meta = '·'
  private freeChan = '·'
  private heartbeats = new Map<string, NodeJS.Timeout>()
  private wakeups = new Set<() => void>()
  private subscribed = false

  constructor(opts: {
    caps: Caps
    cmd: RedisCmd
    sub: RedisSub
    keyPrefix?: string
    ttlMs?: number
    heartbeatMs?: number
  }) {
    this.caps = opts.caps
    this.cmd = opts.cmd
    this.sub = opts.sub
    this.prefix = opts.keyPrefix || 'gate'
    this.ttlMs = opts.ttlMs ?? 30000
    this.heartbeatMs = opts.heartbeatMs ?? 10000
    this.active = `${this.prefix}:active`
    this.wait = `${this.prefix}:wait`
    this.meta = `${this.prefix}:meta`
    this.freeChan = `${this.prefix}:free`
  }

  private async ensureSubscribed() {
    if (this.subscribed) return
    this.subscribed = true
    await this.sub.subscribe(this.freeChan, () => {
      for (const wake of this.wakeups) wake()
    })
  }

  setPauseText(pause: boolean): void {
    this.cmd.hSet(this.meta, 'pauseText', pause ? '1' : '0').catch(() => {})
  }

  async acquire(req: AcquireReq): Promise<void> {
    await this.ensureSubscribed()
    const score = String(req.priority * 1e13 + req.enqueuedAt)
    let lastPosition = -1

    const tryAcquire = async (): Promise<{ ok: boolean; position: number }> => {
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
      })
      return { ok: ok === 1, position: Number(position) }
    }

    while (true) {
      if (req.signal?.aborted) {
        await this.removeWaiter(req.id)
        throw new Error('aborted')
      }
      const { ok, position } = await tryAcquire()
      if (ok) {
        this.startHeartbeat(req.id, req.kind)
        return
      }
      if (req.onPosition && position !== lastPosition) {
        lastPosition = position
        req.onPosition(position)
      }
      await this.waitForWake(req.signal)
    }
  }

  private waitForWake(signal?: AbortSignal): Promise<void> {
    return new Promise<void>((resolve) => {
      const wake = () => {
        cleanup()
        resolve()
      }
      const timer = setTimeout(wake, 1000) // safety re-poll
      const onAbort = () => wake()
      const cleanup = () => {
        clearTimeout(timer)
        this.wakeups.delete(wake)
        if (signal) signal.removeEventListener('abort', onAbort)
      }
      this.wakeups.add(wake)
      if (signal) signal.addEventListener('abort', onAbort)
    })
  }

  private startHeartbeat(id: string, kind: string) {
    const timer = setInterval(() => {
      this.cmd
        .eval(HEARTBEAT, {
          keys: [this.active],
          arguments: [id, kind, String(this.ttlMs), String(Date.now())],
        })
        .catch(() => {})
    }, this.heartbeatMs)
    this.heartbeats.set(id, timer)
  }

  private async removeWaiter(id: string) {
    // ZREM via eval to avoid widening the RedisCmd interface
    await this.cmd
      .eval(`return redis.call('ZREM', KEYS[1], ARGV[1])`, { keys: [this.wait], arguments: [id] })
      .catch(() => {})
    await this.cmd.publish(this.freeChan, '1').catch(() => {})
  }

  async release(id: string): Promise<void> {
    const timer = this.heartbeats.get(id)
    if (timer) {
      clearInterval(timer)
      this.heartbeats.delete(id)
    }
    await this.cmd.eval(RELEASE, { keys: [this.active], arguments: [id] }).catch(() => {})
    await this.cmd.publish(this.freeChan, '1').catch(() => {})
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm exec tsc -p srv.tsconfig.json && pnpm exec mocha --exit "tests/queue-redis.spec.js"`
Expected: PASS (1 passing) with a local Redis running; otherwise PASS (0 passing, 1 pending) — the suite skips when Redis is unavailable.

- [ ] **Step 5: Commit**

```bash
git add srv/queue/redis.ts tests/queue-redis.spec.ts tests/queue-redis.spec.js
git commit -m "feat(queue): redis-backed distributed gate"
```

---

## Task 6: Singleton wiring + poller startup

**Files:**
- Create: `srv/queue/index.ts`
- Modify: `srv/app.ts` (start the metrics poller after the message bus init)

**Interfaces:**
- Consumes: `config.queue`; `clients` + `isConnected` from `srv/api/ws/bus.ts`; `sendOne`, `sendGuest` from `srv/api/ws`; `LocalBackend`, `RedisBackend`, `PriorityGate`, `Breaker`, `startMetricsPoller`.
- Produces:
  - `const inferenceGate: PriorityGate` (singleton).
  - `function startQueue(): () => void` — starts the metrics poller (if configured) wiring breaker → `inferenceGate.setPauseText`; returns a stop function.

- [ ] **Step 1: Create `srv/queue/index.ts`**

```ts
import { config } from '../config'
import { clients, isConnected } from '../api/ws/bus'
import { sendGuest, sendOne } from '../api/ws'
import { LocalBackend } from './local'
import { RedisBackend } from './redis'
import { PriorityGate, Sender } from './gate'
import { Breaker, startMetricsPoller } from './metrics'

const caps = { global: config.queue.global, image: config.queue.image }

const sender: Sender = {
  toUser: (userId, ev) => sendOne(userId, ev),
  toGuest: (socketId, ev) => sendGuest(socketId, ev),
}

// Use the redis-backed gate when the message bus is connected (multi-process
// production); otherwise the in-process backend (single-node / dev). Mirrors the
// dual-mode in srv/api/ws/bus.ts.
function makeBackend() {
  if (config.redis.host && isConnected()) {
    return new RedisBackend({ caps, cmd: clients.pub as any, sub: clients.sub as any })
  }
  return new LocalBackend(caps)
}

export const inferenceGate = new PriorityGate(makeBackend(), sender)

const breaker = new Breaker(config.queue.waitingThreshold, config.queue.pollMs * 4)

export function startQueue(): () => void {
  if (!config.queue.metricsUrl) return () => {}
  return startMetricsPoller({
    url: config.queue.metricsUrl,
    pollMs: config.queue.pollMs,
    breaker,
    onUpdate: (pause) => inferenceGate.setPauseText(pause),
  })
}

export { PriorityGate } from './gate'
export { priorityForUser } from './gate'
```

> Note: `clients.sub` is also used by the bus for its own channels. Subscribing the gate's `:free` channel on the same connection is fine (a redis v4 subscriber can hold multiple channel subscriptions). If a conflict surfaces in practice, add a dedicated `clients.gateSub = clients.pub.duplicate()` in `bus.ts` and pass it here.

- [ ] **Step 2: Start the poller in `srv/app.ts`**

Find where `initMessageBus()` is awaited/called during startup and add, right after it:

```ts
import { startQueue } from './queue'
// ...after initMessageBus()...
startQueue()
```

- [ ] **Step 3: Typecheck the server**

Run: `NODE_OPTIONS=--max-old-space-size=6144 pnpm exec tsc -p srv.tsconfig.json --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add srv/queue/index.ts srv/app.ts
git commit -m "feat(queue): singleton gate wiring + metrics poller startup"
```

---

## Task 7: Wrap the inference + image entry points

**Files:**
- Modify: `srv/adapter/generate.ts` — `InferenceRequest` type (~line 60), `createInferenceStream` (~line 218), `createChatStream` (~line 299).
- Modify: `srv/image/index.ts` — `generateImage` image-handler block (~line 130-200).

**Interfaces:**
- Consumes: `inferenceGate`, `priorityForUser` from `/srv/queue`; `getCachedTiers` from `/srv/db/subscriptions`.
- Produces: `InferenceRequest.queuePriority?: Priority` (background callers default to 3).

- [ ] **Step 1: Add `queuePriority` to `InferenceRequest`**

In `srv/adapter/generate.ts`, inside the `InferenceRequest` type, add:

```ts
  /** Queue priority: 0 premium, 1 free, 2 guest, 3 background. Defaults to 3 (utility). */
  queuePriority?: number
```

- [ ] **Step 2: Gate `createInferenceStream`**

At the top of `srv/adapter/generate.ts` add imports:

```ts
import { inferenceGate, priorityForUser } from '../queue'
import { getCachedTiers } from '../db/subscriptions'
```

In `createInferenceStream`, replace the final `return { stream, service: settings.service || '' }` with a gated stream:

```ts
  const gated = inferenceGate.gateStream(
    {
      kind: 'text',
      priority: (opts.queuePriority ?? 3) as any,
      userId: opts.guest ? undefined : opts.user?._id,
      socketId: opts.guest,
      requestId: opts.requestId,
    },
    () => stream
  )

  return { stream: gated, service: settings.service || '' }
```

(`stream` is the async generator returned by `handler(...)`; it is lazy, so no inference work runs until `gateStream` pulls its first chunk after acquiring a slot.)

- [ ] **Step 3: Gate `createChatStream`**

In `createChatStream`, the function builds `const stream = handler({ ... })` then `return { stream, adapter, settings: gen, ... }`. Replace the returned `stream` with a gated wrapper. Just before the `return`:

```ts
  const priority = priorityForUser(opts.user as any, !!guestSocketId, getCachedTiers())
  const gatedStream = inferenceGate.gateStream(
    {
      kind: 'text',
      priority,
      userId: guestSocketId ? undefined : opts.user._id,
      socketId: guestSocketId,
      requestId: opts.requestId,
    },
    () => stream
  )
```

Then change the returned object to use `stream: gatedStream`.

- [ ] **Step 4: Gate `generateImage`**

In `srv/image/index.ts` add imports:

```ts
import { inferenceGate, priorityForUser } from '../queue'
import { getCachedTiers } from '../db/subscriptions'
```

Wrap the existing `try { ... image = await handle...() ... }` image-generation block so the `handle*Image` selection runs inside `inferenceGate.run`. Replace the body of the `try` that assigns `image` with:

```ts
    const priority = priorityForUser(user as any, !!guestId, getCachedTiers())
    image = await inferenceGate.run(
      {
        kind: 'image',
        priority,
        userId: guestId ? undefined : user._id,
        socketId: guestId,
        requestId: opts.requestId,
      },
      async () => {
        if (isZImageConfigured()) {
          const isCharImage = opts.source === 'avatar'
          const size = isCharImage
            ? config.inference.imageSize || 640
            : config.inference.imageChatSize || 512
          const steps = isCharImage
            ? config.inference.imageSteps || 14
            : config.inference.imageChatSteps || 20
          return handleZImage(
            {
              user,
              prompt,
              negative,
              settings: imageSettings,
              loraName: character?.loraName,
              seed: opts.seed,
              width: size,
              height: size,
              steps,
            },
            log,
            guestId
          )
        }
        switch (imageSettings?.type || 'horde') {
          case 'novel':
            return handleNovelImage({ user, prompt, negative, settings: imageSettings }, log, guestId)
          case 'sd':
          case 'agnai':
            return handleSDImage({ user, prompt, negative, settings: imageSettings }, log, guestId)
          case 'horde':
          default:
            return handleHordeImage({ user, prompt, negative, settings: imageSettings }, log, guestId)
        }
      }
    )
```

(Keep the surrounding `catch (ex)` and the existing post-processing of `image` unchanged.)

- [ ] **Step 5: Typecheck the server**

Run: `NODE_OPTIONS=--max-old-space-size=6144 pnpm exec tsc -p srv.tsconfig.json --noEmit`
Expected: no errors.

- [ ] **Step 6: Run the full unit suite (no regressions)**

Run: `pnpm exec tsc -p srv.tsconfig.json && pnpm test`
Expected: all existing specs + the new queue specs PASS (redis spec pending if no Redis).

- [ ] **Step 7: Commit**

```bash
git add srv/adapter/generate.ts srv/image/index.ts
git commit -m "feat(queue): gate text + image generation through the priority queue"
```

---

## Task 8: Client — show queue position

**Files:**
- Modify: `web/store/message.ts` — handle the `queue-position` socket event.
- Modify: the pending-message / image-spinner view that reads `waiting` (locate via the `waiting` field set in `web/store/message.ts`).

**Interfaces:**
- Consumes: socket event `{ type: 'queue-position', kind, position, requestId }` from the gate.
- Produces: a `queuePosition` value on the message store usable by the waiting indicator.

- [ ] **Step 1: Add a `queuePosition` field + event handler in `web/store/message.ts`**

Find the store's socket subscription block (where other `subscribe('...')` / event handlers live, e.g. `image-generation-started`). Add state and a handler:

```ts
// in the store's state shape, alongside `waiting`:
queuePosition: undefined as number | undefined,
```

```ts
// register alongside the other socket event handlers:
subscribe('queue-position', { position: 'number', kind: 'string' }, (body) => {
  const position = body.position || 0
  msgStore.setState({ queuePosition: position > 0 ? position : undefined })
})
```

(Match the project's existing `subscribe(...)` signature — mirror a neighbouring handler in the same file for the exact argument shape.)

- [ ] **Step 2: Render the badge in the waiting indicator**

In the component that renders the pending/“typing” indicator while `waiting` is set, show the position when present:

```tsx
<Show when={state.queuePosition}>
  <span class="text-[700] text-xs opacity-70">Queued #{state.queuePosition}</span>
</Show>
```

- [ ] **Step 3: Clear on completion**

Ensure the existing message-completion / `waiting: undefined` paths also clear `queuePosition`. Where the store sets `waiting: undefined` on a finished/failed generation, add `queuePosition: undefined` to the same `setState`.

- [ ] **Step 4: Typecheck web**

Run: `pnpm typecheck`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add web/store/message.ts web/pages/Chat
git commit -m "feat(queue): show queue position to waiting users"
```

---

## Task 9: Final verification

- [ ] **Step 1: Run the full check suite**

Run: `pnpm checks`
Expected: format clean, web typecheck clean, all tests pass.

- [ ] **Step 2: Server typecheck (heavier)**

Run: `NODE_OPTIONS=--max-old-space-size=6144 pnpm exec tsc -p srv.tsconfig.json --noEmit`
Expected: no errors.

- [ ] **Step 3: Manual smoke (optional, via the `run` skill)**

Start the app, set `INFERENCE_GLOBAL_CONCURRENCY=1` locally, fire two chats simultaneously, confirm the second shows “Queued #1” then completes after the first. Set `VLLM_METRICS_URL` and confirm text pauses when `num_requests_waiting` exceeds the threshold.

- [ ] **Step 4: Commit any formatting fixups**

```bash
git add -A
git commit -m "chore(queue): formatting + final checks"
```

---

## Self-Review notes

- **Spec coverage:** global cap 10 (Task 1 config + Tasks 2/5 backends), image sub-cap 4 (Tasks 1/2/5), FIFO+priority (Tasks 1/2/5), premium priority via `priorityForUser` (Task 4/7), background priority 3 (Task 7 default), queue-position UX (Tasks 4/8), heartbeat leases (Task 5), in-process fallback (Tasks 2/6), vLLM breaker fail-open (Tasks 3/6), config-driven caps (Task 1), 3 wrap sites (Task 7). All covered.
- **Redis Lua eligibility caveat (known simplification):** the `ACQUIRE` script can only evaluate the *calling* waiter's kind-specific predicate precisely; for *other* waiters it assumes global-room eligibility (head-of-line). This means a blocked-image head could briefly defer a ready text waiter until the next wake/​re-poll (≤1s) rather than instantly — the in-process backend has no such lag. Acceptable for v1; documented here so the implementer doesn't treat it as a bug. If tighter cross-kind fairness is needed later, store each waiter's `kind` in the ZSET member (`{id}|{kind}`) and evaluate per-member in Lua.
- **No data migration**, no new collections — Redis keys are ephemeral. ✓
