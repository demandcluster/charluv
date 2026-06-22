import { Component, For, Show, createEffect, createMemo, createSignal, onMount } from 'solid-js'
import { useNavigate, useParams } from '@solidjs/router'
import './profile.css'
import { matchStore } from '../../store/match'
import { settingStore, userStore } from '../../store'
import { getAssetUrl } from '../../shared/util'
import Loading from '../../shared/Loading'
import TextInput from '../../shared/TextInput'
import { AppSchema } from '/common/types'

type Attributes = Record<string, string[] | undefined>

const attr = (char: AppSchema.Character | undefined, key: string): string | undefined => {
  const attrs = char?.persona?.attributes as Attributes | undefined
  const val = attrs?.[key]
  if (!val?.length) return undefined
  return val.join(', ')
}

const FACETS: { key: string; label: string }[] = [
  { key: 'sexuality', label: 'Sexuality' },
  { key: 'likes', label: 'Likes' },
  { key: 'country', label: 'Country' },
  { key: 'zodiac', label: 'Zodiac' },
  { key: 'job', label: 'Job' },
]

const Profile: Component = () => {
  const params = useParams()
  const navigate = useNavigate()
  const state = matchStore()

  const [name, setName] = createSignal('')

  const char = createMemo<AppSchema.Character | undefined>(() => {
    const fromList = state.discover.list.find((c) => c._id === params.id)
    if (fromList) return fromList
    const selected = state.discover.selected
    if (selected && selected._id === params.id) return selected
    return undefined
  })

  onMount(() => {
    if (!char()) {
      matchStore.getDiscoverChar(params.id)
    }
  })

  // Seed the editable name once the character resolves.
  createEffect(() => {
    const c = char()
    if (c && !name()) setName(c.name || '')
  })

  const age = createMemo(() => {
    const c = char()
    return c?.ageRange || attr(c, 'age')
  })

  // Just the number, for the "Julia, 18" title (age may be "18", "18-21", "18 years old").
  const ageShort = createMemo(() => age()?.match(/\d+/)?.[0] || '')

  const description = createMemo(() => {
    const c = char()
    return attr(c, 'description') || c?.description || ''
  })

  // Cover/avatar first, then gallery, de-duped. One image is "main" (large); the
  // rest are thumbnails that swap it on click.
  const shots = createMemo(() => {
    const c = char()
    if (!c) return [] as string[]
    return Array.from(new Set([c.avatar, ...(c.gallery ?? [])].filter(Boolean) as string[]))
  })
  const [main, setMain] = createSignal<string>()
  createEffect(() => {
    const s = shots()
    if (s.length && (!main() || !s.includes(main()!))) setMain(s[0])
  })

  const initial = () => char()?.name?.[0]?.toUpperCase() || '?'

  const openImage = (url: string) => settingStore.showImage(getAssetUrl(url))

  const onMatch = () => {
    const c = char()
    if (!c) return
    // Cloning a companion writes to the user's collection, so guests must
    // register first. Return them straight back to this profile afterwards.
    if (!userStore().loggedIn) {
      navigate(`/register?return=/discover/${c._id}`)
      return
    }
    matchStore.createMatch(c, navigate, name().trim() || c.name)
  }

  return (
    <div class="dpf-root">
      <Show when={char()} fallback={<div class="dpf-loading"><Loading /></div>}>
        <div class="dpf-layout">
          {/* Main image */}
          <Show
            when={main()}
            fallback={<div class="dpf-ph" aria-hidden="true">{initial()}</div>}
          >
            <button
              type="button"
              class="dpf-main-btn"
              aria-label={`View photo of ${char()!.name} fullscreen`}
              onClick={() => openImage(main()!)}
            >
              <img class="dpf-main" src={getAssetUrl(main()!)} alt={`Photo of ${char()!.name}`} />
            </button>
          </Show>

          {/* Detail */}
          <div class="dpf-detail">
            <h1 class="dpf-title">
              {name() || char()!.name}
              <Show when={ageShort()}>
                <span class="dpf-title-age">, {ageShort()}</span>
              </Show>
            </h1>

            <div class="dpf-field">
              <TextInput
                fieldName="matchName"
                label="Name (you can rename them before matching)"
                value={name()}
                onInputText={setName}
              />
            </div>

            <Show when={description()}>
              <div class="dpf-field">
                <label>About</label>
                <p class="dpf-desc">{description()}</p>
              </div>
            </Show>

            <Show when={FACETS.some((f) => attr(char(), f.key))}>
              <dl class="dpf-facets">
                <For each={FACETS}>
                  {(facet) => (
                    <Show when={attr(char(), facet.key)}>
                      <div class="dpf-facet">
                        <dt>{facet.label}</dt>
                        <dd>{attr(char(), facet.key)}</dd>
                      </div>
                    </Show>
                  )}
                </For>
              </dl>
            </Show>

            <Show when={shots().length > 1}>
              <div class="dpf-thumbs">
                <For each={shots()}>
                  {(url, i) => (
                    <button
                      type="button"
                      class="dpf-thumb"
                      classList={{ active: main() === url }}
                      aria-pressed={main() === url}
                      aria-label={`Show photo ${i() + 1}`}
                      onClick={() => setMain(url)}
                    >
                      <img src={getAssetUrl(url)} alt="" loading="lazy" />
                    </button>
                  )}
                </For>
              </div>
            </Show>

            <div class="dpf-actions">
              <button class="dpf-btn primary" onClick={onMatch}>
                Match &amp; Start Chat
              </button>
              <button class="dpf-btn ghost" onClick={() => navigate('/discover')}>
                Back
              </button>
            </div>
          </div>
        </div>
      </Show>
    </div>
  )
}

export default Profile
