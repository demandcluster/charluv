import { config } from '../config'
import { clients, isConnected } from '../api/ws/bus'
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

// Default to the in-process backend. startQueue() — run after initMessageBus()
// has connected the Redis bus — upgrades to the shared Redis backend when Redis
// is actually connected, so the global cap holds across the throng worker
// processes. Selecting here by isConnected() would be wrong: this module is
// constructed during createApp(), before the bus connects. Selecting by
// config.redis.host alone is also wrong: its default ('127.0.0.1') is always
// truthy, so dev/Redis-down would needlessly use the Redis backend.
export const inferenceGate = new PriorityGate(new LocalBackend(caps), sender)

const breaker = new Breaker(config.queue.waitingThreshold, config.queue.pollMs * 4)

export function startQueue(): () => void {
  if (config.redis.host && isConnected()) {
    inferenceGate.setBackend(
      new RedisBackend({ caps, cmd: clients.pub as any, sub: clients.sub as any })
    )
  }
  if (!config.queue.metricsUrl) return () => {}
  return startMetricsPoller({
    url: config.queue.metricsUrl,
    pollMs: config.queue.pollMs,
    breaker,
    onUpdate: (pause) => inferenceGate.setPauseText(pause),
  })
}

export { PriorityGate, priorityForUser } from './gate'
