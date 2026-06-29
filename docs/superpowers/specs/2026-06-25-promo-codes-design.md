# Promo Codes + Subscription Page Cleanup — Design

Date: 2026-06-25
Branch: feat/charluv-rewrite

## Goal

Two changes to the Subscription page (`/premium`, `web/pages/Profile/SubscriptionPage.tsx`):

1. **Cleanup** — strip Stripe / legacy-shop / PayPal machinery that no longer applies
   (new subscriptions are Patreon-only).
2. **New feature: promo codes** — admin-managed codes that grant **credits** and/or
   **premium membership days**. Codes are redeemable **once per account**, can **expire**,
   and have a **max number of uses**. Admins manage them from the admin section.

No data migrations (live production data). All schema changes are additive.

## Definitions

- **Membership days** = premium days. Granting `days` sets `premium: true` and extends
  `premiumUntil`, using the same math as the shop (`srv/api/cart.ts:giveOrder`):
  base from `max(premiumUntil, now)` then `+ days * 86_400_000` ms.
- **Codes are case-insensitive** — stored and compared in UPPERCASE so users never fail
  on casing.

## Data Model

Two new collections (kinds). Added to the `AllDoc` union and `AppSchema` namespace in
`common/types/schema.ts`.

```ts
interface PromoCode {
  _id: string
  kind: 'promo-code'
  code: string            // stored UPPERCASE, unique
  credits?: number        // optional credit grant
  days?: number           // optional premium-membership days
  maxUses: number         // 0 = unlimited
  uses: number            // running counter
  enabled: boolean
  expiresAt?: string      // ISO; omitted = never expires
  createdAt: string
  createdBy: string       // admin userId
  updatedAt?: string
}

interface PromoRedemption {
  _id: string
  kind: 'promo-redemption'
  codeId: string
  userId: string
  code: string            // denormalized for admin display
  credits: number         // what was actually granted
  days: number
  createdAt: string
}
```

### Indexes (`srv/db/client.ts:createIndexes`)

- `promo-code`: `{ code: 1 }` unique.
- `promo-redemption`: `{ codeId: 1, userId: 1 }` unique → DB-enforced one-per-account.

## Server

### `srv/db/promo.ts` (new)

- `getPromos()` — list all, newest first.
- `getPromoByCode(code)` — lookup by uppercased code.
- `createPromo(input)` — insert; throws 400 on duplicate code (uppercase).
- `updatePromo(id, patch)` — update editable fields; re-checks code uniqueness if changed.
- `deletePromo(id)` — hard delete the code (redemptions are retained as a record).
- `redeemPromo(userId, rawCode)` — race-safe redemption (see below).

### `redeemPromo` order of operations (race-safe)

1. Uppercase the input. Lookup code. Reject (StatusError 400/404):
   - not found
   - `!enabled`
   - expired: `expiresAt && new Date(expiresAt).valueOf() < Date.now()`
2. Atomic `findOneAndUpdate` on `promo-code` with guard
   `{ _id, enabled: true, $or: [{ maxUses: 0 }, { $expr: { $lt: ['$uses', '$maxUses'] } }] }`,
   apply `$inc: { uses: 1 }`. (Equivalent guard acceptable: read maxUses, then conditional
   update.) Null result → "This code has been fully used."
3. Insert `promo-redemption` (unique `codeId + userId`). On duplicate-key error → roll back
   with `$inc: { uses: -1 }` on the code, then throw "You have already redeemed this code."
4. Grant rewards:
   - `credits` (if > 0): `updateCredits(userId, credits)` (`srv/db/credits.ts`) — also emits
     the `credits-updated` socket event.
   - `days` (if > 0): compute `newPremiumUntil = max(premiumUntil, now) + days*86_400_000`,
     `updateUser(userId, { premium: true, premiumUntil: newPremiumUntil })`.
5. Return `toSafeUser(updatedUser)`.

### User route — `srv/api/user/` (redeem)

- `POST /user/promo/redeem` (loggedIn): body `{ code: string }` via `assertValid`.
  Calls `redeemPromo`, returns `{ user }`. Wire into the existing user router
  (`srv/api/user/index.ts` or equivalent).

### Admin routes — `srv/api/promo.ts` (new), mounted in `srv/api/index.ts`

All `isAdmin`:

- `GET  /admin/promo` → `{ codes }`
- `POST /admin/promo` → create `{ code, credits?, days?, maxUses, enabled, expiresAt? }`
- `POST /admin/promo/:id` → update
- `DELETE /admin/promo/:id` → delete

Mount: `router.use('/admin', promo)` alongside the existing admin routers.

Validation: `maxUses >= 0`; at least one of `credits`/`days` > 0; `code` non-empty.

## Frontend

### `web/store/user.ts`

- `redeemPromo(code)` async action: `POST /user/promo/redeem`, on success merge returned
  user into state and `toastStore.success`; on error `toastStore.error`.

### `web/pages/Profile/SubscriptionPage.tsx`

**Add** a "Redeem a promo code" `SolidCard`: a `TextInput` + Redeem `Button`
(disabled while loading / empty), success & error via toasts. Placed near the top of the
page (above or just under the "Why subscribe?" card).

**Cleanup (remove):**
- Stripe `Upgrade` and `Downgrade` buttons (the `Match` blocks for `user.sub?.type === 'native'`)
  and their two `ConfirmModal`s (`showUpgrade`, `showDowngrade`) plus the
  `setUpgrade`/`setDowngrade`/`showDowngrade` signals and `modifySubscription` calls.
- The `Unsubscribe` button + its `ConfirmModal` (`showUnsub`/`setUnsub`) and
  `stopSubscription` call.
- The `'Subscribed via Stripe'` label branch; simplify the "Subscribed via" pill to the
  remaining sources (Patreon / Gift / PayPal-grandfathered).
- Legacy copy: "use Stripe or Patreon if you want auto-renew", "All prices are in EUR",
  "Patreon price shown is excl. VAT." — review and remove/replace the Stripe/EUR wording.

**Keep:**
- `PatreonControls`, the "Current Subscription" card for grandfathered/existing subscribers,
  Patreon subscribe links and the candidate tier cards' "Subscribe via Patreon" path,
  support-email card.

### Admin UI

- `web/pages/Admin/PromoCodes.tsx` (new): list of codes with create/edit form and delete,
  mirroring the structure of `Announcements.tsx` / `Tiers.tsx`. Fields: code, credits, days,
  maxUses, enabled, expiresAt (datetime), plus read-only `uses`. Optional "generate random
  code" convenience button that fills the code field (admin can still edit).
- `web/store/admin.ts`: `getPromos`, `createPromo`, `updatePromo`, `deletePromo` actions +
  `promos` in state.
- `web/App.tsx`: route `/admin/promo` (and `/admin/promo/:id` if an edit subroute is used)
  → lazy `PromoCodes`.
- `web/Navigation.tsx`: `SubItem href="/admin/promo"` under the admin group.

## Error Handling

- All server validation via `StatusError` (existing pattern), surfaced to the user as toasts.
- Redemption errors are user-friendly: already redeemed / fully used / expired / disabled /
  invalid code.
- Race conditions handled by the unique index (one-per-account) and the conditional
  `$inc` guard (max-uses), with rollback on the rare insert-after-increment dup.

## Testing (`tests/`)

`redeemPromo` coverage:
- Happy paths: credits-only, days-only, both.
- Already redeemed (second attempt by same user) → rejected, `uses` not double-counted.
- Disabled code → rejected.
- Expired code → rejected.
- Max uses exhausted → rejected; `maxUses: 0` (unlimited) allowed.
- Days extension math: extends existing `premiumUntil` when in the future, else from now.

Run `pnpm checks` (format + typecheck + test) and the heavier srv typecheck before done.

## Out of Scope

- No changes to Stripe/Patreon billing backends beyond removing dead UI on the page.
- No bulk code generation / CSV import.
- No per-code analytics dashboard beyond the `uses` counter and redemption records.
