import { Router } from 'express'
import { assertValid } from 'frisker'
import { store } from '../db'
import { v4 } from 'uuid'
import { loggedIn } from './auth'
import { handle, StatusError } from './wrap'
//import { handleUpload } from './upload'
import { now } from '../db/util'
import { PERSONA_FORMATS } from '../../common/adapters'

const router = Router()

const valid = {
  name: 'string',
  avatar: 'string?',
  scenario: 'string',
  greeting: 'string',
  sampleChat: 'string',
  match: 'boolean',
  xp: 'number',

  premium: 'boolean',
  description: 'string',
  persona: {
    kind: PERSONA_FORMATS,
    attributes: 'any',
  },
} as const

const getMatches = handle(async (req) => {
  //console.log(loggedIn())

  const { userId } = req?.user || { userId: '' }
  const chars = await store.matches.getMatches(userId)
  const ownChars = await store.characters.getCharacters(userId)
  // return all chars that are now in ownChars
  const newChars = chars.filter((char) => {
    return !ownChars.some((ownChar) => {
      return ownChar.parent === char._id
    })
  })

  return { characters: newChars }
})
const GENDERS = ['female', 'male', 'nonbinary'] as const
const ART_STYLES = ['realistic', 'anime'] as const

/** Only accept primitive strings; reject objects/arrays (e.g. `?gender[$ne]=x`) to prevent operator injection. */
const str = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined)
const oneOf = <T extends string>(v: unknown, allowed: readonly T[]): T | undefined => {
  const s = str(v)
  return s && (allowed as readonly string[]).includes(s) ? (s as T) : undefined
}

const discover = handle(async (req) => {
  const { userId } = req?.user || { userId: '' }
  const q = req.query as Record<string, unknown>
  const sort = q.sort === 'new' || q.sort === 'popular' ? q.sort : 'trending'
  const skip = Number(str(q.skip))
  const limit = Number(str(q.limit))
  const characters = await store.matches.discover(userId, {
    gender: oneOf(q.gender, GENDERS),
    artStyle: oneOf(q.artStyle, ART_STYLES),
    category: str(q.category),
    nsfw: str(q.nsfw) === 'false' ? false : undefined,
    search: str(q.search),
    sort,
    skip: Number.isFinite(skip) ? skip : undefined,
    limit: Number.isFinite(limit) ? limit : undefined,
  })
  return { characters }
})

const createCharacter = handle(async (req) => {
  // const body = await handleUpload(req, { ...valid, persona: 'string' })
  // const userId=params.user?.userId
  const id = req.params.id || ''
  const { userId } = req?.user || { userId: '' }

  const matchChar = await store.matches.getMatch(userId, id)
  const oldId = matchChar?._id.toString()
  const newChar = matchChar
  if (newChar) {
    newChar.match = false
    newChar.xp = 0
    newChar.parent = oldId
    newChar._id = v4()
    newChar.userId = userId
    newChar.createdAt = now()
    newChar.updatedAt = now()
  }
  if (newChar?._id) {
    const char = await store.characters.createCharacter(userId!, newChar)
    return char
  } else {
    return false
  }
})

router.use(loggedIn)
//router.post('/', createMatch)
router.get('/', getMatches)
router.get('/discover', discover)
router.post('/:id', createCharacter)
//router.post('/:id', editMatch)
//router.get('/:id', getMatch)
//router.delete('/:id', deleteMatch)

export default router
