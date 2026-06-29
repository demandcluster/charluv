import { Router } from 'express'
import { assertValid } from '/common/valid'
import { store } from '../db'
import { isAdmin, loggedIn } from './auth'
import { StatusError, handle } from './wrap'

const router = Router()

router.use(loggedIn, isAdmin)

const list = handle(async () => {
  const codes = await store.promo.getPromos()
  return { codes }
})

const create = handle(async ({ userId, body }) => {
  assertValid(
    {
      code: 'string',
      credits: 'number?',
      days: 'number?',
      maxUses: 'number',
      enabled: 'boolean',
      expiresAt: 'string?',
    },
    body
  )
  const code = await store.promo.createPromo({
    code: body.code,
    credits: body.credits,
    days: body.days,
    maxUses: body.maxUses,
    enabled: body.enabled,
    expiresAt: body.expiresAt,
    createdBy: userId!,
  })
  return { code }
})

const update = handle(async ({ params, body }) => {
  if (!params.id) throw new StatusError('Missing id', 400)
  assertValid(
    {
      code: 'string?',
      credits: 'number?',
      days: 'number?',
      maxUses: 'number?',
      enabled: 'boolean?',
      expiresAt: 'string?',
    },
    body
  )
  const code = await store.promo.updatePromo(params.id, body)
  return { code }
})

const remove = handle(async ({ params }) => {
  if (!params.id) throw new StatusError('Missing id', 400)
  await store.promo.deletePromo(params.id)
  return { success: true }
})

router.get('/promo', list)
router.post('/promo', create)
router.post('/promo/:id', update)
router.delete('/promo/:id', remove)

export default router
