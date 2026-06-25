import { expect } from 'chai'
import './init'
import { extendPremium } from '../srv/db/promo'

describe('extendPremium', () => {
  it('extends from now when premiumUntil is in the past', () => {
    const now = 1_000_000_000_000
    const result = extendPremium(now - 5000, 2, now)
    expect(result).to.equal(now + 2 * 86_400_000)
  })

  it('stacks on top of an existing future premiumUntil', () => {
    const now = 1_000_000_000_000
    const future = now + 10 * 86_400_000
    const result = extendPremium(future, 3, now)
    expect(result).to.equal(future + 3 * 86_400_000)
  })

  it('treats missing premiumUntil as now', () => {
    const now = 1_000_000_000_000
    const result = extendPremium(0, 1, now)
    expect(result).to.equal(now + 86_400_000)
  })
})
