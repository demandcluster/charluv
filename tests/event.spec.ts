import { expect } from 'chai'
import './init'
import {
  EVENT_TURN_COST,
  EVENT_MAX_REPLIES,
  buildEventScenario,
  buildSpeakerSchema,
  buildDirectorPrompt,
} from '/common/event'

describe('Event helpers', () => {
  it('exposes the fixed economy/cap constants', () => {
    expect(EVENT_TURN_COST).to.equal(25)
    expect(EVENT_MAX_REPLIES).to.equal(3)
  })

  it('builds a scene block naming the location, description and attendees', () => {
    const actual = buildEventScenario({
      location: 'nightclub',
      description: 'Saturday DJ night',
      names: ['Mia', 'Jade'],
    })
    expect(actual).to.equal('Setting: nightclub. Event: Saturday DJ night. Present: Mia, Jade.')
  })

  it('constrains the speaker schema to present ids plus none', () => {
    const schema: any = buildSpeakerSchema(['a', 'b'])
    expect(schema.properties.speaker.enum).to.deep.equal(['a', 'b', 'none'])
    expect(schema.required).to.deep.equal(['speaker'])
  })

  it('includes the roster names and the addressing rule in the director prompt', () => {
    const prompt = buildDirectorPrompt({
      event: { location: 'bar', description: 'after work drinks' },
      roster: [{ id: 'a', name: 'Mia', hook: 'flirty bartender' }],
      recent: [{ name: 'You', text: 'Hey Mia' }],
      repliedThisTurn: [],
    })
    expect(prompt).to.contain('Mia')
    expect(prompt).to.contain('bar')
    expect(prompt.toLowerCase()).to.contain('none')
  })
})
