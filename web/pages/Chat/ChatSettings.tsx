import { Component, createMemo } from 'solid-js'
import Button from '../../shared/Button'
import Select from '../../shared/Select'
import { Toggle } from '../../shared/Toggle'
import { chatStore } from '../../store'
import { CHARLUV_TEMP_PRESETS, DEFAULT_CHARLUV_PRESET } from '/common/presets/charluv'
import { Card } from '/web/shared/Card'

// The old per-chat edit pane exposed a pile of legacy Agnai options (image
// source, chat mode, character overrides, scenarios). None of those are used
// in Charluv, and the chat title is renamed from the chat list — so this pane
// is now a dedicated reply-style picker.
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

  props.footer(<Button onClick={props.close}>Close</Button>)

  return (
    <div class="flex flex-col gap-3">
      <Card>
        <Select
          fieldName="genPreset"
          label="Reply style"
          helperText="How varied the replies are. Higher = more creative and unpredictable."
          items={CHARLUV_TEMP_PRESETS.map((p) => ({ label: `${p.label} — ${p.hint}`, value: p.id }))}
          value={currentPreset()}
          onChange={(ev) => changePreset(ev.value)}
        />
      </Card>
      <Card>
        <Toggle
          fieldName="memoryDisabled"
          label="Disable long-term memory"
          helperText="Nothing said here is remembered or recalled later. On by default for Events."
          value={state.chat?.memoryDisabled ?? false}
          onChange={(v) =>
            state.chat && chatStore.editChat(state.chat._id, { memoryDisabled: v }, undefined)
          }
        />
      </Card>
    </div>
  )
}

export default ChatSettings
