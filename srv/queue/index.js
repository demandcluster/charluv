"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.priorityForUser = exports.PriorityGate = exports.inferenceGate = void 0;
exports.startQueue = startQueue;
const config_1 = require("../config");
const bus_1 = require("../api/ws/bus");
const ws_1 = require("../api/ws");
const local_1 = require("./local");
const redis_1 = require("./redis");
const gate_1 = require("./gate");
const metrics_1 = require("./metrics");
const caps = { global: config_1.config.queue.global, image: config_1.config.queue.image };
const sender = {
    toUser: (userId, ev) => (0, ws_1.sendOne)(userId, ev),
    toGuest: (socketId, ev) => (0, ws_1.sendGuest)(socketId, ev),
};
// Backend is chosen by CONFIG, not live connection state: this module is
// constructed during createApp(), before initMessageBus() connects Redis, so
// isConnected() would always be false here. When a Redis host is configured
// (multi-process throng clustering in production) we use the shared Redis gate;
// the client finishes connecting during startup, before requests arrive.
// Otherwise (single-process dev) the in-process backend.
function makeBackend() {
    if (config_1.config.redis.host) {
        return new redis_1.RedisBackend({ caps, cmd: bus_1.clients.pub, sub: bus_1.clients.sub });
    }
    return new local_1.LocalBackend(caps);
}
exports.inferenceGate = new gate_1.PriorityGate(makeBackend(), sender);
const breaker = new metrics_1.Breaker(config_1.config.queue.waitingThreshold, config_1.config.queue.pollMs * 4);
function startQueue() {
    if (!config_1.config.queue.metricsUrl)
        return () => { };
    return (0, metrics_1.startMetricsPoller)({
        url: config_1.config.queue.metricsUrl,
        pollMs: config_1.config.queue.pollMs,
        breaker,
        onUpdate: (pause) => exports.inferenceGate.setPauseText(pause),
    });
}
var gate_2 = require("./gate");
Object.defineProperty(exports, "PriorityGate", { enumerable: true, get: function () { return gate_2.PriorityGate; } });
Object.defineProperty(exports, "priorityForUser", { enumerable: true, get: function () { return gate_2.priorityForUser; } });
//# sourceMappingURL=index.js.map