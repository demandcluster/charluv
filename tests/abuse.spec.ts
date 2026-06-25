import { expect } from 'chai'
import { classifyRegistration } from '/common/abuse'

describe('classifyRegistration', () => {
  it('blocks when both fingerprint and IP match', () => {
    expect(classifyRegistration({ fpMatch: true, ipMatch: true })).to.equal('block')
  })
  it('restricts when only the fingerprint matches', () => {
    expect(classifyRegistration({ fpMatch: true, ipMatch: false })).to.equal('restrict')
  })
  it('restricts when only the IP matches', () => {
    expect(classifyRegistration({ fpMatch: false, ipMatch: true })).to.equal('restrict')
  })
  it('allows when neither matches', () => {
    expect(classifyRegistration({ fpMatch: false, ipMatch: false })).to.equal('allow')
  })
})
