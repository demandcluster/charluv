import { Component, For, Show, createEffect, createMemo, createSignal, onMount } from 'solid-js'
import { A, useNavigate, useParams } from '@solidjs/router'
import '../Discover/profile.css'
import { characterStore } from '../../store/character'
import { settingStore } from '../../store/settings'
import { startChat } from '../../store/chat'
import { getAssetUrl } from '../../shared/util'
import Loading from '../../shared/Loading'
import { Globe } from 'lucide-solid'
import MakePublicModal from './MakePublicModal'
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
  const state = characterStore()

  // Prefer the freshly-fetched detail (has gallery/persona); fall back to the
  // list copy so we can render immediately while the detail loads.
  const char = createMemo<AppSchema.Character | undefined>(() => {
    const editing = state.editing
    if (editing && editing._id === params.id) return editing
    return state.characters.list.find((c) => c._id === params.id)
  })

  onMount(() => {
    characterStore.getCharacter(params.id)
  })

  const age = createMemo(() => {
    const c = char()
    return c?.ageRange || attr(c, 'age')
  })

  // Just the number, for the "Julia, 18" title.
  const ageShort = createMemo(() => age()?.match(/\d+/)?.[0] || '')

  const description = createMemo(() => {
    const c = char()
    return attr(c, 'description') || c?.description || ''
  })

  // The full photo set = cover/avatar first, then the gallery, de-duped. One
  // image is "main" (large); the rest are thumbnails that swap it on click.
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

  const [showPublish, setShowPublish] = createSignal(false)
  const isPublic = createMemo(() => char()?.published && char()?.moderation?.status !== 'hidden')
  // Was public, then edited — needs re-publishing to go live again.
  const needsRepublish = createMemo(
    () => !char()?.published && char()?.moderation?.status === 'review'
  )

  const onChat = () => {
    const c = char()
    if (!c) return
    startChat(c, navigate)
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
              {char()!.name}
              <Show when={ageShort()}>
                <span class="dpf-title-age">, {ageShort()}</span>
              </Show>
            </h1>

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
              <button class="dpf-btn primary" onClick={onChat}>
                Chat
              </button>
              <A class="dpf-btn ghost" href={`/character/${params.id}/edit`}>
                Edit
              </A>
              <Show
                when={!isPublic()}
                fallback={
                  <span class="dpf-public-tag">
                    <Globe size={15} /> Public
                  </span>
                }
              >
                <button class="dpf-btn ghost" onClick={() => setShowPublish(true)}>
                  <Globe size={15} /> {needsRepublish() ? 'Re-publish' : 'Make public'}
                </button>
              </Show>
              <A class="dpf-btn ghost" href="/mine">
                Back
              </A>
            </div>
          </div>
        </div>

        <MakePublicModal
          show={showPublish()}
          close={() => setShowPublish(false)}
          char={char()!}
        />
      </Show>
    </div>
  )
}

export default Profile
