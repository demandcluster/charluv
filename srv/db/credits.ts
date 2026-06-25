import { errors, StatusError } from '../api/wrap'
import { db } from './client'
import { sendOne } from '../api/ws'

export async function updateCredits(userId: string, amount: number, nextCredits: number = 0) {
  const user = await db('user').findOne({ kind: 'user', _id: userId })
  if (!user) {
    throw errors.NotFound
  }
  const credits = user.credits + amount

  const nc = nextCredits > 0 ? nextCredits : user.nextCredits
  await db('user')
    .updateOne({ kind: 'user', _id: userId }, { $set: { credits, nextCredits: nc } })
    .catch((err) => {
      throw new StatusError('Database error', 500)
    })

  sendOne(userId, { type: 'credits-updated', credits })

  return { credits }
}

export async function getFreeCredits() {
  const now = new Date().getTime()
  const nextTime: number = Number(now) + 120000

  const users = await db('user')
    .find({ kind: 'user', nextCredits: { $lte: now }, premium: false, credits: { $lt: 500 }, creditsRestricted: { $ne: true } })
    .toArray()
  const premiumUsers = await db('user')
    .find({ kind: 'user', nextCredits: { $lte: now }, credits: { $lt: 5000 }, premium: true, creditsRestricted: { $ne: true } })
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
  for (const usr of expiredPremium) {
    // set premiumstatus to false
    if (
      usr.billing?.status !== 'active' &&
      new Date(usr.manualSub?.expiresAt ?? 0).getTime() < now &&
      usr.patreon?.member?.attributes.patron_status !== 'active_patron'
    ) {
      console.log('---DEACTIVATE PREMIUM---', usr._id)
      await db('user')
        .updateOne({ kind: 'user', _id: usr._id }, { $set: { premium: false } })
        .catch((err) => {
          throw new StatusError('Database error', 500)
        })
    }
  }
}
