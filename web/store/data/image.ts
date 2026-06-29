import * as horde from '../../../common/horde-gen'
import { createImagePrompt, getMaxImageContext } from '../../../common/image-prompt'
import { api, isLoggedIn } from '../api'
import { getStore } from '../create'
import { msgsApi } from './messages'
import { AIAdapter } from '/common/adapters'
import { decode, encode, getEncoder } from '/common/tokenize'
import { parseTemplate } from '/common/template-parser'
import { neat } from '/common/util'
import { AppSchema } from '/common/types'
import { localApi } from './storage'
import { subscribe } from '../socket'
import { getAssetUrl } from '/web/shared/util'
import { v4 } from 'uuid'
import { md5 } from './md5'
import { getPromptEntities, PromptEntities } from './common'
import { genApi } from './inference'

type GenerateOpts = {
  chatId?: string
  ephemeral?: boolean
  messageId?: string
  prompt?: string
  append?: boolean
  source: string
  parent?: string

  /** If true, the Image Settings prefix and suffix won't be applied */
  noAffix?: boolean
  onDone: (image: string) => void
}

export const ALLOWED_TYPES = new Map([
  ['jpg', 'image/jpeg'],
  ['jpeg', 'image/jpeg'],
  ['png', 'image/png'],
  ['apng', 'image/apng'],
  ['gif', 'image/gif'],
])

export const imageApi = {
  generateImage,
  generateImageWithPrompt,
  generateImageAsync,
  dataURLtoFile,
  getImageData,
  ALLOWED_TYPES,
}

export async function generateImage({ chatId, messageId, onDone, ...opts }: GenerateOpts) {
  const entities = await getPromptEntities()
  const summary = opts.prompt
    ? await localApi.result({ response: opts.prompt })
    : await createSummarizedImagePrompt(entities)

  if (!summary.result) {
    return summary
  }
  const charType = entities.char?.tags?.includes('anime')
    ? 'Anime style artwork of '
    : 'Photorealistic image of '
  // Always lead with the character's appearance prompt (the look saved at
  // creation) so chat images stay consistent regardless of what the scene caption
  // happened to describe. It's first so the token trim below keeps it.
  const appearance = entities.char?.appearance?.trim()
  const prompt = [appearance, summary.result.response].filter(Boolean).join(', ')

  const characterId = entities.messages.reduceRight((id, msg) => id || msg.characterId)

  const max = getMaxImageContext(entities.user)
  const trimmed = await encode(prompt)
    .then((tokens) => tokens.slice(0, max - 15))
    .then(decode)

  const newPrompt = charType + trimmed

  if (!isLoggedIn()) {
    return { error: "Sorry, members only.. don't worry it is free!" }
  }

  const res = await api.post<{ success: boolean }>(`/chat/${chatId || entities.chat._id}/image`, {
    prompt: newPrompt,
    user: entities.user,
    messageId,
    ephemeral: opts.ephemeral,
    append: opts.append,
    source: opts.source,
    chatId,
    characterId,
    parent: opts.parent,
  })
  return res
}

export async function generateImageWithPrompt(opts: {
  prompt: string
  source: string
  seed?: number
  /** Skip the image credit charge (e.g. the create wizard's first portrait,
   * which is bundled into the creation fee). Server validates eligibility. */
  noCharge?: boolean
  onDone: (result: { image: string; file: File; data?: string }) => void
  onTick?: (status: horde.HordeCheck) => void
}) {
  const { prompt, source, onDone } = opts
  const user = getStore('user').getState().user

  if (!user) {
    throw new Error('Could not get user settings')
  }

  if (!isLoggedIn() && (!user.images || user.images.type === 'horde')) {
    try {
      const { text: image } = await horde.generateImage(
        user,
        prompt,
        user.images?.negative || horde.defaults.image.negative,
        (status) => {
          opts.onTick?.(status)
        }
      )

      const file = await dataURLtoFile(image)
      const data = await getImageData(file)

      onDone({ image, file, data })
      return localApi.result({})
    } catch (ex: any) {
      return localApi.error(ex.message)
    }
  }

  const res = await api.post<{ success: boolean }>(`/character/image`, {
    prompt,
    user,
    ephemeral: true,
    source,
    seed: opts.seed,
    noCharge: opts.noCharge,
  })

  return res
}

type ImageResult = { image: string; file: File; data?: string; error?: string }

export async function generateImageAsync(
  prompt: string,
  opts: { noAffix?: boolean; onTick?: (status: horde.HordeCheck) => void } = {}
): Promise<ImageResult> {
  const user = getStore('user').getState().user
  const source = `image-${v4()}`

  if (!user) {
    throw new Error('Could not get user settings')
  }

  if (!isLoggedIn() && (!user.images || user.images.type === 'horde')) {
    try {
      const { text: image } = await horde.generateImage(
        user,
        prompt,
        user.images?.negative || '',
        (status) => {
          opts.onTick?.(status)
        }
      )

      const file = await dataURLtoFile(image)
      const data = await getImageData(file)

      return { image, file, data }
    } catch (ex: any) {
      throw ex
    }
  }

  const requestId = v4()

  const promise = new Promise<ImageResult>((resolve, reject) => {
    callbacks.set(requestId, (image) => {
      if (image.error) return reject(new Error(image.error))
      resolve(image)
    })
  })

  await api.post<{ success: boolean }>(`/character/image`, {
    prompt,
    user,
    ephemeral: true,
    source,
    noAffix: opts.noAffix,
    requestId,
  })

  return promise
}

const callbacks = new Map<string, (result: ImageResult) => void>()

subscribe(
  'image-generated',
  { image: 'string', requestId: 'string', source: 'string?' },
  async (body) => {
    if (body.source === 'avatar') return

    const callback = callbacks.get(body.requestId)
    if (!callback) return

    callbacks.delete(body.requestId)
    const url = getAssetUrl(body.image)
    const image = await fetch(getAssetUrl(body.image)).then((res) => res.blob())
    const file = new File([image], `${body.source}.png`, { type: 'image/png' })

    const hash = md5(await image.text())
    Object.assign(file, { hash })

    const data = await getImageData(file)

    callback({ image: url, file, data })
  }
)

subscribe('image-failed', { requestId: 'string', error: 'string' }, (body) => {
  const callback = callbacks.get(body.requestId)
  if (!callback) return

  callback({ file: {} as any, image: '', error: body.error })
})

const SUMMARY_BACKENDS: { [key in AIAdapter]?: (opts: PromptEntities) => boolean } = {
  charluv: () => true,
  openai: () => true,
  horde: () => true,
  ooba: () => true,
  kobold: () => true,
  claude: () => true,
}

async function createSummarizedImagePrompt(opts: PromptEntities) {
  const handler = opts.settings?.service
    ? SUMMARY_BACKENDS[opts.settings?.service]
    : (_opts: any) => false

  const canUseService = handler?.(opts) ?? false
  if (canUseService) {
    // && opts.user.images?.summariseChat) {
    console.log('Using', opts.settings?.service, 'to summarise')

    const summary = await getChatSummary(opts.settings, opts.user.images?.summaryPrompt)
    console.log('Image caption: ', summary)
    return summary
  }

  const prompt = await createImagePrompt(opts)
  return localApi.result({ response: prompt, meta: {} })
}

async function getChatSummary(settings: Partial<AppSchema.GenSettings>, summaryPrompt?: string) {
  const opts = await msgsApi.getActiveTemplateParts()
  opts.limit = {
    context: 1024,
    encoder: await getEncoder(),
  }
  opts.lines = (opts.lines || []).reverse()

  let template = getSummaryTemplate(settings.service!, summaryPrompt)

  if (!template) throw new Error(`No chat summary template available for "${settings.service!}"`)

  const parsed = await parseTemplate(template, opts)
  const prompt = parsed.parsed
  const response = await genApi.basicInference({
    prompt,
    settings,
  })

  return response
}

function getSummaryTemplate(service: AIAdapter, summaryPrompt?: string) {
  switch (service) {
    case 'charluv':
    case 'openai':
    case 'claude': {
      const prompt =
        summaryPrompt ||
        `Write an image caption of the current scene including the character's appearance`
      return neat`
      {{personality}}

      (System note: Start of conversation)
      {{history}}

      {{ujb}}
      (System: ${prompt})
      Image caption:`
    }

    case 'ooba':
    case 'kobold':
    case 'horde': {
      const prompt =
        summaryPrompt ||
        `Write an image caption of the current scene using physical descriptions without names.`
      return neat`
      [INST]
      Below is an instruction that describes a task. Write a response that completes the request.

      {{char}}'s Persona: {{personality}}

      The scenario of the conversation: {{scenario}}

      {{#each msg}}{{#if .isbot}}<bot>{{.name}}: {{.msg}}</bot>{{/if}}{{#if .isuser}}<user>{{.name}}: {{.msg}}</user>{{/if}}
      {{/each}}

      <user>${prompt}</user>
      
      Image caption:
      [/INST]
      `
    }
  }
}

export async function dataURLtoFile(base64: string, name?: string): Promise<File> {
  return fetch(base64)
    .then((res) => res.blob())
    .then(async (buf) => {
      const file = new File([buf], name || 'avatar.png', { type: 'image/png' })
      return file
    })
}

/**
 * Returns image base64
 * @param file
 * @param name
 * @returns
 */
export async function getImageData(file: File | Blob | string | undefined, name?: string) {
  if (!file) return

  if (typeof file === 'string') {
    const image = await fetch(getAssetUrl(file)).then((res) => res.blob())
    const ext = file.split('.').slice(-1)[0]
    const mimetype = ALLOWED_TYPES.get(ext) || 'image/png'
    file = new File([image], name || 'downloaded.png', { type: mimetype })
  }

  const reader = new FileReader()

  return new Promise<string>((resolve, reject) => {
    reader.readAsDataURL(file as File | Blob)

    reader.onload = (evt) => {
      if (!evt.target?.result) return reject(new Error(`Failed to process image`))
      resolve(evt.target.result.toString())
    }
  })
}
