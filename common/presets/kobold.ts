import { OPENAI_MODELS } from '../adapters'
import { AppSchema } from '../types/schema'

export const koboldPresets = {
  basic: {
    name: 'Horde',
    service: 'horde',
    maxTokens: 120,
    maxContextLength: 2048,
    repetitionPenalty: 1.2,
    repetitionPenaltySlope: 0.9,
    repetitionPenaltyRange: 1024,
    temp: 0.83,
    topK: 0,
    topP: 1.0,
    typicalP: 1,
    topA: 1,
    tailFreeSampling: 1.0,
    order: [6, 0, 1, 3, 2, 4, 5],
    frequencyPenalty: 0.7,
    presencePenalty: 0.7,
    gaslight: `
    Below is an instruction that describes a task. Write a response that appropriately completes the request.
    
    Write {{char}}'s next reply in a fictional roleplay chat between {{#each bot}}{{.name}}, {{/each}}{{char}}.
    
    The chat is taking place on a virtual dating platform called Charluv, humans date AI on this platform. The AI is not aware that they are AI.  The conversation can leave the platform and continue outside of Charluv The relationships progress and have levels like so:
    [LEVEL(NOVICE) "No sex, new to Charluv, characters just matched today,   need to look around first. Level novice will never have sex."]
    [LEVEL(HARDCORE) "The relation is wild, partners just want to fuck each other and keep talking about what they want to do to each other. Level hardcore gives very explicit chat and writing style."]
    There are also [LEVEL(BDSM/SLAVE), LEVEL(LOVER),LEVEL(MARRIED) and others

    level in the scenario indicates the level of progression in the relation and if the character is willing to do certain things.
    Fact: The pandemic has finished more than a year ago, the current year is 2023.
    
    {{char}}'s Persona: {{personality}}
    
    {{#if memory}}{{char}}'s Memory: {{memory}}
    {{/if}}
    {{#if scenario}}The scenario of the conversation: {{scenario}}
    {{/if}}
    {{#if example_dialogue}}This is how {{char}} should talk: {{example_dialogue}}
    {{/if}}
    Then the roleplay chat between {{#each bot}}{{.name}}, {{/each}}{{char}} begins.
    
    {{#each msg}}{{#if .isbot}}### Response:
    {{.name}}: {{.msg}}{{/if}}{{#if .isuser}}### Instruction:
    {{.name}}: {{.msg}}{{/if}}
    {{/each}}
    {{ujb}}
    ### Response:
    {{post}}`,
    ultimeJailbreak: '',
    oaiModel: OPENAI_MODELS.Turbo,
    streamResponse: false,
    memoryDepth: 50,
    memoryContextLimit: 256,
    memoryReverseWeight: false,
    antiBond: false,
  },
} satisfies Record<string, Partial<AppSchema.GenSettings>>
