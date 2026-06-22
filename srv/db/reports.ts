import { v4 } from 'uuid'
import { db } from './client'
import { now } from './util'
import { AppSchema } from '../../common/types/schema'

/**
 * File a report against a published character. One report per (reporter, char):
 * a repeat report by the same user is a no-op. Returns the current count of
 * distinct, unresolved reports so the caller can apply the auto-hide threshold.
 */
export async function createReport(input: {
  charId: string
  charOwnerId: string
  reporterId: string
  reason: string
  note?: string
}): Promise<{ created: boolean; count: number }> {
  const existing = await db('character-report').findOne({
    charId: input.charId,
    reporterId: input.reporterId,
  })

  let created = false
  if (!existing) {
    const report: AppSchema.CharacterReport = {
      _id: v4(),
      kind: 'character-report',
      charId: input.charId,
      charOwnerId: input.charOwnerId,
      reporterId: input.reporterId,
      reason: input.reason,
      note: input.note,
      createdAt: now(),
      resolved: false,
    }
    await db('character-report').insertOne(report)
    created = true
  }

  const count = await db('character-report').countDocuments({
    charId: input.charId,
    resolved: { $ne: true },
  })

  return { created, count }
}

/** Open (unresolved) reports, grouped per character for the admin queue. */
export async function getOpenReports() {
  return db('character-report')
    .find({ resolved: { $ne: true } })
    .sort({ createdAt: -1 })
    .toArray()
}

/** Mark every open report for a character as resolved (admin actioned it). */
export async function resolveReportsForChar(charId: string, adminId: string) {
  await db('character-report').updateMany(
    { charId, resolved: { $ne: true } },
    { $set: { resolved: true, resolvedAt: now(), resolvedBy: adminId } }
  )
}
