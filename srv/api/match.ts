import { Router } from 'express'
import { store } from '../db'
import { v4 } from 'uuid'
import { loggedIn } from './auth'
import { handle, errors } from './wrap'
//import { handleUpload } from './upload'
import { now } from '../db/util'

const router = Router()

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
const GENDERS = ['female', 'male', 'trans', 'nonbinary'] as const
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

  // Idempotent: if the user already cloned this template, return that existing
  // copy (its `parent` is the template id) instead of creating a duplicate.
  if (userId) {
    const existing = await store.characters.getUserCopyOfTemplate(userId, id)
    if (existing) return existing
  }

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
    // Start the personal copy's own popularity counters fresh — the template's
    // clone/engagement totals are not this copy's (and would mislead if the user
    // later publishes it). The clone itself rolls up to `parent` via the +1 in
    // createCharacter.
    newChar.children = 0
    delete (newChar as any).engagement
    delete (newChar as any).creatorName
  }
  if (newChar && req.body?.name) {
    newChar.name = String(req.body.name)
  }
  if (newChar?._id) {
    const char = await store.characters.createCharacter(userId!, newChar)
    return char
  } else {
    return false
  }
})

const getDiscoverChar = handle(async (req) => {
  const id = req.params.id || ''
  const { userId } = req?.user || { userId: '' }

  const char = await store.matches.getMatch(userId, id)
  if (!char) throw errors.NotFound

  return char
})

// Public reads — guests can browse the Discover gallery and preview a
// character without an account. The handlers tolerate an empty userId (no
// premium templates for guests). Keep '/discover' before '/:id' so the literal
// route isn't captured as an id.
router.get('/discover', discover)
router.get('/:id', getDiscoverChar)

// Everything below mutates or returns the caller's own data — login required.
router.use(loggedIn)
//router.post('/', createMatch)
router.get('/', getMatches)
router.post('/:id', createCharacter)
//router.post('/:id', editMatch)
//router.get('/:id', getMatch)
//router.delete('/:id', deleteMatch)

export default router
