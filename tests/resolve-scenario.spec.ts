import { expect } from 'chai'
import './init'
import { entities, toPersona } from './util'
import { resolveScenario } from '/common/prompt'

const { chat, main, scenarioBook } = entities

describe('Resolve scenario', () => {
  it('will use main character scenario when chat does not override characters', () => {
    const actual = resolveScenario(
      { ...chat, scenario: undefined, overrides: undefined },
      { ...main, scenario: 'Main char scenario' },
      []
    )
    expect(actual).to.equal('Main char scenario')
  })

  it('will use chat scenario when chat override is on', () => {
    const actual = resolveScenario(
      { ...chat, scenario: 'Chat scenario', overrides: toPersona('Chat persona') },
      { ...main, scenario: 'Main char scenario' },
      []
    )
    expect(actual).to.equal('Chat scenario')
  })

  it('ignores attached scenario books (the feature is disabled)', () => {
    const book = { ...scenarioBook, text: 'Additional scenario' }
    const actual = resolveScenario(
      { ...chat, scenario: undefined, overrides: undefined },
      { ...main, scenario: 'Main char scenario' },
      [book]
    )
    expect(actual).to.equal('Main char scenario')
  })

  it('will not append additional scenarios to the overriding chat scenario', () => {
    const book = { ...scenarioBook, text: 'Additional scenario' }
    const actual = resolveScenario(
      { ...chat, scenario: 'Chat scenario', overrides: toPersona('Chat persona') },
      { ...main, scenario: 'Main char scenario' },
      [book]
    )
    expect(actual).to.equal('Chat scenario')
  })

  it('ignores the overwrite flag on scenario books (the feature is disabled)', () => {
    const book = { ...scenarioBook, text: 'Overwritten scenario', overwriteCharacterScenario: true }
    const actual = resolveScenario(
      { ...chat, scenario: undefined, overrides: undefined },
      { ...main, scenario: 'Main char scenario' },
      [book]
    )
    expect(actual).to.equal('Main char scenario')
  })

  it('will not overwrite chat scenario when override is on and the additional scenario has overwrite flag', () => {
    const book = { ...scenarioBook, text: 'Overwritten scenario', overwriteCharacterScenario: true }
    const actual = resolveScenario(
      { ...chat, scenario: 'Chat scenario', overrides: toPersona('Chat persona') },
      { ...main, scenario: 'Main char scenario' },
      [book]
    )
    expect(actual).to.equal('Chat scenario')
  })

  it('uses the replying character for the progression stage when provided', () => {
    const speaker = {
      ...main,
      name: 'Speaker',
      progression: { kind: 'archetype', archetype: 'romantic' } as any,
      xp: 100000,
    }
    const withSpeaker = resolveScenario(
      { ...chat, scenario: undefined, overrides: undefined },
      { ...main, scenario: 'Scene', progression: undefined },
      [],
      speaker as any
    )
    const withoutSpeaker = resolveScenario(
      { ...chat, scenario: undefined, overrides: undefined },
      { ...main, scenario: 'Scene', progression: undefined },
      []
    )
    // The speaker has a progression archetype + XP, so its stage token is prepended.
    expect(withSpeaker).to.contain('LEVEL(')
    // The main char has no progression, so without a speaker no token appears.
    expect(withoutSpeaker).to.not.contain('LEVEL(')
  })
})
