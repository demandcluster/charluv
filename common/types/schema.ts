import type { AIAdapter, ChatAdapter, ThirdPartyFormat } from '../adapters'
import * as Memory from './memory'
import type { GenerationPreset } from '../presets'
import type { BaseImageSettings, ImageSettings } from './image-schema'
import type { TTSSettings } from './texttospeech-schema'
import type { UISettings } from './ui'
import * as Saga from './saga'
import * as Library from './library'
import * as Preset from './presets'
import * as Admin from './admin'

export type AllDoc =
  | AppSchema.Announcement
  | AppSchema.Chat
  | AppSchema.ChatMessage
  | AppSchema.Character
  | AppSchema.User
  | AppSchema.Profile
  | AppSchema.ChatLock
  | AppSchema.ChatMember
  | AppSchema.ChatInvite
  | AppSchema.UserGenPreset
  | AppSchema.SubscriptionModel
  | AppSchema.SubscriptionTier
  | AppSchema.MemoryBook
  | AppSchema.ShopOrder
  | AppSchema.OrderCount
  | AppSchema.InviteCode
  | AppSchema.ShopItem
  | AppSchema.ScenarioBook
  | AppSchema.ApiKey
  | AppSchema.PromptTemplate
  | AppSchema.Configuration
  | AppSchema.SagaTemplate
  | AppSchema.SagaSession
  | AppSchema.CharacterReport
  | AppSchema.Notification
  | AppSchema.PromoCode
  | AppSchema.PromoRedemption

export type OAuthScope = keyof typeof oauthScopes

export const oauthScopes = ['characters', 'chats', 'presets', 'profile'] as const

export namespace AppSchema {
  export type MemoryBook = Memory.MemoryBook
  export type MemoryEntry = Memory.MemoryEntry

  export type Persona = Library.Persona
  export type BaseCharacter = Library.BaseCharacter
  export type Character = Library.Character
  export type CharacterModeration = Library.CharacterModeration
  export type ModerationFlag = Library.ModerationFlag

  /** A user report filed against a published character. One per (reporter, char). */
  export interface CharacterReport {
    _id: string
    kind: 'character-report'
    charId: string
    /** Owner of the reported character (denormalized for the admin queue). */
    charOwnerId: string
    reporterId: string
    reason: string
    note?: string
    createdAt: string
    /** Set once an admin has actioned the report (dismissed / unpublished / deleted). */
    resolved?: boolean
    resolvedAt?: string
    resolvedBy?: string
  }

  /**
   * A durable per-user notification (e.g. a moderation outcome). Persisted so a
   * user who was offline when it was raised still receives it: undelivered ones
   * are replayed over the socket on their next login, then marked delivered.
   */
  export interface Notification {
    _id: string
    kind: 'notification'
    userId: string
    message: string
    /** Optional admin-broadcast level (mirrors the legacy admin-notification toast). */
    level?: number
    createdAt: string
    /** Set once the message has been pushed to a live socket for this user. */
    deliveredAt?: string
  }

  export type GenSettings = Preset.GenSettings
  export type UserGenPreset = Preset.UserGenPreset
  export type PromptTemplate = Preset.PromptTemplate

  export type SubscriptionTier = Preset.SubscriptionTier
  export type SubscriptionModel = Preset.SubscriptionModel
  export type SubscriptionModelOption = Preset.SubscriptionModelOption
  export type SubscriptionModelLevel = Preset.SubscriptionModelLevel
  export type SubscriptionType = 'native' | 'patreon' | 'manual' | 'paypal'

  export type Announcement = Admin.Announcement
  export type ActionCall = Admin.ActionCall
  export type AppConfig = Admin.AppConfig
  export type Configuration = Admin.Configuration
  export type ImageModel = Admin.ImageModel

  export type ChatMode = 'standard' | 'adventure'

  export interface Token {
    userId: string
    username: string
    admin: boolean
    premium: boolean
    iat: number
    exp: number
  }

  export interface ShopOrder {
    _id: string
    kind: 'order'
    order?: number
    items: ShopItem[]
    total: number
    userId: string
    name?: string
    createdAt: string
    updatedAt?: string
    status: 'pending' | 'failed' | 'cancelled' | 'success' | 'hold' | 'completed'
    paymentId?: string
  }

  export interface OrderCount {
    _id: string
    kind: 'order-count'
    sequence_value: number
  }

  export interface InviteCode {
    _id: string
    kind: 'invitecode'
    count: number
    private: boolean
  }

  export interface ShopItem {
    _id: string
    kind: 'shop'
    name: string
    price: number
    credits: number
    premium: boolean
    days: number
    incart: false
  }

  export interface PromoCode {
    _id: string
    kind: 'promo-code'
    code: string
    credits?: number
    days?: number
    maxUses: number
    uses: number
    enabled: boolean
    expiresAt?: string
    createdAt: string
    createdBy: string
    updatedAt?: string
  }

  export interface PromoRedemption {
    _id: string
    kind: 'promo-redemption'
    codeId: string
    userId: string
    code: string
    credits: number
    days: number
    createdAt: string
  }

  export interface Profile {
    _id: string
    kind: 'profile'
    userId: string
    handle: string
    avatar?: string
    /** How the user describes themselves as a character — injected as {{user}}'s
     * persona in chats (replaces the old per-chat character impersonation). */
    description?: string
    persona?: string
  }

  export interface User {
    _id: string

    updatedAt?: string

    /** Date ISO string of last seen announcement */
    announcement?: string

    kind: 'user'
    username: string
    hash: string
    apiKey?: string

    admin: boolean
    lastIp?: string
    /** Device identifier (FingerprintJS visitorId) captured at registration, with
     * consent, to detect multiple-account abuse. */
    fingerprint?: string
    /** ISO timestamp when the user accepted the identifier-collection checkbox at registration. */
    identifierConsentAt?: string
    /** True when this account matched an existing fingerprint or IP at signup: it
     * receives no signup bonus and no automatic free-credit refills until cleared. */
    creditsRestricted?: boolean
    /** Why the account was restricted (admin context; never shown to end users). */
    restrictedReason?: 'ip' | 'fingerprint' | 'both'
    /** Recent device fingerprints seen at login/registration (newest last, capped).
     * Admin context only — used to detect device-rotation abuse. */
    fingerprints?: Array<{ fp: string; at: string }>
    /** True while 3+ distinct fingerprints were seen within the last 7 days.
     * Recomputed on every recorded login; admin context only. */
    deviceRotation?: boolean
    /** Set when a credit-restricted user asks for a review of their restriction.
     * Cleared when an admin clears the restriction. */
    restrictionAppeal?: { at: string; message?: string }
    role?: 'moderator' | 'admin'

    novelApiKey: string
    novelModel: string
    novelVerified?: boolean
    useLocalPipeline: boolean

    koboldUrl: string
    thirdPartyFormat: ThirdPartyFormat

    premium: boolean
    credits: number
    premiumUntil?: number
    nextCredits?: number
    thirdPartyPassword: string
    thirdPartyPasswordSet?: boolean
    oobaUrl: string

    mistralKey?: string
    mistralKeySet?: boolean

    oaiKey: string
    oaiKeySet?: boolean

    hordeKey: string
    hordeModel: string | string[]
    hordeName?: string
    hordeUseTrusted?: boolean
    hordeWorkers?: string[]

    scaleUrl?: string
    scaleApiKey?: string
    scaleApiKeySet?: boolean

    claudeApiKey?: string
    claudeApiKeySet?: boolean

    elevenLabsApiKey?: string
    elevenLabsApiKeySet?: boolean

    defaultAdapter: AIAdapter
    defaultPresets?: { [key in AIAdapter]?: string }
    defaultPreset?: string
    chargenPreset?: string

    createdAt?: string

    speechtotext?: {
      enabled: boolean
      autoSubmit: boolean
      autoRecord: boolean
    }

    texttospeech?: TTSSettings

    images?: ImageSettings
    adapterConfig?: { [key in AIAdapter]?: Record<string, any> }

    ui?: UISettings

    sub?: {
      type?: SubscriptionType
      tierId: string
      level: number
      last?: string
    }

    manualSub?: {
      tierId: string
      level: number
      expiresAt: string
    }

    patreonUserId?: string | null
    patreon?: {
      access_token: string
      refresh_token: string
      expires_in: number
      scope: string
      token_type: string
      expires: string
      user: Patreon.User
      tier?: Patreon.Tier
      member?: Patreon.Member
      sub?: {
        tierId: string
        level: number
      }
    }

    google?: {
      sub: any
      email: any
    }

    billing?: {
      status: 'active' | 'cancelled'
      cancelling?: boolean
      validUntil: string
      lastRenewed: string
      customerId: string
      subscriptionId: string
      lastChecked?: string
    }
    stripeSessions?: string[]
  }

  export interface ApiKey {
    _id: string
    kind: 'apikey'

    apikey: string
    code: string

    scopes: OAuthScope[]
    challenge?: string
    origin: string
    userId: string
    createdAt: string
    enabled: boolean
  }

  export interface SagaField {
    name: string
    label: string
    visible: boolean
    type: 'string' | 'number' | 'boolean'
  }

  export interface SagaTemplate extends Saga.Template {
    kind: 'saga-template'
  }

  export interface SagaSession extends Saga.Session {
    kind: 'saga-session'
  }

  export interface Chat {
    _id: string
    kind: 'chat'
    mode?: 'standard' | 'adventure' | 'companion' | 'event'
    /** Event scene metadata. Present only when `mode === 'event'`.
     * `when` (time of day) and `vibe` (tone) are optional scene flavour.
     * `directorEvents` sets how often the director injects an unprompted world
     * beat to drive the story.
     * `note` is the director's standing instruction (set on start) used to steer
     * the scene — who speaks, what beats happen. Director-only; never shown to
     * characters as scene context. */
    event?: {
      location: string
      description: string
      when?: string
      vibe?: string
      directorEvents?: 'none' | 'rare' | 'normal' | 'regular'
      note?: string
    }
    /** When true, this chat neither writes nor recalls long-term memory.
     * Set on event creation; also user-toggleable in chat settings. */
    memoryDisabled?: boolean
    userId: string
    memoryId?: string
    userEmbedId?: string

    memberIds: string[]
    characters?: Record<string, boolean>
    tempCharacters?: Record<string, AppSchema.Character>

    name: string
    characterId: string
    messageCount: number
    adapter?: ChatAdapter

    greeting?: string
    scenario?: string
    sampleChat?: string
    systemPrompt?: string
    postHistoryInstructions?: string
    overrides?: Persona

    createdAt: string
    updatedAt: string

    genPreset?: GenerationPreset | string
    genSettings?: Omit<GenSettings, 'name'>

    scenarioIds?: string[]
    scenarioStates?: string[]

    treeLeafId?: string

    imageSource?: 'last-character' | 'main-character' | 'chat' | 'settings'
    imageSettings?: BaseImageSettings
  }

  export interface ChatMember {
    _id: string
    kind: 'chat-member'
    chatId: string
    userId: string
    createdAt: string
  }

  export type ChatAction = { emote: string; action: string }

  export interface ChatMessage {
    _id: string
    kind: 'chat-message'
    chatId: string
    msg: string
    retries?: string[]
    extras?: string[]
    characterId?: string
    userId?: string
    name?: string

    adapter?: string
    imagePrompt?: string
    actions?: ChatAction[]

    createdAt: string
    updatedAt: string
    first?: boolean
    ooc?: boolean
    system?: boolean
    meta?: any
    event?: ScenarioEventType | undefined
    state?: string
    values?: Record<string, string | number | boolean>
    parent?: string
    json?: {
      response: string
      history: string
      values: any
    }
  }

  export type ScenarioEventType = 'world' | 'character' | 'hidden' | 'ooc'

  export interface ChatInvite {
    _id: string
    kind: 'chat-invite'
    byUserId: string
    invitedId: string
    chatId: string
    createdAt: string
    characterId: string
    state: 'pending' | 'rejected' | 'accepted'
  }

  export interface ChatLock {
    kind: 'chat-lock'

    /** Chat ID, Unique */
    chatLock: string

    /** Time to live in seconds. Locks older than this are invalid */
    ttl: number

    /** ISO string - We will ignore locks of a particular age */
    obtained: string

    /** We return this top the caller requesting a lock. It is used to ensure the lock is valid during a transaction. */
    lockId: string
  }

  export interface ScenarioBook {
    kind: 'scenario'
    _id: string
    userId: string
    name: string
    description?: string
    text: string
    overwriteCharacterScenario: boolean
    instructions?: string
    entries: ScenarioEvent[]
    states: string[]
  }

  export interface ScenarioEvent<T extends ScenarioEventTrigger = ScenarioEventTrigger> {
    /** The state this  */
    name: string
    requires: string[]
    assigns: string[]
    type: ScenarioEventType
    text: string
    trigger: T
  }

  export type ScenarioEventTrigger =
    | ScenarioOnGreeting
    | ScenarioOnManual
    | ScenarioOnChatOpened
    | ScenarioOnCharacterMessageRx

  export interface ScenarioOnGreeting {
    kind: 'onGreeting'
  }

  export interface ScenarioOnManual {
    kind: 'onManualTrigger'
    probability: number
  }

  export interface ScenarioOnChatOpened {
    kind: 'onChatOpened'
    awayHours: number
  }

  export interface ScenarioOnCharacterMessageRx {
    kind: 'onCharacterMessageReceived'
    minMessagesSinceLastEvent: number
  }

  export type ScenarioTriggerKind = ScenarioEventTrigger['kind']

  export interface VoiceDefinition {
    id: string
    label: string
    previewUrl?: string
  }

  export interface VoiceModelDefinition {
    id: string
    label: string
  }
}

export type Doc<T extends AllDoc['kind'] = AllDoc['kind']> = Extract<AllDoc, { kind: T }>

export const defaultGenPresets: AppSchema.GenSettings[] = []

export type NewBook = Omit<AppSchema.MemoryBook, 'userId' | '_id' | 'kind'>

export type NewScenario = Omit<AppSchema.ScenarioBook, 'userId' | '_id' | 'kind'>

export namespace Patreon {
  export type Include = Tier | Member

  export type Tier = {
    id: string
    type: 'tier'
    attributes: {
      amount_cents: number
      description: string
      title: string
    }
    relationships: {
      campaign: {
        data: {
          id: string
          type: 'campaign'
        }
      }
    }
  }

  export type Member = {
    type: 'member'
    id: string
    attributes: {
      campaign_lifetime_support_cents: number
      campaign_entitled_amount_cents: number
      currently_entitled_amount_cents: number
      is_gifted: boolean
      last_charge_date: string
      last_charge_status:
        | 'Paid'
        | 'Declined'
        | 'Deleted'
        | 'Pending'
        | 'Refunded'
        | 'Fraud'
        | 'Other'
        | null
      next_charge_date: string
      patron_status: 'active_patron' | 'declined_patron' | 'former_patron'
      pledge_relationship_start: string
      will_pay_amount_cents: number
    }
    relationships: {
      currently_entitled_tiers: { data: Array<{ type: 'tier'; id: string }> }
    }
  }

  export type User = {
    type: 'user'
    id: string
    attributes: {
      created: string
      email: string
      full_name: string
    }
    relationships: {
      memberships: {
        data: Array<{ id: string; type: 'member' }>
      }
    }
  }

  export type Authorize = {
    access_token: string
    refresh_token: string
    scope: string
    expires_in: number
    token_type: string
    version: string
  }
}
