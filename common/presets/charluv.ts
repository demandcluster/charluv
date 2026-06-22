import { OPENAI_MODELS } from '../adapters'
import { AppSchema } from '../types'
import { templates } from './templates'

const charluvBase = {
    service: 'charluv',
    name: 'Charluv',
    maxTokens: 400,
    maxContextLength: 8192,
    repetitionPenalty: 1,
    repetitionPenaltySlope: 0,
    repetitionPenaltyRange: 512,
    temp: 0.8,
    topK: 0,
    topP: 1,
    typicalP: 1,
    topA: 0,
    minP: 0,
    tailFreeSampling: 1,
    encoderRepitionPenalty: 1.0,
    penaltyAlpha: 0,
    addBosToken: true,
    banEosToken: false,
    skipSpecialTokens: true,
    frequencyPenalty: 0,
    presencePenalty: 0,
    gaslight: templates.Alpaca,
    ultimeJailbreak: '',
    oaiModel: OPENAI_MODELS.Turbo,
    streamResponse: true,
    memoryDepth: 50,
    memoryContextLimit: 500,
    memoryReverseWeight: false,
    antiBond: false,
    useAdvancedPrompt: 'basic',
    promptOrderFormat: 'Alpaca',
    promptOrder: [
      {
        placeholder: 'system_prompt',
        enabled: true,
      },
      {
        placeholder: 'scenario',
        enabled: true,
      },
      {
        placeholder: 'personality',
        enabled: true,
      },
      {
        placeholder: 'impersonating',
        enabled: true,
      },
      {
        placeholder: 'chat_embed',
        enabled: true,
      },
      {
        placeholder: 'memory',
        enabled: true,
      },
      {
        placeholder: 'example_dialogue',
        enabled: true,
      },
      {
        placeholder: 'history',
        enabled: true,
      },
      {
        placeholder: 'ujb',
        enabled: true,
      },
    ],
} satisfies Partial<AppSchema.GenSettings>

/**
 * The user-facing preset choices. The full Agnai sampler/template editor is gone:
 * a chat picks one of these fixed presets and they differ ONLY in temperature.
 * Each id is a key in `defaultPresets`, so `chat.genPreset` stores the id and
 * resolves through the existing default-preset machinery (no data migration).
 */
export const CHARLUV_TEMP_PRESETS = [
  { id: 'charluv-precise', label: 'Precise', temp: 0.4, hint: 'Focused and consistent' },
  { id: 'charluv-balanced', label: 'Balanced', temp: 0.8, hint: 'Natural variety (default)' },
  { id: 'charluv-creative', label: 'Creative', temp: 1.1, hint: 'More varied and surprising' },
  { id: 'charluv-wild', label: 'Wild', temp: 1.4, hint: 'Unpredictable, high variety' },
] as const

export const DEFAULT_CHARLUV_PRESET = 'charluv-balanced'

// Sampler floors that scale with temperature. top_p tightens and min_p (a
// coherence floor honoured by vLLM) rises as temp climbs, so the hotter presets
// stay coherent instead of sampling the full distribution tail. top_k stays 0
// (disabled) but is now transmitted, so it can be set per preset if ever needed.
export const charluvPresets = {
  // Kept for backward compatibility: existing chats/users may reference 'charluv'.
  charluv: { ...charluvBase },
  'charluv-precise': { ...charluvBase, name: 'Precise', temp: 0.4, topP: 1.0, minP: 0 },
  'charluv-balanced': { ...charluvBase, name: 'Balanced', temp: 0.8, topP: 0.98, minP: 0.02 },
  'charluv-creative': { ...charluvBase, name: 'Creative', temp: 1.1, topP: 0.95, minP: 0.05 },
  'charluv-wild': { ...charluvBase, name: 'Wild', temp: 1.4, topP: 0.92, minP: 0.08 },
} satisfies Record<string, Partial<AppSchema.GenSettings>>
