import { Component, For, JSX, Show, createMemo, createSignal, onMount } from 'solid-js'
import { Trash } from '/web/icons'
import { AppSchema } from '../../../../common/types/schema'
import Button from '../../../shared/Button'
import TextInput from '../../../shared/TextInput'
import { Toggle } from '../../../shared/Toggle'
import Loading from '../../../shared/Loading'
import CharacterSelect from '../../../shared/CharacterSelect'
import { chatStore, toastStore } from '../../../store'
import { charsApi, CharacterMemory } from '../../../store/data/chars'

/**
 * Long-term memory pane — the new "remember" system that replaces memory books.
 * Memories are scoped to the owner + character and persist across every chat
 * with that companion. The model writes them via the `remember` tool; here the
 * owner can review, add, and delete them.
 *
 * In an event/multi-character chat each companion keeps its own memories (the
 * `remember` tool stores against whoever spoke), so the pane lets the owner pick
 * which character's memories to view — defaulting to the chat's main character.
 */
const LongTermMemory: Component<{
  chat: AppSchema.Chat | undefined
  chars?: AppSchema.Character[]
  close: () => void
  footer?: (children: JSX.Element) => void
}> = (props) => {
  // Participants to choose between, with the chat's main character first.
  const chars = createMemo(() => {
    const list = props.chars ?? []
    if (!list.length && props.chat?.characterId) return []
    const mainId = props.chat?.characterId
    return [...list].sort((a, b) => (a._id === mainId ? -1 : b._id === mainId ? 1 : 0))
  })

  const [selectedId, setSelectedId] = createSignal(props.chat?.characterId)
  const charId = () => selectedId() ?? props.chat?.characterId
  const selectedChar = createMemo(() => chars().find((c) => c._id === charId()))

  const [memories, setMemories] = createSignal<CharacterMemory[]>([])
  const [loading, setLoading] = createSignal(true)
  const [text, setText] = createSignal('')
  const [busy, setBusy] = createSignal(false)

  const load = async () => {
    const id = charId()
    if (!id) return
    setLoading(true)
    const res = await charsApi.listMemories(id)
    setLoading(false)
    if (res.result && 'memories' in res.result) setMemories(res.result.memories)
    else if (res.error) toastStore.error(`Could not load memories: ${res.error}`)
  }

  const selectChar = (char: AppSchema.Character | undefined) => {
    if (!char || char._id === charId()) return
    setSelectedId(char._id)
    setText('')
    load()
  }

  onMount(load)

  const add = async () => {
    const id = charId()
    const value = text().trim()
    if (!id || !value) return
    setBusy(true)
    const res = await charsApi.addMemory(id, value)
    setBusy(false)
    if (res.result && 'memories' in res.result) {
      setMemories(res.result.memories)
      setText('')
    } else if (res.error) {
      toastStore.error(`Could not add memory: ${res.error}`)
    }
  }

  const remove = async (memId: string) => {
    const id = charId()
    if (!id) return
    setBusy(true)
    const res = await charsApi.deleteMemory(id, memId)
    setBusy(false)
    if (res.result && 'memories' in res.result) setMemories(res.result.memories)
    else if (res.error) toastStore.error(`Could not delete memory: ${res.error}`)
  }

  const sourceLabel = (s: CharacterMemory['source']) =>
    s === 'manual' ? 'You added' : s === 'auto' ? 'Auto' : 'Remembered'

  return (
    <div class="flex flex-col gap-3 p-2">
      <div class="text-600 text-sm">
        Things this companion remembers about you and itself. These persist across all your chats
        with them and are recalled when relevant. The character adds these on its own; you can also
        add or remove them here.
      </div>

      <Show when={chars().length > 1}>
        <CharacterSelect
          class="w-full"
          fieldName="memoryChar"
          label="Character"
          helperText="Each character in this chat keeps its own memories."
          items={chars()}
          value={selectedChar()}
          onChange={selectChar}
        />
      </Show>

      <Toggle
        fieldName="memoryDisabled"
        label="Disable long-term memory"
        helperText="Nothing said in this chat is remembered or recalled later. On by default for Events."
        value={props.chat?.memoryDisabled ?? false}
        onChange={(v) =>
          props.chat && chatStore.editChat(props.chat._id, { memoryDisabled: v }, undefined)
        }
      />

      <div class="flex items-end gap-2">
        <TextInput
          fieldName="newMemory"
          parentClass="w-full"
          placeholder="Add a memory, e.g. I'm allergic to peanuts"
          value={text()}
          onInputText={setText}
          isMultiline
        />
        <Button onClick={add} disabled={busy() || !text().trim()}>
          Add
        </Button>
      </div>

      <Show when={!loading()} fallback={<Loading />}>
        <Show
          when={memories().length}
          fallback={
            <div class="text-600 text-sm italic">
              No memories yet{selectedChar() ? ` for ${selectedChar()!.name}` : ''}.
            </div>
          }
        >
          <div class="flex flex-col gap-2">
            <For each={memories()}>
              {(mem) => (
                <div class="flex items-start justify-between gap-2 rounded-md border border-[var(--bg-700)] bg-[var(--bg-900)] p-2">
                  <div class="flex flex-col gap-1">
                    <div class="text-sm">{mem.text}</div>
                    <div class="text-500 text-xs">
                      {sourceLabel(mem.source)} · {new Date(mem.createdAt).toLocaleDateString()}
                    </div>
                  </div>
                  <Button
                    size="sm"
                    schema="red"
                    onClick={() => remove(mem._id)}
                    disabled={busy()}
                  >
                    <Trash size={14} />
                  </Button>
                </div>
              )}
            </For>
          </div>
        </Show>
      </Show>
    </div>
  )
}

export default LongTermMemory
