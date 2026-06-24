import { store } from '../db'
import { isConnected } from '../db/client'
import { getCachedSubscriptions } from '../db/subscriptions'
import { handleClaude } from './claude'
import { handleHorde } from './horde'
import { handleThirdParty } from './kobold'
import { handleOAI } from './openai'
import { registerAdapter } from './register'
import { ModelAdapter } from './type'
import { AIAdapter, AdapterSetting } from '/common/adapters'
import { AppSchema } from '/common/types'
import { parseStops } from '/common/util'
import { handleVenus } from './venus'
import { obtainLock, releaseLock } from '../api/chat/lock'
import { getServerConfiguration } from '../db/admin'
import { validateGenerationGate } from './gate'

export async function getSubscriptionPreset(
  user: AppSchema.User,
  guest: boolean,
  gen?: Partial<AppSchema.GenSettings>
) {
  if (!isConnected()) return
  if (!gen) return
  if (gen.service !== 'charluv') return

  const tier = store.users.getUserSubTier(user)
  const level = user.admin ? 999999 : tier?.level ?? -1
  let error: string | undefined = undefined
  let warning: string | undefined = undefined

  // The model is no longer user-selectable. It's decided purely by the user's
  // tier: premium users always get the highest model their level allows, and
  // everyone else (free / non-paying) gets the default subscription. Any
  // `registered.charluv.subscriptionId` left over on old presets is ignored.
  const fallback = await store.subs.getDefaultSubscription()
  const all = await store.subs.getSubscriptions()
  const best = all
    .filter((sub) => !sub.subDisabled)
    .filter((sub) => (guest ? sub.allowGuestUsage !== false : true))
    .filter((sub) => (user.admin ? true : sub.subLevel <= level))
    .sort((l, r) => r.subLevel - l.subLevel)[0]
  let preset = best || fallback

  if (guest && preset?.allowGuestUsage === false) {
    error = 'Please sign in to use this model.'
  }

  if (preset?.stopSequences) {
    preset.stopSequences = parseStops(preset.stopSequences)
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

  return { level, preset, error, warning, tier: tier?.tier }
}

export const handleCharluv: ModelAdapter = async function* (opts) {
  if ('subscription' in opts === false) {
    opts.subscription = await getSubscriptionPreset(opts.user, !!opts.guest, opts.gen)
  }

  // openai-endpoint-only: if no subscription model is configured, generate via
  // the self-hosted openai endpoint directly (ungated). Tier gating only applies
  // when a subscription model exists.
  if (!opts.subscription?.preset) {
    opts.gen.service = 'openai'
    yield* handleOAI(opts)
    return
  }

  const gate = await validateGenerationGate({
    user: opts.user,
    guest: opts.guest,
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

  const subPreset = opts.subscription.preset

  const srv = await getServerConfiguration()

  /**
   * Lock per user per model
   */
  const lockId = `${opts.user._id}-${opts.subscription.preset.name}`
  if (!opts.guidance && +srv.lockSeconds > 0) {
    await obtainLock(lockId, srv.lockSeconds)
  }

  const useRecommended = !!opts.gen.registered?.charluv?.useRecommended
  if (useRecommended) {
    const {
      memoryChatEmbedLimit,
      memoryContextLimit,
      memoryDepth,
      memoryReverseWeight,
      memoryUserEmbedLimit,
      ultimeJailbreak,
      systemPrompt,
      stopSequences,
      maxTokens,
      gaslight,
      allowGuestUsage,
      imageSettings,
      temporary,
      useAdvancedPrompt,
      _id,
      kind,
      name,
      ...recommended
    } = subPreset
    Object.assign(opts.gen, recommended)
  }

  // Max tokens and max context limit are decided by the subscription preset
  // We've already set the max context length prior to calling this handler
  opts.gen.maxTokens = Math.min(subPreset.maxTokens, opts.gen.maxTokens || 80)
  opts.gen.thirdPartyUrl = subPreset.thirdPartyUrl
  opts.gen.thirdPartyFormat = subPreset.thirdPartyFormat

  const stops =
    Array.isArray(subPreset.stopSequences) && opts.kind !== 'plain'
      ? new Set(subPreset.stopSequences)
      : new Set<string>()

  if (Array.isArray(opts.gen.stopSequences) && opts.gen.stopSequences.length) {
    for (const stop of opts.gen.stopSequences) {
      stops.add(stop)
    }
  }

  // openai-endpoint-only: ignore the subscription model's stored service
  // (production subs are 'horde') and always run the self-hosted openai
  // endpoint. The subscription is used only for gating + model/limits, already
  // applied above. base.server (INFERENCE_TEXT_URL) provides the endpoint+model.
  opts.gen.service = 'openai'
  opts.gen.oaiModel = subPreset.thirdPartyModel || subPreset.oaiModel || opts.gen.oaiModel
  // Don't let a sub's third-party url/format divert us off the openai endpoint.
  opts.gen.thirdPartyFormat = undefined
  opts.user.koboldUrl = ''

  try {
    yield* handleOAI(opts)
  } finally {
    if (+srv.lockSeconds > 0) {
      await releaseLock(lockId)
    }
  }
}

const settings: AdapterSetting[] = [
  {
    preset: true,
    field: 'subscriptionId',
    secret: false,
    label: 'Level',
    setting: { type: 'list', options: [] },
  },
]

registerAdapter('charluv', handleCharluv, {
  label: 'Charluv',
  options: [
    'repetitionPenalty',
    'repetitionPenaltyRange',
    'repetitionPenaltySlope',
    'topA',
    'topK',
    'topP',
    'streamResponse',
    'frequencyPenalty',
    'presencePenalty',
    'mirostatLR',
    'mirostatTau',
    'typicalP',
    'tailFreeSampling',
  ],
  settings,
  load: (user) => {
    return [
      {
        preset: true,
        field: 'useRecommended',
        secret: false,
        label: 'Use Recommended Settings',
        helperText: 'Use the settings provided by the subscription',
        setting: { type: 'boolean' },
      },
    ]
  },
})

setInterval(updateRegisteredSubs, 3000)

export async function updateRegisteredSubs() {
  const subs = getCachedSubscriptions()
  for (const item of settings) {
    if (item.setting.type === 'list' && item.field === 'subscriptionId') {
      const options = subs.map((sub) => ({ label: sub.name, value: sub._id }))
      item.setting.options = options
    }
  }
}

/**
 * These need to be here because the Charluv service can invoke any other service
 * Placing these in a 'common' module would cause a circular dependency graph between `generate.ts` and this module.
 */

export const handlers: { [key in AIAdapter]: ModelAdapter } = {
  kobold: handleThirdParty,
  ooba: handleThirdParty,
  horde: handleHorde,
  openai: handleOAI,
  claude: handleClaude,
  charluv: handleCharluv,
  venus: handleVenus,
}

export function getHandlers(settings: Partial<AppSchema.GenSettings>) {
  // openai-endpoint-only: direct openai, everything else via the charluv gate.
  if (settings.service === 'openai') return handlers.openai
  return handlers.charluv
}
