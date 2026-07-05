import needle from 'needle'
import { config } from '../../config'
import { StatusError } from '../wrap'
import { AppSchema, Patreon } from '../../../common/types'
import { getCachedTiers } from '../../db/subscriptions'
import { store } from '../../db'
import { command } from '../../domains'
import { sendOne } from '../ws'
import { logger } from '../../middleware'

export const patreon = {
  authorize,
  identity,
  revalidatePatron,
  initialVerifyPatron,
  persistPatron,
  getCampaignTiers,
}

async function authorize(code: string, refresh?: boolean, redirectUri?: string) {
  const form = new URLSearchParams()
  form.append('code', code)
  // The token exchange's redirect_uri MUST be identical to the one the browser
  // used at the authorize step. Prefer the caller-supplied value (derived from
  // the actual site origin); fall back to the configured default.
  form.append('redirect_uri', redirectUri || config.patreon.redirect)
  form.append('client_id', config.patreon.client_id)
  form.append('client_secret', config.patreon.client_secret)
  form.append('grant_type', refresh ? 'refresh_token' : 'authorization_code')

  if (refresh) {
    form.append('refresh_token', code)
  }

  const result = await needle('post', `https://www.patreon.com/api/oauth2/token`, form, {
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
  })

  if (result.statusCode && result.statusCode > 200) {
    // Surface Patreon's actual error (e.g. invalid_grant, redirect_uri mismatch)
    // instead of swallowing it — both in the logs and the message.
    logger.error(
      { statusCode: result.statusCode, body: result.body },
      'Patreon token exchange failed'
    )
    const detail =
      result.body && typeof result.body === 'object'
        ? result.body.error_description || result.body.error
        : undefined
    throw new StatusError(`Unable to verify Patreon account${detail ? `: ${detail}` : ''}`, 400)
  }

  const user: Patreon.Authorize = result.body
  return user
}

const memberProps = [
  'patron_status',
  'last_charge_date',
  'last_charge_status',
  'next_charge_date',
  'is_gifted',
  'currently_entitled_amount_cents',
  'pledge_relationship_start',
  'campaign_lifetime_support_cents',
  'will_pay_amount_cents',
]

const identityKeys = [
  `fields[user]=created,email,full_name`,
  `include=memberships.currently_entitled_tiers.campaign`,
  `fields[member]=${memberProps.join(',')}`,
  `fields[tier]=amount_cents,title,description`,
  `fields[campaign]=url,vanity`,
]

async function identity(token: string) {
  const query = encodeURI(identityKeys.join('&'))
  const identity = await needle('get', `https://www.patreon.com/api/oauth2/v2/identity?${query}`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  })

  if (identity.statusCode && identity.statusCode > 200) {
    throw new StatusError(`Failed to get Patreon user information (${identity.statusCode})`, 400)
  }

  const user: Patreon.User = identity.body.data
  const included: Patreon.Include[] = identity.body.included || []

  const campaignTiers = included.filter(
    (obj): obj is Patreon.Tier =>
      obj.type === 'tier' && obj.relationships.campaign?.data?.id === config.patreon.campaign_id
  )
  const campaignTierIds = new Set(campaignTiers.map((t) => t.id))

  /**
   * Members don't carry a campaign relationship in this payload, so we identify the relevant
   * member by their entitled tiers belonging to our campaign, then fall back to the active member.
   * This keeps `member` (and therefore patron_status/next_charge_date) available even when tier
   * mapping is imperfect.
   */
  const members = included.filter((obj): obj is Patreon.Member => obj.type === 'member')
  const member =
    members.find((m) =>
      m.relationships.currently_entitled_tiers?.data?.some((d) => campaignTierIds.has(d.id))
    ) ||
    members.find((m) => m.attributes.patron_status === 'active_patron') ||
    members[0]

  const entitledTierIds = new Set(
    member?.relationships.currently_entitled_tiers?.data?.map((d) => d.id) || []
  )
  // The campaign-wide fallback exists for paying patrons whose entitled-tier data
  // is missing (annual/custom pledges, payload quirks). A free member/follower has
  // no entitlements and must NOT inherit a paid campaign tier from it.
  const paying =
    member?.attributes.patron_status === 'active_patron' || member?.attributes.is_gifted === true
  const tier =
    pickHighestTier(campaignTiers.filter((t) => entitledTierIds.has(t.id))) ||
    (paying ? pickHighestTier(campaignTiers) : undefined)

  if (!tier && !member) return { user }

  const contrib =
    member?.attributes.currently_entitled_amount_cents || tier?.attributes.amount_cents || 0
  const sub = contrib ? getPatronSubscriptionTier(contrib) : undefined

  return { tier, sub, user, member }
}

// When Patreon omits `next_charge_date` (annual/custom pledges, payload quirks), fall back to
// roughly one billing cycle out — NOT the OAuth token `expires`, which can be hours away and
// would drop an active patron into the credits-cron `expiredPremium` sweep every couple minutes.
const PATRON_FALLBACK_MS = 32 * 24 * 60 * 60 * 1000

function patronPremiumUntil(nextChargeDate?: string | null) {
  return nextChargeDate ? new Date(nextChargeDate).getTime() : Date.now() + PATRON_FALLBACK_MS
}

async function revalidatePatron(userId: string | AppSchema.User) {
  const user = typeof userId === 'string' ? await store.users.getUser(userId) : userId
  if (!user?.patreon) {
    throw new StatusError(`Patreon account is not linked`, 400)
  }

  /**
   * Token refreshing
   */
  const now = new Date().toISOString()
  if (user.patreon.expires <= now) {
    const token = await authorize(user.patreon.refresh_token, true)
    const next: AppSchema.User['patreon'] = {
      ...user.patreon,
      ...token,
      expires: new Date(Date.now() + token.expires_in * 1000).toISOString(),
    }
    // Refreshing the OAuth token says nothing about entitlement — persist only the new token.
    // Writing `premium: false` here used to leave the user non-premium if identity() below threw
    // or a concurrent request read the row before premium was restored.
    await store.users.updateUser(user._id, { patreon: next })
    user.patreon = next
  }

  const patron = await identity(user.patreon.access_token)

  const existing = await store.users.findByPatreonUserId(patron.user.id)
  if (existing && existing._id !== user._id) {
    sendOne(user._id, {
      type: 'notification',
      level: 'warn',
      message:
        'Your patreon account was already assigned to an account. It has been unlinked from that account.',
      ttl: 20,
    })

    await store.users.unlinkPatreonAccount(existing._id, `attributing to user ${user._id}`)
  }

  // Same gate as persistPatron: linking/resyncing must not grant premium to a
  // free member — they have no next_charge_date, so the 32-day fallback would
  // hand out renewable premium. Existing premium is left to expire via the cron.
  const isActivePatron =
    patron.member?.attributes.patron_status === 'active_patron' ||
    patron.member?.attributes.is_gifted === true ||
    (patron.sub?.level ?? 0) > 0
  const premiumUntil = patronPremiumUntil(patron.member?.attributes.next_charge_date)
  const next = await store.users.updateUser(user._id, {
    ...(isActivePatron ? { premium: true, premiumUntil } : {}),
    patreon: {
      ...user.patreon,
      user: patron.user,
      member: patron.member,
      tier: patron.tier,
      sub: patron.sub ? { tierId: patron.sub._id, level: patron.sub.level } : undefined,
    },
    patreonUserId: patron.user.id,
  })
  await command.patron.link(patron.user.id, { userId: user._id })
  return next
}

function pickHighestTier(tiers: Patreon.Tier[]) {
  return tiers.reduce<Patreon.Tier | undefined>((prev, curr) => {
    if (!prev) return curr
    return curr.attributes.amount_cents > prev.attributes.amount_cents ? curr : prev
  }, undefined)
}

function getPatronSubscriptionTier(contrib: number) {
  const sub = getCachedTiers().reduce<AppSchema.SubscriptionTier | undefined>((prev, curr) => {
    if (!curr.enabled || curr.deletedAt) return prev
    if (!curr.patreon?.tierId) return prev
    if (curr.patreon.cost > contrib) return prev

    if (!prev) return curr
    if (prev.patreon?.cost! > curr.patreon.cost) return prev
    return curr
  }, undefined)

  return sub
}

async function initialVerifyPatron(userId: string, code: string, redirectUri?: string) {
  const token = await patreon.authorize(code, false, redirectUri)
  const patron = await identity(token.access_token)

  const existing = await store.users.findByPatreonUserId(patron.user.id)
  if (existing && existing._id !== userId) {
    throw new StatusError(`This Patreon account is already attributed to another user`, 400)
  }

  return persistPatron(userId, token, patron)
}

/**
 * Persist a verified Patreon authorization onto a user and grant premium for an
 * active patron. Shared by the link flow (`initialVerifyPatron`) and the
 * Patreon login-that-creates-an-account flow, which has already exchanged the
 * single-use code for a token and can't authorize again.
 */
async function persistPatron(
  userId: string,
  token: Patreon.Authorize,
  patron: Awaited<ReturnType<typeof identity>>
) {
  const expires = new Date(Date.now() + token.expires_in * 1000).toISOString()

  /**
   * Grant premium consistently with `revalidatePatron`: any active patron gets premium, not only
   * those whose tier could be mapped to a local sub. Tier mapping can fail (campaign payload quirks,
   * annual/custom tiers) and must not block premium for a paying patron.
   */
  const isActivePatron =
    patron.member?.attributes.patron_status === 'active_patron' ||
    patron.member?.attributes.is_gifted === true ||
    (patron.sub?.level ?? 0) > 0
  const premiumUntil = patronPremiumUntil(patron.member?.attributes.next_charge_date)

  const next = await store.users.updateUser(userId, {
    patreon: {
      ...token,
      expires,
      user: patron.user,
      member: patron.member,
      tier: patron.tier,
      sub: patron.sub ? { tierId: patron.sub._id, level: patron.sub.level } : undefined,
    },
    patreonUserId: patron.user.id,
    ...(isActivePatron ? { premium: true, premiumUntil } : {}),
  })
  if (next && isActivePatron) {
    next.premium = true
    next.premiumUntil = premiumUntil
  }

  return next
}

/**
 * Latest creator token: the rotated pair persisted on the configuration doc
 * wins over the (possibly stale) env pair.
 */
async function getCreatorAccessToken() {
  const cfg = await store.admin.getServerConfiguration()
  return cfg.patreonCreatorToken?.access_token || config.patreon.access_token
}

/**
 * Refresh the creator token and persist the rotated pair. Patreon invalidates
 * the old refresh token on use, so losing the new pair would strand us — hence
 * the DB write. Returns the fresh access token, or undefined if refresh failed.
 */
async function refreshCreatorToken() {
  const cfg = await store.admin.getServerConfiguration()
  const refreshToken = cfg.patreonCreatorToken?.refresh_token || config.patreon.refresh_token

  if (!refreshToken || !config.patreon.client_id || !config.patreon.client_secret) {
    logger.error(
      'Cannot refresh Patreon creator token: PATREON_REFRESH_TOKEN (or client id/secret) not configured'
    )
    return
  }

  try {
    const token = await authorize(refreshToken, true)
    const patreonCreatorToken = {
      access_token: token.access_token,
      refresh_token: token.refresh_token,
      expires: new Date(Date.now() + token.expires_in * 1000).toISOString(),
    }
    await store.admin.updateServerConfiguration({ patreonCreatorToken })
    logger.info('Refreshed Patreon creator token')
    return patreonCreatorToken.access_token
  } catch (ex) {
    // authorize() already logged Patreon's error body
    return
  }
}

function fetchCampaignTiers(accessToken: string) {
  const query = ['include=tiers', 'fields[tier]=amount_cents,title,description'].join('&')
  return needle(
    'get',
    `https://www.patreon.com/api/oauth2/v2/campaigns/${config.patreon.campaign_id}?${encodeURI(
      query
    )}`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    }
  )
}

async function getCampaignTiers() {
  let res = await fetchCampaignTiers(await getCreatorAccessToken())

  // Expired creator token — refresh, persist the rotated pair, and retry once.
  if (res.statusCode === 401) {
    const refreshed = await refreshCreatorToken()
    if (refreshed) res = await fetchCampaignTiers(refreshed)
  }

  if (res.statusCode && res.statusCode > 200) {
    logger.warn(
      { statusCode: res.statusCode, body: res.body?.errors || res.body },
      'Failed to fetch Patreon campaign tiers'
    )
    return []
  }

  return (res.body.included || []) as Array<Omit<Patreon.Tier, 'relationships'>>
}
