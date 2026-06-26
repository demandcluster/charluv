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
