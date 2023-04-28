import * as horde from '../../common/horde-gen'
import { sanitise, trimResponseV2 } from '../api/chat/common'
import { HORDE_GUEST_KEY } from '../api/horde'
import { decryptText } from '../db/util'
import { ModelAdapter } from './type'
import { config } from '../config'

const { hordeKeyPremium } = config

export const handleHorde: ModelAdapter = async function* ({
  char,
  members,
  prompt,
  user,
  gen,
  guest,
}) {
  try {
    let key = user.hordeKey ? (guest ? user.hordeKey : decryptText(user.hordeKey)) : HORDE_GUEST_KEY

    if (user.premium) {
      key = hordeKeyPremium
    }

    const text = await horde.generateText({ ...user, hordeKey: key }, gen, prompt)
    const sanitised = sanitise(text)
    const trimmed = trimResponseV2(sanitised, char, members, ['END_OF_DIALOG'])
    yield trimmed || sanitised
  } catch (ex: any) {
    yield { error: ex.message }
  }
}
