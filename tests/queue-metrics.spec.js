"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const chai_1 = require("chai");
const metrics_1 = require("/srv/queue/metrics");
const SAMPLE = `# HELP vllm:num_requests_running ...
# TYPE vllm:num_requests_running gauge
vllm:num_requests_running{model_name="x"} 7.0
vllm:num_requests_waiting{model_name="x"} 3.0
`;
describe('vLLM metrics', () => {
    it('parses running and waiting gauges', () => {
        (0, chai_1.expect)((0, metrics_1.parsePrometheus)(SAMPLE)).to.deep.equal({ running: 7, waiting: 3 });
    });
    it('returns undefined for missing metrics', () => {
        (0, chai_1.expect)((0, metrics_1.parsePrometheus)('nothing here')).to.deep.equal({ running: undefined, waiting: undefined });
    });
    it('breaker pauses text only above threshold', () => {
        const b = new metrics_1.Breaker(1, 10000);
        b.update(2, 1000);
        (0, chai_1.expect)(b.pauseText(1000)).to.equal(true);
        b.update(1, 2000);
        (0, chai_1.expect)(b.pauseText(2000)).to.equal(false);
    });
    it('breaker fails open when metrics are stale', () => {
        const b = new metrics_1.Breaker(1, 5000);
        b.update(5, 1000);
        (0, chai_1.expect)(b.pauseText(1000)).to.equal(true);
        (0, chai_1.expect)(b.pauseText(7000)).to.equal(false); // 6s since last scrape > 5s stale window
    });
});
//# sourceMappingURL=queue-metrics.spec.js.map