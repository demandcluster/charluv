import { v4 } from 'uuid'
import { db } from './client'
import { AppSchema } from '../../common/types/schema'
import { now } from './util'

export type CharacterUpdate = Partial<
  Pick<
    AppSchema.Character,
    | 'name'
    | 'avatar'
    | 'persona'
    | 'sampleChat'
    | 'greeting'
    | 'scenario'
    | 'description'
    | 'culture'
    | 'tags'
    | 'favorite'
    | 'match'
    | 'xp'
    | 'share'
    | 'premium'
    | 'voice'
    | 'alternateGreetings'
    | 'characterBook'
    | 'extensions'
    | 'systemPrompt'
    | 'postHistoryInstructions'
    | 'creator'
    | 'characterVersion'
    | 'appearance'
    | 'sprite'
    | 'visualType'
  >
>

export async function createCharacter(
  userId: string,
  char: Pick<
    AppSchema.Character,
    | 'name'
    | 'appearance'
    | 'avatar'
    | 'persona'
    | 'sampleChat'
    | 'greeting'
    | 'scenario'
    | 'description'
    | 'culture'
    | 'tags'
    | 'favorite'
    | 'match'
    | 'xp'
    | 'premium'
    | 'share'
    | 'voice'
    | 'alternateGreetings'
    | 'characterBook'
    | 'extensions'
    | 'systemPrompt'
    | 'postHistoryInstructions'
    | 'creator'
    | 'characterVersion'
    | 'sprite'
    | 'visualType'
  >
) {
  const newChar: AppSchema.Character = {
    _id: v4(),
    kind: 'character',
    userId,
    createdAt: now(),
    updatedAt: now(),
    ...char,
  }

  await db('character').insertOne(newChar)
  return newChar
}

export async function updateCharacter(id: string, userId: string, char: CharacterUpdate) {
  const edit = { ...char, updatedAt: now() }
  if (edit.avatar === undefined) {
    delete edit.avatar
  }
  await db('character').updateOne({ _id: id, userId }, { $set: edit })
  return getCharacter(userId, id)
}

export async function getPublicCharacter(name: string) {
  const char = await db('character').findOne({ kind: 'character', name: name, match: true })
  return char
}

export async function getSubmitted() {
  const list = await db('character').find({ kind: 'character', share: 'submitted' }).toArray()
  return list || []
}

export async function declineSubmitted(characterId: string, userId: string, reason: string) {
  const shareReason = `declined:${reason}`
  console.log('char', characterId, userId, reason)
  const update = { share: shareReason, updatedAt: now() }

  await db('character').updateOne({ _id: characterId, userId }, { $set: update })
  return { characterId, userId, reason }
}

function clearChar(char?: any) {
  if (!char._id && !char.userId && !char.updatedAt && !char.createdAt) return char
  delete char?._id
  delete char?.userId
  delete char?.updatedAt
  delete char?.createdAt
  return char
}

export async function acceptSubmitted(characterId: string, userId: string, amount: string) {
  const update = { share: 'accepted', updatedAt: now() }
  await db('character').updateOne({ _id: characterId, userId }, { $set: update })
  const char = await db('character').findOne({ kind: 'character', _id: characterId })
  const admin = await db('user').findOne({ kind: 'user', admin: true, username: 'admin' })
  if (!admin || !char) return
  char.share = 'private'
  char.xp = 0

  await createCharacter(admin?._id, clearChar(char))
  await db('user').updateOne({ _id: userId }, { $inc: { credits: parseInt(amount) } })

  return { characterId, userId, amount }
}

export async function getCharacter(
  userId: string,
  id: string
): Promise<AppSchema.Character | undefined> {
  const char = await db('character').findOne({ _id: id, userId })
  return char || undefined
}

export async function getCharacters(userId: string) {
  const list = await db('character').find({ userId }).toArray()
  return list
}

export async function deleteCharacter(opts: { charId: string; userId: string }) {
  await db('character').deleteOne({ _id: opts.charId, userId: opts.userId, kind: 'character' }, {})
  const chats = await db('chat').find({ characterId: opts.charId, userId: opts.userId }).toArray()
  await db('chat-message').deleteMany({ chatId: { $in: chats.map((ch) => ch._id) } })
  await db('chat').deleteMany({ characterId: opts.charId, userId: opts.userId })
}

export async function getCharacterList(charIds: string[]) {
  const list = await db('character')
    .find({ _id: { $in: charIds } })
    .toArray()
  return list
}
