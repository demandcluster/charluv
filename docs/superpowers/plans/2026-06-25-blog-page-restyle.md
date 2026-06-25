# Blog Page Restyle + Discover-as-Landing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Repurpose the legacy Agnai "Home" page into a warm-dusk styled blog/news page at `/blog`, and make Discover the landing at `/` for everyone.

**Architecture:** Extract Discover's "warm dusk" oklch palette + page background into a shared CSS partial imported by both Discover and a new scoped `blog.css`. Rewrite `web/pages/Home/index.tsx` markup to the warm-dusk structure, cutting dead content. Repoint routing so `/` renders Discover and the blog lives at `/blog` (+ `/info` alias).

**Tech Stack:** SolidJS, Tailwind (arbitrary-value utilities referencing CSS vars), plain CSS (Vite-bundled), `@solidjs/router`.

## Global Constraints

- Package manager: **pnpm**, never npm.
- **No data migrations**; no backend/schema changes in this work (none needed).
- **Commit only when the user explicitly asks** (per repo CLAUDE.md). Each task's
  "Commit" step means: `git add` the listed files and pause; run `git commit` only if
  the user has approved committing.
- Vite resolves `.ts`/`.tsx` before `.js`; never check in compiled web `.js`/`.js.map`.
- Keep the CSS custom-property prefix `--dsc-` (shared palette) — do not rename.
- Web typecheck: `pnpm typecheck`. Quick syntax check of a single web file:
  `npx tsc --noEmit` is heavy — prefer `node -e "require('typescript').transpileModule(...)"`
  or just rely on `pnpm typecheck`.

---

## File Structure

| File | Responsibility |
|---|---|
| `web/pages/warm-dusk.css` (new) | Shared warm-dusk palette + page background, scoped to `.dsc-root, .blg-root` |
| `web/pages/Discover/discover.css` (modify) | Drop inline palette block; import the shared partial. No visual change. |
| `web/pages/Home/blog.css` (new) | `.blg-*` layout/typography for the blog page |
| `web/pages/Home/index.tsx` (rewrite) | `BlogPage` component — warm-dusk markup, dead content removed |
| `web/pages/Home/home.scss` (delete) | Obsolete `.home-cards` styles |
| `web/App.tsx` (modify) | Routing: `/`→Discover; `/blog`+`/info`→BlogPage; `fullBleed` includes them |

---

## Task 1: Shared warm-dusk palette partial

**Files:**
- Create: `web/pages/warm-dusk.css`
- Modify: `web/pages/Discover/discover.css:1-26`

**Interfaces:**
- Produces: CSS custom properties `--dsc-bg`, `--dsc-bg-2`, `--dsc-surface`, `--dsc-cream`,
  `--dsc-muted`, `--dsc-line`, `--dsc-green`, `--dsc-green-deep`, `--dsc-wine`, plus the
  page `background`, `color`, `min-height`, `font-family`, and the Fraunces `@font-face`
  import — all available to any element under `.dsc-root` or `.blg-root`.

- [ ] **Step 1: Create the shared partial**

Create `web/pages/warm-dusk.css`:

```css
/* Shared "warm dusk" editorial palette + page background for Charluv's
   modern pages (Discover, Blog). Scoped to page roots so it never bleeds
   into the legacy theme. Keep the --dsc- prefix: it is the shared palette. */
@import url('https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,400;0,9..144,600;1,9..144,500&display=swap');

.dsc-root,
.blg-root {
  /* warm plum dusk, never pure black */
  --dsc-bg: oklch(0.18 0.03 350);
  --dsc-bg-2: oklch(0.23 0.04 348);
  --dsc-surface: oklch(0.27 0.045 345);
  --dsc-cream: oklch(0.94 0.02 75);
  --dsc-muted: oklch(0.72 0.03 350);
  --dsc-line: oklch(0.4 0.05 345 / 0.5);
  /* Charluv logo green */
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

- [ ] **Step 2: Rewire discover.css to import the partial**

Replace the current top of `web/pages/Discover/discover.css` (lines 1-26 — the header
comment, the Fraunces `@import url(...)`, and the entire `.dsc-root { ... }` block) with:

```css
/* Discover — "warm dusk" editorial aesthetic with the Charluv green accent.
   Palette + page background live in ../warm-dusk.css (shared with the blog page).
   Scoped under .dsc-root so it never bleeds into the legacy theme. */
@import '../warm-dusk.css';

.dsc-root {
  padding: clamp(1.25rem, 4vw, 3.5rem) clamp(1rem, 5vw, 4rem) 5rem;
}
```

Leave everything from `/* ---- header ---- */` (old line 28) onward unchanged.

- [ ] **Step 3: Typecheck**

Run: `pnpm typecheck`
Expected: PASS (CSS is not typechecked, but confirms no TS broke).

- [ ] **Step 4: Visual confirm Discover is unchanged**

Run the app (`/run` or Playwright) and load `/discover`. Confirm: background gradient,
Fraunces title "Find your someone", green accent, card layout all render exactly as
before. The extraction must be visually identical.

- [ ] **Step 5: Commit** (only if user approved committing)

```bash
git add web/pages/warm-dusk.css web/pages/Discover/discover.css
git commit -m "refactor(ui): extract shared warm-dusk palette partial"
```

---

## Task 2: Blog page stylesheet

**Files:**
- Create: `web/pages/Home/blog.css`

**Interfaces:**
- Consumes: the `--dsc-*` vars + Fraunces font from `../warm-dusk.css` (Task 1).
- Produces: classes consumed by Task 3 — `blg-root`, `blg-head`, `blg-title`, `blg-tag`,
  `blg-ad`, `blg-feed`, `blg-post`, `blg-post-head`, `blg-post-title`, `blg-post-date`,
  `blg-post-body`, `blg-recent`, `blg-recent-title`, `blg-recent-grid`, `blg-card`,
  `blg-card-title`, `hl`, `blg-link-inline`, `blg-links`, `blg-pill`, `blg-footer`,
  `blg-foot-group`.

- [ ] **Step 1: Create blog.css**

Create `web/pages/Home/blog.css`:

```css
/* Blog / News page — warm-dusk editorial, matching Discover.
   Palette + page background come from ../warm-dusk.css. */
@import '../warm-dusk.css';

.blg-root {
  max-width: 920px;
  margin: 0 auto;
  padding: clamp(1.25rem, 4vw, 3rem) clamp(1rem, 5vw, 2.5rem) 5rem;
  display: flex;
  flex-direction: column;
  gap: clamp(1.5rem, 4vw, 2.5rem);
}

/* hero */
.blg-head {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}
.blg-title {
  font-family: 'Fraunces', Georgia, serif;
  font-weight: 600;
  font-size: clamp(2.2rem, 6vw, 4rem);
  line-height: 0.95;
  letter-spacing: -0.02em;
  margin: 0;
}
.blg-title em {
  font-style: italic;
  color: var(--dsc-green);
}
.blg-tag {
  color: var(--dsc-muted);
  max-width: 60ch;
  margin: 0;
  font-size: clamp(0.95rem, 1.4vw, 1.1rem);
  line-height: 1.55;
}

/* ad slot wrapper */
.blg-ad {
  display: flex;
  justify-content: center;
  width: 100%;
}

/* announcements feed */
.blg-feed {
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
}
.blg-post {
  background: linear-gradient(160deg, var(--dsc-surface), var(--dsc-bg-2));
  border: 1px solid var(--dsc-line);
  border-radius: 18px;
  padding: clamp(1.1rem, 3vw, 1.75rem);
}
.blg-post-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 1rem;
  flex-wrap: wrap;
  margin-bottom: 0.6rem;
}
.blg-post-title {
  font-family: 'Fraunces', serif;
  font-weight: 600;
  font-size: clamp(1.3rem, 2.6vw, 1.9rem);
  line-height: 1.1;
  margin: 0;
}
.blg-post-date {
  color: var(--dsc-muted);
  font-size: 0.78rem;
  letter-spacing: 0.04em;
  white-space: nowrap;
}
.blg-post-body {
  color: var(--dsc-cream);
  line-height: 1.6;
}
.blg-post-body a {
  color: var(--dsc-green);
}

/* recent conversations */
.blg-recent {
  display: flex;
  flex-direction: column;
  gap: 0.9rem;
}
.blg-recent-title {
  font-family: 'Fraunces', serif;
  font-size: clamp(1.2rem, 2.4vw, 1.6rem);
  font-weight: 600;
  margin: 0;
}
.blg-recent-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 0.7rem;
}
@media (min-width: 640px) {
  .blg-recent-grid {
    grid-template-columns: repeat(4, 1fr);
    gap: 1rem;
  }
}

/* static cards (Features, Getting Started) */
.blg-card {
  background: linear-gradient(160deg, var(--dsc-surface), var(--dsc-bg-2));
  border: 1px solid var(--dsc-line);
  border-radius: 18px;
  padding: clamp(1.1rem, 3vw, 1.75rem);
  line-height: 1.6;
}
.blg-card-title {
  font-family: 'Fraunces', serif;
  font-size: clamp(1.3rem, 2.6vw, 1.8rem);
  font-weight: 600;
  margin: 0 0 0.75rem;
}
.blg-card p {
  margin: 0 0 0.6rem;
}
.blg-card p:last-child {
  margin-bottom: 0;
}
.blg-card .hl {
  color: var(--dsc-green);
  font-weight: 700;
}
.blg-link-inline {
  color: var(--dsc-green);
  text-decoration: underline;
}

/* link pills */
.blg-links {
  display: flex;
  flex-wrap: wrap;
  gap: 0.6rem;
}
.blg-pill {
  display: inline-flex;
  align-items: center;
  border: 1px solid var(--dsc-line);
  background: transparent;
  color: var(--dsc-cream);
  padding: 0.4rem 1rem;
  border-radius: 999px;
  font-size: 0.85rem;
  text-decoration: none;
  transition: border-color 180ms ease, color 180ms ease;
}
.blg-pill:hover {
  border-color: var(--dsc-green);
  color: var(--dsc-green);
}

/* footer band: app download + featured-on badges */
.blg-footer {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: 1.5rem 2rem;
  padding-top: 1.5rem;
  border-top: 1px solid var(--dsc-line);
}
.blg-foot-group {
  display: flex;
  align-items: center;
  gap: 1rem;
}

@media (prefers-reduced-motion: reduce) {
  .blg-pill {
    transition: none;
  }
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 3: Commit** (only if user approved committing)

```bash
git add web/pages/Home/blog.css
git commit -m "feat(ui): add warm-dusk blog page stylesheet"
```

---

## Task 3: Rewrite the page component

**Files:**
- Modify (full rewrite): `web/pages/Home/index.tsx`
- Delete: `web/pages/Home/home.scss`

**Interfaces:**
- Consumes: `blog.css` classes (Task 2); `announceStore`, `chatStore`, `userStore`;
  `markdown.makeHtml`, `elapsedSince`, `getAssetUrl`, `uniqueBy`, `setComponentPageTitle`,
  `createEmitter`/`ComponentEmitter`, `Slot`, `AvatarIcon`, `useRef`.
- Produces: default export `BlogPage` (a `Component`) — consumed by `App.tsx` routes
  `/blog`, `/info`, and the `*` fallback (Task 4).

- [ ] **Step 1: Confirm home.scss has no other importers**

Run: `grep -rn "home.scss" web`
Expected: only `web/pages/Home/index.tsx:1`. If anything else imports it, stop and
reassess. Also run: `grep -rn "home-cards" web` — expected: only matches inside
`index.tsx`/`home.scss` (both being removed).

- [ ] **Step 2: Replace the entire contents of `web/pages/Home/index.tsx`**

```tsx
import './blog.css'
import nsfwTools from '../../asset/featured-on-badge-b.avif?url'
import { Component, For, Show, createMemo, onMount } from 'solid-js'
import {
  ComponentEmitter,
  createEmitter,
  getAssetUrl,
  setComponentPageTitle,
  uniqueBy,
} from '../../shared/util'
import { announceStore, chatStore, userStore } from '../../store'
import { A, useNavigate } from '@solidjs/router'
import { MoveRight, Plus, Heart, Users } from '/web/icons'
import AvatarIcon from '/web/shared/AvatarIcon'
import { elapsedSince } from '/common/util'
import { markdown } from '/web/shared/markdown'
import Slot from '/web/shared/Slot'
import { useRef } from '/web/shared/hooks'

const taaftHTML = `<a href="https://theresanaiforthat.com/ai/charluv/?ref=featured&v=2416874" target="_blank" rel="nofollow"><img width="300" src="https://media.theresanaiforthat.com/featured-on-taaft.png?width=600"></a>`

const itchHTML = `<iframe frameborder="0" src="https://itch.io/embed/2216072?bg_color=55b89c&amp;fg_color=fff" width="552" height="167"><a href="https://rongames.itch.io/charluv">Charluv by Charluv</a></iframe>`

const BlogPage: Component = () => {
  const [topRef, onTopRef] = useRef()
  const [midRef, onMidRef] = useRef()
  setComponentPageTitle('News')

  const user = userStore()
  const announce = announceStore()

  const announcements = createMemo(() => {
    return announce.list.filter((ann) => {
      if (ann.location && ann.location !== 'home') return false

      const level = ann.userLevel ?? -1
      const userPremium = user.user?.premium ? 10 : -1
      const premiumLevel = Math.max(user.userLevel, userPremium)
      return premiumLevel >= level
    })
  })

  const emitter = createEmitter('loaded')

  onMount(() => {
    announceStore.getAll()
  })

  return (
    <div class="blg-root">
      <header class="blg-head">
        <h1 class="blg-title">
          News &amp; <em>Updates</em>
        </h1>
        <p class="blg-tag">
          Charluv is a virtual dating chat service where you can even create your own characters.
          Membership is free; premium gives you priority and near-unlimited messages. Your
          conversations are completely private and never shared with anyone unless you invite them.
        </p>
      </header>

      <div class="blg-ad" ref={onTopRef}>
        <Slot slot="leaderboard" parent={topRef()} />
      </div>

      <Show when={announcements().length > 0}>
        <section class="blg-feed" aria-label="Announcements">
          <For each={announcements()}>
            {(item) => (
              <article class="blg-post">
                <div class="blg-post-head">
                  <h2 class="blg-post-title">{item.title}</h2>
                  <span class="blg-post-date">{elapsedSince(item.showAt)} ago</span>
                </div>
                <div
                  class="blg-post-body rendered-markdown"
                  innerHTML={markdown.makeHtml(item.content)}
                />
              </article>
            )}
          </For>
        </section>
      </Show>

      <RecentChats emitter={emitter} />

      <div class="blg-ad" ref={onMidRef}>
        <Slot slot="content" parent={midRef()} />
      </div>

      <Features />

      <section class="blg-card" aria-label="Getting started">
        <h2 class="blg-card-title">Getting Started</h2>
        <p>
          Looking for help getting started? Check out the{' '}
          <a class="blg-link-inline" href="https://guide.charluv.com" target="_blank">
            Official Guide
          </a>{' '}
          or head to the{' '}
          <a class="blg-link-inline" href="https://charluv.com/discord" target="_blank">
            Charluv Discord
          </a>
          .
        </p>
      </section>

      <nav class="blg-links" aria-label="Links">
        <A class="blg-pill" href="/guides/memory">
          Memory Book
        </A>
        <a class="blg-pill" href="/discord" target="_blank">
          Discord
        </a>
        <A class="blg-pill" href="/terms">
          Terms of Service
        </A>
        <A class="blg-pill" href="/privacy">
          Privacy Policy
        </A>
      </nav>

      <footer class="blg-footer">
        <div class="blg-foot-group" innerHTML={itchHTML} />
        <div class="blg-foot-group">
          <div innerHTML={taaftHTML} />
          <a href="https://nsfw.tools" target="_blank" rel="nofollow">
            <img width="250" src={nsfwTools} alt="Featured on nsfw.tools" />
          </a>
        </div>
      </footer>
    </div>
  )
}

export default BlogPage

const RecentChats: Component<{ emitter: ComponentEmitter<'loaded'> }> = (props) => {
  const nav = useNavigate()
  const user = userStore()
  const state = chatStore((s) => {
    // We want this to occur after the state has propogated
    setTimeout(() => {
      props.emitter.emit.loaded(), 200
    })

    return {
      chars: s.allChars.list,
      last: uniqueBy(s.allChats, 'characterId')
        .slice()
        .sort((l, r) => (r.updatedAt > l.updatedAt ? 1 : -1))
        .slice(0, 4)
        .map((chat) => ({ chat, char: s.allChars.map[chat.characterId] })),
    }
  })

  return (
    <section class="blg-recent" aria-labelledby="homeRecConversations">
      <h2 id="homeRecConversations" class="blg-recent-title">
        Recent Conversations
      </h2>
      <div class="blg-recent-grid" classList={{ hidden: state.last.length === 0 }}>
        <For each={state.last}>
          {({ chat, char }) => (
            <>
              <div
                role="link"
                aria-label={`Chat with ${char?.name}, ${elapsedSince(chat.updatedAt)} ago ${
                  chat.name
                }`}
                class="hover:bg-[var(--dsc-bg-2)] hidden h-24 w-full cursor-pointer overflow-hidden rounded-xl border border-[var(--dsc-line)] bg-[var(--dsc-surface)] transition duration-300 hover:border-[var(--dsc-green)] sm:flex"
                onClick={() => nav(`/chat/${chat._id}`)}
              >
                <Show when={char?.avatar}>
                  <AvatarIcon
                    noBorder
                    class="flex items-center justify-start"
                    format={{ corners: 'md', size: 'max3xl' }}
                    avatarUrl={getAssetUrl(char?.avatar || '')}
                  />
                </Show>

                <Show when={!char?.avatar}>
                  <div class="flex h-24 w-24 items-center justify-center">
                    <AvatarIcon
                      noBorder
                      format={{ corners: 'md', size: 'xl' }}
                      avatarUrl={getAssetUrl(char?.avatar || '')}
                    />
                  </div>
                </Show>

                <div class="flex w-full flex-col justify-between text-sm" aria-hidden="true">
                  <div class="flex flex-col px-1">
                    <div class="text-sm font-bold">{char?.name}</div>
                    <div class="text-[var(--dsc-muted)] text-xs">
                      {elapsedSince(chat.updatedAt)} ago
                    </div>
                    <Show when={chat.name}>
                      <p class="line-clamp-2 max-h-10 overflow-hidden text-ellipsis">{chat.name}</p>
                    </Show>
                  </div>
                  <div class="flex max-h-10 w-full items-center justify-end px-2">
                    <MoveRight size={14} />
                  </div>
                </div>
              </div>

              <div
                role="link"
                aria-label={`Chat with ${char?.name}, ${elapsedSince(chat.updatedAt)} ago ${
                  chat.name
                }`}
                class="hover:bg-[var(--dsc-bg-2)] flex w-full cursor-pointer flex-col overflow-hidden rounded-xl border border-[var(--dsc-line)] bg-[var(--dsc-surface)] transition duration-300 hover:border-[var(--dsc-green)] sm:hidden"
                onClick={() => nav(`/chat/${chat._id}`)}
              >
                <div class="flex" aria-hidden="true">
                  <div class="flex items-center justify-center px-1 pt-1">
                    <AvatarIcon
                      noBorder
                      format={{ corners: 'circle', size: 'md' }}
                      avatarUrl={getAssetUrl(char?.avatar || '')}
                    />
                  </div>
                  <div class="flex flex-col overflow-hidden text-ellipsis whitespace-nowrap px-1">
                    <div class="overflow-hidden text-ellipsis text-sm font-bold">{char?.name}</div>
                    <div class="text-[var(--dsc-muted)] text-xs">
                      {elapsedSince(chat.updatedAt)} ago
                    </div>
                  </div>
                </div>

                <div class="flex h-full w-full flex-col justify-between text-sm" aria-hidden="true">
                  <p class="line-clamp-2 max-h-10 overflow-hidden text-ellipsis px-1">
                    {chat.name}
                  </p>

                  <div class="flex max-h-10 w-full items-center justify-end px-2">
                    <MoveRight size={14} />
                  </div>
                </div>
              </div>
            </>
          )}
        </For>

        <Show when={!user?.loggedIn}>
          <BorderCard href="/register">
            <div>Register to Start Chatting</div>
            <Plus size={20} />
          </BorderCard>
        </Show>

        <Show when={state.last.length < 4 && user.loggedIn}>
          <BorderCard href="/discover">
            <div>Find Matches</div>
            <Users size={20} />
          </BorderCard>
        </Show>

        <Show when={state.last.length < 3 && user.loggedIn}>
          <BorderCard href="/chats/create">
            <div>Start a Conversation</div>
            <Plus size={20} />
          </BorderCard>
        </Show>

        <Show when={state.last.length < 2 && user.loggedIn}>
          <BorderCard href="/create">
            <div class="flex w-full items-center justify-center text-center">Create a Character</div>
            <Heart size={20} />
          </BorderCard>
        </Show>
      </div>
    </section>
  )
}

const BorderCard: Component<{ children: any; href: string; ariaLabel?: string }> = (props) => {
  const nav = useNavigate()
  return (
    <div
      role="button"
      aria-label={props.ariaLabel}
      class="hover:bg-[var(--dsc-surface)] flex h-24 w-full cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-[var(--dsc-line)] text-center text-[var(--dsc-muted)] transition duration-300 hover:border-[var(--dsc-green)] hover:text-[var(--dsc-cream)]"
      onClick={() => nav(props.href)}
    >
      {props.children}
    </div>
  )
}

const Features: Component = () => (
  <section class="blg-card" aria-label="Notable features">
    <h2 class="blg-card-title">Notable Features</h2>
    <p>
      <span class="hl">Charluv</span> is completely free to use and free to register. Your data is
      kept private and you can permanently delete it at any time. We take your privacy very
      seriously.
    </p>
    <p>
      <span class="hl">Unique model</span> trained for understanding virtual dating and character
      progression.
    </p>
    <p>
      <span class="hl">Register</span> to have your data available on all of your devices.
    </p>
    <p>Chat with multiple characters at the same time.</p>
    <p>
      Create <span class="hl">Memory Books</span> to give your characters information about their
      world.
    </p>
    <p>
      <span class="hl">Image generation</span> — generate images in your chats.
    </p>
    <p>
      <span class="hl">Voice</span> — give your characters a voice and have them speak back to you.
    </p>
  </section>
)
```

Notes on deliberate changes from the old file:
- Removed: `HordeGuide`, `OpenAIGuide`, the `Sub` enum, the `sub` signal, the trailing
  `<Switch>`, the standalone `Announcements` component, the Credits card, the green logo
  bar, the ElevenLabs "currently disabled" paragraph, and the 13B model claim.
- Removed dead imports: `logoDark`, `Card`/`Pill`/`SolidCard`/`TitleCard`, `Modal`,
  `adaptersToOptions`, `settingStore`, `AppSchema`, `Match`, `Switch`, `createSignal`.
- Two separate refs (`topRef`/`midRef`) instead of the old single `ref`/`onRef` reused on
  two elements (pre-existing bug — the second usage clobbered the first).
- Match/create prompt links updated to live routes (`/discover`, `/create`) instead of
  retired `/likes/list` and `/editor`.

- [ ] **Step 3: Delete the obsolete stylesheet**

```bash
git rm web/pages/Home/home.scss
```

- [ ] **Step 4: Typecheck**

Run: `pnpm typecheck`
Expected: PASS, with no "unused import" / "cannot find name" errors. If any kept import
turns out unused after your edits, remove it; if any used symbol is missing, re-add it.

- [ ] **Step 5: Commit** (only if user approved committing)

```bash
git add web/pages/Home/index.tsx
git commit -m "feat(ui): rewrite home page as warm-dusk blog, drop dead content"
```

---

## Task 4: Routing — Discover at `/`, blog at `/blog`

**Files:**
- Modify: `web/App.tsx:73` (hoist Discover lazy import), `:78-86` (routes), `:188-193`
  (`fullBleed` memo)

**Interfaces:**
- Consumes: default export `BlogPage` from `./pages/Home` (Task 3) — already imported as
  `HomePage` on line 18; the import name is unchanged (default import alias).

- [ ] **Step 1: Hoist the Discover lazy import**

In `web/App.tsx`, just below the `import` block (after line 48), add:

```tsx
const DiscoverPage = lazy(() => import('./pages/Discover'))
```

Then change line 73 from:

```tsx
      <Route path="/discover" component={lazy(() => import('./pages/Discover'))} />
```

to:

```tsx
      <Route path="/discover" component={DiscoverPage} />
```

- [ ] **Step 2: Repoint the landing + blog routes**

Replace the block at lines 78-86:

```tsx
      <Route path="/info" component={HomePage} />
      <Route
        path="/"
        component={() => (
          <Show when={state.loggedIn} fallback={<HomePage />}>
            <Redirect internal="/discover" />
          </Show>
        )}
      />
```

with:

```tsx
      <Route path="/" component={DiscoverPage} />
      <Route path="/blog" component={HomePage} />
      <Route path="/info" component={HomePage} />
```

(`HomePage` is the default import of the now-`BlogPage` component.)

- [ ] **Step 3: Make the warm-dusk pages full-bleed**

The `fullBleed` memo (lines 188-193) gates the legacy boxed `content-background`
wrapper. `/` now renders Discover but its pathname is `/` (not `/discover`), and the blog
paints its own background — all three must opt out of the boxed wrapper. Replace:

```tsx
  const fullBleed = createMemo(
    () =>
      location.pathname.startsWith('/discover') ||
      location.pathname === '/mine' ||
      location.pathname.startsWith('/mine/')
  )
```

with:

```tsx
  const fullBleed = createMemo(
    () =>
      location.pathname === '/' ||
      location.pathname === '/blog' ||
      location.pathname === '/info' ||
      location.pathname.startsWith('/discover') ||
      location.pathname === '/mine' ||
      location.pathname.startsWith('/mine/')
  )
```

- [ ] **Step 4: Typecheck**

Run: `pnpm typecheck`
Expected: PASS. `Show`, `Redirect`, and `state` are all still used elsewhere in the file
(e.g. lines 107, 112, 144, 205-211), so no import removals are needed.

- [ ] **Step 5: Visual / behavioral check**

Run the app (`/run` or Playwright) and verify:
- Logged **out**: `/` shows Discover full-bleed (no boxed wrapper, no redirect flash).
- Logged **in**: `/` shows Discover immediately (the old "lands on Home until refresh"
  bug is gone). `/blog` and `/info` show the restyled blog full-bleed.
- Blog: announcements feed renders (seed one via admin if needed), Recent Conversations
  appears when logged in with chats, Features + Getting Started + link pills + footer
  band (itch embed + featured-on badges) all render in warm-dusk style.
- Mobile width: blog is a single readable column; recent grid is 2-up.
- `prefers-reduced-motion`: pill hover transition disabled.

- [ ] **Step 6: Commit** (only if user approved committing)

```bash
git add web/App.tsx
git commit -m "feat(routing): make Discover the landing, move blog to /blog"
```

---

## Reachability follow-up (out of scope, flag to user)

`/blog` has no nav entry after this change. If the blog should be reachable from the UI,
a link must be added to `web/shared/NavBar`, `GuestTopBar`, `UserTopBar`, or
`Navigation` — not included here because the spec scoped only the page + routing. Raise
with the user.

---

## Self-Review

- **Spec coverage:** warm-dusk partial (Task 1) ✓; Discover one-import swap (Task 1) ✓;
  new blog.css (Task 2) ✓; index.tsx rewrite + dead-content cuts (Task 3) ✓; home.scss
  delete (Task 3) ✓; routing `/`→Discover + `/blog`/`/info` (Task 4) ✓; post-login bug
  fix (Task 4) ✓; keep announcements/recent/features/getting-started/links/slots/
  app-download/featured-on (Task 3) ✓; `fullBleed` correctness (Task 4) — caught during
  planning, added ✓.
- **Placeholders:** none — all code blocks are complete.
- **Type/name consistency:** `BlogPage` default export consumed by Task 4 routes; all
  `blg-*` class names defined in Task 2 match those used in Task 3; `--dsc-*` vars defined
  in Task 1 used by Tasks 2 & 3.
- **Known deviation from skill:** pure CSS/markup has no meaningful unit test, so tasks use
  typecheck + visual verification instead of a failing-test-first cycle.
