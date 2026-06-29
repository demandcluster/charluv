import FingerprintJS from '@fingerprintjs/fingerprintjs'

let cached: Promise<string | undefined> | undefined

/**
 * Compute a device identifier (FingerprintJS visitorId). Runs entirely in the
 * browser (no network). Returns undefined if it fails — callers degrade to the
 * IP-only path server-side. Only call this AFTER the user has consented.
 */
export function getVisitorId(): Promise<string | undefined> {
  if (cached) return cached
  cached = FingerprintJS.load()
    .then((fp) => fp.get())
    .then((res) => res.visitorId)
    .catch(() => undefined)
  return cached
}
