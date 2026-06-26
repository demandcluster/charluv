import { config } from '../config'
import { clients } from '../api/ws/bus'
import { sendGuest, sendOne } from '../api/ws'
import { LocalBackend } from './local'
import { RedisBackend } from './redis'
import { PriorityGate, Sender } from './gate'
import { Breaker, startMetricsPoller } from './metrics'

const caps = { global: config.queue.global, image: config.queue.image }

const sender: Sender = {
  toUser: (userId, ev) => sendOne(userId, ev),
  toGuest: (socketId, ev) => sendGuest(socketId, ev),
}

// Backend is chosen by CONFIG, not live connection state: this module is
// constructed during createApp(), before initMessageBus() connects Redis, so
// isConnected() would always be false here. When a Redis host is configured
// (multi-process throng clustering in production) we use the shared Redis gate;
// the client finishes connecting during startup, before requests arrive.
// Otherwise (single-process dev) the in-process backend.
function makeBackend() {
  if (config.redis.host) {
    return new RedisBackend({ caps, cmd: clients.pub as any, sub: clients.sub as any })
  }
  return new LocalBackend(caps)
}

export const inferenceGate = new PriorityGate(makeBackend(), sender)

const breaker = new Breaker(config.queue.waitingThreshold, config.queue.pollMs * 4)

export function startQueue(): () => void {
  if (!config.queue.metricsUrl) return () => {}
  return startMetricsPoller({
    url: config.queue.metricsUrl,
    pollMs: config.queue.pollMs,
    breaker,
    onUpdate: (pause) => inferenceGate.setPauseText(pause),
  })
}

export { PriorityGate, priorityForUser } from './gate'
