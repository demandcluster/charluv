import * as horde from '../../common/horde-gen'
import { sanitise, trimResponseV2 } from '../api/chat/common'
import { HORDE_GUEST_KEY, getHordeModels } from '../api/horde'
import { publishOne } from '../api/ws/handle'
import { decryptText } from '../db/util'
import { ModelAdapter } from './type'
import { config } from '../config'
import { logger } from '../logger'
const { hordeKeyPremium } = config
import { toArray } from '/common/util'
import { AppSchema } from '/common/types'
import { store } from '../db'
import { isConnected } from '../db/client'

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
    let key = HORDE_GUEST_KEY

    if (user.premium) {
      key = hordeKeyPremium
      user.hordeKey = key
    }

    yield { prompt }

    if ('subscription' in opts === false || opts.subscription === undefined) {
      opts.subscription = await getSubscriptionPreset(user, false, gen)
    }

    if (!opts.subscription || !opts.subscription.preset) {
      yield { error: 'Subscriptions are not enabled' }
      return
    }

    if (opts.subscription.error) {
      yield { error: opts.subscription.error }
      return
    }

    if (opts.subscription.warning) {
      yield { warning: opts.subscription.warning }
    }

    const level = opts.subscription.level ?? -1
    const preset = opts.subscription.preset

    let newLevel = await store.users.validateSubscription(user)
    if (newLevel === undefined) {
      newLevel = -1
    }

    if (newLevel instanceof Error) {
      yield { error: newLevel.message }
      return
    }

    if (preset.subLevel > -1 && preset.subLevel > newLevel) {
      opts.log.error(
        {
          preset: preset.name,
          presetLevel: preset.subLevel,
          newLevel,
          userLevel: user.sub?.level,
        },
        `Subscription insufficient`
      )
      yield { error: 'Your account is ineligible for this model - Subscription tier insufficient' }
      return
    }

    if (!preset.allowGuestUsage && guest) {
      yield { error: 'Please sign in to use this model' }
      return
    }

    const models = getHordeModels()
    const userModels = toArray('')

    const modelsMatch = models
      .filter((m) => {
        const lowered = m.name.toLowerCase()
        for (const um of userModels) {
          if (lowered.includes(um.toLowerCase())) return true
        }
        return false
      })
      .map((m) => m.name)

    // Max tokens and max context limit are decided by the subscription preset
    // We've already set the max context length prior to calling this handler
    console.log(preset, gen)
    gen.maxTokens = Math.min(preset?.maxTokens, gen.maxTokens || 200)
    gen.maxContextLength = Math.min(preset?.maxContextLength, gen.maxContextLength || 4096) || 4096
    const result = await horde.generateText({ ...user, hordeKey: key }, gen, prompt, opts.log)
    const sanitised = sanitise(result.text)
    const stops = gen.stopSequences || []
    const trimmed = trimResponseV2(sanitised, opts.replyAs, members, characters, [
      'END_OF_DIALOG',
      '### Instruction:',
      ...stops,
    ])

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

export async function getSubscriptionPreset(
  user: AppSchema.User,
  guest: boolean,
  gen?: Partial<AppSchema.GenSettings>
) {
  if (!isConnected()) return
  if (!gen) return
  if (gen.service !== 'horde') return

  const level = user.admin ? Infinity : user.sub?.level ?? -1
  let error: string | undefined = undefined
  let warning: string | undefined = undefined

  const fallback = await store.subs.getDefaultSubscription()
  const subId = gen.registered?.agnaistic?.subscriptionId
  let preset = subId ? await store.subs.getSubscription(subId) : fallback

  if (guest && preset?.allowGuestUsage === false) {
    error = 'Please sign in to use this model.'
  }

  if (!preset || preset.subDisabled) {
    // If the subscription they're using becomes unavailable, gracefully fallback to the default and let them know
    if (fallback && !fallback.subDisabled && fallback.subLevel <= level) {
      preset = fallback
      warning =
        'Your configured Charluv model is no longer available. Using a fallback. Please update your preset.'
    } else {
      error = 'Model selected is invalid or disabled. Try another.'
    }
  }

  return { level, preset, error, warning }
}
