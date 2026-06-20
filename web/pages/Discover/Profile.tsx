import { Component, For, Show, createEffect, createMemo, createSignal, onMount } from 'solid-js'
import { useNavigate, useParams } from '@solidjs/router'
import './profile.css'
import { matchStore } from '../../store/match'
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

  const description = createMemo(() => {
    const c = char()
    return attr(c, 'description') || c?.description || ''
  })

  const gallery = createMemo(() => char()?.gallery?.filter(Boolean) ?? [])

  const initial = () => char()?.name?.[0]?.toUpperCase() || '?'

  const onMatch = () => {
    const c = char()
    if (!c) return
    matchStore.createMatch(c, navigate, name().trim() || c.name)
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
                  <img
                    class="dpf-shot"
                    src={getAssetUrl(char()!.avatar!)}
                    alt={`Photo of ${char()!.name}`}
                  />
                </div>
              </Show>
            }
          >
            <div class="dpf-gallery" classList={{ 'is-single': gallery().length === 1 }}>
              <For each={gallery()}>
                {(url, i) => (
                  <img
                    class="dpf-shot"
                    src={getAssetUrl(url)}
                    alt={`Photo ${i() + 1} of ${char()!.name}`}
                    loading={i() === 0 ? 'eager' : 'lazy'}
                  />
                )}
              </For>
            </div>
          </Show>

          {/* Detail */}
          <div class="dpf-detail">
            <Show when={age()}>
              <div class="dpf-age">Age {age()}</div>
            </Show>

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
