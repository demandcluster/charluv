import { assertValid } from '/common/valid'
import { store } from '../../db'
import { handle } from '../wrap'

export const redeemPromoCode = handle(async ({ userId, body }) => {
  assertValid({ code: 'string' }, body)
  const result = await store.promo.redeemPromo(userId!, body.code)
  return { user: result.user, credits: result.credits, days: result.days }
})
