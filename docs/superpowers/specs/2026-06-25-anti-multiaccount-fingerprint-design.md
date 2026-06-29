# Anti-Multi-Account: Device Fingerprint + IP — Design

Date: 2026-06-25
Branch: feat/charluv-rewrite

## Goal

Stop credit farming via mass account creation, without hard-locking out legitimate
users who share a device or IP (households, libraries, mobile carriers/CGNAT).

Charluv stores an IP per user (`lastIp`) and today hard-blocks "1 account per IP" at
registration. That is both bypassable (VPN / mobile data) and over-blocks shared IPs.
We add a device-fingerprint signal and replace the blunt IP block with a graded response.

## Non-goals

- No external/paid fingerprint service (EU data + cost + the repo's local-first ethos).
  Use the open-source client library only.
- No cookie banner and no cookies set. Consent for the device identifier is collected via a
  **required checkbox at registration** (see §3.1) and disclosed in the privacy policy (§6).
  User-facing copy speaks of "identifiers", never the word "fingerprinting".
- No data migration. All schema changes are additive.

## 1. Detection signals & decision matrix

On **register**, the server computes two booleans against existing accounts:

- `fpMatch` — another user already has this device fingerprint
- `ipMatch` — another user already has this IP (existing `checkIp`)

| fpMatch | ipMatch | outcome     |
|---------|---------|-------------|
| ✓       | ✓       | **block**   (403 — high confidence same person) |
| ✓       | ✗       | **restrict** |
| ✗       | ✓       | **restrict** |
| ✗       | ✗       | **allow** (normal signup) |

This **relaxes** today's behavior: IP-only now *restricts* instead of hard-blocking.

**"restrict"** = account is created, but:
- signup credits = **0** (not 200)
- free-credit refills **disabled**
- flagged for admin (`creditsRestricted: true`, `restrictedReason`)

A farmer's extra accounts are useless. A false-positive legit user can still
buy/redeem credits and go premium, and an admin can clear the restriction.

**block** = registration refused with a 403 and a message directing the user to
Discord if they lost their password (consistent with the current IP-block copy).

## 2. Data model (additive — no migration)

On `AppSchema.User` (`common/types/schema.ts`):

```ts
fingerprint?: string                                   // device visitorId (FingerprintJS)
identifierConsentAt?: string                           // ISO ts when the user accepted the
                                                       // identifier-collection checkbox
creditsRestricted?: boolean                            // true => no bonus, no refills
restrictedReason?: 'ip' | 'fingerprint' | 'both'       // for the admin view
```

Index (`srv/db/client.ts:createIndexes`): `db('user').createIndex({ fingerprint: 1 })`.

Note: `restrictedReason: 'fingerprint'` is the internal value; it is never shown to end
users. Admin-facing labels may say "device" instead.

## 3. Fingerprint capture (OSS FingerprintJS)

### 3.1 Consent gate (required at registration)
- The register form gets a **required, unticked checkbox** with user-friendly wording
  about *identifiers* (never "fingerprinting"), e.g.:
  > "I agree to Charluv storing device and account identifiers to prevent abuse and the
  > creation of multiple accounts. See our Privacy Policy."
  (The Privacy-Policy link points at the clause from §6.)
- **Client**: the "Register" button is disabled until the box is ticked; the FingerprintJS
  `visitorId` is only computed when it is ticked. The POST sends `consent: true` and the
  `fingerprint`.
- **Server**: `register` requires `consent === true` (else 400 "You must accept the
  identifier policy to register"). On success, store `identifierConsentAt = now()`.
- Because consent is a condition of registration, *every* account that exists has been
  fingerprinted with consent — a farmer cannot opt out of the signal while keeping an
  account. (Trade-off: consent-as-condition has a GDPR "freely given" soft spot; accepted
  as a documented, defensible risk given no email is collected and the anti-fraud need.)

### 3.2 Capture
- Add `@fingerprintjs/fingerprintjs` (MIT) to the web bundle.
- On the **register** page (post-consent), compute the `visitorId` (in-browser, no network
  calls) and include it as `fingerprint` in the POST to `/user/register`.
- **Register**: store `fingerprint` AND `lastIp` on the new user *immediately at
  creation*. Today `lastIp` is only set on login — a fast-farm gap; setting both at
  creation puts brand-new accounts into the matching pool right away.
- **Login**: unchanged — no fingerprinting at login. The device id is captured once, at
  registration, where consent is explicit and just given; re-capturing at login would mean
  accessing the device outside the consented flow for no real gain. The matching pool grows
  from new registrations (the actual farming vector), which is sufficient: a returning
  farmer's device was already fingerprinted when they registered.
- If the library fails or no fingerprint arrives, `fpMatch = false`; the IP path still
  governs (IP-only ⇒ restrict). Evasion only downgrades a would-be block to a useless
  restricted account — farming is defeated either way.

## 4. Server enforcement

### Pure decision helper (unit-tested)
New file `common/abuse.ts` (dependency-free, importable by `tests/` without a DB):

```ts
export function classifyRegistration(opts: { fpMatch: boolean; ipMatch: boolean }):
  'block' | 'restrict' | 'allow' {
  if (opts.fpMatch && opts.ipMatch) return 'block'
  if (opts.fpMatch || opts.ipMatch) return 'restrict'
  return 'allow'
}
```

The `register` handler imports `classifyRegistration` from `/common/abuse`.

### DB layer (`srv/db/user.ts`)
- `checkFingerprint(fingerprint?: string): Promise<boolean>` — mirror `checkIp`: true if
  any user already has this fingerprint. Returns false for empty input.
- `createUser(newUser, admin?, opts?)` — add an options arg:
  `opts?: { restricted?: boolean; restrictedReason?: 'ip'|'fingerprint'|'both';
  fingerprint?: string; ip?: string }`. When `restricted`, set `credits: 0`,
  `creditsRestricted: true`, `restrictedReason`. Always persist `fingerprint` and
  `lastIp` on the new doc when provided.

### Register handler (`srv/api/user/auth.ts`)
```ts
assertValid(
  { handle:'string', username:'string', password:'string', fingerprint:'string?', consent:'boolean?' },
  req.body
)
if (req.body.consent !== true)
  throw new StatusError('You must accept the identifier policy to register', 400)
const fpMatch = await store.users.checkFingerprint(req.body.fingerprint)
const ipMatch = await store.users.checkIp(req.ip)
const verdict = classifyRegistration({ fpMatch, ipMatch })
if (verdict === 'block') throw new StatusError('Only 1 account per device/IP. ...Discord...', 403)
const reason = fpMatch && ipMatch ? 'both' : fpMatch ? 'fingerprint' : ipMatch ? 'ip' : undefined
const { profile, token, user } = await store.users.createUser(req.body, false, {
  restricted: verdict === 'restrict',
  restrictedReason: reason,
  fingerprint: req.body.fingerprint,
  ip: req.ip,
  consentAt: new Date().toISOString(),
})
```
`createUser` persists `identifierConsentAt = opts.consentAt` alongside the other fields.

### Login handler (`srv/api/user/auth.ts`)
Unchanged — `updateIp(userId, req.ip)` as today. No fingerprint at login (capture is
registration-only, §3.2).

### Free-credit refills (`srv/db/credits.ts:getFreeCredits`)
Add `creditsRestricted: { $ne: true }` to BOTH the free and premium refill find-queries
so restricted accounts never receive automatic refills. (Premium/expired-premium queries
unaffected — paying users are never restricted in practice, but the filter is harmless.)

## 5. Admin

- **User info** (`srv/db/admin.ts` projection + `web/store/admin.ts` `UserInfo` +
  `web/pages/Admin/UsersPage.tsx`): surface `creditsRestricted` and `restrictedReason`.
- **Clear restriction** action: a new admin endpoint
  (`POST /admin/users/:userId/clear-restriction`, `isAdmin`) that sets
  `creditsRestricted: false`, clears `restrictedReason`, and tops the user up to the
  standard 200 signup credits if they are below it (re-enabling future refills).
  Wire an `adminStore.clearRestriction(userId)` action + a button in UsersPage.

## 6. Privacy policy update (required)

`web/pages/PrivacyPolicy/index.tsx` — add a short clause under the existing
data-collection / security section. It must be **accurate** even though the UI checkbox
uses plain "identifier" wording: state that, to prevent fraud and abuse (creating multiple
accounts to farm free credits), we collect and store your IP address and a **device
identifier derived from your browser and device characteristics**, that you consent to this
at registration, and that it is processed for fraud prevention (consent + legitimate
interest) and retained with your account. Keep the tone/format consistent with the
surrounding policy text. Copy change only.

## 7. Error handling

- All server rejections via `StatusError` (existing pattern); the 403 block message
  matches the current IP-block phrasing (mentions Discord for password recovery).
- Missing/blank fingerprint is treated as "no match" everywhere (never throws).
- Fingerprint computation failures on the client are swallowed; the request proceeds
  without a fingerprint (server degrades to IP-only ⇒ restrict).

## 8. Testing

- Unit: `classifyRegistration` — all four matrix cells.
- Unit: `checkFingerprint` empty-input guard (pure portion) — or covered via the helper.
- DB-touching paths (`getFreeCredits` filter, `createUser` options, admin clear) have no
  test harness in this repo; verified by `pnpm typecheck` + srv typecheck + manual smoke.
  Note this limitation explicitly in the plan.

## 9. Existing members (pre-feature accounts)

Decision: **leave them alone** (option A).

- **Never retroactively restricted.** The restrict/block logic runs only at new
  registration. Every current account keeps its credits and free refills untouched.
- **They still feed the IP signal.** Existing accounts already carry `lastIp`, so a new
  signup from a current member's IP trips `ipMatch` with no change to the old account.
- **They are not fingerprinted** (they never consented, and fingerprinting happens only at
  registration — §3.2). The fingerprint pool grows from new registrations — which is the
  actual farming vector (mass new accounts on one device).
- Known residual gap (accepted): a farmer with one old, un-fingerprinted account who
  creates new accounts on the same device but rotating IPs would not be caught by the
  fingerprint. Closing it (a one-time login consent prompt for existing users) is a
  possible future follow-up, not in this scope.

## 10. Out of scope

- Retroactively fingerprinting historical accounts (they backfill on next login).
- Threshold/velocity rules (N accounts per fingerprint), bot detection, TLS/JA3
  fingerprinting. The single-match graded response is sufficient for the credit-farming
  threat and keeps false positives low.
