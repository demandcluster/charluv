"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const chai_1 = require("chai");
const local_1 = require("/srv/queue/local");
const tick = () => new Promise((r) => setTimeout(r, 0));
describe('LocalBackend', () => {
    it('admits up to the global cap, queues the rest', async () => {
        const b = new local_1.LocalBackend({ global: 2, image: 4 });
        const admitted = [];
        for (const id of ['a', 'b', 'c']) {
            b.acquire({ id, kind: 'text', priority: 1, enqueuedAt: id.charCodeAt(0) }).then(() => admitted.push(id));
        }
        await tick();
        (0, chai_1.expect)(admitted).to.deep.equal(['a', 'b']);
        await b.release('a');
        await tick();
        (0, chai_1.expect)(admitted).to.deep.equal(['a', 'b', 'c']);
    });
    it('serves premium before free regardless of arrival order', async () => {
        const b = new local_1.LocalBackend({ global: 1, image: 4 });
        const order = [];
        b.acquire({ id: 'hold', kind: 'text', priority: 1, enqueuedAt: 1 }).then(() => order.push('hold'));
        await tick();
        b.acquire({ id: 'free', kind: 'text', priority: 1, enqueuedAt: 2 }).then(() => order.push('free'));
        b.acquire({ id: 'prem', kind: 'text', priority: 0, enqueuedAt: 3 }).then(() => order.push('prem'));
        await tick();
        await b.release('hold');
        await tick();
        await b.release('prem');
        await tick();
        (0, chai_1.expect)(order).to.deep.equal(['hold', 'prem', 'free']);
    });
    it('enforces the image sub-cap without blocking text', async () => {
        const b = new local_1.LocalBackend({ global: 10, image: 1 });
        const admitted = [];
        b.acquire({ id: 'i1', kind: 'image', priority: 1, enqueuedAt: 1 }).then(() => admitted.push('i1'));
        b.acquire({ id: 'i2', kind: 'image', priority: 0, enqueuedAt: 2 }).then(() => admitted.push('i2'));
        b.acquire({ id: 't1', kind: 'text', priority: 1, enqueuedAt: 3 }).then(() => admitted.push('t1'));
        await tick();
        // i1 takes the only image slot; i2 waits on sub-cap; t1 (text) is admitted past it
        (0, chai_1.expect)(admitted.sort()).to.deep.equal(['i1', 't1']);
    });
    it('pauses text but still admits image when breaker is on', async () => {
        const b = new local_1.LocalBackend({ global: 10, image: 4 });
        b.setPauseText(true);
        const admitted = [];
        b.acquire({ id: 't', kind: 'text', priority: 0, enqueuedAt: 1 }).then(() => admitted.push('t'));
        b.acquire({ id: 'i', kind: 'image', priority: 1, enqueuedAt: 2 }).then(() => admitted.push('i'));
        await tick();
        (0, chai_1.expect)(admitted).to.deep.equal(['i']);
        b.setPauseText(false);
        await tick();
        (0, chai_1.expect)(admitted.sort()).to.deep.equal(['i', 't']);
    });
    it('reports position to waiters and rejects on abort', async () => {
        const b = new local_1.LocalBackend({ global: 1, image: 4 });
        b.acquire({ id: 'hold', kind: 'text', priority: 1, enqueuedAt: 1 });
        const positions = [];
        const ac = new AbortController();
        const p = b.acquire({
            id: 'wait',
            kind: 'text',
            priority: 1,
            enqueuedAt: 2,
            onPosition: (n) => positions.push(n),
            signal: ac.signal,
        });
        await tick();
        (0, chai_1.expect)(positions[positions.length - 1]).to.equal(1); // 1 ahead of it
        ac.abort();
        let rejected = false;
        await p.catch(() => (rejected = true));
        (0, chai_1.expect)(rejected).to.equal(true);
    });
});
//# sourceMappingURL=queue-local.spec.js.map