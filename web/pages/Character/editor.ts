import { batch, createEffect, createMemo, createSignal, on } from 'solid-js'
import { createStore } from 'solid-js/store'
import { AppSchema, VoiceSettings } from '/common/types'
import { FullSprite } from '/common/types/sprite'
import { defaultCulture } from '/web/shared/CultureCodes'
import { ADAPTER_LABELS } from '/common/adapters'
import { getStrictForm, setFormField } from '/web/shared/util'
import { getAttributeMap } from '/web/shared/PersonaAttributes'
import {
  NewCharacter,
  characterStore,
  presetStore,
  settingStore,
  toastStore,
  userStore,
} from '/web/store'
import { Option } from '/web/shared/Select'
import { defaultPresets, isDefaultPreset } from '/common/presets'
import { generateField } from './generate-char'
import { BaseImageSettings, baseImageValid } from '/common/types/image-schema'
import { useImageCache } from '/web/shared/hooks'
import { imageApi } from '/web/store/data/image'
import { v4 } from 'uuid'
import { forms } from '/web/emitter'
import { ResponseSchema } from '/common/types/library'

type CharKey = keyof NewCharacter
type GuardKey = keyof typeof newCharGuard

type EditState = {
  editId?: string
  name: string
  personaKind: AppSchema.Character['persona']['kind']
  description: string
  appearance: string
  scenario: string
  greeting: string
  sampleChat: string
  creator: string
  characterVersion: string
  postHistoryInstructions: string
  insert?: {
    prompt: string
    depth: number
  }
  systemPrompt: string

  xp?: string
  match?: string
  share?: string
  premium?: string
  visualType: string

  // charluv: progression + Discover facets. archetype/categoryValue are flat
  // string fields bound to the editor Selects (Solid's store setState only
  // updates reactively for primitives, not object/array values). The object
  // (progression) and array (category) are assembled in getPayload.
  archetype?: string
  progressionSpeed?: string
  gender?: string
  artStyle?: string
  ageRange?: string
  categoryValue?: string
  nsfw?: boolean
  // Z-Image stored LoRA name (temp/manual for testing i2L Mode A generation).
  loraName?: string
  // Locked seed for the character's base look — used for editor image gen so all
  // generated images stay consistent. Rerollable; ignored in chat generation.
  imageSeed?: number

  // charluv: fixed W++ persona traits. Like archetype/gender these are FLAT
  // string fields bound to TextInputs (Solid's store setState only updates
  // reactively for primitives, not nested object/array values). The persona
  // object is assembled from these (plus appearance/gender/ageRange) in
  // getPayload, and hydrated from char.persona.attributes in load()/reset().
  // The canonical Charluv W++ keys (gender lives in metadata, appearance reuses
  // the appearance field; both are handled outside these inputs).
  traitSpecies?: string
  traitMind?: string
  traitPersonality?: string
  traitAge?: string
  traitJob?: string
  traitDescription?: string
  traitSexuality?: string
  traitLikes?: string
  traitLoves?: string
  traitZodiac?: string
  traitHates?: string
  traitCountry?: string
  traitBody?: string
  // Backward-compat: non-standard W++ attributes from existing characters.
  // Shown read-only; not editable and dropped on save.
  personaExtras?: Record<string, string[]>

  avatar?: File
  originalAvatar?: any
  sprite?: FullSprite

  tags: string[]
  book?: AppSchema.MemoryBook
  voiceDisabled?: boolean
  voice: VoiceSettings
  culture: string
  alternateGreetings: string[]
  persona: AppSchema.Persona

  imageSettings?: BaseImageSettings
  json?: ResponseSchema
}

const newCharGuard = {
  name: 'string',
  description: 'string?',
  appearance: 'string?',
  // No culture input in the single-page editor; keep optional and default it in
  // getPayload from state (otherwise getStrictForm rejects: ".culture is undefined").
  culture: 'string?',
  greeting: 'string',
  scenario: 'string',
  sampleChat: 'string',
  xp: 'string?',
  share: 'string?',
  match: 'string?',
  premium: 'string?',
  // The following fields no longer have form inputs (Voice/Advanced tabs removed).
  // Kept optional so existing values pass through load()/getPayload unchanged.
  systemPrompt: 'string?',
  postHistoryInstructions: 'string?',
  insertPrompt: 'string?',
  insertDepth: 'number?',
  creator: 'string?',
  characterVersion: 'string?',
  voiceDisabled: 'boolean?',
  jsonSchemaEnabled: 'boolean?',
  ...baseImageValid,
} as const

const fieldMap: Map<CharKey, GuardKey | 'tags'> = new Map([
  ['name', 'name'],
  ['appearance', 'appearance'],
  ['description', 'description'],
  ['greeting', 'greeting'],
  ['sampleChat', 'sampleChat'],
  ['creator', 'creator'],
  ['characterVersion', 'characterVersion'],
  ['postHistoryInstructions', 'postHistoryInstructions'],
  ['scenario', 'scenario'],
  ['systemPrompt', 'systemPrompt'],
  ['tags', 'tags'],
  ['name', 'name'],
  ['match', 'match'],
  ['xp', 'xp'],
  ['share', 'share'],
  ['premium', 'premium'],
  ['description', 'description'],
  ['scenario', 'scenario'],
  ['greeting', 'greeting'],
  ['creator', 'creator'],
  ['characterVersion', 'characterVersion'],
  ['postHistoryInstructions', 'postHistoryInstructions'],
  ['systemPrompt', 'systemPrompt'],
])

/** Random seed for the character's locked base look. */
const makeSeed = () => Math.floor(Math.random() * 1_000_000_000)

const initState: EditState = {
  name: '',
  personaKind: 'wpp',
  sampleChat: '',
  description: '',
  appearance: '',
  scenario: '',
  greeting: '',
  creator: '',
  characterVersion: '',
  postHistoryInstructions: '',
  voiceDisabled: false,
  insert: {
    prompt: '',
    depth: 3,
  },
  systemPrompt: '',
  xp: '0',
  match: 'false',
  share: 'private',
  premium: 'false',
  visualType: 'avatar',
  // charluv: progression + Discover facets. Concrete (non-undefined) defaults so
  // the Solid store creates reactive signals for them (an undefined initial
  // value isn't tracked, so the Selects would revert).
  archetype: '',
  progressionSpeed: 'normal',
  gender: '',
  artStyle: '',
  ageRange: '',
  categoryValue: '',
  nsfw: false,
  loraName: '',
  imageSeed: undefined,
  // Fixed W++ persona traits (flat string fields; assembled in getPayload).
  personaExtras: {},
  traitSpecies: '',
  traitMind: '',
  traitPersonality: '',
  traitAge: '',
  traitJob: '',
  traitDescription: '',
  traitSexuality: '',
  traitLikes: '',
  traitLoves: '',
  traitZodiac: '',
  traitHates: '',
  traitCountry: '',
  traitBody: '',
  tags: [],
  alternateGreetings: [],
  culture: defaultCulture,
  voice: { service: undefined },
  sprite: undefined,
  book: undefined,
  persona: { kind: 'wpp', attributes: {} },
  imageSettings: {
    type: 'sd',
    width: 512,
    height: 512,
    steps: 10,
    clipSkip: 0,
    cfg: 9,
    negative: '',
    prefix: '',
    suffix: '',
    summariseChat: true,
    summaryPrompt: '',
    template: '',
  },
}

export type CharEditor = ReturnType<typeof useCharEditor>

export function useCharEditor(editing?: NewCharacter & { _id?: string }) {
  const user = userStore()
  const presets = presetStore()
  const settings = settingStore()

  const cache = useImageCache('avatars', { clean: true })

  const [original, setOriginal] = createSignal(editing)
  const [state, setState] = createStore<EditState>({ ...initState })
  // Every character gets a locked base-look seed (new chars too, before load()).
  if (!state.imageSeed) setState('imageSeed', makeSeed())
  const rerollSeed = () => setState('imageSeed', makeSeed())

  // Set the displayed cover to an existing image URL (Make-cover). Updates the
  // avatar display immediately and clears any staged avatar File so the next save
  // doesn't re-upload over the cover (which Make-cover already saved server-side).
  const applyCover = (url: string) => {
    setImageData(url)
    setState('avatar', undefined)
  }
  const [imageData, setImageData] = createSignal<string>()
  const [form, setForm] = createSignal<any>()
  const [generating, setGenerating] = createSignal(false)
  const [imageId, setImageId] = createSignal('')

  forms.useSub((field, value) => {
    if (field === 'kind') {
      updateKind(value as any)
      return
    }

    if (field in state === false) return

    setState(field as any, value)
  })

  const canGenerate = createMemo(
    on(
      () => `${state.name}${state.description}`,
      () => {
        return !!state.name.trim() && !!state.description.trim()
      }
    )
  )

  const genOptions = createMemo(() => {
    if (!user.user) return []

    const preset = isDefaultPreset(user.user.defaultPreset)
      ? defaultPresets[user.user.defaultPreset]
      : presets.presets.find((p) => p._id === user.user?.defaultPreset)

    const opts: Option[] = []

    if (preset?.service && preset.service !== 'agnaistic') {
      opts.push({ label: `Default (${ADAPTER_LABELS[preset.service!]})`, value: 'default' })
    }

    {
      const premiumLevel = user.premium ? 10 : -1
      const subs = settings.config.subs.filter(
        (s) => user.user?.admin || s.level <= premiumLevel || s.level <= user.userLevel
      )

      for (const sub of subs) {
        opts.push({ label: `Charluv: ${sub.name}`, value: `agnaistic/${sub._id}` })
      }
    }

    if (user.user.oaiKeySet) {
      opts.push({ label: 'OpenAI - Turbo', value: 'openai/gpt-3.5-turbo-0301' })
      opts.push({ label: 'OpenAI - GPT-4', value: 'openai/gpt-4' })
    }

    if (user.user.novelVerified) {
      opts.push({ label: 'NovelAI - Kayra', value: 'novel/kayra-v1' })
      opts.push({ label: 'NovelAI - Clio', value: 'novel/clio-v1' })
    }

    if (preset?.service === 'kobold' || user.user.koboldUrl) {
      opts.push({ label: 'Third Party', value: 'kobold' })
    }

    if (user.user.claudeApiKeySet) {
      opts.push({ label: 'Claude', value: 'claude' })
    }

    //    return opts
    return []
  })

  createEffect(async () => {
    const nextImage = cache.state.image

    if (nextImage) {
      const file = await imageApi.dataURLtoFile(nextImage, cache.state.imageId)

      setImageData(nextImage)
      setState('avatar', file)
    }
  })

  createEffect(() => {
    if (!editing) return

    const orig = original()
    if (!orig || orig._id !== editing._id) {
      setOriginal(editing)
    }
  })

  const receiveAvatar = async (image: File, original?: boolean) => {
    if (!image) return
    const base64 = await imageApi.getImageData(image)
    setState('avatar', image)
    setImageData(base64)

    if (base64) {
      const id = original ? 'original' : v4()
      await cache.addImage(base64, id)
      if (original) {
        setImageId(`avatars-${id}`)
      }
    }

    return base64
  }

  const createAvatar = async () => {
    const avatar = await generateAvatar(buildImagePrompt(), state.imageSeed)
    if (!avatar) return

    return receiveAvatar(avatar)
  }

  // Like createAvatar but returns the image as base64 WITHOUT setting it as the
  // character's avatar (used to populate the gallery).
  const createGalleryImage = async () => {
    const desc = buildImagePrompt()
    const file = await generateAvatar(desc, state.imageSeed)
    if (!file) return
    return imageApi.getImageData(file)
  }

  // Compose a real image-generation prompt from the assembled persona. W++
  // attributes moved to fixed flat trait fields, so the old appeareance/looks
  // lookup is empty now. Pull the visually-relevant traits + the appearance
  // field, falling back to the character name so we never send an empty prompt.
  const buildImagePrompt = () => {
    const current = payload()
    const attributes = (current.persona?.attributes ?? {}) as Record<string, string[] | undefined>
    const join = (key: string) => {
      const value = attributes[key]
      return Array.isArray(value) ? value.filter((v) => !!v?.trim()).join(', ') : ''
    }

    const parts = [
      current.appearance,
      join('appearance'),
      join('body'),
      join('species'),
      join('age'),
    ]
      .map((p) => p?.trim())
      .filter((p) => !!p)

    const desc = parts.join(', ').trim()
    return desc || current.name || ''
  }

  const genField = async (field: string, trait?: string) => {
    const char = payload(false)

    if (generating()) {
      toastStore.warn(`Cannot generate: Already generating`)
      return
    }

    setGenerating(true)

    generateField({
      char,
      prop: field,
      trait,
      tick: (res, st) => {
        if (st === 'done' || st === 'error') {
          setGenerating(false)
        }

        if (st !== 'done' && st !== 'partial') return

        if (field === 'persona') {
          const attributes = { ...char.persona.attributes }
          if (!trait) {
            attributes.text = [res]
          } else {
            attributes[trait] = [res]
          }

          setState('persona', { ...char.persona, attributes })
          return
        }

        if (field in state) {
          setState(field as keyof EditState, res)
        }
      },
    })
  }

  const reset = async () => {
    batch(async () => {
      const char = original()
      setState({ ...initState })

      // Persona format is locked to W++ regardless of the source character's
      // stored format. Existing data is migrated into the fixed trait fields below.
      const personaKind = 'wpp'
      for (const [key, field] of fieldMap.entries()) {
        if (!char) setFormField(form(), field, '')
        else setFormField(form(), field, char[key] || '')
      }

      setState('personaKind', personaKind)

      if (char?.originalAvatar) {
        // Intentionally do this in a separate tick
        // It's not worth holding up the editor for this
        Promise.resolve().then(async () => {
          try {
            const base64 = await imageApi.getImageData(char.originalAvatar)
            if (base64) {
              const file = await imageApi.dataURLtoFile(base64)
              receiveAvatar(file, true)
            }
          } catch (ex) {}
        })
      }

      // We set fields that aren't properly managed by form elements
      setState({
        ...char,
        personaKind,
        alternateGreetings: char?.alternateGreetings || [],
        book: char?.characterBook,
        voice: char?.voice || { service: undefined },
        sprite: char?.sprite || undefined,
        visualType: char?.visualType || 'avatar',
        culture: char?.culture || defaultCulture,
        insert: char?.insert ? { prompt: char.insert.prompt, depth: char.insert.depth } : undefined,
        // Flat fields bound to the Selects; concrete so the store signals exist.
        archetype: (char as any)?.progression?.archetype ?? '',
        progressionSpeed: (char as any)?.progression?.speed ?? 'normal',
        gender: (char as any)?.gender ?? '',
        artStyle: (char as any)?.artStyle ?? '',
        ageRange: (char as any)?.ageRange ?? '',
        categoryValue: (char as any)?.category?.[0] ?? '',
        nsfw: (char as any)?.nsfw ?? false,
        loraName: (char as any)?.loraName ?? '',
        imageSeed: (char as any)?.imageSeed ?? makeSeed(),
        // Hydrate the fixed W++ trait fields from the source persona (any format).
        // appearance/gender/ageRange already hydrate via existing code above.
        ...hydratePersonaTraits((char as any)?.persona),
      })
    })
  }

  const clear = () => {
    setImageData()
    load({ ...initState, originalAvatar: undefined })
  }

  const load = (char: NewCharacter | AppSchema.Character) => {
    batch(() => {
      if ('_id' in char) {
        const { avatar, ...incoming } = char
        setOriginal({ ...incoming, originalAvatar: avatar })
        reset()
        return
      }

      setOriginal(char)
      reset()
    })
  }

  const payload = (submitting?: boolean) => {
    const imgId = imageId()
    const data = getPayload(form(), state, original())

    if (submitting) {
      if (imgId !== cache.state.imageId) {
        data.avatar = state.avatar
        setImageId(cache.state.imageId)
      } else {
        delete data.avatar
      }
    }

    return data
  }

  const convert = (): AppSchema.Character => {
    const payload = getPayload(form(), state, original())

    return {
      _id: '',
      kind: 'character',
      userId: '',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      ...payload,
      avatar: imageData(),
    }
  }

  const updateKind = (kind: EditState['personaKind']) => {
    const ref = document.getElementById('character-form') as HTMLFormElement | null

    const attributes = ref ? getAttributeMap(ref) : {}
    const next = Object.values(attributes)
      .map((values) => values.filter((v) => !!v.trim()).join(', '))
      .join('\n\n')

    if (kind === 'text') {
      setState({ personaKind: 'text', persona: { kind: 'text', attributes: { text: [next] } } })
      return
    }

    setState({
      personaKind: 'attributes',
      persona: { kind: 'attributes', attributes: { personality: [next] } },
    })
  }

  return {
    state,
    update: setState,
    updateKind,
    reset,
    load,
    convert,
    payload,
    original,
    clear,
    genOptions,
    createAvatar,
    createGalleryImage,
    rerollSeed,
    applyCover,
    receiveAvatar,
    avatar: imageData,
    generating,
    canGenerate,
    canGuidance: genOptions().length > 0,
    generateField: genField,
    generateAvatar,
    prepare: setForm,
    imageCache: cache,
  }
}

// Maps an existing character's persona (of ANY stored format) into the six flat
// trait fields used by the locked W++ editor. Each trait joins its string[] with
// ', '. Existing 'text'-format characters keep their content via a fallback into
// the Background field so nothing is lost.
/**
 * The canonical Charluv W++ keys the editor manages. `gender`/`appearance` are
 * handled via the Gender facet / appearance field, but are still "consumed" here
 * so they aren't flagged as removable extras.
 */
const FIXED_TRAIT_KEYS = [
  'species',
  'mind',
  'personality',
  'age',
  'job',
  'description',
  'sexuality',
  'likes',
  'loves',
  'zodiac',
  'hates',
  'country',
  'body',
  'appearance',
  'gender',
]

function hydratePersonaTraits(persona?: AppSchema.Persona) {
  const attrs = persona?.attributes ?? {}
  const join = (key: string) => {
    const value = (attrs as Record<string, string[] | undefined>)[key]
    return Array.isArray(value) ? value.join(', ') : ''
  }

  const traits = {
    traitSpecies: join('species'),
    traitMind: join('mind'),
    traitPersonality: join('personality'),
    traitAge: join('age'),
    traitJob: join('job'),
    traitDescription: join('description'),
    traitSexuality: join('sexuality'),
    traitLikes: join('likes'),
    traitLoves: join('loves'),
    traitZodiac: join('zodiac'),
    traitHates: join('hates'),
    traitCountry: join('country'),
    traitBody: join('body'),
  }

  // Fallback: a plain-text persona has no per-trait keys; preserve its content.
  if (persona?.kind === 'text' && !traits.traitDescription) {
    traits.traitDescription = (attrs as Record<string, string[] | undefined>).text?.join(' ') ?? ''
  }

  // Backward-compat: surface any W++ attributes that aren't part of the fixed
  // trait set so the user can see them. They're read-only and dropped on save.
  const consumed = new Set([...FIXED_TRAIT_KEYS, 'text'])
  const personaExtras: Record<string, string[]> = {}
  for (const [key, value] of Object.entries(attrs as Record<string, string[] | undefined>)) {
    if (consumed.has(key)) continue
    if (Array.isArray(value) && value.some((v) => !!v?.trim())) personaExtras[key] = value
  }

  return { ...traits, personaExtras }
}

function getPayload(ev: any, state: EditState, original?: NewCharacter) {
  const body = getStrictForm(ev, newCharGuard)

  // Build the fixed W++ persona from the flat trait fields. appearance/gender/age
  // are reused from their existing form/Discover fields. Each trait is omitted if
  // empty/whitespace so we never persist [''].
  const wppAttributes: Record<string, string[]> = {}
  const addTrait = (key: string, value?: string) => {
    const trimmed = value?.trim()
    if (trimmed) wppAttributes[key] = [trimmed]
  }
  addTrait('species', state.traitSpecies)
  addTrait('mind', state.traitMind)
  addTrait('personality', state.traitPersonality)
  addTrait('age', state.traitAge)
  addTrait('job', state.traitJob)
  addTrait('description', state.traitDescription)
  addTrait('sexuality', state.traitSexuality)
  addTrait('likes', state.traitLikes)
  addTrait('loves', state.traitLoves)
  addTrait('zodiac', state.traitZodiac)
  addTrait('hates', state.traitHates)
  addTrait('country', state.traitCountry)
  addTrait('body', state.traitBody)
  addTrait('appearance', body.appearance)
  // gender is intentionally NOT a persona attribute — it lives in the charluv
  // metadata (char.gender) and is injected into the prompt at chat time.

  const payload = {
    name: body.name,
    description: body.description,
    culture: body.culture || state.culture || defaultCulture,
    tags: state.tags,
    scenario: body.scenario,
    appearance: body.appearance,
    // Sprite editing has been removed from the UI. Always treat the character as
    // an avatar visual type, but forward the original sprite through unchanged so
    // existing characters don't lose their sprite data on save.
    visualType: 'avatar',
    avatar: state.avatar ?? (null as any),
    sprite: original?.sprite ?? state.sprite ?? (null as any),
    greeting: body.greeting,
    sampleChat: body.sampleChat,
    originalAvatar: original?.originalAvatar,
    voiceDisabled: body.voiceDisabled,
    voice: state.voice,

    // charluv fields
    match: state.match?.toString() === 'true' || false,
    premium: state.premium?.toString() === 'true' || false,
    xp: 0,
    share: state.share ?? 'private',
    progression:
      state.archetype || state.progressionSpeed
        ? {
            archetype: state.archetype || undefined,
            speed: (state.progressionSpeed as any) || undefined,
          }
        : undefined,
    gender: state.gender || undefined,
    // Art style is derived from tags (anime/realistic); fall back to the manual
    // facet if no matching tag is present.
    artStyle:
      (state.tags?.includes('anime')
        ? 'anime'
        : state.tags?.includes('realistic')
        ? 'realistic'
        : state.artStyle) || undefined,
    ageRange: state.ageRange || undefined,
    category: state.categoryValue ? [state.categoryValue] : undefined,
    nsfw: state.nsfw || undefined,
    loraName: state.loraName?.trim() || undefined,
    imageSeed: state.imageSeed,

    // These fields no longer have form inputs; pass through existing values so a
    // save doesn't clobber data set elsewhere. creator/characterVersion are now
    // managed server-side (ignored there), but we still forward existing values.
    systemPrompt: state.systemPrompt ?? '',
    postHistoryInstructions: state.postHistoryInstructions ?? '',
    insert: state.insert,
    alternateGreetings: state.alternateGreetings ?? [],
    characterBook: state.book,
    creator: state.creator ?? '',
    extensions: original?.extensions,
    characterVersion: state.characterVersion ?? '',
    // Persona format is locked to W++; attributes assembled from the trait fields.
    persona: {
      kind: 'wpp' as const,
      attributes: wppAttributes,
    },
    imageSettings: {
      type: body.imageType,
      steps: body.imageSteps,
      width: body.imageWidth,
      height: body.imageHeight,
      prefix: body.imagePrefix,
      suffix: body.imageSuffix,
      negative: body.imageNegative,
      cfg: body.imageCfg,
      summariseChat: body.summariseChat,
      summaryPrompt: body.summaryPrompt,
    },
    json: {
      ...state.json,
      enabled: body.jsonSchemaEnabled,
    } as ResponseSchema,
  }

  return payload
}

async function generateAvatar(description: string, seed?: number) {
  const { user } = userStore.getState()
  if (!user) {
    return toastStore.error(`Image generation settings missing`)
  }

  return new Promise<File>((resolve, reject) => {
    characterStore.generateAvatar(
      user,
      description,
      (err, image) => {
        if (image) return resolve(image)
        reject(err)
      },
      seed
    )
  })
}
