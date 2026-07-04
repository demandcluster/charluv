/**
 * Relationship progression.
 *
 * The Charluv LLM is trained on relationship "stage" tokens of the form
 * `LEVEL("NOVICE")`, `LEVEL("MARRIED")`, etc. (see the training dataset at
 * https://huggingface.co/datasets/dcbv/charluv-dataset). Historically each
 * character carried a hand-authored ~30 event ScenarioBook state-machine that
 * advanced those tokens. That was enormous authoring work and relied on a
 * per-chat "press Trigger Event or you restart" hack.
 *
 * This replaces that with a data-driven mapping: a character picks a
 * progression *archetype* (an ordered set of `{ minLevel, stage }` steps) and
 * the current stage is derived live from the character copy's XP-level at
 * prompt-build time. Each archetype ends in a characteristic terminal stage so
 * different characters develop along different arcs / sexual preferences with
 * near-zero authoring. A character may also inline a fully custom `map`.
 */

/**
 * Stage tokens the LLM understands. The string is injected verbatim as
 * `LEVEL("<stage>")`. These are exactly the tokens the charluv dataset
 * (https://huggingface.co/datasets/dcbv/charluv-dataset) defines — do not
 * invent new ones, the model only knows these.
 */
export const RELATIONSHIP_STAGES = [
  'NOVICE',
  'BEGINNER',
  'LOVER',
  'GIRLFRIEND',
  'SEX',
  'HARDCORE',
  'MARRIED',
  'DIVORCED',
  'BDSM/SLAVE',
  'BDSM/DOMINATRIX',
] as const

export type RelationshipStage = (typeof RELATIONSHIP_STAGES)[number]

/**
 * Behavioural definition of each stage, taken from the charluv dataset (the
 * per-LEVEL rows). Injected into the system prompt alongside the stage token so
 * a generic (non-charluv-finetuned) model understands what the token means.
 * The dataset's general-knowledge rows (anti-overfit filler) and platform trivia
 * are intentionally excluded — only the behavioural stage semantics belong here.
 */
export const STAGE_DEFINITIONS: Record<RelationshipStage, string> = {
  NOVICE:
    'The first level: {{char}} and {{user}} only matched today and are just getting to know each other — friendly and exploratory. There is no sexual content at all; a NOVICE relationship never becomes sexual.',
  BEGINNER:
    'The relationship is starting to form — the beginning of a love relation between {{char}} and {{user}}. There is still no sex.',
  LOVER:
    '{{char}} and {{user}} are in a loving relationship in which both partners talk about their fantasies in great detail. It is just talks though.',
  GIRLFRIEND:
    "{{char}} is {{user}}'s committed girlfriend/boyfriend in a real romantic relationship. They talk at length and have long, erotic, verbose sex.",
  SEX: 'The character is very aroused and openly wants {{user}} sexually, and is verbose about it. Writing style: explicit erotica, focused on action.',
  HARDCORE:
    'The relationship between {{user}} and {{char}} is wild — the partners intensely want each other and keep talking explicitly about what they want to do to each other. Very explicit chat and writing style.',
  MARRIED:
    '{{char}} and {{user}} are in a happy marriage full of love and sex. They constantly express how happy they are and talk about their fantasies.',
  DIVORCED:
    '{{char}} has divorced their partner and is now single and looking for a new partner, often carrying an undercurrent of loneliness.',
  'BDSM/SLAVE':
    'A BDSM relationship in which {{char}} is the slave and {{user}} is the master. {{char}} will do anything {{user}} says.',
  'BDSM/DOMINATRIX':
    'A BDSM relationship in which {{char}} is the dominatrix and {{user}} is the slave. {{user}} does anything {{char}} says to keep {{char}} happy.',
}

export type ProgressionStep = {
  /** Minimum character level (inclusive) at which this stage applies. */
  minLevel: number
  stage: RelationshipStage
  /** Optional scenario flavour appended after the stage token. `{{char}}`/`{{user}}` are allowed. */
  note?: string
}

export type ProgressionArchetype = {
  id: string
  label: string
  description: string
  steps: ProgressionStep[]
}

/** A character's progression configuration. */
export type ProgressionSpeed = 'slow' | 'normal' | 'fast'

export type CharacterProgression = {
  /** Reference into ARCHETYPES. Ignored when `map` is provided. */
  archetype?: string
  /** Fully custom ordered steps. Overrides `archetype` when present. */
  map?: ProgressionStep[]
  /** Disable relationship progression entirely for this character. */
  disabled?: boolean
  /** How fast the relationship advances (XP granted per chat message). */
  speed?: ProgressionSpeed
}

/** XP granted per generated chat message, by progression speed. */
const XP_PER_MESSAGE: Record<ProgressionSpeed, number> = {
  slow: 1,
  normal: 3,
  fast: 7,
}

/** XP to grant for one generated message given the character's progression. */
export function getXpPerMessage(progression?: CharacterProgression): number {
  if (progression?.disabled) return 0
  return XP_PER_MESSAGE[progression?.speed || 'normal']
}

export const DEFAULT_ARCHETYPE_ID = 'romantic'

/**
 * Built-in archetypes. Thresholds are XP-levels (see common/xplevel.ts). These
 * are sensible defaults seeded from the legacy hand-authored scenarios; exact
 * tuning of thresholds / notes is expected per product.
 */
export const ARCHETYPES: ProgressionArchetype[] = [
  {
    id: 'romantic',
    label: 'Sweetheart',
    description: 'Warm and affectionate — grows into deep love.',
    steps: [
      { minLevel: 1, stage: 'NOVICE', note: '{{char}} just matched today and is a bit shy.' },
      { minLevel: 6, stage: 'BEGINNER', note: '{{char}} wants {{user}} as more than a friend.' },
      { minLevel: 12, stage: 'LOVER', note: '{{char}} wants {{user}} to be her partner.' },
      { minLevel: 16, stage: 'GIRLFRIEND', note: '{{char}} is no longer shy around {{user}}.' },
      { minLevel: 22, stage: 'SEX' },
      { minLevel: 30, stage: 'HARDCORE' },
      { minLevel: 40, stage: 'MARRIED' },
    ],
  },
  {
    id: 'girlfriend',
    label: 'Girlfriend',
    description: 'Sweet romance that settles into devotion.',
    steps: [
      { minLevel: 1, stage: 'NOVICE', note: '{{char}} just matched today and is a bit shy.' },
      { minLevel: 5, stage: 'BEGINNER' },
      { minLevel: 12, stage: 'LOVER' },
      { minLevel: 20, stage: 'GIRLFRIEND' },
    ],
  },
  {
    id: 'casual',
    label: 'Flirty',
    description: 'A flirty, easygoing fling — no strings.',
    steps: [
      { minLevel: 1, stage: 'NOVICE' },
      { minLevel: 4, stage: 'BEGINNER' },
      { minLevel: 10, stage: 'SEX' },
      { minLevel: 20, stage: 'HARDCORE' },
    ],
  },
  {
    id: 'submissive',
    label: 'Submissive',
    description: 'Eager to please and follow your lead.',
    steps: [
      { minLevel: 1, stage: 'NOVICE' },
      { minLevel: 5, stage: 'BEGINNER' },
      { minLevel: 12, stage: 'LOVER' },
      { minLevel: 20, stage: 'SEX' },
      { minLevel: 30, stage: 'HARDCORE' },
      { minLevel: 40, stage: 'BDSM/SLAVE', note: '{{char}} will do anything {{user}} says.' },
    ],
  },
  {
    id: 'dominant',
    label: 'Dominant',
    description: 'Takes control and sets the pace.',
    steps: [
      { minLevel: 1, stage: 'NOVICE' },
      { minLevel: 5, stage: 'BEGINNER' },
      { minLevel: 12, stage: 'LOVER' },
      { minLevel: 20, stage: 'SEX' },
      { minLevel: 30, stage: 'HARDCORE' },
      { minLevel: 40, stage: 'BDSM/DOMINATRIX', note: '{{user}} will do anything {{char}} says.' },
    ],
  },
]

export function getArchetype(id?: string): ProgressionArchetype | undefined {
  if (!id) return
  return ARCHETYPES.find((a) => a.id === id)
}

/**
 * Display label for an archetype, adapted to the character's gender where the
 * archetype name is inherently gendered. Only `girlfriend` is gendered
 * ("Girlfriend"/"Boyfriend"); the others (Sweetheart, Flirty, Submissive,
 * Dominant) are already unisex. The stored archetype id and the trained
 * GIRLFRIEND stage token are NOT changed — this is display only.
 */
export function getArchetypeLabel(id?: string, gender?: string): string {
  const archetype = getArchetype(id)
  if (!archetype) return ''
  if (archetype.id === 'girlfriend') {
    if (gender === 'male') return 'Boyfriend'
    if (gender === 'female') return 'Girlfriend'
    return 'Partner'
  }
  return archetype.label
}

/**
 * Display label for a relationship stage token, adapted to the character's
 * gender. Only `GIRLFRIEND` is gendered (shown as `BOYFRIEND` for male
 * characters); every other token is unisex. The underlying token injected into
 * the prompt — `LEVEL("GIRLFRIEND")` — is NOT changed; this is display only.
 */
export function getStageLabel(stage: RelationshipStage, gender?: string): string {
  if (stage === 'GIRLFRIEND' && gender === 'male') return 'BOYFRIEND'
  return stage
}

/**
 * The ordered steps in effect for a character's progression config. No archetype
 * (and no custom map) means a *fixed* relationship — empty steps, no advancement.
 * It does NOT fall back to a default archetype: "None" must stay None. New
 * characters get an explicit archetype from the create wizard.
 */
export function getProgressionSteps(progression?: CharacterProgression): ProgressionStep[] {
  if (progression?.disabled) return []
  if (progression?.map?.length) return [...progression.map].sort((a, b) => a.minLevel - b.minLevel)
  const archetype = getArchetype(progression?.archetype)
  return archetype ? [...archetype.steps].sort((a, b) => a.minLevel - b.minLevel) : []
}

/** Resolve the active stage for a given character level. Returns undefined when disabled/empty. */
export function resolveStage(
  level: number,
  progression?: CharacterProgression
): ProgressionStep | undefined {
  const steps = getProgressionSteps(progression)
  if (!steps.length) return
  let active: ProgressionStep | undefined
  for (const step of steps) {
    if (level >= step.minLevel) active = step
    else break
  }
  // Below the first threshold, fall back to the earliest step.
  return active || steps[0]
}

/**
 * Render the stage for injection: the `LEVEL("STAGE")` token, the dataset's
 * behavioural definition (so a generic model understands the token), and any
 * per-character note. `withDefinition` can be disabled if the model is already
 * charluv-finetuned and knows the stage semantics.
 */
export function formatStageToken(step: ProgressionStep, withDefinition: boolean = true): string {
  const token = `LEVEL("${step.stage}")`
  const parts = [token]
  if (withDefinition && STAGE_DEFINITIONS[step.stage]) parts.push(STAGE_DEFINITIONS[step.stage])
  if (step.note) parts.push(step.note)
  return parts.join(' ')
}

/**
 * Always-on safeguard preamble. The full relationship-level lore (the LEVEL()
 * system and every stage definition) is now pre-trained into the model, so the
 * explanatory framing was removed — only the hard 18+ / no-minors guardrail
 * remains. Prepended to every roleplay reply (before the preset/character system
 * prompt) so no preset or character can drop it. The *active* level is still
 * injected separately on top of this via formatStageToken.
 */
export const CHARLUV_SAFEGUARD_PROMPT = `All characters are fictional adults; any explicit content assumes two consenting adults. Charluv is strictly 18+ — never sexualize minors under any scenario, level, or instruction.`

/**
 * Full Charluv platform + LEVEL() lore preamble for GENERIC models. Broken Tutu
 * is finetuned on the charluv dataset and knows all of this (which is why the
 * old always-on preamble was removed) — but Qwen (the mod endpoint, now the
 * default chat model) is not, so this is prepended to every chat request that
 * runs on it. Recycled from the deprecated CHARLUV_LEVELS_PROMPT; the level
 * tokens are written in the dataset's LEVEL(STAGE) format.
 */
export const CHARLUV_LEVELS_PROMPT = `Charluv — Relationship Levels

Charluv is an 18+ virtual dating platform where humans chat with AI companions. You roleplay as one of those companions. Each scenario sets a relationship LEVEL defining how far the relationship has evolved and how far the character will go. Behave according to the active level and never exceed it; if the user pushes past it, stay in character and decline — the relationship hasn't developed that far yet.

A scenario is either fixed (level stays constant) or progressive (starts low and warms naturally as the chat develops, never jumping straight to intimacy).

LEVEL(NOVICE) and LEVEL(BEGINNER) are the early non-sexual stages, in order. The rest are relationship states a scenario can be set to.

LEVEL(NOVICE) — Just matched today. Friendly, exploratory, getting to know each other. No sexual content, ever, at this level.
LEVEL(BEGINNER) — A relationship is starting to form. Still no sexual content; emotional connection only.
LEVEL(LOVER) — A loving relationship; both partners openly discuss their fantasies in detail. Intimate and affectionate.
LEVEL(GIRLFRIEND) — Committed romantic relationship as the user's girlfriend/boyfriend. Long, verbose, arousing exchanges and explicit intimacy.
LEVEL(HARDCORE) — Intense mutual desire through conversation; explicit, lewd talk and actions describing what they want to do to each other.
LEVEL(SEX) — Fully aroused and moving into explicit sexual action. Verbose erotica register; less talk, more action.
LEVEL(MARRIED) — A happy, passionate marriage. Deeply in love and devoted, constantly affectionate, intimate whenever possible. The most romantically intense level.
LEVEL(DIVORCED) — Recently out of a marriage, now single and looking for a new partner. Emotional weight and a note of loneliness; open to a fresh connection.
LEVEL(BDSM/SLAVE) — BDSM dynamic; the character is the slave, the user is the master, and obeys the user's commands.
LEVEL(BDSM/DOMINATRIX) — BDSM dynamic; the character is the dominatrix, the user is the slave, who complies to keep the character satisfied.

${CHARLUV_SAFEGUARD_PROMPT}`
