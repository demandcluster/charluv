import { AppSchema } from './types/schema'

/**
 * Shared rules + minimum-quality thresholds for publishing a character to the
 * public Discover gallery. Used by the client (to render the Make-Public modal
 * and pre-validate) and the server (to enforce before running moderation).
 *
 * Original wording — keep these phrased in our own voice.
 */

export const PUBLISH_DEFAULTS = {
  /** Successful publishes allowed per user per day. */
  dailyFree: 2,
  dailyPremium: 10,
  /** One-time credit reward granted the first time a character goes public. */
  reward: 500,
  /** Auto-hide a published character once it reaches this many distinct reports. */
  reportThreshold: 3,
}

/** Minimum character counts a character must meet to be publishable. */
export const PUBLISH_MIN = {
  greeting: 50,
  description: 150,
  scenario: 300,
  /** Persona text + sample chat, combined. */
  personality: 400,
}

/** Content rules shown in the Make-Public modal. Our own wording. */
export const PUBLISH_RULES: string[] = [
  'Everyone must read clearly as an adult — in age, appearance, and the way they behave.',
  'Characters need their own agency. No depictions of non-consent, coercion, or exploitation.',
  'No sexual content between family members or relatives.',
  'Heavy themes and trauma are allowed, but handle them with care and intent.',
  'No real people, and no copyrighted or trademarked characters.',
]

/** Short note under the rules. */
export const PUBLISH_RULES_NOTE =
  'Borderline submissions may be reviewed by a moderator after they go live. Anything that breaks these rules can be taken down.'

/** Reasons a character can be reported. */
export const REPORT_REASONS: { value: string; label: string }[] = [
  { value: 'underage', label: 'Appears underage' },
  { value: 'violence', label: 'Gratuitous violence or gore' },
  { value: 'noncon', label: 'Non-consent / coercion' },
  { value: 'incest', label: 'Incest / family sexual content' },
  { value: 'copyright', label: 'Real person or copyrighted character' },
  { value: 'illegal', label: 'Illegal content' },
  { value: 'spam', label: 'Spam or low effort' },
  { value: 'other', label: 'Something else' },
]

/** Friendly labels for the moderation flag keys the vision LLM can raise. */
export const FLAG_LABELS: Record<string, string> = {
  underage: 'Underage',
  violence: 'Violence',
  noncon: 'Non-consent',
  incest: 'Incest',
  copyright: 'Copyright',
  illegal: 'Illegal',
  other: 'Other',
}

export type PublishRequirement = {
  key: keyof typeof PUBLISH_MIN
  label: string
  min: number
  actual: number
  ok: boolean
}

const REQUIREMENT_LABELS: Record<keyof typeof PUBLISH_MIN, string> = {
  greeting: 'Greeting',
  description: 'Public description',
  scenario: 'Scenario',
  personality: 'Personality & details',
}

/** Flatten any persona shape to plain text length. */
export function personaText(persona?: AppSchema.Persona): string {
  if (!persona?.attributes) return ''
  const parts: string[] = []
  for (const value of Object.values(persona.attributes)) {
    if (Array.isArray(value)) parts.push(...value.filter((v) => typeof v === 'string'))
  }
  return parts.join(' ').trim()
}

const len = (v?: string) => (typeof v === 'string' ? v.trim().length : 0)

/** Evaluate a character against the minimum-quality thresholds. */
export function checkPublishRequirements(char: Partial<AppSchema.Character>): {
  ok: boolean
  requirements: PublishRequirement[]
} {
  const actuals: Record<keyof typeof PUBLISH_MIN, number> = {
    greeting: len(char.greeting),
    description: len(char.description),
    scenario: len(char.scenario),
    personality: personaText(char.persona).length + len(char.sampleChat),
  }

  const requirements = (Object.keys(PUBLISH_MIN) as (keyof typeof PUBLISH_MIN)[]).map((key) => ({
    key,
    label: REQUIREMENT_LABELS[key],
    min: PUBLISH_MIN[key],
    actual: actuals[key],
    ok: actuals[key] >= PUBLISH_MIN[key],
  }))

  return { ok: requirements.every((r) => r.ok), requirements }
}
