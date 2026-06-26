import { Component, createEffect, createMemo, createSignal, For, onCleanup, Show } from 'solid-js'
import { Portal } from 'solid-js/web'
import { useNavigate } from '@solidjs/router'
import { getAssetUrl } from '../../shared/util'
import { characterStore, chatStore } from '../../store'
import './event.css'

const WHENS = ['Morning', 'Afternoon', 'Evening', 'Late night']
const VIBES = ['Chill', 'Flirty', 'Tense', 'Chaotic', 'Formal', 'Erotic/NSFW']
// Label → stored value. Controls how often the director injects a world beat.
const DIRECTOR_EVENTS: Array<{ label: string; value: string }> = [
  { label: 'None', value: 'none' },
  { label: 'Rare', value: 'rare' },
  { label: 'Normal', value: 'normal' },
  { label: 'Regular', value: 'regular' },
]
// How the director clause of the living logline reads for each cadence.
const DIRECTOR_CLAUSE: Record<string, string> = {
  none: 'stays out',
  rare: 'rarely steps in',
  normal: 'nudges normally',
  regular: 'steps in often',
}

const CreateEventModal: Component<{ show: boolean; close: () => void }> = (props) => {
  const navigate = useNavigate()
  const state = characterStore()
  const [location, setLocation] = createSignal('')
  const [description, setDescription] = createSignal('')
  const [when, setWhen] = createSignal(WHENS[1])
  const [vibe, setVibe] = createSignal(VIBES[0])
  const [directorEvents, setDirectorEvents] = createSignal('normal')
  const [note, setNote] = createSignal('')
  const [selected, setSelected] = createSignal<Record<string, boolean>>({})
  const [memoryDisabled, setMemoryDisabled] = createSignal(true)

  let whereRef: HTMLInputElement | undefined

  const chars = createMemo(() => state.characters.list)
  const ids = createMemo(() =>
    Object.entries(selected())
      .filter(([, v]) => v)
      .map(([k]) => k)
  )
  const canStart = createMemo(
    () => !!location().trim() && !!description().trim() && ids().length > 0
  )
  const toggle = (id: string) => setSelected((s) => ({ ...s, [id]: !s[id] }))

  // Names of the selected cast, in roster order, for the logline.
  const castNames = createMemo(() => {
    const sel = selected()
    return chars()
      .filter((c) => sel[c._id])
      .map((c) => c.name)
  })

  const start = () => {
    if (!canStart()) return
    chatStore.createEvent(
      {
        location: location().trim(),
        description: description().trim(),
        characterIds: ids(),
        memoryDisabled: memoryDisabled(),
        when: when(),
        vibe: vibe(),
        directorEvents: directorEvents(),
        note: note().trim() || undefined,
      },
      (id: string) => {
        props.close()
        navigate(`/chat/${id}`)
      }
    )
  }

  // Body scroll lock + Escape-to-close + autofocus, only while shown.
  createEffect(() => {
    if (!props.show) return

    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') props.close()
    }
    window.addEventListener('keydown', onKey)

    // Focus the first field once it has mounted.
    const focusTimer = window.setTimeout(() => whereRef?.focus(), 0)

    onCleanup(() => {
      document.body.style.overflow = prevOverflow
      window.removeEventListener('keydown', onKey)
      window.clearTimeout(focusTimer)
    })
  })

  const onBackdrop = (e: MouseEvent) => {
    // Only a true gutter click (the scroll container itself) dismisses.
    if (e.target === e.currentTarget) props.close()
  }

  const autoGrow = (el: HTMLTextAreaElement) => {
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }

  return (
    <Show when={props.show}>
      <Portal>
        <div
          class="evt-root evt-overlay"
          role="dialog"
          aria-modal="true"
          aria-label="Start an event"
          onClick={onBackdrop}
        >
          <div class="evt-page">
            <button class="evt-close" aria-label="Close" onClick={props.close}>
              ✕
            </button>

            {/* MASTHEAD */}
            <div class="evt-head">
              <span class="evt-kicker">NEW EVENT</span>
              <h1 class="evt-title">
                Set the <em>scene</em>
              </h1>
              <p class="evt-dek">Pick a place, a moment, and who's in the room.</p>
            </div>

            {/* THE BILLBOARD — required prose */}
            <div class="evt-block evt-billboard">
              <div>
                <label class="evt-caplabel" for="evt-where">
                  WHERE<span class="evt-req">*</span>
                </label>
                <input
                  id="evt-where"
                  ref={whereRef}
                  class="evt-headline-input"
                  type="text"
                  placeholder="a rooftop bar, her apartment, the old pier…"
                  value={location()}
                  onInput={(e) => setLocation(e.currentTarget.value)}
                />
              </div>
              <div>
                <label class="evt-caplabel" for="evt-what">
                  WHAT'S HAPPENING<span class="evt-req">*</span>
                </label>
                <textarea
                  id="evt-what"
                  class="evt-body-input"
                  rows={2}
                  placeholder="Saturday DJ night — she's been waiting by the bar…"
                  value={description()}
                  onInput={(e) => {
                    setDescription(e.currentTarget.value)
                    autoGrow(e.currentTarget)
                  }}
                />
              </div>
            </div>

            {/* THE DIALS — pill rows */}
            <div class="evt-block evt-dials">
              <div>
                <span class="evt-caplabel">WHEN</span>
                <div class="evt-pillrow">
                  <For each={WHENS}>
                    {(opt) => (
                      <button
                        type="button"
                        class="evt-chip"
                        data-on={when() === opt}
                        onClick={() => setWhen(opt)}
                      >
                        {opt}
                      </button>
                    )}
                  </For>
                </div>
              </div>
              <div>
                <span class="evt-caplabel">VIBE</span>
                <div class="evt-pillrow">
                  <For each={VIBES}>
                    {(opt) => (
                      <button
                        type="button"
                        class="evt-chip"
                        data-on={vibe() === opt}
                        data-nsfw={opt === 'Erotic/NSFW'}
                        onClick={() => setVibe(opt)}
                      >
                        {opt}
                      </button>
                    )}
                  </For>
                </div>
              </div>
              <div>
                <span class="evt-caplabel">DIRECTOR</span>
                <div class="evt-pillrow">
                  <For each={DIRECTOR_EVENTS}>
                    {(opt) => (
                      <button
                        type="button"
                        class="evt-chip"
                        data-on={directorEvents() === opt.value}
                        onClick={() => setDirectorEvents(opt.value)}
                      >
                        {opt.label}
                      </button>
                    )}
                  </For>
                </div>
                <p class="evt-help">
                  How often the director adds a scene beat (an announcement, an arrival) to drive
                  the story.
                </p>
              </div>
            </div>

            {/* THE CAST — selectable photo cards */}
            <div class="evt-block">
              <div class="evt-cast-head">
                <h2 class="evt-section">The cast</h2>
                <span class="evt-count">{ids().length} invited</span>
              </div>
              <Show
                when={chars().length}
                fallback={
                  <div class="evt-empty">You have no characters yet. Create one first.</div>
                }
              >
                <div class="evt-cast-scroll">
                  <div class="evt-cast-grid">
                    <For each={chars()}>
                      {(c) => {
                        const isSel = () => !!selected()[c._id]
                        return (
                          <button
                            type="button"
                            class="evt-cast-card"
                            aria-pressed={isSel()}
                            aria-label={c.name}
                            onClick={() => toggle(c._id)}
                          >
                            <Show
                              when={c.avatar}
                              fallback={
                                <div class="evt-ph">{c.name?.[0]?.toUpperCase() || '?'}</div>
                              }
                            >
                              <img
                                class="evt-cast-photo"
                                src={getAssetUrl(c.avatar!)}
                                alt={c.name}
                                loading="lazy"
                              />
                            </Show>
                            <div class="evt-scrim" />
                            <Show when={isSel()}>
                              <span class="evt-check" aria-hidden="true">
                                ✓
                              </span>
                            </Show>
                            <span class="evt-cast-name">{c.name}</span>
                          </button>
                        )
                      }}
                    </For>
                  </div>
                </div>
              </Show>
            </div>

            {/* THE ASIDE — director's note */}
            <div class="evt-block evt-aside">
              <label class="evt-aside-label" for="evt-note">
                Director's note — they never read this.
              </label>
              <textarea
                id="evt-note"
                class="evt-note-input"
                placeholder="Keep it playful; have someone spill a drink early; nudge Mia and Jade together."
                value={note()}
                onInput={(e) => setNote(e.currentTarget.value)}
              />
            </div>

            {/* THE FINE PRINT — memory */}
            <div class="evt-block evt-fineprint">
              <input
                id="evt-memory"
                class="evt-switch"
                type="checkbox"
                checked={memoryDisabled()}
                onChange={(e) => setMemoryDisabled(e.currentTarget.checked)}
              />
              <div>
                <label class="evt-fineprint-label" for="evt-memory">
                  Keep this off the record
                </label>
                <p class="evt-help">
                  Nothing said in this event is remembered or recalled later. On by default.
                </p>
              </div>
            </div>

            {/* STICKY FOOTER — living logline + CTA */}
            <div class="evt-footer">
              <p class="evt-logline">
                {when()} at{' '}
                <Show when={location().trim()} fallback={<span class="evt-blank">[a place]</span>}>
                  {location().trim()}
                </Show>{' '}
                — {vibe().toLowerCase()}
                <Show when={memoryDisabled()}>, off the record</Show>, with{' '}
                <Show when={castNames().length} fallback={<span class="evt-blank">[someone]</span>}>
                  {castNames().slice(0, 3).join(' & ')}
                  <Show when={castNames().length > 3}> +{castNames().length - 3} more</Show>
                </Show>
                . Director {DIRECTOR_CLAUSE[directorEvents()]}.
                <Show when={!description().trim()}>
                  {' '}
                  <span class="evt-blank">[a happening]</span>
                </Show>
              </p>

              <div class="evt-actions">
                <Show when={!canStart()}>
                  <span class="evt-hint">Add a place, a happening, and at least one guest.</span>
                </Show>
                <button type="button" class="evt-cancel" onClick={props.close}>
                  Cancel
                </button>
                <button type="button" class="evt-start" disabled={!canStart()} onClick={start}>
                  Start the night
                </button>
              </div>
            </div>
          </div>
        </div>
      </Portal>
    </Show>
  )
}

export default CreateEventModal
