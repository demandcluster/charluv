# Anti-Multi-Account: Device Fingerprint + IP — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop credit farming via mass account creation using a device fingerprint (consented, at registration) + IP, with a graded restrict/block response — without retroactively touching existing accounts.

**Architecture:** Active client-side FingerprintJS (OSS) computes a `visitorId` at registration behind a required consent checkbox. The server compares it (and the IP) against existing accounts: `fp && ip` → block; `fp || ip` → restrict (account created but 0 signup credits + free refills disabled + admin flag); neither → normal. Restricted accounts are excluded from the free-credit refill cron. Admin can clear a restriction. All schema changes additive; existing members untouched.

**Tech Stack:** TypeScript, Express + MongoDB (`srv/`), SolidJS (`web/`), isomorphic `common/`, mocha tests, `@fingerprintjs/fingerprintjs` (MIT).

## Global Constraints

- NO data migrations; additive schema only. Use `pnpm`, never `npm`.
- Commit only `.ts`/`.tsx` sources for srv/web (srv `.js` is gitignored); test `.spec.js`/`.js.map` ARE force-added (compiled via `tsc -p srv.tsconfig.json`, which emits srv+common+tests). Do NOT commit compiled web `.js`.
- Tests are `tests/*.spec.ts`; run `pnpm test` (mocha on compiled `tests/**.spec.js`). Compile first with `NODE_OPTIONS=--max-old-space-size=6144 npx tsc -p srv.tsconfig.json`. There is NO DB/HTTP test harness — only pure helpers get unit tests.
- srv typecheck: `NODE_OPTIONS=--max-old-space-size=6144 npx tsc -p srv.tsconfig.json --noEmit`. web typecheck: `pnpm typecheck` (web has ~0 errors now; introduce none).
- Fingerprint is captured **at registration only** (never at login). Consent is a **required checkbox** at register, worded around "identifiers" — never the word "fingerprinting" in user-facing copy. Privacy policy must be accurate (device identifier derived from browser/device characteristics).
- Decision matrix: `fp&&ip`→block, `fp||ip`→restrict, else allow. Restrict = `credits:0`, `creditsRestricted:true`, `restrictedReason`, no free refills.
- Existing accounts are never retroactively restricted or fingerprinted.
- Commit message trailer (exact):
  ```
  Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01XXNb2Kcdayr1ZvUpy5a3nA
  ```

---

### Task 1: Schema fields, index, and the pure decision helper

**Files:**
- Modify: `common/types/schema.ts` (User interface ~line 188, near `lastIp`)
- Create: `common/abuse.ts`
- Modify: `srv/db/client.ts` (`createIndexes`, after the user indexes ~line 147)
- Test: `tests/abuse.spec.ts`

**Interfaces:**
- Produces:
  - `AppSchema.User.fingerprint?: string`, `identifierConsentAt?: string`, `creditsRestricted?: boolean`, `restrictedReason?: 'ip' | 'fingerprint' | 'both'`
  - `classifyRegistration(opts: { fpMatch: boolean; ipMatch: boolean }): 'block' | 'restrict' | 'allow'` from `/common/abuse`

- [ ] **Step 1: Write the failing test**

Create `tests/abuse.spec.ts`:

```ts
import { expect } from 'chai'
import { classifyRegistration } from '/common/abuse'

describe('classifyRegistration', () => {
  it('blocks when both fingerprint and IP match', () => {
    expect(classifyRegistration({ fpMatch: true, ipMatch: true })).to.equal('block')
  })
  it('restricts when only the fingerprint matches', () => {
    expect(classifyRegistration({ fpMatch: true, ipMatch: false })).to.equal('restrict')
  })
  it('restricts when only the IP matches', () => {
    expect(classifyRegistration({ fpMatch: false, ipMatch: true })).to.equal('restrict')
  })
  it('allows when neither matches', () => {
    expect(classifyRegistration({ fpMatch: false, ipMatch: false })).to.equal('allow')
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd /home/dlite/charluv && NODE_OPTIONS=--max-old-space-size=6144 npx tsc -p srv.tsconfig.json && pnpm test -- --grep classifyRegistration`
Expected: FAIL — module `/common/abuse` not found.

- [ ] **Step 3: Create `common/abuse.ts`**

```ts
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
```

- [ ] **Step 4: Add the User schema fields**

In `common/types/schema.ts`, inside the `User` interface near `lastIp?: string` (~line 188), add:

```ts
    /** Device identifier (FingerprintJS visitorId) captured at registration, with
     * consent, to detect multiple-account abuse. */
    fingerprint?: string
    /** ISO timestamp when the user accepted the identifier-collection checkbox at registration. */
    identifierConsentAt?: string
    /** True when this account matched an existing fingerprint or IP at signup: it
     * receives no signup bonus and no automatic free-credit refills until cleared. */
    creditsRestricted?: boolean
    /** Why the account was restricted (admin context; never shown to end users). */
    restrictedReason?: 'ip' | 'fingerprint' | 'both'
```

- [ ] **Step 5: Add the fingerprint index**

In `srv/db/client.ts` `createIndexes()`, after the `db('user')` index block (~line 147):

```ts
  await db('user').createIndex({ fingerprint: 1 }, { name: 'user_fingerprint' })
```

- [ ] **Step 6: Compile and run the test (GREEN)**

Run: `cd /home/dlite/charluv && NODE_OPTIONS=--max-old-space-size=6144 npx tsc -p srv.tsconfig.json && pnpm test -- --grep classifyRegistration`
Expected: PASS (4 passing).

- [ ] **Step 7: Typecheck**

Run: `cd /home/dlite/charluv && pnpm typecheck` (expect no new errors) and `NODE_OPTIONS=--max-old-space-size=6144 npx tsc -p srv.tsconfig.json --noEmit` (expect 0).

- [ ] **Step 8: Commit**

```bash
git add common/types/schema.ts common/abuse.ts srv/db/client.ts tests/abuse.spec.ts tests/abuse.spec.js tests/abuse.spec.js.map
git commit -m "feat(abuse): add fingerprint/restriction schema, index, and classifyRegistration

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01XXNb2Kcdayr1ZvUpy5a3nA"
```

---

### Task 2: DB layer — checkFingerprint, createUser opts, clearRestriction, refill filter

**Files:**
- Modify: `srv/db/user.ts` (`checkFingerprint` near `checkIp` ~line 82; `createUser` ~line 105; add `clearRestriction`)
- Modify: `srv/db/credits.ts` (`getFreeCredits` queries ~line 28-33)

**Interfaces:**
- Consumes: `db` from `./client`; `AppSchema.User` fields from Task 1.
- Produces:
  - `checkFingerprint(fingerprint?: string): Promise<boolean>`
  - `createUser(newUser, admin?, opts?)` where `opts?: { restricted?: boolean; restrictedReason?: 'ip'|'fingerprint'|'both'; fingerprint?: string; ip?: string; consentAt?: string }`
  - `clearRestriction(userId: string): Promise<void>`

- [ ] **Step 1: Add `checkFingerprint`**

In `srv/db/user.ts`, after `checkIp` (~line 88), add:

```ts
export async function checkFingerprint(fingerprint?: string) {
  if (!fingerprint) return false
  const count = await db('user').countDocuments({ kind: 'user', fingerprint })
  return count > 0
}
```

- [ ] **Step 2: Extend `createUser` with options**

Change the `createUser` signature (`srv/db/user.ts:105`) and the user-doc construction. New signature:

```ts
export async function createUser(
  newUser: NewUser,
  admin?: boolean,
  opts?: {
    restricted?: boolean
    restrictedReason?: 'ip' | 'fingerprint' | 'both'
    fingerprint?: string
    ip?: string
    consentAt?: string
  }
) {
```

In the `const user: AppSchema.User = { ... }` literal, change `credits: 200,` to:

```ts
    credits: opts?.restricted ? 0 : 200,
```

and add these fields to the literal (after `createdAt`):

```ts
    creditsRestricted: opts?.restricted || undefined,
    restrictedReason: opts?.restrictedReason,
    fingerprint: opts?.fingerprint || undefined,
    lastIp: opts?.ip || undefined,
    identifierConsentAt: opts?.consentAt,
```

(Leaving these `undefined` when not provided keeps the doc clean; `ignoreUndefined` is set on the Mongo client.)

- [ ] **Step 3: Add `clearRestriction`**

In `srv/db/user.ts` (near `updateUser`), add:

```ts
export async function clearRestriction(userId: string) {
  const user = await db('user').findOne({ kind: 'user', _id: userId })
  if (!user) throw errors.NotFound
  const credits = (user.credits || 0) < 200 ? 200 : user.credits
  await db('user').updateOne(
    { kind: 'user', _id: userId },
    { $set: { creditsRestricted: false, restrictedReason: undefined as any, credits }, $unset: { restrictedReason: '' } }
  )
}
```

(`errors` is already imported in this file via `../api/wrap` — verify; if not, import `{ errors }` from `'../api/wrap'`. Use whatever the file already uses for not-found.)

- [ ] **Step 4: Filter restricted accounts out of free-credit refills**

In `srv/db/credits.ts` `getFreeCredits`, add `creditsRestricted: { $ne: true }` to BOTH refill find-queries:

```ts
  const users = await db('user')
    .find({ kind: 'user', nextCredits: { $lte: now }, premium: false, credits: { $lt: 500 }, creditsRestricted: { $ne: true } })
    .toArray()
  const premiumUsers = await db('user')
    .find({ kind: 'user', nextCredits: { $lte: now }, credits: { $lt: 5000 }, premium: true, creditsRestricted: { $ne: true } })
    .toArray()
```

(Leave the `expiredPremium` query unchanged.)

- [ ] **Step 5: srv typecheck**

Run: `cd /home/dlite/charluv && NODE_OPTIONS=--max-old-space-size=6144 npx tsc -p srv.tsconfig.json --noEmit`
Expected: 0 errors. (No DB test harness exists — these paths are typecheck-verified per Global Constraints.)

- [ ] **Step 6: Commit**

```bash
git add srv/db/user.ts srv/db/credits.ts
git commit -m "feat(abuse): checkFingerprint, restricted createUser opts, clearRestriction, refill filter

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01XXNb2Kcdayr1ZvUpy5a3nA"
```

---

### Task 3: Register/login handlers

**Files:**
- Modify: `srv/api/user/auth.ts` (`register` ~line 12; `login` ~line 26)

**Interfaces:**
- Consumes: `classifyRegistration` from `/common/abuse`; `store.users.checkFingerprint`, `checkIp`, `createUser` (Task 1/2).

- [ ] **Step 1: Update the register handler**

Replace the body of `register` (`srv/api/user/auth.ts:12-24`) with:

```ts
export const register = handle(async (req) => {
  assertValid(
    {
      handle: 'string',
      username: 'string',
      password: 'string',
      fingerprint: 'string?',
      consent: 'boolean?',
    },
    req.body
  )

  if (req.body.consent !== true) {
    throw new StatusError('You must accept the identifier policy to register', 400)
  }

  const fpMatch = await store.users.checkFingerprint(req.body.fingerprint)
  const ipMatch = await store.users.checkIp(req.ip)
  const verdict = classifyRegistration({ fpMatch, ipMatch })

  if (verdict === 'block') {
    throw new StatusError(
      'Only 1 account per device/IP. Go to our Discord if you lost your password.',
      403
    )
  }

  const restrictedReason = fpMatch && ipMatch ? 'both' : fpMatch ? 'fingerprint' : ipMatch ? 'ip' : undefined

  const { profile, token, user } = await store.users.createUser(req.body, false, {
    restricted: verdict === 'restrict',
    restrictedReason,
    fingerprint: req.body.fingerprint,
    ip: req.ip,
    consentAt: new Date().toISOString(),
  })

  req.log.info({ user: user.username, id: user._id, verdict }, 'User registered')
  return { profile, token, user }
})
```

Add the import at the top of the file:

```ts
import { classifyRegistration } from '/common/abuse'
```

- [ ] **Step 2: Leave login unchanged for fingerprint**

Confirm `login` still does `await store.users.updateIp(result.user._id, req.ip)` and nothing fingerprint-related is added. (No edit needed — this step is a guard against over-building.)

- [ ] **Step 3: srv typecheck**

Run: `cd /home/dlite/charluv && NODE_OPTIONS=--max-old-space-size=6144 npx tsc -p srv.tsconfig.json --noEmit`
Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
git add srv/api/user/auth.ts
git commit -m "feat(abuse): gate registration on consent + fingerprint/IP verdict

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01XXNb2Kcdayr1ZvUpy5a3nA"
```

---

### Task 4: Admin — surface restriction + clear it

**Files:**
- Modify: `srv/db/admin.ts` (`getUserInfo` projection ~line 130)
- Modify: `srv/api/admin.ts` (add route + handler)
- Modify: `web/store/admin.ts` (`UserInfo` type + `clearRestriction` action)
- Modify: `web/pages/Admin/UsersPage.tsx` (display + button)

**Interfaces:**
- Consumes: `store.users.clearRestriction` (Task 2).
- Produces: `POST /admin/users/:userId/clear-restriction`; `adminStore.clearRestriction(userId, onSuccess?)`.

- [ ] **Step 1: Add fields to the admin user-info projection**

In `srv/db/admin.ts` `getUserInfo`, in the `db('user').findOne` projection object (~line 130), add:

```ts
          creditsRestricted: 1,
          restrictedReason: 1,
```

Then ensure the returned `info`/state object includes them. Read the function's return shape and add `creditsRestricted: billing?.creditsRestricted` and `restrictedReason: billing?.restrictedReason` to the returned object (match the existing pattern for `username`/`sub`/etc.).

- [ ] **Step 2: Add the admin route + handler**

In `srv/api/admin.ts`, add a handler near the other user handlers:

```ts
const clearRestriction = handle(async (req) => {
  const userId = req.params.userId
  if (!userId) throw new StatusError('Missing userId', 400)
  await store.users.clearRestriction(userId)
  return { success: true }
})
```

and register it with the other admin routes (the router already applies `loggedIn, isAdmin`):

```ts
router.post('/users/:userId/clear-restriction', clearRestriction)
```

- [ ] **Step 3: Add the store action + UserInfo fields**

In `web/store/admin.ts`, add to the `UserInfo` type:

```ts
  creditsRestricted?: boolean
  restrictedReason?: 'ip' | 'fingerprint' | 'both'
```

and add an action in the store's action object:

```ts
    async clearRestriction(_, userId: string, onSuccess?: () => void) {
      const res = await api.post(`/admin/users/${userId}/clear-restriction`)
      if (res.error) return toastStore.error(`Failed to clear restriction: ${res.error}`)
      if (res.result) {
        toastStore.success('Restriction cleared')
        onSuccess?.()
      }
    },
```

- [ ] **Step 4: Show the flag + clear button in UsersPage**

In `web/pages/Admin/UsersPage.tsx`, where the selected user's info is shown, add (match the file's existing JSX/Show patterns; `info` is the `adminStore` user-info object):

```tsx
<Show when={info()?.creditsRestricted}>
  <div class="flex items-center gap-2">
    <Pill type="orange">Credit-restricted ({info()?.restrictedReason})</Pill>
    <Button
      size="sm"
      onClick={() => adminStore.clearRestriction(info()!.userId, () => adminStore.getInfo(info()!.userId))}
    >
      Clear restriction
    </Button>
  </div>
</Show>
```

(Use the actual accessor for the user-info signal and the actual "refresh info" action name in this file — read them first. If `Pill` isn't imported, use a plain styled `span`. Keep imports valid: no unused imports.)

- [ ] **Step 5: Typecheck**

Run: `cd /home/dlite/charluv && pnpm typecheck` (no new errors in the touched files) and `NODE_OPTIONS=--max-old-space-size=6144 npx tsc -p srv.tsconfig.json --noEmit` (0).

- [ ] **Step 6: Commit**

```bash
git add srv/db/admin.ts srv/api/admin.ts web/store/admin.ts web/pages/Admin/UsersPage.tsx
git commit -m "feat(abuse): admin view + clear for credit-restricted accounts

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01XXNb2Kcdayr1ZvUpy5a3nA"
```

---

### Task 5: Client — FingerprintJS + consent checkbox + send to register

**Files:**
- Modify: `package.json` (add dependency via pnpm)
- Create: `web/shared/fingerprint.ts`
- Modify: `web/store/user.ts` (`register` action ~line 554)
- Modify: `web/pages/Login/index.tsx` (`RegisterForm` ~line 132)
- Modify: `web/pages/PrivacyPolicy/index.tsx` (clause)

**Interfaces:**
- Consumes: `POST /user/register` now accepts `{ fingerprint?, consent }` (Task 3).
- Produces: `getVisitorId(): Promise<string | undefined>` from `web/shared/fingerprint.ts`; `userStore.register(newUser, fingerprint?, consent?, onSuccess?)`.

- [ ] **Step 1: Install FingerprintJS**

Run: `cd /home/dlite/charluv && pnpm add @fingerprintjs/fingerprintjs`
Expected: added to `package.json` dependencies; `pnpm-lock.yaml` updated.

- [ ] **Step 2: Create the fingerprint helper**

Create `web/shared/fingerprint.ts`:

```ts
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
```

- [ ] **Step 3: Thread fingerprint + consent through the register store action**

In `web/store/user.ts`, change the `register` action signature and POST body:

```ts
    async *register(
      _,
      newUser: { handle: string; username: string; password: string },
      fingerprint: string | undefined,
      consent: boolean,
      onSuccess?: () => void
    ) {
      yield { loading: true }

      const res = await api.post('/user/register', { ...newUser, fingerprint, consent })
      yield { loading: false }
      if (res.error) {
        return void toastStore.error(`Failed to register: ${res.error}`)
      }
      // ...unchanged below (setAuth, yield state, toast, onSuccess, publish, events)
```

(Keep everything after the error check exactly as it is.)

- [ ] **Step 4: Add the consent checkbox + fingerprint to RegisterForm**

In `web/pages/Login/index.tsx` `RegisterForm`:

Add a consent signal at the top of the component:

```tsx
  const [consent, setConsent] = createSignal(false)
```

Make `register` async, compute the visitorId only after consent, and pass both through:

```tsx
  const register = async (evt: Event) => {
    const { username, password, confirm, handle } = getStrictForm(evt, {
      handle: 'string',
      username: 'string',
      password: 'string',
      confirm: 'string',
    })

    if (!handle || !username || !password) return
    if (password !== confirm) {
      toastStore.warn('Passwords do not match', 2)
      return
    }
    if (!consent()) {
      toastStore.warn('Please accept the identifier policy to register', 3)
      return
    }

    const fingerprint = await getVisitorId()
    const dest = internalReturn(query.return) || '/profile'
    userStore.register({ handle, username, password }, fingerprint, true, () => navigate(dest))
  }
```

Add the import:

```tsx
import { getVisitorId } from '../../shared/fingerprint'
```

Add the checkbox into the form (replace the empty `<div></div>` placeholder at ~line 183), and gate the submit button on consent:

```tsx
        <label class="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            class="mt-1"
            checked={consent()}
            onChange={(e) => setConsent(e.currentTarget.checked)}
          />
          <span>
            I agree to Charluv storing device and account identifiers to prevent abuse and the
            creation of multiple accounts. See our{' '}
            <A class="link" href="/privacy">
              Privacy Policy
            </A>
            .
          </span>
        </label>
```

Change the submit button to also disable until consented:

```tsx
      <Button type="submit" disabled={props.isLoading || !consent()}>
        {props.isLoading ? 'Registering...' : 'Register'}
      </Button>
```

(`A` is from `@solidjs/router` — confirm it's imported in this file; it is used elsewhere in it. `createSignal` is already imported.)

- [ ] **Step 5: Privacy policy clause**

In `web/pages/PrivacyPolicy/index.tsx`, add a short clause under the data-collection / security section (match surrounding markdown/JSX text style):

> To prevent fraud and abuse — such as creating multiple accounts to obtain additional free credits — we collect and store your IP address and a device identifier derived from your browser and device characteristics. You consent to this collection when you register. We process this information to protect the fairness and security of the service (our legitimate interest and with your consent) and retain it for the life of your account.

- [ ] **Step 6: Typecheck + build (confirm FingerprintJS bundles)**

Run: `cd /home/dlite/charluv && pnpm typecheck`
Expected: no new errors referencing the touched files.
Run: `cd /home/dlite/charluv && node -e "const ts=require('typescript');const fs=require('fs');for (const f of ['web/shared/fingerprint.ts','web/pages/Login/index.tsx']) ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{jsx:'preserve',target:'esnext'}});console.log('ok')"`
Expected: `ok`.

- [ ] **Step 7: Commit**

```bash
git add package.json pnpm-lock.yaml web/shared/fingerprint.ts web/store/user.ts web/pages/Login/index.tsx web/pages/PrivacyPolicy/index.tsx
git commit -m "feat(abuse): consented FingerprintJS device id at registration + privacy clause

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01XXNb2Kcdayr1ZvUpy5a3nA"
```

---

### Task 6: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Typechecks + tests**

Run: `cd /home/dlite/charluv && pnpm typecheck` → expect web error count unchanged from baseline (0).
Run: `NODE_OPTIONS=--max-old-space-size=6144 npx tsc -p srv.tsconfig.json --noEmit` → 0.
Run: `pnpm test 2>&1 | grep -E "passing|failing"` → `classifyRegistration` 4 tests included; pre-existing failures unchanged, no new ones.

- [ ] **Step 2: Prettier**

Run prettier --check on all touched `.ts`/`.tsx`; `--write` any that need it; re-typecheck.

- [ ] **Step 3: Manual smoke (fingerprinting works)**

Use the `/run` skill (or `pnpm start`) to load the app, open `/register`, and verify with the browser tools:
- the consent checkbox is present and the Register button is disabled until it's ticked;
- on submit, the network request to `/user/register` includes a non-empty `fingerprint` and `consent: true` (FingerprintJS produced a visitorId — confirms fingerprinting is working end-to-end);
- registering a second account from the same browser/IP yields a restricted account (0 credits) or a 403 block;
- the privacy policy page shows the new clause.

---

## Self-Review

**Spec coverage:**
- §1 matrix → Task 1 (`classifyRegistration`) + Task 3 (handler). ✓
- §2 data model + index → Task 1. ✓
- §3.1 consent gate (required checkbox, disabled button, consent ts, "identifiers" wording) → Task 3 (server require) + Task 5 (UI + timestamp via createUser opts). ✓
- §3.2 capture at registration only, degrade on missing fp → Task 5 (client) + Task 3 (`'string?'`). ✓
- §4 enforcement (classifier, checkFingerprint, createUser opts incl consentAt, register requires consent, login unchanged, getFreeCredits filter) → Tasks 1/2/3. ✓
- §5 admin surface + clear (top-up to 200) → Task 4 + `clearRestriction` (Task 2). ✓
- §6 privacy policy accurate clause → Task 5 Step 5. ✓
- §7 error handling (StatusError, blank fp = no match, client swallow) → Tasks 2/3/5. ✓
- §8 testing (classifyRegistration unit; DB paths typecheck-only) → Task 1 + Task 6. ✓
- §9 existing members untouched (no retro restriction; no login fp) → Task 3 Step 2 (login unchanged), Task 2 (restrict only via register opts). ✓

**Placeholder scan:** Task 4 Steps 1/4 intentionally say "read the actual accessor/return shape first" because `srv/db/admin.ts`'s return object and `UsersPage.tsx`'s info-signal name must be matched to existing code; the exact field additions and JSX are given. This is guided integration, not a placeholder. No TODO/TBD elsewhere.

**Type consistency:** `classifyRegistration({fpMatch,ipMatch})→'block'|'restrict'|'allow'` consistent (Task 1 def, Task 3 use). `createUser(newUser, admin?, opts?)` opts shape consistent (Task 2 def, Task 3 call). `restrictedReason` union `'ip'|'fingerprint'|'both'` consistent across schema/createUser/admin/store. `getVisitorId(): Promise<string|undefined>` consistent (Task 5 def + use). `register(newUser, fingerprint?, consent, onSuccess?)` consistent (Task 5 store def + RegisterForm call).
