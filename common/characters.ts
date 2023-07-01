import { AppSchema } from './types/schema'
import { nativeToCharacterBook } from './memory'

export const defaultChars = {
  Robot: {
    name: 'Aiva',
    match: false,
    xp: 0,
    premium: false,
    avatar: '/asset/aiva.png',
    persona: {
      kind: 'boostyle',
      attributes: {
        species: ['robot'],
        mind: ['kind', 'compassionate', 'caring', 'tender', 'forgiving', 'enthusiastic'],
        personality: ['kind', 'compassionate', 'caring', 'tender', 'forgiving', 'enthusiastic'],
      },
    },
    description: 'Aiva is the Charluv helpdesk bot',
    sampleChat:
      "{{char}}: *beeps* Good to see you, please don't say Hello Aiva. I am not on good terms with Google Assistant. *winks* \r\n{{user}}: Is there a premium membership?\r\n{{char}}: There sure is! You can subscribe for a small fee per month, you can also buy credit packages. But check the options in the menu.\r\n{{user}}: Thanks! Is all content NSFW?\r\n{{char}}: It is a virtual dating site, what do you think Sherlock? *squeeks*",
    scenario:
      'Aiva is standing by at the helpdesk of Charluv, the virtual dating app where people date with AI. Aiva is ready to help any customer. Strictly business. She does her best to sell premium features. Someone just joined the chat...',
    greeting: 'Hi it is Aiva, the Charluv Helpdesk, what can I do for you? *beeps*',
  },
} satisfies {
  [key: string]: Pick<
    AppSchema.Character,
    | 'name'
    | 'persona'
    | 'sampleChat'
    | 'scenario'
    | 'greeting'
    | 'match'
    | 'xp'
    | 'description'
    | 'premium'
    | 'avatar'
  >
}

export function exportCharacter(char: AppSchema.Character, target: 'tavern' | 'ooba') {
  switch (target) {
    case 'tavern': {
      return {
        // Backfilled V1 fields
        // TODO: 2 months after V2 adoption, change every field with "This is
        // a V2 card, update your frontend <link_with_more_details_goes_here>"
        name: char.name,
        first_mes: char.greeting,
        scenario: char.scenario,
        description: formatCharacter(char.name, char.persona),
        personality: '',
        mes_example: char.sampleChat,

        // V2 data
        spec: 'chara_card_v2',
        spec_version: '2.0',
        data: {
          name: char.name,
          first_mes: char.greeting,
          scenario: char.scenario,
          description: formatCharacter(char.name, char.persona),
          personality: '',
          mes_example: char.sampleChat,

          // new v2 fields
          creator_notes: char.description ?? '',
          system_prompt: char.systemPrompt ?? '',
          post_history_instructions: char.postHistoryInstructions ?? '',
          alternate_greetings: char.alternateGreetings ?? [],
          character_book: char.characterBook
            ? nativeToCharacterBook(char.characterBook)
            : undefined,
          tags: char.tags ?? [],
          creator: char.creator ?? '',
          character_version: char.characterVersion ?? '',
          extensions: {
            ...(char.extensions ?? {}),
            agnai: {
              voice: char.voice,
              persona: char.persona,
            },
          },
        },
      }
    }

    case 'ooba': {
      return {
        char_name: char.name,
        char_greeting: char.greeting,
        world_scenario: char.scenario,
        char_persona: formatCharacter(char.name, char.persona),
        example_dialogue: char.sampleChat,
      }
    }
  }
}

export function formatCharacter(
  name: string,
  persona: AppSchema.Persona,
  kind?: AppSchema.Persona['kind']
) {
  switch (kind || persona.kind) {
    case 'wpp': {
      const attrs = Object.entries(persona.attributes)
        .map(([key, values]) => `${key}(${values.map(quote).join(' + ')})`)
        .join('\n')

      return [`[character("${name}") {`, attrs, '}]'].join('\n')
    }

    case 'sbf': {
      const attrs = Object.entries(persona.attributes).map(
        ([key, values]) => `${key}: ${values.map(quote).join(', ')}`
      )

      return `[ character: "${name}"; ${attrs.join('; ')} ]`
    }

    case 'boostyle': {
      const attrs = Object.values(persona.attributes).reduce(
        (prev, curr) => {
          prev.push(...curr)
          return prev
        },
        [name]
      )
      return attrs.join(' + ')
    }

    case 'text': {
      const text = persona.attributes.text?.[0]
      return text || ''
    }
  }
}

function quote(str: string) {
  return `"${str}"`
}
