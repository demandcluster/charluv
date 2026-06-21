import needle from 'needle'
import { config } from './config'
import { logger } from './middleware'

/**
 * Minimal non-streaming chat completion against the self-hosted, OpenAI-compatible
 * text endpoint (vLLM in OpenAI mode). For small internal tasks — classification,
 * extraction, summarisation — NOT user-facing generation, which goes through the
 * full streaming adapter. Shared server-side utility; returns null when the
 * endpoint is unconfigured or errors so callers can fall back deterministically.
 */
export function isTextLlmConfigured() {
  return !!config.inference.textUrl
}

function chatUrl() {
  const url = (config.inference.textUrl || '').replace(/\/+$/, '')
  if (!url) return ''
  const version = url.match(/\/v\d+$/) ? '' : '/v1'
  return `${url}${version}/chat/completions`
}

export async function classify(
  system: string,
  user: string,
  opts: { maxTokens?: number; timeoutMs?: number } = {}
): Promise<string | null> {
  const url = chatUrl()
  if (!url) return null

  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (config.inference.textApiKey) headers.Authorization = `Bearer ${config.inference.textApiKey}`

  const body = {
    model: config.inference.textModel || 'default',
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
    temperature: 0,
    max_tokens: opts.maxTokens ?? 200,
    stream: false,
  }

  const timeout = opts.timeoutMs ?? 8000
  const result: any = await needle('post', url, body, {
    json: true,
    headers,
    response_timeout: timeout,
    read_timeout: timeout,
  }).catch((err) => ({ err }))

  if (!result || 'err' in result) {
    logger.warn({ err: result?.err?.message || result?.err }, 'memory: classify request failed')
    return null
  }
  if (result.statusCode && result.statusCode >= 400) {
    logger.warn({ status: result.statusCode }, 'memory: classify request rejected')
    return null
  }

  const content = result.body?.choices?.[0]?.message?.content
  return typeof content === 'string' ? content : null
}

/** Extract the first JSON object from a model response (tolerates prose/fences). */
export function parseJsonObject<T = any>(text: string | null): T | null {
  if (!text) return null
  const match = text.match(/\{[\s\S]*\}/)
  if (!match) return null
  try {
    return JSON.parse(match[0]) as T
  } catch {
    return null
  }
}
