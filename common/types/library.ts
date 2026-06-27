import { PersonaFormat } from '../adapters'
import { CharacterProgression } from '../progression'
import { JsonField } from '../prompt'
import { BaseImageSettings, ImageSettings } from './image-schema'
import { MemoryBook } from './memory'
import { FullSprite } from './sprite'
import { VoiceSettings } from './texttospeech-schema'

/** Description of the character or user */
export type Persona =
  | {
      kind: PersonaFormat
      attributes: { [key: string]: string[] }
    }
  | { kind: 'text'; attributes: { text: [string] } }

export interface BaseCharacter {
  _id: string
  name: string
  description?: string
  appearance?: string
  avatar?: string
  persona: Persona
  greeting: string
  scenario: string
  sampleChat: string
}

export interface Character extends BaseCharacter {
  kind: 'character'
  userId: string

  culture?: string
  tags?: string[]

  visualType?: string
  sprite?: FullSprite

  createdAt: string
  updatedAt: string
  deletedAt?: string

  favorite?: boolean

  voice?: VoiceSettings
  voiceDisabled?: boolean

  image?: ImageSettings

  json?: ResponseSchema
  parent?: string
  children?: number
  /** Flags this character as a public, pickable companion shown in Discover. */
  match?: boolean
  /** Relationship experience on the user's copy of the character. Drives the progression stage. */
  xp?: number
  share?: string
  premium: boolean
  /**
   * Incomplete wizard character. The creation credit is charged when the draft
   * is created (on entering the final/portrait step); it's finalized — and made
   * visible — only when the user completes creation. Drafts are hidden from
   * Discover and the My AI list. One draft per user; abandoning forfeits it.
   */
  draft?: boolean
  /**
   * @deprecated Legacy scenario-state-machine progression. Replaced by `progression` (archetypes).
   * Retained only for back-compat with existing ScenarioBooks during migration.
   */
  scenarioIds?: string[]
  /** Relationship progression config (archetype or custom level->stage map). */
  progression?: CharacterProgression

  // --- Discover gallery metadata (additive; all optional, missing reads as unset/zero) ---
  // 'trans' is the canonical third option (the create wizard's value); 'nonbinary'
  // is retained for legacy data written by the editor before they were unified.
  gender?: 'female' | 'male' | 'trans' | 'nonbinary'
  artStyle?: 'realistic' | 'anime'
  /** Display bucket for the age-gated gallery (e.g. "18-25"). */
  ageRange?: string
  /** Curated Discover categories (distinct from free-form `tags`). */
  category?: string[]
  nsfw?: boolean
  /** Aggregated engagement counters, tracked on the public template character. */
  engagement?: CharacterEngagement

  // --- User publishing + moderation (additive; distinct from the legacy admin `match` flag) ---
  /**
   * Live in Discover via the user-publishing system. Kept separate from `match`
   * so legacy admin-curated templates (match:true) and user-published characters
   * coexist, and a private character can never be exposed by accident.
   */
  published?: boolean
  publishedAt?: number
  /** The one-time 500-credit publish reward has been granted (never re-rewarded). */
  publishRewarded?: boolean
  /** Automated (vision-LLM) verdict + admin stage-2 review state. */
  moderation?: CharacterModeration
  /** Distinct user reports against the published character; >=3 auto-hides it. */
  reportCount?: number

  folder?: string
  // v2 stuff
  alternateGreetings?: string[]
  characterBook?: MemoryBook
  extensions?: Record<string, any>
  systemPrompt?: string
  postHistoryInstructions?: string
  insert?: { depth: number; prompt: string }
  creator?: string
  characterVersion?: string
  imageSettings?: BaseImageSettings

  // --- Z-Image character-consistent generation (i2L) ---
  /**
   * Name of the stored Z-Image LoRA encoding this character's identity. Returned
   * by POST /v1/encode; passed as `lora_name` to /v1/generate for every image.
   */
  loraName?: string
  /**
   * Locked seed used to bootstrap a consistent reference set at create time
   * (before the LoRA exists). Reusing it keeps pre-LoRA previews coherent.
   */
  imageSeed?: number
  /** Multi-image gallery (saved image URLs/filenames). `avatar` is the cover. */
  gallery?: string[]

  /**
   * Public display name (profile handle) of the creator. Transient: joined onto
   * Discover responses from the creator's profile, never stored on the char doc.
   */
  creatorName?: string
}

export interface LibraryCharacter extends Omit<Character, 'kind' | 'tags'> {
  kind: 'library-character'
  tags: string[]

  // Statistics
  downloads: number
  reactions: Record<string, number>
  chats: number
  messages: number
}

export interface CharacterEngagement {
  chats: number
  messages: number
  favorites: number
  /** Recency-weighted score for the "trending" sort; recomputed periodically. */
  trending?: number
}

/** Known moderation flag keys raised by the vision-LLM check. Free-form strings
 * are allowed too — these are the ones the UI gives friendly labels to. */
export type ModerationFlag =
  | 'underage'
  | 'violence'
  | 'noncon'
  | 'incest'
  | 'copyright'
  | 'illegal'
  | 'other'

export interface CharacterModeration {
  /**
   * approved — passed the automated check, live (pending optional admin stage-2).
   * flagged  — borderline; live but surfaced to admins for stage-2 review.
   * rejected — failed the automated check; not published.
   * hidden   — taken down (report threshold or admin action); not shown in Discover.
   * review   — was public but has been edited; private until re-published + re-checked.
   */
  status: 'approved' | 'flagged' | 'rejected' | 'hidden' | 'review'
  /** Issues the model raised (e.g. ['underage','violence']). */
  flags?: ModerationFlag[] | string[]
  /** Model explanation / decline message shown to the user. */
  reason?: string
  /** When the automated check last ran. */
  autoCheckedAt?: number
  /** An admin has completed stage-2 review of this live character. */
  moderated?: boolean
  moderatedBy?: string
  moderatedAt?: number
}

export interface ResponseSchema {
  schema: JsonField[]
  response: string
  history: string
}
