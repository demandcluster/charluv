import { assertValid } from '/common/valid'
import { PERSONA_FORMATS } from '../../../common/adapters'
import { buildEventScenario } from '../../../common/event'
import { store } from '../../db'
import { NewMessage } from '../../db/messages'
import { handle, StatusError } from '../wrap'

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
      impersonating: 'string?',
      imageSource: 'string?',
    },
    body
  )

  const character = await store.characters.getCharacter(userId, body.characterId)
  const profile = await store.users.getProfile(userId)
  const impersonating = body.impersonating
    ? await store.characters.getCharacter(userId, body.impersonating)
    : undefined

  const chat = await store.chats.create(
    body.characterId,
    {
      ...body,
      imageSource: body.imageSource as any,
      greeting: body.greeting ?? character?.greeting,
      userId: user?.userId!,
      scenarioIds: [],
      scenarioStates: [],
    },
    profile!,
    impersonating
  )
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
          retries: ['string?'],
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

  const profile = await store.users.getProfile(userId)

  const chat = await store.chats.create(
    body.characterId,
    {
      name: body.name,
      greeting: body.greeting ?? character.greeting,
      scenario: body.scenario,
      overrides: character.persona,
      sampleChat: '',
      userId,
      scenarioIds: body.scenarioId ? [body.scenarioId] : [],
    },
    profile!
  )

  const messages = body.messages.map<NewMessage>((msg) => ({
    chatId: chat._id,
    message: msg.msg,
    adapter: 'import',
    characterId: msg.characterId ? character._id : undefined,
    senderId: msg.userId ? msg.userId : undefined,
    handle: msg.handle,
    ooc: msg.ooc ?? false,
    retries: character.alternateGreetings,
    event: undefined,
    name: character.name,
  }))

  await store.msgs.importMessages(userId, messages)

  return chat
})

export const createEventChat = handle(async ({ body, user, userId }) => {
  assertValid({ location: 'string', description: 'string', characterIds: ['string'] }, body)

  const chars = (
    await Promise.all(
      body.characterIds.map((id: string) => store.characters.getCharacter(userId, id))
    )
  ).filter(Boolean)

  if (chars.length === 0) throw new StatusError('Invite at least one character', 400)

  const profile = await store.users.getProfile(userId)

  const scenario = buildEventScenario({
    location: body.location,
    description: body.description,
    names: chars.map((c) => c!.name),
  })

  const characters: Record<string, boolean> = {}
  for (const c of chars) characters[c!._id] = true

  const chat = await store.chats.create(
    chars[0]!._id,
    {
      name: `${body.location} — ${body.description}`.slice(0, 80),
      userId: userId!,
      mode: 'event',
      event: { location: body.location, description: body.description },
      memoryDisabled: true,
      scenario,
      overrides: chars[0]!.persona,
      // No char-attributed greeting: the opening is a neutral scene line (below)
      // so no single character "owns" the intro. The director then opens the scene.
      characters,
      memberIds: [],
      scenarioIds: [],
      scenarioStates: [],
    },
    profile!
  )

  // Scene-setting narration shown as a world event (no characterId → not owned by
  // any character). The director elects who speaks first when the chat is opened.
  await store.msgs.createChatMessage({
    chatId: chat._id,
    message: `You arrive at ${body.location}. ${body.description}.`,
    ooc: false,
    event: 'world',
    name: undefined,
  })

  const updated = await store.chats.update(chat._id, { messageCount: 1 })
  return updated || chat
})
