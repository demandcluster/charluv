"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const chai_1 = require("chai");
const presence_1 = require("/srv/queue/presence");
describe('presence key derivation', () => {
    it('derives user and guest keys', () => {
        (0, chai_1.expect)((0, presence_1.userKey)('u1')).to.equal('presence:u:u1');
        (0, chai_1.expect)((0, presence_1.guestKey)('s1')).to.equal('presence:g:s1');
        (0, chai_1.expect)((0, presence_1.keyFor)({ userId: 'u1' })).to.equal('presence:u:u1');
        (0, chai_1.expect)((0, presence_1.keyFor)({ socketId: 's1' })).to.equal('presence:g:s1');
        (0, chai_1.expect)((0, presence_1.keyFor)({})).to.equal(undefined);
    });
});
describe('isPresentLocal', () => {
    it('user present iff they have a live socket', () => {
        const maps = { allSockets: new Map(), userSockets: new Map([['u1', [{}]]]) };
        (0, chai_1.expect)((0, presence_1.isPresentLocal)({ userId: 'u1' }, maps)).to.equal(true);
        (0, chai_1.expect)((0, presence_1.isPresentLocal)({ userId: 'u2' }, maps)).to.equal(false);
    });
    it('guest present iff their socket is in allSockets', () => {
        const maps = { allSockets: new Map([['s1', {}]]), userSockets: new Map() };
        (0, chai_1.expect)((0, presence_1.isPresentLocal)({ socketId: 's1' }, maps)).to.equal(true);
        (0, chai_1.expect)((0, presence_1.isPresentLocal)({ socketId: 's2' }, maps)).to.equal(false);
    });
    it('no identity → present (fail open)', () => {
        (0, chai_1.expect)((0, presence_1.isPresentLocal)({}, { allSockets: new Map(), userSockets: new Map() })).to.equal(true);
    });
});
describe('presence redis seam (requires local redis)', function () {
    this.timeout(8000);
    let cmd;
    let available = true;
    const key = 'presence:test:' + process.pid;
    before(async () => {
        try {
            const { createClient } = require('redis');
            cmd = createClient({ url: 'redis://127.0.0.1:6379' });
            await cmd.connect();
        }
        catch {
            available = false;
        }
    });
    after(async () => {
        if (!available)
            return;
        await cmd.del(key);
        await cmd.quit();
    });
    it('mark → present, clear → absent', async function () {
        if (!available)
            this.skip();
        const { markRedis, clearRedis, isPresentRedis } = require('/srv/queue/presence');
        const now = 1000000;
        await markRedis(cmd, key, 'sock-a', now);
        (0, chai_1.expect)(await isPresentRedis(cmd, key, now)).to.equal(true);
        await clearRedis(cmd, key, 'sock-a');
        (0, chai_1.expect)(await isPresentRedis(cmd, key, now)).to.equal(false);
    });
    it('expired members are reaped → absent', async function () {
        if (!available)
            this.skip();
        const { markRedis, isPresentRedis } = require('/srv/queue/presence');
        const past = 1000000;
        await markRedis(cmd, key, 'sock-b', past); // expiry = past + 75s
        // check far in the future, past the TTL window → reaped
        (0, chai_1.expect)(await isPresentRedis(cmd, key, past + 200000)).to.equal(false);
    });
});
//# sourceMappingURL=queue-presence.spec.js.map