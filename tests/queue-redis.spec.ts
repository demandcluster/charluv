import { expect } from 'chai'
import { createClient } from 'redis'
import { RedisBackend } from '/srv/queue/redis'

const tick = (ms = 50) => new Promise((r) => setTimeout(r, ms))

describe('RedisBackend (requires local redis)', function () {
  this.timeout(8000)
  let cmd: any
  let sub: any
  let available = true
  const prefix = 'test-gate-' + process.pid + '-' + Math.floor(Math.random() * 1e6)

  before(async () => {
    try {
      cmd = createClient({ url: 'redis://127.0.0.1:6379' })
      sub = cmd.duplicate()
      await cmd.connect()
      await sub.connect()
    } catch {
      available = false
    }
  })

  after(async () => {
    if (!available) return
    const keys = await cmd.keys(prefix + ':*')
    if (keys.length) await cmd.del(keys)
    await cmd.quit()
    await sub.quit()
  })

  it('caps combined inflight and serves premium first', async function () {
    if (!available) this.skip()
    const b = new RedisBackend({ caps: { global: 1, image: 4 }, cmd, sub, keyPrefix: prefix })
    const order: string[] = []
    await b.acquire({ id: 'hold', kind: 'text', priority: 1, enqueuedAt: 1 }).then(() => order.push('hold'))
    b.acquire({ id: 'free', kind: 'text', priority: 1, enqueuedAt: 2 }).then(() => order.push('free'))
    b.acquire({ id: 'prem', kind: 'text', priority: 0, enqueuedAt: 3 }).then(() => order.push('prem'))
    await tick()
    await b.release('hold')
    await tick()
    expect(order).to.deep.equal(['hold', 'prem'])
    await b.release('prem')
    await tick()
    expect(order).to.deep.equal(['hold', 'prem', 'free'])
  })
})
