# Promo Codes + Subscription Page Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add admin-managed promo codes that grant credits and/or premium days (once per account, expirable, max-uses capped), and remove dead Stripe/legacy-shop UI from the Subscription page.

**Architecture:** Two new additive MongoDB collections (`promo-code`, `promo-redemption`) with unique indexes enforcing one-redemption-per-account and unique code strings. Redemption is a race-safe server flow (conditional `$inc` for max-uses + unique-index insert for per-account). Admins CRUD codes via a new admin page; users redeem on the Subscription page. No data migrations — all changes additive.

**Tech Stack:** TypeScript, Express + MongoDB (`srv/`), SolidJS + Tailwind (`web/`), isomorphic types (`common/`), mocha tests (`tests/`).

## Global Constraints

- **NO data migrations.** Schema changes must be additive (nullable/new fields, new collections only).
- **Use `pnpm`, never `npm`.**
- Vite resolves `.ts` before `.js`; do **not** check in compiled web `.js`/`.js.map`.
- Codes are stored and compared **UPPERCASE** (case-insensitive redemption).
- "Membership days" = premium days: set `premium: true`, extend `premiumUntil` by `days * 86_400_000` ms from `max(premiumUntil, now)` (same math as `srv/api/cart.ts:giveOrder`).
- Run `pnpm checks` before declaring done; srv typecheck via `NODE_OPTIONS=--max-old-space-size=6144 npx tsc -p srv.tsconfig.json --noEmit`.
- Commit messages end with the two trailer lines from CLAUDE.md (Co-Authored-By + Claude-Session).

---

### Task 1: Schema types + collection registration

**Files:**
- Modify: `common/types/schema.ts` (add to `AllDoc` union ~line 12-37; add interfaces + namespace aliases in `AppSchema` ~near `ShopItem`/`InviteCode` ~line 96-132)
- Modify: `srv/db/client.ts:createIndexes` (add indexes ~after line 130)

**Interfaces:**
- Produces:
  - `AppSchema.PromoCode { _id: string; kind: 'promo-code'; code: string; credits?: number; days?: number; maxUses: number; uses: number; enabled: boolean; expiresAt?: string; createdAt: string; createdBy: string; updatedAt?: string }`
  - `AppSchema.PromoRedemption { _id: string; kind: 'promo-redemption'; codeId: string; userId: string; code: string; credits: number; days: number; createdAt: string }`

- [ ] **Step 1: Add interfaces to the `AppSchema` namespace**

In `common/types/schema.ts`, inside `export namespace AppSchema { ... }`, near the `ShopItem`/`InviteCode` interfaces, add:

```ts
  export interface PromoCode {
    _id: string
    kind: 'promo-code'
    code: string
    credits?: number
    days?: number
    maxUses: number
    uses: number
    enabled: boolean
    expiresAt?: string
    createdAt: string
    createdBy: string
    updatedAt?: string
  }

  export interface PromoRedemption {
    _id: string
    kind: 'promo-redemption'
    codeId: string
    userId: string
    code: string
    credits: number
    days: number
    createdAt: string
  }
```

- [ ] **Step 2: Register both kinds in the `AllDoc` union**

In `common/types/schema.ts`, add to the `AllDoc` union (the `export type AllDoc =` list, ~line 12-37):

```ts
  | AppSchema.PromoCode
  | AppSchema.PromoRedemption
```

- [ ] **Step 3: Add unique indexes**

In `srv/db/client.ts`, inside `createIndexes()`, after the existing `db('user')` indexes block (~line 147), add:

```ts
  await db('promo-code').createIndex({ code: 1 }, { unique: true, name: 'promo-code_code' })
  await db('promo-redemption').createIndex(
    { codeId: 1, userId: 1 },
    { unique: true, name: 'promo-redemption_code_user' }
  )
```

- [ ] **Step 4: Typecheck**

Run: `cd /home/dlite/charluv && pnpm typecheck`
Expected: PASS (no new errors). Then srv typecheck:
Run: `cd /home/dlite/charluv && NODE_OPTIONS=--max-old-space-size=6144 npx tsc -p srv.tsconfig.json --noEmit`
Expected: PASS — `db('promo-code')` / `db('promo-redemption')` now resolve via the `AllDoc` union.

- [ ] **Step 5: Commit**

```bash
git add common/types/schema.ts srv/db/client.ts
git commit -m "feat(promo): add promo-code + promo-redemption schema and indexes

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01XXNb2Kcdayr1ZvUpy5a3nA"
```

---

### Task 2: DB layer — CRUD + race-safe `redeemPromo`

**Files:**
- Create: `srv/db/promo.ts`
- Test: `tests/promo.spec.js`
- Modify: `srv/db/index.ts` (re-export, follow existing pattern — see Step 6)

**Interfaces:**
- Consumes: `AppSchema.PromoCode`, `AppSchema.PromoRedemption` (Task 1); `db` from `./client`; `updateCredits` from `./credits`; `getUser`, `updateUser`, `toSafeUser` from `./user`; `StatusError` from `../api/wrap`.
- Produces:
  - `getPromos(): Promise<AppSchema.PromoCode[]>`
  - `getPromoByCode(code: string): Promise<AppSchema.PromoCode | null>`
  - `createPromo(input: { code: string; credits?: number; days?: number; maxUses: number; enabled: boolean; expiresAt?: string; createdBy: string }): Promise<AppSchema.PromoCode>`
  - `updatePromo(id: string, patch: Partial<Pick<AppSchema.PromoCode, 'code' | 'credits' | 'days' | 'maxUses' | 'enabled' | 'expiresAt'>>): Promise<AppSchema.PromoCode | null>`
  - `deletePromo(id: string): Promise<void>`
  - `redeemPromo(userId: string, rawCode: string): Promise<{ user: AppSchema.User; credits: number; days: number }>`

**Note on tests:** `tests/` is mocha (`tests/**.spec.js`). The existing harness pattern for DB-backed code is to use an in-memory mongo. Check `tests/` for an existing helper (e.g. a `setup`/`mongodb-memory-server` bootstrap) and reuse it. If no DB harness exists, implement `redeemPromo` against a thin injectable layer is overkill — instead test the pure helper `extendPremium` (Step 1) plus integration tests gated on the existing DB harness. Steps below assume a DB test harness exists at `tests/` (mirror whatever `tests/*.spec.js` already do to get `db`).

- [ ] **Step 1: Write the failing test for the premium-extension helper**

Create `tests/promo.spec.js`:

```js
const { expect } = require('chai')
const { extendPremium } = require('../srv/db/promo')

describe('extendPremium', () => {
  it('extends from now when premiumUntil is in the past', () => {
    const now = 1_000_000_000_000
    const result = extendPremium(now - 5000, 2, now)
    expect(result).to.equal(now + 2 * 86_400_000)
  })

  it('stacks on top of an existing future premiumUntil', () => {
    const now = 1_000_000_000_000
    const future = now + 10 * 86_400_000
    const result = extendPremium(future, 3, now)
    expect(result).to.equal(future + 3 * 86_400_000)
  })

  it('treats missing premiumUntil as now', () => {
    const now = 1_000_000_000_000
    const result = extendPremium(0, 1, now)
    expect(result).to.equal(now + 86_400_000)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /home/dlite/charluv && pnpm test -- --grep extendPremium`
Expected: FAIL — `extendPremium` is not exported / module not found.

- [ ] **Step 3: Implement `srv/db/promo.ts`**

Create `srv/db/promo.ts`:

```ts
import { v4 } from 'uuid'
import { db } from './client'
import { StatusError } from '../api/wrap'
import { updateCredits } from './credits'
import { getUser, updateUser, toSafeUser } from './user'
import { AppSchema } from '../../common/types'

const DAY_MS = 86_400_000

const now = () => new Date().toISOString()

/** Pure helper: new premiumUntil after adding `days`, extending the later of existing/now. */
export function extendPremium(premiumUntil: number, days: number, nowMs: number) {
  const base = (premiumUntil || 0) > nowMs ? premiumUntil : nowMs
  return base + days * DAY_MS
}

export async function getPromos() {
  return db('promo-code').find({ kind: 'promo-code' }).sort({ createdAt: -1 }).toArray()
}

export async function getPromoByCode(code: string) {
  return db('promo-code').findOne({ kind: 'promo-code', code: code.trim().toUpperCase() })
}

export async function createPromo(input: {
  code: string
  credits?: number
  days?: number
  maxUses: number
  enabled: boolean
  expiresAt?: string
  createdBy: string
}) {
  const code = input.code.trim().toUpperCase()
  if (!code) throw new StatusError('Code is required', 400)
  if (!input.credits && !input.days) {
    throw new StatusError('A code must grant credits and/or days', 400)
  }
  if (input.maxUses < 0) throw new StatusError('maxUses cannot be negative', 400)

  const existing = await db('promo-code').findOne({ kind: 'promo-code', code })
  if (existing) throw new StatusError('A code with that name already exists', 400)

  const promo: AppSchema.PromoCode = {
    _id: v4(),
    kind: 'promo-code',
    code,
    credits: input.credits || 0,
    days: input.days || 0,
    maxUses: input.maxUses,
    uses: 0,
    enabled: input.enabled,
    expiresAt: input.expiresAt || undefined,
    createdAt: now(),
    createdBy: input.createdBy,
  }

  await db('promo-code').insertOne(promo)
  return promo
}

export async function updatePromo(
  id: string,
  patch: Partial<
    Pick<AppSchema.PromoCode, 'code' | 'credits' | 'days' | 'maxUses' | 'enabled' | 'expiresAt'>
  >
) {
  const set: any = { updatedAt: now() }
  if (patch.code !== undefined) {
    const code = patch.code.trim().toUpperCase()
    const clash = await db('promo-code').findOne({ kind: 'promo-code', code, _id: { $ne: id } })
    if (clash) throw new StatusError('A code with that name already exists', 400)
    set.code = code
  }
  if (patch.credits !== undefined) set.credits = patch.credits
  if (patch.days !== undefined) set.days = patch.days
  if (patch.maxUses !== undefined) set.maxUses = patch.maxUses
  if (patch.enabled !== undefined) set.enabled = patch.enabled
  if (patch.expiresAt !== undefined) set.expiresAt = patch.expiresAt || undefined

  await db('promo-code').updateOne({ kind: 'promo-code', _id: id }, { $set: set })
  return db('promo-code').findOne({ kind: 'promo-code', _id: id })
}

export async function deletePromo(id: string) {
  await db('promo-code').deleteOne({ kind: 'promo-code', _id: id })
}

export async function redeemPromo(userId: string, rawCode: string) {
  const code = (rawCode || '').trim().toUpperCase()
  if (!code) throw new StatusError('Please enter a code', 400)

  const promo = await db('promo-code').findOne({ kind: 'promo-code', code })
  if (!promo) throw new StatusError('Invalid promo code', 404)
  if (!promo.enabled) throw new StatusError('This code is no longer active', 400)
  if (promo.expiresAt && new Date(promo.expiresAt).valueOf() < Date.now()) {
    throw new StatusError('This code has expired', 400)
  }

  // Atomically claim a use slot (skip the guard entirely when unlimited).
  const filter: any = { kind: 'promo-code', _id: promo._id, enabled: true }
  if (promo.maxUses > 0) filter.$expr = { $lt: ['$uses', '$maxUses'] }
  const claimed = await db('promo-code').findOneAndUpdate(filter, { $inc: { uses: 1 } })
  // mongodb driver: returns the pre-update doc in `.value` (or null when no match)
  const claimedDoc = (claimed as any)?.value ?? claimed
  if (!claimedDoc) throw new StatusError('This code has been fully used', 400)

  // Per-account lock via the unique (codeId,userId) index.
  try {
    await db('promo-redemption').insertOne({
      _id: v4(),
      kind: 'promo-redemption',
      codeId: promo._id,
      userId,
      code,
      credits: promo.credits || 0,
      days: promo.days || 0,
      createdAt: now(),
    })
  } catch (err: any) {
    await db('promo-code').updateOne({ kind: 'promo-code', _id: promo._id }, { $inc: { uses: -1 } })
    if (err?.code === 11000) throw new StatusError('You have already redeemed this code', 400)
    throw err
  }

  const credits = promo.credits || 0
  const days = promo.days || 0

  if (credits > 0) await updateCredits(userId, credits)

  if (days > 0) {
    const user = await getUser(userId)
    if (!user) throw new StatusError('User not found', 404)
    const premiumUntil = extendPremium(user.premiumUntil || 0, days, Date.now())
    await updateUser(userId, { premium: true, premiumUntil })
  }

  const user = await getUser(userId)
  if (!user) throw new StatusError('User not found', 404)
  return { user: toSafeUser(user), credits, days }
}
```

- [ ] **Step 4: Run the helper test to verify it passes**

Run: `cd /home/dlite/charluv && pnpm test -- --grep extendPremium`
Expected: PASS (3 passing).

- [ ] **Step 5: Add redemption integration tests (gated on DB harness)**

Append to `tests/promo.spec.js`. **First inspect an existing `tests/*.spec.js` that touches `db(...)`** to copy its before/after DB bootstrap (connect + clean). Use that harness; the asserts below are the contract:

```js
const promo = require('../srv/db/promo')
// ...reuse existing DB harness setup (connect in before, drop collections in beforeEach)...

describe('redeemPromo', () => {
  it('grants credits and records a redemption', async () => {
    // seed a user with known credits, create a credits-only code, redeem it
    // expect: returned credits === code.credits, user.credits increased,
    //         one promo-redemption row for (codeId,userId), code.uses === 1
  })

  it('grants premium days', async () => {
    // create a days-only code, redeem; expect user.premium === true and
    // premiumUntil ≈ now + days*86_400_000
  })

  it('rejects a second redemption by the same user and does not double-count uses', async () => {
    // redeem once (uses->1), redeem again -> throws "already redeemed",
    // code.uses still === 1
  })

  it('rejects a disabled code', async () => { /* enabled:false -> throws */ })
  it('rejects an expired code', async () => { /* expiresAt in past -> throws */ })
  it('rejects when maxUses is exhausted', async () => {
    // maxUses:1, user A redeems, user B redeem -> throws "fully used"
  })
  it('allows unlimited redemptions when maxUses is 0', async () => {
    // maxUses:0, users A and B both succeed
  })
})
```

Fill each test body using the copied harness. If `tests/` has **no** DB harness, skip this step (helper test in Step 1 stands) and note it in the commit body.

- [ ] **Step 6: Re-export from `srv/db/index.ts`**

Inspect `srv/db/index.ts` for how modules like `credits`/`shop` are exported (e.g. `export * as credits from './credits'` or a `store` aggregate). Mirror that exactly for promo, e.g.:

```ts
export * as promo from './promo'
```

(If `srv/db/index.ts` uses a different aggregation shape, match it — do not invent a new pattern.)

- [ ] **Step 7: Run tests + typecheck**

Run: `cd /home/dlite/charluv && pnpm test`
Expected: PASS (existing + new).
Run: `cd /home/dlite/charluv && NODE_OPTIONS=--max-old-space-size=6144 npx tsc -p srv.tsconfig.json --noEmit`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add srv/db/promo.ts srv/db/index.ts tests/promo.spec.js
git commit -m "feat(promo): add promo code CRUD and race-safe redemption

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01XXNb2Kcdayr1ZvUpy5a3nA"
```

---

### Task 3: User redeem route

**Files:**
- Create or Modify: the user-facing redeem endpoint. Inspect `srv/api/user/index.ts` for the router; add a handler file `srv/api/user/promo.ts` and register the route.
- Modify: `srv/api/user/index.ts` (mount `POST /promo/redeem`)

**Interfaces:**
- Consumes: `redeemPromo` (Task 2); `handle`/`assertValid` (existing `srv/api/wrap` pattern — confirm import path used by neighboring user routes).
- Produces: route `POST /user/promo/redeem` body `{ code: string }` → `{ user }`.

- [ ] **Step 1: Inspect the existing user router pattern**

Read `srv/api/user/index.ts` and one sibling handler (e.g. `srv/api/user/patreon.ts`) to copy the exact `handle`/`assertValid`/`loggedIn` usage and import paths.

- [ ] **Step 2: Create the handler `srv/api/user/promo.ts`**

```ts
import { assertValid } from '/common/valid'
import { handle } from '../wrap'
import { promo } from '../../db'

export const redeemPromoCode = handle(async ({ userId, body }) => {
  assertValid({ code: 'string' }, body)
  const result = await promo.redeemPromo(userId!, body.code)
  return { user: result.user, credits: result.credits, days: result.days }
})
```

(Adjust the `assertValid` import and `promo` import to match what Task 2 Step 6 produced and what neighboring user handlers use — e.g. `import { store } from '../../db'` then `store.promo.redeemPromo`.)

- [ ] **Step 3: Register the route**

In `srv/api/user/index.ts`, import `redeemPromoCode` and add alongside the other authenticated user routes:

```ts
router.post('/promo/redeem', loggedIn, redeemPromoCode)
```

(Match the existing auth-middleware style in that file — some routers apply `loggedIn` once at the top.)

- [ ] **Step 4: srv typecheck**

Run: `cd /home/dlite/charluv && NODE_OPTIONS=--max-old-space-size=6144 npx tsc -p srv.tsconfig.json --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add srv/api/user/promo.ts srv/api/user/index.ts
git commit -m "feat(promo): add POST /user/promo/redeem route

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01XXNb2Kcdayr1ZvUpy5a3nA"
```

---

### Task 4: Admin promo routes

**Files:**
- Create: `srv/api/promo.ts`
- Modify: `srv/api/index.ts` (import + `router.use('/admin', promo)`)

**Interfaces:**
- Consumes: `getPromos`, `createPromo`, `updatePromo`, `deletePromo` (Task 2); `isAdmin`, `handle`, `assertValid` (existing patterns from `srv/api/admin.ts` / `srv/api/billing/index.ts`).
- Produces: routes `GET /admin/promo`, `POST /admin/promo`, `POST /admin/promo/:id`, `DELETE /admin/promo/:id`.

- [ ] **Step 1: Inspect admin route patterns**

Read `srv/api/admin.ts` (or `srv/api/billing/index.ts`) for the `Router()` + `isAdmin` + `handle` + `assertValid` usage and import paths to mirror exactly.

- [ ] **Step 2: Create `srv/api/promo.ts`**

```ts
import { Router } from 'express'
import { assertValid } from '/common/valid'
import { handle, StatusError } from './wrap'
import { isAdmin } from './auth'
import { promo } from '../db'

const list = handle(async () => {
  const codes = await promo.getPromos()
  return { codes }
})

const create = handle(async ({ userId, body }) => {
  assertValid(
    {
      code: 'string',
      credits: 'number?',
      days: 'number?',
      maxUses: 'number',
      enabled: 'boolean',
      expiresAt: 'string?',
    },
    body
  )
  const code = await promo.createPromo({
    code: body.code,
    credits: body.credits,
    days: body.days,
    maxUses: body.maxUses,
    enabled: body.enabled,
    expiresAt: body.expiresAt,
    createdBy: userId!,
  })
  return { code }
})

const update = handle(async ({ params, body }) => {
  if (!params.id) throw new StatusError('Missing id', 400)
  assertValid(
    {
      code: 'string?',
      credits: 'number?',
      days: 'number?',
      maxUses: 'number?',
      enabled: 'boolean?',
      expiresAt: 'string?',
    },
    body
  )
  const code = await promo.updatePromo(params.id, body)
  return { code }
})

const remove = handle(async ({ params }) => {
  if (!params.id) throw new StatusError('Missing id', 400)
  await promo.deletePromo(params.id)
  return { success: true }
})

const router = Router()
router.get('/promo', isAdmin, list)
router.post('/promo', isAdmin, create)
router.post('/promo/:id', isAdmin, update)
router.delete('/promo/:id', isAdmin, remove)

export default router
```

(Adjust `promo` import + `assertValid`/`isAdmin`/`handle` import paths to match Task 2's export shape and neighboring admin files.)

- [ ] **Step 3: Mount the router**

In `srv/api/index.ts`, add the import (with the others, ~line 6) and mount near the other admin routers (~line 35-36):

```ts
import promo from './promo'
// ...
router.use('/admin', promo)
```

- [ ] **Step 4: srv typecheck**

Run: `cd /home/dlite/charluv && NODE_OPTIONS=--max-old-space-size=6144 npx tsc -p srv.tsconfig.json --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add srv/api/promo.ts srv/api/index.ts
git commit -m "feat(promo): add admin promo CRUD routes

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01XXNb2Kcdayr1ZvUpy5a3nA"
```

---

### Task 5: User store — `redeemPromo` action

**Files:**
- Modify: `web/store/user.ts` (add action near `getTiers`/`retrieveSubscription`)

**Interfaces:**
- Consumes: `api` (`web/store/api`), `toastStore`, route `POST /user/promo/redeem` (Task 3).
- Produces: `userStore.redeemPromo(code: string)` — updates `user` in state on success.

- [ ] **Step 1: Add the action**

In `web/store/user.ts`, inside the store action object (alongside `getTiers`), add. Match the existing async-generator-vs-plain-async style used by neighbors (`retrieveSubscription` is a generator; use the same form):

```ts
    async *redeemPromo({ subLoading }, code: string) {
      if (!code.trim()) {
        toastStore.error('Please enter a code')
        return
      }
      const res = await api.post('/user/promo/redeem', { code: code.trim() })
      if (res.error) {
        toastStore.error(res.error)
        return
      }
      if (res.result) {
        const parts: string[] = []
        if (res.result.credits) parts.push(`${res.result.credits} credits`)
        if (res.result.days) parts.push(`${res.result.days} premium days`)
        toastStore.success(`Redeemed! You received ${parts.join(' and ')}.`)
        yield { user: res.result.user }
      }
    },
```

- [ ] **Step 2: Quick web typecheck**

Run: `cd /home/dlite/charluv && pnpm typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add web/store/user.ts
git commit -m "feat(promo): add redeemPromo user-store action

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01XXNb2Kcdayr1ZvUpy5a3nA"
```

---

### Task 6: Subscription page — redeem card + cleanup

**Files:**
- Modify: `web/pages/Profile/SubscriptionPage.tsx`

**Interfaces:**
- Consumes: `userStore.redeemPromo` (Task 5), existing `TextInput`, `Button`, `SolidCard`.

- [ ] **Step 1: Add the redeem-code card + local signal**

Add an import for `TextInput` (`/web/shared/TextInput`) if not present. Add a signal near the other signals (~line 29):

```tsx
  const [promoCode, setPromoCode] = createSignal('')
```

Add this card inside the centered column, right under the "Why subscribe?" `SolidCard` (~after line 111):

```tsx
          <SolidCard class="flex w-full flex-col gap-2" border>
            <p class="font-bold text-[var(--hl-500)]">Redeem a promo code</p>
            <p class="text-sm">
              Have a promo code? Enter it below to claim credits or premium membership days.
            </p>
            <div class="flex items-end gap-2">
              <TextInput
                fieldName="promoCode"
                placeholder="PROMO CODE"
                value={promoCode()}
                onInput={(ev) => setPromoCode(ev.currentTarget.value)}
                class="flex-1"
              />
              <Button
                schema="success"
                disabled={!promoCode().trim() || user.subLoading}
                onClick={() => userStore.redeemPromo(promoCode())}
              >
                Redeem
              </Button>
            </div>
          </SolidCard>
```

- [ ] **Step 2: Remove the Stripe Upgrade/Downgrade buttons**

In the `<For each={candidates()}>` tier-card `<Switch>` (~line 212-272), delete these three `<Match>` blocks: the `Upgrade` block (`user.sub?.type === 'native' && cfg.tier && cfg.level < each.level`, ~223-233), the `Downgrading...` block (~235-249), and the `Downgrade` block (`user.sub?.type === 'native' && user.sub.level > each.level`, ~251-259). Keep the `!isLoggedIn()` login match, the `Subscribed!` match, and the final `Subscribe via Patreon` match.

- [ ] **Step 3: Remove the upgrade/downgrade modals + signals**

Delete the `showUpgrade`/`setUpgrade` and `showDowngrade`/`setDowngrade` signals (~line 30-31) and their two `<ConfirmModal>` blocks at the bottom (~line 304-329). Delete the now-unused `cfg.downgrade` references in the "Current Subscription" `<Switch>` (the `cfg.downgrade && cfg.tier!._id !== cfg.downgrade` match, ~148-157) and remove `downgrade: s.subStatus?.downgrading?.tierId` from the `cfg` memo (~line 24) if nothing else uses it.

- [ ] **Step 4: Remove the Unsubscribe button + modal**

Delete the `showUnsub`/`setUnsub` signal (~line 29), the Unsubscribe `Button` + wrapping `<Show>` (~line 287-291), and the unsubscribe `<ConfirmModal>` (~line 297-302). Remove the now-unused `hasExpired` memo if nothing else references it.

- [ ] **Step 5: Remove Stripe/EUR/legacy copy**

- In the "Subscribed via" pill (~line 131-142): remove the `'native' ? 'Stripe'` branch; the pill should read from Gift/Patreon/Paypal only.
- Delete the PayPal `<Match when={cfg.type === 'paypal'}>` line about "use Stripe or Patreon if you want auto-renew" (~144-147) — replace with a neutral "Your PayPal membership does not auto-renew" or remove.
- Delete "All prices are in EUR" (~line 280) and "Patreon price shown is excl. VAT." (~line 294).

- [ ] **Step 6: Syntax-check the component**

Vite (not tsc) bundles web. Verify with a transpile check:
Run: `cd /home/dlite/charluv && node -e "const ts=require('typescript');const fs=require('fs');ts.transpileModule(fs.readFileSync('web/pages/Profile/SubscriptionPage.tsx','utf8'),{compilerOptions:{jsx:'preserve',target:'esnext'}});console.log('ok')"`
Expected: prints `ok` (no throw). Then `pnpm typecheck` for unused-var fallout:
Run: `cd /home/dlite/charluv && pnpm typecheck`
Expected: PASS — fix any "declared but never used" errors from removed signals/memos.

- [ ] **Step 7: Commit**

```bash
git add web/pages/Profile/SubscriptionPage.tsx
git commit -m "feat(promo): add redeem card and remove Stripe/legacy UI from subscription page

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01XXNb2Kcdayr1ZvUpy5a3nA"
```

---

### Task 7: Admin store — promo actions

**Files:**
- Modify: `web/store/admin.ts` (add `promos` to state + 4 actions)

**Interfaces:**
- Consumes: `api`, `toastStore`, `AppSchema.PromoCode`, routes from Task 4.
- Produces: `adminStore.getPromos()`, `adminStore.createPromo(input, onSuccess?)`, `adminStore.updatePromo(id, patch, onSuccess?)`, `adminStore.deletePromo(id, onSuccess?)`; `promos: AppSchema.PromoCode[]` in state.

- [ ] **Step 1: Add `promos` to `AdminState` + initial value**

In `web/store/admin.ts`, add to the `AdminState` type:

```ts
  promos: AppSchema.PromoCode[]
```

and to the `createStore('admin', { ... })` initial object:

```ts
  promos: [],
```

- [ ] **Step 2: Add the actions**

Inside the returned actions object:

```ts
    async getPromos() {
      const res = await api.get('/admin/promo')
      if (res.result) return { promos: res.result.codes }
      if (res.error) toastStore.error(`Failed to load promo codes: ${res.error}`)
    },
    async createPromo(_, input: Partial<AppSchema.PromoCode>, onSuccess?: () => void) {
      const res = await api.post('/admin/promo', input)
      if (res.error) return toastStore.error(`Failed to create code: ${res.error}`)
      if (res.result) {
        toastStore.success('Promo code created')
        adminStore.getPromos()
        onSuccess?.()
      }
    },
    async updatePromo(_, id: string, patch: Partial<AppSchema.PromoCode>, onSuccess?: () => void) {
      const res = await api.post(`/admin/promo/${id}`, patch)
      if (res.error) return toastStore.error(`Failed to update code: ${res.error}`)
      if (res.result) {
        toastStore.success('Promo code updated')
        adminStore.getPromos()
        onSuccess?.()
      }
    },
    async deletePromo(_, id: string, onSuccess?: () => void) {
      const res = await api.method('delete', `/admin/promo/${id}`)
      if (res.error) return toastStore.error(`Failed to delete code: ${res.error}`)
      if (res.result) {
        toastStore.success('Promo code deleted')
        adminStore.getPromos()
        onSuccess?.()
      }
    },
```

(Confirm the delete helper: check `web/store/api.ts` for the DELETE method name — it may be `api.del(...)` rather than `api.method('delete', ...)`. Use whatever the codebase already uses.)

- [ ] **Step 3: Web typecheck**

Run: `cd /home/dlite/charluv && pnpm typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add web/store/admin.ts
git commit -m "feat(promo): add admin-store promo actions

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01XXNb2Kcdayr1ZvUpy5a3nA"
```

---

### Task 8: Admin Promo Codes page + nav + route

**Files:**
- Create: `web/pages/Admin/PromoCodes.tsx`
- Modify: `web/App.tsx` (route), `web/Navigation.tsx` (SubItem)

**Interfaces:**
- Consumes: `adminStore` promo actions/state (Task 7), shared `Button`, `TextInput`, `Toggle`/checkbox, `SolidCard`, `Modal`/`ConfirmModal`.

- [ ] **Step 1: Inspect a sibling admin page**

Read `web/pages/Admin/Announcements.tsx` for the page scaffold (title, list rendering, create/edit form, store usage, `onMount` load) and mirror it.

- [ ] **Step 2: Create `web/pages/Admin/PromoCodes.tsx`**

Build a page that:
- `onMount(() => adminStore.getPromos())`
- lists `admin.promos` showing `code`, `credits`, `days`, `uses`/`maxUses` (show `∞` when `maxUses===0`), `enabled`, `expiresAt`.
- has a create form (inputs: code text, credits number, days number, maxUses number, enabled toggle, expiresAt datetime-local) calling `adminStore.createPromo`.
- each row: edit (inline or modal → `adminStore.updatePromo`) and delete (`ConfirmModal` → `adminStore.deletePromo`).
- a "Generate" button next to the code field that fills a random A–Z0–9 string (e.g. 8 chars) — purely a convenience; admin can edit.

Use the exact shared-component import paths and prop conventions found in `Announcements.tsx`. Use `setComponentPageTitle('Promo Codes')` as siblings do.

- [ ] **Step 3: Add the route**

In `web/App.tsx`, near the other admin routes (~line 117-143):

```tsx
          <Route path="/admin/promo" component={lazy(() => import('./pages/Admin/PromoCodes'))} />
```

(Ensure the page's default export matches the lazy import — `export default` the component.)

- [ ] **Step 4: Add the nav link**

In `web/Navigation.tsx`, under the admin group near the other `SubItem`s (~line 307-311):

```tsx
          <SubItem href="/admin/promo" parent="/" ariaLabel="Promo Codes">
            Promo Codes
          </SubItem>
```

- [ ] **Step 5: Syntax + typecheck**

Run: `cd /home/dlite/charluv && node -e "const ts=require('typescript');const fs=require('fs');ts.transpileModule(fs.readFileSync('web/pages/Admin/PromoCodes.tsx','utf8'),{compilerOptions:{jsx:'preserve',target:'esnext'}});console.log('ok')"`
Expected: `ok`.
Run: `cd /home/dlite/charluv && pnpm typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add web/pages/Admin/PromoCodes.tsx web/App.tsx web/Navigation.tsx
git commit -m "feat(promo): add admin Promo Codes page, route and nav link

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01XXNb2Kcdayr1ZvUpy5a3nA"
```

---

### Task 9: Full verification + push

**Files:** none (verification only)

- [ ] **Step 1: Full checks**

Run: `cd /home/dlite/charluv && pnpm checks`
Expected: format + typecheck + test all PASS.

- [ ] **Step 2: srv typecheck**

Run: `cd /home/dlite/charluv && NODE_OPTIONS=--max-old-space-size=6144 npx tsc -p srv.tsconfig.json --noEmit`
Expected: PASS.

- [ ] **Step 3: Manual smoke (optional, if a dev server is run)**

Use the `/run` or `/verify` skill to: create a code in admin, redeem it as a user (credits + days update), confirm a second redeem is rejected, confirm an exhausted/expired/disabled code is rejected.

- [ ] **Step 4: Push**

```bash
cd /home/dlite/charluv && git push origin feat/charluv-rewrite
```

---

## Self-Review

**Spec coverage:**
- Cleanup (Stripe upgrade/downgrade UI, Stripe/legacy labels & shop text, Unsubscribe) → Task 6. ✓
- Promo code grants credits and/or days → Tasks 1 (schema), 2 (`redeemPromo` grant logic). ✓
- One per account → Task 1 unique `{codeId,userId}` index + Task 2 insert-with-rollback. ✓
- Expirable → `expiresAt` field (Task 1) + check in `redeemPromo` (Task 2). ✓
- Max X uses → `maxUses`/`uses` + conditional `$inc` guard (Task 2). ✓
- Admin management → Tasks 4 (routes), 7 (store), 8 (page/nav). ✓
- Admin types the code + generate button → Task 8 Step 2. ✓
- Redeem on Subscription page only → Task 6. ✓
- Tests → Task 2 (helper + integration), Task 9 (full run). ✓

**Placeholder scan:** Integration test bodies in Task 2 Step 5 are described as contracts rather than full code because they depend on the repo's existing DB test harness (unknown shape until inspected); the step instructs copying the harness from an existing spec. The helper test (Step 1) is complete runnable code. This is the one intentional non-literal, justified by harness uncertainty. No other TBD/TODO.

**Type consistency:** `redeemPromo` returns `{ user, credits, days }` — consumed consistently in Task 3 (route returns `{ user, credits, days }`) and Task 5 (`res.result.user/credits/days`). `extendPremium(premiumUntil, days, nowMs)` signature consistent between Task 2 impl and test. `PromoCode`/`PromoRedemption` field names consistent across Tasks 1, 2, 4, 7, 8.

## Open implementation-time confirmations (inspect, don't guess)

- `srv/db/index.ts` export shape (`export * as promo` vs aggregate `store` object) — Task 2 Step 6.
- `assertValid` import path + `'number?'`/`'boolean?'` optional-field syntax — confirm against `common/valid` usage in a sibling route.
- DELETE helper name in `web/store/api.ts` (`api.del` vs `api.method('delete', …)`) — Task 7 Step 2.
- mongodb driver `findOneAndUpdate` return shape (`.value` vs raw doc) — Task 2 handles both defensively.
- Presence/shape of a DB test harness in `tests/` — Task 2 Step 5.
