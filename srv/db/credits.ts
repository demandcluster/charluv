import { errors, StatusError } from '../api/wrap'
import { db } from './client'
import { sendOne } from '../api/ws'
import { getUserSubscriptionTier } from '../../common/util'
import { getCachedTiers } from './subscriptions'

export async function updateCredits(userId: string, amount: number, nextCredits: number = 0) {
  // Atomic $inc (not read-modify-write) so concurrent spends/refills can't lose
  // updates; spends additionally require the balance to cover the amount so a
  // race can't drive it negative.
  const filter: Record<string, any> = { kind: 'user', _id: userId }
  if (amount < 0) filter.credits = { $gte: -amount }

  const update: Record<string, any> = { $inc: { credits: amount } }
  if (nextCredits > 0) update.$set = { nextCredits }

  const result = await db('user')
    .findOneAndUpdate(filter, update, { returnDocument: 'after' })
    .catch(() => {
      throw new StatusError('Database error', 500)
    })

  const updated = result.value
  if (!updated) {
    const exists = await db('user').findOne({ kind: 'user', _id: userId })
    if (!exists) throw errors.NotFound
    throw errors.MissingCredits
  }

  sendOne(userId, { type: 'credits-updated', credits: updated.credits })

  return { credits: updated.credits }
}

export async function getFreeCredits() {
  const now = new Date().getTime()
  const nextTime: number = Number(now) + 120000

  const users = await db('user')
    .find({
      kind: 'user',
      nextCredits: { $lte: now },
      premium: false,
      credits: { $lt: 500 },
      creditsRestricted: { $ne: true },
    })
    .toArray()
  const premiumUsers = await db('user')
    .find({
      kind: 'user',
      nextCredits: { $lte: now },
      credits: { $lt: 5000 },
      premium: true,
      creditsRestricted: { $ne: true },
    })
    .toArray()
  const expiredPremium = await db('user')
    .find({
      kind: 'user',
      premiumUntil: { $lte: now },
      premium: true,
    })
    .toArray()

  for (const usr of users) {
    const lastCredits = usr.nextCredits || now + 1
    const diff = now - lastCredits

    const creditsToAdd = Math.max(Math.floor(diff / 120000), 1) * 5
    const updatedCredits = Math.min(usr.credits + creditsToAdd, 500)
    if (updatedCredits > usr.credits) {
      await updateCredits(usr._id, updatedCredits - usr.credits, nextTime)
      sendOne(usr._id, { type: 'recharged', amount: creditsToAdd })
      // sendOne(usr._id, { type: 'credits-updated', credits })
    }
  }
  for (const usr of premiumUsers) {
    const lastCredits = usr.nextCredits || now + 1
    const diff = now - lastCredits

    const creditsToAdd = Math.max(Math.floor(diff / 120000), 1) * 20
    const updatedCredits = Math.min(usr.credits + creditsToAdd, 5000)

    if (updatedCredits > usr.credits) {
      await updateCredits(usr._id, updatedCredits - usr.credits, nextTime)
      sendOne(usr._id, { type: 'recharged', amount: creditsToAdd })
      //  sendOne(usr._id, { type: 'credits-updated', credits })
    }
  }
  const tiers = getCachedTiers()
  for (const usr of expiredPremium) {
    // Only deactivate if the user has no active entitlement across ANY source.
    // Use the same canonical resolver that grants premium (native/paypal/patreon/manual)
    // so the revoke path can't disagree with the grant path and flip an active patron.
    const sub = getUserSubscriptionTier(usr, tiers)
    const stillEntitled =
      usr.billing?.status === 'active' ||
      new Date(usr.manualSub?.expiresAt ?? 0).getTime() >= now ||
      usr.patreon?.member?.attributes.patron_status === 'active_patron' ||
      (sub?.level ?? 0) > 0

    // set premiumstatus to false
    if (!stillEntitled) {
      console.log('---DEACTIVATE PREMIUM---', usr._id)
      await db('user')
        .updateOne({ kind: 'user', _id: usr._id }, { $set: { premium: false } })
        .catch((err) => {
          throw new StatusError('Database error', 500)
        })
    }
  }
}
