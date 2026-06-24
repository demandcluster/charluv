import { Component, createMemo, createSignal, For, Show } from 'solid-js'
import { useNavigate } from '@solidjs/router'
import Modal from '../../shared/Modal'
import TextInput from '../../shared/TextInput'
import Button from '../../shared/Button'
import { Toggle } from '../../shared/Toggle'
import { characterStore, chatStore } from '../../store'

const CreateEventModal: Component<{ show: boolean; close: () => void }> = (props) => {
  const navigate = useNavigate()
  const state = characterStore()
  const [location, setLocation] = createSignal('')
  const [description, setDescription] = createSignal('')
  const [selected, setSelected] = createSignal<Record<string, boolean>>({})
  const [memoryDisabled, setMemoryDisabled] = createSignal(true)

  const chars = createMemo(() => state.characters.list)
  const ids = createMemo(() =>
    Object.entries(selected())
      .filter(([, v]) => v)
      .map(([k]) => k)
  )
  const canStart = createMemo(
    () => !!location().trim() && !!description().trim() && ids().length > 0
  )
  const toggle = (id: string) => setSelected((s) => ({ ...s, [id]: !s[id] }))

  const start = () => {
    if (!canStart()) return
    chatStore.createEvent(
      {
        location: location().trim(),
        description: description().trim(),
        characterIds: ids(),
        memoryDisabled: memoryDisabled(),
      },
      (id: string) => {
        props.close()
        navigate(`/chat/${id}`)
      }
    )
  }

  return (
    <Modal
      show={props.show}
      close={props.close}
      title="Start an Event"
      footer={
        <>
          <Button schema="secondary" onClick={props.close}>
            Cancel
          </Button>
          <Button onClick={start} disabled={!canStart()}>
            Start Event
          </Button>
        </>
      }
    >
      <div class="flex flex-col gap-3">
        <TextInput
          fieldName="eventLocation"
          label="Where"
          placeholder="nightclub"
          value={location()}
          onInputText={setLocation}
        />
        <TextInput
          fieldName="eventDescription"
          label="What's happening"
          placeholder="Saturday DJ night"
          isMultiline
          value={description()}
          onInputText={setDescription}
        />
        <div>
          <div class="text-sm">Who's invited</div>
          <div class="flex max-h-64 flex-col gap-1 overflow-auto">
            <For each={chars()}>
              {(c) => (
                <label class="bg-700 flex cursor-pointer items-center gap-2 rounded-md px-2 py-1">
                  <input
                    type="checkbox"
                    checked={!!selected()[c._id]}
                    onChange={() => toggle(c._id)}
                  />
                  <span>{c.name}</span>
                </label>
              )}
            </For>
            <Show when={!chars().length}>
              <div class="text-600 text-sm">You have no characters yet. Create one first.</div>
            </Show>
          </div>
        </div>
        <Toggle
          fieldName="eventMemoryDisabled"
          label="Disable long-term memory"
          helperText="Nothing said in this event is remembered or recalled later. On by default."
          value={memoryDisabled()}
          onChange={setMemoryDisabled}
        />
      </div>
    </Modal>
  )
}

export default CreateEventModal
