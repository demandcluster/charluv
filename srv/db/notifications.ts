import { v4 } from 'uuid'
import { db } from './client'
import { now } from './util'
import { AppSchema } from '/common/types'

/** Persist a per-user notification. Returns the stored doc. */
export async function createNotification(userId: string, message: string, level?: number) {
  const doc: AppSchema.Notification = {
    _id: v4(),
    kind: 'notification',
    userId,
    message,
    level,
    createdAt: now(),
  }
  await db('notification').insertOne(doc)
  return doc
}

/** Notifications not yet pushed to a live socket, oldest first. */
export async function getUndelivered(userId: string) {
  return db('notification')
    .find({ userId, deliveredAt: { $exists: false } })
    .sort({ createdAt: 1 })
    .toArray()
}

/**
 * Mark notifications delivered so they aren't replayed again on the next login.
 * Scoped to the owner so a client ack can only ever clear its own notifications.
 */
export async function markDelivered(userId: string, ids: string[]) {
  if (!ids.length) return
  await db('notification').updateMany(
    { _id: { $in: ids }, userId },
    { $set: { deliveredAt: now() } }
  )
}
