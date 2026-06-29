import { expect } from 'chai'
import './init'
import {
  ARCHETYPES,
  STAGE_DEFINITIONS,
  formatStageToken,
  getProgressionSteps,
  resolveStage,
} from '/common/progression'

describe('Progression archetypes', () => {
  it('resolves the earliest stage below the first threshold', () => {
    const step = resolveStage(0, { archetype: 'romantic' })
    expect(step?.stage).to.equal('NOVICE')
  })

  it('advances stage as level increases', () => {
    expect(resolveStage(8, { archetype: 'romantic' })?.stage).to.equal('BEGINNER')
    expect(resolveStage(16, { archetype: 'romantic' })?.stage).to.equal('GIRLFRIEND')
    expect(resolveStage(40, { archetype: 'romantic' })?.stage).to.equal('MARRIED')
    expect(resolveStage(999, { archetype: 'romantic' })?.stage).to.equal('MARRIED')
  })

  it('different archetypes diverge to different terminal stages', () => {
    expect(resolveStage(999, { archetype: 'romantic' })?.stage).to.equal('MARRIED')
    expect(resolveStage(999, { archetype: 'submissive' })?.stage).to.equal('BDSM/SLAVE')
    expect(resolveStage(999, { archetype: 'dominant' })?.stage).to.equal('BDSM/DOMINATRIX')
  })

  it('casual archetype never marries', () => {
    const stages = ARCHETYPES.find((a) => a.id === 'casual')!.steps.map((s) => s.stage)
    expect(stages).to.not.include('MARRIED')
    expect(resolveStage(999, { archetype: 'casual' })?.stage).to.equal('HARDCORE')
  })

  it('returns no steps for an unknown archetype id (no fallback)', () => {
    // An unknown/removed archetype id resolves to no progression — the character
    // is treated as fixed, never silently falling back to a default archetype.
    expect(getProgressionSteps({ archetype: 'does-not-exist' })).to.deep.equal([])
  })

  it('honours a fully custom map over the archetype', () => {
    const step = resolveStage(5, {
      archetype: 'romantic',
      map: [
        { minLevel: 1, stage: 'NOVICE' },
        { minLevel: 3, stage: 'HARDCORE' },
      ],
    })
    expect(step?.stage).to.equal('HARDCORE')
  })

  it('returns no steps when disabled', () => {
    expect(getProgressionSteps({ disabled: true })).to.have.length(0)
    expect(resolveStage(50, { disabled: true })).to.equal(undefined)
  })

  it('formats the bare LEVEL token (definition disabled)', () => {
    expect(formatStageToken({ minLevel: 1, stage: 'LOVER' }, false)).to.equal('LEVEL("LOVER")')
    expect(formatStageToken({ minLevel: 1, stage: 'LOVER', note: 'hi' }, false)).to.equal(
      'LEVEL("LOVER") hi'
    )
  })

  it('injects the dataset stage definition by default', () => {
    const out = formatStageToken({ minLevel: 1, stage: 'HARDCORE' })
    expect(out).to.contain('LEVEL("HARDCORE")')
    expect(out.toLowerCase()).to.contain('wild')
  })

  it('every archetype stage has a dataset definition', () => {
    for (const a of ARCHETYPES) {
      for (const s of a.steps) {
        expect(STAGE_DEFINITIONS[s.stage], `${a.id}:${s.stage}`).to.be.a('string')
      }
    }
  })
})
