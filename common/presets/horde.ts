import { OPENAI_MODELS } from '../adapters'
import { AppSchema } from '../types/schema'
import { templates } from './templates'

export const hordePresets = {
  horde: {
    name: 'Horde',
    service: 'horde',
    maxTokens: 400,
    maxContextLength: 8192,
    repetitionPenalty: 1.15,
    repetitionPenaltySlope: 0.9,
    repetitionPenaltyRange: 1024,
    temp: 0.74,
    topK: 40,
    topP: 1,
    typicalP: 1,
    topA: 1,
    tailFreeSampling: 1,
    order: [6, 0, 1, 3, 2, 4, 5],
    frequencyPenalty: 0.6,
    presencePenalty: 0,
    gaslight: templates.Charluv,
    ultimeJailbreak: '',
    oaiModel: OPENAI_MODELS.Turbo,
    streamResponse: true,
    memoryDepth: 50,
    stopSequences: ['+++++'],
    memoryContextLimit: 500,
    memoryReverseWeight: false,
    antiBond: false,
    useAdvancedPrompt: 'validate',
    promptOrderFormat: 'Charluv',
  },
} satisfies Record<string, Partial<AppSchema.GenSettings>>
