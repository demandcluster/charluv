import { OPENAI_MODELS } from '../adapters'
import { AppSchema } from '../types/schema'

export const hordePresets = {
  horde: {
    name: 'Horde',
    service: 'horde',
    maxTokens: 120,
    maxContextLength: 2048,
    repetitionPenalty: 1.1,
    repetitionPenaltySlope: 0.9,
    repetitionPenaltyRange: 1024,
    temp: 0.85,
    topK: 0,
    topP: 0.9,
    typicalP: 1,
    topA: 1,
    tailFreeSampling: 0.9,
    order: [6, 0, 1, 2, 3, 4, 5],
    frequencyPenalty: 0.7,
    presencePenalty: 0.7,
    gaslight: `{{system_prompt}}
    
    <|system|>Below is an instruction that describes a task. Write a response that appropriately completes the request.
    
    Write {{char}}'s next reply in a fictional roleplay chat between {{#each bot}}{{.name}}, {{/each}}{{char}}.
    
    {{char}}'s Persona: {{personality}}
    
    This is the scenario of the conversation: {{scenario}}
    
    This is how {{char}} should talk: {{example_dialogue}}
    
    Facts: {{memory}}
    
    Then the roleplay chat between {{#each bot}}{{.name}}, {{/each}}{{char}} begins.
    
    {{#each msg}}{{#if .isbot}}<|model|>{{/if}}{{#if .isuser}}<|user|>{{/if}}{{.name}}: {{.msg}}
    {{/each}}
    {{#if ujb}}<|system|>{{ujb}}{{/if}}
    <|model|>{{post}}`,
    ultimeJailbreak: '',
    oaiModel: OPENAI_MODELS.Turbo,
    streamResponse: false,
    memoryDepth: 50,
    memoryContextLimit: 256,
    memoryReverseWeight: false,
    useGaslight: true,
    antiBond: false,
  },
} satisfies Record<string, Partial<AppSchema.GenSettings>>
