import { AppSchema } from '../srv/db/schema'
import { defaultPresets } from './default-preset'
import { SD_SAMPLER } from './image'
import { toArray } from './util'
import { AppLog } from '/srv/logger'

const HORDE_GUEST_KEY = '0000000000'
//const imageUrl = 'https://horde.koboldai.net/api/v2'
const imageUrl = 'https://horde.aivo.chat/api/v2'
const hordeUrl = 'https://horde.aivo.chat/api/v2'

//const imageUrl = 'http://localhost:7001/api/v2'
//const hordeUrl = 'https://051f-2a01-4f9-2b-26e3-00-2.ngrok-free.app/api/v2'
const defaults = {
  image: {
    sampler: SD_SAMPLER['DPM++ 2M'],
    model: 'Deliberate',
    negative: `disfigured, ugly, deformed, poorly, censor, censored, blurry, lowres, fused, malformed, watermark, misshapen, duplicated, grainy, distorted, signature`,
  },
}

type FetchOpts = {
  url: string
  method: 'post' | 'get'
  payload?: any
  key?: string
}

type Fetcher = <T = any>(
  opts: FetchOpts
) => Promise<{ statusCode?: number; statusMessage?: string; body: T }>

type HordeCheck = {
  generations: any[]
  done: boolean
  faulted: boolean
  waiting: number
  restarted: number
  queue_position: number
  is_possible: number
  finished: number
  kudos: number
  wait_time: number
  message?: string
}

let TIMEOUT_SECS = Infinity
let fetcher: Fetcher
let logger: AppLog

if (typeof window !== 'undefined') {
  fetcher = async (opts) => {
    const res = await fetch(opts.url, {
      headers: { 'Content-Type': 'application/json', apikey: opts.key || HORDE_GUEST_KEY },
      body: opts.payload ? JSON.stringify(opts.payload) : undefined,
      method: opts.method,
    })

    const json = await res.json()
    return { body: json, statusCode: res.status, statusMessage: res.statusText }
  }
}

async function useFetch<T = any>(opts: FetchOpts) {
  const res = await fetcher<T>(opts).catch((error) => ({ error }))
  if ('error' in res) {
    throw new Error(`Horde request failed: ${res.error}`)
  }

  if (res.statusCode && res.statusCode >= 400) {
    throw new Error(`Horde request failed: ${res.statusMessage}`)
  }

  return res
}

export function configure(fn: Fetcher, log: AppLog, timeoutSecs?: number) {
  if (timeoutSecs) {
    TIMEOUT_SECS = timeoutSecs
  }

  logger = log
  fetcher = fn
}

type GenerateOpts = {
  type: 'text' | 'image'
  payload: any
  timeoutSecs?: number
  key: string
}

export async function generateImage(user: AppSchema.User, prompt: string) {
  const base = user.images
  const settings = user.images?.horde || defaults.image

  const payload = {
    prompt: `${prompt.slice(0, 500)} ### ${defaults.image.negative}`,
    params: {
      height: base?.height ?? 384,
      width: base?.width ?? 384,
      cfg_scale: base?.cfg ?? 9,
      seed: Math.trunc(Math.random() * 1_000_000_000).toString(),
      karras: false,
      n: 1,
      post_processing: [],
      sampler_name: settings.sampler ?? defaults.image.sampler,
      steps: base?.steps ?? 28,
    },
    censor_nsfw: false,
    nsfw: true,
    models: [settings.model || 'Deliberate'],
    r2: false,
    replacement_filter: true,
    trusted_workers: user.hordeUseTrusted ?? false,
  }

  logger?.debug(payload, 'Horde payload')

  const image = await generate({ type: 'image', payload, key: user.hordeKey || HORDE_GUEST_KEY })
  return image
}

export async function generateText(
  user: AppSchema.User,
  preset: Partial<AppSchema.GenSettings>,
  prompt: string
) {
  const body = {
    // An empty models array will use any model
    models: [] as string[],
    prompt,
    workers: [] as string[],
    trusted_workers: user.hordeUseTrusted ?? true,
  }

  // if (user.hordeModel && user.hordeModel !== 'any') {
  // const models = toArray(user.hordeModel)
  //const models = toArray('any')
  //body.models.push(...models)
  //  }

  if (user.hordeWorkers?.length) {
    body.workers = user.hordeWorkers
  }

  const settings: any = {
    max_length: preset.maxTokens ?? defaultPresets.horde.maxTokens,
    top_k: preset.topK ?? defaultPresets.horde.topK,
    top_p: preset.topK ?? defaultPresets.horde.topP,
    typical: preset.topK ?? defaultPresets.horde.typicalP,
    max_context_length: Math.min(
      preset.maxContextLength ?? defaultPresets.horde.maxContextLength,
      2048
    ),
    rep_pen: preset.repetitionPenalty ?? defaultPresets.horde.repetitionPenaltyRange,
    rep_pen_range: preset.repetitionPenaltyRange ?? defaultPresets.horde.repetitionPenaltyRange,
    rep_pen_slope: preset.repetitionPenaltySlope,
    tfs: preset.tailFreeSampling ?? defaultPresets.horde.tailFreeSampling,
    temperature: preset.temp ?? defaultPresets.horde.temp,
  }

  const payload = { n: 1, ...body, ...settings }
  const text = await generate({ type: 'text', payload, key: user.hordeKey || HORDE_GUEST_KEY })
  return text
}

async function generate(opts: GenerateOpts) {
  const init = await useFetch<{ id: string }>({
    method: 'post',
    url: opts.type === 'image' ? `${imageUrl}/generate/async` : `${hordeUrl}/generate/text/async`,
    key: opts.key,
    payload: opts.payload,
  })

  const url =
    opts.type === 'text'
      ? `${hordeUrl}/generate/text/status/${init.body.id}`
      : `${imageUrl}/generate/status/${init.body.id}`

  const result = await poll(url, opts.key, opts.type === 'text' ? 2.5 : 6.5)

  return opts.type === 'text' ? result.generations[0].text : result.generations[0].img
}

async function poll(url: string, key: string | undefined, interval = 6.5) {
  const started = Date.now()
  const threshold = TIMEOUT_SECS * 1000

  do {
    const elapsed = Date.now() - started
    if (elapsed > threshold) {
      throw new Error(`Timed out (${TIMEOUT_SECS}s)`)
    }

    const res = await useFetch<HordeCheck>({ method: 'get', url, key })
    if (res.body.faulted) {
      throw new Error(`Horde request failed: The worker faulted while generating.`)
    }

    if (res.body.done) {
      return res.body
    }

    await wait(interval)
  } while (true)
}

function wait(secs: number) {
  return new Promise((resolve) => setTimeout(resolve, secs * 1000))
}
