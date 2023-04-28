import { Router } from 'express'
import { assertValid } from 'frisker'
import { store } from '../db'
import { loggedIn, isAdmin } from './auth'
import { handle, StatusError } from './wrap'

import { PERSONA_FORMATS } from '../../common/adapters'
import {logger} from '../logger'
const router = Router()

const valid = {
  name: 'string',
  avatar: 'string?',
  scenario: 'string',
  greeting: 'string',
  description: 'string',
  xp: 'string',
  match: 'string',
  premium: 'string',
  sampleChat: 'string',
  persona: {
    kind: PERSONA_FORMATS,
    attributes: 'any',
  },
} as const


const getScenarios = handle(async ( req ) => {
  const charId = req.params?.charId || "false"
  const scenarios = await store.scenario.getScenarios(charId!)
  return { scenarios: scenarios }
})



const getCharacter = handle(async ({ userId, params }) => {
  const char = await store.characters.getCharacter(userId!, params.id)
  if (!char) {
    throw new StatusError('Character not found', 404)
  }
  return char
})



router.use(loggedIn)
//router.post('/', createScenario)
//router.post('/:id', addScenario)
router.get('/:charId', getScenarios)

export default router
