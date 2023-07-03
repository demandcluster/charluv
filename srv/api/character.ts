import { Router } from 'express'
import { assertValid } from '/common/valid'
import { store } from '../db'

import { loggedIn, isAdmin } from './auth'
import { errors, handle, StatusError } from './wrap'
import { entityUpload, handleForm } from './upload'
import { PERSONA_FORMATS } from '../../common/adapters'
import { AppSchema } from '../../common/types/schema'
import { CharacterUpdate } from '../db/characters'
import { getVoiceService } from '../voice'
import { generateImage } from '../image'
import { v4 } from 'uuid'
import { validBook } from './memory'
import { isObject } from '/common/util'

const router = Router()

const characterValidator = {
  name: 'string?',
  description: 'string?',
  appearance: 'string?',
  culture: 'string?',

  visualType: 'string?',
  sprite: 'any?',
  avatar: 'string?',

  scenario: 'string?',
  greeting: 'string?',
  sampleChat: 'string?',
  persona: 'string?',
  xp: 'string?',
  match: 'string?',
  share: 'string?',
  premium: 'string?',
  favorite: 'boolean?',
  voice: 'string?',
  tags: 'string?',

  // v2 fields start here
  alternateGreetings: 'string?',
  characterBook: 'string?',
  extensions: 'string?',
  systemPrompt: 'string?',
  postHistoryInstructions: 'string?',
  creator: 'string?',
  characterVersion: 'string?',
} as const

const newCharacterValidator = {
  ...characterValidator,
  name: 'string',
  scenario: 'string',
  greeting: 'string',
  sampleChat: 'string',
  xp: 'string?',
  match: 'string?',
  premium: 'string?',
  share: 'string?',
  persona: 'string',
  originalAvatar: 'string?',
} as const

const personaValidator = {
  kind: PERSONA_FORMATS,
  attributes: 'any',
} as const

const createCharacter = handle(async (req) => {
  const body = handleForm(req, newCharacterValidator)
  const persona = JSON.parse(body.persona) as AppSchema.Persona
  assertValid(personaValidator, persona)

  const sprite = body.sprite ? JSON.parse(body.sprite) : undefined
  const voice = parseAndValidateVoice(body.voice)
  const tags = toArray(body.tags)
  const alternateGreetings = body.alternateGreetings ? toArray(body.alternateGreetings) : undefined

  const characterBook = body.characterBook ? JSON.parse(body.characterBook) : undefined
  if (characterBook !== undefined) {
    assertValid(validBook, characterBook)
  }

  const extensions = body.extensions ? JSON.parse(body.extensions) : undefined
  if (!isObject(extensions) && extensions !== undefined) {
    throw new StatusError('Character `extensions` field must be an object or undefined.', 400)
  }
  const user = await store.users.getUser(req.userId!)
  if (user?.credits && user?.credits < 50) {
    throw new StatusError('Not enough credits', 400)
  }
  await store.credits.updateCredits(req.userId!, -50)

  const char = await store.characters.createCharacter(req.user?.userId!, {
    name: body.name,
    persona,
    premium: !!body.premium,
    xp: 0,
    match: body.match?.toString() === 'true' || false,
    share: body.share,
    sampleChat: body.sampleChat,
    description: body.description,
    appearance: body.appearance,
    culture: body.culture,
    scenario: body.scenario,
    greeting: body.greeting,
    visualType: body.visualType,
    sprite,
    avatar: body.originalAvatar,
    favorite: false,
    voice,
    tags,
    alternateGreetings,
    characterBook,
    systemPrompt: body.systemPrompt,
    postHistoryInstructions: body.postHistoryInstructions,
    creator: body.creator,
    characterVersion: body.characterVersion,
  })

  const filename = await entityUpload(
    'char',
    char._id,
    body.attachments.find((a) => a.field === 'avatar')
  )

  if (filename) {
    await store.characters.updateCharacter(char._id, req.userId, { avatar: filename })
    char.avatar = filename
  }

  return char
})

const getCharacters = handle(async ({ userId }) => {
  const chars = await store.characters.getCharacters(userId!)
  return { characters: chars }
})

const editCharacter = handle(async (req) => {
  const id = req.params.id
  const body = handleForm(req, characterValidator)
  const alternateGreetings = body.alternateGreetings ? toArray(body.alternateGreetings) : undefined
  const characterBook = body.characterBook ? JSON.parse(body.characterBook) : undefined
  if (characterBook !== undefined) {
    assertValid(validBook, characterBook)
  }
  const extensions = body.extensions ? JSON.parse(body.extensions) : undefined
  if (!isObject(extensions) && extensions !== undefined) {
    throw new StatusError('Character `extensions` field must be an object or undefined.', 400)
  }

  const update: CharacterUpdate = {
    name: body.name,
    description: body.description,
    appearance: body.appearance,
    culture: body.culture,
    greeting: body.greeting,
    scenario: body.scenario,
    sampleChat: body.sampleChat,
    visualType: body.visualType,
    sprite: body.sprite ? JSON.parse(body.sprite) : undefined,
    alternateGreetings,
    characterBook: characterBook ?? null,
    systemPrompt: body.systemPrompt,
    postHistoryInstructions: body.postHistoryInstructions,
    creator: body.creator,
    characterVersion: body.characterVersion,
    match: body.match?.toString() === 'true' || false,
    premium: body.premium?.toString() === 'true' || false,
    xp: body.xp ? parseInt(body.xp) : 0,
    share: body.share || 'private',
  }

  if (body.persona) {
    const persona = JSON.parse(body.persona) as AppSchema.Persona
    assertValid(personaValidator, persona)
    update.persona = persona
  }

  if (body.voice) {
    update.voice = parseAndValidateVoice(body.voice)
  }

  if (body.tags) {
    update.tags = toArray(body.tags)
  }

  const filename = await entityUpload(
    'char',
    id,
    body.attachments.find((a) => a.field === 'avatar')
  )
  if (filename) {
    update.avatar = filename + `?v=${v4().slice(0, 4)}`
  }

  const user = await store.users.getUser(req.userId!)
  if (user?.credits && user?.credits < 20) {
    throw new StatusError('Not enough credits', 400)
  }
  await store.credits.updateCredits(req.userId!, -20)

  const char = await store.characters.updateCharacter(id, req.userId!, update)

  return char
})

const removeAvatar = handle(async ({ userId, params }) => {
  const char = await store.characters.getCharacter(userId, params.id)
  if (!char) throw errors.NotFound

  await store.characters.updateCharacter(params.id, userId, { avatar: '' })
  return { ...char, avatar: '' }
})

const getCharacter = handle(async ({ userId, params }) => {
  const char = await store.characters.getCharacter(userId!, params.id)
  if (!char) {
    throw new StatusError('Character not found', 404)
  }
  return char
})

const deleteCharacter = handle(async ({ userId, params }) => {
  const id = params.id
  await store.characters.deleteCharacter({ userId: userId!, charId: id })
  return { success: true }
})

const editCharacterFavorite = handle(async (req) => {
  const id = req.params.id
  const favorite = req.body.favorite === true

  const char = await store.characters.updateCharacter(id, req.userId!, {
    favorite: favorite,
  })

  return char
})

function parseAndValidateVoice(json?: string) {
  if (!json) return
  const obj = JSON.parse(json)
  if (!obj) return
  if (!obj.service) return { service: undefined }
  const service = getVoiceService(obj.service)

  if (!service) return

  assertValid(service.validator, obj)
  return obj as unknown as AppSchema.Character['voice']
}

export const createImage = handle(async ({ body, userId, socketId, log }) => {
  assertValid({ user: 'any?', prompt: 'string', ephemeral: 'boolean?' }, body)
  const user = userId ? await store.users.getUser(userId) : body.user

  const guestId = userId ? undefined : socketId
  generateImage(
    {
      user,
      prompt: body.prompt,
      ephemeral: body.ephemeral,
    },
    log,
    guestId
  )
  return { success: true }
})

router.use(loggedIn)
router.post('/', loggedIn, createCharacter)
router.get('/', getCharacters)
router.post('/image', loggedIn, createImage)
router.post('/:id', loggedIn, editCharacter)
router.get('/:id', getCharacter)
router.delete('/:id', loggedIn, deleteCharacter)
router.post('/:id/favorite', editCharacterFavorite)
router.delete('/:id/avatar', removeAvatar)

export default router

function toArray(value?: string) {
  if (!value) return []

  if (Array.isArray(value)) return value.filter((v) => typeof v === 'string')

  const parsed = tryParse(value)
  if (Array.isArray(parsed)) return parsed.filter((v) => typeof v === 'string')
  if (typeof parsed === 'string') return []

  if (!parsed) return []
}

function tryParse(value?: any) {
  if (!value) return
  try {
    const obj = JSON.parse(value)
    return obj
  } catch (ex) {}
}
