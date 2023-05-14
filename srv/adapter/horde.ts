import * as horde from '../../common/horde-gen'
import { sanitise, trimResponseV2 } from '../api/chat/common'
import { HORDE_GUEST_KEY } from '../api/horde'
import { decryptText } from '../db/util'
import { ModelAdapter } from './type'
import { config } from '../config'
import { logger } from '../logger'
const { hordeKeyPremium } = config

export const handleHorde: ModelAdapter = async function* ({
  char,
  members,
  prompt,
  user,
  gen,
  guest,
  ...opts
}) {
  try {
    let key = user.hordeKey ? (guest ? user.hordeKey : decryptText(user.hordeKey)) : HORDE_GUEST_KEY

    if (user.premium) {
      key = hordeKeyPremium
    }

    const text = await horde.generateText({ ...user, hordeKey: key }, gen, prompt)
    const sanitised = sanitise(text)
    const trimmed = trimResponseV2(sanitised, opts.replyAs, members, ['END_OF_DIALOG'])
    yield trimmed || sanitised
  } catch (ex: any) {
    logger.error({ err: ex, body: ex.body }, `Horde request failed`)
    yield { error: ex.message }
  }
}
