import { randomBytes } from 'crypto'
import { getUser } from './user'
import { AppSchema, OAuthScope } from '../../common/types'
import { v4 } from 'uuid'
import { StatusError, errors } from '../api/wrap'
import { now } from './util'
import { db } from './client'

const KEY_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'

/**
 * Cryptographically secure random alphanumeric string. Uses rejection sampling
 * so the alphabet is sampled uniformly (a plain `byte % 62` would bias the
 * lower indices since 256 is not a multiple of 62).
 */
function secureToken(length: number) {
  const cutoff = 256 - (256 % KEY_ALPHABET.length)
  let out = ''
  while (out.length < length) {
    const bytes = randomBytes(length - out.length)
    for (const byte of bytes) {
      if (byte >= cutoff) continue
      out += KEY_ALPHABET[byte % KEY_ALPHABET.length]
    }
  }
  return out
}

async function getApiKeys(userId: string) {
  const keys = await db('apikey').find({ userId }).toArray()
  return keys
}

export async function prepare(userId: string, origin: string, scopes: OAuthScope[]) {
  const user = await getUser(userId)
  if (!user) throw errors.Unauthorized

  const key: AppSchema.ApiKey = {
    _id: v4(),
    kind: 'apikey',
    code: `${userId}__${v4()}`,
    apikey: 'sk-v1-' + secureToken(42),
    scopes,
    origin,
    userId,
    createdAt: now(),
    enabled: false,
  }

  await db('apikey').insertOne(key)

  return key.code
}

export async function activateKey(userId: string, code: string) {
  const key = await db('apikey').findOne({ userId, code })
  if (!key) throw new StatusError('Code not generate API key - Invalid code', 400)

  await db('apikey').updateOne({ _id: key._id }, { $set: { enabled: true } })
  return key.apikey
}

export async function verifyApiKey(apikey: string) {
  const [key] = await db('apikey')
    .aggregate([
      { $match: { apikey } },
      {
        $lookup: {
          from: 'user',
          localField: 'userId',
          foreignField: '_id',
          as: 'user',
        },
      },
      { $unwind: { path: '$user' } },
      {
        $project: {
          userId: 1,
          scopes: 1,
          'user.username': 1,
          'user.admin': 1,
        },
      },
    ])
    .limit(1)
    .toArray()

  if (!key) throw errors.Unauthorized

  return { scopes: key.scopes, userId: key.userId, username: key.username, admin: !!key.admin }
}

export async function getSafeUserKeys(userId: string) {
  const keys = await getApiKeys(userId)
  return keys.map((key) => ({ ...key, apikey: undefined, code: undefined }))
}
