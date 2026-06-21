import { sanitiseAndTrim } from '/common/requests/util'
import { ChatRole, CompletionItem, ModelAdapter } from './type'
import { defaultPresets } from '../../common/presets'
import { OPENAI_CHAT_MODELS, OPENAI_MODELS } from '../../common/adapters'
import { AppSchema } from '../../common/types/schema'
import { config } from '../config'
import { AppLog } from '../middleware'
import { requestFullCompletion, toChatCompletionPayload } from './chat-completion'
import { decryptText } from '../db/util'
import { streamCompletion } from './stream'
import { getTokenCounter } from '../tokenize'
import { isZImageConfigured } from '../image/zimage'

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
        `Use it for things worth recalling in future chats — about ${userName} (their name, job, preferences, promises) AND about ${charName} yourself, INCLUDING details you state or invent in the moment (e.g. "${charName}'s cat is named Mochi", "${charName}'s brother is called Tom", where ${charName} lives, ${charName}'s backstory). Whenever you mention a new concrete personal detail about yourself, remember it. Skip routine chit-chat.`
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
  const base = getBaseUrl(user, !!gen.thirdPartyUrlNoSuffix, isThirdParty)
  const handle = opts.impersonate?.name || opts.sender?.handle || 'You'
  if (!user.oaiKey && !base.changed) {
    yield { error: `OpenAI request failed: No OpenAI API key not set. Check your settings.` }
    return
  }

  // When targeting the self-hosted endpoint, the server-configured model always
  // wins — that host serves a single model, so a preset's model id is irrelevant.
  const oaiModel =
    (base.server && config.inference.textModel) ||
    gen.thirdPartyModel ||
    gen.oaiModel ||
    defaultPresets.openai.oaiModel
  const maxResponseLength = gen.maxTokens ?? defaultPresets.openai.maxTokens

  const body: any = {
    model: oaiModel,
    stream: (gen.streamResponse && kind !== 'summary') ?? defaultPresets.openai.streamResponse,
    temperature: gen.temp ?? defaultPresets.openai.temp,
    max_tokens: maxResponseLength,
    top_p: gen.topP ?? 1,
    // Filter falsy entries — a null/empty stop value makes strict OpenAI-compatible
    // servers (e.g. vLLM) reject the request with HTTP 400.
    stop: [`\n${handle}:`].concat(gen.stopSequences || []).filter(Boolean),
  }

  body.presence_penalty = gen.presencePenalty ?? defaultPresets.openai.presencePenalty
  body.frequency_penalty = gen.frequencyPenalty ?? defaultPresets.openai.frequencyPenalty

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
  } else if (markerMode && Array.isArray(body.messages) && body.messages[0]?.role === 'system') {
    const instr = markerInstructions(
      opts.replyAs?.name || char?.name || 'the character',
      handle,
      imageToolEnabled,
      memoryToolEnabled
    )
    // Prepend (not append) so it isn't read as part of the trailing "<name>:" cue.
    if (instr) body.messages[0].content = `${instr.trim()}\n\n${body.messages[0].content}`
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

  if (gen.antiBond) body.logit_bias = { 3938: -50, 11049: -50, 64186: -50, 3717: -25 }

  const useThirdPartyPassword =
    base.changed && isThirdParty && (gen.thirdPartyKey || user.thirdPartyPassword)

  const apiKey = useThirdPartyPassword
    ? gen.thirdPartyKey || user.thirdPartyPassword
    : !isThirdParty
    ? user.oaiKey
    : null

  // The server-configured self-hosted key is stored in plaintext config, not encrypted per-user.
  const bearer = base.server
    ? config.inference.textApiKey
      ? `Bearer ${config.inference.textApiKey}`
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

  const url = gen.thirdPartyUrlNoSuffix
    ? base.url
    : useChat
    ? `${base.url}/chat/completions`
    : `${base.url}/completions`

  const iter = body.stream
    ? streamCompletion(opts.user._id, url, headers, body, 'OpenAI', opts.log)
    : requestFullCompletion(opts.user._id, url, headers, body, 'OpenAI', opts.log)
  let accumulated = ''
  let response: Completion<Inference> | undefined

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
      const shown = markerMode ? stripMarkers(accumulated) : accumulated
      yield { partial: sanitiseAndTrim(shown, prompt, char, opts.characters, members) }
    }
  }

  try {
    let text = getCompletionContent(response, log)
    if (text instanceof Error) {
      yield { error: `OpenAI returned an error: ${text.message}` }
      return
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
      log.error({ body: response }, 'OpenAI request failed: Empty response')
      yield { error: `OpenAI request failed: Received empty response. Try again.` }
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
    gen.swipesPerGeneration! > 1
      ? yield sanitiseAndTrim(swipeText, prompt, char, opts.characters, members)
      : yield sanitiseAndTrim(text || '', prompt, opts.replyAs, opts.characters, members)
  } catch (ex: any) {
    log.error({ err: ex }, 'OpenAI failed to parse')
    yield { error: `OpenAI request failed: ${ex.message}` }
    return
  }
}

function getBaseUrl(user: AppSchema.User, noSuffix: boolean, isThirdParty?: boolean) {
  if (isThirdParty && user.koboldUrl) {
    if (noSuffix) return { url: user.koboldUrl, changed: true, server: false }

    // If the user provides a versioned API URL for their third-party API, use that. Otherwise
    // fall back to the standard /v1 URL.
    const version = user.koboldUrl.match(/\/v\d+$/) ? '' : '/v1'
    return { url: user.koboldUrl + version, changed: true, server: false }
  }

  // Self-hosted, OpenAI-compatible default endpoint configured at the server level.
  // Lets the platform run off its own model without a per-user OpenAI key.
  if (config.inference.textUrl) {
    const version = config.inference.textUrl.match(/\/v\d+$/) ? '' : '/v1'
    return { url: config.inference.textUrl + version, changed: true, server: true }
  }

  return { url: `${baseUrl}/v1`, changed: false, server: false }
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
