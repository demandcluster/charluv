import { useNavigate } from '@solidjs/router'
import { Check, X } from 'lucide-solid'
import { Component, createEffect, createMemo, createSignal, For, Show } from 'solid-js'
import { AppSchema } from '../../../srv/db/schema'
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
  id?: string
  char?: AppSchema.Character
}> = (props) => {
  let ref: any

  const nav = useNavigate()

  const [selectedChar, setChar] = createSignal<AppSchema.Character>()
  const state = characterStore((s) => ({
    chars: s.characters?.list || [],
    loaded: s.characters.loaded,
  }))

  const user = userStore((s) => s.user || { defaultPreset: '' })
  const presets = presetStore((s) => s.presets)

  const char = createMemo(() => {
    const curr = selectedChar() || props.char
    return curr
  })

  const presetOptions = createMemo(() =>
    getPresetOptions(presets).filter((pre) => pre.value !== 'chat')
  )

  createEffect(() => {
    if (!selectedChar() && !props.char && state.chars.length) {
      if (props.id) {
        const char = state.chars.find((ch) => ch._id === props.id)
        if (char) setChar(char)
        return
      }

      setChar(state.chars[0])
    }
  })

  const selectChar = (chr: AppSchema.Character | undefined) => {
    setChar(chr)
  }

  const onCreate = () => {
    const character = selectedChar() || props.char
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
        <Show when={!props.char}>
          <CharacterSelect
            items={state.chars}
            value={char()}
            fieldName="character"
            label="Character"
            helperText="The conversation's cxentral character"
            onChange={(c) => selectChar(c!)}
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
