/** Flat credit cost of one user turn in an event chat (vs 10 for a normal message). */
export const EVENT_TURN_COST = 25

/** Hard cap on the number of character replies the director may elect per user turn. */
export const EVENT_MAX_REPLIES = 3

/** How often the director injects an unprompted world beat (announcement, arrival,
 * environment change) to push the story forward. */
export type DirectorFrequency = 'none' | 'rare' | 'normal' | 'regular'

/** Per-turn probability that the director is *asked* to consider a world beat.
 * The model still decides whether a beat is actually warranted (it may decline),
 * so these are the chance of considering, not of firing. */
export const DIRECTOR_EVENT_CHANCE: Record<DirectorFrequency, number> = {
  none: 0,
  rare: 0.06,
  normal: 0.18,
  regular: 0.35,
}

/** The scene block injected into the chat scenario so every prompt sees the event context. */
export function buildEventScenario(opts: {
  location: string
  description: string
  names: string[]
  when?: string
  vibe?: string
  /** The user's self-persona handle, so characters know the user is present and
   * this is an ongoing acquaintance — not a stranger walking in. */
  userName?: string
}): string {
  const setting = opts.when ? `${opts.location}, ${opts.when}` : opts.location
  const mood = opts.vibe ? ` Mood: ${opts.vibe}.` : ''
  const present = opts.userName ? [`${opts.userName} (the user)`, ...opts.names] : opts.names
  return `Setting: ${setting}. Event: ${opts.description}.${mood} Present: ${present.join(', ')}.`
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
  event: { location: string; description: string; when?: string; vibe?: string; note?: string }
  roster: Array<{ id: string; name: string; hook: string }>
  recent: Array<{ name: string; text: string }>
  repliedThisTurn: string[]
  /** The human participant. Listed as present so the director knows the user is
   * in the scene (characters react to them), but the user is NEVER an electable
   * speaker — the speaker enum is built from the character roster ids only. */
  user?: { name: string; hook: string }
  /** Names of present characters with no line in the recent history. Airtime
   * balance: when the election is otherwise a toss-up, prefer one of them. */
  quiet?: string[]
}): string {
  const characters = opts.roster.map((r) => `- ${r.name} (id: ${r.id}): ${r.hook}`).join('\n')
  const userLine = opts.user
    ? `- ${opts.user.name} (the user — present and speaking to the group; never elect them)${
        opts.user.hook ? `: ${opts.user.hook}` : ''
      }\n`
    : ''
  const roster = userLine + characters
  const history = opts.recent.map((m) => `${m.name}: ${m.text}`).join('\n')
  const hasReplied = opts.repliedThisTurn.length > 0
  const setting = opts.event.when
    ? `${opts.event.location}, ${opts.event.when}`
    : opts.event.location
  const mood = opts.event.vibe ? ` Mood: ${opts.event.vibe}.` : ''

  // Two distinct decisions. First election: someone MUST answer the user, so pick
  // the addressed character. Continuation: the default is to STOP ("none") — a
  // second/third speaker is the rare exception, not a quota to fill. Reaching the
  // reply cap is a ceiling, never a goal.
  const instructions = hasReplied
    ? [
        `Someone has already replied this turn.`,
        `If the MOST RECENT message directly addresses another present character by name, asks them a question, or clearly hands the conversation to them, elect THAT character so they can respond.`,
        `Otherwise usually answer "none" — most turns have just one speaker. Only elect another character if they have a strong, specific, immediate reason to interject; do not add a speaker merely to keep the scene busy.`,
      ]
    : [
        `Decide who speaks NEXT. Prefer the character the user is directly addressing.`,
        `A bystander should be chosen ONLY if they have a strong, specific reason to interject.`,
      ]

  // Airtime nudge, never an override: the addressed/most-relevant character
  // still wins; this only breaks ties toward characters who haven't spoken.
  if (opts.quiet?.length) {
    instructions.push(
      `${opts.quiet.join(', ')} ${
        opts.quiet.length > 1 ? 'have' : 'has'
      } not spoken recently — when the choice is otherwise even, prefer giving them the moment (only if it fits the scene).`
    )
  }

  return [
    `Setting: ${setting}. Event: ${opts.event.description}.${mood}`,
    ...(opts.event.note
      ? [
          `Director's note (the host's standing instruction — weight it heavily): ${opts.event.note}`,
        ]
      : []),
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

/**
 * The director-beat prompt. Asks the model for a SHORT world/narration beat that
 * nudges the scene forward (an announcement, an arrival, a shift in the
 * environment), or an empty string when nothing would meaningfully add. The
 * director narrates the world ONLY — it never speaks or acts for any character or
 * for the user.
 */
export function buildDirectorEventPrompt(opts: {
  event: { location: string; description: string; when?: string; vibe?: string; note?: string }
  roster: Array<{ name: string; hook: string }>
  recent: Array<{ name: string; text: string }>
}): string {
  const setting = opts.event.when
    ? `${opts.event.location}, ${opts.event.when}`
    : opts.event.location
  const mood = opts.event.vibe ? ` Mood: ${opts.event.vibe}.` : ''
  const roster = opts.roster.map((r) => `- ${r.name}: ${r.hook}`).join('\n')
  const history = opts.recent.map((m) => `${m.name}: ${m.text}`).join('\n')

  return [
    `You are the unseen scene director for an event.`,
    `Setting: ${setting}. Event: ${opts.event.description}.${mood}`,
    ...(opts.event.note
      ? [
          `Director's note (the host's standing instruction for the scene — follow it): ${opts.event.note}`,
        ]
      : []),
    `Characters present:`,
    roster,
    ``,
    `Recent conversation:`,
    history,
    ``,
    `Optionally narrate ONE brief world beat (1-2 sentences, third person, present tense)`,
    `that moves the story forward — an announcement, someone arriving, the music changing,`,
    `the lights dimming, last call, etc. Make it fit the setting and the moment.`,
    `Describe the WORLD only: never speak, think, or act for any character or for the user.`,
    `If nothing would meaningfully add right now, return an empty string.`,
    `Respond with JSON: { "narration": "<beat or empty string>" }.`,
  ].join('\n')
}

/**
 * Per-speaker directive injected into the system prompt on every event reply.
 * In a 1:1 chat a character naturally stays in their own voice, but an event's
 * scene-setting context (third-person "Setting: … Present: …", the world/director
 * narration, other characters' lines) frames everything as prose, so characters
 * start narrating the whole scene. This pulls each speaker back to their own
 * dialogue and actions — scene narration is the (separate) director's job.
 */
export function buildEventCharacterPrompt(name: string): string {
  return [
    `You are ${name} in a group scene with other people present.`,
    `Respond ONLY as ${name}: write ${name}'s own spoken words and immediate actions, in character, exactly as you would in a one-on-one chat.`,
    `Do NOT narrate the setting, the atmosphere, the passage of time, world events, or what anyone else says, thinks, or does — a separate narrator handles all scene description.`,
  ].join(' ')
}

/** JSON Schema for the director-beat response. */
export function buildDirectorEventSchema(): object {
  return {
    type: 'object',
    properties: { narration: { type: 'string' } },
    required: ['narration'],
  }
}
