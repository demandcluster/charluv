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

/** Stage tokens the LLM understands. The string is injected verbatim as `LEVEL("<stage>")`. */
export const RELATIONSHIP_STAGES = [
  'NOVICE',
  'NEUTRAL',
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
export type CharacterProgression = {
  /** Reference into ARCHETYPES. Ignored when `map` is provided. */
  archetype?: string
  /** Fully custom ordered steps. Overrides `archetype` when present. */
  map?: ProgressionStep[]
  /** Disable relationship progression entirely for this character. */
  disabled?: boolean
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
    label: 'Romantic',
    description: 'Shy first meeting that grows into love and eventually marriage.',
    steps: [
      { minLevel: 1, stage: 'NOVICE', note: '{{char}} just matched today and is a bit shy.' },
      { minLevel: 4, stage: 'NEUTRAL', note: '{{char}} is starting to like {{user}}; be patient.' },
      { minLevel: 8, stage: 'BEGINNER', note: '{{char}} wants {{user}} as more than a friend.' },
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
    description: 'Sweet romance that settles into a devoted girlfriend relationship.',
    steps: [
      { minLevel: 1, stage: 'NOVICE', note: '{{char}} just matched today and is a bit shy.' },
      { minLevel: 5, stage: 'BEGINNER' },
      { minLevel: 12, stage: 'LOVER' },
      { minLevel: 20, stage: 'GIRLFRIEND' },
    ],
  },
  {
    id: 'casual',
    label: 'Casual',
    description: 'Skips romance — a flirty fling that turns purely physical. Never marries.',
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
    description: 'Develops into a devoted submissive who obeys {{user}}.',
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
    description: 'Develops into a dominatrix who takes control of {{user}}.',
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

/** The ordered steps in effect for a character's progression config. */
export function getProgressionSteps(progression?: CharacterProgression): ProgressionStep[] {
  if (progression?.disabled) return []
  if (progression?.map?.length) return [...progression.map].sort((a, b) => a.minLevel - b.minLevel)
  const archetype = getArchetype(progression?.archetype) || getArchetype(DEFAULT_ARCHETYPE_ID)
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

/** Render the stage as the `LEVEL("STAGE")` token (+ optional note) the LLM expects. */
export function formatStageToken(step: ProgressionStep): string {
  const token = `LEVEL("${step.stage}")`
  return step.note ? `${token} ${step.note}` : token
}
