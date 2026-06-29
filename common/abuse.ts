/**
 * Decide how to treat a new registration given whether its device fingerprint
 * and/or IP already belong to an existing account.
 *
 * - both match  -> block   (very high confidence: same person)
 * - one matches -> restrict (likely duplicate: create, but withhold farmable credits)
 * - neither     -> allow   (normal signup)
 */
export function classifyRegistration(opts: {
  fpMatch: boolean
  ipMatch: boolean
}): 'block' | 'restrict' | 'allow' {
  if (opts.fpMatch && opts.ipMatch) return 'block'
  if (opts.fpMatch || opts.ipMatch) return 'restrict'
  return 'allow'
}
