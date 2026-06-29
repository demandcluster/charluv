import { db } from './client'
import { AppSchema } from '../../common/types/schema'

export async function getMatch(userId: string, id: string) {
  // Premium gate: a premium template is visible only to premium viewers (guests
  // and free users get premium=false). Mirrors the gallery query (discover /
  // getMatches) — without this, a premium character hidden from the gallery is
  // still returned by direct ID, leaking its profile and feeding the clone flow.
  const user = userId ? await db('user').findOne({ kind: 'user', _id: userId }) : undefined
  const premium = user?.premium || false

  // A public template is either a legacy admin-curated char (match) or a
  // user-published one (published), and must not be hidden by moderation.
  const char = await db('character').findOne({
    kind: 'character',
    _id: id,
    'moderation.status': { $ne: 'hidden' },
    $and: [
      { $or: [{ match: true }, { published: true }] },
      { $or: [{ premium: false }, { premium }] },
    ],
  })

  if (!char) return char

  // A shared character always presents as level 0 — the publisher's own XP is
  // irrelevant to everyone else (and clones start fresh anyway).
  const [creatorName] = await creatorNames([char.userId])
  return { ...char, xp: 0, creatorName }
}

/**
 * Resolve the public display name (profile handle) for each creator userId, in
 * the same order. A transient, response-only join — never stored on the char.
 */
async function creatorNames(userIds: string[]) {
  const unique = Array.from(new Set(userIds.filter(Boolean)))
  if (!unique.length) return userIds.map(() => undefined)
  const profiles = await db('profile')
    .find({ kind: 'profile', userId: { $in: unique } })
    .toArray()
  const byUser = new Map(profiles.map((p) => [p.userId, p.handle]))
  return userIds.map((id) => byUser.get(id))
}

export async function getMatches(userId: string) {
  const user = await db('user').findOne({ kind: 'user', _id: userId })
  const premium = user?.premium || false
  const list = await db('character')
    .find({
      kind: 'character',
      'moderation.status': { $ne: 'hidden' },
      $and: [
        { $or: [{ match: true }, { published: true }] },
        { $or: [{ premium: false }, { premium: premium }] },
      ],
    })
    .toArray()
  // Shared templates always present as level 0 (publisher XP is irrelevant).
  return list.map((c) => ({ ...c, xp: 0 }))
}

export async function getMatchList(charIds: string[]) {
  const list = await db('character')
    .find({ _id: { $in: charIds }, kind: 'character' })
    .toArray()
  return list
}

/** Relative weights for the blended Discover popularity score. A clone (full
 * adoption) outweighs a favourite, a started chat, then raw message volume. */
const POP_WEIGHTS = { clone: 10, favorite: 4, chat: 2, message: 0.2 }

/** Trailing window (days) that defines "recent" for the trending sort. */
const TRENDING_WINDOW_DAYS = 30

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
    draft: { $ne: true },
    // Discovery surfaces ONLY user-published characters now. The legacy
    // admin-curated "match" templates are no longer discoverable, so the page is
    // intentionally empty until the publishing system populates it. Never show
    // anything taken down by moderation/reports.
    'moderation.status': { $ne: 'hidden' },
    published: true,
    $or: [{ premium: false }, { premium }],
  }

  // Defensive: only ever place primitive strings into the query so a malformed
  // caller can't inject Mongo operators (e.g. { $ne: ... }) via these fields.
  // 'trans' is the canonical third gender; older editor-written chars stored
  // 'nonbinary' for the same thing, so the Trans filter must match either. The
  // $in is built from the validated literal, not caller input, so it's safe.
  if (filter.gender === 'trans') query.gender = { $in: ['trans', 'nonbinary'] }
  else if (typeof filter.gender === 'string') query.gender = filter.gender
  if (typeof filter.artStyle === 'string') query.artStyle = filter.artStyle
  if (typeof filter.category === 'string') query.category = filter.category
  if (filter.nsfw === false) query.nsfw = { $ne: true }
  if (typeof filter.search === 'string') query.$text = { $search: filter.search }

  const limit = Math.min(filter.limit ?? 60, 200)
  const skip = Math.max(filter.skip ?? 0, 0)

  // All-time popularity blends both signals. `children` (clone count) carries
  // real historical data from the original Charluv; `engagement.*` is new and
  // accrues going forward. A clone is the strongest adoption signal, then
  // favourites, then chats started, then raw message volume (noisiest, lowest).
  const popularity = {
    $add: [
      { $multiply: [{ $ifNull: ['$children', 0] }, POP_WEIGHTS.clone] },
      { $multiply: [{ $ifNull: ['$engagement.favorites', 0] }, POP_WEIGHTS.favorite] },
      { $multiply: [{ $ifNull: ['$engagement.chats', 0] }, POP_WEIGHTS.chat] },
      { $multiply: [{ $ifNull: ['$engagement.messages', 0] }, POP_WEIGHTS.message] },
    ],
  }

  const pipeline: any[] = [{ $match: query }, { $addFields: { _pop: popularity } }]

  if (filter.sort === 'new') {
    // Freshest first.
    pipeline.push({ $sort: { createdAt: -1 } })
  } else if (filter.sort === 'popular') {
    // All-time blended score.
    pipeline.push({ $sort: { _pop: -1, createdAt: -1 } })
  } else {
    // Trending = recent only: every clone is a child character doc, so count the
    // copies made within the trailing window. Falls back to all-time popularity
    // then recency for templates with no recent clones.
    const cutoff = new Date(Date.now() - TRENDING_WINDOW_DAYS * 86_400_000).toISOString()
    pipeline.push(
      {
        $lookup: {
          from: 'character',
          let: { tid: '$_id' },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [{ $eq: ['$parent', '$$tid'] }, { $gte: ['$createdAt', cutoff] }],
                },
              },
            },
            { $count: 'n' },
          ],
          as: '_recent',
        },
      },
      { $addFields: { _trend: { $ifNull: [{ $arrayElemAt: ['$_recent.n', 0] }, 0] } } },
      { $sort: { _trend: -1, _pop: -1, createdAt: -1 } }
    )
  }

  pipeline.push(
    { $skip: skip },
    { $limit: limit },
    { $project: { _pop: 0, _trend: 0, _recent: 0 } }
  )

  const list = await db('character').aggregate(pipeline).toArray()
  const names = await creatorNames(list.map((c) => c.userId))
  // Shared characters always present as level 0 — the publisher's XP is theirs
  // alone and shouldn't show in the gallery or carry into a clone.
  return list.map((c, i) => ({ ...c, xp: 0, creatorName: names[i] }))
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
    const char = await db('character').findOne({ _id: characterId }, { projection: { parent: 1 } })
    targetId = char?.parent || characterId
  }
  await db('character').updateOne({ _id: targetId }, { $inc: { [`engagement.${field}`]: by } })
}
