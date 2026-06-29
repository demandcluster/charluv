import { assertValid } from '/common/valid'
import { store } from '../../db'
import { generateImage, IMAGE_COST } from '../../image'
import { handle, StatusError } from '../wrap'

export const createImage = handle(async ({ body, userId, socketId, log, params }) => {
  assertValid(
    {
      user: 'any?',
      prompt: 'string',
      messageId: 'string?',
      ephemeral: 'boolean?',
      append: 'boolean?',
      source: 'string?',
      parent: 'string?',
    },
    body
  )
  const user = userId ? await store.users.getUser(userId) : body.user

  const guestId = userId ? undefined : socketId

  if (userId === 'anon') {
    return { success: false }
  }

  // Charge logged-in users for image generation / regeneration.
  if (userId) {
    if (user?.credits && user.credits < IMAGE_COST) {
      throw new StatusError('Not enough credits', 400)
    }
    await store.credits.updateCredits(userId, -IMAGE_COST)
  }

  generateImage(
    {
      user,
      prompt: body.prompt,
      chatId: params.id,
      messageId: body.messageId,
      ephemeral: body.ephemeral,
      append: body.append,
      source: body.source || 'unknown',
      parentId: body.parent,
    },
    log,
    guestId
  )
  return { success: true }
})
