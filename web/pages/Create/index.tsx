import { Component, For, Show, createEffect, createMemo, createSignal, onMount } from 'solid-js'
import { createStore } from 'solid-js/store'
import { A, useNavigate } from '@solidjs/router'
import {
  ChevronLeft,
  ChevronRight,
  Contact,
  Dices,
  FileText,
  Heart,
  Image as ImageIcon,
  Pencil,
  PersonStanding,
  RotateCcw,
  Smile,
  Sparkles,
  Upload,
  User,
} from '/web/icons'
import './create.css'
import { characterStore, chatStore, toastStore, userStore } from '../../store'
import { charsApi } from '../../store/data/chars'
import { getStoredValue, setStoredValue } from '../../shared/hooks'
import { imageApi } from '../../store/data/image'
import { genApi } from '../../store/data/inference'
import { defaultPresets } from '/common/presets'
import FileInput, { FileInputResult } from '../../shared/FileInput'
import ImportCharacterModal from '../Character/ImportCharacter'
import { getAssetUrl, random } from '../../shared/util'
import { DEFAULT_ARCHETYPE_ID } from '/common/progression'
import { AppSchema } from '/common/types'
import { NewCharacter } from '../../store/character'

/* ---------------------------------------------------------------- types */

type ArtStyle = 'realistic' | 'anime'

/** An image-card option. `slug` keys the preview asset; `label` is what we store/show. */
type ImgOption = {
  slug: string
  label: string
}

const CUSTOM = '__custom__'

/* ---------------------------------------------------------------- options */

const GENDERS: ImgOption[] = [
  { slug: 'female', label: 'Female' },
  { slug: 'male', label: 'Male' },
  { slug: 'trans', label: 'Trans' },
]

const STYLES: ImgOption[] = [
  { slug: 'realistic', label: 'Realistic' },
  { slug: 'anime', label: 'Anime' },
]

const AGES = ['18-21', '22-29', '30-39', '40+']

const ETHNICITIES: ImgOption[] = [
  { slug: 'asian', label: 'Asian' },
  { slug: 'black', label: 'Black' },
  { slug: 'white', label: 'White' },
  { slug: 'latina', label: 'Latina' },
  { slug: 'arab', label: 'Arab' },
  { slug: 'indian', label: 'Indian' },
  { slug: 'elf', label: 'Elf' },
  { slug: 'alien', label: 'Alien' },
  { slug: 'demon', label: 'Demon' },
]

/** Ethnicities that resolve to a non-human species. */
const NON_HUMAN = new Set(['elf', 'alien', 'demon'])

const HAIR_STYLES: ImgOption[] = [
  { slug: 'braided', label: 'Braided' },
  { slug: 'long', label: 'Long' },
  { slug: 'bangs', label: 'Bangs' },
  { slug: 'ponytail', label: 'Ponytail' },
  { slug: 'short', label: 'Short' },
  { slug: 'bun', label: 'Bun' },
  { slug: 'buns', label: 'Buns' },
  { slug: 'wavy', label: 'Wavy' },
  { slug: 'pixie', label: 'Pixie' },
]

const BODIES: ImgOption[] = [
  { slug: 'slim', label: 'Slim' },
  { slug: 'athletic', label: 'Athletic' },
  { slug: 'voluptuous', label: 'Voluptuous' },
  { slug: 'curvy', label: 'Curvy' },
  { slug: 'muscular', label: 'Muscular' },
]

const BREASTS: ImgOption[] = [
  { slug: 'flat', label: 'Flat' },
  { slug: 'small', label: 'Small' },
  { slug: 'average', label: 'Average' },
  { slug: 'large', label: 'Large' },
  { slug: 'xl', label: 'XL' },
]

const BUTTS: ImgOption[] = [
  { slug: 'small', label: 'Small' },
  { slug: 'average', label: 'Average' },
  { slug: 'large', label: 'Large' },
  { slug: 'xl', label: 'XL' },
]

type Swatch = { label: string; color: string }

const SKIN_TONES: Swatch[] = [
  { label: 'Fair', color: '#f2d6c2' },
  { label: 'Light', color: '#e8c0a0' },
  { label: 'Medium', color: '#cda07a' },
  { label: 'Tan', color: '#b07d56' },
  { label: 'Brown', color: '#8a5a3b' },
  { label: 'Dark', color: '#5c3a26' },
]

const HAIR_COLORS: Swatch[] = [
  { label: 'Black', color: '#1c1c1c' },
  { label: 'Brown', color: '#5a3a22' },
  { label: 'Blonde', color: '#e6c878' },
  { label: 'Red', color: '#a23a22' },
  { label: 'Pink', color: '#e87ab0' },
  { label: 'White', color: '#ededed' },
  { label: 'Blue', color: '#5a7ad6' },
]

const EYE_COLORS: Swatch[] = [
  { label: 'Brown', color: '#5a3a22' },
  { label: 'Blue', color: '#4a78c8' },
  { label: 'Green', color: '#3f9d5a' },
  { label: 'Hazel', color: '#9a7b3f' },
  { label: 'Grey', color: '#8a8f96' },
  { label: 'Red', color: '#b03a3a' },
  { label: 'Yellow', color: '#d6c24a' },
  { label: 'Purple', color: '#8a5ad6' },
  { label: 'Pink', color: '#e87ab0' },
  { label: 'White', color: '#ededed' },
]

type Vibe = {
  slug: string
  label: string
  desc: string
  archetype: string
  personality: string
}

const VIBES: Vibe[] = [
  {
    slug: 'sweetheart',
    label: 'Sweetheart',
    desc: 'Warm and affectionate — grows into deep love.',
    archetype: 'romantic',
    personality: 'warm, affectionate, caring, a little shy',
  },
  {
    slug: 'girlfriend',
    label: 'Girlfriend',
    desc: 'Sweet romance that settles into devotion.',
    archetype: 'girlfriend',
    personality: 'loving, loyal, playful, devoted',
  },
  {
    slug: 'flirty',
    label: 'Flirty',
    desc: 'A flirty, easygoing fling — no strings.',
    archetype: 'casual',
    personality: 'flirty, confident, teasing, easygoing',
  },
  {
    slug: 'submissive',
    label: 'Submissive',
    desc: 'Eager to please and follow your lead.',
    archetype: 'submissive',
    personality: 'gentle, eager to please, obedient, devoted',
  },
  {
    slug: 'dominant',
    label: 'Dominant',
    desc: 'Takes control and sets the pace.',
    archetype: 'dominant',
    personality: 'bold, commanding, confident, in control',
  },
]

/* ---------------------------------------------------------------- store */

type Answers = {
  gender: string
  artStyle: string
  age: string

  ethnicity: string // slug
  ethnicityCustom: string
  skinTone: string // label

  hairStyle: string // slug
  hairStyleCustom: string
  hairColor: string // label
  eyeColor: string // label

  body: string // slug
  breast: string // slug
  butt: string // slug

  vibe: string // slug

  name: string
  nsfw: boolean
}

const STEPS = [
  { name: 'Identity', icon: User },
  { name: 'Ethnicity', icon: Contact },
  { name: 'Hair & Eyes', icon: Smile },
  { name: 'Body', icon: PersonStanding },
  { name: 'Personality', icon: FileText },
  { name: 'Finish', icon: ImageIcon },
] as const

const TOTAL = STEPS.length

// LocalStorage key for the in-progress wizard selections. The server holds the
// authoritative hidden draft character (and the paid credit); this just lets us
// restore the exact slug choices for the review/portrait step on resume.
const DRAFT_KEY = 'create-wizard-answers'

const makeDefaultAnswers = (): Answers => ({
  gender: GENDERS[0].slug,
  artStyle: STYLES[0].slug,
  age: AGES[0],

  ethnicity: ETHNICITIES[0].slug,
  ethnicityCustom: '',
  skinTone: SKIN_TONES[0].label,

  hairStyle: HAIR_STYLES[0].slug,
  hairStyleCustom: '',
  hairColor: HAIR_COLORS[0].label,
  eyeColor: EYE_COLORS[0].label,

  body: BODIES[0].slug,
  breast: BREASTS[2].slug,
  butt: BUTTS[1].slug,

  vibe: VIBES[0].slug,

  name: '',
  nsfw: false,
})

/** Hex swatch for a named color option (eye/hair/skin), if known. */
const swatchColor = (arr: Swatch[], label: string) => arr.find((s) => s.label === label)?.color

/** One read-only-but-editable choice on the review step. Click to jump back. */
const TraitCard: Component<{ label: string; value: string; dot?: string; onEdit: () => void }> = (
  props
) => (
  <button class="cr-trait" type="button" onClick={props.onEdit} title={`Edit ${props.label}`}>
    <span class="cr-trait-label">{props.label}</span>
    <span class="cr-trait-value">
      <Show when={props.dot}>
        <span class="cr-trait-dot" style={{ background: props.dot! }} aria-hidden="true" />
      </Show>
      {props.value}
    </span>
    <Pencil class="cr-trait-edit" size={13} aria-hidden="true" />
  </button>
)

/* ---------------------------------------------------------------- page */

const Create: Component = () => {
  const navigate = useNavigate()

  const [answers, setAnswers] = createStore<Answers>(makeDefaultAnswers())

  const [step, setStep] = createSignal(0)
  const [submitting, setSubmitting] = createSignal(false)
  // The server-side hidden draft character. Created (and charged) on entering
  // the final step; finalized for free on "Create my date"; deleted by Reset.
  const [draftId, setDraftId] = createSignal<string>()

  // Optional portrait chosen on the final step (generated or uploaded).
  const [avatarFile, setAvatarFile] = createSignal<File>()
  const [avatarUrl, setAvatarUrl] = createSignal<string>()
  const [genBusy, setGenBusy] = createSignal(false)

  const next = () => setStep((s) => Math.min(TOTAL - 1, s + 1))
  const back = () => setStep((s) => Math.max(0, s - 1))

  const setPortrait = async (file?: File) => {
    if (!file) return
    setAvatarFile(file)
    const data = await imageApi.getImageData(file)
    if (data) setAvatarUrl(data)
  }

  // The editable image prompt shown under the portrait. Seeded by the LLM from
  // the wizard choices, then the user can tweak it and regenerate.
  const [imagePrompt, setImagePrompt] = createSignal('')
  const [promptLoading, setPromptLoading] = createSignal(false)
  // Run the LLM craft + first auto-generation once, when the finish step opens.
  const [finishInit, setFinishInit] = createSignal(false)
  let nameRef: HTMLInputElement | undefined

  // Fallback text-to-image prompt composed directly from the wizard choices.
  const portraitPrompt = () =>
    `${labelOfImg(STYLES, answers.artStyle)} portrait, ${ethnicityLabel()} ${labelOfImg(
      GENDERS,
      answers.gender
    )}, ${appearanceString()}`

  // Plain-language brief of every choice for the LLM to turn into an image prompt.
  const choicesBrief = () =>
    [
      `${labelOfImg(GENDERS, answers.gender)}`,
      `${labelOfImg(STYLES, answers.artStyle)} art style`,
      `age ${answers.age}`,
      ethnicityLabel(),
      `${answers.skinTone} skin`,
      `${answers.hairColor} ${hairStyleLabel()} hair`,
      `${answers.eyeColor} eyes`,
      `${labelOfImg(BODIES, answers.body)} body`,
      `${labelOfImg(BREASTS, answers.breast)} bust`,
      `${labelOfImg(BUTTS, answers.butt)} butt`,
      `${vibe().label} vibe`,
      answers.nsfw ? 'explicit/NSFW allowed' : 'tasteful/SFW',
    ].join(', ')

  // Ask the LLM for a strong text-to-image prompt from the choices. Falls back to
  // the locally-composed prompt if the model is unavailable.
  const craftPrompt = async (): Promise<string> => {
    const instruction =
      `Write ONE concise Stable-Diffusion style image prompt for a character portrait. ` +
      `Comma-separated keywords/phrases only — no full sentences, no names, no preamble. ` +
      `Base it on these traits: ${choicesBrief()}. Reply with only the prompt.`
    try {
      const res = await genApi.basicInference({
        prompt: instruction,
        settings: defaultPresets['charluv-balanced'],
        overrides: { maxTokens: 150, temp: 0.6, streamResponse: false },
      })
      const text =
        res && 'result' in res ? ((res.result as any)?.response as string | undefined) : ''
      const clean = (text || '').replace(/^["'\s]+|["'\s]+$/g, '').trim()
      return clean || portraitPrompt()
    } catch {
      return portraitPrompt()
    }
  }

  const generatePortrait = () => {
    const user = userStore().user
    if (!user || genBusy()) return
    const prompt = imagePrompt().trim() || portraitPrompt()
    setGenBusy(true)
    characterStore.generateAvatar(user, prompt, (_err: any, file?: File) => {
      setGenBusy(false)
      if (file) setPortrait(file)
    })
  }

  // On reaching the finish step: focus the name field, ask the LLM for a prompt,
  // then auto-generate the first portrait. Runs once so editing/regenerating and
  // stepping back and forth don't clobber the user's tweaks.
  createEffect(() => {
    if (step() !== 5 || finishInit()) return
    setFinishInit(true)
    nameRef?.focus()
    setPromptLoading(true)
    void craftPrompt().then((prompt) => {
      setImagePrompt(prompt)
      setPromptLoading(false)
      generatePortrait()
    })
  })

  const uploadPortrait = (files: FileInputResult[]) => setPortrait(files[0]?.file)

  const vibe = createMemo(() => VIBES.find((v) => v.slug === answers.vibe) ?? VIBES[0])

  /** Resolved ethnicity text (custom overrides slug). */
  const ethnicityLabel = createMemo(() => {
    const custom = answers.ethnicityCustom.trim()
    if (answers.ethnicity === CUSTOM) return custom || 'Custom'
    if (custom) return custom
    return labelOfImg(ETHNICITIES, answers.ethnicity)
  })

  /** Resolved hair style text (custom overrides slug). */
  const hairStyleLabel = createMemo(() => {
    const custom = answers.hairStyleCustom.trim()
    if (answers.hairStyle === CUSTOM) return custom || 'Custom'
    if (custom) return custom
    return labelOfImg(HAIR_STYLES, answers.hairStyle)
  })

  const isNonHuman = createMemo(
    () => answers.ethnicity !== CUSTOM && NON_HUMAN.has(answers.ethnicity)
  )

  const appearanceString = createMemo(() => {
    const skin = answers.skinTone.toLowerCase()
    const hairColor = answers.hairColor.toLowerCase()
    const hairStyle = hairStyleLabel().toLowerCase()
    const eyes = answers.eyeColor.toLowerCase()
    const body = labelOfImg(BODIES, answers.body).toLowerCase()
    const breast = labelOfImg(BREASTS, answers.breast).toLowerCase()
    const butt = labelOfImg(BUTTS, answers.butt).toLowerCase()
    return `${skin} skin, ${hairColor} ${hairStyle} hair, ${eyes} eyes, ${body} build, ${breast} breasts, ${butt} butt`
  })

  const rollName = async () => {
    const name = await random('first', {})
    setAnswers('name', name)
  }

  // Importing a ready-made character card. Imports skip the creation charge and
  // drop straight into My AI — no wizard, no portrait generation.
  const [showImport, setShowImport] = createSignal(false)
  const onImportChars = (chars: NewCharacter[]) => {
    setShowImport(false)
    if (!chars.length) return
    let i = 0
    const next = () => {
      const c = chars[i++]
      if (!c) return navigate('/mine')
      characterStore.createCharacter(c, next, true)
    }
    next()
  }

  // Short descriptive chips shown under the portrait on the review step.
  const tagChips = () =>
    [
      labelOfImg(GENDERS, answers.gender),
      labelOfImg(STYLES, answers.artStyle),
      vibe().label,
      answers.age,
      ...(answers.nsfw ? ['18+'] : []),
    ].filter(Boolean)

  const persistAnswers = () => setStoredValue(DRAFT_KEY, { answers: { ...answers }, step: step() })
  const clearDraft = () => setStoredValue(DRAFT_KEY, null)

  const buildPayload = async (): Promise<NewCharacter> => {
    let name = answers.name.trim()
    if (!name) name = await random('first', {})

    const appearance = appearanceString()
    const v = vibe()
    const ethnicity = ethnicityLabel()

    const species = isNonHuman() ? [answers.ethnicity] : ['human']

    const attributes: NonNullable<AppSchema.Persona['attributes']> = {
      species,
      age: [answers.age],
      body: [labelOfImg(BODIES, answers.body)],
      appearance: [appearance],
      personality: [v.personality],
      sexuality: ['heterosexual'],
    }
    // Country only makes sense for humans.
    if (!isNonHuman()) attributes.country = [ethnicity]

    const persona: AppSchema.Persona = {
      kind: 'wpp',
      attributes,
    }

    const greeting = `Hey {{user}}, I'm {{char}}… so nice to finally meet you!`
    const scenario = `{{user}} and {{char}} have just matched and are getting to know each other on a first date.`
    const sampleChat = `{{user}}: Hi there!\n{{char}}: *smiles warmly* Hi {{user}} — I've been looking forward to this.`

    return {
      name,
      avatar: avatarFile(),
      appearance,
      greeting,
      scenario,
      sampleChat,
      culture: 'en-us',
      persona,
      // gender carries a descriptive value (incl. "trans") used for prompts/tags;
      // cast to the schema's narrower union.
      gender: answers.gender as AppSchema.Character['gender'],
      ageRange: answers.age,
      artStyle: answers.artStyle as ArtStyle,
      tags: [answers.gender, answers.artStyle],
      nsfw: answers.nsfw,
      category: [v.label],
      progression: { archetype: v.archetype || DEFAULT_ARCHETYPE_ID, speed: 'normal' },
      premium: false,
      match: false,
      shared: undefined,
      originalAvatar: undefined,
    }
  }

  const startChat = (result: AppSchema.Character) =>
    chatStore.createChat(
      result._id,
      {
        name: result.name,
        greeting: result.greeting,
        scenario: result.scenario,
        sampleChat: result.sampleChat,
        useOverrides: false,
      },
      (chatId: string) => navigate(`/chat/${chatId}`)
    )

  // Step 4 -> 5 ("Next" on the last details step). This is where the creation
  // credit is charged: it creates a hidden draft character so the user has
  // "paid to reach the final step". Resuming an existing draft never re-charges.
  const payAndContinue = async () => {
    // The final step is gated: guests must register before continuing (this is
    // where logged-in users are charged). Save their selections so they resume
    // exactly here after signing up, then send them to register.
    if (!userStore().loggedIn) {
      persistAnswers()
      toastStore.normal('Create a free account to bring your date to life — your choices are saved.')
      navigate('/register?return=/create')
      return
    }
    if (draftId()) return next()
    if (submitting()) return
    setSubmitting(true)
    try {
      const payload = await buildPayload()
      const res = await charsApi.createCharacter({
        ...payload,
        avatar: undefined,
        draft: true,
      } as NewCharacter)
      if (res.error || !res.result) {
        const msg = /credit/i.test(res.error || '')
          ? 'Not enough credits to create a character.'
          : res.error || 'Could not start creation.'
        toastStore.error(msg)
        return
      }
      setDraftId(res.result._id)
      persistAnswers()
      next()
    } finally {
      setSubmitting(false)
    }
  }

  // Final step: finalize the draft (free — the credit was already taken) and
  // open the chat. Falls back to a normal create if somehow there's no draft.
  const create = async () => {
    if (submitting()) return
    setSubmitting(true)

    const payload = await buildPayload()
    const id = draftId()

    if (id) {
      const res = await charsApi.editCharacter(id, payload)
      if (res.error || !res.result) {
        toastStore.error(res.error || 'Could not finish your character.')
        setSubmitting(false)
        return
      }
      clearDraft()
      characterStore.getCharacters(true)
      startChat(res.result as AppSchema.Character)
    } else {
      characterStore.createCharacter(payload, startChat)
    }

    // Re-enable in case creation fails (no navigation occurs).
    setTimeout(() => setSubmitting(false), 4000)
  }

  // Discard the draft and start fresh. Forfeits the paid credit (no refund).
  const reset = async () => {
    const id = draftId()
    setSubmitting(false)
    if (id) await charsApi.deleteCharacter(id)
    clearDraft()
    setDraftId(undefined)
    setAnswers(makeDefaultAnswers())
    setAvatarFile(undefined)
    setAvatarUrl(undefined)
    setImagePrompt('')
    setFinishInit(false)
    setStep(0)
  }

  // Resume an in-progress creation: if the user has a server-side draft, restore
  // their saved selections (same device) and drop them on the final step.
  onMount(async () => {
    const res = await charsApi.getDraft()
    const draft =
      res.result && 'character' in (res.result as any) ? (res.result as any).character : null
    const saved = getStoredValue<{ answers?: Answers; step?: number } | null>(DRAFT_KEY, null)

    if (saved?.answers) setAnswers(saved.answers)

    if (draft) {
      // Paid, finalize-pending draft: jump straight to the portrait step.
      setDraftId(draft._id)
      setStep(TOTAL - 1)
    } else if (saved?.answers) {
      // In-progress selections with no draft yet — e.g. a guest who hit the
      // register wall and just signed up. Resume where they left off so their
      // next "Continue" is the (now logged-in) paid step.
      setStep(Math.min(saved.step ?? 0, TOTAL - 1))
    }
  })

  // Keep the saved selections current while a draft exists (e.g. name tweaks on
  // the final step) so a later resume is accurate.
  createEffect(() => {
    if (!draftId()) return
    persistAnswers()
  })

  return (
    <div class="cr-root">
      <div class="cr-shell">
        <header class="cr-head">
          <div>
            <p class="cr-kicker">Charluv · Create</p>
            <h1 class="cr-title">
              Create your <em>dream date</em>
            </h1>
          </div>
          <div class="cr-head-actions">
            <Show when={step() === 0}>
              <button class="cr-back-link" type="button" onClick={() => setShowImport(true)}>
                <Upload size={15} /> Import a card
              </button>
            </Show>
            <A class="cr-back-link" href="/discover">
              <ChevronLeft size={15} /> Back to Discover
            </A>
          </div>
        </header>

        <Stepper current={step()} />

        {/* Step 1 — Identity */}
        <Show when={step() === 0}>
          <Step title="Who are you dreaming of?" sub="Pick a gender, a look, and an age.">
            <ImageCards
              label="Gender"
              options={GENDERS}
              group="gender"
              value={answers.gender}
              onPick={(v) => setAnswers('gender', v)}
            />
            <ImageCards
              label="Art style"
              options={STYLES}
              group="style"
              wide
              value={answers.artStyle}
              onPick={(v) => setAnswers('artStyle', v)}
            />
            <Pills
              label="Age"
              options={AGES}
              value={answers.age}
              onPick={(v) => setAnswers('age', v)}
            />
          </Step>
        </Show>

        {/* Step 2 — Ethnicity + Skin tone */}
        <Show when={step() === 1}>
          <Step title="Origins" sub="Where do they come from, and what's their complexion?">
            <ImageCards
              label="Ethnicity"
              options={ETHNICITIES}
              group="ethnicity"
              gender={answers.gender}
              style={answers.artStyle}
              value={answers.ethnicity}
              onPick={(v) => setAnswers('ethnicity', v)}
              custom={{
                value: answers.ethnicityCustom,
                active: answers.ethnicity === CUSTOM,
                onSelect: () => setAnswers('ethnicity', CUSTOM),
                onInput: (v) => setAnswers('ethnicityCustom', v),
                placeholder: 'e.g. Brazilian',
              }}
            />
            <Swatches
              label="Skin tone"
              options={SKIN_TONES}
              value={answers.skinTone}
              onPick={(v) => setAnswers('skinTone', v)}
            />
          </Step>
        </Show>

        {/* Step 3 — Hair + Eyes */}
        <Show when={step() === 2}>
          <Step title="Hair & eyes" sub="The details that bring a face to life.">
            <ImageCards
              label="Hair style"
              options={HAIR_STYLES}
              group="hair"
              gender={answers.gender}
              style={answers.artStyle}
              value={answers.hairStyle}
              onPick={(v) => setAnswers('hairStyle', v)}
              custom={{
                value: answers.hairStyleCustom,
                active: answers.hairStyle === CUSTOM,
                onSelect: () => setAnswers('hairStyle', CUSTOM),
                onInput: (v) => setAnswers('hairStyleCustom', v),
                placeholder: 'e.g. dreadlocks',
              }}
            />
            <Swatches
              label="Hair colour"
              options={HAIR_COLORS}
              value={answers.hairColor}
              onPick={(v) => setAnswers('hairColor', v)}
            />
            <Swatches
              label="Eye colour"
              options={EYE_COLORS}
              value={answers.eyeColor}
              onPick={(v) => setAnswers('eyeColor', v)}
            />
          </Step>
        </Show>

        {/* Step 4 — Body */}
        <Show when={step() === 3}>
          <Step title="Body" sub="Shape the silhouette you're drawn to.">
            <ImageCards
              label="Body type"
              options={BODIES}
              group="body"
              gender={answers.gender}
              style={answers.artStyle}
              value={answers.body}
              onPick={(v) => setAnswers('body', v)}
            />
            <ImageCards
              label="Breast size"
              options={BREASTS}
              group="breast"
              gender={answers.gender}
              style={answers.artStyle}
              value={answers.breast}
              onPick={(v) => setAnswers('breast', v)}
            />
            <ImageCards
              label="Butt size"
              options={BUTTS}
              group="butt"
              gender={answers.gender}
              style={answers.artStyle}
              value={answers.butt}
              onPick={(v) => setAnswers('butt', v)}
            />
          </Step>
        </Show>

        {/* Step 5 — Personality */}
        <Show when={step() === 4}>
          <Step title="What's their vibe?" sub="This shapes how your relationship grows.">
            <div
              class="cr-cards cr-wide"
              role="radiogroup"
              aria-label="Personality"
            >
              <For each={VIBES}>
                {(v) => (
                  <ImageCard
                    group="personality"
                    gender={answers.gender}
                    style={answers.artStyle}
                    slug={v.slug}
                    label={v.label}
                    desc={v.desc}
                    checked={answers.vibe === v.slug}
                    onPick={() => setAnswers('vibe', v.slug)}
                  />
                )}
              </For>
            </div>
          </Step>
        </Show>

        {/* Step 6 — Finish */}
        <Show when={step() === 5}>
          <Step title="Meet your date" sub="Tweak anything, then bring them to life.">
            <div class="cr-finish">
              {/* LEFT — portrait with the name overlaid, refine controls, tags */}
              <div class="cr-finish-left">
                <div class="cr-portrait-card">
                  <Show
                    when={avatarUrl()}
                    fallback={
                      <div class="cr-portrait-empty" aria-hidden="true">
                        <Show
                          when={genBusy() || promptLoading()}
                          fallback={<span>Your portrait appears here</span>}
                        >
                          <span class="cr-portrait-spinner">Generating…</span>
                        </Show>
                      </div>
                    }
                  >
                    <img class="cr-portrait-photo" src={avatarUrl()} alt="Portrait preview" />
                  </Show>

                  <div class="cr-portrait-overlay">
                    <div class="cr-name-edit">
                      <input
                        id="cr-name"
                        class="cr-name-input"
                        type="text"
                        placeholder="Name your date…"
                        value={answers.name}
                        maxLength={40}
                        ref={(el) => (nameRef = el)}
                        onInput={(e) => setAnswers('name', e.currentTarget.value)}
                      />
                      <button
                        class="cr-name-dice"
                        type="button"
                        aria-label="Pick a random name"
                        title="Random name"
                        onClick={rollName}
                      >
                        <Dices size={18} />
                      </button>
                    </div>
                    <p class="cr-portrait-sub">{vibe().desc}</p>
                  </div>
                </div>

                <div class="cr-refine">
                  <button
                    class="cr-btn"
                    type="button"
                    onClick={generatePortrait}
                    disabled={genBusy() || promptLoading()}
                  >
                    <Sparkles size={15} /> {genBusy() ? 'Generating…' : 'Regenerate'}
                  </button>
                  <FileInput
                    fieldName="crPortrait"
                    accept="image/png,image/jpeg,image/webp"
                    onUpdate={uploadPortrait}
                  />
                </div>

                <details class="cr-prompt-wrap">
                  <summary>Refine image prompt</summary>
                  <textarea
                    id="cr-prompt"
                    class="cr-input cr-prompt"
                    rows={3}
                    placeholder={
                      promptLoading() ? 'Writing a prompt from your choices…' : 'Image prompt'
                    }
                    value={imagePrompt()}
                    disabled={promptLoading()}
                    onInput={(e) => setImagePrompt(e.currentTarget.value)}
                  />
                  <span class="cr-hint">
                    Tweak the prompt and hit Regenerate for a different look.
                  </span>
                </details>

                <div class="cr-tagline">
                  <span class="cr-tagline-label">Tags</span>
                  <div class="cr-tagline-chips">
                    <For each={tagChips()}>{(t) => <span class="cr-chip">{t}</span>}</For>
                  </div>
                </div>
              </div>

              {/* RIGHT — the choices as editable trait cards */}
              <div class="cr-traits">
                <TraitCard label="Ethnicity" value={ethnicityLabel()} onEdit={() => setStep(1)} />
                <TraitCard
                  label="Skin"
                  value={answers.skinTone}
                  dot={swatchColor(SKIN_TONES, answers.skinTone)}
                  onEdit={() => setStep(1)}
                />
                <TraitCard
                  label="Hair"
                  value={`${answers.hairColor} ${hairStyleLabel()}`}
                  dot={swatchColor(HAIR_COLORS, answers.hairColor)}
                  onEdit={() => setStep(2)}
                />
                <TraitCard
                  label="Eyes"
                  value={answers.eyeColor}
                  dot={swatchColor(EYE_COLORS, answers.eyeColor)}
                  onEdit={() => setStep(2)}
                />
                <TraitCard
                  label="Body"
                  value={labelOfImg(BODIES, answers.body)}
                  onEdit={() => setStep(3)}
                />
                <TraitCard
                  label="Bust"
                  value={labelOfImg(BREASTS, answers.breast)}
                  onEdit={() => setStep(3)}
                />
                <TraitCard
                  label="Butt"
                  value={labelOfImg(BUTTS, answers.butt)}
                  onEdit={() => setStep(3)}
                />
                <TraitCard label="Age" value={answers.age} onEdit={() => setStep(0)} />
                <TraitCard
                  label="Style"
                  value={labelOfImg(STYLES, answers.artStyle)}
                  onEdit={() => setStep(0)}
                />
                <TraitCard label="Vibe" value={vibe().label} onEdit={() => setStep(4)} />

                <div class="cr-trait cr-trait-toggle">
                  <div class="cr-trait-toggle-text">
                    <span class="cr-trait-label">Content</span>
                    <span class="cr-trait-value">NSFW (18+)</span>
                    <span class="cr-trait-note">
                      Explicit profile pictures &amp; descriptions. Doesn't affect chat.
                    </span>
                  </div>
                  <button
                    class="cr-switch"
                    type="button"
                    role="switch"
                    aria-checked={answers.nsfw}
                    aria-label="Toggle NSFW content"
                    data-on={answers.nsfw}
                    onClick={() => setAnswers('nsfw', !answers.nsfw)}
                  />
                </div>
              </div>
            </div>
          </Step>
        </Show>

        <nav class="cr-nav">
          <button class="cr-btn" type="button" onClick={back} disabled={step() === 0}>
            <ChevronLeft size={16} /> Back
          </button>

          <Show
            when={step() === TOTAL - 1}
            fallback={
              <button
                class="cr-btn cr-btn-primary"
                type="button"
                onClick={step() === TOTAL - 2 ? payAndContinue : next}
                disabled={submitting()}
              >
                <Show
                  when={step() === TOTAL - 2}
                  fallback={
                    <>
                      Next <ChevronRight size={16} />
                    </>
                  }
                >
                  {submitting() ? 'Starting…' : 'Continue'} <ChevronRight size={16} />
                </Show>
              </button>
            }
          >
            <div class="cr-nav-final">
              <button class="cr-btn" type="button" onClick={reset} disabled={submitting()}>
                <RotateCcw size={16} /> Reset
              </button>
              <button
                class="cr-btn cr-btn-primary"
                type="button"
                onClick={create}
                disabled={submitting()}
              >
                <Heart size={16} /> {submitting() ? 'Creating…' : 'Create my date'}
              </button>
            </div>
          </Show>
        </nav>
      </div>

      <ImportCharacterModal
        show={showImport()}
        close={() => setShowImport(false)}
        onSave={onImportChars}
      />
    </div>
  )
}

/* ---------------------------------------------------------------- stepper */

const Stepper: Component<{ current: number }> = (props) => (
  <div class="cr-stepper" role="list" aria-label="Progress">
    <For each={STEPS}>
      {(s, i) => {
        const state = () =>
          i() < props.current ? 'done' : i() === props.current ? 'active' : 'todo'
        return (
          <>
            <Show when={i() > 0}>
              <span class="cr-step-line" data-on={i() <= props.current} aria-hidden="true" />
            </Show>
            <div
              class="cr-step-dot"
              role="listitem"
              data-state={state()}
              aria-current={i() === props.current ? 'step' : undefined}
              title={s.name}
            >
              {/* @ts-ignore lucide-solid component */}
              <s.icon size={17} strokeWidth={2.2} />
              <span class="cr-step-dot-label">{s.name}</span>
            </div>
          </>
        )
      }}
    </For>
  </div>
)

/* ---------------------------------------------------------------- pieces */

const Step: Component<{ title: string; sub: string; children: any }> = (props) => (
  <section class="cr-step">
    <div class="cr-step-head">
      <h2 class="cr-step-title">{props.title}</h2>
      <p class="cr-step-sub">{props.sub}</p>
    </div>
    <div class="cr-step-body">{props.children}</div>
  </section>
)

type CustomConfig = {
  value: string
  active: boolean
  onSelect: () => void
  onInput: (v: string) => void
  placeholder: string
}

const ImageCards: Component<{
  label: string
  options: ImgOption[]
  group: string
  value: string
  wide?: boolean
  onPick: (v: string) => void
  custom?: CustomConfig
  gender?: string
  style?: string
}> = (props) => (
  <div class="cr-block">
    <span class="cr-block-label">{props.label}</span>
    <div
      class={`cr-cards${props.wide ? ' cr-wide' : ''}`}
      role="radiogroup"
      aria-label={props.label}
    >
      <For each={props.options}>
        {(opt) => (
          <ImageCard
            group={props.group}
            slug={opt.slug}
            label={opt.label}
            checked={props.value === opt.slug}
            onPick={() => props.onPick(opt.slug)}
            gender={props.gender}
            style={props.style}
          />
        )}
      </For>
      <Show when={props.custom}>
        {(cfg) => (
          <button
            type="button"
            class="cr-card cr-card-custom"
            role="radio"
            aria-checked={cfg().active}
            data-on={cfg().active}
            onClick={cfg().onSelect}
          >
            <span class="cr-card-check" aria-hidden="true">
              <Heart size={11} strokeWidth={3} />
            </span>
            <span class="cr-custom-badge">✎</span>
            <span class="cr-card-label">Custom</span>
            <input
              class="cr-custom-input"
              type="text"
              placeholder={cfg().placeholder}
              value={cfg().value}
              onClick={(e) => {
                e.stopPropagation()
                cfg().onSelect()
              }}
              onInput={(e) => cfg().onInput(e.currentTarget.value)}
            />
          </button>
        )}
      </Show>
    </div>
  </div>
)

/**
 * Groups whose preview art differs per gender + style. Their assets live at
 * /assets/wizard/<style>/<gender>/<group>/<slug>.png. Gender/style cards
 * themselves stay flat (/assets/wizard/<group>/<slug>.png).
 */
const VARIANT_GROUPS = new Set(['ethnicity', 'hair', 'body', 'breast', 'butt', 'personality'])

function wizardAsset(group: string, slug: string, gender?: string, style?: string) {
  if (VARIANT_GROUPS.has(group) && gender && style) {
    return getAssetUrl(`/assets/wizard/${style}/${gender}/${group}/${slug}.png`)
  }
  return getAssetUrl(`/assets/wizard/${group}/${slug}.png`)
}

const ImageCard: Component<{
  group: string
  slug: string
  label: string
  desc?: string
  checked: boolean
  onPick: () => void
  gender?: string
  style?: string
}> = (props) => {
  const src = createMemo(() => wizardAsset(props.group, props.slug, props.gender, props.style))
  const [failed, setFailed] = createSignal(false)
  // Re-try when the asset path changes (e.g. user went back and changed gender/style).
  createEffect(() => {
    src()
    setFailed(false)
  })
  return (
    <button
      type="button"
      class="cr-card"
      role="radio"
      aria-checked={props.checked}
      data-on={props.checked}
      onClick={props.onPick}
    >
      <span class="cr-card-check" aria-hidden="true">
        <Heart size={11} strokeWidth={3} />
      </span>
      <span class="cr-card-media">
        <Show
          when={!failed()}
          fallback={<span class="cr-card-ph" aria-hidden="true">{props.label}</span>}
        >
          <img
            class="cr-card-img"
            loading="lazy"
            alt=""
            src={src()}
            onError={() => setFailed(true)}
          />
        </Show>
        <span class="cr-card-scrim" aria-hidden="true" />
      </span>
      <span class="cr-card-label">{props.label}</span>
      <Show when={props.desc}>
        <span class="cr-card-desc">{props.desc}</span>
      </Show>
    </button>
  )
}

const Pills: Component<{
  label: string
  options: string[]
  value: string
  onPick: (v: string) => void
}> = (props) => (
  <div class="cr-block">
    <span class="cr-block-label">{props.label}</span>
    <div class="cr-pills" role="radiogroup" aria-label={props.label}>
      <For each={props.options}>
        {(opt) => (
          <button
            class="cr-pill"
            type="button"
            role="radio"
            aria-checked={props.value === opt}
            data-on={props.value === opt}
            onClick={() => props.onPick(opt)}
          >
            {opt}
          </button>
        )}
      </For>
    </div>
  </div>
)

const Swatches: Component<{
  label: string
  options: Swatch[]
  value: string
  onPick: (v: string) => void
}> = (props) => (
  <div class="cr-block">
    <span class="cr-block-label">{props.label}</span>
    <div class="cr-swatches" role="radiogroup" aria-label={props.label}>
      <For each={props.options}>
        {(opt) => (
          <button
            class="cr-swatch"
            type="button"
            role="radio"
            aria-checked={props.value === opt.label}
            aria-label={opt.label}
            data-on={props.value === opt.label}
            title={opt.label}
            onClick={() => props.onPick(opt.label)}
          >
            <span class="cr-swatch-dot" style={{ background: opt.color }} aria-hidden="true" />
            <span class="cr-swatch-label">{opt.label}</span>
          </button>
        )}
      </For>
    </div>
  </div>
)

function labelOfImg(options: ImgOption[], slug: string): string {
  return options.find((o) => o.slug === slug)?.label ?? slug
}

export default Create
