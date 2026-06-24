/** Flat credit cost of one user turn in an event chat (vs 10 for a normal message). */
export const EVENT_TURN_COST = 25

/** Hard cap on the number of character replies the director may elect per user turn. */
export const EVENT_MAX_REPLIES = 3

/** The scene block injected into the chat scenario so every prompt sees the event context. */
export function buildEventScenario(opts: {
  location: string
  description: string
  names: string[]
}): string {
  return `Setting: ${opts.location}. Event: ${opts.description}. Present: ${opts.names.join(', ')}.`
}

/** JSON Schema forcing the director to return a present character id or the literal "none". */
export function buildSpeakerSchema(presentIds: string[]): object {
  return {
    type: 'object',
    properties: {
      speaker: { type: 'string', enum: [...presentIds, 'none'] },
    },
    required: ['speaker'],
  }
}

/**
 * The director prompt. Asks the model to elect the next speaker, preferring the
 * directly-addressed character and only choosing a bystander with a strong,
 * specific reason. Returns "none" when no one (else) should speak.
 */
export function buildDirectorPrompt(opts: {
  event: { location: string; description: string }
  roster: Array<{ id: string; name: string; hook: string }>
  recent: Array<{ name: string; text: string }>
  repliedThisTurn: string[]
}): string {
  const roster = opts.roster.map((r) => `- ${r.name} (id: ${r.id}): ${r.hook}`).join('\n')
  const history = opts.recent.map((m) => `${m.name}: ${m.text}`).join('\n')
  const hasReplied = opts.repliedThisTurn.length > 0

  // Two distinct decisions. First election: someone MUST answer the user, so pick
  // the addressed character. Continuation: the default is to STOP ("none") — a
  // second/third speaker is the rare exception, not a quota to fill. Reaching the
  // reply cap is a ceiling, never a goal.
  const instructions = hasReplied
    ? [
        `Someone has already replied this turn. Usually that is enough — most turns have just one speaker.`,
        `Answer "none" UNLESS another present character has a strong, specific, immediate reason to interject right now.`,
        `Do not add a speaker merely to keep the scene busy. When in doubt, answer "none".`,
      ]
    : [
        `Decide who speaks NEXT. Prefer the character the user is directly addressing.`,
        `A bystander should be chosen ONLY if they have a strong, specific reason to interject.`,
      ]

  return [
    `Setting: ${opts.event.location}. Event: ${opts.event.description}.`,
    `People present:`,
    roster,
    ``,
    `Recent conversation:`,
    history,
    ``,
    ...instructions,
    `Reply with the speaker's id, or "none".`,
  ].join('\n')
}
