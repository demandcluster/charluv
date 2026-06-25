# Blog Page Restyle + Discover-as-Landing — Design

Date: 2026-06-25
Branch: feat/charluv-rewrite

## Problem

The legacy Agnaistic "Home" page (`web/pages/Home/index.tsx`, route `/`) is the only
page still on the old theme (`Card`/`TitleCard`/`Pill`, `bg-800`/`bg-700` vars). It
carries dead content (AgnAIstic credits, "13B model", AI Horde links, ElevenLabs
"currently disabled", Horde/OpenAI setup-guide modals) and is mis-positioned as a
marketing landing.

Two routing facts today:
- Logged-out `/` renders `HomePage`; logged-in `/` redirects to `/discover`.
- After login the redirect does not fire until a page refresh, so users briefly land
  on Home — a bug.

## Goals

1. Discover becomes the landing for everyone at `/` (logged in or out). This removes the
   post-login-lands-on-Home bug.
2. Home is repurposed into a **blog / news page** at `/blog`, restyled to match
   Discover's "warm dusk" editorial aesthetic.
3. Dead content is removed; real sections are kept and restyled.

Non-goals: no changes to Discover's visuals, no data migrations, no backend changes,
no renaming of stored ids.

## Approach (chosen: A)

Mirror Discover's proven pattern: a dedicated scoped CSS file with a custom class
prefix and the warm-dusk oklch palette. Extract the shared palette into a partial so
the two pages single-source it. Keep the `--dsc-` variable prefix to keep the Discover
diff to a single import swap (renaming would churn every reference in `discover.css`).

## File changes

| File | Action |
|---|---|
| `web/pages/warm-dusk.css` | **new** — palette + page-background gradient, scoped to `.dsc-root, .blg-root` |
| `web/pages/Discover/discover.css` | edit — remove inline var block (lines defining `--dsc-*` and the `background:`/`color:`/`font-family` on `.dsc-root`); `@import '../warm-dusk.css'`. Net visual change: none. |
| `web/pages/Home/blog.css` | **new** — `.blg-*` classes |
| `web/pages/Home/index.tsx` | rewrite markup → `BlogPage`; cut dead content |
| `web/pages/Home/home.scss` | **delete** — only holds `.home-cards`, which goes away |
| `web/App.tsx` | routing change |

### warm-dusk.css (shared token partial)

Move the following out of `.dsc-root` in `discover.css` into a partial, applied to both
page roots:

```css
.dsc-root,
.blg-root {
  --dsc-bg: oklch(0.18 0.03 350);
  --dsc-bg-2: oklch(0.23 0.04 348);
  --dsc-surface: oklch(0.27 0.045 345);
  --dsc-cream: oklch(0.94 0.02 75);
  --dsc-muted: oklch(0.72 0.03 350);
  --dsc-line: oklch(0.4 0.05 345 / 0.5);
  --dsc-green: oklch(0.74 0.11 165);
  --dsc-green-deep: oklch(0.64 0.12 165);
  --dsc-wine: oklch(0.55 0.16 5);

  min-height: 100%;
  background:
    radial-gradient(120% 80% at 85% -10%, oklch(0.3 0.08 350 / 0.6), transparent 60%),
    radial-gradient(90% 60% at -10% 110%, oklch(0.28 0.06 165 / 0.35), transparent 55%),
    var(--dsc-bg);
  color: var(--dsc-cream);
  font-family: 'Lato', system-ui, sans-serif;
}
```

The Fraunces `@import url(...)` font line stays at the top of whichever file is loaded;
put it in the partial so both pages get it. `discover.css` keeps its own `padding`
declaration on `.dsc-root` (blog sets its own).

### blog.css

Scoped under `.blg-root`. Readable centered column (`max-width: ~860px`, auto margins,
responsive padding via `clamp`). Sections:

- `.blg-head` — hero: Fraunces title ("News & Updates"), muted tagline carrying the
  short "Charluv is a virtual dating chat service…" intro copy.
- `.blg-feed` / `.blg-post` — announcement cards: surface bg, `--dsc-line` border, 18px
  radius. `.blg-post-title` (Fraunces), `.blg-post-date` (muted, `elapsedSince`),
  `.blg-post-body` (reuses existing `rendered-markdown` class).
- `.blg-recent` — Recent Conversations strip (logged-in only), chat cards reskinned to
  warm-dusk surfaces; preserves existing desktop/mobile card behaviour and the
  register/match/create/edit `BorderCard` prompts.
- `.blg-card` — Features and Getting Started as warm-dusk panels.
- `.blg-links` — pill links (Memory Book guide, Discord, Terms, Privacy).
- `.blg-footer` — compact band: app download (itch embed) + "Featured on" badges.
- `prefers-reduced-motion` guard; mobile breakpoint (single column, smaller type).

### index.tsx

Rename component to `BlogPage` (default export unchanged in shape). Replace `home.scss`
import with `blog.css`. Wrap content in `.blg-root`.

**Keep (restyled):** announcements feed (lead section), Recent Conversations, Features,
Getting Started, Guides/Links pills, ad `Slot`s (`leaderboard` + `content`), app
download (itch) + "Featured on" badges (footer band).

**Cut:** `HordeGuide` + `OpenAIGuide` components, `Sub` enum and `sub` signal and the
trailing `<Switch>`, the Credits `Card` (AgnAIstic / 13B / AI Horde / db0), the green
logo bar, the ElevenLabs "currently disabled" paragraph and any model-size claim in
`Features`. Drop now-unused imports (`logoDark`, `SolidCard`, `Modal`, `markdown` only
if unused after edits, etc. — verify per-symbol).

Page title → `setComponentPageTitle('News')`.

### App.tsx routing

- `/` → `Discover` for everyone. Remove the `Show`/`Redirect`/`HomePage` fallback block
  (currently lines ~79–86). Reuse the existing lazy `Discover` import.
- `/blog` → `BlogPage`.
- `/info` → `BlogPage` (alias retained for existing backlinks).
- The nav logo's `/` link now lands on Discover — intended.

## Data flow

No data changes. `announceStore.getAll()` on mount feeds `.blg-feed` (already filtered by
`location === 'home'`/`undefined` and user level — keep that filter). `chatStore` feeds
Recent Conversations. `userStore().loggedIn` gates the recent strip and create prompts.

## Error / edge handling

- Empty announcements: hero + recent + static sections still render (feed simply absent).
- Logged-out: Recent Conversations strip hidden; register `BorderCard` shown as today.
- Markdown announcement bodies continue through `markdown.makeHtml` + `rendered-markdown`.

## Verification

CSS + markup only; no unit tests added.
- `pnpm typecheck` (web) passes.
- `ts.transpileModule` syntax check on edited `.tsx`.
- Manual visual check via Playwright/`/run`: `/` shows Discover (logged in AND out, no
  redirect flash), `/blog` and `/info` show the restyled blog, mobile breakpoint holds,
  reduced-motion respected.
- Confirm no leftover `.home-cards` / `home.scss` references after deletion.

## Risks

- `discover.css` import swap must produce byte-equivalent rendering — verify Discover
  visually unchanged after the extraction.
- Removing the logged-in redirect must not break any code that assumed `/` = Home for
  logged-in users — grep for internal links to `/` used as "home".
