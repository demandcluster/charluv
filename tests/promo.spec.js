"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const chai_1 = require("chai");
require("./init");
const promo_1 = require("../srv/db/promo");
describe('extendPremium', () => {
    it('extends from now when premiumUntil is in the past', () => {
        const now = 1000000000000;
        const result = (0, promo_1.extendPremium)(now - 5000, 2, now);
        (0, chai_1.expect)(result).to.equal(now + 2 * 86400000);
    });
    it('stacks on top of an existing future premiumUntil', () => {
        const now = 1000000000000;
        const future = now + 10 * 86400000;
        const result = (0, promo_1.extendPremium)(future, 3, now);
        (0, chai_1.expect)(result).to.equal(future + 3 * 86400000);
    });
    it('treats missing premiumUntil as now', () => {
        const now = 1000000000000;
        const result = (0, promo_1.extendPremium)(0, 1, now);
        (0, chai_1.expect)(result).to.equal(now + 86400000);
    });
});
//# sourceMappingURL=promo.spec.js.map