# Event Mode — Design

**Status:** approved design, pre-implementation
**Date:** 2026-06-24

## Summary

A new **Event** feature lets a user start a multi-character "scene" (e.g. a night
at a club) from a single menu button, then chat in it where **the model decides
which character speaks each turn**. It builds on the existing multi-character
chat machinery (`chat.characters`, per-reply `replyAs`) and adds a **director**:
an extra constrained model call per reply that elects the next speaker — biased
toward a quiet one-on-one, with bystanders speaking only when they have a
specific reason to interject.

This is the differentiating feature: a living room of companions where presence
≠ constant interruption.

## Goals

- One-tap creation of a populated multi-char scene (where / who / what).
- Director-driven turn-taking: user-addressed by default, bystanders interject
  only with reason; multiple replies allowed per turn, capped.
- Each character replies in **its own** relationship stage (`LEVEL(...)` token
  from its own XP), not the main char's.
- A **memory-disable** toggle so a party leaves no long-term-memory residue
  ("no trouble later"). General per-chat toggle; defaults ON for events.

## Non-goals

- No new model capabilities — director is a stock `inferenceAsync` + `jsonSchema`
  call on the existing default subscription model.
- No data migration — every new field is additive/optional.
- No redesign of the streaming/ws pipeline; reuse existing per-reply generation.

## Data model (additive only)

`AppSchema.Chat` (`common/types/schema.ts`):

- `mode` union gains `'event'` (field already optional): marks the chat for
  director orchestration.
- `event?: { location: string; description: string }` — the scene metadata, for
  display and prompt building. (Roster lives in the existing `characters` map.)
- `memoryDisabled?: boolean` — when true, this chat neither writes nor recalls
  long-term memory. Set true on event creation; also exposed as a general chat
  setting.

No other schema changes. `characterId` (required) = first invitee, used only as
a fallback "main" char.

## Feature 1 — Event creation

**UI:** new **Event** button in the menu (`web/Navigation.tsx` menu list). Opens
a modal with:

- **Where** — free text (location)
- **Who** — multi-select from the user's My AI list (reuse existing character
  select list component)
- **What** — description textarea

**On submit:** create a chat via the existing multi-char creation path with:

- `mode: 'event'`, `event: { location, description }`, `memoryDisabled: true`
- `characters` = `{ [id]: true }` for each invitee; `memberIds` accordingly
- `characterId` = first invitee
- `scenario` + `overrides` set so `resolveScenario` injects a scene block:
  `Setting: {location}. Event: {description}. Present: {names}.`
- Opening message: a single narrated scene-set line (system/world message). No
  character auto-greeting — the **user speaks first**.

Navigate into the new chat on success. Credit cost of creation: none beyond the
normal per-turn charge once chatting begins (creation itself is free; reuses
existing chat-create, which is not credit-charged).

## Feature 2 — The director (per-reply speaker election)

A reusable server function, e.g. `electSpeaker(...)` in a new
`srv/api/chat/director.ts` (or `srv/adapter/director.ts`):

- Calls `inferenceAsync` with a `jsonSchema` whose `speaker` is an **enum** of
  the present character ids **plus `"none"`** (enum prevents hallucinating an
  absent character). Low `maxTokens`, deterministic-ish `temp`.
- Prompt contains: the event scene block, the roster (each character's name + a
  one-line persona hook), the recent message window, and the replies **already
  produced this turn**.
- Instruction: *"Who responds next? Prefer the character the user is directly
  addressing. A bystander is chosen only with a strong, specific reason to
  interject. Return `none` when no one (else) should speak."*

Returns a character id or `none`.

## Feature 3 — Server-orchestrated turn loop (approach A)

When a user `send` lands in an `event` chat, the server owns the whole turn
(client does **not** pick `replyAs`):

1. **Credit gate + charge:** require balance ≥ `EVENT_TURN_COST` (25); debit 25
   **once** at turn start.
2. Persist the user message (existing path).
3. **Director loop** (max `EVENT_MAX_REPLIES`, default 3):
   a. `electSpeaker(...)` over context + replies-so-far.
   b. If `none` → break.
   c. Generate that character's reply as `replyAs`, streaming over the existing
      ws pipeline; persist; append to the turn's message window.
   d. Loop.
4. End turn.

Each reply reuses the existing generation/stream path, with two event-aware
changes (below). The director is authoritative and server-side; the client only
sends the user's text and renders streamed replies in order.

### Credit handling

Normal chat debits −10 per reply at `message.ts:425`. In event mode this
per-reply debit is **suppressed**; the flat 25 charged at turn start is the only
charge. Mechanism: the orchestrator marks event-directed generations so the
completion handler skips the −10 (e.g. an internal flag on the generate request /
`body.kind`), and the 25 debit happens in the event turn entry point.

### Per-speaker progression (correctness fix)

Two existing lines assume a single main character; both must use `replyAs`:

- `message.ts:428` grants XP to `chat.characterId`. Change to `replyAs._id` so
  the **replying** character earns XP. (Correct for multi-char generally.)
- `prompt.ts` `prependProgressionStage` / `resolveScenario` derive the
  `LEVEL(...)` token from the main char. The reply's stage must come from
  `replyAs`'s XP. Adjust so the token reflects the replying character.

These are scoped, surgical changes that also fix latent multi-char behavior.

## Feature 4 — Memory-disable toggle

`chat.memoryDisabled` gates both sides of long-term memory:

- **Write:** `message.ts:414` (`rememberFact` loop) is skipped when
  `chat.memoryDisabled`.
- **Recall:** `generate.ts:359` (`recallMemories`) is skipped when the chat has
  memory disabled, so a party can't surface (or bury) serious relationship
  memories.

Exposed as a general toggle in chat settings (a standard `Toggle`), so it works
for any chat, not just events. Events set it `true` by default at creation.

## Constants

- `EVENT_TURN_COST = 25` (credits per user turn in an event)
- `EVENT_MAX_REPLIES = 3` (hard cap on character replies per turn)
- Director `maxTokens` small (≈16–32); `speaker` enum over present ids + `none`.

## Error handling & edge cases

- **Director returns `none` on the first call:** the turn produces no reply
  (valid — e.g. the user mutters an aside). The 25 charge still applies (the turn
  ran). Acceptable; revisit if it feels punishing.
- **Insufficient credits:** reject before charging/persisting, surface
  `MissingCredits` (existing error).
- **Director enum drift / parse failure:** on a malformed/unknown speaker,
  fall back to the addressed/main character for the first reply, or `none` for
  subsequent loop iterations (never crash the turn).
- **Cap reached:** stop silently after `EVENT_MAX_REPLIES`.
- **Non-`send` kinds in an event** (retry/continue/ooc): bypass the director;
  retry/continue target the specific prior message's character as today.
- **Guest users:** events require an account (they involve the My AI list);
  gate behind login like other authenticated features.

## Testing

- Director: given a roster + a message clearly addressed to one character, the
  elected first speaker is that character; given a neutral aside, `none` is a
  valid outcome; the enum never yields an absent id.
- Turn loop: caps at `EVENT_MAX_REPLIES`; charges 25 exactly once; per-reply −10
  is suppressed.
- Progression: a reply by character B advances B's XP and uses B's stage token,
  not the main char's.
- Memory: with `memoryDisabled`, no `rememberFact` write occurs and
  `recallMemories` is not consulted.

## Affected files (anticipated)

- `common/types/schema.ts` — `mode` union, `event`, `memoryDisabled` fields.
- `common/prompt.ts` — per-`replyAs` progression token in scenario resolution.
- `srv/api/chat/message.ts` — event turn entry, credit suppression, XP→`replyAs`,
  memory-write gate.
- `srv/adapter/generate.ts` — recall gate on `memoryDisabled`.
- New `srv/api/chat/director.ts` (or `srv/adapter/director.ts`) — `electSpeaker`.
- `srv/api/chat/*` routes — event creation + orchestration entry.
- `web/Navigation.tsx` — Event menu button.
- New web modal — event creation form (where/who/what).
- Web chat settings — memory-disable toggle.
- `web/store/*` — event creation + (thin) turn handling on the client.
