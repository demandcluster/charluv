import { errors, StatusError } from '../api/wrap'
import { getChat } from './chats'
import { db } from './client'
import { sendOne } from '../api/ws'
import { AppSchema } from './schema'

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
  const nextTime: number = Number(now) + 60000

  // anit cheat
  // check users that have more than one account on the same ip and give them credits accordingly

  const duplicateIPUsers = await db('user')
    .aggregate([
      {
        $match: {
          kind: 'user',
          nextCredits: { $lte: now },
          premium: false,
          credits: { $lt: 200 },
        },
      },
      {
        $group: {
          _id: '$lastIp',
          userIds: { $push: '$_id' },
          count: { $sum: 1 },
        },
      },
      {
        $match: {
          count: { $gt: 1 },
        },
      },
    ])
    .toArray()

  for (const { userIds } of duplicateIPUsers) {
    let groupCreditsToAdd = Math.max(Math.floor(8 / userIds.length), 1)

    for (const userId of userIds) {
      const user = await db('user').findOne({ kind: 'user', _id: userId })
      if (user) {
        const updatedCredits = Math.min(
          user.credits + groupCreditsToAdd,
          Math.floor(400 / userIds.length)
        )
        if (updatedCredits > user.credits) {
          const credits = await updateCredits(userId, updatedCredits - user.credits, nextTime)
          sendOne(userId, { type: 'credits-updated', credits })
        }
      }
    }
  }
  // end of Ronnies evil

  const users = await db('user')
    .find({ kind: 'user', nextCredits: { $lte: now }, premium: false, credits: { $lt: 200 } })
    .toArray()
  const premiumUsers = await db('user')
    .find({ kind: 'user', nextCredits: { $lte: now }, credits: { $lt: 1000 }, premium: true })
    .toArray()
  const expiredPremium = await db('user')
    .find({ kind: 'user', premiumUntil: { $lte: now }, premium: true })
    .toArray()

  for (const usr of users) {
    const lastCredits = usr.nextCredits || now + 1
    const diff = now - lastCredits

    const creditsToAdd = Math.max(Math.floor(diff / 120000), 1) * 10
    const updatedCredits = Math.min(usr.credits + creditsToAdd, 200)
    if (updatedCredits > usr.credits) {
      const credits = await updateCredits(usr._id, updatedCredits - usr.credits, nextTime)
      sendOne(usr._id, { type: 'credits-updated', credits })
    }
  }
  for (const usr of premiumUsers) {
    const lastCredits = usr.nextCredits || now + 1
    const diff = now - lastCredits

    const creditsToAdd = Math.max(Math.floor(diff / 120000), 1) * 20
    const updatedCredits = Math.min(usr.credits + creditsToAdd, 1000)

    if (updatedCredits > usr.credits) {
      const credits = await updateCredits(usr._id, updatedCredits - usr.credits, nextTime)

      sendOne(usr._id, { type: 'credits-updated', credits })
    }
  }
  for (const usr of expiredPremium) {
    // set premiumstatus to false
    await db('user')
      .updateOne({ kind: 'user', _id: usr._id }, { $set: { premium: false } })
      .catch((err) => {
        throw new StatusError('Database error', 500)
      })
  }
}
