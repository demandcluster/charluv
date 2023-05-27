import { Router } from 'express'
import { assertValid } from 'frisker'
import { store } from '../db'

import { loggedIn, isAdmin } from './auth'
import { errors, handle, StatusError } from './wrap'
import { entityUpload, handleForm } from './upload'
import { PERSONA_FORMATS } from '../../common/adapters'
import { AppSchema } from '../db/schema'
import { CharacterUpdate } from '../db/characters'
import { getVoiceService } from '../voice'
import { generateImage } from '../image'
import { v4 } from 'uuid'

const router = Router()

const characterValidator = {
  name: 'string?',
  description: 'string?',
  culture: 'string?',
  avatar: 'string?',
  scenario: 'string?',
  greeting: 'string?',
  sampleChat: 'string?',
  persona: 'string?',
  favorite: 'boolean?',
  voice: 'string?',
  tags: 'string?',
} as const

const newCharacterValidator = {
  ...characterValidator,
  name: 'string',
  scenario: 'string',
  greeting: 'string',
  sampleChat: 'string',
  xp: 'string',
  match: 'string',
  premium: 'string',
  anime: 'string',
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
  const voice = parseAndValidateVoice(body.voice)
  const tags = toArray(body.tags)

  const char = await store.characters.createCharacter(req.user?.userId!, {
    name: body.name,
    persona,
    premium: body.premium.toString() === 'true',
    xp: 0,
    match: false,
    anime: body.anime.toString() === 'true' || false,
    sampleChat: body.sampleChat,
    description: body.description,
    culture: body.culture,
    scenario: body.scenario,
    greeting: body.greeting,
    avatar: body.originalAvatar,
    favorite: false,
    voice,
    tags,
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

  const update: CharacterUpdate = {
    name: body.name,
    description: body.description,
    culture: body.culture,
    greeting: body.greeting,
    scenario: body.scenario,
    sampleChat: body.sampleChat,
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
router.post('/', isAdmin, createCharacter)
router.get('/', getCharacters)
router.post('/image', isAdmin, createImage)
router.post('/:id', isAdmin, editCharacter)
router.get('/:id', getCharacter)
router.delete('/:id', deleteCharacter)
router.post('/:id/favorite', editCharacterFavorite)
router.delete('/:id/avatar', removeAvatar)

export default router

function toArray(value?: string) {
  const parsed = tryParse(value)
  if (!parsed) return

  assertValid({ parsed: ['string'] }, { parsed })
  return parsed
}

function tryParse(value?: any) {
  if (!value) return
  try {
    const obj = JSON.parse(value)
    return obj
  } catch (ex) {}
}
