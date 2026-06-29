"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PriorityGate = exports.ClientGoneError = void 0;
exports.priorityForUser = priorityForUser;
const uuid_1 = require("uuid");
const util_1 = require("/common/util");
const middleware_1 = require("../middleware");
/** Thrown when an admitted request's client has already disconnected. Consumers
 * treat it like any generation error (no message/credit/image persisted). */
class ClientGoneError extends Error {
    constructor(message = 'client disconnected before generation') {
        super(message);
        this.name = 'ClientGoneError';
    }
}
exports.ClientGoneError = ClientGoneError;
class PriorityGate {
    constructor(backend, sender, presence = async () => true, now = () => Date.now()) {
        this.backend = backend;
        this.sender = sender;
        this.presence = presence;
        this.now = now;
    }
    setPauseText(pause) {
        this.backend.setPauseText(pause);
    }
    setBackend(backend) {
        this.backend = backend;
    }
    setPresence(presence) {
        this.presence = presence;
    }
    async run(opts, fn) {
        const id = (0, uuid_1.v4)();
        await this.enter(id, opts);
        try {
            return await fn();
        }
        finally {
            await this.release(id);
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
            await this.release(id);
        }
    }
    async release(id) {
        try {
            await this.backend.release(id);
        }
        catch (err) {
            middleware_1.logger.warn({ err }, 'inference gate: release failed, ignoring');
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
        // Admitted — but drop the request if its client has already disconnected,
        // freeing the slot for the next waiter. Fails open (treats as present) on
        // any presence-check error so an outage never wrongly drops requests.
        let present = true;
        try {
            present = await this.presence({ userId: opts.userId, socketId: opts.socketId });
        }
        catch {
            present = true;
        }
        if (!present) {
            await this.release(id);
            throw new ClientGoneError();
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