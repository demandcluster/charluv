import { assertValid } from '/common/valid'
import { store } from '../../db'
import { errors, handle, StatusError } from '../wrap'
import { classifyRegistration } from '/common/abuse'
import { OAuthScope, oauthScopes } from '/common/types'
import { patreon } from './patreon'
import { getSafeUserConfig } from './settings'
import { OAuth2Client } from 'google-auth-library'
import { createAccessToken, toSafeUser } from '/srv/db/user'
import { config } from '../../config'

const GOOGLE = new OAuth2Client()

export const register = handle(async (req) => {
  assertValid(
    {
      handle: 'string',
      username: 'string',
      password: 'string',
      fingerprint: 'string?',
      consent: 'boolean?',
    },
    req.body
  )

  if (req.body.consent !== true) {
    throw new StatusError('You must accept the identifier policy to register', 400)
  }

  const fpMatch = await store.users.checkFingerprint(req.body.fingerprint)
  const ipMatch = await store.users.checkIp(req.ip)
  const verdict = classifyRegistration({ fpMatch, ipMatch })

  if (verdict === 'block') {
    throw new StatusError(
      'Only 1 account per device/IP. Go to our Discord if you lost your password.',
      403
    )
  }

  const restrictedReason =
    fpMatch && ipMatch ? 'both' : fpMatch ? 'fingerprint' : ipMatch ? 'ip' : undefined

  const { profile, token, user } = await store.users.createUser(req.body, false, {
    restricted: verdict === 'restrict',
    restrictedReason,
    fingerprint: req.body.fingerprint,
    ip: req.ip,
    consentAt: new Date().toISOString(),
  })

  req.log.info({ user: user.username, id: user._id, verdict }, 'User registered')
  return { profile, token, user }
})

export const login = handle(async (req) => {
  assertValid({ username: 'string', password: 'string' }, req.body)
  const result = await store.users.authenticate(req.body.username.trim(), req.body.password)

  if (!result) {
    throw new StatusError('Unauthorized', 401)
  }
  await store.users.updateIp(result.user._id, req.ip)

  return result
})

export const oathGoogleLogin = handle(async (req) => {
  const { body, ip, log } = req
  assertValid({ token: 'string', fingerprint: 'string?' }, body)

  const config = await store.admin.getServerConfiguration().catch(() => undefined)

  if (!config?.googleClientId) {
    throw new StatusError('Not allowed', 405)
  }

  const token = await GOOGLE.verifyIdToken({
    idToken: body.token,
    audience: config.googleClientId,
  })

  const payload = token.getPayload()
  if (!payload) throw new StatusError('Could not verify Google token', 401)
  if (!payload.email || !payload.sub) throw new StatusError('Could not verify Google token', 401)

  // Already linked → straight login.
  const existing = await store.users.findByGoogleSub(payload.sub)
  if (existing) {
    await store.users.updateUser(existing._id, { google: payload as any })
    const accessToken = await createAccessToken(existing.username, existing)
    const profile = await store.users.getProfile(existing._id)
    return { user: toSafeUser(existing), token: accessToken, profile }
  }

  // No linked account: creating one is fine, but it must clear the same
  // multi-account abuse check as a normal registration. If this device/IP
  // already owns an account, refuse to spin up a second — point them at their
  // existing account + the profile link flow instead.
  const fpMatch = await store.users.checkFingerprint(body.fingerprint)
  const ipMatch = await store.users.checkIp(ip)
  const verdict = classifyRegistration({ fpMatch, ipMatch })

  if (verdict === 'block') {
    throw new StatusError(
      'An account already exists on this device. Sign in to it, then link Google from your profile to enable Google sign-in.',
      403
    )
  }

  const restrictedReason =
    fpMatch && ipMatch ? 'both' : fpMatch ? 'fingerprint' : ipMatch ? 'ip' : undefined

  const newuser = await store.users.createUser(
    {
      username: `google_${payload.sub}`,
      handle: payload.name || 'You',
      password: '',
    },
    false,
    {
      restricted: verdict === 'restrict',
      restrictedReason,
      fingerprint: body.fingerprint,
      ip,
      // Implied consent: the login page states that signing in agrees to the
      // Terms + 18+, mirroring the register flow's consent stamp.
      consentAt: new Date().toISOString(),
    }
  )
  await store.users.updateUser(newuser.user._id, { google: payload as any })
  log.info(
    { user: newuser.user.username, id: newuser.user._id, verdict },
    'User registered (Google OAuth)'
  )
  return newuser
})

/**
 * Sign in with Patreon. If the Patreon account is already linked, that account
 * logs in. Otherwise we create one — behind the same multi-account abuse check
 * as Google login and normal registration — so a device/IP that already owns an
 * account is told to sign in and link Patreon instead of making a second.
 */
export const oauthPatreonLogin = handle(async (req) => {
  const { body, ip, log } = req
  assertValid({ code: 'string', fingerprint: 'string?', url: 'string?' }, body)

  if (!config.patreon.client_id) {
    throw new StatusError('Not allowed', 405)
  }

  const token = await patreon.authorize(body.code, false, patreonRedirect(body.url))
  const patron = await patreon.identity(token.access_token)

  // Already linked → straight login.
  const existing = await store.users.findByPatreonUserId(patron.user.id)
  if (existing) {
    const accessToken = await createAccessToken(existing.username, existing)
    const profile = await store.users.getProfile(existing._id)
    await store.users.updateIp(existing._id, ip)
    return { user: toSafeUser(existing), token: accessToken, profile }
  }

  // No linked account: create one, but only if it clears the abuse check.
  const fpMatch = await store.users.checkFingerprint(body.fingerprint)
  const ipMatch = await store.users.checkIp(ip)
  const verdict = classifyRegistration({ fpMatch, ipMatch })

  if (verdict === 'block') {
    throw new StatusError(
      'An account already exists on this device. Sign in to it, then link Patreon from your profile to enable Patreon sign-in.',
      403
    )
  }

  const restrictedReason =
    fpMatch && ipMatch ? 'both' : fpMatch ? 'fingerprint' : ipMatch ? 'ip' : undefined

  const newuser = await store.users.createUser(
    {
      username: `patreon_${patron.user.id}`,
      handle: patron.user.attributes?.full_name || 'You',
      password: '',
    },
    false,
    {
      restricted: verdict === 'restrict',
      restrictedReason,
      fingerprint: body.fingerprint,
      ip,
      consentAt: new Date().toISOString(),
    }
  )

  // Store the Patreon link + premium onto the fresh account (we already hold the
  // token; the single-use code can't be re-authorized).
  await patreon.persistPatron(newuser.user._id, token, patron)
  log.info(
    { user: newuser.user.username, id: newuser.user._id, verdict },
    'User registered (Patreon OAuth)'
  )

  const fresh = (await store.users.getUser(newuser.user._id)) || newuser.user
  const accessToken = await createAccessToken(fresh.username, fresh)
  const profile = await store.users.getProfile(fresh._id)
  return { user: toSafeUser(fresh), token: accessToken, profile }
})

export const unlinkGoogleAccount = handle(async ({ userId }) => {
  const user = await store.users.getUser(userId)
  if (!user) throw new StatusError('User not found', 404)

  if (!user.google?.sub) throw new StatusError('Account not linked with Google', 400)
  if (`google_${user.google.sub}` === user.username) {
    throw new StatusError('Account registered using Google - Cannot be unlinked', 400)
  }

  const next = await store.users.updateUser(userId, { google: null as any })
  return { user: next }
})

export const linkGoogleAccount = handle(async ({ body, userId }) => {
  assertValid({ token: 'string' }, body)

  const user = await store.users.getUser(userId)
  const config = await store.admin.getServerConfiguration().catch(() => undefined)

  if (!config?.googleClientId) {
    throw new StatusError('Not allowed', 405)
  }

  if (!user) throw new StatusError('Unauthorized: Account not found', 401)
  if (user.google?.sub) throw new StatusError('Account already linked to Google', 400)

  const token = await GOOGLE.verifyIdToken({
    idToken: body.token,
    audience: config.googleClientId,
  })

  const payload = token.getPayload()
  if (!payload) throw new StatusError('Could not verify Google token', 401)
  if (!payload.email || !payload.sub) throw new StatusError('Could not verify Google token', 401)

  const next = await store.users.updateUser(userId, { google: payload as any })
  return { user: toSafeUser(next!) }
})

export const changePassword = handle(async (req) => {
  assertValid({ password: 'string' }, req.body)
  await store.admin.changePassword({ userId: req.userId, password: req.body.password })
  return { success: true }
})

export const createApiKey = handle(async (req) => {
  assertValid({ scopes: ['string?'] }, req.body)

  const scopes: OAuthScope[] = []
  for (const scope of req.body.scopes || []) {
    assertValid({ scope: oauthScopes }, scope)
    scopes.push(scope as OAuthScope)
  }

  const code = await store.oauth.prepare(req.userId, req.header('origin') || 'unknown', scopes)
  return { code }
})

export const verifyOauthKey = handle(async (req) => {
  assertValid({ code: 'string' }, req.body)

  const apiKey = await store.oauth.activateKey(req.userId, req.body.code)
  return { key: apiKey }
})

export const remoteLogin = handle(async (req) => {
  const user = await store.users.getUser(req.userId)
  if (!user) throw errors.Unauthorized

  const token = await store.users.createRemoteAccessToken(user.username, user)
  return { token }
})

export const resyncPatreon = handle(async (req) => {
  await patreon.revalidatePatron(req.userId)
  const next = await getSafeUserConfig(req.userId)
  // Re-issue the JWT so its embedded `premium` flag reflects the just-synced state.
  const token = next ? await createAccessToken(next.username, next) : undefined
  return { user: next, token }
})

// The token exchange's redirect_uri must exactly match the one the browser used
// at the authorize step. The client sends the origin it used; accept it only if
// it's a well-formed `.../oauth/patreon` URL (otherwise fall back to config).
// Patreon also validates it against the app's registered URIs, so this can't be
// abused as an open redirect.
function patreonRedirect(raw?: string) {
  if (typeof raw === 'string' && /^https?:\/\/[a-z0-9.-]+(:\d+)?\/oauth\/patreon$/i.test(raw)) {
    return raw
  }
  return undefined
}

export const verifyPatreonOauth = handle(async (req) => {
  const { body } = req
  assertValid({ code: 'string', url: 'string?' }, body)
  await patreon.initialVerifyPatron(req.userId, body.code, patreonRedirect(body.url))
  const user = await getSafeUserConfig(req.userId)
  // Re-issue the JWT so its embedded `premium` flag reflects the newly linked account.
  const token = user ? await createAccessToken(user.username, user) : undefined
  return { success: true, user, token }
})

export const unlinkPatreon = handle(async (req) => {
  await store.users.unlinkPatreonAccount(req.userId, 'user initiated')

  return { success: true }
})
