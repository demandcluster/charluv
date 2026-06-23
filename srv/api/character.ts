import { Router } from 'express'
import { assertValid } from '/common/valid'
import { store } from '../db'

import { loggedIn, isAdmin } from './auth'
import { errors, handle, StatusError } from './wrap'
import {
  entityUpload,
  entityUploadBase64,
  entityUploadBase64Unique,
  handleForm,
  readAssetBase64,
} from './upload'
import { PERSONA_FORMATS } from '../../common/adapters'
import { AppSchema } from '../../common/types/schema'
import { CharacterUpdate } from '../db/characters'
import { getVoiceService } from '../voice'
import { generateImage } from '../image'
import { makeLoraName, zimageEncode } from '../image/zimage'
import { listMemories, rememberFact, deleteMemory } from '../memory/store'
import { v4 } from 'uuid'
import { validBook } from './memory'
import { isObject, tryParse } from '/common/util'
import { assertStrict } from '/common/valid/validate'
import { buildModPrompt, fromJsonResponse, DEFAULT_MOD_PROMPT, DEFAULT_MOD_SCHEMA } from '/common/prompt'
import { checkPublishRequirements, PUBLISH_DEFAULTS, PUBLISH_MIN } from '/common/publish'
import { createInferenceStream } from '../adapter/generate'
import { sendOne } from './ws'

const router = Router()

const characterForm = {
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

  xp: 'any?',
  match: 'any?',
  share: 'string?',
  premium: 'any?',

  // Charluv: progression archetype/map + Discover facets
  progression: 'string?',
  gender: 'string?',
  artStyle: 'string?',
  ageRange: 'string?',
  category: 'string?',
  nsfw: 'any?',
  draft: 'any?',
  loraName: 'string?',
  imageSeed: 'any?',

  favorite: 'boolean?',
  voice: 'string?',
  voiceDisabled: 'string?',
  tags: 'string?',
  json: 'any?',

  imageSettings: 'string?',

  // v2 fields start here
  alternateGreetings: 'string?',
  characterBook: 'any?',
  extensions: 'string?',
  systemPrompt: 'string?',
  postHistoryInstructions: 'string?',
  insert: 'string?',
  creator: 'string?',
  characterVersion: 'string?',
} as const

const characterPost = {
  ...characterForm,
  voiceDisabled: 'boolean?',
  persona: 'any?',
  voice: 'any?',
  tags: ['string?'],
  imageSettings: 'any?',
  alternateGreetings: ['string?'],
  extensions: 'any?',
  insert: 'any?',
  json: 'any?',
  folder: 'string?',
} as const

const newCharacterValidator = {
  ...characterForm,
  name: 'string',
  scenario: 'string',
  greeting: 'string',
  sampleChat: 'string',
  xp: 'any?',
  match: 'any?',
  premium: 'boolean?',
  share: 'string?',
  persona: 'string',
  originalAvatar: 'string?',
} as const

const personaValidator = {
  kind: PERSONA_FORMATS,
  attributes: 'any',
} as const

// Shared by the create (`charge: true`) and import (`charge: false`) endpoints.
// Whether to bill the creation fee is decided SERVER-SIDE by which route was
// hit — never by a client-supplied flag — so imports can't be used to dodge the
// charge on a generated character.
const createCharacterFor = (charge: boolean) =>
  handle(async (req) => {
    const body = handleForm(req, newCharacterValidator)
    const persona = JSON.parse(body.persona) as AppSchema.Persona
    assertValid(personaValidator, persona)

  const sprite = body.sprite ? JSON.parse(body.sprite) : undefined
  const voice = parseAndValidateVoice(body.voice)
  const tags = toArray(body.tags)
  const alternateGreetings = body.alternateGreetings ? toArray(body.alternateGreetings) : undefined
  const insert = body.insert
    ? (JSON.parse(body.insert) as { prompt: string; depth: number })
    : undefined

  const characterBook = body.characterBook
    ? typeof body.characterBook === 'string'
      ? JSON.parse(body.characterBook)
      : body.characterBook
    : undefined

  if (!!characterBook) {
    assertValid(validBook, characterBook)
  }

  const extensions = body.extensions ? JSON.parse(body.extensions) : undefined
  if (!isObject(extensions) && extensions !== undefined) {
    throw new StatusError('Character `extensions` field must be an object or undefined.', 400)
  }
  // Imports bring a ready-made character (nothing is generated for them) and are
  // created via the separate, charge-free /import route. The create route bills.
  if (charge) {
    const user = await store.users.getUser(req.userId!)
    if (user?.credits && user?.credits < 50) {
      throw new StatusError('Not enough credits', 400)
    }
    await store.credits.updateCredits(req.userId!, -50)
  }

  const imageSettings = body.imageSettings ? JSON.parse(body.imageSettings) : undefined
  const json = body.json ? JSON.parse(body.json) : undefined
  const progression = body.progression ? JSON.parse(body.progression) : undefined
  const category = body.category ? JSON.parse(body.category) : undefined

  // creator / characterVersion are set automatically (server-side). The user no
  // longer edits these in the form, so any body values are ignored.
  const profile = await store.users.getProfile(req.userId!)
  const autoCreator = profile?.handle || ''
  const autoVersion = '1'

  const char = await store.characters.createCharacter(req.user?.userId!, {
    name: body.name,
    persona,
    premium: !!body.premium,
    xp: 0,
    match: body.match?.toString() === 'true' || false,
    draft: body.draft?.toString() === 'true' || undefined,
    progression,
    gender: (body.gender as AppSchema.Character['gender']) || undefined,
    artStyle: (body.artStyle as AppSchema.Character['artStyle']) || undefined,
    ageRange: body.ageRange || undefined,
    category,
    nsfw: body.nsfw?.toString() === 'true' || undefined,
    loraName: body.loraName || undefined,
    imageSeed: body.imageSeed ? Number(body.imageSeed) : undefined,
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
    voiceDisabled: body.voiceDisabled === 'true',
    voice,
    tags,
    alternateGreetings,
    characterBook,
    systemPrompt: body.systemPrompt,
    postHistoryInstructions: body.postHistoryInstructions,
    creator: autoCreator,
    characterVersion: autoVersion,
    insert: insert,
    imageSettings,
    json,
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

const createCharacter = createCharacterFor(true)
const importCharacter = createCharacterFor(false)

const getCharacters = handle(async ({ userId }) => {
  const chars = await store.characters.getCharacters(userId!)
  return { characters: chars }
})

// Returns the user's unfinished wizard draft so Create can resume it. The
// creation credit was already charged when the draft was made.
const getDraft = handle(async ({ userId }) => {
  const character = await store.characters.getDraftCharacter(userId!)
  return { character: character || null }
})

/** Resolve the per-tier daily publish cap from config (with shared defaults). */
function publishCap(config: AppSchema.Configuration, premium?: boolean) {
  return premium
    ? config.publishDailyPremium || PUBLISH_DEFAULTS.dailyPremium
    : config.publishDailyFree || PUBLISH_DEFAULTS.dailyFree
}

/** Admin-configured minimum-quality thresholds (falling back to shared defaults). */
function publishMins(config: AppSchema.Configuration) {
  return {
    greeting: config.publishMinGreeting ?? PUBLISH_MIN.greeting,
    description: config.publishMinDescription ?? PUBLISH_MIN.description,
    scenario: config.publishMinScenario ?? PUBLISH_MIN.scenario,
    personality: config.publishMinPersonality ?? PUBLISH_MIN.personality,
  }
}

/** Whether this user is allowed to publish given the configured audience gate. */
function canPublish(audience: AppSchema.Configuration['charlibPublish'], user: AppSchema.User) {
  switch (audience) {
    case 'off':
      return false
    case 'users':
      return true
    case 'subscribers':
      return !!user.premium || !!user.admin
    case 'moderators':
    case 'admins':
      return !!user.admin
    default:
      return false
  }
}

const getPublishStatus = handle(async ({ userId }) => {
  const config = await store.admin.getServerConfiguration()
  const user = await store.users.getUser(userId!)
  const cap = publishCap(config, user?.premium)
  const used = await store.characters.countPublishedToday(userId!)
  return {
    enabled: canPublish(config.charlibPublish, user!),
    cap,
    used,
    remaining: Math.max(0, cap - used),
    reward: config.publishReward || PUBLISH_DEFAULTS.reward,
    guidelines: config.charlibGuidelines || '',
    mins: publishMins(config),
  }
})

const publishCharacter = handle(async ({ userId, body, log }, res) => {
  assertValid({ requestId: 'string?', characterId: 'string', imageData: 'string?' }, body)

  const config = await store.admin.getServerConfiguration()
  const user = await store.users.getUser(userId!)
  if (!user) throw new StatusError('Not authorized', 401)

  if (!canPublish(config.charlibPublish, user)) {
    throw new StatusError('Publishing is not available for your account', 403)
  }

  const character = await store.characters.getCharacter(userId!, body.characterId)
  if (!character) throw new StatusError('Character not found', 404)
  if (character.draft) throw new StatusError('Finish creating the character before publishing', 400)

  // Minimum-quality thresholds + the fields Discover/profile rely on (avatar,
  // gender, art style, age range).
  const { ok, requirements, fields } = checkPublishRequirements(character, publishMins(config))
  if (!ok) {
    const missingFields = fields.filter((f) => !f.ok).map((f) => f.label)
    const missingLen = requirements
      .filter((r) => !r.ok)
      .map((r) => `${r.label} (${r.actual}/${r.min})`)
    const parts = [...missingFields, ...missingLen]
    throw new StatusError(`Not ready to publish — missing: ${parts.join(', ')}`, 400)
  }

  // Daily cap applies only to a character's first publish; re-publishing after
  // an edit (publishRewarded already set) is exempt and never re-rewarded.
  const cap = publishCap(config, user.premium)
  if (!character.publishRewarded) {
    const used = await store.characters.countPublishedToday(userId!)
    if (used >= cap) throw new StatusError(`Daily publish limit reached (${cap} per day)`, 429)
  }

  // No preset to configure — moderation runs on the local vision LLM (the
  // default subscription model, resolved inside createInferenceStream) using a
  // built-in prompt + schema, with optional admin overrides.
  const modSchema = config.modSchema?.length ? config.modSchema : DEFAULT_MOD_SCHEMA

  // Always moderate the avatar. Prefer the client-sent data URL; otherwise read
  // the saved avatar server-side so the image check can't be skipped.
  let imageData = body.imageData
  if (!imageData && character.avatar) {
    const ref = character.avatar.startsWith('/assets') ? character.avatar : `/assets/${character.avatar}`
    const b64 = await readAssetBase64(ref)
    if (b64) imageData = `data:image/png;base64,${b64}`
  }

  const prompt = buildModPrompt({
    char: character,
    prompt: config.modPrompt || DEFAULT_MOD_PROMPT,
    fields: config.modFieldPrompt,
  })

  const requestId = body.requestId || v4()

  const { stream, service } = await createInferenceStream({
    requestId,
    jsonSchema: modSchema,
    user,
    log,
    prompt,
    imageData,
  })

  res.json({ success: true, generating: true, requestId })

  if (user.admin) sendOne(userId, { type: 'inference-prompt', prompt })

  let response = ''
  let partial = ''
  let output: any = {}

  try {
    for await (const gen of stream) {
      if (typeof gen === 'string') {
        response = gen
        continue
      }
      if ('meta' in gen && user.admin) {
        sendOne(userId, { type: 'inference-meta', meta: gen.meta, requestId })
      }
      if ('partial' in gen) {
        partial = gen.partial
        fromJsonResponse(modSchema, gen.partial, output)
        if (user.admin)
          sendOne(userId, { type: 'inference-partial', partial, service, requestId, output })
        continue
      }
      if ('error' in gen) {
        sendOne(userId, { type: 'inference-error', partial, error: gen.error, requestId })
        continue
      }
      if ('warning' in gen) {
        sendOne(userId, { type: 'inference-warning', requestId, warning: gen.warning })
        continue
      }
    }
  } catch (ex: any) {
    const msg = ex instanceof StatusError ? `[${ex.status}] ${ex.message}` : `${ex.message || ex}`
    sendOne(userId, { type: 'inference-error', partial, error: msg, requestId })
    sendOne(userId, {
      type: 'publish-response',
      acceptable: false,
      requestId,
      reason: 'The moderation check could not be completed. Please try again.',
    })
    return
  }

  if (!response) {
    sendOne(userId, {
      type: 'publish-response',
      acceptable: false,
      requestId,
      reason: 'The moderation check returned no result. Please try again.',
    })
    return
  }
  if (user.admin) sendOne(userId, { type: 'inference', requestId, response, output })

  // A field is a violation when its moderation-schema rule isn't satisfied; the
  // field name doubles as the moderation flag (e.g. 'underage', 'violence').
  let acceptable = true
  const flags: string[] = []
  for (const [key, value] of Object.entries(output)) {
    const def = modSchema.find((s) => s.name === key)
    if (!def || !def.type.valid) continue

    let fieldOk = true
    switch (def.type.type) {
      case 'integer':
      case 'string':
        continue
      case 'bool':
        fieldOk = value === (def.type.valid === 'true')
        break
      case 'enum':
        fieldOk = def.type.valid
          .split(',')
          .map((v) => v.trim())
          .includes((value || '') as string)
        break
    }
    if (!fieldOk) {
      acceptable = false
      flags.push(def.name)
    }
  }

  const checkedAt = Date.now()

  if (!acceptable) {
    const moderation: AppSchema.CharacterModeration = {
      status: 'rejected',
      flags,
      reason: flags.length ? `Flagged for: ${flags.join(', ')}` : 'Did not pass the content check',
      autoCheckedAt: checkedAt,
    }
    await store.characters.updateCharacter(character._id, userId!, { moderation })
    sendOne(userId, {
      type: 'publish-response',
      acceptable: false,
      requestId,
      flags,
      reason: moderation.reason,
    })
    return
  }

  const reward = config.publishReward || PUBLISH_DEFAULTS.reward
  const shouldReward = !character.publishRewarded && reward > 0

  const moderation: AppSchema.CharacterModeration = {
    status: 'approved',
    flags,
    autoCheckedAt: checkedAt,
    moderated: false,
  }
  await store.characters.updateCharacter(character._id, userId!, {
    published: true,
    publishedAt: checkedAt,
    publishRewarded: character.publishRewarded || shouldReward,
    moderation,
  })

  if (shouldReward) await store.credits.updateCredits(userId!, reward)

  sendOne(userId, {
    type: 'publish-response',
    acceptable: true,
    requestId,
    rewarded: shouldReward ? reward : 0,
  })
})

const reportCharacter = handle(async ({ userId, params, body }) => {
  assertValid({ reason: 'string', note: 'string?' }, body)
  if (!body.reason.trim()) throw new StatusError('A reason is required', 400)

  // Only publicly-visible characters can be reported (and never your own).
  const char = await store.matches.getMatch(userId!, params.id)
  if (!char) throw new StatusError('Character not found', 404)
  if (char.userId === userId) throw new StatusError(`You can't report your own character`, 400)

  const { count } = await store.reports.createReport({
    charId: char._id,
    charOwnerId: char.userId,
    reporterId: userId!,
    reason: body.reason.trim().slice(0, 60),
    note: body.note?.toString().slice(0, 500),
  })

  // Auto-hide once enough distinct users have reported it; admins review next.
  if (count >= PUBLISH_DEFAULTS.reportThreshold && char.moderation?.status !== 'hidden') {
    await store.characters.setCharacterModeration(char._id, {
      published: false,
      moderation: {
        ...(char.moderation || { status: 'approved' }),
        status: 'hidden',
        reason: `Auto-hidden after ${count} reports`,
      },
      reportCount: count,
    })
  } else {
    await store.characters.setCharacterModeration(char._id, { reportCount: count })
  }

  return { success: true }
})

const editPartCharacter = handle(async ({ body, params, userId }) => {
  const id = params.id
  assertStrict({ type: characterPost }, body)

  const update: CharacterUpdate = body as any

  if (update.avatar?.startsWith('data:image/png;base64')) {
    const filename = await entityUploadBase64('char', id, update.avatar)
    update.avatar = `${filename}?v=${v4().slice(0, 4)}`
  }

  if (!Array.isArray(update.alternateGreetings)) {
    delete update.alternateGreetings
  }

  if (update.characterBook) {
    try {
      assertValid(validBook, update.characterBook)
    } catch (ex: any) {
      throw new StatusError(
        `Could not update character: Character book could not be parsed - ${ex.message}`,
        400
      )
    }
  }

  if (update.extensions && !isObject(update.extensions)) {
    throw new StatusError('Character `extensions` field must be an object or undefined.', 400)
  }

  if (body.imageSettings) {
    try {
      update.imageSettings = JSON.parse(body.imageSettings)
    } catch (ex: any) {
      throw new StatusError(`Character 'imageSettings' could not be parsed: ${ex.message}`, 400)
    }
  }

  if (update.persona) {
    try {
      assertValid(personaValidator, update.persona)
    } catch (ex: any) {
      throw new StatusError(`Character 'persona' could not be parsed: ${ex.message}`, 400)
    }
  }

  // If this partial update changes moderatable content on a live public
  // character, take it private for re-publishing (see editFullCharacter). A
  // non-content tweak (favourite, folder, …) leaves the public state alone.
  if (CONTENT_FIELDS.some((f) => f in update)) {
    const existing = await store.characters.getCharacter(userId!, id)
    if (existing?.published) {
      update.published = false
      update.moderation = {
        ...(existing.moderation || { status: 'approved' }),
        status: 'review',
        moderated: false,
      }
    }
  }

  const char = await store.characters.partialUpdateCharacter(id, userId, update)
  return char
})

/** Character fields whose change requires re-moderation before staying public. */
const CONTENT_FIELDS: (keyof CharacterUpdate)[] = [
  'name',
  'persona',
  'greeting',
  'scenario',
  'sampleChat',
  'description',
  'appearance',
  'avatar',
  'sprite',
  'visualType',
  'systemPrompt',
  'postHistoryInstructions',
  'alternateGreetings',
  'characterBook',
]

export const bulkUpdate = handle(async (req) => {
  assertValid(
    { characterIds: ['string'], folder: 'string?', addTag: 'string?', removeTag: 'string?' },
    req.body
  )

  const modified = await store.characters.bulkUpdate(req.userId, req.body.characterIds, req.body)

  return { success: true, modified }
})

const editFullCharacter = handle(async (req) => {
  const id = req.params.id
  const body = handleForm(req, characterForm)

  const alternateGreetings = body.alternateGreetings ? toArray(body.alternateGreetings) : undefined
  const characterBook = body.characterBook ? JSON.parse(body.characterBook) : undefined
  if (characterBook !== undefined) {
    assertValid(validBook, characterBook)
  }
  const extensions = body.extensions ? JSON.parse(body.extensions) : undefined
  if (!isObject(extensions) && extensions !== undefined) {
    throw new StatusError('Character `extensions` field must be an object or undefined.', 400)
  }
  const insert = body.insert
    ? (JSON.parse(body.insert) as { prompt: string; depth: number })
    : undefined

  const imageSettings = body.imageSettings ? JSON.parse(body.imageSettings) : undefined
  const json = body.json ? JSON.parse(body.json) : undefined

  // creator / characterVersion are managed automatically (server-side). Keep the
  // existing creator untouched and auto-increment the version. Body values for
  // these two are ignored.
  const existing = await store.characters.getCharacter(req.userId!, id)
  const parsedVersion = parseInt(existing?.characterVersion ?? '', 10)
  const nextVersion = Number.isFinite(parsedVersion) ? String(parsedVersion + 1) : '1'

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
    // creator left as-is (omitted from update so it isn't overwritten);
    // characterVersion auto-incremented.
    characterVersion: nextVersion,
    match: body.match?.toString() === 'true' || false,
    // Editing always lands a finished character. Finalizing a draft clears the
    // flag (making it visible); editing a normal character is a harmless no-op.
    draft: false,
    premium: body.premium?.toString() === 'true' || false,
    // xp: 0, // body.xp ? parseInt(body.xp) : 0,
    share: body.share || 'private',
    voiceDisabled: body.voiceDisabled === 'true',
    imageSettings,
    insert,
    json,
    progression: body.progression ? JSON.parse(body.progression) : undefined,
    gender: (body.gender as AppSchema.Character['gender']) || undefined,
    artStyle: (body.artStyle as AppSchema.Character['artStyle']) || undefined,
    ageRange: body.ageRange || undefined,
    category: body.category ? JSON.parse(body.category) : undefined,
    nsfw: body.nsfw?.toString() === 'true' || undefined,
    loraName: body.loraName || undefined,
    imageSeed: body.imageSeed ? Number(body.imageSeed) : undefined,
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

  // Editing a live public character takes it private again: the content changed
  // and must be re-moderated. The owner re-publishes (re-running the automated
  // check) to make it public again. publishRewarded is left set so re-publishing
  // is exempt from the daily cap and isn't re-rewarded.
  if (existing?.published) {
    update.published = false
    update.moderation = {
      ...(existing.moderation || { status: 'approved' }),
      status: 'review',
      moderated: false,
    }
  }

  // Finalizing a draft is free: the 50-credit creation fee was already taken
  // when the draft was created (on entering the final step). Only charge the
  // 20-credit edit fee for edits to already-finished characters.
  if (!existing?.draft) {
    const user = await store.users.getUser(req.userId!)
    if (user?.credits && user?.credits < 20) {
      throw new StatusError('Not enough credits', 400)
    }
    await store.credits.updateCredits(req.userId!, -20)
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

/** Max images stored per character gallery. The LoRA reference set is a user-
 * picked subset of these (max 4, the Z-Image encode limit). */
const MAX_GALLERY = 10

const addGalleryImage = handle(async ({ userId, params, body }) => {
  assertValid({ image: 'string' }, body)

  const char = await store.characters.getCharacter(userId!, params.id)
  if (!char) throw errors.NotFound

  const gallery = (char.gallery || []).slice()
  if (gallery.length >= MAX_GALLERY) {
    throw new StatusError(`Gallery is full (max ${MAX_GALLERY} images)`, 400)
  }

  const url = await entityUploadBase64Unique('char-gallery', params.id, body.image)
  if (!url) throw new StatusError('Invalid image data', 400)

  gallery.push(url)
  await store.characters.updateCharacter(params.id, userId!, { gallery })
  return { gallery }
})

const removeGalleryImage = handle(async ({ userId, params, body }) => {
  assertValid({ url: 'string' }, body)

  const char = await store.characters.getCharacter(userId!, params.id)
  if (!char) throw errors.NotFound

  const gallery = (char.gallery || []).filter((url) => url !== body.url)
  await store.characters.updateCharacter(params.id, userId!, { gallery })
  return { gallery }
})

/** Set the character's cover (avatar) to one of its existing images. The url
 * must be the current avatar or part of the character's gallery so we never
 * point the avatar at an arbitrary/unowned asset. */
const setCover = handle(async ({ userId, params, body }) => {
  assertValid({ url: 'string' }, body)

  const char = await store.characters.getCharacter(userId!, params.id)
  if (!char) throw errors.NotFound

  const allowed = new Set([...(char.gallery || []), char.avatar].filter(Boolean) as string[])
  if (!allowed.has(body.url)) {
    throw new StatusError('Cover image is not part of this character', 400)
  }

  await store.characters.updateCharacter(params.id, userId!, { avatar: body.url })
  return { avatar: body.url }
})

/**
 * Long-term memory management for a character (the new "remember" system that
 * replaces memory books). Scoped to the owner + character, so it spans every
 * chat with that companion. The model writes these via the `remember` tool;
 * these routes let the owner view, add, and remove them.
 */
const listCharacterMemories = handle(async ({ userId, params }) => {
  const char = await store.characters.getCharacter(userId!, params.id)
  if (!char) throw errors.NotFound
  const memories = await listMemories(userId!, params.id)
  return { memories: memories.map(({ embedding, ...m }) => m) }
})

const addCharacterMemory = handle(async ({ userId, params, body }) => {
  assertValid({ text: 'string' }, body)
  const char = await store.characters.getCharacter(userId!, params.id)
  if (!char) throw errors.NotFound

  const text = (body.text || '').trim()
  if (!text) throw new StatusError('Memory text is required', 400)

  const doc = await rememberFact(userId!, params.id, text, 'manual')
  if (!doc) throw new StatusError('Could not store memory', 400)

  const memories = await listMemories(userId!, params.id)
  return { memories: memories.map(({ embedding, ...m }) => m) }
})

const removeCharacterMemory = handle(async ({ userId, params }) => {
  const char = await store.characters.getCharacter(userId!, params.id)
  if (!char) throw errors.NotFound

  await deleteMemory(userId!, params.memId)
  const memories = await listMemories(userId!, params.id)
  return { memories: memories.map(({ embedding, ...m }) => m) }
})

/** Max reference images accepted by the Z-Image encode endpoint. */
const MAX_LORA_REFS = 4

const encodeLora = handle(async ({ userId, params, body }) => {
  assertValid({ images: ['string'] }, body)

  const char = await store.characters.getCharacter(userId!, params.id)
  if (!char) throw errors.NotFound

  const refs = (body.images || []).filter((img: string) => !!img).slice(0, MAX_LORA_REFS)
  if (!refs.length) {
    throw new StatusError('Provide at least one reference image', 400)
  }

  // Entries may be base64 data urls (freshly generated/uploaded) or stored asset
  // URLs. Resolve everything to base64 server-side (avoids browser CORS on the
  // CDN). Restrict to the character's own gallery when an asset ref is given.
  const allowed = new Set([...(char.gallery || []), char.avatar].filter(Boolean) as string[])
  const images: string[] = []
  for (const ref of refs) {
    if (ref.includes('base64,')) {
      images.push(ref)
      continue
    }
    if (!allowed.has(ref)) {
      throw new StatusError('Reference image is not part of this character gallery', 400)
    }
    const b64 = await readAssetBase64(ref)
    if (b64) images.push(b64)
  }

  if (!images.length) {
    throw new StatusError('Could not read the reference images', 400)
  }

  // Reuse the character's existing LoRA name so re-encoding REPLACES it (Z-Image
  // overwrites the stored LoRA under the same name). Only mint a new unique name
  // (character name + randomizer) the first time.
  const saveAs = char.loraName || makeLoraName(char.name)
  const loraName = await zimageEncode(images, saveAs)

  await store.characters.updateCharacter(params.id, userId!, { loraName })
  return { loraName }
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
  assertValid(
    {
      user: 'any?',
      prompt: 'string',
      ephemeral: 'boolean?',
      source: 'string?',
      noAffix: 'boolean?',
      characterId: 'string?',
      chatId: 'string?',
      requestId: 'string?',
      parent: 'string?',
      seed: 'number?',
    },
    body
  )
  const user = userId ? await store.users.getUser(userId) : body.user

  const guestId = userId ? undefined : socketId
  generateImage(
    {
      user,
      prompt: body.prompt,
      ephemeral: body.ephemeral,
      source: body.source || 'unknown',
      noAffix: body.noAffix,
      chatId: body.chatId,
      characterId: body.characterId,
      requestId: body.requestId,
      parentId: body.parent,
      seed: body.seed,
    },
    log,
    guestId
  )
  return { success: true }
})

router.post('/image', createImage)
router.use(loggedIn)
router.post('/', loggedIn, createCharacter)
router.post('/import', loggedIn, importCharacter)
router.get('/', getCharacters)
router.get('/draft', loggedIn, getDraft)
router.get('/publish/status', getPublishStatus)
router.post('/publish', publishCharacter)
router.post('/:id/report', reportCharacter)
router.post('/:id/update', editPartCharacter)
router.post('/:id', editFullCharacter)
router.get('/:id', getCharacter)
router.delete('/:id', loggedIn, deleteCharacter)
router.post('/:id/favorite', editCharacterFavorite)
router.delete('/:id/avatar', removeAvatar)
router.post('/:id/gallery', addGalleryImage)
router.delete('/:id/gallery', removeGalleryImage)
router.post('/:id/cover', setCover)
router.post('/:id/encode-lora', encodeLora)
router.get('/:id/memories', listCharacterMemories)
router.post('/:id/memories', addCharacterMemory)
router.delete('/:id/memories/:memId', removeCharacterMemory)
router.post('/bulk-update', bulkUpdate)

export default router

function toArray(value?: string) {
  if (!value) return []

  if (Array.isArray(value)) return value.filter((v) => typeof v === 'string')

  const parsed = tryParse(value)
  if (Array.isArray(parsed)) return parsed.filter((v) => typeof v === 'string')
  if (typeof parsed === 'string') return []

  if (!parsed) return []
}
