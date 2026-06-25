import { v4 } from 'uuid'
import { db } from './client'
import { StatusError } from '../api/wrap'
import { updateCredits } from './credits'
import { getUser, updateUser, toSafeUser } from './user'
import { AppSchema } from '../../common/types'

const DAY_MS = 86_400_000

const now = () => new Date().toISOString()

/** Pure helper: new premiumUntil after adding `days`, extending the later of existing/now. */
export function extendPremium(premiumUntil: number, days: number, nowMs: number) {
  const base = (premiumUntil || 0) > nowMs ? premiumUntil : nowMs
  return base + days * DAY_MS
}

export async function getPromos() {
  return db('promo-code').find({ kind: 'promo-code' }).sort({ createdAt: -1 }).toArray()
}

export async function getPromoByCode(code: string) {
  return db('promo-code').findOne({ kind: 'promo-code', code: code.trim().toUpperCase() })
}

export async function createPromo(input: {
  code: string
  credits?: number
  days?: number
  maxUses: number
  enabled: boolean
  expiresAt?: string
  createdBy: string
}) {
  const code = input.code.trim().toUpperCase()
  if (!code) throw new StatusError('Code is required', 400)
  if (!input.credits && !input.days) {
    throw new StatusError('A code must grant credits and/or days', 400)
  }
  if (input.maxUses < 0) throw new StatusError('maxUses cannot be negative', 400)

  const existing = await db('promo-code').findOne({ kind: 'promo-code', code })
  if (existing) throw new StatusError('A code with that name already exists', 400)

  const promo: AppSchema.PromoCode = {
    _id: v4(),
    kind: 'promo-code',
    code,
    credits: input.credits || 0,
    days: input.days || 0,
    maxUses: input.maxUses,
    uses: 0,
    enabled: input.enabled,
    expiresAt: input.expiresAt || undefined,
    createdAt: now(),
    createdBy: input.createdBy,
  }

  await db('promo-code').insertOne(promo)
  return promo
}

export async function updatePromo(
  id: string,
  patch: Partial<
    Pick<AppSchema.PromoCode, 'code' | 'credits' | 'days' | 'maxUses' | 'enabled' | 'expiresAt'>
  >
) {
  const existing = await db('promo-code').findOne({ kind: 'promo-code', _id: id })
  if (!existing) throw new StatusError('Promo code not found', 404)

  const set: any = { updatedAt: now() }
  if (patch.code !== undefined) {
    const code = patch.code.trim().toUpperCase()
    if (!code) throw new StatusError('Code is required', 400)
    const clash = await db('promo-code').findOne({ kind: 'promo-code', code, _id: { $ne: id } })
    if (clash) throw new StatusError('A code with that name already exists', 400)
    set.code = code
  }
  if (patch.credits !== undefined) set.credits = patch.credits
  if (patch.days !== undefined) set.days = patch.days
  if (patch.maxUses !== undefined) set.maxUses = patch.maxUses
  if (patch.enabled !== undefined) set.enabled = patch.enabled
  if (patch.expiresAt !== undefined) set.expiresAt = patch.expiresAt || undefined

  const effCredits = patch.credits !== undefined ? patch.credits : existing.credits
  const effDays = patch.days !== undefined ? patch.days : existing.days
  if (!effCredits && !effDays) throw new StatusError('A code must grant credits and/or days', 400)

  await db('promo-code').updateOne({ kind: 'promo-code', _id: id }, { $set: set })
  return db('promo-code').findOne({ kind: 'promo-code', _id: id })
}

export async function deletePromo(id: string) {
  await db('promo-code').deleteOne({ kind: 'promo-code', _id: id })
}

export async function redeemPromo(userId: string, rawCode: string) {
  const code = (rawCode || '').trim().toUpperCase()
  if (!code) throw new StatusError('Please enter a code', 400)

  const promo = await db('promo-code').findOne({ kind: 'promo-code', code })
  if (!promo) throw new StatusError('Invalid promo code', 404)
  if (!promo.enabled) throw new StatusError('This code is no longer active', 400)
  if (promo.expiresAt && new Date(promo.expiresAt).valueOf() < Date.now()) {
    throw new StatusError('This code has expired', 400)
  }

  // Atomically claim a use slot (skip the guard entirely when unlimited).
  const filter: any = { kind: 'promo-code', _id: promo._id, enabled: true }
  if (promo.maxUses > 0) filter.$expr = { $lt: ['$uses', '$maxUses'] }
  const claimed = await db('promo-code').findOneAndUpdate(filter, { $inc: { uses: 1 } })
  // mongodb driver v5: findOneAndUpdate always returns ModifyResult { value: doc | null }
  const claimedDoc = claimed?.value
  if (!claimedDoc) throw new StatusError('This code has been fully used', 400)

  // Per-account lock via the unique (codeId,userId) index.
  try {
    await db('promo-redemption').insertOne({
      _id: v4(),
      kind: 'promo-redemption',
      codeId: promo._id,
      userId,
      code,
      credits: promo.credits || 0,
      days: promo.days || 0,
      createdAt: now(),
    })
  } catch (err: any) {
    await db('promo-code').updateOne({ kind: 'promo-code', _id: promo._id }, { $inc: { uses: -1 } })
    if (err?.code === 11000) throw new StatusError('You have already redeemed this code', 400)
    throw err
  }

  const credits = promo.credits || 0
  const days = promo.days || 0

  let creditsApplied = false
  try {
    if (credits > 0) {
      await updateCredits(userId, credits)
      creditsApplied = true
    }
    if (days > 0) {
      const user = await getUser(userId)
      if (!user) throw new StatusError('User not found', 404)
      const premiumUntil = extendPremium(user.premiumUntil || 0, days, Date.now())
      await updateUser(userId, { premium: true, premiumUntil })
    }
  } catch (err) {
    // Roll back so the user can retry: reverse any credits, drop the redemption, free the use slot.
    if (creditsApplied) await updateCredits(userId, -credits).catch(() => {})
    await db('promo-redemption')
      .deleteOne({ kind: 'promo-redemption', codeId: promo._id, userId })
      .catch(() => {})
    await db('promo-code')
      .updateOne({ kind: 'promo-code', _id: promo._id }, { $inc: { uses: -1 } })
      .catch(() => {})
    throw err
  }

  const user = await getUser(userId)
  if (!user) throw new StatusError('User not found', 404)
  return { user: toSafeUser(user), credits, days }
}
