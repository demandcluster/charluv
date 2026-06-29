import needle from 'needle'
import { logger } from '../middleware'

function matchMetric(text: string, name: string): number | undefined {
  const escaped = name.replace(/[:]/g, '\\:')
  const re = new RegExp(`^${escaped}(?:\\{[^}]*\\})?\\s+([0-9.eE+-]+)`, 'm')
  const m = re.exec(text)
  return m ? Number(m[1]) : undefined
}

export function parsePrometheus(text: string): { running?: number; waiting?: number } {
  return {
    running: matchMetric(text, 'vllm:num_requests_running'),
    waiting: matchMetric(text, 'vllm:num_requests_waiting'),
  }
}

export class Breaker {
  private waiting = 0
  private lastOk = 0

  constructor(private threshold: number, private staleMs: number) {}

  update(waiting: number | undefined, now: number) {
    if (waiting === undefined) return
    this.waiting = waiting
    this.lastOk = now
  }

  /** True ⇒ pause admitting new text. Fails open (false) when scrape is stale. */
  pauseText(now: number): boolean {
    if (this.lastOk === 0) return false
    if (now - this.lastOk > this.staleMs) return false
    return this.waiting > this.threshold
  }
}

export function startMetricsPoller(opts: {
  url: string
  pollMs: number
  breaker: Breaker
  onUpdate: (pause: boolean) => void
}): () => void {
  let stopped = false
  const tick = async () => {
    if (stopped) return
    try {
      const res = await needle('get', opts.url, { parse: false })
      const text = typeof res.body === 'string' ? res.body : res.body?.toString?.() || ''
      const { waiting } = parsePrometheus(text)
      opts.breaker.update(waiting, Date.now())
    } catch (err) {
      logger.warn({ err }, 'vLLM metrics scrape failed')
    }
    opts.onUpdate(opts.breaker.pauseText(Date.now()))
  }
  const timer = setInterval(tick, opts.pollMs)
  tick()
  return () => {
    stopped = true
    clearInterval(timer)
  }
}
