import { Router } from 'express'
import chat from './chat'
import character from './character'
import classify from './classify'
import user from './user'
import admin from './admin'
import horde from './horde'
import settings from './settings'
import memory from './memory'
import selfhost from './json'
import voice from './voice'
import { config } from '../config'

import freeCredits from './freecredits'
import scenario from './scenario'
import match from './match'

import cart from './cart'

const router = Router()

router.use('/user', user)
router.use('/chat', chat)
router.use('/character', character)
router.use('/classify', classify)
router.use('/admin', admin)
router.use('/horde', horde)
router.use('/settings', settings)
router.use('/memory', memory)
router.use('/voice', voice)

router.use('/freecredits', freeCredits)
router.use('/scenarios', scenario)
router.use('/shop', cart)
router.use('/match', match)

if (config.jsonStorage) {
  router.use('/json', selfhost)
}

export default router
