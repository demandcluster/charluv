import { ImageAdapterResponse, ImageGenerateRequest } from './types'
import { AppLog } from '../middleware'
import { handleNovelImage } from './novel'
import { store } from '../db'
import { config } from '../config'
import { v4 } from 'uuid'
import { saveFile } from '../api/upload'
import { handleSDImage } from './stable-diffusion'
import { sendGuest, sendMany } from '../api/ws'
import { handleHordeImage } from './horde'
import { handleZImage, isZImageConfigured } from './zimage'
import { inferenceGate, priorityForUser, ClientGoneError } from '../queue'
import { getCachedTiers } from '../db/subscriptions'

/** Credit cost charged up-front by the image route; refunded if the request is
 * dropped because the client disconnected before generation. */
export const IMAGE_COST = 25

/**
 * Merge negative-prompt sources into a single comma-separated string, deduping
 * tokens case-insensitively (first occurrence wins, preserving order). Used to
 * apply the server-wide negative (config.inference.imageNegative) ahead of any
 * legacy per-character/chat/user negative.
 */
function mergeNegative(...parts: Array<string | undefined>) {
  const seen = new Set<string>()
  const out: string[] = []
  for (const part of parts) {
    if (!part) continue
    for (const token of part.split(',')) {
      const trimmed = token.trim()
      if (!trimmed) continue
      const key = trimmed.toLowerCase()
      if (seen.has(key)) continue
      seen.add(key)
      out.push(trimmed)
    }
  }
  return out.join(', ')
}

export async function generateImage(
  { user, chatId, messageId, ...opts }: ImageGenerateRequest,
  log: AppLog,
  guestId?: string
) {
  const broadcastIds: string[] = []

  const chat = chatId ? await store.chats.getChatOnly(chatId) : undefined
  const characterId =
    chat?.imageSource === 'main-character'
      ? chat.characterId
      : chat?.imageSource === 'last-character'
      ? opts.characterId
      : // Fall back to the explicit character (e.g. the native image tool) or the
        // chat's main character so the character's stored LoRA is always used.
        // imageSettings source selection below is unchanged.
        opts.characterId || chat?.characterId
  const character =
    chat && characterId ? await store.characters.getCharacter(chat.userId, characterId) : undefined

  if (!guestId) {
    broadcastIds.push(user._id)
    if (chatId) {
      const members = await store.chats.getActiveMembers(chatId)
      broadcastIds.push(...members, user._id)
    }
  }

  let image: ImageAdapterResponse | undefined
  let output: string = ''
  let error: any

  let parsed = opts.prompt.replace(/\{\{prompt\}\}/g, ' ')
  let prompt = parsed

  let imageSettings =
    chat?.imageSource === 'main-character' || chat?.imageSource === 'last-character'
      ? character?.imageSettings
      : chat?.imageSource === 'chat'
      ? chat?.imageSettings
      : user.images

  if (!imageSettings) {
    imageSettings = user.images
  }

  if (imageSettings?.template) {
    prompt = imageSettings.template.replace(/\{\{prompt\}\}/g, parsed)
    if (!prompt.includes(parsed)) {
      prompt = prompt + ' ' + parsed
    }
  }

  prompt = prompt.trim()

  if (!opts.noAffix) {
    const parts = [prompt]
    if (imageSettings?.prefix) {
      parts.unshift(imageSettings.prefix)
    }

    if (imageSettings?.suffix) {
      parts.push(imageSettings.suffix)
    }

    prompt = parts
      .join(', ')
      .split(',')
      .filter((p) => !!p.trim())
      .join(', ')
      .replace(/,+/g, ',')
      .replace(/ +/g, ' ')
  }

  log.debug({ prompt, type: imageSettings?.type, source: chat?.imageSource }, 'Image prompt')
  // Server-wide negative overrules: it's always applied first, with any legacy
  // stored negative appended (deduped) so nothing previously configured is lost.
  const negative = mergeNegative(config.inference.imageNegative, imageSettings?.negative)

  if (!guestId) {
    // Broadcast to all chat members (not just sendOne) so the reply message can
    // show a loading spinner while the image generates. Include `messageId` when
    // attaching to an existing message (e.g. the native image tool path).
    sendMany(broadcastIds, {
      type: 'image-generation-started',
      prompt,
      negative,
      service: imageSettings?.type,
      requestId: opts.requestId,
      chatId,
      messageId,
    })
  }

  try {
    const priority = priorityForUser(user as any, !!guestId, getCachedTiers())
    image = await inferenceGate.run(
      {
        kind: 'image',
        priority,
        userId: guestId ? undefined : user._id,
        socketId: guestId,
        requestId: opts.requestId,
      },
      async () => {
        // image-endpoint-only: when the self-hosted Z-Image backend is configured,
        // route all generation there regardless of the chat/user's stored `type`
        // (production data is 'horde'). Generate from the character's stored LoRA
        // (i2L Mode A) when present, with its locked seed for consistency. No data
        // migration required.
        if (isZImageConfigured()) {
          // Character/avatar/gallery images (faster) vs in-chat images (keep quality).
          const isCharImage = opts.source === 'avatar'
          const size = isCharImage
            ? config.inference.imageSize || 640
            : config.inference.imageChatSize || 512
          const steps = isCharImage
            ? config.inference.imageSteps || 14
            : config.inference.imageChatSteps || 20
          return handleZImage(
            {
              user,
              prompt,
              negative,
              settings: imageSettings,
              loraName: character?.loraName,
              // Seed is locked only when supplied by the caller (the character
              // editor). Chat generation omits it so images vary (the LoRA gives
              // identity). Persisted character.imageSeed is forwarded by the editor.
              seed: opts.seed,
              width: size,
              height: size,
              steps,
            },
            log,
            guestId
          )
        }
        switch (imageSettings?.type || 'horde') {
          case 'novel':
            return handleNovelImage(
              { user, prompt, negative, settings: imageSettings },
              log,
              guestId
            )
          case 'sd':
          case 'agnai':
            return handleSDImage({ user, prompt, negative, settings: imageSettings }, log, guestId)
          case 'horde':
          default:
            return handleHordeImage(
              { user, prompt, negative, settings: imageSettings },
              log,
              guestId
            )
        }
      }
    )
  } catch (ex: any) {
    if (ex instanceof ClientGoneError) {
      // Client disconnected before the image was generated; the gate freed the
      // slot. Refund the credits the route charged up-front (guests aren't charged).
      if (!guestId && user?._id) {
        await store.credits.updateCredits(user._id, IMAGE_COST)
      }
      return { output: '' }
    }
    error = ex.message || ex
  }

  /**
   * If the server is configured to save images: we will store the image, generate a message, then publish the message
   * Otherwise: We will broadcast the image content
   */
  if (image) {
    // Guest images do not get saved under any circumstances

    if (typeof image.content === 'string' && image.content.startsWith('http')) {
      output = image.content
    }

    if (guestId) {
      if (!output) {
        output = `data:image/png;base64,${image.content.toString('base64')}`
      }
      // Persist whenever this is a real chat image (has a chatId) OR the server
      // opts into saving all images. Without this, chat images were uploaded but
      // never attached to a message, so they vanished from history on refresh.
    } else if (!opts.ephemeral && (config.storage.saveImages || !!chatId)) {
      const name = `${v4()}.${image.ext}`

      if (!output) {
        output = await saveFile(name, image.content)
      }

      if (!guestId && chatId) {
        const msg = await createImageMessage({
          chatId,
          userId: user._id,
          filename: output,
          memberIds: broadcastIds,
          messageId,
          imagePrompt: opts.prompt,
          append: opts.append,
          meta: { negative },
          parentId: opts.parentId,
        })

        if (msg) return
      }
    } else {
      // Ephemeral preview — e.g. the create-wizard portrait (or an avatar
      // regen) before the character is saved. Never persist these: previously
      // they were written as `temp-*` files with a 300s TTL, but on S3/R2 that
      // TTL is only the HTTP `Expires` cache header, NOT an object-expiration
      // rule, so abandoned previews orphaned in the bucket forever. Return the
      // image inline as base64 instead — nothing touches storage. The real
      // avatar is persisted separately when the character is actually saved.
      output = output || `data:image/${image.ext};base64,${image.content.toString('base64')}`
    }
  }

  const message = image
    ? {
        type: 'image-generated',
        chatId,
        image: output,
        source: opts.source,
        requestId: opts.requestId,
      }
    : {
        type: 'image-failed',
        chatId,
        error: error || 'Invalid image settings (No handler found)',
        requestId: opts.requestId,
      }

  if (broadcastIds.length) {
    sendMany(broadcastIds, message)
  } else if (guestId) {
    sendGuest(guestId, message)
  }

  return { output }
}

async function createImageMessage(opts: {
  chatId: string
  userId: string
  filename: string
  messageId?: string
  memberIds: string[]
  imagePrompt: string
  append?: boolean
  meta?: any
  parentId: string | undefined
}) {
  const chat = opts.chatId ? await store.chats.getChatOnly(opts.chatId) : undefined
  if (!chat) return

  const char = await store.characters.getCharacter(chat.userId, chat.characterId)
  if (!char) return

  if (opts.messageId && !opts.append) {
    const msg = await store.msgs.editMessage(opts.messageId, {
      msg: opts.filename,
      adapter: 'image',
      meta: opts.meta,
    })
    sendMany(opts.memberIds, {
      type: 'message-retry',
      chatId: opts.chatId,
      messageId: opts.messageId,
      message: opts.filename,
      adapter: 'image',
    })
    return msg
  } else if (opts.messageId && opts.append) {
    const prev = await store.msgs.getMessage(opts.messageId)
    const extras = prev?.extras || []
    extras.push(opts.filename)
    // Preserve the target message's existing adapter so its text still renders.
    // Only update `extras` — setting adapter:'image' here would make the renderer
    // treat the message text as an image URL.
    await store.msgs.editMessage(opts.messageId, { extras })
    sendMany(opts.memberIds, {
      type: 'message-retry',
      chatId: opts.chatId,
      messageId: opts.messageId,
      message: prev?.msg || '',
      extras,
      adapter: prev?.adapter,
    })
    if (prev) prev.extras = extras
    return prev
  } else {
    const msg = await store.msgs.createChatMessage({
      chatId: opts.chatId!,
      message: opts.filename,
      characterId: char._id,
      adapter: 'image',
      ooc: false,
      imagePrompt: opts.imagePrompt,
      event: undefined,
      meta: opts.meta,
      parent: opts.parentId,
      name: char.name,
    })

    sendMany(opts.memberIds, { type: 'message-created', msg, chatId: opts.chatId })
    return msg
  }
}
