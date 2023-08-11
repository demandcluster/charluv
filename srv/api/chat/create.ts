import { assertValid } from '/common/valid'
import { PERSONA_FORMATS } from '../../../common/adapters'
import { store } from '../../db'
import { NewMessage } from '../../db/messages'
import { handle, StatusError } from '../wrap'
import XPLevel from '../../../common/xplevel'

export const createChat = handle(async ({ body, user, userId }) => {
  assertValid(
    {
      genPreset: 'string?',
      characterId: 'string',
      name: 'string',
      mode: ['standard', 'adventure', 'companion', null],
      greeting: 'string?',
      scenario: 'string?',
      sampleChat: 'string?',
      overrides: { '?': 'any?', kind: PERSONA_FORMATS, attributes: 'any' },
      useOverrides: 'boolean?',
      scenarioId: 'string?',
      scenarioStates: 'string?',
    },
    body
  )

  if (body.scenarioId) {
    const scenario = await store.scenario.getScenario(body.scenarioId)
    // if (scenario?.userId !== userId)
    //   throw new StatusError('You do not have access to this scenario', 403)
  }

  const character = await store.characters.getCharacter(userId, body.characterId)

  let scenarios: string[] = []
  let lvl: string[] = []
  if (character?.scenarioIds) {
    scenarios = character.scenarioIds
    lvl.push(`LEVEL${XPLevel(character?.xp as number)}`)
    if (user?.premium) {
      lvl.push(`PREMIUM`)
    }
  } else {
    scenarios = body.scenarioId !== undefined ? [body.scenarioId] : []
  }

  const chat = await store.chats.create(body.characterId, {
    ...body,
    greeting: body.greeting ?? character?.greeting,
    userId: user?.userId!,
    scenarioIds: scenarios,
    scenarioStates: lvl,
  })
  return chat
})
// tes
export const importChat = handle(async ({ body, userId }) => {
  assertValid(
    {
      characterId: 'string',
      name: 'string',
      greeting: 'string?',
      scenario: 'string?',
      scenarioId: 'string?',
      messages: [
        {
          msg: 'string',
          characterId: 'string?',
          userId: 'string?',
          handle: 'string?',
          ooc: 'boolean?',
        },
      ],
    },
    body
  )

  /** Do not throw on a bad scenario import */
  if (body.scenarioId) {
    const scenario = await store.scenario.getScenario(body.scenarioId)
    if (scenario?.userId !== userId) {
      body.scenarioId = undefined
    }
  }

  const character = await store.characters.getCharacter(userId!, body.characterId)
  if (!character) {
    throw new StatusError(`Character not found`, 404)
  }

  const chat = await store.chats.create(body.characterId, {
    name: body.name,
    greeting: body.greeting ?? character.greeting,
    scenario: body.scenario,
    overrides: character.persona,
    sampleChat: '',
    userId,
    scenarioIds: body.scenarioId ? [body.scenarioId] : [],
  })

  const messages = body.messages.map<NewMessage>((msg) => ({
    chatId: chat._id,
    message: msg.msg,
    adapter: 'import',
    characterId: msg.characterId ? character._id : undefined,
    senderId: msg.userId ? msg.userId : undefined,
    handle: msg.handle,
    ooc: msg.ooc ?? false,
    event: undefined,
  }))

  await store.msgs.importMessages(userId, messages)

  return chat
})
