import { store } from '../db'
import { AppLog } from '../middleware'
import { AppSchema } from '/common/types'

export type ResolvedSubscription = {
  level: number
  preset?: Partial<AppSchema.SubscriptionModel>
  error?: string
  warning?: string
  tier?: AppSchema.SubscriptionTier
}

export type GateResult = { error?: string; warning?: string }

/**
 * Centralised generation gating.
 *
 * Validates a resolved subscription against the user's *actual* entitlement:
 * subscription enabled, model available, tier/level sufficient, and guest
 * usage allowed. Previously this logic was duplicated inside handleHorde and
 * handleAgnaistic; both now call this so the rules live in one place.
 *
 * Returns `{ error }` to block generation (caller should yield the error and
 * stop) or `{ warning }` to surface a non-fatal notice.
 */
export async function validateGenerationGate(opts: {
  user: AppSchema.User
  guest?: string | boolean
  subscription?: ResolvedSubscription
  log?: AppLog
}): Promise<GateResult> {
  const { user, guest, subscription, log } = opts

  if (!subscription || !subscription.preset) {
    return { error: 'Subscriptions are not enabled' }
  }

  if (subscription.error) {
    return { error: subscription.error }
  }

  const preset = subscription.preset

  let newLevel = await store.users.validateSubscription(user)
  if (newLevel === undefined) {
    newLevel = -1
  }

  if (newLevel instanceof Error) {
    return { error: newLevel.message }
  }

  if (preset.subLevel !== undefined && preset.subLevel > -1 && preset.subLevel > newLevel) {
    log?.error(
      {
        preset: preset.name,
        presetLevel: preset.subLevel,
        newLevel,
        nativeLevel: user.sub?.level,
        patronLevel: user.patreon?.sub?.level,
      },
      `Subscription insufficient`
    )
    return { error: 'Your account is ineligible for this model - Subscription tier insufficient' }
  }

  if (!preset.allowGuestUsage && guest) {
    return { error: 'Please sign in to use this model' }
  }

  return { warning: subscription.warning }
}
