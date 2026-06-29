import { Component, Show } from 'solid-js'
import { A } from '@solidjs/router'
import { LogIn, Sparkles } from '/web/icons'
import { settingStore } from '../store'
import { soundEmitter } from './Audio/playable-events'
import logoDark from '../asset/logoDark.png'

/**
 * Full-width header for logged-out visitors. Replaces the left drawer on the
 * landing/browse pages so the gallery can run edge-to-edge — guests only see
 * the side menu once they sign in.
 */
const GuestTopBar: Component = () => {
  const cfg = settingStore((s) => ({ canAuth: s.config.canAuth }))

  return (
    <header
      data-header=""
      class="flex h-[56px] shrink-0 items-center justify-between gap-4 border-b border-[var(--bg-800)] bg-[var(--menu-bg)] px-4 sm:px-8"
    >
      <A href="/" aria-label="Charluv home" class="flex items-center">
        <span class="flex items-center rounded-md px-3 py-1.5" style={{ background: '#55b89c' }}>
          <img src={logoDark} alt="Charluv" class="h-6 w-auto sm:h-7" />
        </span>
      </A>

      <nav class="flex items-center gap-2 sm:gap-3" aria-label="Guest">
        <Show when={cfg.canAuth}>
          <A
            href="/login"
            class="flex items-center gap-1.5 rounded-full px-3 py-2 text-sm text-[var(--text-700)] transition-colors hover:bg-[var(--bg-800)] hover:text-[var(--text-900)]"
            onClick={() => soundEmitter.emit('menu-item-clicked', 'login')}
          >
            <LogIn size={16} aria-hidden="true" /> Login
          </A>
        </Show>

        <A
          href="/create"
          class="flex items-center gap-1.5 rounded-full bg-[var(--hl-500)] px-4 py-2 text-sm font-medium text-[var(--bg-900)] transition-colors hover:bg-[var(--hl-400)]"
        >
          <Sparkles size={16} color="currentColor" aria-hidden="true" /> Create your dream date
        </A>
      </nav>
    </header>
  )
}

export default GuestTopBar
