import * as horde from '../../common/horde-gen'
import { HORDE_GUEST_KEY } from '../api/horde'
import { sendOne } from '../api/ws'
import { config } from '../config'
import { logger } from '../middleware'
import { ModelAdapter } from './type'
import { sanitise, trimResponseV2 } from '/common/requests/util'
import { AppSchema } from '/common/types'
import { store } from '../db'
import { isConnected } from '../db/client'
import { validateGenerationGate } from './gate'

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
    let key = HORDE_GUEST_KEY

    if (user.premium) {
      key = hordeKeyPremium
      user.hordeKey = key
    }

    yield { prompt }

    if ('subscription' in opts === false || opts.subscription === undefined) {
      opts.subscription = await getSubscriptionPreset(user, false, gen)
    }

    const gate = await validateGenerationGate({
      user,
      guest,
      subscription: opts.subscription,
      log: opts.log,
    })
    if (gate.error) {
      yield { error: gate.error }
      return
    }
    if (gate.warning) {
      yield { warning: gate.warning }
    }

    if (!opts.subscription?.preset) {
      yield { error: 'Subscriptions are not enabled' }
      return
    }

    const preset = opts.subscription.preset

    // Max tokens and max context limit are decided by the subscription preset
    // We've already set the max context length prior to calling this handler

    gen.maxTokens = Math.min(preset?.maxTokens, gen.maxTokens || 200)

    gen.maxContextLength = Math.min(preset?.maxContextLength || 4096, gen.maxContextLength || 4096)
    const result = await horde.generateText({ ...user, hordeKey: key }, gen, prompt, opts.log)
    const sanitised = sanitise(result.text)
    const stops = gen.stopSequences || []
    const trimmed = trimResponseV2(sanitised, opts.replyAs, members, characters, [
      'END_OF_DIALOG',
      '### Instruction',
      ...stops,
    ])

    // This is a temporary measure to help users provide more info when reporting instances of 'cut off' responses
    sendOne(guest || user._id, {
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

  // if (gen.service !== 'horde') return

  const level = user.admin ? Infinity : user.sub?.level ? user.sub?.level : user?.premium ? 10 : -1

  let error: string | undefined = undefined
  let warning: string | undefined = undefined
  let preset
  const fallback = await store.subs.getDefaultSubscription()
  if (gen.registered) {
    const subId = gen.registered?.charluv?.subscriptionId
    preset = subId ? await store.subs.getSubscription(subId) : fallback
  }
  if (user?.premium && !user.sub?.level) {
    preset = await store.subs.getSubscription('paypal')
  }
  if (guest && preset?.allowGuestUsage === false) {
    error = 'Please sign in to use this model.'
  }

  if (!preset || preset.subDisabled) {
    // If the subscription they're using becomes unavailable, gracefully fallback to the default and let them know
    if (fallback && !fallback.subDisabled && fallback.subLevel <= level) {
      preset = fallback
      // warning =
      //   'Your configured Charluv model is no longer available. Using a fallback. Please update your preset.'
    } else {
      error = 'Model selected is invalid or disabled. Try another.'
    }
  }

  return { level, preset, error, warning }
}
