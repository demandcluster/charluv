"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ClientGoneError = exports.priorityForUser = exports.PriorityGate = exports.inferenceGate = void 0;
exports.startQueue = startQueue;
const config_1 = require("../config");
const bus_1 = require("../api/ws/bus");
const ws_1 = require("../api/ws");
const local_1 = require("./local");
const redis_1 = require("./redis");
const gate_1 = require("./gate");
const metrics_1 = require("./metrics");
const presence_1 = require("./presence");
const caps = { global: config_1.config.queue.global, image: config_1.config.queue.image };
const sender = {
    toUser: (userId, ev) => (0, ws_1.sendOne)(userId, ev),
    toGuest: (socketId, ev) => (0, ws_1.sendGuest)(socketId, ev),
};
// Default to the in-process backend. startQueue() — run after initMessageBus()
// has connected the Redis bus — upgrades to the shared Redis backend when Redis
// is actually connected, so the global cap holds across the throng worker
// processes. Selecting here by isConnected() would be wrong: this module is
// constructed during createApp(), before the bus connects. Selecting by
// config.redis.host alone is also wrong: its default ('127.0.0.1') is always
// truthy, so dev/Redis-down would needlessly use the Redis backend.
exports.inferenceGate = new gate_1.PriorityGate(new local_1.LocalBackend(caps), sender, presence_1.isPresent);
const breaker = new metrics_1.Breaker(config_1.config.queue.waitingThreshold, config_1.config.queue.pollMs * 4);
function startQueue() {
    if (config_1.config.redis.host && (0, bus_1.isConnected)()) {
        exports.inferenceGate.setBackend(new redis_1.RedisBackend({ caps, cmd: bus_1.clients.pub, sub: bus_1.clients.sub }));
    }
    const stopPresence = (0, presence_1.startPresenceRefresh)();
    if (!config_1.config.queue.metricsUrl)
        return stopPresence;
    const stopPoller = (0, metrics_1.startMetricsPoller)({
        url: config_1.config.queue.metricsUrl,
        pollMs: config_1.config.queue.pollMs,
        breaker,
        onUpdate: (pause) => exports.inferenceGate.setPauseText(pause),
    });
    return () => {
        stopPoller();
        stopPresence();
    };
}
var gate_2 = require("./gate");
Object.defineProperty(exports, "PriorityGate", { enumerable: true, get: function () { return gate_2.PriorityGate; } });
Object.defineProperty(exports, "priorityForUser", { enumerable: true, get: function () { return gate_2.priorityForUser; } });
Object.defineProperty(exports, "ClientGoneError", { enumerable: true, get: function () { return gate_2.ClientGoneError; } });
//# sourceMappingURL=index.js.map