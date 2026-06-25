import { Router } from 'express'
import { assertValid } from '/common/valid'
import { store } from '../db'
import { isAdmin, loggedIn } from './auth'
import { StatusError, handle } from './wrap'
import { getLiveCounts, sendAll, sendOne } from './ws/bus'
import { encryptText } from '../db/util'

const router = Router()

router.use(loggedIn, isAdmin)

const searchUsers = handle(async (req) => {
  const { body } = req
  assertValid(
    { username: 'string?', page: 'number?', customerId: 'string?', subscribed: 'boolean?' },
    body
  )
  const users = await store.admin.getUsers({
    username: body.username,
    customerId: body.customerId,
    subscribed: body.subscribed,
    page: body.page,
  })

  return { users: users.map((u) => ({ ...u, hash: undefined })) }
})

const impersonateUser = handle(async (req) => {
  const userId = req.params.userId
  const user = await store.users.getUser(userId)
  if (!user) {
    throw new StatusError('User not found', 404)
  }

  const token = await store.users.createAccessToken(user.username, user)
  return { token }
})

const setUserPassword = handle(async (req) => {
  assertValid({ userId: 'string', password: 'string' }, req.body)
  await store.admin.changePassword({ userId: req.body.userId, password: req.body.password })
  return { success: true }
})

const getUserInfo = handle(async ({ params }) => {
  const info = await store.admin.getUserInfo(params.id)
  return info
})

// --- Character moderation: stage-2 review of live published characters ---

const getPublished = handle(async () => {
  const characters = await store.characters.getPublishedForReview()
  return { characters }
})

/** Stage-2 actions on a live published character. */
const moderatePublished = handle(async ({ params, body, userId }) => {
  assertValid({ action: 'string', reason: 'string?' }, body)
  const char = await store.characters.getCharacterById(params.id)
  if (!char) throw new StatusError('Character not found', 404)

  // Optional moderator note, relayed to the character's owner.
  const reason = body.reason?.trim()
  const suffix = reason ? ` Reason: ${reason}` : ''

  switch (body.action) {
    case 'reviewed':
      await store.characters.setCharacterModeration(char._id, {
        moderation: {
          ...(char.moderation || { status: 'approved' }),
          status: char.moderation?.status === 'hidden' ? 'hidden' : 'approved',
          moderated: true,
          moderatedBy: userId!,
          moderatedAt: Date.now(),
        },
      })
      return { success: true }

    case 'unpublish':
      await store.characters.setCharacterModeration(char._id, {
        published: false,
        moderation: {
          ...(char.moderation || { status: 'approved' }),
          status: 'hidden',
          moderated: true,
          moderatedBy: userId!,
          moderatedAt: Date.now(),
        },
      })
      sendOne(char.userId, {
        type: 'admin-notification',
        message: `Your public character "${char.name}" has been unpublished by a moderator.${suffix}`,
      })
      return { success: true }

    case 'delete':
      await store.reports.resolveReportsForChar(char._id, userId!)
      await store.characters.adminDeleteCharacter(char._id)
      sendOne(char.userId, {
        type: 'admin-notification',
        message: `Your public character "${char.name}" was removed by a moderator.${suffix}`,
      })
      return { success: true }

    default:
      throw new StatusError('Unknown action', 400)
  }
})

// --- Reports queue ---

const getReports = handle(async () => {
  const reports = await store.reports.getOpenReports()
  const charIds = [...new Set(reports.map((r) => r.charId))]
  const chars = await Promise.all(charIds.map((id) => store.characters.getCharacterById(id)))
  const byId = new Map(chars.filter(Boolean).map((c) => [c!._id, c!]))

  // Group reports per character with its current state.
  const groups = charIds.map((id) => {
    const char = byId.get(id)
    const charReports = reports.filter((r) => r.charId === id)
    return {
      charId: id,
      name: char?.name,
      avatar: char?.avatar,
      userId: char?.userId,
      published: char?.published,
      status: char?.moderation?.status,
      reportCount: charReports.length,
      reasons: charReports.map((r) => ({ reason: r.reason, note: r.note, createdAt: r.createdAt })),
    }
  })

  return { reports: groups }
})

/** Admin action on a reported character. */
const resolveReport = handle(async ({ params, body, userId }) => {
  assertValid({ action: 'string', reason: 'string?' }, body)
  const char = await store.characters.getCharacterById(params.id)
  await store.reports.resolveReportsForChar(params.id, userId!)
  if (!char) return { success: true }

  // Optional moderator note, relayed to the character's owner.
  const reason = body.reason?.trim()
  const suffix = reason ? ` Reason: ${reason}` : ''

  switch (body.action) {
    case 'dismiss':
      // Reports unfounded — restore visibility and clear the count.
      await store.characters.setCharacterModeration(char._id, {
        published: true,
        reportCount: 0,
        moderation: {
          ...(char.moderation || { status: 'approved' }),
          status: 'approved',
          moderated: true,
          moderatedBy: userId!,
          moderatedAt: Date.now(),
        },
      })
      return { success: true }

    case 'hide':
      await store.characters.setCharacterModeration(char._id, {
        published: false,
        moderation: {
          ...(char.moderation || { status: 'approved' }),
          status: 'hidden',
          moderated: true,
          moderatedBy: userId!,
          moderatedAt: Date.now(),
        },
      })
      sendOne(char.userId, {
        type: 'admin-notification',
        message: `Your public character "${char.name}" has been taken down after reports.${suffix}`,
      })
      return { success: true }

    case 'delete':
      await store.characters.adminDeleteCharacter(char._id)
      sendOne(char.userId, {
        type: 'admin-notification',
        message: `Your public character "${char.name}" was removed after reports.${suffix}`,
      })
      return { success: true }

    default:
      throw new StatusError('Unknown action', 400)
  }
})

const notifyAll = handle(async ({ body }) => {
  assertValid({ message: 'string', level: 'number?' }, body)
  sendAll({ type: 'admin-notification', message: body.message, level: body.level })

  return { success: true }
})

const getMetrics = handle(async () => {
  const { entries: counts, maxLiveCount } = getLiveCounts()
  const metrics = await store.users.getMetrics()

  const connected = counts.map((count) => count.count).reduce((prev, curr) => prev + curr, 0)
  const versioned = counts.map((count) => count.versioned).reduce((prev, curr) => prev + curr, 0)
  const shas = counts.reduce((prev, curr) => {
    for (const [sha, count] of Object.entries(curr.shas)) {
      if (!prev[sha]) prev[sha] = 0
      prev[sha] += count
    }
    return prev
  }, {} as Record<string, number>)

  const threshold = Date.now() - 30000
  return {
    ...metrics,
    connected,
    versioned,
    maxLiveCount,
    shas,
    each: counts.filter((c) => c.date.valueOf() >= threshold),
  }
})

const updateConfiguration = handle(async ({ body }) => {
  assertValid(
    {
      slots: 'string',
      maintenance: 'boolean',
      maintenanceMessage: 'string',
      apiAccess: ['off', 'users', 'subscribers', 'admins'],
      policiesEnabled: 'boolean',
      termsOfService: 'string',
      privacyStatement: 'string',
      enabledAdapters: ['string'],
      imagesEnabled: 'boolean',
      imagesHost: 'string',
      ttsAccess: ['off', 'users', 'subscribers', 'admins'],
      ttsHost: 'string',
      ttsApiKey: 'string?',
      imagesModels: ['any'],
      supportEmail: 'string',
      googleClientId: 'string',
      modPrompt: 'string',
      modFieldPrompt: 'string',
      modPresetId: 'string',
      modSchema: 'any',
      charlibPublish: ['off', 'users', 'subscribers', 'moderators', 'admins'],
      charlibGuidelines: 'string',
    },
    body
  )

  const update = {
    kind: 'configuration' as const,
    privacyUpdated: '',
    tosUpdated: '',
    maxGuidanceTokens: 1000,
    maxGuidanceVariables: 15,
    ...body,
  }

  if (!update.ttsApiKey) {
    delete update.ttsApiKey
  } else {
    update.ttsApiKey = encryptText(update.ttsApiKey)
  }

  const next = await store.admin.updateServerConfiguration(update)

  return next
})

const updateTier = handle(async (req) => {
  assertValid({ tierId: 'string' }, req.body)
  await store.users.updateUserTier(req.params.userId, req.body.tierId)
  return { success: true }
})

const clearRestriction = handle(async (req) => {
  const userId = req.params.userId
  if (!userId) throw new StatusError('Missing userId', 400)
  await store.users.clearRestriction(userId)
  return { success: true }
})

router.post('/impersonate/:userId', impersonateUser)
router.post('/users', searchUsers)
router.post('/users/:userId/tier', updateTier)
router.post('/users/:userId/clear-restriction', clearRestriction)
router.get('/metrics', getMetrics)
router.get('/published', getPublished)
router.post('/published/:id', moderatePublished)
router.get('/reports', getReports)
router.post('/reports/:id', resolveReport)
router.get('/users/:id/info', getUserInfo)
router.post('/user/password', setUserPassword)
router.post('/notify', notifyAll)
router.post('/configuration', updateConfiguration)

export default router
