import { v4 } from 'uuid'
import {
  InferenceState,
  createPromptParts,
  getChatPreset,
  getLinesForPrompt,
  buildPromptParts,
  resolveScenario,
} from '../../../common/prompt'
import { AppSchema } from '../../../common/types/schema'
import { api, isLoggedIn } from '../api'
import { chatStore } from '../chat'
import { userStore } from '../user'
import { localApi } from './storage'
import { toastStore } from '../toasts'
import { neat } from '/common/util'
import { exclude, replace } from '/common/util'
import { toMap } from '/web/shared/util'
import { subscribe } from '../socket'
import { genApi } from './inference'
import { botGen } from './bot-generate'
import { getEncoder } from '../../../common/tokenize'
import { getStore } from '../create'
import { TemplateOpts, parseTemplate } from '/common/template-parser'

export const msgsApi = {
  swapMessage,
  editMessage,
  editMessageProps,
  getMessages,
  deleteMessages,
  getActiveTemplateParts,
  getChatPreset,
  guidance,
  getChatSummary,
}

export type StreamCallback = (res: string, state: InferenceState) => any

export async function guidance<T = any>(
  opts: InferenceOpts & {
    presetId?: string
    previous?: any
    lists?: Record<string, string[]>
    placeholders?: Record<string, string | string[]>
    rerun?: string[]
  }
): Promise<T> {
  const { prompt, service, maxTokens, settings, previous, lists, rerun, placeholders } = opts
  const requestId = v4()
  const { user } = userStore.getState()

  if (!user) {
    throw new Error(`Could not get user settings. Refresh and try again.`)
  }

  const fallback = service === 'default' || !service ? getUserPreset(user.defaultPreset) : undefined

  const res = await api.method<{ result: string; values: T }>('post', `/chat/guidance`, {
    requestId,
    user,
    presetId: opts.presetId,
    settings: opts.presetId ? undefined : settings || fallback,
    prompt,
    service: service || settings?.service || fallback?.service,
    maxTokens,
    previous,
    lists,
    placeholders,
    reguidance: rerun,
  })

  if (res.error) {
    throw new Error(res.error)
  }

  return res.result!.values
}

/**
 * Create a user message that does not generate a bot response
 */
async function createMessage(
  chatId: string,
  opts: { kind: 'ooc' | 'summary' | 'send-noreply'; text: string }
) {
  const { impersonating } = getStore('character').getState()
  const impersonate = opts.kind === 'send-noreply' ? impersonating : undefined
  return api.post<{ requestId: string }>(`/chat/${chatId}/send`, {
    text: opts.text,
    kind: opts.kind,
    impersonate,
  })
}

export async function swapMessage(msg: AppSchema.ChatMessage, text: string, retries: string[]) {
  return swapMessageProps(msg, { msg: text, retries })
}

function getChatSummaryTemplate(service: AIAdapter) {
  return neat`[INST]Below is an instruction that describes a task. Write a response that completes the request.

    {{char}}'s Persona: {{personality}}  (not to be included in summaries)

    The scenario of the conversation: {{scenario}}

    Then the roleplay chat between {{#each bot}}{{.name}}, {{/each}}{{char}} begins.

    {{#each msg}}{{#if .isbot}}### Response:\n{{.name}}: {{.msg}}{{/if}}{{#if .isuser}}### Instruction:\n{{.name}}: {{.msg}}{{/if}}
    {{/each}}

    Summarize the above. Find the facts in the roleplay chat above and summarize them into keywords.
    DO NOT include facts from {{char}}'s Persona above. DO NOT include LEVEL. DO NOT include the scenario.
    You be making a short list for continuity and coherence. Summarize as short as possible, important facts only.
    [/INST]
    Response:
    Summary of Facts: [summary | tokens=180]
    `
}

export async function swapMessageProps(
  msg: AppSchema.ChatMessage,
  update: Partial<AppSchema.ChatMessage>
) {
  if (isLoggedIn()) {
    const res = await api.method('put', `/chat/${msg._id}/message-swap`, update)
    return res
  }

  const messages = await localApi.getMessages(msg.chatId)
  const next = replace(msg._id, messages, update)
  await localApi.saveMessages(msg.chatId, next)
  return localApi.result({ success: true })
}

export async function editMessage(msg: AppSchema.ChatMessage, replace: string) {
  return editMessageProps(msg, { msg: replace.replace(/\r\n/g, '\n') })
}

export async function editMessageProps(
  msg: AppSchema.ChatMessage,
  update: Partial<AppSchema.ChatMessage>
) {
  if (isLoggedIn()) {
    const res = await api.method('put', `/chat/${msg._id}/message-props`, update)
    return res
  }

  const messages = await localApi.getMessages(msg.chatId)
  const next = replace(msg._id, messages, update)
  await localApi.saveMessages(msg.chatId, next)
  return localApi.result({ success: true })
}

export async function getMessages(chatId: string, before: string) {
  // Guest users already have their entire chat history
  if (!isLoggedIn()) return localApi.result({ messages: [] })

  const res = await api.get<{ messages: AppSchema.ChatMessage[] }>(`/chat/${chatId}/messages`, {
    before,
  })
  return res
}

async function getActiveTemplateParts() {
  const { active } = chatStore.getState()

  const { parts, entities, props } = await botGen.getActivePromptOptions({ kind: 'summary' })
  const toLine = messageToLine({
    chars: entities.characters,
    members: entities.members,
    sender: entities.profile,
    impersonate: entities.impersonating,
  })

  const opts: TemplateOpts = {
    chat: entities.chat,
    replyAs: active?.replyAs ? entities.characters[active.replyAs] : entities.char,
    char: entities.char,
    characters: entities.characters,
    lines: entities.messages.filter((msg) => msg.adapter !== 'image' && !msg.event).map(toLine),
    parts,
    sender: entities.profile,
    jsonValues: props.json,
  }

  return opts
}

/**
 *
 * @param chatId
 * @param msgIds
 * @param leafId
 * @param parents Which nodes need their parent updated. Key=node, Value=parentId
 * @returns
 */
export async function deleteMessages(
  chatId: string,
  msgIds: string[],
  leafId: string,
  parents: Record<string, string>
) {
  if (isLoggedIn()) {
    const res = await api.method('delete', `/chat/${chatId}/messages`, {
      ids: msgIds,
      leafId,
      parents,
    })
    return res
  }

  const msgs = await localApi.getMessages(chatId)

  for (const msg of msgs) {
    const parent = parents[msg._id]
    if (!parent) continue
    msg.parent = parent
  }

  await localApi.saveMessages(chatId, exclude(msgs, msgIds))

  const chats = await localApi.loadItem('chats')
  const chat = chats.find((ch) => ch._id === chatId)
  if (chat && leafId) {
    const nextChat: AppSchema.Chat = {
      ...chat,
      treeLeafId: leafId,
      updatedAt: new Date().toISOString(),
    }
    await localApi.saveChats(replace(chatId, chats, nextChat))
  }

  return localApi.result({ success: true })
}

function messageToLine(opts: {
  chars: Record<string, AppSchema.Character>
  sender: AppSchema.Profile
  members: AppSchema.Profile[]
  impersonate?: AppSchema.Character
}) {
  const map = toMap(opts.members)
  return (msg: AppSchema.ChatMessage) => {
    const entity =
      (msg.characterId ? opts.chars[msg.characterId]?.name : map[msg.userId!]?.handle) ||
      opts.impersonate?.name ||
      opts.sender.handle ||
      'You'
    return `${entity}: ${msg.json?.history || msg.msg}`
  }
}

function getAuthGenSettings(
  chat: AppSchema.Chat,
  user: AppSchema.User
): Partial<AppSchema.GenSettings> | undefined {
  const presets = getStore('presets').getState().presets
  return getChatPreset(chat, user, presets)
}

async function getChatSummary() {
  const opts = await msgsApi.getActiveTemplateParts()
  opts.limit = {
    context: 4096,
    encoder: await getEncoder(),
  }
  // check for previous summary
  let resultCheck = opts.lines.join('\n')
  const checkWord = 'Summary of Facts:'
  const lastSummary = resultCheck.lastIndexOf(checkWord)
  console.log('length of result', resultCheck.length)
  if (lastSummary !== -1 && lastSummary > 4) {
    resultCheck = resultCheck.substring(lastSummary - 4)
    console.log('new length of result', resultCheck.length)
  }
  opts.lines = opts.lines.reverse()

  const tokenCount = opts.limit.encoder(resultCheck)

  if (tokenCount < 1500) {
    const needCount = 1500 - tokenCount
    return { error: `Need at least ${needCount} more tokens to generate a summary.` }
  }

  const { active, chatProfiles: members } = getStore('chat').getState()
  if (!active) return

  const { profile, user } = getStore('user').getState()
  if (!profile || !user) return

  const chat = active.chat

  const settings = getAuthGenSettings(chat, user)!

  // Use the chat's actual service (charluv -> self-hosted vLLM), not the legacy
  // hardcoded horde, which is demoted and no longer the text backend.
  const service = settings.service || 'charluv'
  const template = getChatSummaryTemplate(service)
  if (!template) throw new Error(`No chat summary template available for ${service}`)

  const parse = await parseTemplate(template, opts)
  const prompt = parse.parsed

  settings.temp = 0
  settings.maxTokens = 200
  settings.maxContextLength = 4096

  const values = await msgsApi.guidance<{ summary: string }>({
    prompt,
    settings,
    service,
    maxTokens: 200,
  })

  const result = await createMessage(chat._id, {
    kind: 'summary',
    text: `(OOC Summary of Facts: ${values.summary})`,
  })
  if (result!.result!.error) {
    throw new Error(result!.error)
  }

  return result.result!.values
}

/**
 * Partials
 */
subscribe(
  'inference-partial',
  { partial: 'string', requestId: 'string', output: 'any?' },
  (body) => {
    const cb = genApi.callbacks.get(body.requestId)
    if (!cb) return

    cb(body.partial, 'partial', body.output)
  }
)

subscribe(
  'message-partial',
  { requestId: 'string', partial: 'string', json: 'boolean?' },
  (body) => {
    const cb = genApi.callbacks.get(body.requestId)
    if (!cb) return

    cb(body.partial, 'partial')
  }
)

/**
 * Completions
 */
subscribe('inference', { requestId: 'string', response: 'string', output: 'any?' }, (body) => {
  const cb = genApi.callbacks.get(body.requestId)
  if (!cb) return

  cb(body.response, 'done', body.output)
  genApi.callbacks.delete(body.requestId)
})

subscribe('message-created', { requestId: 'string', msg: 'string' }, (body) => {
  const cb = genApi.callbacks.get(body.requestId)
  if (!cb) return

  cb(body.msg, 'done')
  genApi.callbacks.delete(body.requestId)
})

subscribe('chat-query', { requestId: 'string', response: 'string' }, (body) => {
  const cb = genApi.callbacks.get(body.requestId)
  if (!cb) return

  cb(body.response, 'done')
  genApi.callbacks.delete(body.requestId)
})

/**
 * Errors
 */
subscribe('message-error', { requestId: 'string', error: 'string' }, (body) => {
  const cb = genApi.callbacks.get(body.requestId)
  if (!cb) return

  cb(body.error, 'error')
  genApi.callbacks.delete(body.requestId)
  toastStore.error(`Inference failed: ${body.error}`)
})

subscribe('inference-warning', { requestId: 'string', warning: 'string' }, (body) => {
  const cb = genApi.callbacks.get(body.requestId)
  if (!cb) return

  cb(body.warning, 'warning')
  toastStore.warn(`Inference warning: ${body.warning}`)
})

subscribe('inference-error', { requestId: 'string', error: 'string' }, (body) => {
  const cb = genApi.callbacks.get(body.requestId)
  if (!cb) return

  cb(body.error, 'error')
  toastStore.warn(`Inference error: ${body.error}`)
})
