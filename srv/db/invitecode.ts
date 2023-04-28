import { v4 } from 'uuid'
import { db } from './client'
import { AppSchema } from './schema'

export async function checkInviteCode(
    _id:any){
  const char = await db('invitecode').findOne({ kind: 'invitecode', _id: _id.toUpperCase(),count: { $gt: 0 } })
  
  return char?.kind?true:false
}

export async function getInviteCode(){
const char = await db('invitecode').findOne({ kind: 'invitecode', public: true, count: { $gt: 0 } })

return char?._id||null
}



export async function takeInviteCode( id: string) {
  // convert id to uppercase
  const uppercaseId = id.toUpperCase()

  const list = await db('invitecode').updateOne({ kind: 'invitecode', _id: id.toUpperCase() }, { $inc: { count: -1 } })
  return list
}


