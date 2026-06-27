import {
  Component,
  createEffect,
  createMemo,
  createSignal,
  Match,
  onMount,
  Show,
  Switch,
} from 'solid-js'
import { MinusCircle, Plus, Save, X, Trash, WandSparkles, Dices } from '/web/icons'
import Button from '../../shared/Button'
import CreditCost from '../../shared/CreditCost'
import PageHeader from '../../shared/PageHeader'
import TextInput, { ButtonInput } from '../../shared/TextInput'
import { FormLabel } from '../../shared/FormLabel'
import FileInput, { FileInputResult } from '../../shared/FileInput'
import { characterStore, tagStore, toastStore, chatStore, settingStore } from '../../store'
import { useNavigate } from '@solidjs/router'
import Select from '../../shared/Select'
import TagInput from '../../shared/TagInput'
import { AppSchema } from '../../../common/types/schema'
import Loading from '/web/shared/Loading'
import { JSX, For } from 'solid-js'
import { Card, SolidCard, TitleCard } from '../../shared/Card'
import { usePane } from '../../shared/hooks'
import Modal, { ConfirmModal } from '/web/shared/Modal'
import { ToggleButtons } from '../../shared/Toggle'
import { CharEditor, useCharEditor } from './editor'
import { ARCHETYPES } from '/common/progression'
import { rootModalStore } from '/web/store/root-modal'
import { getAssetUrl, random } from '/web/shared/util'
import { ImageSettings } from '../Settings/Image/ImageSettings'
import { imageApi } from '/web/store/data/image'
import { Page } from '/web/Layout'
import { charsApi } from '/web/store/data/chars'
import Tooltip from '/web/shared/Tooltip'

export const CreateCharacterForm: Component<{
  chat?: AppSchema.Chat
  editId?: string
  duplicateId?: string
  children?: JSX.Element
  temp?: boolean
  noTitle?: boolean
  footer?: (children: JSX.Element) => void
  close?: () => void
  onSuccess?: (char: AppSchema.Character) => void
}> = (props) => {
  let personaRef: any
  const nav = useNavigate()

  const isPage = props.close === undefined

  const paneOrPopup = usePane()
  const cancel = () => {
    if (isPage) {
      nav('/mine')
    } else {
      props.close?.()
    }
  }
  const [forceNew, setForceNew] = createSignal<boolean>(false)

  const srcId = createMemo(() => props.editId || props.duplicateId || '')
  const [image, setImage] = createSignal<string | undefined>()

  const editor = useCharEditor()

  const tagState = tagStore()
  const state = characterStore((s) => {
    const edit = s.editing

    return {
      status: s.hordeStatus,
      avatar: s.generate,
      creating: s.creating,
      edit: forceNew() ? undefined : edit,
      list: s.characters.list,
      loaded: s.characters.loaded,
    }
  })

  const [imgUrl, setImageUrl] = createSignal<string>()

  const [tokens, setTokens] = createSignal({
    name: 0,
    scenario: 0,
    greeting: 0,
    persona: 0,
    sample: 0,
  })

  const totalTokens = createMemo(() => {
    const t = tokens()
    return t.name + t.persona + t.sample + t.scenario
  })

  const totalPermanentTokens = createMemo(() => {
    const t = tokens()
    return t.name + t.persona + t.scenario
  })

  onMount(async () => {
    characterStore.clearGeneratedAvatar()
    characterStore.clearCharacter()

    if (srcId()) {
      characterStore.getCharacter(srcId(), props.chat)
    }
  })

  createEffect(() => {
    if (!personaRef) return

    // We know we're waiting for a character to edit, so let's just wait
    if (!state.edit && srcId()) return

    // If this is our first pass: load something no matter what
    if (!editor.original()) {
      if (!srcId()) {
        // editor.reset(ref)
        return
      }

      // We have a `srcId`, we need to wait to receive the character we're editing
      if (!state.edit) return

      editor.load(state.edit)
      setImage(state.edit?.avatar)
      return
    }

    // This is a subsequent pass - we already have state
    // We want to avoid unnecessarily clearing/reseting state due to a websocket reconnect

    if (!state.edit) return
    if (editor.state.editId !== state.edit._id && state.edit._id === srcId()) {
      editor.update('editId', srcId())
      editor.load(state.edit)
      setImage(state.edit?.avatar)
      return
    }
  })

  createEffect(() => {
    tagStore.updateTags(state.list)
    props.footer?.(footer)
  })

  const onSubmit = async (ev: Event) => {
    const payload = editor.payload(true) as any

    if (props.temp && props.chat) {
      if (editor.state.avatar) {
        const data = await imageApi.getImageData(editor.state.avatar)
        payload.avatar = data
      }
      chatStore.upsertTempCharacter(props.chat._id, { ...payload, _id: props.editId }, (result) => {
        props.onSuccess?.(result)
        if (paneOrPopup() === 'popup') props.close?.()
      })
    } else if (!forceNew() && props.editId) {
      characterStore.editFullCharacter(props.editId, payload, () => {
        // This chat froze the character's definition in chat.overrides (the old
        // per-chat override feature, whose "Edit Chat → disable" UI was removed).
        // Clear it so this edit — and future edits — apply to the chat. Skip
        // event chats: they reuse chat.overrides as the event scenario carrier.
        if (
          props.chat?.overrides &&
          props.chat.characterId === props.editId &&
          props.chat.mode !== 'event'
        ) {
          chatStore.editChat(props.chat._id, {}, false)
        }
        if (isPage) {
          nav(`/character/${props.editId}/chats`)
        } else if (paneOrPopup() === 'popup') {
          props.close?.()
        }
      })
    } else {
      characterStore.createCharacter(payload, (result) => {
        setForceNew(false)
        if (isPage) nav(`/character/${result._id}/chats`)
      })
    }
  }

  const footer = (
    <>
      <Button onClick={cancel} schema="secondary">
        <X />
        {props.close ? 'Close' : 'Cancel'}
      </Button>
      <Button onClick={onSubmit} disabled={state.creating}>
        <Save />
        {props.editId && !forceNew() ? 'Update' : 'Create'}
        <CreditCost amount={props.editId && !forceNew() ? 30 : 100} class="ml-1" />
      </Button>
    </>
  )

  return (
    <Page>
      <Show when={!props.noTitle && (isPage || paneOrPopup() === 'pane')}>
        <PageHeader
          title={`${
            forceNew() ? 'Create' : props.editId ? 'Edit' : props.duplicateId ? 'Copy' : 'Create'
          } a Character`}
          subtitle={
            <>
              <div class="whitespace-normal">
                <em>
                  {totalTokens()} tokens, {totalPermanentTokens()} permanent
                </em>
              </div>
            </>
          }
        />
      </Show>
      <form
        class="relative text-base"
        onSubmit={onSubmit}
        id="character-form"
        ref={(form) => {
          personaRef = form
          editor.prepare(form)
        }}
      >
        <div class="flex flex-col gap-4">
          <Show when={!isPage}>
            <div> {props.children} </div>
          </Show>

          <div class={`flex grow flex-col justify-between gap-2 pl-2 pr-3 `}>
            <Show when={!isPage && paneOrPopup() === 'popup'}>
              <div>
                <em>
                  ({totalTokens()} tokens, {totalPermanentTokens()} permanent)
                </em>
              </div>
            </Show>

            <Show when={props.temp}>
              <TitleCard type="premium">
                You are {props.editId ? 'editing' : 'creating'} a temporary character. A temporary
                character exist within your current chat only.
              </TitleCard>
            </Show>

            <div class="flex flex-col gap-2">
              <Card>
                <ButtonInput
                  fieldName="name"
                  required
                  label="Character Name"
                  placeholder=""
                  value={editor.state.name}
                  parentClass="pb-2"
                >
                  <Button
                    size="sm"
                    schema="input"
                    onClick={() => random('first', {}).then((name) => editor.update('name', name))}
                  >
                    <Dices size={12} />
                  </Button>
                </ButtonInput>

                <FormLabel
                  label="Description / Creator's notes"
                  helperText={
                    <div class="flex flex-col">
                      <span>
                        A description, label, or notes for your character. This is will not
                        influence your character in any way.
                      </span>
                    </div>
                  }
                />

                <div class="flex w-full flex-col gap-2">
                  <TextInput
                    isMultiline
                    fieldName="description"
                    parentClass="w-full"
                    value={editor.state.description}
                  />
                </div>
              </Card>

              <Card>
                <TagInput
                  availableTags={tagState.tags.map((t) => t.tag)}
                  value={editor.state.tags}
                  fieldName="_tags"
                  label="Tags"
                  helperText="Used to help you organize and filter your characters."
                  onSelect={(tags) => editor.update({ tags })}
                />
              </Card>

              <Card class="flex w-full flex-col gap-2">
                <TextInput
                  isMultiline
                  parentClass="w-full"
                  fieldName="appearance"
                  label={
                    <>
                      Appearance{' '}
                      <Regenerate
                        field={'appearance'}
                        editor={editor}
                        allowed={editor.canGuidance}
                      />
                    </>
                  }
                  helperText="Describes how your character looks. This drives image generation for the cover and gallery."
                  placeholder="Appearance Prompt (used for Image Generation)"
                  value={editor.state.appearance}
                />
              </Card>

              <Card class="flex flex-col gap-1">
                <div class="flex items-center justify-between gap-2">
                  <FormLabel
                    label="Base look seed"
                    helperText="Locks this character's look so generated images stay consistent. (Chat images ignore it.)"
                  />
                  <Button size="sm" schema="secondary" onClick={() => editor.rerollSeed()}>
                    <Dices size={14} /> Reroll
                  </Button>
                </div>
                <div class="text-600 text-xs">
                  Seed <span class="font-mono">{editor.state.imageSeed}</span> — rerolling changes
                  your character's base appearance. Only reroll if the look isn't what you wanted;
                  already-saved images are unaffected.
                </div>
              </Card>

              <CharacterGallery
                editor={editor}
                charId={props.editId}
                initial={state.edit?.gallery}
                avatarUrl={editor.avatar() || image()}
                avatarLoading={state.avatar.loading}
                onCoverChange={(url) => {
                  setImage(url)
                  editor.applyCover(url)
                }}
              />

              <Card>
                <TextInput
                  fieldName="scenario"
                  label={
                    <>
                      <Regenerate field={'scenario'} editor={editor} allowed={editor.canGuidance} />
                      Scenario{' '}
                    </>
                  }
                  helperText="The current circumstances and context of the conversation and the characters."
                  placeholder="E.g. {{char}} is in their office working. {{user}} opens the door and walks in."
                  value={editor.state.scenario}
                  isMultiline
                  tokenCount={(v) => setTokens((prev) => ({ ...prev, scenario: v }))}
                />
              </Card>

              <Card class="flex flex-col gap-3">
                <FormLabel
                  label="Relationship & Discovery"
                  helperText="How this companion appears in Discover and how the relationship progresses. Progression injects the LEVEL(stage) the model is trained on."
                />
                <Select
                  fieldName="progression"
                  label="Progression archetype"
                  items={[
                    { label: 'None (fixed)', value: '' },
                    ...ARCHETYPES.map((a) => ({
                      label: `${a.label} — ${a.description}`,
                      value: a.id,
                    })),
                  ]}
                  value={editor.state.archetype ?? ''}
                  onChange={(opt) => editor.update('archetype', opt.value)}
                />
                <Select
                  fieldName="progressionSpeed"
                  label="Progression speed"
                  helperText="How fast the relationship advances (XP gained per message)."
                  items={[
                    { label: 'Slow', value: 'slow' },
                    { label: 'Normal', value: 'normal' },
                    { label: 'Fast', value: 'fast' },
                  ]}
                  value={editor.state.progressionSpeed ?? 'normal'}
                  onChange={(opt) => editor.update('progressionSpeed', opt.value)}
                />
                <div class="flex flex-wrap gap-3">
                  <Select
                    fieldName="gender"
                    label="Gender"
                    items={[
                      { label: 'Unset', value: '' },
                      { label: 'Female', value: 'female' },
                      { label: 'Male', value: 'male' },
                      { label: 'Trans', value: 'trans' },
                    ]}
                    value={editor.state.gender ?? ''}
                    onChange={(opt) => editor.update('gender', opt.value || undefined)}
                  />
                  <Select
                    fieldName="artStyle"
                    label="Art style"
                    items={[
                      { label: 'Unset', value: '' },
                      { label: 'Realistic', value: 'realistic' },
                      { label: 'Anime', value: 'anime' },
                    ]}
                    value={editor.state.artStyle ?? ''}
                    onChange={(opt) => editor.update('artStyle', opt.value || undefined)}
                  />
                  <Select
                    fieldName="ageRange"
                    label="Age"
                    items={[
                      { label: 'Unset', value: '' },
                      { label: '18–21', value: '18-21' },
                      { label: '22–29', value: '22-29' },
                      { label: '30–39', value: '30-39' },
                      { label: '40+', value: '40+' },
                    ]}
                    value={editor.state.ageRange ?? ''}
                    onChange={(opt) => editor.update('ageRange', opt.value || undefined)}
                  />
                  <Select
                    fieldName="category"
                    label="Category"
                    items={[
                      { label: 'Unset', value: '' },
                      { label: 'Romantic', value: 'Romantic' },
                      { label: 'Playful', value: 'Playful' },
                      { label: 'Casual', value: 'Casual' },
                      { label: 'Submissive', value: 'Submissive' },
                      { label: 'Dominant', value: 'Dominant' },
                      { label: 'Fantasy', value: 'Fantasy' },
                    ]}
                    value={editor.state.categoryValue ?? ''}
                    onChange={(opt) => editor.update('categoryValue', opt.value)}
                  />
                </div>
                <ToggleButtons
                  items={[
                    { value: 'false', label: 'SFW' },
                    { value: 'true', label: 'NSFW (18+)' },
                  ]}
                  onChange={(opt) => editor.update('nsfw', opt.value === 'true')}
                  selected={String(editor.state.nsfw ?? false)}
                />
              </Card>

              <Card class="flex flex-col gap-3">
                <FormLabel
                  label="Personality & Traits"
                  helperText="The core traits that define your character (saved as the W++ persona). Gender, Appearance and Art style are set in the cards above."
                />
                <TextInput
                  isMultiline
                  fieldName="traitDescription"
                  label="Description"
                  placeholder="The main description of who your character is, how they act, their situation and quirks."
                  value={editor.state.traitDescription ?? ''}
                  onChange={(ev) => editor.update('traitDescription', ev.currentTarget.value)}
                  tokenCount={(v) => setTokens((prev) => ({ ...prev, persona: v }))}
                />
                <TextInput
                  isMultiline
                  fieldName="traitPersonality"
                  label="Personality"
                  placeholder="e.g. shy, caring, introspective, sensitive, reserved, kind"
                  value={editor.state.traitPersonality ?? ''}
                  onChange={(ev) => editor.update('traitPersonality', ev.currentTarget.value)}
                />
                <TextInput
                  isMultiline
                  fieldName="traitMind"
                  label="Mind"
                  placeholder="How your character thinks, their worldview, intelligence, quirks"
                  value={editor.state.traitMind ?? ''}
                  onChange={(ev) => editor.update('traitMind', ev.currentTarget.value)}
                />
                <div class="flex flex-wrap gap-3">
                  <TextInput
                    parentClass="grow"
                    fieldName="traitSpecies"
                    label="Species"
                    placeholder="e.g. human"
                    value={editor.state.traitSpecies ?? ''}
                    onChange={(ev) => editor.update('traitSpecies', ev.currentTarget.value)}
                  />
                  <TextInput
                    parentClass="grow"
                    fieldName="traitAge"
                    label="Age"
                    placeholder="e.g. 18 years old"
                    value={editor.state.traitAge ?? ''}
                    onChange={(ev) => editor.update('traitAge', ev.currentTarget.value)}
                  />
                </div>
                <div class="flex flex-wrap gap-3">
                  <TextInput
                    parentClass="grow"
                    fieldName="traitJob"
                    label="Job"
                    placeholder="e.g. babysitter"
                    value={editor.state.traitJob ?? ''}
                    onChange={(ev) => editor.update('traitJob', ev.currentTarget.value)}
                  />
                  <TextInput
                    parentClass="grow"
                    fieldName="traitZodiac"
                    label="Zodiac"
                    placeholder="e.g. virgo"
                    value={editor.state.traitZodiac ?? ''}
                    onChange={(ev) => editor.update('traitZodiac', ev.currentTarget.value)}
                  />
                </div>
                <TextInput
                  fieldName="traitSexuality"
                  label="Sexuality"
                  placeholder="e.g. heterosexual, straight"
                  value={editor.state.traitSexuality ?? ''}
                  onChange={(ev) => editor.update('traitSexuality', ev.currentTarget.value)}
                />
                <TextInput
                  fieldName="traitLikes"
                  label="Likes"
                  placeholder="e.g. drawing, playing with her cat"
                  value={editor.state.traitLikes ?? ''}
                  onChange={(ev) => editor.update('traitLikes', ev.currentTarget.value)}
                />
                <TextInput
                  fieldName="traitLoves"
                  label="Loves"
                  placeholder="e.g. her cat Fluffy, rainy afternoons"
                  value={editor.state.traitLoves ?? ''}
                  onChange={(ev) => editor.update('traitLoves', ev.currentTarget.value)}
                />
                <TextInput
                  fieldName="traitHates"
                  label="Hates"
                  placeholder="e.g. rude people, loud noises"
                  value={editor.state.traitHates ?? ''}
                  onChange={(ev) => editor.update('traitHates', ev.currentTarget.value)}
                />
                <div class="flex flex-wrap gap-3">
                  <TextInput
                    parentClass="grow"
                    fieldName="traitCountry"
                    label="Country"
                    placeholder="e.g. England"
                    value={editor.state.traitCountry ?? ''}
                    onChange={(ev) => editor.update('traitCountry', ev.currentTarget.value)}
                  />
                  <TextInput
                    parentClass="grow"
                    fieldName="traitBody"
                    label="Body"
                    placeholder="e.g. slim, 5'2&quot;, petite"
                    value={editor.state.traitBody ?? ''}
                    onChange={(ev) => editor.update('traitBody', ev.currentTarget.value)}
                  />
                </div>

                <Show when={Object.keys(editor.state.personaExtras ?? {}).length > 0}>
                  <SolidCard type="bg" class="border-[1px] border-[var(--orange-600)] text-sm">
                    <div class="font-bold text-[var(--orange-500)]">
                      Extra attributes (will be removed on save)
                    </div>
                    <div class="text-600 mb-2">
                      This character has non-standard W++ attributes that aren't part of the trait
                      set. They're shown here for reference only and will be dropped the next time
                      you save.
                    </div>
                    <div class="flex flex-col gap-1">
                      <For each={Object.entries(editor.state.personaExtras ?? {})}>
                        {([key, values]) => (
                          <div class="flex gap-2">
                            <span class="font-mono font-bold">{key}:</span>
                            <span class="text-700">{(values as string[]).join(', ')}</span>
                          </div>
                        )}
                      </For>
                    </div>
                  </SolidCard>
                </Show>
              </Card>
              <Card class="flex flex-col gap-3">
                <TextInput
                  isMultiline
                  fieldName="greeting"
                  label={
                    <>
                      <Regenerate field={'greeting'} editor={editor} allowed={editor.canGuidance} />
                      Greeting{' '}
                    </>
                  }
                  helperText="The first message from your character. It is recommended to provide a lengthy first message to encourage the character to give longer responses."
                  placeholder={
                    "E.g. *I smile as you walk into the room* Hello, {{user}}! I can't believe it's lunch time already! Where are we going?"
                  }
                  value={editor.state.greeting}
                  class="h-60"
                  tokenCount={(v) => setTokens((prev) => ({ ...prev, greeting: v }))}
                />
                <AlternateGreetingsInput
                  greetings={editor.state.alternateGreetings}
                  setGreetings={(next) => editor.update({ alternateGreetings: next })}
                />
              </Card>
              <Card>
                <TextInput
                  isMultiline
                  fieldName="sampleChat"
                  label={
                    <>
                      <Regenerate
                        field={'sampleChat'}
                        editor={editor}
                        allowed={editor.canGuidance}
                      />
                      Sample Conversation{' '}
                    </>
                  }
                  helperText={
                    <span>
                      Example chat between you and the character. This section is very important for
                      teaching your character should speak.
                    </span>
                  }
                  placeholder="{{char}}: *smiles and waves back* Hello! I'm so happy you're here!"
                  value={editor.state.sampleChat}
                  tokenCount={(v) => setTokens((prev) => ({ ...prev, sample: v }))}
                />
              </Card>
            </div>

            {/* Image generation settings are no longer user-editable here, but the
                form fields are required by the editor payload. Keep them mounted
                (hidden) so existing values pass through on save. */}
            <div class="hidden">
              <ImageSettings cfg={editor.state.imageSettings} inherit />
            </div>

            <Show when={!props.close}>
              <div class="flex w-full justify-end gap-2">{footer}</div>
            </Show>
          </div>
        </div>
      </form>
      <AvatarModal url={imgUrl()} close={() => setImageUrl('')} />
    </Page>
  )
}

const Regenerate: Component<{
  field: string
  trait?: string
  editor: CharEditor
  allowed: boolean
  class?: string
}> = (props) => {
  return (
    <Tooltip
      tip="Name and description must be filled"
      position="right"
      disable={props.editor.canGenerate()}
    >
      <Switch>
        <Match when={!props.allowed}>{null}</Match>

        <Match when={props.allowed}>
          <Button
            size="sm"
            class={`inline-block ${props.class || ''}`}
            onClick={() => {
              if (!props.editor.canGenerate()) {
                toastStore.warn(`Fill in the Name and Description to generate`)
                return
              }
              props.editor.generateField(props.field, props.trait)
            }}
            disabled={props.editor.generating()}
          >
            <WandSparkles size={16} />
          </Button>
        </Match>
      </Switch>
    </Tooltip>
  )
}

const AvatarModal: Component<{ url?: string; close: () => void }> = (props) => {
  rootModalStore.addModal({
    id: 'char-avatar-modal',
    element: (
      <Modal show={!!props.url} close={props.close} maxWidth="half" fixedHeight>
        <div class="flex justify-center p-4">
          <img class="rounded-md" src={getAssetUrl(props.url!)} />
        </div>
      </Modal>
    ),
  })

  return null
}

const AlternateGreetingsInput: Component<{
  greetings: string[]
  setGreetings: (next: string[]) => void
}> = (props) => {
  const addGreeting = () => props.setGreetings([...props.greetings, ''])
  const removeGreeting = (i: number) => {
    return props.setGreetings(props.greetings.slice(0, i).concat(props.greetings.slice(i + 1)))
  }

  const onChange = (ev: { currentTarget: HTMLInputElement | HTMLTextAreaElement }, i: number) => {
    props.setGreetings(
      props.greetings.map((orig, j) => (j === i ? ev.currentTarget?.value ?? '' : orig))
    )
  }

  return (
    <>
      <For each={props.greetings}>
        {(altGreeting, i) => (
          <div class="flex gap-2">
            <TextInput
              isMultiline
              fieldName={`alternateGreeting${i() + 1}`}
              placeholder="An alternate greeting for your character"
              value={altGreeting}
              onChange={(ev) => onChange(ev, i())}
              parentClass="w-full"
            />
            <div class="1/12 flex items-center" onClick={() => removeGreeting(i())}>
              <MinusCircle size={16} class="focusable-icon-button" />
            </div>
          </div>
        )}
      </For>
      <div>
        <Button onClick={addGreeting}>
          <Plus size={16} />
          Add Alternate Greeting
        </Button>
      </div>
    </>
  )
}

const GALLERY_MAX = 10
const LORA_MAX = 4

const CharacterGallery: Component<{
  editor: CharEditor
  charId?: string
  initial?: string[]
  /** The current cover/avatar — a stored asset URL or a freshly generated/
   * uploaded data url. Rendered as the first ("Cover") tile. */
  avatarUrl?: string
  avatarLoading?: boolean
  /** Called when the cover changes (Make cover) so the parent can update its
   * displayed avatar. */
  onCoverChange?: (url: string) => void
}> = (props) => {
  const [gallery, setGallery] = createSignal<string[]>(props.initial || [])
  const [selected, setSelected] = createSignal<string[]>([])

  // The character (and its saved gallery) loads async after the editor mounts,
  // so re-seed when props.initial arrives/changes. Local add/remove update the
  // signal directly and don't touch props.initial, so they're preserved.
  createEffect(() => setGallery(props.initial || []))
  const [busy, setBusy] = createSignal(false)
  // Gallery generation shares the global avatar `generate.loading` flag, which
  // would otherwise spin the cover tile. Track it separately so the spinner
  // lands in its own reserved tile instead of the main cover/profile slot.
  const [genLoading, setGenLoading] = createSignal(false)
  // Derive from the editor state (the source of truth) rather than snapshotting
  // it once — on edit the character hydrates asynchronously after this component
  // mounts, so a one-time signal would miss an existing LoRA and hide the delete.
  const loraName = () => props.editor.state.loraName || ''
  const [confirmDeleteLora, setConfirmDeleteLora] = createSignal(false)

  const full = () => gallery().length >= GALLERY_MAX
  const isSelected = (url: string) => selected().includes(url)

  const toggleSelected = (url: string) => {
    if (!url) return
    if (isSelected(url)) {
      setSelected(selected().filter((u) => u !== url))
      return
    }
    if (selected().length >= LORA_MAX) {
      toastStore.warn(`Pick at most ${LORA_MAX} images for the LoRA`)
      return
    }
    setSelected([...selected(), url])
  }

  const makeCover = async (url: string) => {
    if (!props.charId) {
      toastStore.warn('Save the character first to set a cover')
      return
    }
    setBusy(true)
    const res = await charsApi.setCover(props.charId, url)
    setBusy(false)
    if (res.result && 'avatar' in res.result) {
      props.onCoverChange?.(res.result.avatar)
      toastStore.success('Cover updated')
    } else if (res.error) {
      toastStore.error(`Could not set cover: ${res.error}`)
    }
  }

  const add = async (base64?: string) => {
    if (!props.charId) {
      toastStore.warn('Save the character first to build its gallery')
      return
    }
    if (!base64) return
    if (full()) {
      toastStore.warn(`Gallery is full (max ${GALLERY_MAX} images)`)
      return
    }

    setBusy(true)
    const res = await charsApi.addGalleryImage(props.charId, base64)
    setBusy(false)
    if (res.result && 'gallery' in res.result) setGallery(res.result.gallery)
    else if (res.error) toastStore.error(`Could not add image: ${res.error}`)
  }

  const generate = async () => {
    setBusy(true)
    setGenLoading(true)
    // createGalleryImage generates WITHOUT replacing the character's avatar.
    const base64 = await props.editor.createGalleryImage().catch(() => undefined)
    const before = gallery()
    await add(base64 || undefined)
    setGenLoading(false)
    setBusy(false)
    // Gallery thumbnails are small and have no large view here, so pop the
    // freshly generated image in the lightbox once so it can be inspected.
    const fresh = gallery().find((u) => !before.includes(u))
    if (fresh) settingStore.showImage(getAssetUrl(fresh))
  }

  const upload = async (files: FileInputResult[]) => {
    const file = files[0]?.file
    if (!file) return
    const base64 = await imageApi.getImageData(file)
    await add(base64)
  }

  const remove = async (url: string) => {
    if (!props.charId) return
    setSelected(selected().filter((u) => u !== url))
    setBusy(true)
    const res = await charsApi.removeGalleryImage(props.charId, url)
    setBusy(false)
    if (res.result && 'gallery' in res.result) setGallery(res.result.gallery)
  }

  const buildLora = async () => {
    if (!props.charId) return
    const picks = selected()
    if (!picks.length) {
      toastStore.warn('Select 1-4 images for the LoRA')
      return
    }

    setBusy(true)
    // Send the stored gallery URLs; the server resolves them to base64
    // (browsers can't fetch the cross-origin CDN assets — CORS).
    const res = await charsApi.encodeLora(props.charId, picks)
    setBusy(false)
    if (res.result && 'loraName' in res.result) {
      props.editor.update('loraName', res.result.loraName)
      toastStore.success(`LoRA built: ${res.result.loraName}`)
    } else if (res.error) {
      toastStore.error(`Could not build LoRA: ${res.error}`)
    }
  }

  const deleteLora = async () => {
    if (!props.charId || !loraName()) return
    setBusy(true)
    const res = await charsApi.deleteLora(props.charId)
    setBusy(false)
    if (res.error) {
      toastStore.error(`Could not delete LoRA: ${res.error}`)
      return
    }
    props.editor.update('loraName', undefined)
    toastStore.success('LoRA deleted')
  }

  const tileClass = (url: string) => `relative h-24 w-24 shrink-0 cursor-pointer rounded-md`

  const selectionBadge = (url: string) => (
    <Show when={isSelected(url)}>
      <div class="absolute left-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-[var(--hl-500)] text-xs font-bold text-white">
        {selected().indexOf(url) + 1}
      </div>
    </Show>
  )

  return (
    <Card class="flex flex-col gap-3">
      <FormLabel
        label="Images"
        helperText={`The first tile is the cover (avatar). Add up to ${GALLERY_MAX} more images of the same character. Click any image (including the cover) to pick up to ${LORA_MAX} (3-4 recommended) as the reference set for the character's image LoRA.`}
      />

      <Show when={!props.charId}>
        <div class="text-600 text-sm italic">
          You can set a cover below. Save the character first to add gallery images and build a
          LoRA.
        </div>
      </Show>

      <div class="flex flex-wrap gap-2">
        {/* Cover / avatar tile — always first, click-to-select, not removable.
            Only spin for an actual cover regeneration, not gallery generation
            (which shares the global loading flag but gets its own tile below). */}
        <Show
          when={!props.avatarLoading || genLoading()}
          fallback={
            <div class="flex h-24 w-24 shrink-0 flex-col items-center justify-center rounded-md border border-[var(--bg-700)]">
              <Loading type="windmill" />
            </div>
          }
        >
          <Show
            when={props.avatarUrl}
            fallback={
              <div class="flex h-24 w-24 shrink-0 items-center justify-center rounded-md border border-[var(--bg-700)] text-center text-xs text-[var(--text-600)]">
                No cover yet
              </div>
            }
          >
            <div
              class={tileClass(props.avatarUrl!)}
              classList={{ 'ring-2 ring-[var(--hl-500)]': isSelected(props.avatarUrl!) }}
              onClick={() => toggleSelected(props.avatarUrl!)}
              title={
                isSelected(props.avatarUrl!) ? 'Selected for LoRA' : 'Click to select for LoRA'
              }
            >
              <img src={getAssetUrl(props.avatarUrl!)} class="h-24 w-24 rounded-md object-cover" />
              {selectionBadge(props.avatarUrl!)}
              <div class="absolute bottom-1 left-1 rounded bg-[var(--hl-700)] px-1 text-[10px] font-bold text-white">
                Cover
              </div>
            </div>
          </Show>
        </Show>

        {/* Gallery tiles — removable + can be promoted to cover. */}
        <For each={gallery()}>
          {(url) => (
            <div
              class={tileClass(url)}
              classList={{ 'ring-2 ring-[var(--hl-500)]': isSelected(url) }}
              onClick={() => toggleSelected(url)}
              title={isSelected(url) ? 'Selected for LoRA' : 'Click to select for LoRA'}
            >
              <img src={getAssetUrl(url)} class="h-24 w-24 rounded-md object-cover" />
              {selectionBadge(url)}
              <Button
                size="pill"
                schema="red"
                class="absolute right-1 top-1"
                onClick={(ev) => {
                  ev.stopPropagation()
                  remove(url)
                }}
                disabled={busy()}
              >
                <Trash size={12} />
              </Button>
              <Button
                size="pill"
                class="absolute bottom-1 left-1"
                onClick={(ev) => {
                  ev.stopPropagation()
                  makeCover(url)
                }}
                disabled={busy()}
              >
                Make cover
              </Button>
            </div>
          )}
        </For>

        {/* Reserved generation tile — spinner lives here, never on the cover. */}
        <Show when={genLoading()}>
          <div class="flex h-24 w-24 shrink-0 flex-col items-center justify-center rounded-md border border-dashed border-[var(--bg-700)]">
            <Loading type="windmill" />
          </div>
        </Show>
      </div>

      <div class="flex flex-wrap items-center gap-2">
        <Button size="sm" onClick={generate} disabled={busy() || full() || !props.charId}>
          Generate <CreditCost amount={25} class="ml-1" />
        </Button>
        <FileInput
          fieldName="galleryUpload"
          accept="image/png,image/jpeg,image/webp"
          onUpdate={upload}
        />
        <Button
          size="sm"
          schema="success"
          onClick={buildLora}
          disabled={busy() || !selected().length || !props.charId}
        >
          Build LoRA ({selected().length}/{LORA_MAX}) <CreditCost amount={300} class="ml-1" />
        </Button>
        <span class="text-600 text-sm">
          {gallery().length}/{GALLERY_MAX} images · {selected().length}/{LORA_MAX} picked
        </span>
      </div>

      <Show when={props.charId}>
        <div class="text-600 text-xs italic">
          Generate uses the Appearance prompt with the locked seed, so the same prompt produces the
          same image. Tweak the Appearance prompt (pose, outfit, setting, expression) between
          generations to get varied reference shots — keep the core looks the same for a consistent
          LoRA.
        </div>
      </Show>

      <Show when={!props.charId}>
        <div class="text-600 text-sm italic">
          Save the character first to generate, upload, or build a LoRA.
        </div>
      </Show>

      <Show when={props.charId && loraName()}>
        <div class="text-600 flex items-center gap-3 text-sm">
          <span>
            Current LoRA: <span class="text-700 font-mono">{loraName()}</span>
          </span>
          <Button
            schema="red"
            size="sm"
            onClick={() => setConfirmDeleteLora(true)}
            disabled={busy()}
          >
            <Trash size={14} /> Delete LoRA
          </Button>
        </div>
      </Show>

      <ConfirmModal
        show={confirmDeleteLora()}
        close={() => setConfirmDeleteLora(false)}
        confirm={deleteLora}
        message={
          "Delete this character's image LoRA?\n\nGenerated images will no longer keep a consistent appearance, and rebuilding a LoRA costs 300 credits. This can't be undone."
        }
      />
    </Card>
  )
}
