import { Component, For, Show, createMemo, createSignal, onMount } from 'solid-js'
import { useNavigate, A } from '@solidjs/router'
import { Plus } from '/web/icons'
import '../Discover/discover.css'
import './myai.css'
import { characterStore } from '../../store/character'
import { getAssetUrl } from '../../shared/util'
import { getCharacterLevel } from '/common/xplevel'
import { resolveStage, getArchetype } from '/common/progression'
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

const MyAI: Component = () => {
  const navigate = useNavigate()
  const state = characterStore()

  // Unlike Discover (server-side query), /mine filters the already-loaded list
  // client-side. No popular/trending/new sort — these are the user's own
  // companions, so we keep a recently-updated default and add a Favourites
  // toggle Discover doesn't have.
  const [gender, setGender] = createSignal('')
  const [style, setStyle] = createSignal('')
  const [sfw, setSfw] = createSignal(false)
  const [favorite, setFavorite] = createSignal(false)
  const [search, setSearch] = createSignal('')

  onMount(() => {
    // Always refresh so publish/edit state (e.g. the Public/Private tag) is
    // current when returning to the list. `loaded` is a timestamp, so the old
    // `!loaded` guard never refetched after the first visit.
    characterStore.getCharacters(true)
  })

  // The user's companions, filtered then most-recently-updated first.
  const companions = createMemo(() => {
    const term = search().trim().toLowerCase()
    return state.characters.list
      .filter((c) => {
        if (gender() && c.gender !== gender()) return false
        if (style() && c.artStyle !== style()) return false
        if (sfw() && c.nsfw) return false
        if (favorite() && !c.favorite) return false
        if (term) {
          const inName = c.name?.toLowerCase().includes(term)
          const inTags = c.category?.some((t) => t.toLowerCase().includes(term))
          if (!inName && !inTags) return false
        }
        return true
      })
      .sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''))
  })

  const open = (char: AppSchema.Character) => navigate(`/mine/${char._id}`)

  return (
    <div class="dsc-root">
      <header class="dsc-head">
        <h1 class="dsc-title">
          My <em>AI</em>
        </h1>
        <p class="dsc-tag">
          Your companions and the relationships you're building. Pick up where you left off — or find
          someone new in <A href="/discover" style={{ color: 'var(--dsc-green)' }}>Discover</A>.
        </p>
        <div class="myai-actions">
          <A class="myai-new" href="/create">
            <Plus size={16} color="currentColor" aria-hidden="true" /> New companion
          </A>
        </div>
      </header>

      <div class="dsc-filters" role="search">
        <div class="dsc-group" role="group" aria-label="Gender">
          <For each={GENDERS}>
            {(g) => (
              <button class="dsc-chip" data-on={gender() === g.value} onClick={() => setGender(g.value)}>
                {g.label}
              </button>
            )}
          </For>
        </div>

        <span class="dsc-label">Style</span>
        <div class="dsc-group" role="group" aria-label="Art style">
          <For each={STYLES}>
            {(s) => (
              <button class="dsc-chip" data-on={style() === s.value} onClick={() => setStyle(s.value)}>
                {s.label}
              </button>
            )}
          </For>
        </div>

        <button
          class="dsc-chip"
          data-on={favorite()}
          aria-pressed={favorite()}
          onClick={() => setFavorite(!favorite())}
        >
          {favorite() ? '★ ' : '☆ '}Favourites
        </button>

        <button
          class="dsc-chip"
          data-on={sfw()}
          aria-pressed={sfw()}
          onClick={() => setSfw(!sfw())}
        >
          {sfw() ? '✓ ' : ''}SFW only
        </button>

        <span class="dsc-spacer" />

        <input
          class="dsc-search"
          type="search"
          placeholder="Search by name or tag…"
          aria-label="Search your companions"
          value={search()}
          onInput={(e) => setSearch(e.currentTarget.value)}
        />
      </div>

      <div class="dsc-grid">
        <Show
          when={state.characters.loaded}
          fallback={<For each={Array.from({ length: 6 })}>{() => <div class="dsc-skel" />}</For>}
        >
          <Show
            when={companions().length}
            fallback={
              <Show
                when={state.characters.list.length}
                fallback={
                  <div class="dsc-empty">
                    No companions yet — head to <A href="/discover" style={{ color: 'var(--dsc-green)' }}>Discover</A> and pick one.
                  </div>
                }
              >
                <div class="dsc-empty">No companions match those filters. Try widening them.</div>
              </Show>
            }
          >
            <For each={companions()}>{(char) => <Companion char={char} onOpen={open} />}</For>
          </Show>
        </Show>
      </div>
    </div>
  )
}

const Companion: Component<{ char: AppSchema.Character; onOpen: (c: AppSchema.Character) => void }> = (
  props
) => {
  const level = createMemo(() => getCharacterLevel(props.char.xp))
  const stage = createMemo(() => resolveStage(level(), props.char.progression))
  const initial = () => props.char.name?.[0]?.toUpperCase() || '?'
  const isPublic = createMemo(
    () => props.char.published && props.char.moderation?.status !== 'hidden'
  )

  return (
    <article
      class="dsc-card"
      tabindex="0"
      onClick={() => props.onOpen(props.char)}
      onKeyDown={(e) => e.key === 'Enter' && props.onOpen(props.char)}
    >
      <span class="dsc-badge">Lv {level()}{stage() ? ` · ${stage()!.stage.replace('BDSM/', '')}` : ''}</span>

      <span class="myai-status" classList={{ public: isPublic(), private: !isPublic() }}>
        {isPublic() ? 'Public' : 'Private'}
      </span>

      <Show when={props.char.avatar} fallback={<div class="dsc-ph">{initial()}</div>}>
        <img class="dsc-photo" src={getAssetUrl(props.char.avatar!)} alt={props.char.name} loading="lazy" />
      </Show>
      <div class="dsc-scrim" />

      <div class="dsc-meta">
        <div class="dsc-name">{props.char.name}</div>
        <Show when={props.char.progression?.archetype || props.char.loraName}>
          <div class="dsc-tags">
            <Show when={props.char.progression?.archetype}>
              <span class="dsc-pill">
                {getArchetype(props.char.progression!.archetype)?.label ||
                  props.char.progression!.archetype}
              </span>
            </Show>
            <Show when={props.char.loraName}>
              <span class="dsc-pill dsc-pill-lora">LoRA</span>
            </Show>
          </div>
        </Show>
      </div>

      <button class="dsc-cta" onClick={(e) => (e.stopPropagation(), props.onOpen(props.char))}>
        Continue
      </button>
    </article>
  )
}

export default MyAI
