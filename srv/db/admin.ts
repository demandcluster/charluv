import { Filter } from 'mongodb'
import { db } from './client'
import { encryptPassword } from './util'
import { AppSchema } from '../../common/types/schema'
import { domain } from '../domains'
import { config } from '../config'
import { PUBLISH_DEFAULTS, PUBLISH_MIN } from '../../common/publish'

type UsersOpts = {
  username?: string
  page?: number
  subscribed?: boolean
  customerId?: string
}

export async function getServerConfiguration() {
  const next: AppSchema.Configuration = {
    kind: 'configuration',
    apiAccess: 'off',
    enabledAdapters: [],
    maintenance: !!config.ui.maintenance,
    maintenanceMessage: config.ui.maintenance || '',
    policiesEnabled: config.ui.policies,
    privacyStatement: '',
    privacyUpdated: new Date().toISOString(),
    slots: '',
    termsOfService: '',
    tosUpdated: new Date().toISOString(),
    imagesEnabled: false,
    imagesHost: '',
    imagesModels: [],
    supportEmail: '',
    ttsAccess: 'off',
    ttsApiKey: '',
    ttsHost: '',
    maxGuidanceTokens: 1000,
    maxGuidanceVariables: 15,
    googleClientId: '',
    googleEnabled: false,
    charlibPublish: 'off',
    charlibGuidelines: '',
    publishDailyFree: PUBLISH_DEFAULTS.dailyFree,
    publishDailyPremium: PUBLISH_DEFAULTS.dailyPremium,
    publishReward: PUBLISH_DEFAULTS.reward,
    publishMinGreeting: PUBLISH_MIN.greeting,
    publishMinDescription: PUBLISH_MIN.description,
    publishMinScenario: PUBLISH_MIN.scenario,
    publishMinPersonality: PUBLISH_MIN.personality,
    modFieldPrompt: '',
    modPresetId: '',
    modPrompt: '',
    modSchema: [],
    actionCalls: [],
    lockSeconds: 0,
  }

  const cfg = await db('configuration').findOne({ kind: 'configuration' })
  if (cfg) {
    // Backfill any field added in a newer version so an older stored config
    // still exposes every field (the admin form needs them all to save).
    // Existing values win; only missing keys fall back to defaults. No migration.
    return { ...next, ...cfg }
  }

  await db('configuration').insertOne(next)
  return next
}

export async function updateServerConfiguration(update: Partial<AppSchema.Configuration>) {
  await db('configuration').updateOne({ kind: 'configuration' }, { $set: update }, { upsert: true })
  const cfg = await getServerConfiguration()
  return cfg
}

export async function getUsers(opts: UsersOpts = {}) {
  const filter: Filter<AppSchema.User> = {}
  const skip = (opts.page || 0) * 200

  if (opts.username || opts.subscribed || opts.customerId) {
    const filters: (typeof filter)['$or'] = []

    if (opts.username) {
      filters.push(
        { username: { $regex: new RegExp(opts.username.trim(), 'gi') } },
        { _id: opts.username.trim() }
      )
    }

    if (opts.subscribed) {
      filters.push({ $or: [{ 'sub.level': { $gt: -1 } }, { 'patreon.sub.level': { $gt: -1 } }] })
    }

    if (opts.customerId) {
      filters.push({ 'billing.customerId': opts.customerId })
      filters.push({ patreonUserId: opts.customerId })
      filters.push({ 'patreon.user.attributes.email': opts.customerId })
      filters.push({ 'google.email': opts.customerId })
    }

    filter.$or = filters
  }

  const list = await db('user').find(filter).skip(skip).limit(200).toArray()
  return list
}

export async function changePassword(opts: { userId: string; password: string }) {
  const hash = await encryptPassword(opts.password)
  await db('user').updateOne({ _id: opts.userId }, { $set: { hash } })
  return true
}

/** Resolve `p`, but fall back to `value` if it doesn't settle within `ms`. */
function withTimeout<T>(p: Promise<T>, ms: number, value: T): Promise<T> {
  return Promise.race([
    p.catch(() => value),
    new Promise<T>((resolve) => setTimeout(() => resolve(value), ms)),
  ])
}

export async function getUserInfo(userId: string) {
  // Run everything in parallel and bound the slow pieces so the admin info
  // request can never hang (Cloudflare 524). The subscription aggregate replays
  // the user's full billing event stream (Stripe/PayPal/Patreon) and the counts
  // scan large collections — any one of these can be slow for a heavy account.
  const [billing, profile, chats, characters, state] = await Promise.all([
    db('user').findOne(
      { _id: userId },
      {
        projection: {
          username: 1,
          sub: 1,
          manualSub: 1,
          billing: 1,
          patreon: 1,
          stripeSessions: 1,
          google: 1,
        },
      }
    ),
    db('profile').findOne({ userId }),
    withTimeout(db('chat').countDocuments({ userId }), 8000, -1),
    withTimeout(db('character').countDocuments({ userId }), 8000, -1),
    withTimeout(domain.subscription.getAggregate(userId), 8000, undefined as any),
  ])

  return {
    userId,
    chats,
    characters,
    handle: profile?.handle,
    avatar: profile?.avatar,
    state,
    ...billing,
  }
}
