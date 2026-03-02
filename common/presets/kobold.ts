import { OPENAI_MODELS } from '../adapters'
import { AppSchema } from '../types/schema'
import { templates } from './templates'

export const koboldPresets = {
  basic: {
    name: 'Horde',
    service: 'horde',
    maxTokens: 400,
    maxContextLength: 16384,
    repetitionPenalty: 1,
    repetitionPenaltySlope: 0.9,
    repetitionPenaltyRange: 1024,
    temp: 0.74,
    topK: 40,
    topP: 1,
    typicalP: 1,
    topA: 1,
    tailFreeSampling: 1,
    order: [6, 0, 1, 3, 2, 4, 5],
    frequencyPenalty: 0.7,
    presencePenalty: 0.7,
    gaslight: templates.Charluv,
    ultimeJailbreak: '',
    oaiModel: OPENAI_MODELS.Turbo,
    streamResponse: true,
    memoryDepth: 50,
    memoryContextLimit: 500,
    memoryReverseWeight: false,
    antiBond: false,
    useAdvancedPrompt: 'validate',
    promptOrderFormat: 'Charluv',
  },
} satisfies Record<string, Partial<AppSchema.GenSettings>>
