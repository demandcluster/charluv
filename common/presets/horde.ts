import { OPENAI_MODELS } from '../adapters'
import { AppSchema } from '../types/schema'
import { templates } from './templates'

export const hordePresets = {
  horde: {
    name: 'Horde',
    service: 'horde',
    maxTokens: 120,
    maxContextLength: 2048,
    repetitionPenalty: 1.2,
    repetitionPenaltySlope: 0.9,
    repetitionPenaltyRange: 1024,
    temp: 0.83,
    topK: 0,
    topP: 1,
    typicalP: 1,
    topA: 1,
    tailFreeSampling: 1,
    order: [6, 0, 1, 3, 2, 4, 5],
    frequencyPenalty: 0.7,
    presencePenalty: 0.7,
    gaslight: templates.Alpaca,
    ultimeJailbreak: '',
    oaiModel: OPENAI_MODELS.Turbo,
    streamResponse: false,
    memoryDepth: 50,
    memoryContextLimit: 500,
    memoryReverseWeight: false,
    antiBond: false,
  },
} satisfies Record<string, Partial<AppSchema.GenSettings>>
