"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.waiterScore = waiterScore;
exports.isEligible = isEligible;
exports.selectNext = selectNext;
/** Lower result = served sooner. Priority dominates; enqueue time is the tiebreak. */
function waiterScore(priority, enqueuedAt) {
    return priority * 1e13 + enqueuedAt;
}
/** Can a waiter of `kind` be admitted right now? `pauseText` = breaker tripped. */
function isEligible(kind, counts, caps, pauseText) {
    if (counts.inflight >= caps.global)
        return false;
    if (kind === 'image')
        return counts.image < caps.image;
    return !pauseText;
}
/** Highest-priority waiter whose predicate currently passes (eligibility-aware, not strict positional FIFO). */
function selectNext(waiters, counts, caps, pauseText) {
    let best;
    let bestScore = Infinity;
    for (const w of waiters) {
        if (!isEligible(w.kind, counts, caps, pauseText))
            continue;
        const s = waiterScore(w.priority, w.enqueuedAt);
        if (s < bestScore) {
            bestScore = s;
            best = w;
        }
    }
    return best;
}
//# sourceMappingURL=types.js.map