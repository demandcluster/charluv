import { AppSchema } from '../../common/types/schema'
import { AppLog } from '../middleware'
import { BaseImageSettings } from '/common/types/image-schema'

export type ImageGenerateRequest = {
  user: AppSchema.User
  prompt: string
  chatId?: string
  messageId?: string
  ephemeral?: boolean
  append?: boolean
  source: string
  noAffix?: boolean
  characterId?: string
  requestId?: string
  parentId: string | undefined
  /** Locked seed for consistent results (editor only; chat omits it). */
  seed?: number
}

export type ImageRequestOpts = {
  user: AppSchema.User
  prompt: string
  negative: string
  settings: BaseImageSettings | undefined
  /** Z-Image stored LoRA to generate the character from (i2L Mode A). */
  loraName?: string
  /** Locked seed for reproducible/consistent generation. */
  seed?: number
  /** Output dimensions (chat images are smaller than character/avatar images). */
  width?: number
  height?: number
}

export type ImageAdapter = (
  opts: ImageRequestOpts,
  log: AppLog,
  guestId?: string
) => Promise<ImageAdapterResponse>

export type ImageAdapterResponse = { ext: string; content: Buffer | string; seed?: number }
