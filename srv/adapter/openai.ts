import { sanitiseAndTrim, sanitise, extractSpeakerTurn } from '/common/requests/util'
import { ChatRole, CompletionItem, ModelAdapter } from './type'
import { defaultPresets } from '../../common/presets'
import { OPENAI_CHAT_MODELS, OPENAI_MODELS } from '../../common/adapters'
import { AppSchema } from '../../common/types/schema'
import { config } from '../config'
import { AppLog } from '../middleware'
import { requestFullCompletion, toChatCompletionPayload } from './chat-completion'
import { getStoppingStrings } from './prompt'
import { decryptText } from '../db/util'
import { streamCompletion } from './stream'
import { sendGuest, sendOne } from '../api/ws'
import { getTokenCounter } from '../tokenize'
import { isZImageConfigured } from '../image/zimage'
import { toJsonSchema } from '../../common/prompt'

const baseUrl = `https://api.openai.com`

/**
 * Native tool the model can call mid-chat to show an image (e.g. user asks
 * "show me your new bike"). The backend executes it via the Z-Image endpoint
 * using the character's stored LoRA, then appends the image to the reply.
 */
const IMAGE_TOOL = {
  type: 'function',
  function: {
    name: 'generate_image',
    description:
      "Generate and show an image to the user. Call this when the user asks to see something visual (a selfie, an object, a scene) or when sharing an image naturally fits the roleplay. Describe what should be depicted from the character's point of view.",
    parameters: {
      type: 'object',
      properties: {
        prompt: {
          type: 'string',
          description:
            'A concise, comma-separated visual description of the image to generate (subject, setting, pose, lighting). Do not include the character name.',
        },
      },
      required: ['prompt'],
    },
  },
}

/**
 * Native tool the model can call to durably remember a fact about the user or the
 * relationship (name, preferences, promises, events). Stored in long-term memory
 * and recalled (via RAG) in future chats with this character.
 */
const REMEMBER_TOOL = {
  type: 'function',
  function: {
    name: 'remember',
    description:
      "Save a lasting fact so you recall it in future conversations — about {{user}} (their name, job, preferences, promises) AND about yourself, INCLUDING personal details you state or invent in the moment (e.g. your pet's name, family members, where you live, your backstory). Call this whenever you mention a new concrete personal detail or something worth remembering comes up. Do NOT use it for trivial small-talk.",
    parameters: {
      type: 'object',
      properties: {
        fact: {
          type: 'string',
          description:
            'A single concise, self-contained fact written in the third person, e.g. "{{user}} works as a nurse and has a dog named Max".',
        },
      },
      required: ['fact'],
    },
  },
}

/** Chat kinds where offering the tools makes sense (a fresh assistant reply). */
const IMAGE_TOOL_KINDS = new Set([
  'send',
  'request',
  'self',
  'send-event:world',
  'send-event:character',
  'send-event:hidden',
  'retry',
])

/**
 * Roleplay finetunes with a name-prefilled prompt format don't reliably emit
 * native tool_calls. By default we use in-band MARKERS the model writes inside
 * its reply, which the server parses out. Set CHARLUV_NATIVE_TOOLS=1 to use the
 * native OpenAI tools/tool_calls path instead.
 */
const NATIVE_TOOLS = process.env.CHARLUV_NATIVE_TOOLS === '1'

/** Temperature ceiling for event/group character replies. Lowering it didn't move
 * how often the model writes whole scenes (that's handled by extracting the
 * speaker's turn), so this is a mild cap only. Only caps — a cooler preset is
 * left as-is. */
const EVENT_REPLY_TEMP_CAP = 0.7

const IMG_MARKER = /<image>([\s\S]*?)<\/image>/gi
const MEM_MARKER = /<remember>([\s\S]*?)<\/remember>/gi

function markerInstructions(charName: string, userName: string, image: boolean, memory: boolean) {
  const lines: string[] = []
  if (image)
    lines.push(
      `- Share a photo with <image>concise, comma-separated visual description, no names</image>. ` +
        `Only when ${userName} explicitly asks to see something (you, a place, an object). ` +
        `Do NOT send unprompted, "here's my situation", or opening/greeting photos — wait until ${userName} asks. At most one per reply.`
    )
  if (memory)
    lines.push(
      `- Remember a lasting detail with <remember>the fact, in third person</remember>. ` +
        `Only durable facts that stay true across days and weeks — names, relationships, jobs, preferences, promises, history — about ${userName} AND about ${charName} yourself, INCLUDING details you state or invent (e.g. "${charName}'s cat is named Mochi", "${charName}'s brother is called Tom", where ${charName} lives, ${charName}'s backstory). Whenever you mention a new concrete personal detail about yourself, remember it. ` +
        `Do NOT remember moment-to-moment events or the current scene — who arrived, where someone is sitting, what is happening right now (e.g. "${userName} arrived at ${charName}'s apartment" is NOT a memory). One fact per tag; skip routine chit-chat and never restate something already remembered.`
    )
  if (!lines.length) return ''
  // Framed as a built-in Charluv platform capability (in-world), not a meta system
  // instruction — characters are far more likely to use it in-character.
  return (
    `On Charluv, companions can share photos and remember things — it's a normal part of the platform:\n` +
    lines.join('\n') +
    `\nWrite the tag inline as a natural part of your reply (don't announce or describe doing it); the tag text is hidden from ${userName}.`
  )
}

/** Remove marker tags (and any still-streaming unclosed/partial tag) from text. */
function stripMarkers(text: string): string {
  return text
    .replace(IMG_MARKER, '')
    .replace(MEM_MARKER, '')
    .replace(/<image>[\s\S]*$/i, '')
    .replace(/<remember>[\s\S]*$/i, '')
    .replace(/<\/?(i(mage)?|r(emember)?)?$/i, '')
}

function parseMarkers(text: string) {
  const images: string[] = []
  const facts: string[] = []
  let m: RegExpExecArray | null
  IMG_MARKER.lastIndex = 0
  while ((m = IMG_MARKER.exec(text))) {
    const v = m[1].trim()
    if (v) images.push(v)
  }
  MEM_MARKER.lastIndex = 0
  while ((m = MEM_MARKER.exec(text))) {
    const v = m[1].trim()
    if (v) facts.push(v)
  }
  return { images, facts }
}

type CompletionContent<T> = Array<{ finish_reason: string; index: number } & ({ text: string } | T)>

export type Inference = { message: { content: string; role: ChatRole } }

export type Completion<T = Inference> = {
  id: string
  created: number
  model: string
  object: string
  choices: CompletionContent<T>
  error?: { message: string }
}

export const handleOAI: ModelAdapter = async function* (opts) {
  const { char, members, user, prompt, log, gen, guest, kind, isThirdParty } = opts
  // Model routing:
  // - Moderation + event/group chats always run on the mod endpoint (Qwen) — the
  //   chat finetune (tutu) can't keep to one character in a multi-character scene.
  // - Real chats also default to Qwen now; `chat.chatModel === 'tutu'` is the
  //   per-chat opt-out (Reply Style pane).
  // - Utility inference with no real chat (empty `chat` from inferenceAsync —
  //   e.g. the create-wizard/editor image prompts and chat summaries) stays on
  //   the text endpoint (tutu), which does better at image prompts.
  const chatModel = opts.chat?._id ? opts.chat.chatModel || 'qwen' : 'tutu'
  const useModEndpoint = !!opts.moderation || opts.chat?.mode === 'event' || chatModel === 'qwen'
  let base = getBaseUrl(user, !!gen.thirdPartyUrlNoSuffix, isThirdParty, useModEndpoint)
  const handle = opts.impersonate?.name || opts.sender?.handle || 'You'
  if (!user.oaiKey && !base.changed) {
    yield { error: `CharluvAI request failed: No API key set. Check your settings.` }
    return
  }

  // When targeting the self-hosted endpoint, the server-configured model always
  // wins — that host serves a single model, so a preset's model id is irrelevant.
  const oaiModel =
    (base.server &&
      (base.mod
        ? config.inference.modModel || config.inference.textModel
        : config.inference.textModel)) ||
    gen.thirdPartyModel ||
    gen.oaiModel ||
    defaultPresets.openai.oaiModel
  const maxResponseLength = gen.maxTokens ?? defaultPresets.openai.maxTokens

  const isEvent = opts.chat?.mode === 'event'

  // Stop the model from speaking for anyone but the elected character: "\nName:"
  // for each other present character + the user, plus the Narrator/Director labels.
  // Applies to events too — the mod model (Qwen) stays in one character, so cutting
  // at any drift keeps the reply clean. extractSpeakerTurn below is a safety net.
  const narratorStops =
    opts.replyAs?.name === 'Narrator' || opts.replyAs?.name === 'Director'
      ? []
      : ['\nNarrator :', '\nDirector :']
  const stopSet = new Set<string>([`\n${handle}:`, ...narratorStops, ...getStoppingStrings(opts)])

  // Mild temp cap for event replies (see EVENT_REPLY_TEMP_CAP). Detected via chat
  // mode — the client sends kind:'send' for event turns. Director calls run via
  // inferenceAsync with an empty chat, so they're unaffected.
  const baseTemp = gen.temp ?? defaultPresets.openai.temp
  const temperature = isEvent ? Math.min(baseTemp, EVENT_REPLY_TEMP_CAP) : baseTemp

  const body: any = {
    model: oaiModel,
    stream: (gen.streamResponse && kind !== 'summary') ?? defaultPresets.openai.streamResponse,
    temperature,
    max_tokens: maxResponseLength,
    top_p: gen.topP ?? 1,
    // Filter falsy entries — a null/empty stop value makes strict OpenAI-compatible
    // servers (e.g. vLLM) reject the request with HTTP 400.
    stop: Array.from(stopSet).filter(Boolean),
  }

  body.presence_penalty = gen.presencePenalty ?? defaultPresets.openai.presencePenalty
  body.frequency_penalty = gen.frequencyPenalty ?? defaultPresets.openai.frequencyPenalty

  // vLLM honours top_k / min_p as OpenAI-API extensions. Only send them to the
  // self-hosted server (base.server) — real OpenAI / third-party endpoints would
  // reject unknown sampler fields with HTTP 400. Omit disabled values (top_k 0,
  // min_p 0) so vLLM keeps its own defaults.
  if (base.server) {
    if (typeof gen.topK === 'number' && gen.topK > 0) body.top_k = gen.topK
    // min_p is unsupported with speculative decoding on the self-hosted endpoint.
    if (!config.inference.specDecoding && typeof gen.minP === 'number' && gen.minP > 0)
      body.min_p = gen.minP

    // Structured output: when the caller supplies a JSON schema (e.g. publish
    // moderation), constrain the self-hosted model with vLLM guided decoding so
    // the response is always valid JSON matching the schema. Without this the
    // model free-forms and the verdict parse fails (which fail-closes the
    // moderation check). vLLM reads `guided_json` as an OpenAI-API extension.
    const guided = opts.jsonSchema ? toJsonSchema(opts.jsonSchema) : undefined
    if (guided) body.guided_json = guided
  }

  const useChat =
    base.server ||
    (isThirdParty && gen.thirdPartyFormat === 'openai-chat') ||
    !!OPENAI_CHAT_MODELS[oaiModel]
  if (useChat) {
    const messages: CompletionItem[] = config.inference.flatChatCompletion
      ? // `user` not `system`: the self-hosted endpoint rejects requests with no
        // user-role message ("No user query found in messages").
        [{ role: 'user', content: opts.prompt }]
      : await toChatCompletionPayload(
          opts,
          getTokenCounter('openai', OPENAI_MODELS.Turbo),
          body.max_tokens
        )

    // A leading `system` message overrides the served model's default
    // chat-template system prompt (the companion/LEVEL preamble). Utility calls
    // like publish moderation pass `system` so the model follows the instruction
    // instead of answering in-character.
    if (opts.system) messages.unshift({ role: 'system', content: opts.system })

    // Vision requests (e.g. publish moderation reviewing the avatar + gallery)
    // carry one or more images. vLLM's OpenAI endpoint only sees them as
    // `image_url` content parts, so fold them into the last user message —
    // otherwise the check is text-only.
    const visionImages = opts.images?.length ? opts.images : opts.imageData ? [opts.imageData] : []
    if (visionImages.length && messages.length) {
      const target =
        [...messages].reverse().find((m) => m.role === 'user') ?? messages[messages.length - 1]
      const text = typeof target.content === 'string' ? target.content : ''
      ;(target as any).content = [
        { type: 'text', text },
        ...visionImages.map((url) => ({ type: 'image_url', image_url: { url } })),
      ]
    }

    body.messages = messages
    yield { prompt: messages }
  } else {
    body.prompt = prompt
    yield { prompt }
  }

  // Offer native tools on normal assistant replies. The model decides whether to
  // call them. Image tool needs Z-Image configured; the memory tool has no
  // external dependency (server-side embeddings).
  const replyKind = useChat && IMAGE_TOOL_KINDS.has(kind as string)
  const imageToolEnabled = replyKind && isZImageConfigured()
  const memoryToolEnabled = replyKind
  // marker mode (default) injects instructions into the system message; native
  // mode attaches OpenAI tools[]. Both feed the same downstream (meta.imageTool /
  // meta.rememberFacts).
  const markerMode = !NATIVE_TOOLS && (imageToolEnabled || memoryToolEnabled)

  if (NATIVE_TOOLS) {
    const tools: any[] = []
    if (imageToolEnabled) tools.push(IMAGE_TOOL)
    if (memoryToolEnabled) tools.push(REMEMBER_TOOL)
    if (tools.length) {
      body.tools = tools
      body.tool_choice = 'auto'
      log.debug(
        { tools: tools.map((t) => t.function.name), tool_choice: body.tool_choice },
        'tools: attached to request'
      )
    }
  } else if (markerMode) {
    const instr = markerInstructions(
      opts.replyAs?.name || char?.name || 'the character',
      handle,
      imageToolEnabled,
      memoryToolEnabled
    )
    // Prepend (not append) so it isn't read as part of the trailing "<name>:" cue.
    // Attach to the leading message regardless of its role: the system message in a
    // standard chat payload, or the single user message in flatChatCompletion mode
    // (the self-hosted endpoint sends one flat user message with no system message,
    // so the old `role === 'system'` guard dropped the instructions entirely — which
    // disabled memory and auto-image). Fall back to the /completions text prompt.
    if (instr) {
      const head = Array.isArray(body.messages) ? body.messages[0] : undefined
      if (head && typeof head.content === 'string') {
        head.content = `${instr.trim()}\n\n${head.content}`
      } else if (typeof body.prompt === 'string') {
        body.prompt = `${instr.trim()}\n\n${body.prompt}`
      }
    }
    log.debug({ imageToolEnabled, memoryToolEnabled }, 'tools: marker instructions injected')
  }

  // Some prompts emit a `system` message after the conversation has started
  // (e.g. a post-history instruction, jailbreak, or a `System:` history line).
  // Strict chat templates (Qwen on vLLM) reject this — "system messages should
  // come before user/assistant messages" — and the request returns no reply.
  // Demote any non-leading system message to `user` so its content still reaches
  // the model in place. Leading system messages are untouched.
  if (Array.isArray(body.messages)) {
    let seenNonSystem = false
    for (const m of body.messages as CompletionItem[]) {
      if (m.role === 'system') {
        if (seenNonSystem) m.role = 'user'
      } else {
        seenNonSystem = true
      }
    }
  }

  // logit_bias is also unsupported with speculative decoding on the self-hosted endpoint.
  if (gen.antiBond && !(base.server && config.inference.specDecoding))
    body.logit_bias = { 3938: -50, 11049: -50, 64186: -50, 3717: -25 }

  const useThirdPartyPassword =
    base.changed && isThirdParty && (gen.thirdPartyKey || user.thirdPartyPassword)

  const apiKey = useThirdPartyPassword
    ? gen.thirdPartyKey || user.thirdPartyPassword
    : !isThirdParty
    ? user.oaiKey
    : null

  // The server-configured self-hosted key is stored in plaintext config, not encrypted per-user.
  const serverKey = base.mod
    ? config.inference.modApiKey || config.inference.textApiKey
    : config.inference.textApiKey
  const bearer = base.server
    ? serverKey
      ? `Bearer ${serverKey}`
      : null
    : !!guest
    ? `Bearer ${apiKey}`
    : apiKey
    ? `Bearer ${decryptText(apiKey)}`
    : null

  const headers: any = {
    'Content-Type': 'application/json',
  }

  if (bearer) {
    headers.Authorization = bearer
  }

  log.debug(body, 'OpenAI payload')

  let url = gen.thirdPartyUrlNoSuffix
    ? base.url
    : useChat
    ? `${base.url}/chat/completions`
    : `${base.url}/completions`

  // Qwen (the mod endpoint) refuses some content with a reply that always opens
  // with "I cannot generate". When that happens on a regular chat call, re-run
  // the request on the text endpoint (Broken Tutu) and tell the user they can
  // switch the chat's model under Reply Style. Never fall back for moderation
  // (must stay fail-closed on the strict model) or guided-JSON calls (guided
  // decoding cannot refuse).
  const REFUSAL_PREFIX = 'i cannot generate'
  const refusalHead = (text: string) => text.replace(/^[\s"'*_]+/, '').toLowerCase()
  const canFallback = base.mod && !opts.moderation && !opts.jsonSchema && !!config.inference.textUrl
  let fellBack = false
  const fallbackToTutu = () => {
    fellBack = true
    base = getBaseUrl(user, !!gen.thirdPartyUrlNoSuffix, isThirdParty, false)
    body.model = config.inference.textModel || body.model
    url = gen.thirdPartyUrlNoSuffix
      ? base.url
      : useChat
      ? `${base.url}/chat/completions`
      : `${base.url}/completions`
    if (config.inference.textApiKey) {
      headers.Authorization = `Bearer ${config.inference.textApiKey}`
    } else {
      delete headers.Authorization
    }
    log.warn('Qwen refused the reply; retrying on the text endpoint (tutu)')
    const message = `Qwen3.6 refused to reply — Charluv Broken Tutu answered instead. You can switch the model under Reply Style.`
    if (guest) sendGuest(guest, { type: 'notification', level: 'warn', message })
    else sendOne(user._id, { type: 'notification', level: 'warn', message })
  }

  // Empty completions happen intermittently; a single clean re-request usually
  // lands a real reply (the same thing a user's manual "rerun" does), so retry
  // once before surfacing an error.
  const EMPTY_RETRIES = 1
  empty: for (let attempt = 0; attempt <= EMPTY_RETRIES; attempt++) {
    const iter = body.stream
      ? streamCompletion(opts.user._id, url, headers, body, 'CharluvAI', opts.log)
      : requestFullCompletion(opts.user._id, url, headers, body, 'CharluvAI', opts.log)
    let accumulated = ''
    let response: Completion<Inference> | undefined
    // Hold partials back while the reply could still be a refusal, so a refusal
    // never streams to the client before the fallback kicks in.
    let sniffing = canFallback && !fellBack

    while (true) {
      let generated = await iter.next()

      // Both the streaming and non-streaming generators return a full completion and yield errors.
      if (generated.done) {
        response = generated.value
        break
      }

      if (generated.value.error) {
        yield { error: generated.value.error }
        return
      }

      // Only the streaming generator yields individual tokens.
      if ('token' in generated.value) {
        accumulated += generated.value.token
        if (sniffing) {
          const head = refusalHead(accumulated)
          if (head.length < REFUSAL_PREFIX.length) {
            // Still ambiguous — keep buffering (partials are cumulative, so
            // nothing is lost once they resume).
            if (REFUSAL_PREFIX.startsWith(head)) continue
            sniffing = false
          } else {
            sniffing = false
            if (head.startsWith(REFUSAL_PREFIX)) {
              await iter.return?.(undefined)?.catch(() => {})
              fallbackToTutu()
              attempt = -1 // fresh empty-retry budget on the new endpoint
              continue empty
            }
          }
        }
        const shown = markerMode ? stripMarkers(accumulated) : accumulated
        // Trim against the REPLYING character, not the main char. In event/group
        // chats the elected speaker is opts.replyAs; trimming against the main
        // `char` treated the speaker's text as a foreign turn and emptied every
        // partial, so the reply never streamed and only appeared at the end.
        yield { partial: sanitiseAndTrim(shown, prompt, opts.replyAs, opts.characters, members) }
      }
    }

    try {
      let text = getCompletionContent(response, log)
      if (text instanceof Error) {
        yield { error: `CharluvAI returned an error: ${text.message}` }
        return
      }

      // Non-streamed refusals (and any that ended before the sniffer decided).
      if (
        canFallback &&
        !fellBack &&
        typeof text === 'string' &&
        refusalHead(text).startsWith(REFUSAL_PREFIX)
      ) {
        fallbackToTutu()
        attempt = -1
        continue empty
      }

      let imagePrompt = ''
      const rememberFacts: string[] = []

      if (NATIVE_TOOLS) {
        // Streaming returns tool_calls on the choice; non-streaming nests under message.
        const choice0 = response?.choices?.[0] as any
        const toolCalls: any[] = choice0?.tool_calls || choice0?.message?.tool_calls || []
        log.debug(
          {
            finish_reason: choice0?.finish_reason,
            toolCallCount: toolCalls.length,
            names: toolCalls.map((t: any) => t?.function?.name),
          },
          'tools: response tool_calls'
        )
        if (imageToolEnabled) {
          const call = toolCalls.find((t: any) => t?.function?.name === 'generate_image')
          try {
            const args = call?.function?.arguments ? JSON.parse(call.function.arguments) : undefined
            if (typeof args?.prompt === 'string') imagePrompt = args.prompt.trim()
          } catch {
            log.warn({ args: call?.function?.arguments }, 'Bad generate_image tool arguments')
          }
        }
        if (memoryToolEnabled) {
          for (const t of toolCalls) {
            if (t?.function?.name !== 'remember' || !t.function.arguments) continue
            try {
              const args = JSON.parse(t.function.arguments)
              if (typeof args?.fact === 'string' && args.fact.trim())
                rememberFacts.push(args.fact.trim())
            } catch {
              log.warn({ args: t.function.arguments }, 'Bad remember tool arguments')
            }
          }
        }
      } else if (markerMode && typeof text === 'string') {
        // Parse in-band markers the model wrote, then strip them from the reply.
        const { images, facts } = parseMarkers(text)
        if (imageToolEnabled && images[0]) imagePrompt = images[0]
        if (memoryToolEnabled) rememberFacts.push(...facts)
        text = stripMarkers(text).trim()
        if (imagePrompt || rememberFacts.length) {
          log.debug({ image: !!imagePrompt, facts: rememberFacts.length }, 'tools: markers parsed')
        }
      }

      // Empty text is only an error when there's no tool action to surface (the
      // model may reply with just an image or a memory write).
      if (!text?.length && !imagePrompt && !rememberFacts.length) {
        if (attempt < EMPTY_RETRIES) {
          log.warn({ attempt }, 'CharluvAI returned an empty response; retrying')
          continue empty
        }
        log.error({ body: response }, 'CharluvAI request failed: Empty response')
        yield { error: `CharluvAI request failed: Received empty response. Try again.` }
        return
      }

      // Surface tool intent so the message handler can act on it.
      if (imagePrompt || rememberFacts.length) {
        yield {
          meta: {
            ...(imagePrompt ? { imageTool: { prompt: imagePrompt } } : {}),
            ...(rememberFacts.length ? { rememberFacts } : {}),
          },
        }
      }

      const swipeText = markerMode ? stripMarkers(accumulated).trim() : accumulated
      if (gen.swipesPerGeneration! > 1) {
        yield sanitiseAndTrim(swipeText, prompt, opts.replyAs, opts.characters, members)
      } else {
        // Event replies: the model writes the whole scene, so pull out only the
        // elected character's own turn. Non-event: normal trim.
        const finalText = isEvent
          ? sanitise(
              extractSpeakerTurn(sanitise((text || '').replace(prompt, '')), opts.replyAs.name)
            )
          : sanitiseAndTrim(text || '', prompt, opts.replyAs, opts.characters, members)
        // Empty after extraction/trim means the model produced nothing usable for
        // this speaker (e.g. it narrated/spoke only as others). Surface an error so
        // the caller (the event loop) retries cleanly instead of storing an empty
        // bubble. Tool-only replies still go through (guarded by the empty-text check).
        if (!finalText && !imagePrompt && !rememberFacts.length) {
          if (attempt < EMPTY_RETRIES) {
            log.warn({ attempt }, 'CharluvAI reply had no content for the speaker; retrying')
            continue empty
          }
          log.warn('CharluvAI reply had no content for the speaker; dropping')
          yield { error: `CharluvAI request failed: Received empty response. Try again.` }
          return
        }
        yield finalText
      }
      return
    } catch (ex: any) {
      log.error({ err: ex }, 'CharluvAI failed to parse')
      yield { error: `CharluvAI request failed: ${ex.message}` }
      return
    }
  }
}

function getBaseUrl(
  user: AppSchema.User,
  noSuffix: boolean,
  isThirdParty?: boolean,
  moderation?: boolean
) {
  // Moderation runs on the dedicated (original, vision-capable) model, kept off
  // the user-facing chat model. Takes precedence over everything else so a
  // less-censored chat swap can't weaken the safety check.
  if (moderation && config.inference.modUrl) {
    const version = config.inference.modUrl.match(/\/v\d+$/) ? '' : '/v1'
    return { url: config.inference.modUrl + version, changed: true, server: true, mod: true }
  }

  if (isThirdParty && user.koboldUrl) {
    if (noSuffix) return { url: user.koboldUrl, changed: true, server: false, mod: false }

    // If the user provides a versioned API URL for their third-party API, use that. Otherwise
    // fall back to the standard /v1 URL.
    const version = user.koboldUrl.match(/\/v\d+$/) ? '' : '/v1'
    return { url: user.koboldUrl + version, changed: true, server: false, mod: false }
  }

  // Self-hosted, OpenAI-compatible default endpoint configured at the server level.
  // Lets the platform run off its own model without a per-user OpenAI key.
  if (config.inference.textUrl) {
    const version = config.inference.textUrl.match(/\/v\d+$/) ? '' : '/v1'
    return { url: config.inference.textUrl + version, changed: true, server: true, mod: false }
  }

  return { url: `${baseUrl}/v1`, changed: false, server: false, mod: false }
}

export type OAIUsage = {
  daily_costs: Array<{ timestamp: number; line_item: Array<{ name: string; cost: number }> }>
  object: string
  total_usage: number
}

function getCompletionContent(completion: Completion<Inference> | undefined, log: AppLog) {
  if (!completion) {
    return ''
  }

  if (completion.error?.message) {
    log.warn({ completion }, 'OpenAI returned an error')
    return new Error(completion.error.message)
  }

  if ('text' in completion.choices[0]) {
    return completion.choices[0].text
  } else {
    return completion.choices[0].message.content
  }
}
