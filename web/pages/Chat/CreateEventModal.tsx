import { Component, createMemo, createSignal, For, Show } from 'solid-js'
import { useNavigate } from '@solidjs/router'
import Modal from '../../shared/Modal'
import TextInput from '../../shared/TextInput'
import Button from '../../shared/Button'
import { Toggle } from '../../shared/Toggle'
import { CharacterAvatar } from '../../shared/AvatarIcon'
import { characterStore, chatStore } from '../../store'

const WHENS = ['Morning', 'Afternoon', 'Evening', 'Late night']
const VIBES = ['Chill', 'Flirty', 'Tense', 'Chaotic', 'Formal']
// Label → stored value. Controls how often the director injects a world beat.
const DIRECTOR_EVENTS: Array<{ label: string; value: string }> = [
  { label: 'None', value: 'none' },
  { label: 'Rare', value: 'rare' },
  { label: 'Normal', value: 'normal' },
  { label: 'Regular', value: 'regular' },
]

const PillRow: Component<{
  options: string[]
  value: string
  onPick: (v: string) => void
}> = (props) => (
  <div class="flex flex-wrap gap-2">
    <For each={props.options}>
      {(opt) => (
        <button
          type="button"
          class="rounded-full px-3 py-1 text-sm"
          classList={{
            'bg-[var(--hl-500)] text-black': props.value === opt,
            'bg-700': props.value !== opt,
          }}
          onClick={() => props.onPick(opt)}
        >
          {opt}
        </button>
      )}
    </For>
  </div>
)

const CreateEventModal: Component<{ show: boolean; close: () => void }> = (props) => {
  const navigate = useNavigate()
  const state = characterStore()
  const [location, setLocation] = createSignal('')
  const [description, setDescription] = createSignal('')
  const [when, setWhen] = createSignal(WHENS[1])
  const [vibe, setVibe] = createSignal(VIBES[0])
  const [directorEvents, setDirectorEvents] = createSignal('normal')
  const [note, setNote] = createSignal('')
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
        when: when(),
        vibe: vibe(),
        directorEvents: directorEvents(),
        note: note().trim() || undefined,
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
          <div class="text-sm">When</div>
          <PillRow options={WHENS} value={when()} onPick={setWhen} />
        </div>
        <div>
          <div class="text-sm">Vibe</div>
          <PillRow options={VIBES} value={vibe()} onPick={setVibe} />
        </div>
        <div>
          <div class="text-sm">Director events</div>
          <div class="text-600 mb-1 text-xs">
            How often the director adds a scene beat (an announcement, an arrival) to drive the
            story.
          </div>
          <div class="flex flex-wrap gap-2">
            <For each={DIRECTOR_EVENTS}>
              {(opt) => (
                <button
                  type="button"
                  class="rounded-full px-3 py-1 text-sm"
                  classList={{
                    'bg-[var(--hl-500)] text-black': directorEvents() === opt.value,
                    'bg-700': directorEvents() !== opt.value,
                  }}
                  onClick={() => setDirectorEvents(opt.value)}
                >
                  {opt.label}
                </button>
              )}
            </For>
          </div>
        </div>
        <div>
          <TextInput
            fieldName="eventDirectorNote"
            label="Director's note"
            helperText="A standing instruction the director uses to steer the scene — who speaks, what beats happen. The characters never see this. Optional."
            placeholder="Keep it playful; have someone spill a drink early; nudge Mia and Jade together."
            isMultiline
            value={note()}
            onInputText={setNote}
          />
        </div>
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
                  <CharacterAvatar
                    char={c}
                    format={{ size: 'sm', corners: 'circle' }}
                    zoom={1.75}
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
