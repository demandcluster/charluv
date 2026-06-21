import needle from 'needle'
import { randomBytes } from 'crypto'
import { ImageAdapter } from './types'
import { config } from '../config'

/**
 * Z-Image backend client.
 *
 * Self-hosted image service: text-to-image plus character-consistent generation
 * via i2L (image-to-LoRA). A character's identity is encoded once into a stored
 * LoRA (`/v1/encode`), then every image is a fast generation that loads it
 * (`/v1/generate` with `lora_name`). Text and image inference live on separate
 * endpoints by design, so this never shares config with the text adapter.
 *
 * Contract: JSON, synchronous (responds when done — seconds), one GPU so
 * concurrent calls queue. Auth via `X-API-Key` header.
 */

const baseUrl = () => (config.inference.imageUrl || '').replace(/\/+$/, '')

export const isZImageConfigured = () => !!baseUrl()

function headers() {
  const h: Record<string, string> = { 'Content-Type': 'application/json' }
  if (config.inference.imageApiKey) h['X-API-Key'] = config.inference.imageApiKey
  return h
}

/** Strip a `data:image/...;base64,` prefix; Z-Image wants raw base64. */
function rawBase64(input: string) {
  return input.replace(/^data:image\/[a-z0-9.+-]+;base64,/i, '')
}

/**
 * Build a collision-resistant LoRA name from the character name plus a
 * randomizer. Sanitised to satisfy the backend (no `/`, `\`, or `..`).
 */
export function makeLoraName(charName: string) {
  const slug =
    (charName || 'char')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 32) || 'char'
  return `${slug}-${randomBytes(4).toString('hex')}`
}

async function post(path: string, body: Record<string, any>) {
  const url = `${baseUrl()}${path}`
  const result: any = await needle('post', url, body, { json: true, headers: headers() }).catch(
    (err) => ({ err })
  )

  if ('err' in result) {
    if (result.err && 'code' in result.err) {
      throw new Error(`Image request failed: Service unreachable - ${result.err.code}`)
    }
    throw new Error(`Image request failed: ${result.err?.message || result.err}`)
  }

  if (result.statusCode && result.statusCode >= 400) {
    const detail = result.body?.detail
    const msg = Array.isArray(detail)
      ? detail.map((d: any) => d?.msg || d).join('; ')
      : detail || result.body?.message || result.statusMessage
    throw new Error(`Image request failed: ${msg} (${result.statusCode})`)
  }

  return result.body
}

type ZGenerateInput = {
  prompt: string
  negative?: string
  /** Mode A: generate from a stored LoRA. */
  loraName?: string
  /** Mode C: inline i2L (1-4 base64 images, data-url prefixes ok). */
  referenceImages?: string[]
  /** Persist the inline-encoded LoRA (Mode C only). */
  saveAs?: string
  width?: number
  height?: number
  steps?: number
  cfg?: number
  /** Omit for random; pass to reproduce/keep consistent. */
  seed?: number
}

type ZGenerateResult = {
  content: Buffer
  ext: 'png'
  seed: number
  savedLora?: string | null
}

/** POST /v1/generate. Returns the first image plus the seed actually used. */
export async function zimageGenerate(input: ZGenerateInput): Promise<ZGenerateResult> {
  if (!isZImageConfigured()) {
    throw new Error('Image generation is not configured (ZIMAGE_BASE_URL is unset)')
  }

  const body: Record<string, any> = {
    prompt: input.prompt,
    response_format: 'json',
  }

  if (input.negative) body.negative_prompt = input.negative

  // lora_name and reference_images are mutually exclusive (422 otherwise).
  if (input.loraName) {
    body.lora_name = input.loraName
  } else if (input.referenceImages?.length) {
    body.reference_images = input.referenceImages.slice(0, 4).map(rawBase64)
    if (input.saveAs) body.save_as = input.saveAs
  }

  if (input.width) body.width = input.width
  if (input.height) body.height = input.height
  if (input.steps) body.steps = input.steps
  if (input.cfg) body.cfg = input.cfg
  if (typeof input.seed === 'number') body.seed = input.seed

  const res = await post('/v1/generate', body)
  const item = res?.images?.[0]
  if (!item?.base64) {
    throw new Error('Failed to generate image: Response did not contain an image')
  }

  return {
    content: Buffer.from(item.base64, 'base64'),
    ext: 'png',
    seed: res.seed,
    savedLora: res.saved_lora ?? null,
  }
}

/**
 * POST /v1/encode. Encodes 1-4 reference images of the *same* character into a
 * stored LoRA and returns its name. Reference images can be discarded after.
 */
export async function zimageEncode(referenceImages: string[], saveAs: string): Promise<string> {
  if (!isZImageConfigured()) {
    throw new Error('Image generation is not configured (ZIMAGE_BASE_URL is unset)')
  }
  if (!referenceImages.length) {
    throw new Error('Encode requires at least one reference image')
  }

  const res = await post('/v1/encode', {
    reference_images: referenceImages.slice(0, 4).map(rawBase64),
    save_as: saveAs,
  })

  if (!res?.lora_name) {
    throw new Error('Encode failed: Response did not contain a lora_name')
  }
  return res.lora_name
}

/** GET /v1/loras — list stored character LoRAs. */
export async function zimageListLoras(): Promise<string[]> {
  if (!isZImageConfigured()) return []
  const url = `${baseUrl()}/v1/loras`
  const result: any = await needle('get', url, null, { json: true, headers: headers() }).catch(
    () => null
  )
  return result?.body?.loras ?? []
}

/**
 * ImageAdapter wrapper for the chat/avatar image pipeline. Generates from the
 * character's stored LoRA when present (Mode A); otherwise plain text-to-image.
 */
export const handleZImage: ImageAdapter = async (opts, log) => {
  log.debug(
    { loraName: opts.loraName, seed: opts.seed, width: opts.width, height: opts.height },
    'Image: Z-Image generate'
  )

  // Size is decided by the caller (chat = 512, character/avatar = 768). Steps/cfg
  // are fixed for fast, consistent generation.
  const res = await zimageGenerate({
    prompt: opts.prompt,
    negative: opts.negative,
    loraName: opts.loraName,
    seed: opts.seed,
    width: opts.width || 512,
    height: opts.height || 512,
    steps: config.inference.imageSteps || 14,
    cfg: 4,
  })

  return { ext: res.ext, content: res.content, seed: res.seed }
}
