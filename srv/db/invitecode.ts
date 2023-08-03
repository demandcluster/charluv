import { v4 } from 'uuid'
import { db } from './client'
import { AppSchema } from '../../common/types/schema'

export async function checkInviteCode(_id: any) {
  const char = await db('invitecode').findOne({
    kind: 'invitecode',
    _id: _id.toUpperCase(),
    count: { $gt: 0 },
  })

  return char?.kind ? true : false
}

export async function getInviteCode() {
  const char = await db('invitecode').findOne({
    kind: 'invitecode',
    public: true,
    count: { $gt: 0 },
  })

  return char?._id || null
}

export async function takeInviteCode(id: string, user: string = '') {
  // convert id to uppercase
  const uppercaseId = id.toUpperCase()

  if (id === 'SALVADOR' || id === 'salvador') {
    const salv = await db('user').updateOne(
      { kind: 'user', _id: user },
      { $set: { credits: 5000 } }
    )
  }

  const list = await db('invitecode').updateOne(
    { kind: 'invitecode', _id: id.toUpperCase() },
    { $inc: { count: -1 } }
  )
  return list
}
