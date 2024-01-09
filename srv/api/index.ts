import { Router } from 'express'
import chat from './chat'
import character from './character'
import classify from './classify'
import user from './user'
import admin from './admin'
import subscriptions from './subscriptions'
import horde from './horde'
import settings from './settings'
import memory from './memory'
import scenario from './scenario'
import selfhost from './json'
import voice from './voice'
import { config } from '../config'
import announcements from './announcements'
import { apiKeyUsage } from './auth'
import { inferenceApi, inferenceModels } from './chat/inference'

import freeCredits from './freecredits'

import match from './match'

import cart from './cart'
import paypalcheck from './paypal'

const router = Router()
const keyedRouter = Router()

router.use('/user', user)
router.use('/chat', chat)
router.use('/character', character)
router.use('/classify', classify)
router.use('/admin', subscriptions)
router.use('/admin', admin)
router.use('/horde', horde)
router.use('/settings', settings)
router.use('/memory', memory)
router.use('/scenario', scenario)
router.use('/voice', voice)
router.use('/freecredits', freeCredits)
router.use('/shop', cart)
router.use('/match', match)
router.use('/announce', announcements)
router.use('/paypalcheck', paypalcheck)

if (config.jsonStorage) {
  router.use('/json', selfhost)
}

keyedRouter.post('/completions', apiKeyUsage, inferenceApi)
keyedRouter.get('/models', apiKeyUsage, inferenceModels)

export default router

export { keyedRouter }
