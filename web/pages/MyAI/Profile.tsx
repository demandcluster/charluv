import { Component, For, Show, createMemo, onMount } from 'solid-js'
import { A, useNavigate, useParams } from '@solidjs/router'
import '../Discover/profile.css'
import { characterStore } from '../../store/character'
import { settingStore } from '../../store/settings'
import { startChat } from '../../store/chat'
import { getAssetUrl } from '../../shared/util'
import Loading from '../../shared/Loading'
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

  const gallery = createMemo(() => char()?.gallery?.filter(Boolean) ?? [])

  const initial = () => char()?.name?.[0]?.toUpperCase() || '?'

  const openImage = (url: string) => settingStore.showImage(getAssetUrl(url))

  const onChat = () => {
    const c = char()
    if (!c) return
    startChat(c, navigate)
  }

  return (
    <div class="dpf-root">
      <Show when={char()} fallback={<div class="dpf-loading"><Loading /></div>}>
        <div class="dpf-layout">
          {/* Gallery */}
          <Show
            when={gallery().length}
            fallback={
              <Show
                when={char()!.avatar}
                fallback={<div class="dpf-ph" aria-hidden="true">{initial()}</div>}
              >
                <div class="dpf-gallery is-single">
                  <button
                    type="button"
                    class="dpf-shot-btn"
                    aria-label={`View photo of ${char()!.name} fullscreen`}
                    onClick={() => openImage(char()!.avatar!)}
                  >
                    <img
                      class="dpf-shot"
                      src={getAssetUrl(char()!.avatar!)}
                      alt={`Photo of ${char()!.name}`}
                    />
                  </button>
                </div>
              </Show>
            }
          >
            <div class="dpf-gallery" classList={{ 'is-single': gallery().length === 1 }}>
              <For each={gallery()}>
                {(url, i) => (
                  <button
                    type="button"
                    class="dpf-shot-btn"
                    aria-label={`View photo ${i() + 1} of ${char()!.name} fullscreen`}
                    onClick={() => openImage(url)}
                  >
                    <img
                      class="dpf-shot"
                      src={getAssetUrl(url)}
                      alt={`Photo ${i() + 1} of ${char()!.name}`}
                      loading={i() === 0 ? 'eager' : 'lazy'}
                    />
                  </button>
                )}
              </For>
            </div>
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

            <div class="dpf-actions">
              <button class="dpf-btn primary" onClick={onChat}>
                Chat
              </button>
              <A class="dpf-btn ghost" href={`/character/${params.id}/edit`}>
                Edit
              </A>
              <A class="dpf-btn ghost" href="/mine">
                Back
              </A>
            </div>
          </div>
        </div>
      </Show>
    </div>
  )
}

export default Profile
