"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const chai_1 = require("chai");
const types_1 = require("/srv/queue/types");
const caps = { global: 10, image: 4 };
describe('queue scheduling core', () => {
    it('score makes lower priority number win, then earlier time', () => {
        (0, chai_1.expect)((0, types_1.waiterScore)(0, 100)).to.be.lessThan((0, types_1.waiterScore)(1, 1));
        (0, chai_1.expect)((0, types_1.waiterScore)(1, 5)).to.be.lessThan((0, types_1.waiterScore)(1, 9));
    });
    it('text ineligible at global cap', () => {
        (0, chai_1.expect)((0, types_1.isEligible)('text', { inflight: 10, image: 0 }, caps, false)).to.equal(false);
        (0, chai_1.expect)((0, types_1.isEligible)('text', { inflight: 9, image: 0 }, caps, false)).to.equal(true);
    });
    it('text ineligible when breaker pauses text, image unaffected', () => {
        (0, chai_1.expect)((0, types_1.isEligible)('text', { inflight: 0, image: 0 }, caps, true)).to.equal(false);
        (0, chai_1.expect)((0, types_1.isEligible)('image', { inflight: 0, image: 0 }, caps, true)).to.equal(true);
    });
    it('image gated by image sub-cap even with global room', () => {
        (0, chai_1.expect)((0, types_1.isEligible)('image', { inflight: 5, image: 4 }, caps, false)).to.equal(false);
        (0, chai_1.expect)((0, types_1.isEligible)('image', { inflight: 5, image: 3 }, caps, false)).to.equal(true);
    });
    it('selectNext returns highest-priority eligible, skipping blocked kinds', () => {
        const waiters = [
            { id: 'img', kind: 'image', priority: 0, enqueuedAt: 1 }, // premium image, but image full
            { id: 'txt', kind: 'text', priority: 1, enqueuedAt: 2 }, // free text, eligible
        ];
        const next = (0, types_1.selectNext)(waiters, { inflight: 5, image: 4 }, caps, false);
        (0, chai_1.expect)(next?.id).to.equal('txt');
    });
    it('selectNext returns undefined when nothing eligible', () => {
        const waiters = [{ id: 'a', kind: 'text', priority: 0, enqueuedAt: 1 }];
        (0, chai_1.expect)((0, types_1.selectNext)(waiters, { inflight: 10, image: 0 }, caps, false)).to.equal(undefined);
    });
});
//# sourceMappingURL=queue-core.spec.js.map