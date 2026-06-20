import { Component, For, Show, createMemo, createSignal } from 'solid-js'
import { createStore } from 'solid-js/store'
import { A, useNavigate } from '@solidjs/router'
import { Check, ChevronLeft, ChevronRight, Dices, Heart } from 'lucide-solid'
import './create.css'
import { characterStore, chatStore } from '../../store'
import { random } from '../../shared/util'
import { DEFAULT_ARCHETYPE_ID } from '/common/progression'
import { AppSchema } from '/common/types'
import { NewCharacter } from '../../store/character'

/* ---------------------------------------------------------------- options */

type Gender = 'female' | 'male' | 'nonbinary'
type ArtStyle = 'realistic' | 'anime'

type Option<T extends string = string> = {
  value: T
  label: string
  emoji?: string
  desc?: string
}

const GENDERS: Option<Gender>[] = [
  { value: 'female', label: 'Female', emoji: '♀', desc: 'A woman of your dreams' },
  { value: 'male', label: 'Male', emoji: '♂', desc: 'A man of your dreams' },
  { value: 'nonbinary', label: 'Non-binary', emoji: '⚧', desc: 'Beyond the binary' },
]

const STYLES: Option<ArtStyle>[] = [
  { value: 'realistic', label: 'Realistic', emoji: '📷', desc: 'Lifelike, photoreal looks' },
  { value: 'anime', label: 'Anime', emoji: '🎨', desc: 'Stylised, illustrated looks' },
]

const ETHNICITIES: Option[] = [
  { value: 'Caucasian', label: 'Caucasian', emoji: '🤍' },
  { value: 'Latina', label: 'Latina', emoji: '🌺' },
  { value: 'Asian', label: 'Asian', emoji: '🏮' },
  { value: 'Arab', label: 'Arab', emoji: '🌙' },
  { value: 'African', label: 'African', emoji: '🌍' },
  { value: 'Indian', label: 'Indian', emoji: '🪔' },
]

const AGES: Option[] = [
  { value: '18-21', label: '18-21', desc: 'Young & playful' },
  { value: '22-29', label: '22-29', desc: 'In their prime' },
  { value: '30-39', label: '30-39', desc: 'Grown & confident' },
  { value: '40+', label: '40+', desc: 'Mature & magnetic' },
]

const BODIES: Option[] = [
  { value: 'Slim', label: 'Slim', emoji: '🌿' },
  { value: 'Petite', label: 'Petite', emoji: '🍃' },
  { value: 'Athletic', label: 'Athletic', emoji: '🏃' },
  { value: 'Curvy', label: 'Curvy', emoji: '🌸' },
  { value: 'Voluptuous', label: 'Voluptuous', emoji: '🔥' },
]

const HAIR_COLORS = ['Black', 'Brown', 'Blonde', 'Red', 'Pink', 'White']
const HAIR_STYLES = ['Short', 'Long', 'Ponytail', 'Bob', 'Curly']
const EYE_COLORS = ['Brown', 'Blue', 'Green', 'Hazel', 'Grey']

type Vibe = {
  value: string
  label: string
  emoji: string
  desc: string
  archetype: string
  personality: string
}

const VIBES: Vibe[] = [
  {
    value: 'Sweetheart',
    label: 'Sweetheart',
    emoji: '🥰',
    desc: 'Warm and affectionate — grows into deep love.',
    archetype: 'romantic',
    personality: 'warm, affectionate, caring, a little shy',
  },
  {
    value: 'Girlfriend',
    label: 'Girlfriend',
    emoji: '💞',
    desc: 'Sweet romance that settles into devotion.',
    archetype: 'girlfriend',
    personality: 'loving, loyal, playful, devoted',
  },
  {
    value: 'Flirty / Casual',
    label: 'Flirty / Casual',
    emoji: '😘',
    desc: 'A flirty, easygoing fling — no strings.',
    archetype: 'casual',
    personality: 'flirty, confident, teasing, easygoing',
  },
  {
    value: 'Submissive',
    label: 'Submissive',
    emoji: '🎀',
    desc: 'Eager to please and follow your lead.',
    archetype: 'submissive',
    personality: 'gentle, eager to please, obedient, devoted',
  },
  {
    value: 'Dominant',
    label: 'Dominant',
    emoji: '👑',
    desc: 'Takes control and sets the pace.',
    archetype: 'dominant',
    personality: 'bold, commanding, confident, in control',
  },
]

/* ---------------------------------------------------------------- store */

type CreateAnswers = {
  gender: Gender
  artStyle: ArtStyle
  ethnicity: string
  age: string
  body: string
  hairColor: string
  hairStyle: string
  eyeColor: string
  vibe: string
  name: string
  nsfw: boolean
}

const STEP_NAMES = [
  'Gender',
  'Style',
  'Ethnicity',
  'Age',
  'Body',
  'Appearance',
  'Personality',
  'Finish',
] as const

/* ---------------------------------------------------------------- page */

const Create: Component = () => {
  const navigate = useNavigate()

  const [answers, setAnswers] = createStore<CreateAnswers>({
    gender: 'female',
    artStyle: 'realistic',
    ethnicity: ETHNICITIES[0].value,
    age: AGES[0].value,
    body: BODIES[0].value,
    hairColor: HAIR_COLORS[0],
    hairStyle: HAIR_STYLES[0],
    eyeColor: EYE_COLORS[0],
    vibe: VIBES[0].value,
    name: '',
    nsfw: false,
  })

  const [step, setStep] = createSignal(0)
  const [submitting, setSubmitting] = createSignal(false)

  const total = STEP_NAMES.length
  const progress = createMemo(() => Math.round(((step() + 1) / total) * 100))

  const next = () => setStep((s) => Math.min(total - 1, s + 1))
  const back = () => setStep((s) => Math.max(0, s - 1))

  const vibe = createMemo(() => VIBES.find((v) => v.value === answers.vibe) ?? VIBES[0])

  const appearanceString = createMemo(
    () =>
      `${answers.hairColor} ${answers.hairStyle.toLowerCase()} hair, ${answers.eyeColor.toLowerCase()} eyes, ${answers.body.toLowerCase()} build`
  )

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

    const persona: AppSchema.Persona = {
      kind: 'wpp',
      attributes: {
        species: ['human'],
        age: [answers.age],
        country: [answers.ethnicity],
        body: [answers.body],
        appearance: [appearance],
        personality: [v.personality],
        sexuality: ['heterosexual'],
      },
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
      persona,
      gender: answers.gender,
      ageRange: answers.age,
      artStyle: answers.artStyle,
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

        <div class="cr-progress">
          <div class="cr-progress-meta">
            <span class="cr-step-counter">
              Step {step() + 1} of {total}
            </span>
            <span class="cr-step-name">{STEP_NAMES[step()]}</span>
          </div>
          <div
            class="cr-bar"
            role="progressbar"
            aria-valuenow={progress()}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div class="cr-bar-fill" style={{ width: `${progress()}%` }} />
          </div>
        </div>

        {/* Step 1 — Gender */}
        <Show when={step() === 0}>
          <Step title="Who are you dreaming of?" sub="Pick the gender of your companion.">
            <CardGroup
              label="Gender"
              options={GENDERS}
              value={answers.gender}
              onPick={(v) => setAnswers('gender', v)}
            />
          </Step>
        </Show>

        {/* Step 2 — Style */}
        <Show when={step() === 1}>
          <Step title="Choose a look" sub="How should they appear?">
            <CardGroup
              label="Art style"
              wide
              options={STYLES}
              value={answers.artStyle}
              onPick={(v) => setAnswers('artStyle', v)}
            />
          </Step>
        </Show>

        {/* Step 3 — Ethnicity */}
        <Show when={step() === 2}>
          <Step title="Origins" sub="Where do they come from?">
            <CardGroup
              label="Ethnicity"
              options={ETHNICITIES}
              value={answers.ethnicity}
              onPick={(v) => setAnswers('ethnicity', v)}
            />
          </Step>
        </Show>

        {/* Step 4 — Age */}
        <Show when={step() === 3}>
          <Step title="Age range" sub="Everyone is 18 or older.">
            <CardGroup
              label="Age"
              options={AGES}
              value={answers.age}
              onPick={(v) => setAnswers('age', v)}
            />
          </Step>
        </Show>

        {/* Step 5 — Body */}
        <Show when={step() === 4}>
          <Step title="Body type" sub="Pick the silhouette you prefer.">
            <CardGroup
              label="Body"
              options={BODIES}
              value={answers.body}
              onPick={(v) => setAnswers('body', v)}
            />
          </Step>
        </Show>

        {/* Step 6 — Appearance */}
        <Show when={step() === 5}>
          <Step title="The finishing details" sub="Hair and eyes bring them to life.">
            <div class="cr-pickers">
              <PillGroup
                label="Hair colour"
                options={HAIR_COLORS}
                value={answers.hairColor}
                onPick={(v) => setAnswers('hairColor', v)}
              />
              <PillGroup
                label="Hair style"
                options={HAIR_STYLES}
                value={answers.hairStyle}
                onPick={(v) => setAnswers('hairStyle', v)}
              />
              <PillGroup
                label="Eye colour"
                options={EYE_COLORS}
                value={answers.eyeColor}
                onPick={(v) => setAnswers('eyeColor', v)}
              />
            </div>
          </Step>
        </Show>

        {/* Step 7 — Personality */}
        <Show when={step() === 6}>
          <Step title="What's their vibe?" sub="This shapes how your relationship grows.">
            <CardGroup
              label="Personality"
              wide
              options={VIBES}
              value={answers.vibe}
              onPick={(v) => setAnswers('vibe', v)}
            />
          </Step>
        </Show>

        {/* Step 8 — Finish */}
        <Show when={step() === 7}>
          <Step title="Almost ready" sub="Give them a name and you're set.">
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
                  <dd>{labelOf(GENDERS, answers.gender)}</dd>
                  <dt>Style</dt>
                  <dd>{labelOf(STYLES, answers.artStyle)}</dd>
                  <dt>Ethnicity</dt>
                  <dd>{answers.ethnicity}</dd>
                  <dt>Age</dt>
                  <dd>{answers.age}</dd>
                  <dt>Body</dt>
                  <dd>{answers.body}</dd>
                  <dt>Hair</dt>
                  <dd>
                    {answers.hairColor} {answers.hairStyle}
                  </dd>
                  <dt>Eyes</dt>
                  <dd>{answers.eyeColor}</dd>
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
            when={step() === total - 1}
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

/* ---------------------------------------------------------------- pieces */

const Step: Component<{ title: string; sub: string; children: any }> = (props) => (
  <section class="cr-step">
    <div class="cr-step-head">
      <h2 class="cr-step-title">{props.title}</h2>
      <p class="cr-step-sub">{props.sub}</p>
    </div>
    {props.children}
  </section>
)

function CardGroup<T extends string>(props: {
  label: string
  options: Option<T>[]
  value: T
  wide?: boolean
  onPick: (v: T) => void
}) {
  return (
    <div class={`cr-options${props.wide ? ' cr-wide' : ''}`} role="radiogroup" aria-label={props.label}>
      <For each={props.options}>
        {(opt) => (
          <button
            class="cr-card"
            type="button"
            role="radio"
            aria-checked={props.value === opt.value}
            data-on={props.value === opt.value}
            onClick={() => props.onPick(opt.value)}
          >
            <span class="cr-card-check">
              <Check size={13} strokeWidth={3} />
            </span>
            <Show when={opt.emoji}>
              <span class="cr-card-emoji" aria-hidden="true">
                {opt.emoji}
              </span>
            </Show>
            <span class="cr-card-title">{opt.label}</span>
            <Show when={opt.desc}>
              <span class="cr-card-desc">{opt.desc}</span>
            </Show>
          </button>
        )}
      </For>
    </div>
  )
}

const PillGroup: Component<{
  label: string
  options: string[]
  value: string
  onPick: (v: string) => void
}> = (props) => (
  <div>
    <span class="cr-picker-label">{props.label}</span>
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

function labelOf<T extends string>(options: Option<T>[], value: T): string {
  return options.find((o) => o.value === value)?.label ?? value
}

export default Create
