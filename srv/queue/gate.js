"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PriorityGate = void 0;
exports.priorityForUser = priorityForUser;
const uuid_1 = require("uuid");
const util_1 = require("/common/util");
const middleware_1 = require("../middleware");
class PriorityGate {
    constructor(backend, sender, now = () => Date.now()) {
        this.backend = backend;
        this.sender = sender;
        this.now = now;
    }
    setPauseText(pause) {
        this.backend.setPauseText(pause);
    }
    async run(opts, fn) {
        const id = (0, uuid_1.v4)();
        await this.enter(id, opts);
        try {
            return await fn();
        }
        finally {
            await this.backend.release(id);
        }
    }
    async *gateStream(opts, makeGen) {
        const id = (0, uuid_1.v4)();
        await this.enter(id, opts);
        try {
            const gen = makeGen();
            for await (const chunk of gen) {
                yield chunk;
            }
        }
        finally {
            await this.backend.release(id);
        }
    }
    async enter(id, opts) {
        try {
            await this.backend.acquire({
                id,
                kind: opts.kind,
                priority: opts.priority,
                enqueuedAt: this.now(),
                onPosition: (position) => this.emit(opts, position),
            });
        }
        catch (err) {
            // Backend (e.g. Redis) unavailable: degrade to ungated rather than failing
            // the inference request. Fulfils the spec's "Redis unavailable -> proceed"
            // fallback. (Abort/disconnect is not wired through the facade in v1.)
            middleware_1.logger.warn({ err }, 'inference gate: acquire failed, proceeding ungated');
            return;
        }
        this.emit(opts, 0); // clear the badge on admission
    }
    emit(opts, position) {
        const ev = {
            type: 'queue-position',
            kind: opts.kind,
            position,
            requestId: opts.requestId,
        };
        if (opts.userId)
            this.sender.toUser(opts.userId, ev);
        else if (opts.socketId)
            this.sender.toGuest(opts.socketId, ev);
    }
}
exports.PriorityGate = PriorityGate;
function priorityForUser(user, isGuest, tiers) {
    if (isGuest)
        return 2;
    const sub = (0, util_1.getUserSubscriptionTier)(user, tiers);
    return sub?.tier ? 0 : 1;
}
//# sourceMappingURL=gate.js.map