import { v4 } from 'uuid'
import { AppSchema } from '../../../common/types/schema'
import { api, isLoggedIn } from '../api'
import { NewCharacter, UpdateCharacter } from '../character'
import { loadItem, localApi } from './storage'
import { appendFormOptional, strictAppendFormOptional } from '/web/shared/util'
import { getImageData } from './image'
import { replace } from '/common/util'
import { TickHandler } from '/common/prompt'
import { rootModalStore } from '../root-modal'
import { genApi } from './inference'

export const charsApi = {
  getCharacterDetail,
  getCharacters,
  getDraft,
  removeAvatar,
  editAvatar,
  deleteCharacter,
  editCharacter,
  editPartialCharacter,
  createCharacter,
  importCharacter,
  getImageBuffer: getFileBuffer,
  setFavorite,
  publishCharacter,
  getPublishStatus,
  reportCharacter,
  addGalleryImage,
  removeGalleryImage,
  setCover,
  encodeLora,
  listMemories,
  addMemory,
  deleteMemory,
}

/** A stored long-term memory (the new "remember" system), without its vector. */
export type CharacterMemory = {
  _id: string
  userId: string
  characterId: string
  text: string
  source: 'tool' | 'auto' | 'manual'
  createdAt: string
}

async function listMemories(charId: string) {
  return api.get<{ memories: CharacterMemory[] }>(`/character/${charId}/memories`)
}

async function addMemory(charId: string, text: string) {
  return api.post<{ memories: CharacterMemory[] }>(`/character/${charId}/memories`, { text })
}

async function deleteMemory(charId: string, memId: string) {
  return api.method<{ memories: CharacterMemory[] }>(
    'delete',
    `/character/${charId}/memories/${memId}`
  )
}

/** Add an image (base64 data url) to a saved character's reference gallery. */
async function addGalleryImage(charId: string, image: string) {
  return api.post<{ gallery: string[] }>(`/character/${charId}/gallery`, { image })
}

async function removeGalleryImage(charId: string, url: string) {
  return api.method<{ gallery: string[] }>('delete', `/character/${charId}/gallery`, { url })
}

/** Set a saved character's cover (avatar) to one of its existing images. */
async function setCover(charId: string, url: string) {
  return api.post<{ avatar: string }>(`/character/${charId}/cover`, { url })
}

/** Encode 1-4 reference images (base64 data urls) into a stored character LoRA. */
async function encodeLora(charId: string, images: string[]) {
  return api.post<{ loraName: string }>(`/character/${charId}/encode-lora`, { images })
}

async function getCharacterDetail(charId: string) {
  if (isLoggedIn()) {
    const res = await api.get(`/character/${charId}`)
    return res
  }

  const chars = await loadItem('characters')
  const char = chars.find((ch) => ch._id === charId)

  if (char) {
    return localApi.result(char)
  } else {
    return localApi.error(`Character not found`)
  }
}

/**
 * Kick off publishing a saved character. The HTTP call only starts the
 * (streamed) moderation; the accept/reject verdict arrives over the socket as a
 * `publish-response` keyed by the returned requestId.
 */
async function publishCharacter(characterId: string, image?: string) {
  const requestId = v4()
  const res = await api.post('/character/publish', { characterId, imageData: image, requestId })
  return { res, requestId }
}

export type PublishStatus = {
  enabled: boolean
  cap: number
  used: number
  remaining: number
  reward: number
  guidelines: string
  mins: { greeting: number; description: number; scenario: number; personality: number }
}

/** Remaining publishes today + caps/reward, for the Make-Public modal. */
async function getPublishStatus() {
  return api.get<PublishStatus>('/character/publish/status')
}

/** Report a published character. One report per user per character. */
async function reportCharacter(charId: string, reason: string, note?: string) {
  return api.post(`/character/${charId}/report`, { reason, note })
}

// Fetch the user's unfinished wizard draft (or null) so Create can resume it.
export async function getDraft() {
  if (!isLoggedIn()) return localApi.result({ character: null })
  return api.get<{ character: AppSchema.Character | null }>('/character/draft')
}

export async function getCharacters() {
  if (isLoggedIn()) {
    const res = await api.get('/character')
    return res
  }

  const characters = await localApi.loadItem('characters')
  const result = characters.map((ch) => ({
    _id: ch._id,
    name: ch.name,
    description: ch.description,
    tags: ch.tags,
    avatar: ch.avatar,
    favorite: ch.favorite,
    userId: ch.userId,
    createdAt: ch.createdAt,
    updatedAt: ch.updatedAt,
  }))
  return localApi.result({ characters: result })
}

export async function removeAvatar(charId: string) {
  if (isLoggedIn()) {
    const res = await api.method('delete', `/character/${charId}/avatar`)
    return res
  }

  const chars = await loadItem('characters').then((res) =>
    res.map((ch) => {
      if (ch._id !== charId) return ch
      return { ...ch, avatar: '' }
    })
  )

  await localApi.saveChars(chars)
  return localApi.result(chars.filter((ch) => ch._id === charId))
}

export async function editAvatar(charId: string, file: File) {
  if (isLoggedIn()) {
    const form = new FormData()
    form.append('avatar', file)

    const res = await api.upload(`/character/${charId}`, form)
    return res
  }

  const avatar = await getImageData(file)
  const chars = await loadItem('characters')

  const prev = chars.find((ch) => ch._id === charId)

  if (!prev) {
    return { result: undefined, error: `Character not found` }
  }

  const nextChar = { ...prev, avatar: avatar || prev.avatar }
  const next = chars.map((ch) => (ch._id === charId ? nextChar : ch))
  await localApi.saveChars(next)

  return localApi.result(nextChar)
}

export async function deleteCharacter(charId: string) {
  if (isLoggedIn()) {
    const res = api.method('delete', `/character/${charId}`)
    return res
  }

  const chars = await loadItem('characters')
  const chats = await loadItem('chats')

  const next = {
    chars: chars.filter((ch) => ch._id !== charId),
    chats: chats.filter((ch) => {
      if (ch.characterId !== charId) return true
      localApi.deleteChatMessages(ch._id)
      return false
    }),
  }

  await localApi.saveChars(next.chars)
  await localApi.saveChats(next.chats)

  return { result: true, error: undefined }
}

export async function editPartialCharacter(charId: string, update: Partial<AppSchema.Character>) {
  if (isLoggedIn()) {
    const res = await api.post<AppSchema.Character>(`/character/${charId}/update`, update)
    return res
  }

  const chars = await loadItem('characters')
  const next = replace(charId, chars, update)

  const nextChar = next.find((ch) => ch._id === charId)

  if (!nextChar) {
    return localApi.error(`Character update failed: Character not found`)
  }

  await localApi.saveChars(next)
  return localApi.result(nextChar)
}

export async function editCharacter(
  charId: string,
  { avatar: file, ...char }: UpdateCharacter,
  previous?: AppSchema.Character
) {
  if (isLoggedIn()) {
    const form = new FormData()
    appendFormOptional(form, 'name', char.name)
    strictAppendFormOptional(form, 'greeting', char.greeting)
    strictAppendFormOptional(form, 'scenario', char.scenario)
    appendFormOptional(form, 'appearance', char.appearance)
    appendFormOptional(form, 'match', char.match)
    appendFormOptional(form, 'xp', char.xp)
    appendFormOptional(form, 'premium', char.premium)
    appendFormOptional(form, 'share', char.share)
    appendFormOptional(form, 'progression', JSON.stringify((char as any).progression))
    appendFormOptional(form, 'gender', (char as any).gender)
    appendFormOptional(form, 'artStyle', (char as any).artStyle)
    appendFormOptional(form, 'ageRange', (char as any).ageRange)
    appendFormOptional(form, 'category', (char as any).category || [], JSON.stringify)
    appendFormOptional(form, 'nsfw', (char as any).nsfw)
    appendFormOptional(form, 'loraName', (char as any).loraName)
    appendFormOptional(form, 'imageSeed', (char as any).imageSeed)

    appendFormOptional(form, 'persona', JSON.stringify(char.persona))
    strictAppendFormOptional(form, 'description', char.description || '')
    appendFormOptional(form, 'culture', char.culture)
    appendFormOptional(form, 'tags', char.tags || [], JSON.stringify)
    strictAppendFormOptional(form, 'sampleChat', char.sampleChat)
    appendFormOptional(form, 'voice', JSON.stringify(char.voice))
    appendFormOptional(form, 'json', JSON.stringify(char.json))

    if (file) {
      appendFormOptional(form, 'avatar', file)
    }

    appendFormOptional(form, 'visualType', char.visualType)
    appendFormOptional(form, 'sprite', JSON.stringify(char.sprite))
    appendFormOptional(form, 'imageSettings', JSON.stringify(char.imageSettings))

    // v2 fields start here
    appendFormOptional(form, 'alternateGreetings', char.alternateGreetings, JSON.stringify)
    appendFormOptional(form, 'characterBook', char.characterBook, JSON.stringify)
    appendFormOptional(form, 'extensions', char.extensions, JSON.stringify)
    appendFormOptional(form, 'insert', char.insert, JSON.stringify)
    strictAppendFormOptional(form, 'systemPrompt', char.systemPrompt)
    strictAppendFormOptional(form, 'postHistoryInstructions', char.postHistoryInstructions)
    strictAppendFormOptional(form, 'creator', char.creator)
    strictAppendFormOptional(form, 'characterVersion', char.characterVersion)
    appendFormOptional(form, 'voiceDisabled', char.voiceDisabled)

    const res = await api.upload(`/character/${charId}`, form)
    return res
  }

  const avatar = file ? await getImageData(file) : undefined
  const chars = await loadItem('characters')
  const prev = chars.find((ch) => ch._id === charId)

  if (!prev) {
    return { result: undefined, error: `Character not found` }
  }

  const nextChar = { ...prev, ...char, avatar: avatar || prev.avatar }
  const next = chars.map((ch) => (ch._id === charId ? nextChar : ch))
  await localApi.saveChars(next)

  return { result: nextChar, error: undefined }
}

export async function setFavorite(charId: string, favorite: boolean) {
  if (isLoggedIn()) {
    const res = await api.post(`/character/${charId}/favorite`, { favorite: favorite })
    return res
  }

  const chars = await loadItem('characters')
  const prev = chars.find((ch) => ch._id === charId)

  if (!prev) {
    return { result: undefined, error: `Character not found` }
  }

  const nextChar = { ...prev, favorite: favorite }
  const next = chars.map((ch) => (ch._id === charId ? nextChar : ch))
  await localApi.saveChars(next)

  return { result: nextChar, error: undefined }
}

function buildCharacterForm(char: NewCharacter) {
  const form = new FormData()
  form.append('name', char.name)
  form.append('greeting', char.greeting)
  form.append('scenario', char.scenario)
  form.append('sampleChat', char.sampleChat)
  appendFormOptional(form, 'persona', char.persona, JSON.stringify)
  appendFormOptional(form, 'description', char.description)
  appendFormOptional(form, 'appearance', char.appearance)
  appendFormOptional(form, 'culture', char.culture)
  appendFormOptional(form, 'voice', char.voice, JSON.stringify)
  appendFormOptional(form, 'tags', char.tags, JSON.stringify)
  appendFormOptional(form, 'avatar', char.avatar)
  appendFormOptional(form, 'xp', char.xp)
  appendFormOptional(form, 'match', char.match)
  appendFormOptional(form, 'premium', char.premium)
  appendFormOptional(form, 'share', char.share)
  appendFormOptional(form, 'draft', (char as any).draft)
  appendFormOptional(form, 'progression', JSON.stringify((char as any).progression))
  appendFormOptional(form, 'gender', (char as any).gender)
  appendFormOptional(form, 'artStyle', (char as any).artStyle)
  appendFormOptional(form, 'ageRange', (char as any).ageRange)
  appendFormOptional(form, 'category', (char as any).category || [], JSON.stringify)
  appendFormOptional(form, 'nsfw', (char as any).nsfw)
  appendFormOptional(form, 'loraName', (char as any).loraName)
  appendFormOptional(form, 'imageSeed', (char as any).imageSeed)
  appendFormOptional(form, 'originalAvatar', char.originalAvatar)
  appendFormOptional(form, 'visualType', char.visualType)
  appendFormOptional(form, 'sprite', JSON.stringify(char.sprite))
  appendFormOptional(form, 'imageSettings', JSON.stringify(char.imageSettings))
  appendFormOptional(form, 'json', JSON.stringify(char.json))

  // v2 fields start here
  appendFormOptional(form, 'alternateGreetings', char.alternateGreetings, JSON.stringify)
  appendFormOptional(form, 'characterBook', char.characterBook, JSON.stringify)
  appendFormOptional(form, 'extensions', char.extensions, JSON.stringify)
  appendFormOptional(form, 'insert', char.insert, JSON.stringify)
  appendFormOptional(form, 'systemPrompt', char.systemPrompt)
  appendFormOptional(form, 'postHistoryInstructions', char.postHistoryInstructions)
  appendFormOptional(form, 'creator', char.creator)
  appendFormOptional(form, 'characterVersion', char.characterVersion)
  appendFormOptional(form, 'voiceDisabled', char.voiceDisabled)
  return form
}

async function createCharacterLocal(char: NewCharacter) {
  const { avatar: file, ...props } = char
  const avatar = file
    ? await getImageData(file)
    : char.originalAvatar
    ? char.originalAvatar
    : undefined

  const newChar: AppSchema.Character = { ...props, ...baseChar(), avatar, _id: v4() }

  const chars = await loadItem('characters')
  const next = chars.concat(newChar)
  await localApi.saveChars(next)

  return { result: newChar, error: undefined }
}

export async function createCharacter(char: NewCharacter) {
  if (isLoggedIn()) {
    return api.upload<AppSchema.Character>(`/character`, buildCharacterForm(char))
  }
  return createCharacterLocal(char)
}

// Imports go to a distinct server route that never charges the creation fee.
// The no-charge decision is the route itself — not a client-supplied flag — so
// it can't be abused to dodge the charge on a generated character.
export async function importCharacter(char: NewCharacter) {
  if (isLoggedIn()) {
    return api.upload<AppSchema.Character>(`/character/import`, buildCharacterForm(char))
  }
  return createCharacterLocal(char)
}

export async function getFileBuffer(file?: File) {
  if (!file) return
  const reader = new FileReader()

  return new Promise<Buffer>((resolve, reject) => {
    reader.readAsArrayBuffer(file)

    reader.onload = (evt) => {
      if (!evt.target?.result) return reject(new Error(`Failed to process file`))
      resolve(Buffer.from(evt.target.result as ArrayBuffer))
    }
  })
}

function baseChar() {
  return {
    userId: localApi.ID,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    kind: 'character' as const,
  }
}
