import { Component, For, Show, createMemo, createSignal, onMount } from 'solid-js'
import { A, useNavigate } from '@solidjs/router'
import { Sparkles } from 'lucide-solid'
import './discover.css'
import { matchStore, DiscoverFilters } from '../../store/match'
import { userStore } from '../../store'
import { getAssetUrl } from '../../shared/util'
import { getArchetype } from '/common/progression'
import { AppSchema } from '/common/types'

const GENDERS = [
  { value: '', label: 'Everyone' },
  { value: 'female', label: 'Women' },
  { value: 'male', label: 'Men' },
  { value: 'nonbinary', label: 'Nonbinary' },
]
const STYLES = [
  { value: '', label: 'Any style' },
  { value: 'realistic', label: 'Realistic' },
  { value: 'anime', label: 'Anime' },
]
const SORTS: { value: DiscoverFilters['sort']; label: string }[] = [
  { value: 'trending', label: 'Trending' },
  { value: 'popular', label: 'Popular' },
  { value: 'new', label: 'New' },
]

const Discover: Component = () => {
  const navigate = useNavigate()
  const state = matchStore()

  const [gender, setGender] = createSignal('')
  const [style, setStyle] = createSignal('')
  const [sort, setSort] = createSignal<DiscoverFilters['sort']>('trending')
  const [sfw, setSfw] = createSignal(false)
  const [search, setSearch] = createSignal('')

  const load = () =>
    matchStore.discover({
      gender: gender() || undefined,
      artStyle: style() || undefined,
      sort: sort(),
      nsfw: sfw() ? false : undefined,
      search: search() || undefined,
    })

  onMount(load)

  let debounce: any
  const onSearch = (v: string) => {
    setSearch(v)
    clearTimeout(debounce)
    debounce = setTimeout(load, 300)
  }

  const pick = (char: AppSchema.Character) => navigate(`/discover/${char._id}`)

  return (
    <div class="dsc-root">
      <header class="dsc-head">
        <div class="dsc-intro">
          <h1 class="dsc-title">
            Find your <em>someone</em>
          </h1>
          <p class="dsc-tag">
            Companions who grow with you. Start a conversation — your relationship deepens the more
            you talk.
          </p>
        </div>
        <Show when={userStore().loggedIn}>
          <A class="dsc-create" href="/create">
            <Sparkles size={17} /> Create your dream date
          </A>
        </Show>
      </header>

      <div class="dsc-filters" role="search">
        <div class="dsc-group" role="group" aria-label="Gender">
          <For each={GENDERS}>
            {(g) => (
              <button
                class="dsc-chip"
                data-on={gender() === g.value}
                onClick={() => {
                  setGender(g.value)
                  load()
                }}
              >
                {g.label}
              </button>
            )}
          </For>
        </div>

        <span class="dsc-label">Style</span>
        <div class="dsc-group" role="group" aria-label="Art style">
          <For each={STYLES}>
            {(s) => (
              <button
                class="dsc-chip"
                data-on={style() === s.value}
                onClick={() => {
                  setStyle(s.value)
                  load()
                }}
              >
                {s.label}
              </button>
            )}
          </For>
        </div>

        <button
          class="dsc-chip"
          data-on={sfw()}
          aria-pressed={sfw()}
          onClick={() => {
            setSfw(!sfw())
            load()
          }}
        >
          {sfw() ? '✓ ' : ''}SFW only
        </button>

        <span class="dsc-spacer" />

        <input
          class="dsc-search"
          type="search"
          placeholder="Search by name or tag…"
          aria-label="Search companions"
          value={search()}
          onInput={(e) => onSearch(e.currentTarget.value)}
        />

        <div class="dsc-group" role="group" aria-label="Sort">
          <For each={SORTS}>
            {(s) => (
              <button
                class="dsc-chip"
                data-on={sort() === s.value}
                onClick={() => {
                  setSort(s.value)
                  load()
                }}
              >
                {s.label}
              </button>
            )}
          </For>
        </div>
      </div>

      <div class="dsc-grid">
        <Show
          when={!state.discover.loading}
          fallback={<For each={Array.from({ length: 8 })}>{() => <div class="dsc-skel" />}</For>}
        >
          <Show
            when={state.discover.list.length}
            fallback={
              <div class="dsc-empty">
                <p>No companions match those filters yet. Try widening them — or make your own.</p>
                <A class="dsc-create" href="/create">
                  <Sparkles size={17} /> Create your dream date
                </A>
              </div>
            }
          >
            <For each={state.discover.list}>{(char) => <Card char={char} onPick={pick} />}</For>
          </Show>
        </Show>
      </div>
    </div>
  )
}

const Card: Component<{ char: AppSchema.Character; onPick: (c: AppSchema.Character) => void }> = (
  props
) => {
  const [broken, setBroken] = createSignal(false)
  // Only the (level-independent) archetype label — public templates are always
  // level 0, so a stage badge would just read "Novice" on every card.
  const stageLabel = createMemo(() => getArchetype(props.char.progression?.archetype)?.label)
  const eng = () => props.char.engagement
  const initial = () => props.char.name?.[0]?.toUpperCase() || '?'

  return (
    <article
      class="dsc-card"
      tabindex="0"
      onClick={() => props.onPick(props.char)}
      onKeyDown={(e) => e.key === 'Enter' && props.onPick(props.char)}
    >
      <Show when={stageLabel()}>
        <span class="dsc-badge">{stageLabel()}</span>
      </Show>
      <Show when={props.char.nsfw}>
        <span class="dsc-badge" data-nsfw="true">
          18+
        </span>
      </Show>

      <Show
        when={props.char.avatar && !broken()}
        fallback={<div class="dsc-ph">{initial()}</div>}
      >
        <img
          class="dsc-photo"
          src={getAssetUrl(props.char.avatar!)}
          alt={props.char.name}
          loading="lazy"
          onError={() => setBroken(true)}
        />
      </Show>
      <div class="dsc-scrim" />

      <div class="dsc-meta">
        <div class="dsc-name">
          {props.char.name} <Show when={props.char.ageRange}><span>· {props.char.ageRange}</span></Show>
        </div>
        <Show when={props.char.category?.length}>
          <div class="dsc-tags">
            <For each={props.char.category!.slice(0, 3)}>{(c) => <span class="dsc-pill">{c}</span>}</For>
          </div>
        </Show>
        <Show when={eng()}>
          <div class="dsc-engage">
            <span>♥ {eng()!.favorites ?? 0}</span>
            <span>💬 {eng()!.chats ?? 0}</span>
          </div>
        </Show>
      </div>

      <button class="dsc-cta" onClick={(e) => (e.stopPropagation(), props.onPick(props.char))}>
        Start chatting
      </button>
    </article>
  )
}

export default Discover
