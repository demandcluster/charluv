"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.userKey = userKey;
exports.guestKey = guestKey;
exports.keyFor = keyFor;
exports.markRedis = markRedis;
exports.clearRedis = clearRedis;
exports.isPresentRedis = isPresentRedis;
exports.isPresentLocal = isPresentLocal;
exports.markPresent = markPresent;
exports.clearPresent = clearPresent;
exports.isPresent = isPresent;
exports.startPresenceRefresh = startPresenceRefresh;
const config_1 = require("../config");
const bus_1 = require("../api/ws/bus");
const PRESENCE_TTL_MS = 75000; // 2.5x the 30s websocket ping interval
function userKey(userId) {
    return `presence:u:${userId}`;
}
function guestKey(socketId) {
    return `presence:g:${socketId}`;
}
function keyFor(id) {
    if (id.userId)
        return userKey(id.userId);
    if (id.socketId)
        return guestKey(id.socketId);
    return undefined;
}
function redisActive() {
    return !!config_1.config.redis.host && (0, bus_1.isConnected)();
}
async function markRedis(cmd, key, member, nowMs) {
    await cmd.zAdd(key, { score: nowMs + PRESENCE_TTL_MS, value: member });
    await cmd.expire(key, Math.ceil(PRESENCE_TTL_MS / 1000) + 5);
}
async function clearRedis(cmd, key, member) {
    await cmd.zRem(key, member);
}
async function isPresentRedis(cmd, key, nowMs) {
    await cmd.zRemRangeByScore(key, 0, nowMs);
    const count = await cmd.zCard(key);
    return count > 0;
}
// --- Local seam (single-process: the live socket maps ARE the truth) ---
function isPresentLocal(id, maps) {
    if (id.userId)
        return (maps.userSockets.get(id.userId)?.length || 0) > 0;
    if (id.socketId)
        return maps.allSockets.has(id.socketId);
    return true;
}
// --- Public API (socket lifecycle + gate use these) ---
async function markPresent(id, member) {
    if (!redisActive())
        return;
    const key = keyFor(id);
    if (!key)
        return;
    await markRedis(bus_1.clients.pub, key, member, Date.now()).catch(() => { });
}
async function clearPresent(id, member) {
    if (!redisActive())
        return;
    const key = keyFor(id);
    if (!key)
        return;
    await clearRedis(bus_1.clients.pub, key, member).catch(() => { });
}
/** True if the requester still has a live connection. Fails OPEN (true) on any error. */
async function isPresent(id) {
    if (!id.userId && !id.socketId)
        return true;
    if (!redisActive()) {
        return isPresentLocal(id, { allSockets: bus_1.allSockets, userSockets: bus_1.userSockets });
    }
    const key = keyFor(id);
    try {
        return await isPresentRedis(bus_1.clients.pub, key, Date.now());
    }
    catch {
        return true;
    }
}
let refreshTimer;
/** Periodically refresh presence TTLs for all locally-connected sockets. No-op without redis. */
function startPresenceRefresh() {
    if (!redisActive())
        return () => { };
    refreshTimer = setInterval(() => {
        const now = Date.now();
        for (const [uid, socket] of bus_1.allSockets) {
            markRedis(bus_1.clients.pub, guestKey(uid), uid, now).catch(() => { });
            const userId = socket.userId;
            if (userId)
                markRedis(bus_1.clients.pub, userKey(userId), uid, now).catch(() => { });
        }
    }, 30000);
    return () => {
        if (refreshTimer)
            clearInterval(refreshTimer);
    };
}
//# sourceMappingURL=presence.js.map