"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const chai_1 = require("chai");
const local_1 = require("/srv/queue/local");
const gate_1 = require("/srv/queue/gate");
const tick = () => new Promise((r) => setTimeout(r, 0));
function makeGate(caps) {
    const events = [];
    const gate = new gate_1.PriorityGate(new local_1.LocalBackend(caps), {
        toUser: (userId, ev) => events.push({ to: userId, ev }),
        toGuest: (socketId, ev) => events.push({ to: socketId, ev }),
    });
    return { gate, events };
}
describe('PriorityGate', () => {
    it('run holds a slot for the duration and releases it', async () => {
        const { gate } = makeGate({ global: 1, image: 4 });
        let release;
        const slow = new Promise((r) => (release = r));
        const first = gate.run({ kind: 'text', priority: 1, userId: 'u1' }, () => slow.then(() => 'a'));
        await tick();
        let secondDone = false;
        const second = gate
            .run({ kind: 'text', priority: 1, userId: 'u2' }, async () => 'b')
            .then((v) => {
            secondDone = true;
            return v;
        });
        await tick();
        (0, chai_1.expect)(secondDone).to.equal(false); // blocked behind first
        release();
        (0, chai_1.expect)(await first).to.equal('a');
        (0, chai_1.expect)(await second).to.equal('b');
    });
    it('gateStream does no work before a slot is acquired', async () => {
        const { gate } = makeGate({ global: 1, image: 4 });
        const blocker = gate.run({ kind: 'text', priority: 1, userId: 'u0' }, () => new Promise(() => { }));
        void blocker;
        await tick();
        let started = false;
        async function* gen() {
            started = true;
            yield 'x';
        }
        const stream = gate.gateStream({ kind: 'text', priority: 1, userId: 'u1' }, () => gen());
        const it = stream[Symbol.asyncIterator]();
        const next = it.next();
        await tick();
        (0, chai_1.expect)(started).to.equal(false); // still queued
        void next;
    });
    it('emits a position event to the waiting user and a clear on admit', async () => {
        const { gate, events } = makeGate({ global: 1, image: 4 });
        let release;
        const slow = new Promise((r) => (release = r));
        gate.run({ kind: 'text', priority: 1, userId: 'holder' }, () => slow);
        await tick();
        gate.run({ kind: 'text', priority: 1, userId: 'waiter', requestId: 'r1' }, async () => 'ok');
        await tick();
        (0, chai_1.expect)(events.some((e) => e.to === 'waiter' && e.ev.position === 1)).to.equal(true);
        release();
        await tick();
        (0, chai_1.expect)(events.some((e) => e.to === 'waiter' && e.ev.position === 0)).to.equal(true);
    });
    it('priorityForUser: guest=2, free=1, premium=0', () => {
        const tiers = [];
        (0, chai_1.expect)((0, gate_1.priorityForUser)({ _id: 'g' }, true, tiers)).to.equal(2);
        // no active tier -> free
        (0, chai_1.expect)((0, gate_1.priorityForUser)({ _id: 'u' }, false, tiers)).to.equal(1);
    });
    it('degrades to ungated when the backend acquire fails', async () => {
        const failing = {
            acquire: () => Promise.reject(new Error('redis down')),
            release: () => Promise.resolve(),
            setPauseText: () => { },
        };
        const gate = new gate_1.PriorityGate(failing, { toUser: () => { }, toGuest: () => { } });
        const result = await gate.run({ kind: 'text', priority: 1, userId: 'u' }, async () => 'ok');
        (0, chai_1.expect)(result).to.equal('ok');
        const chunks = [];
        async function* gen() {
            yield 'a';
            yield 'b';
        }
        for await (const c of gate.gateStream({ kind: 'text', priority: 1, userId: 'u' }, () => gen())) {
            chunks.push(c);
        }
        (0, chai_1.expect)(chunks).to.deep.equal(['a', 'b']);
    });
    it('degrades to ungated when both acquire AND release fail', async () => {
        const failing = {
            acquire: () => Promise.reject(new Error('redis down')),
            release: () => Promise.reject(new Error('redis down')),
            setPauseText: () => { },
        };
        const gate = new gate_1.PriorityGate(failing, { toUser: () => { }, toGuest: () => { } });
        const result = await gate.run({ kind: 'text', priority: 1, userId: 'u' }, async () => 'ok');
        (0, chai_1.expect)(result).to.equal('ok');
        const chunks = [];
        async function* gen() {
            yield 'a';
        }
        for await (const c of gate.gateStream({ kind: 'text', priority: 1, userId: 'u' }, () => gen())) {
            chunks.push(c);
        }
        (0, chai_1.expect)(chunks).to.deep.equal(['a']);
    });
    it('setBackend swaps the active backend', async () => {
        const calls = [];
        const mk = (name) => ({
            acquire: () => {
                calls.push(name);
                return Promise.resolve();
            },
            release: () => Promise.resolve(),
            setPauseText: () => { },
        });
        const gate = new gate_1.PriorityGate(mk('A'), { toUser: () => { }, toGuest: () => { } });
        await gate.run({ kind: 'text', priority: 1 }, async () => '');
        gate.setBackend(mk('B'));
        await gate.run({ kind: 'text', priority: 1 }, async () => '');
        (0, chai_1.expect)(calls).to.deep.equal(['A', 'B']);
    });
});
//# sourceMappingURL=queue-gate.spec.js.map