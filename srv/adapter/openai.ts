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

/** Chat kinds where offering the image tool makes sense (a fresh assistant reply). */
const IMAGE_TOOL_KINDS = new Set([
  'send',
  'request',
  'self',
  'send-event:world',
  'send-event:character',
  'send-event:hidden',
  'retry',
])

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

  // Offer the native image tool on normal assistant replies when the Z-Image
  // backend is configured. The model decides whether to call it.
  const imageToolEnabled = useChat && isZImageConfigured() && IMAGE_TOOL_KINDS.has(kind as string)
  if (imageToolEnabled) {
    body.tools = [IMAGE_TOOL]
    body.tool_choice = 'auto'
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
      yield { partial: sanitiseAndTrim(accumulated, prompt, char, opts.characters, members) }
    }
  }

  try {
    // Did the model call the native image tool? Parse its prompt argument.
    let imagePrompt = ''
    if (imageToolEnabled) {
      // Streaming returns tool_calls on the choice; non-streaming nests them
      // under choice.message.
      const choice0 = response?.choices?.[0] as any
      const toolCalls = choice0?.tool_calls || choice0?.message?.tool_calls
      const imageCall = toolCalls?.find((t: any) => t?.function?.name === 'generate_image')
      if (imageCall?.function?.arguments) {
        try {
          const args = JSON.parse(imageCall.function.arguments)
          if (typeof args?.prompt === 'string') imagePrompt = args.prompt.trim()
        } catch {
          log.warn({ args: imageCall.function.arguments }, 'Bad generate_image tool arguments')
        }
      }
    }

    let text = getCompletionContent(response, log)
    if (text instanceof Error) {
      yield { error: `OpenAI returned an error: ${text.message}` }
      return
    }

    // Empty text is only an error when there's no tool call to act on (the model
    // may reply with just an image).
    if (!text?.length && !imagePrompt) {
      log.error({ body: response }, 'OpenAI request failed: Empty response')
      yield { error: `OpenAI request failed: Received empty response. Try again.` }
      return
    }

    // Surface the tool call so the message handler can run image generation.
    if (imagePrompt) {
      yield { meta: { imageTool: { prompt: imagePrompt } } }
    }

    gen.swipesPerGeneration! > 1
      ? yield sanitiseAndTrim(accumulated, prompt, char, opts.characters, members)
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
