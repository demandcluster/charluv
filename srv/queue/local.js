"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LocalBackend = void 0;
const types_1 = require("./types");
class LocalBackend {
    constructor(caps) {
        this.caps = caps;
        this.counts = { inflight: 0, image: 0 };
        this.pauseText = false;
        this.waiting = [];
        this.admitted = new Map();
    }
    acquire(req) {
        return new Promise((resolve, reject) => {
            const pending = {
                waiter: { id: req.id, kind: req.kind, priority: req.priority, enqueuedAt: req.enqueuedAt },
                resolve,
                reject,
                onPosition: req.onPosition,
                lastPosition: -1,
                signal: req.signal,
            };
            if (req.signal) {
                if (req.signal.aborted)
                    return reject(new Error('aborted'));
                pending.onAbort = () => this.abort(req.id);
                req.signal.addEventListener('abort', pending.onAbort);
            }
            this.waiting.push(pending);
            this.schedule();
        });
    }
    async release(id) {
        const kind = this.admitted.get(id);
        if (!kind)
            return;
        this.admitted.delete(id);
        this.counts.inflight--;
        if (kind === 'image')
            this.counts.image--;
        this.schedule();
    }
    setPauseText(pause) {
        this.pauseText = pause;
        this.schedule();
    }
    abort(id) {
        const idx = this.waiting.findIndex((p) => p.waiter.id === id);
        if (idx === -1)
            return;
        const [pending] = this.waiting.splice(idx, 1);
        if (pending.onAbort && pending.signal)
            pending.signal.removeEventListener('abort', pending.onAbort);
        pending.reject(new Error('aborted'));
        this.schedule();
    }
    schedule() {
        // Admit as many eligible waiters as capacity allows.
        while (this.waiting.length) {
            const waiters = this.waiting.map((p) => p.waiter);
            const next = (0, types_1.selectNext)(waiters, this.counts, this.caps, this.pauseText);
            if (!next)
                break;
            const idx = this.waiting.findIndex((p) => p.waiter.id === next.id);
            const [pending] = this.waiting.splice(idx, 1);
            if (pending.onAbort && pending.signal) {
                pending.signal.removeEventListener('abort', pending.onAbort);
            }
            this.admitted.set(next.id, next.kind);
            this.counts.inflight++;
            if (next.kind === 'image')
                this.counts.image++;
            pending.resolve();
        }
        this.publishPositions();
    }
    publishPositions() {
        const sorted = [...this.waiting].sort((a, b) => (0, types_1.waiterScore)(a.waiter.priority, a.waiter.enqueuedAt) -
            (0, types_1.waiterScore)(b.waiter.priority, b.waiter.enqueuedAt));
        sorted.forEach((pending, i) => {
            const position = i + 1;
            if (pending.onPosition && pending.lastPosition !== position) {
                pending.lastPosition = position;
                pending.onPosition(position);
            }
        });
    }
}
exports.LocalBackend = LocalBackend;
//# sourceMappingURL=local.js.map