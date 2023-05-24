import { useNavigate } from '@solidjs/router'
import { Check, X } from 'lucide-solid'
import { Component, createEffect, createMemo, createSignal, For, Show } from 'solid-js'
import Button from '../../shared/Button'
import Select from '../../shared/Select'
import Modal from '../../shared/Modal'
import PersonaAttributes, { getAttributeMap } from '../../shared/PersonaAttributes'
import TextInput from '../../shared/TextInput'
import { getStrictForm } from '../../shared/util'
import { characterStore, chatStore, presetStore, userStore } from '../../store'
import CharacterSelect from '../../shared/CharacterSelect'
import { getPresetOptions } from '../../shared/adapter'

const options = [
  { value: 'wpp', label: 'W++' },
  { value: 'boostyle', label: 'Boostyle' },
  { value: 'sbf', label: 'SBF' },
]

const CreateChatModal: Component<{
  show: boolean
  close: () => void
  charId?: string
}> = (props) => {
  let ref: any

  const nav = useNavigate()
  const state = characterStore((s) => ({
    chars: s.characters?.list || [],
    loaded: s.characters.loaded,
  }))

  const [selectedId, setSelected] = createSignal<string>()

  const char = createMemo(() =>
    state.chars.find((ch) => ch._id === selectedId() || ch._id === props.charId)
  )

  createEffect(() => {
    if (props.charId) return
    const curr = selectedId()
    if (curr) return

    if (!state.chars.length) return
    setSelected(state.chars[0]._id)
  })

  const user = userStore((s) => s.user || { defaultPreset: '' })
  const presets = presetStore((s) => s.presets)

  const presetOptions = createMemo(() =>
    getPresetOptions(presets).filter((pre) => pre.value !== 'chat')
  )

  const onCreate = () => {
    const character = char()
    if (!character) return

    let body

    let attributes = getAttributeMap(ref)

    // if (user.admin) {
    //   body = getStrictForm(ref, {
    //     name: 'string',
    //     greeting: 'string',
    //     scenario: 'string',
    //     sampleChat: 'string',
    //     schema: ['wpp', 'boostyle', 'sbf', 'text'],
    //   } as const)
    //   attributes = getAttributeMap(ref)
    // } else {
    body = getStrictForm(ref, {
      name: 'string',
    } as const)
    body.scenario = character.scenario
    body.greeting = character.greeting
    body.sampleChat = character.sampleChat
    attributes = character.persona.attributes
    body.schema = character.persona.kind
    //  }
    const characterId = character._id

    const payload = { ...body, overrides: { kind: body.schema, attributes } }
    chatStore.createChat(characterId, payload, (id) => nav(`/chat/${id}`))
  }

  return (
    <Modal
      show={props.show}
      close={props.close}
      title={`Create Chat with ${char()?.name}`}
      maxWidth="half"
      footer={
        <>
          <Button schema="secondary" onClick={props.close}>
            <X />
            Close
          </Button>

          <Button onClick={onCreate} disabled={!char()}>
            <Check />
            Create
          </Button>
        </>
      }
    >
      <form ref={ref}>
        <Show when={user?.admin}>
          <div class="mb-2 text-sm">
            Optionally modify some of the conversation context. You can override other aspects of
            the character's persona from the conversation after it is created.
          </div>
        </Show>
        <div class="mb-4 text-sm">
          The information provided here is only applied to the newly created conversation.
        </div>
        <Show when={!props.charId}>
          <CharacterSelect
            class="w-48"
            items={state.chars}
            value={char()}
            fieldName="character"
            label="Character"
            helperText="The conversation's central character"
            onChange={(c) => setSelected(c?._id)}
          />
        </Show>

        <TextInput
          class="text-sm"
          fieldName="name"
          label="Conversation Name"
          helperText={
            <span>
              A name for the conversation. This is purely for labelling. <i>(Optional)</i>
            </span>
          }
          placeholder="Untitled"
        />
      </form>
    </Modal>
  )
}

export default CreateChatModal
