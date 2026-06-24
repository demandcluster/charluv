import { UnwrapBody, assertValid } from '/common/valid'
import { store } from '../../db'
import { createChatStream, getResponseEntities } from '../../adapter/generate'
import { AppRequest, StatusError, errors, handle } from '../wrap'
import { sendGuest, sendMany, sendOne } from '../ws'
import { obtainLock, releaseLock } from './lock'
import { generateImage } from '../../image'
import { getXpPerMessage } from '/common/progression'
import { rememberFact } from '../../memory/store'
import { AppSchema } from '../../../common/types/schema'
import { v4 } from 'uuid'
import { Response } from 'express'
import { getScenarioEventType } from '/common/scenario'
import { HydratedJson, jsonHydrator, parsePartialJson } from '/common/util'
import { EVENT_TURN_COST, EVENT_MAX_REPLIES } from '../../../common/event'
import { electSpeaker } from '../../adapter/director'
import { resolveScenario, getLinesForPrompt, getAdapter } from '../../../common/prompt'
import { getTokenCounter } from '../../tokenize'

type GenRequest = UnwrapBody<typeof genValidator>

const sendValidator = {
  kind: [
    'send-noreply',
    'ooc',
    'summary',
    'send-event:world',
    'send-event:character',
    'send-event:hidden',
    'send-event:ooc',
  ],
  text: 'string',
  impersonate: 'any?',
  parent: 'string?',
  bot: 'boolean?',
} as const

const genValidator = {
  requestId: 'string?',
  parent: 'string?',
  kind: [
    'send',
    'send-event:world',
    'send-event:character',
    'send-event:hidden',
    'send-event:ooc',
    'ooc',
    'retry',
    'continue',
    'self',
    'summary',
    'request',
    'chat-query',
  ],
  char: 'any',
  sender: 'any',
  members: ['any'],
  user: 'any',
  chat: 'any',
  replacing: 'any?',
  replyAs: 'any?',
  continuing: 'any?',
  characters: 'any?',
  impersonate: 'any?',
  parts: {
    scenario: 'string?',
    persona: 'string',
    greeting: 'string?',
    memory: 'any?',
    sampleChat: ['string?'],
    post: ['string'],
    allPersonas: 'any?',
    chatEmbeds: 'any?',
    userEmbeds: 'any?',
  },
  lines: ['string'],
  text: 'string?',
  settings: 'any?',
  lastMessage: 'string?',
  chatEmbeds: 'any?',
  userEmbeds: 'any?',
  imageData: 'string?',
  jsonSchema: 'any?',
  jsonValues: 'any?',
  response: 'string?',
} as const

export const getMessages = handle(async ({ userId, params, query }) => {
  const chatId = params.id

  assertValid({ before: 'string' }, query)
  const before = query.before

  const messages = await store.msgs.getMessages(chatId, before)
  return { messages }
})

export const createMessage = handle(async (req) => {
  const { userId, body, params } = req
  const chatId = params.id
  assertValid(sendValidator, body)

  const impersonate: AppSchema.Character | undefined = body.impersonate

  if (!userId) {
    const guest = req.socketId
    const newMsg = newMessage(v4(), chatId, body.text, {
      userId: body.bot || impersonate ? undefined : 'anon',
      characterId: impersonate?._id,
      ooc: body.kind === 'ooc' || body.kind === 'send-event:ooc',
      event: getScenarioEventType(body.kind),
      parent: body.parent,
    })
    sendGuest(guest, { type: 'message-created', msg: newMsg, chatId })
  } else {
    const chat = await store.chats.getChatOnly(chatId)
    if (!chat) throw errors.NotFound
    const members = chat.memberIds.concat(chat.userId)

    await ensureBotMembership(chat, members, impersonate)

    const userMsg = await store.msgs.createChatMessage({
      chatId,
      message: body.text,
      characterId: impersonate?._id,
      senderId: body.bot ? undefined : userId,
      ooc: body.kind === 'ooc' || body.kind === 'send-event:ooc',
      event: getScenarioEventType(body.kind),
      parent: body.parent,
      name: impersonate?.name,
    })

    await store.chats.update(chatId, { treeLeafId: userMsg._id })

    sendMany(members, { type: 'message-created', msg: userMsg, chatId })
  }

  return { success: true }
})

export const generateMessageV2 = handle(async (req, res) => {
  const { userId, body, params, log } = req
  const chatId = params.id
  assertValid(genValidator, body)
  const requestId = body.requestId || v4()

  if (!userId) {
    return handleGuestGenerate(body, req, res)
  }

  const impersonateId: string | undefined = body.impersonate?._id
  const impersonate: AppSchema.Character | undefined = !impersonateId
    ? undefined
    : impersonateId.startsWith('temp-')
    ? body.impersonate
    : await store.characters.getCharacter(userId, impersonateId)

  body.user = req.authed

  if (body.user && body.user.credits < 10) {
    // return res.json({ success: false, generating: false, message: 'Not enough credits' })
    throw errors.MissingCredits
  }

  const chat = await store.chats.getChatOnly(chatId)
  if (!chat) throw errors.NotFound

  if (body.kind === 'request' && chat.userId !== userId) {
    throw errors.Forbidden
  }

  // Coalesce for backwards compatibly while new UI rolls out
  const replyAs: AppSchema.Character = body.replyAs._id.startsWith('temp-')
    ? body.replyAs
    : await store.characters.getCharacter(chat.userId, body.replyAs._id || body.char._id)

  if (chat.userId !== userId) {
    const isAllowed = await store.chats.canViewChat(userId, chat)
    if (!isAllowed) throw errors.Forbidden
  }

  const members = chat.memberIds.concat(chat.userId)

  if (body.kind === 'retry' && userId !== chat.userId) {
    throw errors.Forbidden
  }

  if (body.kind === 'continue' && userId !== chat.userId) {
    throw errors.Forbidden
  }

  // For authenticated users we will verify parts of the payload
  let userMsg: AppSchema.ChatMessage | undefined
  if (body.kind === 'send' || body.kind === 'ooc') {
    await ensureBotMembership(chat, members, impersonate)

    userMsg = await store.msgs.createChatMessage({
      chatId,
      message: body.text!,
      characterId: impersonate?._id,
      senderId: userId,
      ooc: body.kind === 'ooc',
      event: undefined,
      parent: body.parent,
      name: impersonate?.name,
    })

    // Measure sustained engagement: a real user message rolls up to the public
    // template (the clone's parent, or the template itself). OOC chatter and
    // retries/swipes are excluded. `replyAs` is already loaded, so no extra read.
    if (body.kind === 'send' && !replyAs._id.startsWith('temp-')) {
      await store.matches.incrementEngagement(
        replyAs._id,
        'messages',
        1,
        replyAs.parent || replyAs._id
      )
    }

    sendMany(members, { type: 'message-created', msg: userMsg, chatId })
  } else if (body.kind.startsWith('send-event:')) {
    userMsg = await store.msgs.createChatMessage({
      chatId,
      message: body.text!,
      characterId: replyAs?._id,
      senderId: undefined,
      ooc: false,
      event: getScenarioEventType(body.kind),
      parent: body.parent,
      name: replyAs?.name,
    })
    sendMany(members, { type: 'message-created', msg: userMsg, chatId })
  }

  if (body.kind === 'ooc' || !replyAs) {
    return { success: true }
  }

  const messageId =
    body.kind === 'retry'
      ? body.replacing?._id ?? requestId
      : body.kind === 'continue'
      ? body.continuing?._id
      : requestId

  /**
   * For group chats we won't worry about lock integrity.
   * We still need to create the user message and broadcast it,
   * but if there is a lock in place do not attempt to generate a message.
   */
  try {
    await obtainLock(chatId)
  } catch (ex) {
    if (members.length === 1) throw ex
    return res.json({
      requestId,
      success: true,
      generating: false,
      message: 'User message created',
      messageId,
    })
  }

  res.json({ requestId, success: true, generating: true, message: 'Generating message', messageId })

  if (chat.mode === 'event' && body.kind === 'send') {
    // Flat fee covers the whole turn (director calls + every reply).
    if (body.user && body.user.credits < EVENT_TURN_COST) {
      await releaseLock(chatId)
      throw errors.MissingCredits
    }
    await store.credits.updateCredits(userId!, -EVENT_TURN_COST)

    const roster = await getEventRoster(chat)

    // Server-side prompt deps (mirror the client's createActiveChatPrompt).
    const entities = await getResponseEntities(chat, body.sender.userId, body.settings)
    const { adapter, model } = getAdapter(chat, entities.user, entities.gen)
    const encoder = getTokenCounter(adapter, model)
    const memberIds = Array.from(new Set([chat.userId, ...chat.memberIds]))
    const profiles = await store.users.getProfiles(chat.userId, memberIds)
    const senderProfile = await store.users.getProfile(userId!)

    const repliedThisTurn: string[] = []

    for (let i = 0; i < EVENT_MAX_REPLIES; i++) {
      const msgs = await store.msgs.getMessages(chatId)
      const recent = msgs
        .slice()
        .sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1))
        .slice(-8)
        .map((m) => ({
          name: m.name || (m.userId ? senderProfile?.handle || 'You' : 'Unknown'),
          text: m.msg,
        }))

      const speakerId = await electSpeaker({
        user: body.user!,
        log,
        event: chat.event!,
        roster: roster.map((r) => ({ id: r.id, name: r.name, hook: r.hook })),
        recent,
        repliedThisTurn,
      })
      if (speakerId === 'none') break

      const picked = roster.find((r) => r.id === speakerId)
      if (!picked) break
      // The roster `char` is a lightweight projection (no progression/json/scenario);
      // load the full character to generate as. Skip if it can't be loaded.
      const eventReplyAs = await store.characters.getCharacterById(speakerId)
      if (!eventReplyAs) break

      // History the model sees, with this speaker's identity resolved. Same call
      // and ordering the client uses for request.lines (createChatStream reverses
      // internally) — DO NOT reverse it here.
      const lines = await getLinesForPrompt(
        {
          kind: body.kind,
          settings: entities.gen,
          members: profiles,
          messages: msgs,
          char: entities.char,
          characters: body.characters,
          sender: senderProfile!,
          replyAs: eventReplyAs,
          impersonate,
          chat,
          user: entities.user,
          book: entities.book,
          lastMessage: '',
          chatEmbeds: [],
          userEmbeds: [],
          resolvedScenario: '',
          jsonValues: undefined,
        },
        encoder
      )

      const result = await generateOneReply({
        req,
        body,
        chat,
        replyAs: eventReplyAs,
        impersonate,
        members,
        userMsg,
        requestId: i === 0 ? requestId : v4(),
        eventTurn: true,
        lines,
        // chat.overrides is set on event chats, so scenario text = chat.scenario
        // (the event block); the 4th arg makes the stage token + meta the speaker's.
        resolvedScenario: resolveScenario(chat, eventReplyAs, [], eventReplyAs),
      })
      if (!result.ok) break
      repliedThisTurn.push(eventReplyAs._id)
    }

    await releaseLock(chatId)
    return
  }

  await generateOneReply({
    req,
    body,
    chat,
    replyAs,
    impersonate,
    members,
    userMsg,
    requestId,
    eventTurn: false,
  })

  await releaseLock(chatId)
  return
})

// Present characters in the event, with a one-line persona hook for the director.
async function getEventRoster(chat: AppSchema.Chat) {
  const ids = Object.entries(chat.characters || {})
    .filter(([, on]) => on)
    .map(([id]) => id)
  const chars = await store.characters.getCharacterList(ids)
  return chars.map((char) => ({
    id: char._id as string,
    name: char.name as string,
    hook: ((char.description as string) || '').slice(0, 120),
  }))
}

/**
 * Generate ONE bot reply as `ctx.replyAs` and persist it. Streams partials over
 * WS, assembles the response, pulls native image/memory tool output, persists the
 * message, and charges credits + advances XP. Returns `ok: false` on a stream
 * error (the caller is responsible for releasing the lock).
 *
 * The lock, the single `res.json` ack, and `releaseLock` are owned by the caller.
 */
async function generateOneReply(ctx: {
  req: AppRequest
  body: GenRequest
  chat: AppSchema.Chat
  replyAs: AppSchema.Character
  impersonate: AppSchema.Character | undefined
  members: string[]
  userMsg: AppSchema.ChatMessage | undefined
  requestId: string
  // True when this reply is part of an already-paid event turn (Task 5b): the
  // per-reply −10 credit is then skipped (the flat fee was charged at turn start).
  eventTurn: boolean
  // Event mode: per-speaker overrides. When omitted, the existing body-derived
  // values are used (non-event path is unchanged).
  lines?: string[]
  resolvedScenario?: string
}): Promise<{ ok: boolean; text: string; speakerId: string }> {
  const { req, body, chat, replyAs, impersonate, members, userMsg, requestId } = ctx
  const { userId, log } = req
  const chatId = chat._id

  const messageId =
    body.kind === 'retry'
      ? body.replacing?._id ?? requestId
      : body.kind === 'continue'
      ? body.continuing?._id
      : requestId

  if (body.kind !== 'chat-query') {
    sendMany(members, {
      type: 'message-creating',
      chatId,
      mode: body.kind,
      senderId: userId,
      characterId: replyAs._id,
    })
  }

  const entities = await getResponseEntities(chat, body.sender.userId, body.settings)
  // Event mode: use this speaker's resolved scenario (stage token + meta) so the
  // prompt createChatStream rebuilds reflects the elected character, not the main char.
  if (ctx.resolvedScenario !== undefined) {
    entities.resolvedScenario = ctx.resolvedScenario
  }
  const schema = entities.gen.jsonSource === 'character' ? replyAs.json : entities.gen.json
  const hydrator = entities.gen.jsonEnabled && schema ? jsonHydrator(schema) : undefined

  let hydration: HydratedJson | undefined
  let jsonPartial: any

  let generated = body.response || ''
  let retries: string[] = []
  let error = false
  let adapter = 'local'
  let meta = {}

  if (body.response === undefined) {
    const { stream, ...metadata } = await createChatStream(
      {
        ...body,
        // Event mode passes a per-speaker history (built via getLinesForPrompt with
        // this speaker's identity resolved); it overrides body.lines. Non-event
        // callers omit ctx.lines, so body.lines is used unchanged.
        lines: ctx.lines ?? body.lines,
        chat,
        replyAs,
        impersonate,
        requestId,
        entities,
        chatSchema: schema,
      },
      log
    )

    adapter = metadata.adapter

    meta = {
      ctx: metadata.settings.maxContextLength,
      char: metadata.size,
      len: metadata.length,
    }
    log.setBindings({ adapter })

    try {
      for await (const gen of stream) {
        if (typeof gen === 'string') {
          generated = gen
          continue
        }

        if ('tokens' in gen) {
          generated = gen.tokens as string
        }

        if ('gens' in gen) {
          retries = gen.gens
          break
        }

        if ('partial' in gen) {
          const prefix = body.kind === 'continue' ? `${body.continuing.msg} ` : ''
          if (metadata.json && hydrator) {
            jsonPartial = parsePartialJson(gen.partial) || jsonPartial
            hydration = hydrator(jsonPartial || {})
          }

          sendMany(members, {
            requestId: body.requestId,
            type: 'message-partial',
            kind: body.kind,
            partial: hydration ? hydration.response : `${prefix}${gen.partial}`,
            json: hydration,
            adapter,
            chatId,
          })
          continue
        }

        if ('meta' in gen) {
          Object.assign(meta, gen.meta)
          continue
        }

        if ('prompt' in gen) {
          sendOne(userId, { type: 'service-prompt', id: messageId, prompt: gen.prompt })
          continue
        }

        if ('error' in gen) {
          error = true
          sendMany(members, { type: 'message-error', requestId, error: gen.error, adapter, chatId })
          continue
        }

        if ('warning' in gen) {
          sendOne(userId, { type: 'message-warning', requestId, warning: gen.warning })
        }
      }
    } catch (ex: any) {
      error = true

      if (ex instanceof StatusError) {
        log.warn({ err: ex }, `[${ex.status}] Stream handler exception`)
        sendMany(members, {
          type: 'message-error',
          requestId,
          error: `[${ex.status}] Message failed: ${ex?.message || ex}`,
          adapter,
          chatId,
        })
      } else {
        log.error({ err: ex }, 'Unhandled exception occurred during stream handler')
        sendMany(members, {
          type: 'message-error',
          requestId,
          error: `Unhandled exception: ${ex?.message || ex}`,
          adapter,
          chatId,
        })
      }
    }

    if (error) {
      return { ok: false, text: '', speakerId: replyAs._id }
    }
  }

  let responseText = body.kind === 'continue' ? `${body.continuing.msg} ${generated}` : generated
  const parent = getNewMessageParent(body, userMsg)
  const updatedAt = new Date().toISOString()

  if (hydration?.response) {
    responseText = hydration.response
  }

  let treeLeafId = ''

  // Native image tool: the model may have requested an image. Pull it out of the
  // transient meta so it isn't persisted on the message; we fire generation after
  // the message is created (see below).
  const imageTool: { prompt?: string } | undefined = (meta as any).imageTool
  delete (meta as any).imageTool

  // Native memory tool: facts the model chose to remember. Pull out of meta (not
  // persisted on the message) and store them in long-term memory, scoped to this
  // character so they're recalled (via RAG) in future chats.
  const rememberFacts: string[] | undefined = (meta as any).rememberFacts
  delete (meta as any).rememberFacts
  if (rememberFacts?.length && chat.characterId) {
    for (const fact of rememberFacts) {
      rememberFact(userId!, chat.characterId, fact, 'tool').catch((err) =>
        log.error({ err }, 'Failed to store long-term memory')
      )
    }
  }

  // Summaries are a cheap utility generation (no user-facing message); don't
  // charge credits or advance relationship XP for them.
  if (body.kind !== 'summary') {
    // Event replies are paid once per turn at turn start (Task 5b); don't
    // re-charge per reply. Normal replies still cost 10 each.
    if (!ctx.eventTurn) {
      await store.credits.updateCredits(userId!, -10)
    }
    // XP advances the character that REPLIED (replyAs), not the chat's main char.
    // (Correct for multi-character chats generally; identical to before in 1:1
    // chats where replyAs === the main char.)
    const xpGain = getXpPerMessage(replyAs.progression)
    if (xpGain > 0) await store.scenario.updateCharXp(replyAs._id, xpGain)
  }

  switch (body.kind) {
    case 'summary': {
      sendOne(userId, { type: 'chat-summary', chatId, summary: generated })
      break
    }

    case 'chat-query': {
      sendOne(userId, {
        type: 'chat-query',
        requestId: body.requestId,
        chatId,
        response: generated,
      })
      break
    }

    case 'self':
    case 'request':
    case 'send-event:world':
    case 'send-event:character':
    case 'send-event:hidden':
    case 'send': {
      const msg = await store.msgs.createChatMessage({
        _id: requestId,
        chatId,
        characterId: replyAs._id,
        senderId: body.kind === 'self' ? userId : undefined,
        message: responseText,
        adapter,
        ooc: false,
        meta,
        retries,
        event: undefined,
        parent,
        json: hydration,
        name: replyAs.name,
      })

      sendMany(members, {
        type: 'message-created',
        requestId,
        msg,
        chatId,
        adapter,
        generate: true,
        json: hydration,
      })
      treeLeafId = requestId

      // Native image tool requested an image: generate it via Z-Image using the
      // replying character's LoRA and attach it to the just-created reply message
      // (in its `extras`, below the text) so it behaves like the in-chat image
      // generation — spinner on the reply, then the image attached. Fire-and-forget;
      // it broadcasts a `message-retry` over WS and persists for refresh.
      if (imageTool?.prompt) {
        // An auto-generated image costs the same 25 credits as an explicit one,
        // on top of the message charge. Fire-and-forget like the generation.
        if (userId && userId !== 'anon') {
          store.credits.updateCredits(userId, -25).catch(() => {})
        }
        generateImage(
          {
            user: body.user!,
            prompt: imageTool.prompt,
            chatId,
            characterId: replyAs._id,
            source: 'tool',
            requestId: v4(),
            messageId: requestId,
            append: true,
            parentId: undefined,
          },
          log
        ).catch((err) => log.error({ err }, 'Image tool generation failed'))
      }
      break
    }

    case 'retry': {
      if (body.replacing) {
        const nextRetries = [body.replacing.msg]
          .concat(retries)
          .concat(body.replacing.retries || [])

        const next = await store.msgs.editMessage(body.replacing._id, {
          msg: responseText,
          adapter,
          meta,
          state: 'retried',
          retries: nextRetries,
          parent: body.parent,
          json: hydration ? hydration : (null as any),
        })
        treeLeafId = body.replacing._id
        sendMany(members, {
          type: 'message-retry',
          requestId,
          chatId,
          messageId: body.replacing._id,
          message: next?.msg,
          retries: next?.retries,
          adapter,
          generate: true,
          meta,
          updatedAt: next?.updatedAt,
          json: hydration,
        })
      } else {
        const msg = await store.msgs.createChatMessage({
          _id: requestId,
          chatId,
          characterId: replyAs._id,
          message: responseText,
          adapter,
          ooc: false,
          meta,
          retries,
          event: undefined,
          parent,
          json: hydration,
          name: replyAs.name,
        })
        treeLeafId = requestId
        sendMany(members, {
          type: 'message-created',
          requestId,
          msg,
          chatId,
          adapter,
          generate: true,
          json: hydration,
        })
      }
      break
    }

    case 'continue': {
      const next = await store.msgs.editMessage(body.continuing._id, {
        msg: responseText,
        adapter,
        meta,
        state: 'continued',
      })
      treeLeafId = body.continuing._id
      sendMany(members, {
        type: 'message-retry',
        requestId,
        chatId,
        messageId: body.continuing._id,
        message: responseText,
        adapter,
        generate: true,
        retries: next?.retries,
        meta,
        updatedAt,
      })
      break
    }
  }

  if (treeLeafId) {
    await store.chats.update(chatId, { treeLeafId, updatedAt })
  } else {
    await store.chats.update(chatId, { updatedAt })
  }

  return { ok: true, text: responseText, speakerId: replyAs._id }
}

async function handleGuestGenerate(body: GenRequest, req: AppRequest, res: Response) {
  const chatId = req.params.id
  const guest = req.socketId
  const log = req.log

  const chat: AppSchema.Chat = body.chat
  if (!chat) throw errors.NotFound

  const requestId = v4()
  const messageId =
    body.kind === 'retry'
      ? body.replacing?._id ?? requestId
      : body.kind === 'continue'
      ? body.continuing?._id
      : requestId

  // Coalesce for backwards compatibly while new UI rolls out
  const replyAs: AppSchema.Character = body.replyAs || body.char

  // For authenticated users we will verify parts of the payload
  let newMsg: AppSchema.ChatMessage | undefined
  if (body.kind === 'send' || body.kind === 'ooc') {
    newMsg = newMessage(v4(), chatId, body.text!, {
      userId: 'anon',
      characterId: body.impersonate?._id,
      ooc: body.kind === 'ooc',
      event: undefined,
      parent: body.parent,
    })
  } else if (body.kind.startsWith('send-event:')) {
    newMsg = newMessage(v4(), chatId, body.text!, {
      characterId: replyAs?._id,
      ooc: false,
      event: getScenarioEventType(body.kind),
      parent: body.parent,
    })
  }

  if (newMsg) {
    sendGuest(guest, { type: 'message-created', msg: newMsg, chatId })
  }

  if (body.kind === 'ooc') {
    return { success: true }
  }

  res.json({ success: true, generating: true, message: 'Generating message', requestId })

  const schema = body.settings.jsonSource === 'character' ? body.char.json : body.settings.json
  const hydrator = body.settings.jsonEnabled && schema ? jsonHydrator(schema) : undefined
  let generated = body.response || ''
  let retries: string[] = []
  let error = false
  let adapter = 'local'
  let meta = {}
  let hydration: HydratedJson | undefined
  let jsonPartial: any

  if (body.response === undefined) {
    const { stream, ...entities } = await createChatStream(
      { ...body, chat, replyAs, requestId, chatSchema: schema },
      log,
      guest
    )

    log.setBindings({ adapter })

    adapter = entities.adapter
    meta = { ctx: entities.settings.maxContextLength, char: entities.size, len: entities.length }

    for await (const gen of stream) {
      if (typeof gen === 'string') {
        generated = gen
        continue
      }

      if ('tokens' in gen) {
        generated = gen.tokens as string
      }

      if ('gens' in gen) {
        retries = gen.gens
        break
      }

      if ('partial' in gen) {
        if (entities.json && hydrator) {
          jsonPartial = parsePartialJson(gen.partial) || jsonPartial
          hydration = hydrator(jsonPartial || {})
        }
        sendGuest(guest, {
          type: 'message-partial',
          kind: body.kind,
          partial: hydration ? hydration.response : gen.partial,
          adapter,
          chatId,
          json: hydration,
        })

        continue
      }

      if ('meta' in gen) {
        Object.assign(meta, gen.meta)
        continue
      }

      if ('prompt' in gen) {
        sendGuest(guest, { type: 'service-prompt', id: messageId, prompt: gen.prompt })
        continue
      }

      if ('error' in gen) {
        error = true
        sendGuest(guest, { type: 'message-error', error: gen.error, adapter, chatId })
        break
      }

      if ('warning' in gen) {
        sendGuest(guest, { type: 'message-warning', requestId, warning: gen.warning })
        continue
      }
    }

    if (error) return
  }

  let responseText = body.kind === 'continue' ? `${body.continuing.msg} ${generated}` : generated
  if (hydration?.response) {
    responseText = hydration.response
  }

  const characterId = body.kind === 'self' ? undefined : body.replyAs?._id || body.char?._id
  const senderId = body.kind === 'self' ? 'anon' : undefined
  const parent = getNewMessageParent(body, newMsg)

  if (body.kind === 'retry' && body.replacing) {
    retries = [body.replacing.msg].concat(retries).concat(body.replacing.retries || [])
  }

  const response = newMessage(messageId, chatId, responseText, {
    characterId,
    userId: senderId,
    ooc: false,
    meta,
    event: undefined,
    retries,
    parent,
    json: hydration,
  })

  switch (body.kind) {
    case 'summary':
      sendGuest(guest, { type: 'chat-summary', chatId, summary: generated })
      return

    case 'continue':
    case 'request':
    case 'retry':
    case 'self':
    case 'send':
    case 'send-event:world':
    case 'send-event:character':
    case 'send-event:hidden':
      sendGuest(guest, {
        type: 'guest-message-created',
        requestId,
        msg: response,
        chatId,
        adapter,
        continue: body.kind === 'continue',
        generate: true,
        meta,
        json: hydration,
      })
      return
  }
}

function newMessage(
  messageId: string,
  chatId: string,
  text: string,
  props: {
    userId?: string
    characterId?: string
    ooc: boolean
    meta?: any
    event: undefined | AppSchema.ScenarioEventType
    retries?: string[]
    parent?: string
    json?: HydratedJson
  }
) {
  const userMsg: AppSchema.ChatMessage = {
    _id: messageId,
    chatId,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    kind: 'chat-message',
    retries: props.retries || [],
    msg: text,
    ...props,
  }
  return userMsg
}

async function ensureBotMembership(
  chat: AppSchema.Chat,
  members: string[],
  impersonate: AppSchema.Character | undefined
) {
  const update: Partial<AppSchema.Chat> = {}

  // Ignore ownership of temporary characters
  const characters = chat.characters || {}
  if (
    impersonate &&
    characters[impersonate._id] === undefined &&
    !impersonate._id.startsWith('temp-')
  ) {
    const actual = await store.characters.getCharacter(impersonate.userId, impersonate._id)
    if (!actual) {
      throw new StatusError(
        'Could not create message: Impersonation character does not belong to you',
        403
      )
    }

    // Ensure the caller's character is up to date
    Object.assign(impersonate, actual)
    characters[impersonate._id] = false
    sendMany(members, {
      type: 'chat-character-added',
      chatId: chat._id,
      character: actual,
      active: false,
    })
  }

  update.characters = characters
  await store.chats.update(chat._id, update)
}

function getNewMessageParent(body: GenRequest, userMsg: AppSchema.ChatMessage | undefined): string {
  switch (body.kind) {
    case 'continue': {
      return body.continuing?.parent
    }

    case 'summary':
    case 'chat-query':
      return ''

    case 'retry':
    case 'request':
      return body.parent || ''

    case 'ooc':
    case 'self':
    case 'send':
    case 'send-event:character':
    case 'send-event:hidden':
    case 'send-event:ooc':
    case 'send-event:world':
      return userMsg?._id || ''
  }
}
