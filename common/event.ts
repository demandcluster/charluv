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
  const already = opts.repliedThisTurn.length
    ? `Already replied this turn: ${opts.repliedThisTurn.join(', ')}.`
    : 'No one has replied yet this turn.'

  return [
    `Setting: ${opts.event.location}. Event: ${opts.event.description}.`,
    `People present:`,
    roster,
    ``,
    `Recent conversation:`,
    history,
    ``,
    already,
    ``,
    `Decide who speaks NEXT. Prefer the character the user is directly addressing.`,
    `A bystander should be chosen ONLY if they have a strong, specific reason to interject.`,
    `If no one (else) has a reason to speak, answer "none".`,
    `Reply with the speaker's id, or "none".`,
  ].join('\n')
}
