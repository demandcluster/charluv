import * as horde from '../../common/horde-gen'
import { sanitise, trimResponseV2 } from '../api/chat/common'
import { HORDE_GUEST_KEY } from '../api/horde'
import { publishOne } from '../api/ws/handle'
import { decryptText } from '../db/util'
import { ModelAdapter } from './type'
import { config } from '../config'
import { logger } from '../logger'
const { hordeKeyPremium } = config

export const handleHorde: ModelAdapter = async function* ({
  char,
  characters,
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

    yield { prompt }

    const result = await horde.generateText({ ...user, hordeKey: key }, gen, prompt)
    const sanitised = sanitise(result.text)
    const trimmed = trimResponseV2(sanitised, opts.replyAs, members, characters, ['END_OF_DIALOG'])

    // This is a temporary measure to help users provide more info when reporting instances of 'cut off' responses
    publishOne(guest || user._id, {
      type: 'temp-horde-gen',
      original: sanitised,
      chatId: opts.chat._id,
    })

    const details = result.result.generations?.[0]

    if (details) {
      yield {
        meta: {
          workerId: details.worker_id,
          workerName: details.worker_name,
          model: details.model,
        },
      }
    }

    yield trimmed || sanitised
  } catch (ex: any) {
    logger.error({ err: ex, body: ex.body }, `Horde request failed.`)
    let msg = [ex?.body?.message || '', JSON.stringify(ex?.body?.errors) || ''].filter(
      (line) => !!line
    )
    yield { error: `${ex.message}. ${msg.join('. ')}` }
  }
}
