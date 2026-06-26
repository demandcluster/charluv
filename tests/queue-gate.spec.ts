import { expect } from 'chai'
import { LocalBackend } from '/srv/queue/local'
import { PriorityGate, priorityForUser, PositionEvent } from '/srv/queue/gate'

const tick = () => new Promise((r) => setTimeout(r, 0))

function makeGate(caps: { global: number; image: number }) {
  const events: Array<{ to: string; ev: PositionEvent }> = []
  const gate = new PriorityGate(new LocalBackend(caps), {
    toUser: (userId, ev) => events.push({ to: userId, ev }),
    toGuest: (socketId, ev) => events.push({ to: socketId, ev }),
  })
  return { gate, events }
}

describe('PriorityGate', () => {
  it('run holds a slot for the duration and releases it', async () => {
    const { gate } = makeGate({ global: 1, image: 4 })
    let release!: () => void
    const slow = new Promise<void>((r) => (release = r))
    const first = gate.run({ kind: 'text', priority: 1, userId: 'u1' }, () => slow.then(() => 'a'))
    await tick()
    let secondDone = false
    const second = gate
      .run({ kind: 'text', priority: 1, userId: 'u2' }, async () => 'b')
      .then((v) => {
        secondDone = true
        return v
      })
    await tick()
    expect(secondDone).to.equal(false) // blocked behind first
    release()
    expect(await first).to.equal('a')
    expect(await second).to.equal('b')
  })

  it('gateStream does no work before a slot is acquired', async () => {
    const { gate } = makeGate({ global: 1, image: 4 })
    const blocker = gate.run({ kind: 'text', priority: 1, userId: 'u0' }, () => new Promise(() => {}))
    void blocker
    await tick()
    let started = false
    async function* gen() {
      started = true
      yield 'x'
    }
    const stream = gate.gateStream({ kind: 'text', priority: 1, userId: 'u1' }, () => gen())
    const it = stream[Symbol.asyncIterator]()
    const next = it.next()
    await tick()
    expect(started).to.equal(false) // still queued
    void next
  })

  it('emits a position event to the waiting user and a clear on admit', async () => {
    const { gate, events } = makeGate({ global: 1, image: 4 })
    let release!: () => void
    const slow = new Promise<void>((r) => (release = r))
    gate.run({ kind: 'text', priority: 1, userId: 'holder' }, () => slow)
    await tick()
    gate.run({ kind: 'text', priority: 1, userId: 'waiter', requestId: 'r1' }, async () => 'ok')
    await tick()
    expect(events.some((e) => e.to === 'waiter' && e.ev.position === 1)).to.equal(true)
    release()
    await tick()
    expect(events.some((e) => e.to === 'waiter' && e.ev.position === 0)).to.equal(true)
  })

  it('priorityForUser: guest=2, free=1, premium=0', () => {
    const tiers: any[] = []
    expect(priorityForUser({ _id: 'g' } as any, true, tiers)).to.equal(2)
    // no active tier -> free
    expect(priorityForUser({ _id: 'u' } as any, false, tiers)).to.equal(1)
  })

  it('degrades to ungated when the backend acquire fails', async () => {
    const failing = {
      acquire: () => Promise.reject(new Error('redis down')),
      release: () => Promise.resolve(),
      setPauseText: () => {},
    }
    const gate = new PriorityGate(failing as any, { toUser: () => {}, toGuest: () => {} })
    const result = await gate.run({ kind: 'text', priority: 1, userId: 'u' }, async () => 'ok')
    expect(result).to.equal('ok')
    const chunks: string[] = []
    async function* gen() {
      yield 'a'
      yield 'b'
    }
    for await (const c of gate.gateStream({ kind: 'text', priority: 1, userId: 'u' }, () => gen())) {
      chunks.push(c)
    }
    expect(chunks).to.deep.equal(['a', 'b'])
  })

  it('degrades to ungated when both acquire AND release fail', async () => {
    const failing = {
      acquire: () => Promise.reject(new Error('redis down')),
      release: () => Promise.reject(new Error('redis down')),
      setPauseText: () => {},
    }
    const gate = new PriorityGate(failing as any, { toUser: () => {}, toGuest: () => {} })
    const result = await gate.run({ kind: 'text', priority: 1, userId: 'u' }, async () => 'ok')
    expect(result).to.equal('ok')
    const chunks: string[] = []
    async function* gen() {
      yield 'a'
    }
    for await (const c of gate.gateStream({ kind: 'text', priority: 1, userId: 'u' }, () => gen())) {
      chunks.push(c)
    }
    expect(chunks).to.deep.equal(['a'])
  })

  it('setBackend swaps the active backend', async () => {
    const calls: string[] = []
    const mk = (name: string) => ({
      acquire: () => {
        calls.push(name)
        return Promise.resolve()
      },
      release: () => Promise.resolve(),
      setPauseText: () => {},
    })
    const gate = new PriorityGate(mk('A') as any, { toUser: () => {}, toGuest: () => {} })
    await gate.run({ kind: 'text', priority: 1 }, async () => '')
    gate.setBackend(mk('B') as any)
    await gate.run({ kind: 'text', priority: 1 }, async () => '')
    expect(calls).to.deep.equal(['A', 'B'])
  })
})
