import { assertValid } from '/common/valid'
import { store } from '../../db'
import { handle, StatusError } from '../wrap'

export const register = handle(async (req) => {
  assertValid(
    { handle: 'string', username: 'string', password: 'string', invitecode: 'string' },
    req.body
  )
  const valid = await store.invitecode.checkInviteCode(req.body.invitecode)
  if (!valid) {
    throw new StatusError('Invalid invite code', 403)
    return
  }
  const alreadyRegisterd = await store.users.checkIp(req.ip)

  if (alreadyRegisterd) {
    throw new StatusError('Only 1 account per IP', 403)
  }

  const { profile, token, user } = await store.users.createUser(req.body)
  await store.invitecode.takeInviteCode(req.body.invitecode)

  req.log.info({ user: user.username, id: user._id }, 'User registered')
  return { profile, token, user }
})

export const login = handle(async (req) => {
  assertValid({ username: 'string', password: 'string' }, req.body)
  const result = await store.users.authenticate(req.body.username.trim(), req.body.password)

  if (!result) {
    throw new StatusError('Unauthorized', 401)
  }
  const storeIp = await store.users.updateIp(result.user._id, req.ip)

  return result
})

export const changePassword = handle(async (req) => {
  assertValid({ password: 'string' }, req.body)
  await store.admin.changePassword({ userId: req.userId, password: req.body.password })
  return { success: true }
})
