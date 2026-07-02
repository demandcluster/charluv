import { Component, createMemo } from 'solid-js'
import Button from '../../shared/Button'
import Select from '../../shared/Select'
import { chatStore } from '../../store'
import { CHARLUV_TEMP_PRESETS, DEFAULT_CHARLUV_PRESET } from '/common/presets/charluv'
import { Card } from '/web/shared/Card'

// The old per-chat edit pane exposed a pile of legacy Agnai options (image
// source, chat mode, character overrides, scenarios). None of those are used
// in Charluv, and the chat title is renamed from the chat list — so this pane
// is now a dedicated reply-style picker.
// Per-chat model choice. Absent on stored chats = 'qwen' (the new default).
// Qwen refusals automatically fall back to Broken Tutu server-side; this picker
// lets the user commit the chat to one model.
const CHAT_MODELS: Array<{ id: 'qwen' | 'tutu'; label: string; hint: string }> = [
  { id: 'qwen', label: 'Qwen3.6 35B MoE', hint: 'More capable, more strict' },
  { id: 'tutu', label: 'Charluv Broken Tutu 24B', hint: 'Off the rails, lewd.' },
]

const ChatSettings: Component<{
  close: () => void
  footer: (children: any) => void
}> = (props) => {
  const state = chatStore((s) => ({ chat: s.active?.chat }))

  const currentPreset = createMemo(
    () =>
      CHARLUV_TEMP_PRESETS.find((p) => p.id === state.chat?.genPreset)?.id || DEFAULT_CHARLUV_PRESET
  )

  const changePreset = (id: string) => {
    if (!state.chat?._id || id === currentPreset()) return
    chatStore.editChatGenPreset(state.chat._id, id, () => {})
  }

  const currentModel = createMemo(() => state.chat?.chatModel || 'qwen')

  const changeModel = (id: string) => {
    if (!state.chat?._id || id === currentModel()) return
    chatStore.editChat(state.chat._id, { chatModel: id as 'qwen' | 'tutu' }, undefined)
  }

  props.footer(<Button onClick={props.close}>Close</Button>)

  return (
    <div class="flex flex-col gap-3">
      <Card>
        <Select
          fieldName="genPreset"
          label="Reply style"
          helperText="How varied the replies are. Higher = more creative and unpredictable."
          items={CHARLUV_TEMP_PRESETS.map((p) => ({
            label: `${p.label} — ${p.hint}`,
            value: p.id,
          }))}
          value={currentPreset()}
          onChange={(ev) => changePreset(ev.value)}
        />
      </Card>
      <Card>
        <Select
          fieldName="chatModel"
          label="Model"
          helperText="Which AI writes the replies. If Qwen refuses a reply, Broken Tutu answers instead."
          items={CHAT_MODELS.map((m) => ({
            label: `${m.label} — ${m.hint}`,
            value: m.id,
          }))}
          value={currentModel()}
          onChange={(ev) => changeModel(ev.value)}
        />
      </Card>
    </div>
  )
}

export default ChatSettings
