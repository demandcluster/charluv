# Event Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an "Event" feature — one-tap creation of a populated multi-character scene where a per-reply "director" model call elects which character speaks, biased toward a quiet 1:1 with bystanders interjecting only when warranted.

**Architecture:** Builds on existing multi-char chat (`chat.characters`, per-reply `replyAs`). Server-orchestrated: on a user `send` in an event chat, the server charges a flat fee once, then loops `electSpeaker` → generate one reply (reusing the existing single-reply pipeline, extracted into a reusable function) until the director returns `none` or a cap is hit. Each reply uses its own character's progression stage. A per-chat `memoryDisabled` flag gates long-term memory writes and recall so a party leaves no residue.

**Tech Stack:** SolidJS + Tailwind (web, Vite), Express + MongoDB + `ws` (srv, tsc), isomorphic `common/`, self-hosted OpenAI-compatible inference via `inferenceAsync` (`jsonSchema` constrained output). Tests: mocha over compiled `tests/**.spec.js` (covers `common/` only).

## Global Constraints

- **No data migrations.** Every new field is additive and optional (`mode` gains a union member, `event?`, `memoryDisabled?`). Never rename/repurpose a stored id.
- **Use `pnpm`, never `npm`.**
- **Web is bundled by Vite, not tsc** — web TS type errors are non-blocking (~546 pre-existing). Syntax-check web with `ts.transpileModule` if needed; do not check in compiled web `.js`/`.js.map`.
- **srv typecheck** (authoritative for backend): `NODE_OPTIONS=--max-old-space-size=6144 npx tsc -p srv.tsconfig.json --noEmit`.
- **Tests compile via** `srv.tsconfig.json` (includes `tests`, emits in place). To build + run a spec: `NODE_OPTIONS=--max-old-space-size=6144 npx tsc -p srv.tsconfig.json` then `npx mocha --inline-diffs --exit "tests/<name>.spec.js"`.
- **Credits:** normal message = 10. Event turn = **25 flat** (`EVENT_TURN_COST`), charged once per user turn regardless of reply count.
- **Cap:** `EVENT_MAX_REPLIES = 3` character replies per turn.
- **Never sexualize minors** — the existing 18+ safeguard in the levels preamble applies; the director prompt must not weaken it.
- Default branch for PRs is `trunk`; active work on `feat/charluv-rewrite`. Commit only when explicitly asked by the user; commit messages end with the CLAUDE.md footer.

---

### Task 1: Schema fields for events

**Files:**
- Modify: `common/types/schema.ts` (the `Chat` interface, ~lines 298-335)

**Interfaces:**
- Produces: `AppSchema.Chat.mode` now allows `'event'`; `AppSchema.Chat.event?: { location: string; description: string }`; `AppSchema.Chat.memoryDisabled?: boolean`. All later tasks rely on these.

- [ ] **Step 1: Add the fields**

In `common/types/schema.ts`, the `Chat` interface currently has:

```typescript
  export interface Chat {
    _id: string
    kind: 'chat'
    mode?: 'standard' | 'adventure' | 'companion'
```

Change the `mode` line and add two fields directly beneath it:

```typescript
  export interface Chat {
    _id: string
    kind: 'chat'
    mode?: 'standard' | 'adventure' | 'companion' | 'event'
    /** Event scene metadata. Present only when `mode === 'event'`. */
    event?: { location: string; description: string }
    /** When true, this chat neither writes nor recalls long-term memory.
     * Set on event creation; also user-toggleable in chat settings. */
    memoryDisabled?: boolean
```

- [ ] **Step 2: Typecheck**

Run: `NODE_OPTIONS=--max-old-space-size=6144 npx tsc -p srv.tsconfig.json --noEmit`
Expected: PASS (no new errors referencing `schema.ts`).

- [ ] **Step 3: Commit**

```bash
git add common/types/schema.ts
git commit -m "feat: add event mode + memoryDisabled fields to Chat schema"
```

---

### Task 2: Pure helpers and constants in `common/event.ts`

**Files:**
- Create: `common/event.ts`
- Create: `tests/event.spec.ts`

**Interfaces:**
- Produces:
  - `EVENT_TURN_COST = 25`, `EVENT_MAX_REPLIES = 3` (numeric consts)
  - `buildEventScenario(opts: { location: string; description: string; names: string[] }): string`
  - `buildDirectorPrompt(opts: { event: { location: string; description: string }; roster: Array<{ id: string; name: string; hook: string }>; recent: Array<{ name: string; text: string }>; repliedThisTurn: string[] }): string`
  - `buildSpeakerSchema(presentIds: string[]): object` — a JSON Schema whose `speaker` is an enum of `presentIds` plus `"none"`.

- [ ] **Step 1: Write the failing test**

Create `tests/event.spec.ts`:

```typescript
import { expect } from 'chai'
import './init'
import {
  EVENT_TURN_COST,
  EVENT_MAX_REPLIES,
  buildEventScenario,
  buildSpeakerSchema,
  buildDirectorPrompt,
} from '/common/event'

describe('Event helpers', () => {
  it('exposes the fixed economy/cap constants', () => {
    expect(EVENT_TURN_COST).to.equal(25)
    expect(EVENT_MAX_REPLIES).to.equal(3)
  })

  it('builds a scene block naming the location, description and attendees', () => {
    const actual = buildEventScenario({
      location: 'nightclub',
      description: 'Saturday DJ night',
      names: ['Mia', 'Jade'],
    })
    expect(actual).to.equal('Setting: nightclub. Event: Saturday DJ night. Present: Mia, Jade.')
  })

  it('constrains the speaker schema to present ids plus none', () => {
    const schema: any = buildSpeakerSchema(['a', 'b'])
    expect(schema.properties.speaker.enum).to.deep.equal(['a', 'b', 'none'])
    expect(schema.required).to.deep.equal(['speaker'])
  })

  it('includes the roster names and the addressing rule in the director prompt', () => {
    const prompt = buildDirectorPrompt({
      event: { location: 'bar', description: 'after work drinks' },
      roster: [{ id: 'a', name: 'Mia', hook: 'flirty bartender' }],
      recent: [{ name: 'You', text: 'Hey Mia' }],
      repliedThisTurn: [],
    })
    expect(prompt).to.contain('Mia')
    expect(prompt).to.contain('bar')
    expect(prompt.toLowerCase()).to.contain('none')
  })
})
```

- [ ] **Step 2: Build + run to verify it fails**

Run: `NODE_OPTIONS=--max-old-space-size=6144 npx tsc -p srv.tsconfig.json && npx mocha --inline-diffs --exit "tests/event.spec.js"`
Expected: FAIL — `Cannot find module '/common/event'` (or compile error).

- [ ] **Step 3: Implement `common/event.ts`**

```typescript
/** Flat credit cost of one user turn in an event chat (vs 10 for a normal message). */
export const EVENT_TURN_COST = 25

/** Hard cap on the number of character replies the director may elect per user turn. */
export const EVENT_MAX_REPLIES = 3

/** The scene block injected into the chat scenario so every prompt sees the event context. */
export function buildEventScenario(opts: {
  location: string
  description: string
  names: string[]
}): string {
  return `Setting: ${opts.location}. Event: ${opts.description}. Present: ${opts.names.join(', ')}.`
}

/** JSON Schema forcing the director to return a present character id or the literal "none". */
export function buildSpeakerSchema(presentIds: string[]): object {
  return {
    type: 'object',
    properties: {
      speaker: { type: 'string', enum: [...presentIds, 'none'] },
    },
    required: ['speaker'],
  }
}

/**
 * The director prompt. Asks the model to elect the next speaker, preferring the
 * directly-addressed character and only choosing a bystander with a strong,
 * specific reason. Returns "none" when no one (else) should speak.
 */
export function buildDirectorPrompt(opts: {
  event: { location: string; description: string }
  roster: Array<{ id: string; name: string; hook: string }>
  recent: Array<{ name: string; text: string }>
  repliedThisTurn: string[]
}): string {
  const roster = opts.roster
    .map((r) => `- ${r.name} (id: ${r.id}): ${r.hook}`)
    .join('\n')
  const history = opts.recent.map((m) => `${m.name}: ${m.text}`).join('\n')
  const already = opts.repliedThisTurn.length
    ? `Already replied this turn: ${opts.repliedThisTurn.join(', ')}.`
    : 'No one has replied yet this turn.'

  return [
    `Setting: ${opts.event.location}. Event: ${opts.event.description}.`,
    `People present:`,
    roster,
    ``,
    `Recent conversation:`,
    history,
    ``,
    already,
    ``,
    `Decide who speaks NEXT. Prefer the character the user is directly addressing.`,
    `A bystander should be chosen ONLY if they have a strong, specific reason to interject.`,
    `If no one (else) has a reason to speak, answer "none".`,
    `Reply with the speaker's id, or "none".`,
  ].join('\n')
}
```

- [ ] **Step 4: Build + run to verify it passes**

Run: `NODE_OPTIONS=--max-old-space-size=6144 npx tsc -p srv.tsconfig.json && npx mocha --inline-diffs --exit "tests/event.spec.js"`
Expected: PASS (4 passing).

- [ ] **Step 5: Commit**

```bash
git add common/event.ts tests/event.spec.ts tests/event.spec.js tests/event.spec.js.map
git commit -m "feat: add event scene/director prompt helpers + constants"
```

---

### Task 3: Per-speaker progression in `resolveScenario`

The `LEVEL(...)` stage token and Charluv meta currently derive from the *main* character. In a multi-char event each reply must reflect the **replying** character. Add an optional `replyAs` arg; when present, the token and meta come from it.

**Files:**
- Modify: `common/prompt.ts` — `resolveScenario` (~line 969), it calls `prependProgressionStage` and `prependCharluvMeta` (~lines 987-1009)
- Modify: `tests/resolve-scenario.spec.ts` (add a case)
- Modify call sites (pass `replyAs`): `web/store/data/bot-generate.ts:181` and `:238`

**Interfaces:**
- Consumes: `prependProgressionStage`, `prependCharluvMeta` (existing, unchanged signatures).
- Produces: `resolveScenario(chat, mainChar, books, replyAs?)` — when `replyAs` is supplied, stage token + meta use `replyAs`; scenario *text* still resolves from chat/mainChar as today.

- [ ] **Step 1: Write the failing test**

In `tests/resolve-scenario.spec.ts`, add inside the `describe('Resolve scenario', ...)` block:

```typescript
    it('uses the replying character for the progression stage when provided', () => {
        const speaker = {
            ...main,
            name: 'Speaker',
            progression: { kind: 'archetype', archetype: 'romantic' } as any,
            xp: 100000,
        }
        const withSpeaker = resolveScenario(
            {...chat, scenario: undefined, overrides: undefined},
            {...main, scenario: 'Scene', progression: undefined},
            [],
            speaker as any)
        const withoutSpeaker = resolveScenario(
            {...chat, scenario: undefined, overrides: undefined},
            {...main, scenario: 'Scene', progression: undefined},
            [])
        // The speaker has a progression archetype + XP, so its stage token is prepended.
        expect(withSpeaker).to.contain('LEVEL(')
        // The main char has no progression, so without a speaker no token appears.
        expect(withoutSpeaker).to.not.contain('LEVEL(')
    })
```

- [ ] **Step 2: Build + run to verify it fails**

Run: `NODE_OPTIONS=--max-old-space-size=6144 npx tsc -p srv.tsconfig.json && npx mocha --inline-diffs --exit "tests/resolve-scenario.spec.js"`
Expected: FAIL — `resolveScenario` ignores the 4th argument, so `withSpeaker` has no `LEVEL(` token.

- [ ] **Step 3: Implement the optional `replyAs`**

In `common/prompt.ts`, `resolveScenario` currently reads:

```typescript
export function resolveScenario(
  chat: AppSchema.Chat,
  mainChar: AppSchema.Character,
  books: AppSchema.ScenarioBook[]
) {
  const result = chat.overrides ? chat.scenario || '' : mainChar.scenario || ''

  return prependCharluvMeta(prependProgressionStage(result.trim(), mainChar), mainChar)
}
```

Change it to:

```typescript
export function resolveScenario(
  chat: AppSchema.Chat,
  mainChar: AppSchema.Character,
  books: AppSchema.ScenarioBook[],
  replyAs?: AppSchema.Character
) {
  const result = chat.overrides ? chat.scenario || '' : mainChar.scenario || ''

  // The stage token and Charluv meta describe whoever is *speaking*. In a
  // multi-character event that's `replyAs`; in a 1:1 it equals the main char.
  const speaker = replyAs || mainChar

  return prependCharluvMeta(prependProgressionStage(result.trim(), speaker), speaker)
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `NODE_OPTIONS=--max-old-space-size=6144 npx tsc -p srv.tsconfig.json && npx mocha --inline-diffs --exit "tests/resolve-scenario.spec.js"`
Expected: PASS for the new case. (Note: two pre-existing `overwrite`-flag failures in this file are unrelated and predate this work — leave them.)

- [ ] **Step 5: Pass `replyAs` at the client call sites**

In `web/store/data/bot-generate.ts`, both calls currently read:

```typescript
  const resolvedScenario = resolveScenario(entities.chat, entities.char, entities.scenarios || [])
```

(at `getActivePromptOptions` ~line 181 and `createActiveChatPrompt` ~line 238). Change both to pass the resolved speaker:

```typescript
  const resolvedScenario = resolveScenario(
    entities.chat,
    entities.char,
    entities.scenarios || [],
    props.replyAs
  )
```

(`props` is in scope in both functions — `getGenerateProps` returns it.)

- [ ] **Step 6: Web syntax check**

Run: `npx tsc -p srv.tsconfig.json --noEmit 2>&1 | grep -i "prompt.ts\|bot-generate" || echo "no new srv-side errors"`
Expected: no new errors in `common/prompt.ts`. (Web file errors are non-blocking and bundled by Vite.)

- [ ] **Step 7: Commit**

```bash
git add common/prompt.ts web/store/data/bot-generate.ts tests/resolve-scenario.spec.ts tests/resolve-scenario.spec.js tests/resolve-scenario.spec.js.map
git commit -m "feat: derive progression stage from the replying character"
```

---

### Task 4: Director server function `electSpeaker`

A server-only function that runs one director inference and returns the elected speaker id or `'none'`.

**Files:**
- Create: `srv/adapter/director.ts`

**Interfaces:**
- Consumes: `inferenceAsync` from `srv/adapter/generate.ts` (returns `{ generated }`); `buildDirectorPrompt`, `buildSpeakerSchema` from `common/event.ts`.
- Produces: `electSpeaker(opts: { user: AppSchema.User; log: AppLog; event: { location: string; description: string }; roster: Array<{ id: string; name: string; hook: string }>; recent: Array<{ name: string; text: string }>; repliedThisTurn: string[] }): Promise<string>` — resolves to a present character id or `'none'`. Never throws for model issues (falls back to `'none'`).

- [ ] **Step 1: Implement `srv/adapter/director.ts`**

```typescript
import { AppSchema } from '../../common/types/schema'
import { AppLog } from '../middleware'
import { buildDirectorPrompt, buildSpeakerSchema } from '../../common/event'
import { inferenceAsync } from './generate'

type ElectOpts = {
  user: AppSchema.User
  log: AppLog
  event: { location: string; description: string }
  roster: Array<{ id: string; name: string; hook: string }>
  recent: Array<{ name: string; text: string }>
  repliedThisTurn: string[]
}

/**
 * One director inference: elect who speaks next in an event. Returns a present
 * character id or 'none'. Any model/parse failure resolves to 'none' so a turn
 * can never crash on the director.
 */
export async function electSpeaker(opts: ElectOpts): Promise<string> {
  const ids = opts.roster.map((r) => r.id)
  if (!ids.length) return 'none'

  const prompt = buildDirectorPrompt({
    event: opts.event,
    roster: opts.roster,
    recent: opts.recent,
    repliedThisTurn: opts.repliedThisTurn,
  })

  try {
    const { generated } = await inferenceAsync({
      user: opts.user,
      log: opts.log,
      prompt,
      maxTokens: 24,
      temp: 0.2,
      jsonSchema: buildSpeakerSchema(ids),
    })

    const picked = parseSpeaker(generated, ids)
    return picked
  } catch (err) {
    opts.log.warn({ err }, 'director: election failed, defaulting to none')
    return 'none'
  }
}

/** Tolerant parse: accept strict JSON `{ "speaker": "<id>" }` or a bare id/“none”. */
function parseSpeaker(generated: string, ids: string[]): string {
  const text = (generated || '').trim()
  try {
    const obj = JSON.parse(text)
    const s = String(obj?.speaker || '').trim()
    if (s === 'none' || ids.includes(s)) return s
  } catch {}
  // Fallback: the raw text might be an id or "none".
  if (text === 'none' || ids.includes(text)) return text
  const found = ids.find((id) => text.includes(id))
  return found || 'none'
}
```

> Note: confirm the import path for `AppLog`. Locate it first: `grep -rn "export type AppLog\|export interface AppLog" srv/`. Use that path in the import above (it is referenced as `AppLog` in `srv/adapter/generate.ts`'s `InferenceRequest`).

- [ ] **Step 2: Typecheck**

Run: `NODE_OPTIONS=--max-old-space-size=6144 npx tsc -p srv.tsconfig.json --noEmit 2>&1 | grep -i "director.ts" || echo "director.ts clean"`
Expected: `director.ts clean`.

- [ ] **Step 3: Commit**

```bash
git add srv/adapter/director.ts
git commit -m "feat: add director electSpeaker inference for event turns"
```

---

### Task 5: Server orchestration — extract the reply pipeline and loop it for events

The reply generation in `generateMessageV2` (`srv/api/chat/message.ts`) is one streamed reply per request. Extract the "build prompt for `replyAs` → stream → persist" body into a reusable internal function, then loop it for event turns.

**Files:**
- Modify: `srv/api/chat/message.ts` — `generateMessageV2` (~lines 137-480)

**Interfaces:**
- Consumes: `electSpeaker` (Task 4); `EVENT_TURN_COST`, `EVENT_MAX_REPLIES`, `buildEventScenario` (Task 2); existing `createChatStream`, `getResponseEntities`, `store.credits.updateCredits`, `store.scenario.updateCharXp`, `getXpPerMessage`, `sendMany`, `obtainLock/releaseLock`.
- Produces: event turns generate 1..`EVENT_MAX_REPLIES` replies, one per elected speaker; `EVENT_TURN_COST` charged once; per-reply −10 suppressed for event replies; XP credited to the replying character.

- [ ] **Step 1: Extract `generateOneReply`**

Move the existing block that runs **one** reply — from the lock/`message-creating` broadcast through stream consumption and message persistence (currently ~lines 247 to the end of the `send`/`request`/... message-created handling, ~line 480) — into a new async function inside `srv/api/chat/message.ts`:

```typescript
async function generateOneReply(ctx: {
  req: AppRequest
  res: AppResponse
  chat: AppSchema.Chat
  body: GenerateRequestV2
  replyAs: AppSchema.Character
  impersonate: AppSchema.Character | undefined
  members: string[]
  userMsg: AppSchema.ChatMessage | undefined
  requestId: string
  // When true this reply is part of an already-paid event turn: skip the per-reply
  // −10 credit (the flat EVENT_TURN_COST was charged once at turn start).
  eventTurn: boolean
}): Promise<{ text: string; speakerId: string }>
```

Relocate the existing logic verbatim, substituting the locals it used (`replyAs`, `requestId`, `members`, `impersonate`, `userMsg`, `chat`, `body`, `userId = ctx.req.userId`, `log = ctx.req.log`) with `ctx.*`. Return `{ text: responseText, speakerId: replyAs._id }` at the end. The non-event path (Step 4) calls this exactly once, preserving current behavior.

- [ ] **Step 2: Gate credits + XP inside `generateOneReply`**

The credit/XP block currently reads (message.ts ~424-428):

```typescript
  if (body.kind !== 'summary') {
    const credits = await store.credits.updateCredits(userId!, -10)
    const xpGain = getXpPerMessage(replyAs.progression)
    if (xpGain > 0) await store.scenario.updateCharXp(chat.characterId!, xpGain)
  }
```

Replace with:

```typescript
  if (ctx.body.kind !== 'summary') {
    // Event replies are paid once per turn (EVENT_TURN_COST) at turn start; don't
    // re-charge per reply. Normal replies still cost 10 each.
    if (!ctx.eventTurn) {
      await store.credits.updateCredits(ctx.req.userId!, -10)
    }
    // XP advances the CHARACTER THAT REPLIED (replyAs), not the chat's main char.
    const xpGain = getXpPerMessage(ctx.replyAs.progression)
    if (xpGain > 0) await store.scenario.updateCharXp(ctx.replyAs._id, xpGain)
  }
```

- [ ] **Step 3: Add the event orchestration branch**

In `generateMessageV2`, after the user message is persisted for a `send` (currently ~line 204, inside the `body.kind === 'send' || 'ooc'` branch) and before the single-reply logic, insert an early event branch. It charges once, then loops the director:

```typescript
  // --- Event mode: the server elects each speaker and may produce several
  // replies per user turn (director-driven). One flat charge covers the turn.
  if (chat.mode === 'event' && body.kind === 'send') {
    if (body.user && body.user.credits < EVENT_TURN_COST) throw errors.MissingCredits
    await store.credits.updateCredits(userId!, -EVENT_TURN_COST)

    const roster = await getEventRoster(chat) // present chars: {id,name,hook}
    const repliedThisTurn: string[] = []

    for (let i = 0; i < EVENT_MAX_REPLIES; i++) {
      const recent = await getRecentForDirector(chatId) // [{name,text}] last ~8 msgs
      const speakerId = await electSpeaker({
        user: req.authed!,
        log,
        event: chat.event!,
        roster: roster.filter((r) => true), // full roster; the model may re-pick or skip
        recent,
        repliedThisTurn,
      })
      if (speakerId === 'none') break

      const replyAs = roster.find((r) => r.id === speakerId)?.char
      if (!replyAs) break

      const turnRequestId = v4()
      sendMany(members, {
        type: 'message-creating',
        chatId,
        mode: 'send',
        senderId: userId,
        characterId: replyAs._id,
      })
      await generateOneReply({
        req,
        res,
        chat,
        body,
        replyAs,
        impersonate,
        members,
        userMsg,
        requestId: turnRequestId,
        eventTurn: true,
      })
      repliedThisTurn.push(replyAs._id)
    }

    return
  }
```

> The HTTP response: send the early `res.json({ ..., generating: true })` (already at ~line 270) BEFORE entering this loop, OR move that `res.json` above the branch so the client gets its ack and then renders each streamed reply by its own `requestId`. Each `generateOneReply` broadcasts its own `message-partial`/`message-created` over ws, so the client renders replies sequentially.

- [ ] **Step 4: Non-event path calls `generateOneReply` once**

Replace the original inline single-reply block (now extracted) with a single call for non-event chats:

```typescript
  await generateOneReply({
    req, res, chat, body,
    replyAs, impersonate, members, userMsg,
    requestId, eventTurn: false,
  })
  return
```

- [ ] **Step 5: Implement the two helpers**

Add to `srv/api/chat/message.ts`:

```typescript
// Build the director roster from the chat's character map: the active present
// characters with a one-line persona hook for the director prompt.
async function getEventRoster(chat: AppSchema.Chat) {
  const ids = Object.entries(chat.characters || {})
    .filter(([, on]) => on)
    .map(([id]) => id)
  const chars = await store.characters.getCharacterList(ids)
  return chars.map((char) => ({
    id: char._id,
    name: char.name,
    hook: (char.description || '').slice(0, 120),
    char,
  }))
}

// The recent message window the director reasons over (speaker name + text).
async function getRecentForDirector(chatId: string) {
  const msgs = await store.msgs.getMessages(chatId) // newest-last
  return msgs.slice(-8).map((m) => ({
    name: m.name || (m.userId ? 'You' : 'Unknown'),
    text: m.msg,
  }))
}
```

> Confirm the exact reader names before use: `grep -n "export async function getCharacterList\|export async function getMessages\|getRecentMessages" srv/db/characters.ts srv/db/messages.ts`. Use the actual function (e.g. `getCharacterList(ids)` exists in `srv/db/characters.ts`; for messages use whatever lists a chat's messages). Adjust slice/order so the window is chronological and capped.

- [ ] **Step 6: Add imports**

At the top of `srv/api/chat/message.ts`:

```typescript
import { EVENT_TURN_COST, EVENT_MAX_REPLIES } from '../../../common/event'
import { electSpeaker } from '../../adapter/director'
```

(Confirm relative depth from `srv/api/chat/` — `common/` is `../../../common`. `v4` from `uuid` is already imported in this file; reuse it.)

- [ ] **Step 7: Typecheck**

Run: `NODE_OPTIONS=--max-old-space-size=6144 npx tsc -p srv.tsconfig.json --noEmit 2>&1 | grep -i "message.ts" || echo "message.ts clean"`
Expected: `message.ts clean`. Resolve any signature mismatches against the real `store.*` readers found in Step 5.

- [ ] **Step 8: Commit**

```bash
git add srv/api/chat/message.ts
git commit -m "feat: server-orchestrated director loop for event turns"
```

---

### Task 6: Memory gates (write + recall)

`memoryDisabled` must stop both the auto-write of remembered facts and the recall of stored facts.

**Files:**
- Modify: `srv/api/chat/message.ts` — the `rememberFact` loop (~line 414, now inside `generateOneReply`)
- Modify: `srv/adapter/generate.ts` — the `recallMemories` call (~line 359)

**Interfaces:**
- Consumes: `chat.memoryDisabled` (Task 1).

- [ ] **Step 1: Gate the write**

In `generateOneReply` (the relocated block), the memory write currently reads:

```typescript
  if (rememberFacts?.length && chat.characterId) {
    for (const fact of rememberFacts) {
      rememberFact(userId!, chat.characterId, fact, 'tool').catch((err) =>
        log.error({ err }, 'Failed to store long-term memory')
      )
    }
  }
```

Add the disable guard (and use `ctx.*` locals from Task 5):

```typescript
  if (rememberFacts?.length && ctx.chat.characterId && !ctx.chat.memoryDisabled) {
    for (const fact of rememberFacts) {
      rememberFact(ctx.req.userId!, ctx.chat.characterId, fact, 'tool').catch((err) =>
        ctx.req.log.error({ err }, 'Failed to store long-term memory')
      )
    }
  }
```

- [ ] **Step 2: Gate the recall**

In `srv/adapter/generate.ts` near line 359:

```typescript
        const memories = await recallMemories(ownerId, charId, query, { k: 5 })
```

Wrap it so a memory-disabled chat skips recall entirely:

```typescript
        const memories = chat.memoryDisabled
          ? []
          : await recallMemories(ownerId, charId, query, { k: 5 })
```

> Confirm `chat` is in scope at that point (it is — e.g. `chat.memoryId` is read nearby at ~line 473). If the local is named differently in that function, use that name.

- [ ] **Step 3: Typecheck**

Run: `NODE_OPTIONS=--max-old-space-size=6144 npx tsc -p srv.tsconfig.json --noEmit 2>&1 | grep -iE "message.ts|generate.ts" || echo "memory gates clean"`
Expected: `memory gates clean`.

- [ ] **Step 4: Commit**

```bash
git add srv/api/chat/message.ts srv/adapter/generate.ts
git commit -m "feat: gate long-term memory write+recall on chat.memoryDisabled"
```

---

### Task 7: Event creation endpoint

A server route that creates an event chat from the modal inputs.

**Files:**
- Modify: `srv/api/chat/index.ts` (or wherever chat routes mount — confirm with `grep -rn "router.post" srv/api/chat/`)
- Modify/inspect: `srv/db/chats.ts` — reuse the existing chat creation (`createChat`); confirm it accepts `mode`, `characters`, `scenario`, `overrides` and add pass-through for `event` + `memoryDisabled` if needed.

**Interfaces:**
- Consumes: `buildEventScenario` (Task 2); existing `store.chats.create`/`createChat`; `store.characters.getCharacterList`.
- Produces: `POST /chat/event` → `{ chat }`. Body: `{ location: string; description: string; characterIds: string[] }`.

- [ ] **Step 1: Inspect the existing chat-create path**

Run: `grep -n "export async function create" srv/db/chats.ts` and read its parameter object. Confirm which of `mode`, `characters`, `scenario`, `overrides`, `event`, `memoryDisabled` it persists. If `event`/`memoryDisabled` are not passed through, add them to the `doc` it builds (additive).

- [ ] **Step 2: Add the handler**

In the chat API module:

```typescript
const createEventChat = handle(async (req) => {
  assertValid(
    { location: 'string', description: 'string', characterIds: ['string'] },
    req.body
  )
  const { location, description, characterIds } = req.body
  if (!characterIds.length) throw new StatusError('Invite at least one character', 400)

  const chars = await store.characters.getCharacterList(characterIds)
  if (!chars.length) throw new StatusError('No valid characters', 400)

  const names = chars.map((c) => c.name)
  const scenario = buildEventScenario({ location, description, names })
  const characters: Record<string, boolean> = {}
  for (const c of chars) characters[c._id] = true

  const chat = await store.chats.create(chars[0]._id, {
    name: `${location} — ${description}`.slice(0, 80),
    characters,
    mode: 'event',
    event: { location, description },
    memoryDisabled: true,
    scenario,
    overrides: chars[0].persona,
    greeting: `You arrive at ${location}. ${description}.`,
    // ...any other required fields createChat expects; mirror the normal create call
  } as any)

  return { chat }
})
```

> Match `store.chats.create`'s real signature (found in Step 1) — the second arg shape and required fields (e.g. `greeting`, `sampleChat`, `scenario`, `overrides`) must mirror an existing successful create. The `overrides: chars[0].persona` ensures `resolveScenario` uses the chat scenario (event block) rather than the main char's.

- [ ] **Step 3: Mount the route**

Add near the other chat routes (keep literal paths before `/:id` params):

```typescript
router.post('/event', loggedIn, createEventChat)
```

(Use the same auth middleware the other authenticated create routes use — confirm by reading neighboring `router.post` lines.)

- [ ] **Step 4: Typecheck**

Run: `NODE_OPTIONS=--max-old-space-size=6144 npx tsc -p srv.tsconfig.json --noEmit 2>&1 | grep -iE "chat/index|db/chats" || echo "event route clean"`
Expected: `event route clean`.

- [ ] **Step 5: Commit**

```bash
git add srv/api/chat/ srv/db/chats.ts
git commit -m "feat: add POST /chat/event creation endpoint"
```

---

### Task 8: Web store action to create an event

**Files:**
- Modify: `web/store/chat.ts` (the chat store — confirm filename with `ls web/store/chat.ts`)

**Interfaces:**
- Consumes: `POST /chat/event` (Task 7); existing `api.post`, `getStore`/navigation patterns used by other create actions.
- Produces: `chatStore.createEvent(input: { location: string; description: string; characterIds: string[] }, onSuccess: (chatId: string) => void)`.

- [ ] **Step 1: Add the action**

Mirror an existing create action in the chat store. Add:

```typescript
    async createEvent(
      _,
      input: { location: string; description: string; characterIds: string[] },
      onSuccess: (chatId: string) => void
    ) {
      const res = await api.post('/chat/event', input)
      if (res.error) {
        toastStore.error(`Failed to create event: ${res.error}`)
        return
      }
      if (res.result) {
        onSuccess(res.result.chat._id)
      }
    },
```

(Match the store's handler style — argument order, `toastStore` import, and `api` import as used by sibling actions.)

- [ ] **Step 2: Web syntax check**

Run: `npx tsc -p srv.tsconfig.json --noEmit 2>&1 | grep -i "store/chat" || echo "no srv-side coupling"` (web errors are non-blocking; confirm the file at least parses by saving — Vite will surface runtime issues).

- [ ] **Step 3: Commit**

```bash
git add web/store/chat.ts
git commit -m "feat: chatStore.createEvent action"
```

---

### Task 9: Event menu button + creation modal

**Files:**
- Create: `web/pages/Chat/CreateEventModal.tsx`
- Modify: `web/Navigation.tsx` — add the Event button to the menu list

**Interfaces:**
- Consumes: `chatStore.createEvent` (Task 8); the existing character-select component (`web/shared/CharacterSelectList.tsx` — confirm its props) and the user's My AI character list from `characterStore`.

- [ ] **Step 1: Build the modal**

Create `web/pages/Chat/CreateEventModal.tsx` with a Modal containing three controls: a `TextInput` for **Where**, a `TextInput`/textarea for **What**, and a multi-select of the user's characters for **Who** (reuse the existing select-list; collect checked ids into a signal). On confirm, call `chatStore.createEvent({ location, description, characterIds }, (id) => navigate(\`/chat/${id}\`))`. Follow the structure of an existing modal in `web/pages/Chat/` (e.g. `CreateChatForm.tsx`) for Modal usage, buttons, and form state. Disable confirm until `location`, `description`, and ≥1 character are set.

- [ ] **Step 2: Add the menu button**

In `web/Navigation.tsx`, add an entry to the menu list (alongside the existing nav items) that opens the modal:

```tsx
<Item href="#" onClick={() => setShowEvent(true)}>
  <Sparkles /> Event
</Item>
```

Wire a `const [showEvent, setShowEvent] = createSignal(false)` and render `<CreateEventModal show={showEvent()} close={() => setShowEvent(false)} />`. Use an icon already exported from `/web/icons` (e.g. `Sparkles` or `Users`). Match the existing `Item`/menu pattern in that file.

- [ ] **Step 3: Visual verification**

Run the app (`pnpm start`) or describe the manual check: the menu shows an **Event** button; clicking it opens a modal with Where/Who/What; submitting navigates into a new chat whose scenario contains the `Setting: … Event: … Present: …` block; the roster shows the invited characters.

- [ ] **Step 4: Commit**

```bash
git add web/pages/Chat/CreateEventModal.tsx web/Navigation.tsx
git commit -m "feat: Event menu button + creation modal"
```

---

### Task 10: Memory-disable toggle in chat settings

Expose `memoryDisabled` as a general per-chat toggle (defaults already true for events).

**Files:**
- Modify: `web/pages/Chat/ChatSettings.tsx` (confirm filename) — add the toggle
- Verify: `srv/api/chat/edit.ts` persists `memoryDisabled` (the chat-edit validator ~lines 18-51)

**Interfaces:**
- Consumes: existing chat-edit endpoint and `Toggle` component (`web/shared/Toggle.tsx`).

- [ ] **Step 1: Allow `memoryDisabled` through the edit endpoint**

In `srv/api/chat/edit.ts`, the validator (~line 18) and the update object (~line 50) enumerate editable fields. Add `memoryDisabled`:

```typescript
// in the assertValid schema object:
      memoryDisabled: 'boolean?',
```

```typescript
// in the update object passed to store.chats.update:
    memoryDisabled: body.memoryDisabled ?? prev.memoryDisabled,
```

- [ ] **Step 2: Add the toggle to chat settings**

In the chat settings component, add a `Toggle`:

```tsx
<Toggle
  fieldName="memoryDisabled"
  label="Disable long-term memory"
  helperText="Nothing said here is remembered or recalled later. On by default for Events."
  value={chat()?.memoryDisabled ?? false}
  onChange={(v) => chatStore.editChat(chat()!._id, { memoryDisabled: v })}
/>
```

(Match how sibling toggles in that file read the active chat and call the chat-edit store action — confirm the action name, e.g. `editChat`/`updateChat`.)

- [ ] **Step 3: Typecheck the server change**

Run: `NODE_OPTIONS=--max-old-space-size=6144 npx tsc -p srv.tsconfig.json --noEmit 2>&1 | grep -i "edit.ts" || echo "edit.ts clean"`
Expected: `edit.ts clean`.

- [ ] **Step 4: Commit**

```bash
git add srv/api/chat/edit.ts web/pages/Chat/ChatSettings.tsx
git commit -m "feat: per-chat memory-disable toggle in chat settings"
```

---

### Final verification

- [ ] **Run the full check suite**

Run: `pnpm checks`
Expected: format + web typecheck + tests. The two pre-existing `resolve-scenario` `overwrite`-flag failures are unrelated and predate this work; no *new* failures. New `tests/event.spec.js` passes.

- [ ] **Run the srv typecheck**

Run: `NODE_OPTIONS=--max-old-space-size=6144 npx tsc -p srv.tsconfig.json --noEmit`
Expected: no new errors.

- [ ] **Manual end-to-end**

Create an event (nightclub / 2-3 invitees / "Saturday DJ night"). Send a message addressed to one character → that character replies in their own stage; occasionally a second character interjects (≤3 total); 25 credits debited once; no long-term memory rows written for the event characters; recall is skipped in event prompts.
