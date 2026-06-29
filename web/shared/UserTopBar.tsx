import { Component, Show, createSignal, onCleanup } from 'solid-js'
import { A } from '@solidjs/router'
import { Coins, Menu, Star } from '/web/icons'
import { settingStore, userStore } from '../store'
import type { AppSchema } from '/common/types/schema'

/**
 * Slim header for logged-in visitors: the credits balance + premium status,
 * relocated out of the side menu. Keeps the mobile hamburger (the drawer is
 * collapsed on small screens) and leaves branding to the drawer below.
 */
const UserTopBar: Component = () => {
  const user = userStore()
  const [secLeft, setSecLeft] = createSignal<number | false>(false)

  const interval = setInterval(() => {
    const recharged =
      (user.user as (AppSchema.User & { recharged?: number }) | undefined)?.recharged || 0
    if (!recharged) return
    const diff = recharged + 120000 - new Date().getTime()
    setSecLeft(diff > 0 ? Math.floor(diff / 1000) : false)
  }, 425)
  onCleanup(() => clearInterval(interval))

  const credits = () => user.user?.credits ?? 0
  const lowCredits = () => (user.user?.premium ? credits() < 1000 : credits() < 200)

  return (
    <header
      data-header=""
      class="flex h-12 shrink-0 items-center justify-between gap-3 border-b border-[var(--bg-800)] bg-[var(--menu-bg)] px-3 sm:px-6"
    >
      {/* The side drawer is only force-open at xl (≥1280px); below that it's
          collapsed, so the opener must be visible the whole way down — not just
          on mobile. `xl:hidden` matches the platform xl threshold exactly, which
          `sm:hidden` (640px) did not, leaving a dead band where neither this nor
          the chat-only floating hamburger showed. */}
      <div
        class="icon-button w-8 xl:hidden"
        role="button"
        aria-label="Open menu"
        onClick={() => settingStore.menu()}
      >
        <Menu class="cursor-pointer" />
      </div>
      <div class="hidden xl:block" />

      <div class="flex items-center gap-2 sm:gap-3">
        <A
          href="/premium"
          class="flex items-center gap-1.5 rounded-full bg-[var(--bg-800)] px-3 py-1.5 text-sm transition-colors hover:bg-[var(--bg-700)]"
          aria-label={`${credits()} credits — get more`}
        >
          <Coins size={16} class="text-yellow-500" aria-hidden="true" />
          <span class="font-semibold">{credits()}</span>
          <Show when={lowCredits()}>
            <span class="text-600 text-xs">
              · {secLeft() !== false ? `${secLeft()}s` : 'recharging'}
            </span>
          </Show>
        </A>

        <Show
          when={user.user?.premium}
          fallback={
            <A
              href="/premium"
              class="rounded-full border border-[var(--hl-500)] px-3 py-1.5 text-sm text-[var(--hl-400)] transition-colors hover:bg-[var(--hl-900)]"
            >
              Upgrade
            </A>
          }
        >
          <span class="flex items-center gap-1 text-sm text-yellow-500" title="Premium member">
            <Star size={15} fill="currentColor" aria-hidden="true" /> Premium
          </span>
        </Show>
      </div>
    </header>
  )
}

export default UserTopBar
