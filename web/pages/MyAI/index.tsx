import { Component, For, Show, createMemo, onMount } from 'solid-js'
import { useNavigate, A } from '@solidjs/router'
import { Plus } from '/web/icons'
import '../Discover/discover.css'
import './myai.css'
import { characterStore } from '../../store/character'
import { getAssetUrl } from '../../shared/util'
import { getCharacterLevel } from '/common/xplevel'
import { resolveStage } from '/common/progression'
import { AppSchema } from '/common/types'

const MyAI: Component = () => {
  const navigate = useNavigate()
  const state = characterStore()

  onMount(() => {
    // Always refresh so publish/edit state (e.g. the Public/Private tag) is
    // current when returning to the list. `loaded` is a timestamp, so the old
    // `!loaded` guard never refetched after the first visit.
    characterStore.getCharacters(true)
  })

  // The user's companions, most-recently-updated first.
  const companions = createMemo(() =>
    [...state.characters.list].sort((a, b) =>
      (b.updatedAt || '').localeCompare(a.updatedAt || '')
    )
  )

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
            <Plus size={16} aria-hidden="true" /> New companion
          </A>
        </div>
      </header>

      <div class="dsc-grid">
        <Show
          when={state.characters.loaded}
          fallback={<For each={Array.from({ length: 6 })}>{() => <div class="dsc-skel" />}</For>}
        >
          <Show
            when={companions().length}
            fallback={
              <div class="dsc-empty">
                No companions yet — head to <A href="/discover" style={{ color: 'var(--dsc-green)' }}>Discover</A> and pick one.
              </div>
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
        <Show when={props.char.progression?.archetype}>
          <div class="dsc-tags">
            <span class="dsc-pill">{props.char.progression!.archetype}</span>
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
