import { Component, Show, createMemo } from 'solid-js'
import { Heart } from 'lucide-solid'
import { AppSchema } from '/common/types'
import { getCharacterLevel } from '/common/xplevel'
import { resolveStage, getProgressionSteps } from '/common/progression'

/**
 * Compact relationship indicator shown above the chat input: the companion's
 * current level and stage, derived live from the copy's xp + progression. Only
 * rendered for characters that have progression configured.
 */
const StageIndicator: Component<{ char?: AppSchema.Character }> = (props) => {
  const level = createMemo(() => getCharacterLevel(props.char?.xp))
  const step = createMemo(() => resolveStage(level(), props.char?.progression))

  // Progress toward the next stage threshold, for the bar.
  const progress = createMemo(() => {
    const steps = getProgressionSteps(props.char?.progression)
    if (!steps.length) return 0
    const cur = step()
    const idx = steps.findIndex((s) => s === cur)
    const next = steps[idx + 1]
    if (!next) return 100
    const span = next.minLevel - (cur?.minLevel ?? 0)
    if (span <= 0) return 100
    return Math.max(0, Math.min(100, ((level() - (cur?.minLevel ?? 0)) / span) * 100))
  })

  return (
    <Show when={props.char?.progression && step()}>
      <div
        class="mb-1 flex items-center gap-2 self-start rounded-full px-3 py-1 text-xs"
        style={{ background: 'rgba(85,184,156,0.14)', color: 'rgb(120,210,185)' }}
        title={`Level ${level()} — ${step()!.stage}`}
      >
        <Heart size={13} fill="currentColor" />
        <span style={{ 'font-weight': 700 }}>Lv {level()}</span>
        <span style={{ opacity: 0.85 }}>{step()!.stage.replace('BDSM/', '')}</span>
        <span
          class="ml-1 h-1 w-16 overflow-hidden rounded-full"
          style={{ background: 'rgba(255,255,255,0.15)' }}
        >
          <span
            class="block h-full"
            style={{ width: `${progress()}%`, background: 'rgb(85,184,156)' }}
          />
        </span>
      </div>
    </Show>
  )
}

export default StageIndicator
