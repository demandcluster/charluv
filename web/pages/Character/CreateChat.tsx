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
import { AutoPreset, getPresetOptions } from '../../shared/adapter'
import { defaultPresets, isDefaultPreset } from '/common/presets'
import ServiceWarning from '/web/shared/ServiceWarning'
import { PresetSelect } from '/web/shared/PresetSelect'
import { Card } from '/web/shared/Card'
import { Toggle } from '/web/shared/Toggle'
import Divider from '/web/shared/Divider'

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
  const user = userStore((s) => ({ ...s.user }))
  const state = characterStore((s) => ({
    chars: (s.characters?.list || []).filter((c) => c.userId === user._id),
    loaded: s.characters.loaded,
  }))

  const [selectedId, setSelected] = createSignal<string>()
  const [useOverrides, setUseOverrides] = createSignal(false)

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

  const [presetId, setPresetId] = createSignal(user.defaultPreset)
  const presets = presetStore((s) => s.presets)

  const presetOptions = createMemo(() => {
    const opts = getPresetOptions(presets, { builtin: true }).filter((pre) => pre.value !== 'chat')
    return [
      { label: 'System Built-in Preset (Horde)', value: AutoPreset.service, custom: false },
    ].concat(opts)
  })

  const selectedPreset = createMemo(() => {
    const id = presetId()
    if (!id || id) return defaultPresets.horde
    if (isDefaultPreset(id)) return defaultPresets[id]
    return presets.find((pre) => pre._id === id)
  })

  const onCreate = () => {
    const character = char()
    if (!character) return

  
  const body = getStrictForm(ref, {
      name: 'string',
      greeting: 'string',
      scenario: 'string',
      sampleChat: 'string',
      schema: ['wpp', 'boostyle', 'sbf', 'text'],
      mode: ['standard', 'adventure', null],
    } as const)

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

    const overrides = useOverrides()
      ? {
          greeting: body.greeting,
          scenario: body.scenario,
          sampleChat: body.sampleChat,
          genPreset: presetId(),
          overrides: { kind: body.schema, attributes },
        }
      : {
          greeting: undefined,
          scenario: undefined,
          sampleChat: undefined,
          overrides: undefined,
        }

    if (useOverrides()) {
      overrides.greeting = body.greeting
    }

    const payload = { ...body, ...overrides, useOverrides: useOverrides(), genPreset: presetId() }
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
        <div class="mb-2 text-sm">
          Optionally modify some of the conversation context. You can override other aspects of the
          character's persona from the conversation after it is created. You can not modify Matched
          characters, only self-made or imported.
        </div>

        <div class="mb-4 text-sm">
          The information provided here is only applied to the newly created conversation.
        </div>
        <div class="flex flex-col gap-3">
          <Show when={!props.charId}>
            <Card>
              <CharacterSelect
                class="w-48"
                items={state.chars}
                value={char()}
                fieldName="character"
                label="Character"
                helperText="The conversation's main character"
                onChange={(c) => setSelected(c?._id)}
              />
            </Card>
          </Show>
          <Card>
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
          </Card>
          <Show when={!char()?.parent && char()?.name !== 'Aiva'}>
            <Card>
              <Toggle
                fieldName="useOverrides"
                value={useOverrides()}
                onChange={(use) => setUseOverrides(use)}
                label="Override Character Definitions"
                helperText="Overrides will only apply to the newly created conversation."
              />
            </Card>

            <Divider />

            <Card>
              <TextInput
                isMultiline
                fieldName="greeting"
                label="Greeting"
                value={char()?.greeting}
                class="text-xs"
                disabled={!useOverrides()}
              ></TextInput>
            </Card>

            <Card>
              <TextInput
                isMultiline
                fieldName="scenario"
                label="Scenario"
                value={char()?.scenario}
                class="text-xs"
                disabled={!useOverrides()}
              ></TextInput>
            </Card>

            <Card>
              <TextInput
                isMultiline
                fieldName="sampleChat"
                label="Sample Chat"
                value={char()?.sampleChat}
                class="text-xs"
                disabled={!useOverrides()}
              ></TextInput>
            </Card>

            <Card>
              <Show when={char()?.persona.kind !== 'text'}>
                <Select
                  class="mb-2 text-sm"
                  fieldName="schema"
                  label="Persona"
                  items={options}
                  value={char()?.persona.kind || 'wpp'}
                  disabled={!useOverrides()}
                />
              </Show>

              <Show when={char()?.persona.kind === 'text'}>
                <Select
                  class="mb-2 text-sm"
                  fieldName="schema"
                  label="Persona"
                  items={[{ label: 'Plain text', value: 'text' }]}
                  value={'text'}
                  disabled={!useOverrides()}
                />
              </Show>

              <div class="w-full text-sm">
                <Show when={char()}>
                  <PersonaAttributes
                    value={char()!.persona.attributes}
                    hideLabel
                    plainText={char()?.persona?.kind === 'text'}
                    disabled={!useOverrides()}
                  />
                </Show>
                <Show when={!char()}>
                  <For each={state.chars}>
                    {(item) => (
                      <Show when={char()?._id === item._id}>
                        <PersonaAttributes
                          value={item.persona.attributes}
                          hideLabel
                          plainText={item.persona.kind === 'text'}
                          disabled={!useOverrides()}
                        />
                      </Show>
                    )}
                  </For>
                </Show>
              </div>
            </Card>
          </Show>
        </div>
      </form>
    </Modal>
  )
}

export default CreateChatModal
