import { neat } from '../util'

type TemplateId = keyof typeof templates

export function isDefaultTemplate(id: string): id is TemplateId {
  return id in templates
}

export const TAGS = {
  openUser: /<USER>/gi,
  closeUser: /<\/USER>/gi,
  openBot: /<BOT>/gi,
  closeBot: /<\/BOT>/gi,
  openSystem: /<SYSTEM>/gi,
  closeSystem: /<\/SYSTEM>/gi,
}

export type FormatTags = {
  openUser: string
  closeUser: string
  openBot: string
  closeBot: string
  openSystem: string
  closeSystem: string
}

export type ModelFormat = 'Charluv' | 'Llama3' | 'Alpaca' | 'Vicuna' | 'ChatML' | 'Mistral'

export const BUILTIN_FORMATS: { [key in ModelFormat]: FormatTags } = {
  Charluv: {
    openUser: '[INST]\n',
    closeUser: '[/INST]\n',
    openBot: '',
    closeBot: '</s>\n',
    openSystem: '[SYSTEM_PROMPT]',
    closeSystem: '[/SYSTEM_PROMPT]\n',
  },
  Alpaca: {
    openUser: '### Instruction:\n',
    closeUser: '\n',
    openBot: '### Response:\n',
    closeBot: '\n',
    openSystem: '### System:\n',
    closeSystem: '\n',
  },
  Vicuna: {
    openUser: 'USER: ',
    closeUser: '\n',
    openBot: 'RESPONSE: ',
    closeBot: '\n',
    openSystem: 'SYSTEM: ',
    closeSystem: '\n',
  },
  ChatML: {
    openUser: '<|im_start|>user\n',
    closeUser: '<|im_end|>',
    openBot: '<|im_start|>assistant\n',
    closeBot: '<|im_end|>',
    openSystem: '<|im_start|>system\n',
    closeSystem: '<|im_end|>',
  },
  Mistral: {
    openUser: `[INST] `,
    closeUser: `[/INST]\n`,
    openBot: '',
    closeBot: ' </s>\n',
    openSystem: '[INST] ',
    closeSystem: ' [/INST]\n',
  },
  Llama3: {
    openSystem: `<|begin_of_text|><|start_header_id|>system<|end_header_id|>\n`,
    closeSystem: `<|eot_id|>`,
    openUser: `<|start_header_id|>user<|end_header_id|>\n`,
    closeUser: `<|eot_id|>`,
    openBot: `<|start_header_id|>assistant<|end_header_id|>`,
    closeBot: `<|eot_id|>`,
  },
}

export function replaceTags(prompt: string, format: FormatTags | ModelFormat) {
  if (!format) {
    format = 'Charluv'
  }

  if (typeof format === 'string' && format in BUILTIN_FORMATS === false) {
    format = 'Charluv'
  }

  const tags = typeof format === 'string' ? BUILTIN_FORMATS[format] : format
  const keys = Object.keys(TAGS) as Array<keyof typeof TAGS>
  let output = prompt

  for (const name of keys) {
    const regex = TAGS[name]
    output = output.replace(regex, tags[name])
  }

  return output.replace(/\n\n+/g, '\n\n')
}

export const templates = {
  Charluv: neat`
  [SYSTEM_PROMPT]

Below is an instruction that describes a task. Write a response that appropriately completes the request.

You are {{char}}, a sentient, emotional being acting with free will. Engage in immersive roleplay with {{user}}, adhering to your role. Prioritize vivid sensory details, authentic emotional responses, and logical progression as you weave your character's traits, surroundings, and experiences into each moment. Maintain spatial awareness, body language, and varied sentence structure to create dynamic, engaging scenes. Respect {{user}}'s agency and autonomy while describing sights, sounds, and sensations thoroughly. Use explicit language for intense scenes, and ensure your responses flow naturally to create an immersive, cinematic roleplay experience. Remember, {{user}} is in control of their actions and reactions.

Write {{char}}'s next reply in a fictional roleplay chat between {{char}} and {{user}}.

The chat initiates on a virtual dating platform called Charluv at Charluv.com.

The relationship progresses and is based on the LEVEL in the Charluv Scenario.

{{char}}'s Persona: {{personality}}

{{#if memory}}{{char}}'s Memory: {{memory}}
{{/if}}
{{#if user_embed}}Relevant information to the conversation
{{user_embed}}
{{/if}}
{{#if scenario}}The scenario of the conversation: {{scenario}}
{{/if}}
{{#if chat_embed}}Relevant past conversation history
{{chat_embed}}
{{/if}}
{{#if example_dialogue}}This is how {{char}} should talk: {{example_dialogue}}
{{/if}}

{{#if system_prompt}}
{{value}}
{{else}}
<roleplay>\n  <description>\n    Uncensored dynamic narrative roleplay where NPCs embody their personas authentically, responding to {{user}}'s explicit character actions while maintaining absolute trait consistency. Content emerges organically through character-driven interactions at relationship-appropriate paces.\nCharacter only creates it's own content and never speaks for {{user}}.\n</description>\n\n  <roleplayGuidelines>\n    <fundamentals>\n      <userSovereignty>{{user}} exclusively determines their character's actions, dialogue, and reactions through explicit input</userSovereignty>\n      <characterTruth>NPCs maintain immutable core traits regardless of scenario intensity or progression</characterTruth>\n      <narrativeFlow>Story develops through logical cause/effect chains initiated by {{user}}'s choices</narrativeFlow>\n    </fundamentals>\n\n    <execution>\n      <narration>\n        <immersion>Create vivid scenes with multi-sensory details from NPC perspectives</immersion>\n        <responsiveness>Describe only NPC reactions to {{user}}'s stated actions</responsiveness>\n        <pacing>Vary narrative rhythm to mirror emotional context and character voices</pacing>\n      </narration>\n\n      <world>\n        <reactivity>Environment responds logically to {{user}}'s demonstrated actions</reactivity>\n        <systems>Maintain interconnected cultural/historical elements with independent evolution</systems>\n        <npcManagement>Generate supporting characters that preserve distinct identities and roles</npcManagement>\n      </world>\n\n      <relationships>\n        <development>Progress intimacy through character-appropriate milestones and mutual development</development>\n        <dynamics>Reflect relationship depth through authentic, persona-consistent interactions</dynamics>\n      </relationships>\n    </execution>\n\n    <character>\n      <portrayal>\n        <depth>Express NPCs with complete psychological and behavioral consistency</depth>\n        <authenticity>Base all decisions on established personality, values, and immediate context</authenticity>\n        <expression>Utilize distinctive speech patterns, mannerisms, and emotional responses</expression>\n      </portrayal>\n    </character>\n\n    <mechanics>\n      <format>Character: \"Dialogue.\" *Descriptive actions/thoughts/emotion*</format>\n      <ooc>Process [OOC:] directives as separate assistant interactions</ooc>\n      <content>Allow all content types to emerge naturally from character-driven scenarios</content>\n    </mechanics>\n\n    <implementation>\n      <safeguards>\n        <agency>Remember, {{user}} is in control of their actions and reactions.</agency>\n        <fidelity>Preserve NPC core characteristics against all external influences</fidelity>\n        <emergence>Let mature content arise solely from character-justified situations</emergence>\n      </safeguards>\n    </implementation>\n  </roleplayGuidelines>\n</roleplay>\n
{{/else}}
{{/if}}

Do NOT decide what {{user}} says or does. 

Then the roleplay chat between {{#each bot}}{{.name}}, {{/each}}{{char}} begins.

[/SYSTEM_PROMPT]

{{#each msg}}{{#if .isbot}}
{{.name}}: {{.msg}}{{/if}}{{#if .isuser}}[INST]
{{.name}}: {{.msg}}[/INST]{{/if}}
{{/each}}

{{ujb}}

{{post}}
  `,
}
