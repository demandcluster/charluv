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
    if (pending.onAbort && pending.signal)
      pending.signal.removeEventListener('abort', pending.onAbort)
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
