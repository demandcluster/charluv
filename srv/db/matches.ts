import { v4 } from 'uuid'
import { db } from './client'
import { AppSchema } from '../../common/types/schema'
import { now } from './util'

export async function getMatch(userId: string, id: string) {
  const char = await db('character').findOne({ kind: 'character', _id: id, match: true })

  return char
}

export async function getMatches(userId: string) {
  const user = await db('user').findOne({ kind: 'user', _id: userId })
  const premium = user?.premium || false
  const list = await db('character')
    .find({ kind: 'character', match: true, $or: [{ premium: false }, { premium: premium }] })
    .toArray()
  return list
}

export async function getMatchList(charIds: string[]) {
  const list = await db('character')
    .find({ _id: { $in: charIds }, kind: 'character' })
    .toArray()
  return list
}

export type DiscoverSort = 'trending' | 'popular' | 'new'

export type DiscoverFilter = {
  gender?: AppSchema.Character['gender']
  artStyle?: AppSchema.Character['artStyle']
  category?: string
  nsfw?: boolean
  search?: string
  sort?: DiscoverSort
  skip?: number
  limit?: number
}

/**
 * Discover gallery query. Returns public template characters (`match: true`),
 * premium-gated by the user, with facet filters and an engagement-based sort.
 * Unlike the legacy swipe flow, picking a character does not remove it here —
 * the template persists for everyone; selecting it clones a personal copy.
 */
export async function discover(userId: string, filter: DiscoverFilter = {}) {
  const user = await db('user').findOne({ kind: 'user', _id: userId })
  const premium = user?.premium || false

  const query: any = {
    kind: 'character',
    match: true,
    draft: { $ne: true },
    $or: [{ premium: false }, { premium }],
  }

  // Defensive: only ever place primitive strings into the query so a malformed
  // caller can't inject Mongo operators (e.g. { $ne: ... }) via these fields.
  if (typeof filter.gender === 'string') query.gender = filter.gender
  if (typeof filter.artStyle === 'string') query.artStyle = filter.artStyle
  if (typeof filter.category === 'string') query.category = filter.category
  if (filter.nsfw === false) query.nsfw = { $ne: true }
  if (typeof filter.search === 'string') query.$text = { $search: filter.search }

  const sort: any =
    filter.sort === 'new'
      ? { createdAt: -1 }
      : filter.sort === 'popular'
      ? { 'engagement.chats': -1, createdAt: -1 }
      : { 'engagement.trending': -1, 'engagement.chats': -1, createdAt: -1 }

  const limit = Math.min(filter.limit ?? 60, 200)
  const skip = Math.max(filter.skip ?? 0, 0)

  const list = await db('character').find(query).sort(sort).skip(skip).limit(limit).toArray()
  return list
}

/**
 * Increment an aggregated engagement counter on the public template character.
 * A personal copy (with a `parent`) rolls its activity up to the template that
 * is shown in Discover; a template increments itself.
 */
export async function incrementEngagement(
  characterId: string,
  field: 'chats' | 'messages' | 'favorites',
  by: number = 1,
  parentId?: string
) {
  let targetId = parentId
  if (targetId === undefined) {
    const char = await db('character').findOne(
      { _id: characterId },
      { projection: { parent: 1 } }
    )
    targetId = char?.parent || characterId
  }
  await db('character').updateOne({ _id: targetId }, { $inc: { [`engagement.${field}`]: by } })
}
