import { Component, Show } from 'solid-js'
import Button from './Button'
import { needRefresh, applyUpdate, dismissUpdate } from '../pwa'

/** In-app banner shown when a new app version has been installed by the service
 * worker. Lets the user reload now or dismiss (the update applies on next load). */
const UpdatePrompt: Component = () => {
  return (
    <Show when={needRefresh()}>
      <div class="fixed bottom-4 left-1/2 z-[60] flex max-w-[92vw] -translate-x-1/2 items-center gap-3 rounded-lg border border-[var(--bg-700)] bg-[var(--bg-900)] px-4 py-3 shadow-lg">
        <span class="text-sm">A new version of Charluv is available.</span>
        <Button size="sm" onClick={applyUpdate}>
          Reload
        </Button>
        <button class="text-500 text-sm hover:underline" onClick={dismissUpdate}>
          Later
        </button>
      </div>
    </Show>
  )
}

export default UpdatePrompt
