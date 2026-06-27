import { v4 } from 'uuid'
import { db } from './client'
import { AppSchema } from '../../common/types/schema'
import { now } from './util'
import { UpdateFilter } from 'mongodb'

export type CharacterUpdate = Partial<
  Pick<
    AppSchema.Character,
    | 'name'
    | 'avatar'
    | 'persona'
    | 'sampleChat'
    | 'greeting'
    | 'scenario'
    | 'description'
    | 'culture'
    | 'tags'
    | 'favorite'
    | 'match'
    | 'draft'
    | 'published'
    | 'publishedAt'
    | 'publishRewarded'
    | 'moderation'
    | 'reportCount'
    | 'xp'
    | 'share'
    | 'premium'
    | 'voice'
    | 'children'
    | 'alternateGreetings'
    | 'characterBook'
    | 'extensions'
    | 'systemPrompt'
    | 'postHistoryInstructions'
    | 'insert'
    | 'creator'
    | 'characterVersion'
    | 'appearance'
    | 'sprite'
    | 'visualType'
    | 'voiceDisabled'
    | 'imageSettings'
    | 'json'
    | 'folder'
    | 'progression'
    | 'gender'
    | 'artStyle'
    | 'ageRange'
    | 'category'
    | 'nsfw'
    | 'loraName'
    | 'imageSeed'
    | 'gallery'
  >
>

export async function createCharacter(
  userId: string,
  char: Pick<
    AppSchema.Character,
    | 'name'
    | 'appearance'
    | 'avatar'
    | 'persona'
    | 'sampleChat'
    | 'greeting'
    | 'scenario'
    | 'description'
    | 'culture'
    | 'tags'
    | 'favorite'
    | 'match'
    | 'draft'
    | 'xp'
    | 'premium'
    | 'share'
    | 'parent'
    | 'children'
    | 'voice'
    | 'alternateGreetings'
    | 'characterBook'
    | 'extensions'
    | 'systemPrompt'
    | 'postHistoryInstructions'
    | 'insert'
    | 'creator'
    | 'characterVersion'
    | 'sprite'
    | 'visualType'
    | 'voiceDisabled'
    | 'imageSettings'
    | 'json'
    | 'progression'
    | 'gender'
    | 'artStyle'
    | 'ageRange'
    | 'category'
    | 'nsfw'
    | 'loraName'
    | 'imageSeed'
    | 'gallery'
  >
) {
  const newChar: AppSchema.Character = {
    _id: v4(),
    kind: 'character',
    userId,
    createdAt: now(),
    updatedAt: now(),
    ...char,
  }

  await db('character').insertOne(newChar)
  if (newChar.parent) {
    await db('character').updateOne({ _id: newChar.parent }, { $inc: { children: 1 } })
  }

  return newChar
}

export async function updateCharacter(id: string, userId: string, char: CharacterUpdate) {
  const edit = { ...char, updatedAt: now() }
  if (edit.avatar === undefined) {
    delete edit.avatar
  }
  await db('character').updateOne({ _id: id, userId }, { $set: edit })
  return getCharacter(userId, id)
}

export async function getPublicCharacter(name: string) {
  const char = await db('character').findOne({ kind: 'character', name: name, match: true })
  return char
}

/** Load a character by id regardless of owner (admin / moderation use). */
export async function getCharacterById(id: string) {
  const char = await db('character').findOne({ _id: id, kind: 'character' })
  return char || undefined
}

/** Live published characters for the admin stage-2 review queue (unreviewed first). */
export async function getPublishedForReview() {
  const list = await db('character')
    .find({ kind: 'character', published: true })
    .sort({ 'moderation.moderated': 1, publishedAt: -1 })
    .limit(500)
    .toArray()
  return list
}

/**
 * Characters that FAILED the automated publish check and are awaiting a human
 * decision: rejected by the AI, not yet actioned by a moderator. These are not
 * published (not live) — an admin approves (publishes) or confirms the rejection.
 */
export async function getPendingModeration() {
  const list = await db('character')
    .find({
      kind: 'character',
      'moderation.status': 'rejected',
      'moderation.moderated': { $ne: true },
    })
    .sort({ 'moderation.autoCheckedAt': -1 })
    .limit(500)
    .toArray()
  return list
}

/** Delete a character by id regardless of owner (admin moderation action). */
export async function adminDeleteCharacter(charId: string) {
  await db('character').deleteOne({ _id: charId, kind: 'character' })
}

/** Number of characters this user has published since the start of the UTC day. */
export async function countPublishedToday(userId: string) {
  const start = new Date()
  start.setUTCHours(0, 0, 0, 0)
  return db('character').countDocuments({
    kind: 'character',
    userId,
    publishedAt: { $gte: start.getTime() },
  })
}

/**
 * Update publish/moderation state on a character by id only (no userId scope).
 * Used by report auto-hide and admin moderation actions, which act on characters
 * the caller does not own.
 */
export async function setCharacterModeration(
  characterId: string,
  update: Pick<
    CharacterUpdate,
    'published' | 'publishedAt' | 'publishRewarded' | 'moderation' | 'reportCount'
  >
) {
  await db('character').updateOne(
    { _id: characterId, kind: 'character' },
    { $set: { ...update, updatedAt: now() } }
  )
  return db('character').findOne({ _id: characterId, kind: 'character' })
}

export async function bulkUpdate(
  userId: string,
  charIds: string[],
  update: { folder?: string; addTag?: string; removeTag?: string }
) {
  const set: UpdateFilter<AppSchema.Character> = {}

  if (update.folder) {
    set.folder = update.folder
  }

  if (update.addTag) {
    set.$push = { tags: update.addTag }
  }

  if (update.removeTag) {
    set.$pull = { tags: update.removeTag }
  }

  const result = await db('character').updateMany(
    { where: { userId, _id: { $in: charIds } } },
    { $set: set }
  )

  return result.matchedCount
}

export async function partialUpdateCharacter(id: string, userId: string, char: CharacterUpdate) {
  const edit = { ...char, updatedAt: now() }

  await db('character').updateOne({ _id: id, userId }, { $set: edit })
  return getCharacter(userId, id)
}

export async function getCharacter(
  userId: string,
  id: string
): Promise<AppSchema.Character | undefined> {
  const char = await db('character').findOne({ _id: id, userId })
  return char || undefined
}

/** The user's current unfinished wizard draft, if any. One draft per user. */
export async function getDraftCharacter(userId: string) {
  const char = await db('character').findOne({ userId, kind: 'character', draft: true })
  return char || undefined
}

export async function getCharacters(userId: string) {
  const list = await db('character')
    // Hide unfinished wizard drafts from the My AI list.
    .find({ userId, draft: { $ne: true } })
    .project({
      _id: 1,
      userId: 1,
      name: 1,
      avatar: 1,
      description: 1,
      favorite: 1,
      tags: 1,
      createdAt: 1,
      updatedAt: 1,
      voice: 1,
      xp: 1,
      children: 1,
      match: 1,
      published: 1,
      moderation: 1,
      reportCount: 1,
      parent: 1,
      voiceDisabled: 1,
      folder: 1,
      // The My AI list filters and cards need these: gender/artStyle/nsfw/category
      // drive the filter chips and tag search; progression/loraName render the
      // stage badge and archetype/LoRA pills. Without them the filters match
      // nothing (undefined !== 'female') and the pills never show.
      gender: 1,
      artStyle: 1,
      ageRange: 1,
      nsfw: 1,
      category: 1,
      progression: 1,
      loraName: 1,
    })
    .toArray()

  return list
}

export async function deleteCharacter(opts: { charId: string; userId: string }) {
  await db('character').deleteOne({ _id: opts.charId, userId: opts.userId, kind: 'character' }, {})
  const chats = await db('chat').find({ characterId: opts.charId, userId: opts.userId }).toArray()
  await db('chat-message').deleteMany({ chatId: { $in: chats.map((ch) => ch._id) } })
  await db('chat').deleteMany({ characterId: opts.charId, userId: opts.userId })
}

export async function getCharacterList(charIds: string[], userId?: string) {
  const project = {
    _id: 1,
    userId: 1,
    name: 1,
    avatar: 1,
    description: 1,
    favorite: 1,
    tags: 1,
    createdAt: 1,
    updatedAt: 1,
    voice: 1,
    parent: 1,
    xp: 1,
    match: 1,
    children: 1,
    visualType: 1,
    sprite: 1,
    voiceDisabled: 1,
    folder: 1,
  }
  if (userId) {
    const list = await db('character')
      .find({ $or: [{ _id: { $in: charIds } }, { userId }] })
      .project(project)
      .toArray()
    return list
  }

  const list = await db('character')
    .find({ _id: { $in: charIds } })
    .project(project)
    .toArray()
  return list
}
