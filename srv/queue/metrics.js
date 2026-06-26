"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Breaker = void 0;
exports.parsePrometheus = parsePrometheus;
exports.startMetricsPoller = startMetricsPoller;
const needle_1 = __importDefault(require("needle"));
const middleware_1 = require("../middleware");
function matchMetric(text, name) {
    const escaped = name.replace(/[:]/g, '\\:');
    const re = new RegExp(`^${escaped}(?:\\{[^}]*\\})?\\s+([0-9.eE+-]+)`, 'm');
    const m = re.exec(text);
    return m ? Number(m[1]) : undefined;
}
function parsePrometheus(text) {
    return {
        running: matchMetric(text, 'vllm:num_requests_running'),
        waiting: matchMetric(text, 'vllm:num_requests_waiting'),
    };
}
class Breaker {
    constructor(threshold, staleMs) {
        this.threshold = threshold;
        this.staleMs = staleMs;
        this.waiting = 0;
        this.lastOk = 0;
    }
    update(waiting, now) {
        if (waiting === undefined)
            return;
        this.waiting = waiting;
        this.lastOk = now;
    }
    /** True ⇒ pause admitting new text. Fails open (false) when scrape is stale. */
    pauseText(now) {
        if (this.lastOk === 0)
            return false;
        if (now - this.lastOk > this.staleMs)
            return false;
        return this.waiting > this.threshold;
    }
}
exports.Breaker = Breaker;
function startMetricsPoller(opts) {
    let stopped = false;
    const tick = async () => {
        if (stopped)
            return;
        try {
            const res = await (0, needle_1.default)('get', opts.url, { parse: false });
            const text = typeof res.body === 'string' ? res.body : res.body?.toString?.() || '';
            const { waiting } = parsePrometheus(text);
            opts.breaker.update(waiting, Date.now());
        }
        catch (err) {
            middleware_1.logger.warn({ err }, 'vLLM metrics scrape failed');
        }
        opts.onUpdate(opts.breaker.pauseText(Date.now()));
    };
    const timer = setInterval(tick, opts.pollMs);
    tick();
    return () => {
        stopped = true;
        clearInterval(timer);
    };
}
//# sourceMappingURL=metrics.js.map