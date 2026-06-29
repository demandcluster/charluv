"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const chai_1 = require("chai");
const abuse_1 = require("/common/abuse");
describe('classifyRegistration', () => {
    it('blocks when both fingerprint and IP match', () => {
        (0, chai_1.expect)((0, abuse_1.classifyRegistration)({ fpMatch: true, ipMatch: true })).to.equal('block');
    });
    it('restricts when only the fingerprint matches', () => {
        (0, chai_1.expect)((0, abuse_1.classifyRegistration)({ fpMatch: true, ipMatch: false })).to.equal('restrict');
    });
    it('restricts when only the IP matches', () => {
        (0, chai_1.expect)((0, abuse_1.classifyRegistration)({ fpMatch: false, ipMatch: true })).to.equal('restrict');
    });
    it('allows when neither matches', () => {
        (0, chai_1.expect)((0, abuse_1.classifyRegistration)({ fpMatch: false, ipMatch: false })).to.equal('allow');
    });
});
//# sourceMappingURL=abuse.spec.js.map