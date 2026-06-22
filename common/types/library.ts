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
  gender?: 'female' | 'male' | 'nonbinary'
  artStyle?: 'realistic' | 'anime'
  /** Display bucket for the age-gated gallery (e.g. "18-25"). */
  ageRange?: string
  /** Curated Discover categories (distinct from free-form `tags`). */
  category?: string[]
  nsfw?: boolean
  /** Aggregated engagement counters, tracked on the public template character. */
  engagement?: CharacterEngagement

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

export interface ResponseSchema {
  schema: JsonField[]
  response: string
  history: string
}
