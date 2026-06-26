/// <reference types="vite-plugin-pwa/client" />
import { createSignal } from 'solid-js'

// True once a new service worker has been installed and is waiting — i.e. a new
// app version is ready. Drives the in-app "update available" prompt.
const [needRefresh, setNeedRefresh] = createSignal(false)
export { needRefresh }

let updateSW: ((reloadPage?: boolean) => Promise<void>) | undefined

/**
 * Register the service worker and wire the update prompt. No-op in dev (the SW
 * is only built in production — devOptions.enabled is false in vite.config.ts).
 * With registerType 'prompt' the new SW waits instead of activating itself, so
 * the user decides when to reload (applyUpdate) and lose no in-flight state.
 */
export async function initPwa() {
  if (import.meta.env.DEV) return
  const { registerSW } = await import('virtual:pwa-register')
  updateSW = registerSW({
    immediate: true,
    onNeedRefresh() {
      setNeedRefresh(true)
    },
  })
}

/** Activate the waiting SW (skipWaiting) and reload with the fresh assets. */
export function applyUpdate() {
  setNeedRefresh(false)
  void updateSW?.(true)
}

/** Dismiss the prompt; the update still applies on the next natural reload. */
export function dismissUpdate() {
  setNeedRefresh(false)
}
