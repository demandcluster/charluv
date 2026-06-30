import { Router } from 'express'
import { assertValid } from '/common/valid'
import { store } from '../db'

import { loggedIn } from './auth'
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
import { generateImage, IMAGE_COST } from '../image'
import { makeLoraName, zimageEncode, zimageDeleteLora } from '../image/zimage'
import { logger } from '../middleware'
import { listMemories, rememberFact, deleteMemory, deleteAllMemories } from '../memory/store'
import { v4 } from 'uuid'
import { validBook } from './memory'
import { isObject, tryParse } from '/common/util'
import { assertStrict } from '/common/valid/validate'
import {
  buildModPrompt,
  fromJsonResponse,
  DEFAULT_MOD_PROMPT,
  DEFAULT_MOD_SCHEMA,
  DEFAULT_MOD_SYSTEM,
} from '/common/prompt'
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
    const alternateGreetings = body.alternateGreetings
      ? toArray(body.alternateGreetings)
      : undefined
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
    // created via the separate, charge-free /import route. The create route bills —
    // but NOT for the hidden draft made on entering the final step: the 100-credit
    // creation fee is taken when the user actually finalizes the AI (the draft is
    // finalized via the edit route, which charges there instead).
    const isDraft = body.draft?.toString() === 'true'
    if (charge && !isDraft) {
      const user = await store.users.getUser(req.userId!)
      if (user?.credits && user?.credits < 100) {
        throw new StatusError('Not enough credits', 400)
      }
      await store.credits.updateCredits(req.userId!, -100)
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
  // Admins/moderators are exempt from the daily cap — never report them as out.
  const exempt = !!user?.admin
  return {
    enabled: canPublish(config.charlibPublish, user!),
    cap,
    used,
    remaining: exempt ? cap : Math.max(0, cap - used),
    exempt,
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
  // gender, art style, age range). Admins bypass this gate so special characters
  // that deliberately omit some details can still be published.
  const { ok, requirements, fields } = checkPublishRequirements(character, publishMins(config))
  if (!ok && !user.admin) {
    const missingFields = fields.filter((f) => !f.ok).map((f) => f.label)
    const missingLen = requirements
      .filter((r) => !r.ok)
      .map((r) => `${r.label} (${r.actual}/${r.min})`)
    const parts = [...missingFields, ...missingLen]
    throw new StatusError(`Not ready to publish — missing: ${parts.join(', ')}`, 400)
  }

  // Daily cap applies only to a character's first publish; re-publishing after
  // an edit (publishRewarded already set) is exempt and never re-rewarded.
  // Admins/moderators are exempt from the cap entirely.
  const cap = publishCap(config, user.premium)
  if (!character.publishRewarded && !user.admin) {
    const used = await store.characters.countPublishedToday(userId!)
    if (used >= cap) throw new StatusError(`Daily publish limit reached (${cap} per day)`, 429)
  }

  // No preset to configure — moderation runs on the local vision LLM (the
  // default subscription model, resolved inside createInferenceStream) using a
  // built-in prompt + schema, with optional admin overrides.
  const modSchema = config.modSchema?.length ? config.modSchema : DEFAULT_MOD_SCHEMA

  // Moderate every image on the character — avatar + gallery — up to the
  // model's 10-images-per-request limit. Prefer the client-sent avatar data
  // URL; read the rest server-side so the image check can't be skipped.
  const imageRefs = Array.from(
    new Set([character.avatar, ...(character.gallery || [])].filter(Boolean) as string[])
  ).slice(0, 10)
  const images: string[] = []
  for (const ref of imageRefs) {
    if (ref === character.avatar && body.imageData) {
      images.push(body.imageData)
      continue
    }
    const clean = ref.split('?')[0]
    const path = clean.startsWith('/assets') ? clean : `/assets/${clean}`
    const b64 = await readAssetBase64(path)
    if (b64) images.push(`data:image/png;base64,${b64}`)
  }

  // Spell out the exact JSON shape in the prompt. `guided_json` rides along but
  // the self-hosted endpoint's speculative decoding ignores it, so the model
  // free-forms its own shape (e.g. `{"safe": true}`) whose keys don't match the
  // schema — fromJsonResponse then parses nothing and the publish fail-closes.
  // Enumerating the schema's keys forces the model to emit the fields we read.
  const verdictKeys = modSchema.filter((f) => !f.disabled).map((f) => f.name)
  const jsonShape = `{${verdictKeys.map((k) => `"${k}": false`).join(', ')}}`
  const prompt = `${buildModPrompt({
    char: character,
    prompt: config.modPrompt || DEFAULT_MOD_PROMPT,
    fields: config.modFieldPrompt,
  })}\n\nRespond with ONLY this JSON object — exactly these keys, each set to true or false, no other keys and no prose:\n${jsonShape}`

  const requestId = body.requestId || v4()

  // A failed automated check (an AI denial, or a verdict we couldn't interpret)
  // doesn't dead-end the user — the character is kept private and queued for a
  // human moderator, who approves (publishes) or confirms the rejection. The
  // technical flags/reason are stored for the admin; the user sees a neutral
  // "sent for review" message.
  const sendToReview = async (char: AppSchema.Character, flags: string[], reason: string) => {
    const moderation: AppSchema.CharacterModeration = {
      status: 'rejected',
      flags,
      reason,
      autoCheckedAt: Date.now(),
      moderated: false,
    }
    await store.characters.updateCharacter(char._id, userId!, { published: false, moderation })
    sendOne(userId, {
      type: 'publish-response',
      acceptable: false,
      pending: true,
      requestId,
      reason:
        "Your character didn't pass the automatic check and has been sent to our moderators for review. You'll be notified once it's reviewed.",
    })
  }

  const { stream, service } = await createInferenceStream({
    requestId,
    jsonSchema: modSchema,
    user,
    log,
    prompt,
    images,
    // Overrides the served model's default companion system prompt so the model
    // classifies the character instead of answering the prompt in-character.
    system: DEFAULT_MOD_SYSTEM,
    // Run on the dedicated (original, vision-capable) moderation model rather than
    // the user-facing chat model, which may be a less-censored swap.
    moderation: true,
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

  // Fail CLOSED: if we couldn't parse the verdict into any known moderation
  // field, the model didn't actually clear the character — do NOT publish. (The
  // verdict below defaults to acceptable=true and only flips on a parsed
  // violation, so an empty output would otherwise auto-approve anything.)
  fromJsonResponse(modSchema, response, output)
  if (!Object.keys(output).length) {
    // The automated check didn't return a usable verdict — don't approve, but
    // don't dead-end the user either: hand it to a human moderator (same as any
    // AI denial below).
    await sendToReview(
      character,
      [],
      'Automated check returned no usable verdict — needs manual review.'
    )
    return
  }

  // A field is a violation when its moderation-schema rule isn't satisfied; the
  // field name doubles as the moderation flag (e.g. 'underage', 'violence').
  let acceptable = true
  let nsfwDetected = false
  const flags: string[] = []
  for (const [key, value] of Object.entries(output)) {
    const def = modSchema.find((s) => s.name === key)
    if (!def || !def.type.valid) continue

    // Nudity is allowed on this adults-only platform: it never blocks publishing,
    // it just flips the character's NSFW flag. (Minors remain a hard deny below.)
    if (key === 'nudity') {
      if (value === true) {
        nsfwDetected = true
        flags.push('nudity')
      }
      continue
    }

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
    // AI denial: the character is NOT published. Instead of dead-ending the user,
    // route it to the admin pending-review queue for a human decision.
    await sendToReview(
      character,
      flags,
      flags.length ? `Flagged for: ${flags.join(', ')}` : 'Did not pass the content check'
    )
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
    // Nudity in the text/images auto-marks the character 18+ rather than blocking.
    ...(nsfwDetected ? { nsfw: true } : {}),
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

// Migrate a legacy embedded memory book into the new long-term memory, then
// drop the book from the character. Idempotent: no book → migrated 0.
const migrateBook = handle(async ({ userId, params }) => {
  const char = await store.characters.getCharacter(userId!, params.id)
  if (!char) throw new StatusError('Character not found', 404)

  const entries = (char.characterBook?.entries || []).filter((e) => e.entry?.trim())
  if (!entries.length) return { migrated: 0 }

  let migrated = 0
  for (const entry of entries) {
    const text = (entry.name ? `${entry.name}: ${entry.entry}` : entry.entry).trim()
    // 'manual' so book facts are stored verbatim (no ephemeral filter / reconcile).
    const doc = await rememberFact(userId!, char._id, text, 'manual')
    if (doc) migrated++
  }

  // Drop the old book from the character.
  await store.characters.updateCharacter(char._id, userId!, { characterBook: null as any })
  return { migrated }
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

  // A character carrying a custom system_prompt is a power/safety-sensitive
  // definition (e.g. imported jailbreak-style cards whose prompt can try to
  // subvert the levels/18+ safeguard). It is not user-editable — only an
  // admin/moderator may change it. Block the edit outright for everyone else.
  if (existing?.systemPrompt && !req.user?.admin) {
    throw errors.Forbidden
  }

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

  // Billing: finalizing a draft into a live character IS the creation step, so it
  // takes the 100-credit creation fee (the draft itself was made for free on
  // entering the final step). Editing an already-finished character takes the
  // smaller 30-credit edit fee.
  const fee = existing?.draft ? 100 : 30
  const billed = await store.users.getUser(req.userId!)
  if (billed?.credits && billed.credits < fee) {
    throw new StatusError('Not enough credits', 400)
  }
  await store.credits.updateCredits(req.userId!, -fee)

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

  const update: CharacterUpdate = { gallery }

  // Publish moderation reviews the avatar + gallery only at publish time, and
  // Discover/Profile render gallery images — so adding a new image to a live public
  // character would put unmoderated content on the gallery immediately. Mirror the
  // edit path: take it private for review; the owner re-publishes to re-run the
  // automated check. publishRewarded is left set so re-publishing isn't re-rewarded.
  if (char.published) {
    update.published = false
    update.moderation = {
      ...(char.moderation || { status: 'approved' }),
      status: 'review',
      moderated: false,
    }
  }

  await store.characters.updateCharacter(params.id, userId!, update)
  return { gallery, published: update.published ?? char.published }
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
  sendOne(userId!, { type: 'character-memory', characterId: params.id })
  const memories = await listMemories(userId!, params.id)
  return { memories: memories.map(({ embedding, ...m }) => m) }
})

/** Max reference images accepted by the Z-Image encode endpoint. */
const MAX_LORA_REFS = 4

/** Credit cost to train/encode a character LoRA. */
const LORA_COST = 300

const encodeLora = handle(async ({ userId, params, body }) => {
  assertValid({ images: ['string'] }, body)

  const char = await store.characters.getCharacter(userId!, params.id)
  if (!char) throw errors.NotFound

  // Gate on credits up front so an under-funded request is rejected before the
  // expensive encode; the actual deduction happens only after it succeeds.
  const user = await store.users.getUser(userId!)
  if ((user?.credits ?? 0) < LORA_COST) {
    throw new StatusError(`Not enough credits — training a LoRA costs ${LORA_COST}`, 400)
  }

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
  //
  // BUT: a matched clone inherits its parent's `loraName`, so that name is shared
  // on the image server. Overwriting it here would corrupt the parent template and
  // every other clone. If anyone else still references this name, fork a fresh
  // unique name so this character gets its own LoRA instead of clobbering theirs.
  const shared = char.loraName
    ? await store.characters.anyCharacterUsesLora(char.loraName, char._id)
    : false
  const saveAs = char.loraName && !shared ? char.loraName : makeLoraName(char.name)
  const loraName = await zimageEncode(images, saveAs)

  await store.characters.updateCharacter(params.id, userId!, { loraName })
  await store.credits.updateCredits(userId!, -LORA_COST)
  return { loraName }
})

/**
 * Remove a stored LoRA from the image server, but only when no remaining
 * character still references it (clones share the parent's `loraName`). Call this
 * AFTER the local change (clear/delete) so the usage check reflects reality.
 * Best-effort: a failed remote delete must not fail the user's local action.
 */
async function deleteLoraFromImageServer(loraName?: string) {
  if (!loraName) return
  if (await store.characters.anyCharacterUsesLora(loraName)) return
  try {
    await zimageDeleteLora(loraName)
  } catch (err: any) {
    logger.warn({ err: err?.message, loraName }, 'Failed to delete LoRA from image server')
  }
}

/** Delete just the character's image LoRA (keeps the character itself). */
const deleteLora = handle(async ({ userId, params }) => {
  const char = await store.characters.getCharacter(userId!, params.id)
  if (!char) throw errors.NotFound
  const loraName = char.loraName
  if (!loraName) return { success: true }

  await store.characters.clearCharacterLora(params.id, userId!)
  await deleteLoraFromImageServer(loraName)
  return { success: true }
})

const deleteCharacter = handle(async ({ userId, params }) => {
  const id = params.id
  // Read the LoRA name before the doc is gone; clean it up off the image server
  // after deletion (so the shared-use check sees the character as already removed).
  const char = await store.characters.getCharacter(userId!, id)
  await store.characters.deleteCharacter({ userId: userId!, charId: id })
  await deleteLoraFromImageServer(char?.loraName)
  return { success: true }
})

/**
 * Reset a character the user owns back to a clean slate: delete all of their
 * chats with it, zero the relationship XP, and wipe its long-term memories. The
 * character itself (persona, gallery, progression config) is kept.
 */
const resetCharacter = handle(async ({ userId, params }) => {
  const id = params.id
  const char = await store.characters.getCharacter(userId!, id)
  if (!char) throw errors.NotFound

  await store.chats.deleteChatsByCharacter(userId!, id)
  await deleteAllMemories(userId!, id)
  await store.characters.updateCharacter(id, userId!, { xp: 0 })

  return { success: true }
})

const editCharacterFavorite = handle(async (req) => {
  const id = req.params.id
  const favorite = req.body.favorite === true

  const prev = await store.characters.getCharacter(req.userId!, id)
  const char = await store.characters.updateCharacter(id, req.userId!, {
    favorite: favorite,
  })

  // Roll the favourite up to the public template (the clone's parent, or itself)
  // only when the flag actually flips, so re-toggling can't double-count.
  if (prev && !!prev.favorite !== favorite) {
    await store.matches.incrementEngagement(id, 'favorites', favorite ? 1 : -1, prev.parent || id)
  }

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
      noCharge: 'boolean?',
    },
    body
  )
  const user = userId ? await store.users.getUser(userId) : body.user

  // Charge logged-in users for each image generation/regeneration. Avatar,
  // gallery, and the create-wizard portrait all route through here, so this is
  // the single place the image cost is applied. Guests have no account to bill;
  // generateImage refunds the charge if the request is dropped on disconnect.
  if (userId && userId !== 'anon') {
    // The create wizard's FIRST portrait is free — it's bundled into the
    // 100-credit creation fee. This is a single-use freebie claimed atomically
    // from the draft's server state (not the client's `noCharge` flag), so it
    // can't be replayed for unlimited free images, nor used on the edit form or
    // in chat (no draft). Every other generation is charged.
    const free = body.noCharge ? await store.characters.claimDraftFreePortrait(userId) : false
    if (!free) {
      if ((user?.credits ?? 0) < IMAGE_COST) {
        throw new StatusError(`Not enough credits — generating an image costs ${IMAGE_COST}`, 400)
      }
      await store.credits.updateCredits(userId, -IMAGE_COST)
    }
  }

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
router.post('/:id/migrate-book', migrateBook)
router.post('/:id/update', editPartCharacter)
router.post('/:id', editFullCharacter)
router.get('/:id', getCharacter)
router.delete('/:id', loggedIn, deleteCharacter)
router.post('/:id/reset', resetCharacter)
router.post('/:id/favorite', editCharacterFavorite)
router.delete('/:id/avatar', removeAvatar)
router.post('/:id/gallery', addGalleryImage)
router.delete('/:id/gallery', removeGalleryImage)
router.post('/:id/cover', setCover)
router.post('/:id/encode-lora', encodeLora)
router.delete('/:id/lora', loggedIn, deleteLora)
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
