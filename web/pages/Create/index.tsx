import { Component, For, Show, createEffect, createMemo, createSignal } from 'solid-js'
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
  PersonStanding,
  Smile,
  User,
} from 'lucide-solid'
import './create.css'
import { characterStore, chatStore } from '../../store'
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

/* ---------------------------------------------------------------- page */

const Create: Component = () => {
  const navigate = useNavigate()

  const [answers, setAnswers] = createStore<Answers>({
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

  const [step, setStep] = createSignal(0)
  const [submitting, setSubmitting] = createSignal(false)

  const next = () => setStep((s) => Math.min(TOTAL - 1, s + 1))
  const back = () => setStep((s) => Math.max(0, s - 1))

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

  const create = async () => {
    if (submitting()) return
    setSubmitting(true)

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

    const payload: NewCharacter = {
      name,
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

    characterStore.createCharacter(payload, (result) => {
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
    })

    // Re-enable in case creation fails (no navigation occurs).
    setTimeout(() => setSubmitting(false), 4000)
  }

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
          <A class="cr-back-link" href="/discover">
            <ChevronLeft size={15} /> Back to Discover
          </A>
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
          <Step title="Almost ready" sub="Name your date and choose your content level.">
            <div class="cr-finish">
              <div>
                <div class="cr-field">
                  <label class="cr-field-label" for="cr-name">
                    Name
                  </label>
                  <div class="cr-name-row">
                    <input
                      id="cr-name"
                      class="cr-input"
                      type="text"
                      placeholder="Give your date a name…"
                      value={answers.name}
                      maxLength={40}
                      onInput={(e) => setAnswers('name', e.currentTarget.value)}
                    />
                    <button
                      class="cr-dice"
                      type="button"
                      aria-label="Pick a random name"
                      title="Random name"
                      onClick={rollName}
                    >
                      <Dices size={20} />
                    </button>
                  </div>
                </div>

                <div class="cr-field">
                  <span class="cr-field-label">Content</span>
                  <div class="cr-toggle">
                    <div class="cr-toggle-text">
                      <strong>NSFW (18+)</strong>
                      <span>Allow mature, explicit conversations.</span>
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

              <aside class="cr-summary">
                <h3>Your dream date</h3>
                <dl>
                  <dt>Gender</dt>
                  <dd>{labelOfImg(GENDERS, answers.gender)}</dd>
                  <dt>Style</dt>
                  <dd>{labelOfImg(STYLES, answers.artStyle)}</dd>
                  <dt>Age</dt>
                  <dd>{answers.age}</dd>
                  <dt>Ethnicity</dt>
                  <dd>{ethnicityLabel()}</dd>
                  <dt>Skin</dt>
                  <dd>{answers.skinTone}</dd>
                  <dt>Hair</dt>
                  <dd>
                    {answers.hairColor} {hairStyleLabel()}
                  </dd>
                  <dt>Eyes</dt>
                  <dd>{answers.eyeColor}</dd>
                  <dt>Body</dt>
                  <dd>{labelOfImg(BODIES, answers.body)}</dd>
                  <dt>Bust</dt>
                  <dd>{labelOfImg(BREASTS, answers.breast)}</dd>
                  <dt>Butt</dt>
                  <dd>{labelOfImg(BUTTS, answers.butt)}</dd>
                  <dt>Vibe</dt>
                  <dd>{vibe().label}</dd>
                </dl>
              </aside>
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
              <button class="cr-btn cr-btn-primary" type="button" onClick={next}>
                Next <ChevronRight size={16} />
              </button>
            }
          >
            <button
              class="cr-btn cr-btn-primary"
              type="button"
              onClick={create}
              disabled={submitting()}
            >
              <Heart size={16} /> {submitting() ? 'Creating…' : 'Create my date'}
            </button>
          </Show>
        </nav>
      </div>
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
