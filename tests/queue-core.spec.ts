import { expect } from 'chai'
import { waiterScore, isEligible, selectNext, Waiter } from '/srv/queue/types'

const caps = { global: 10, image: 4 }

describe('queue scheduling core', () => {
  it('score makes lower priority number win, then earlier time', () => {
    expect(waiterScore(0, 100)).to.be.lessThan(waiterScore(1, 1))
    expect(waiterScore(1, 5)).to.be.lessThan(waiterScore(1, 9))
  })

  it('text ineligible at global cap', () => {
    expect(isEligible('text', { inflight: 10, image: 0 }, caps, false)).to.equal(false)
    expect(isEligible('text', { inflight: 9, image: 0 }, caps, false)).to.equal(true)
  })

  it('text ineligible when breaker pauses text, image unaffected', () => {
    expect(isEligible('text', { inflight: 0, image: 0 }, caps, true)).to.equal(false)
    expect(isEligible('image', { inflight: 0, image: 0 }, caps, true)).to.equal(true)
  })

  it('image gated by image sub-cap even with global room', () => {
    expect(isEligible('image', { inflight: 5, image: 4 }, caps, false)).to.equal(false)
    expect(isEligible('image', { inflight: 5, image: 3 }, caps, false)).to.equal(true)
  })

  it('selectNext returns highest-priority eligible, skipping blocked kinds', () => {
    const waiters: Waiter[] = [
      { id: 'img', kind: 'image', priority: 0, enqueuedAt: 1 }, // premium image, but image full
      { id: 'txt', kind: 'text', priority: 1, enqueuedAt: 2 }, // free text, eligible
    ]
    const next = selectNext(waiters, { inflight: 5, image: 4 }, caps, false)
    expect(next?.id).to.equal('txt')
  })

  it('selectNext returns undefined when nothing eligible', () => {
    const waiters: Waiter[] = [{ id: 'a', kind: 'text', priority: 0, enqueuedAt: 1 }]
    expect(selectNext(waiters, { inflight: 10, image: 0 }, caps, false)).to.equal(undefined)
  })
})
