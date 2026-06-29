# CLAUDE.md

Guidance for working in this repo. These instructions override default behaviour.

## What this is

Charluv is an AI-companion / dating app — a fork of Agnaistic (Agnai). It carries a lot of
unused Agnai power-user machinery that is being stripped. Architecture:

- **`web/`** — SolidJS + Tailwind frontend, bundled with **Vite**.
- **`srv/`** — Express + MongoDB + `ws` backend, compiled with `tsc`.
- **`common/`** — isomorphic code shared by both (types, prompt building, progression, tokenize).
- **Inference** — self-hosted **OpenAI-compatible** streaming endpoint for text and a separate
  self-hosted **SD-compatible** image endpoint. The text model is a custom 24B trained on
  relationship **stage tokens** `LEVEL("NOVICE" | "BEGINNER" | "LOVER" | "GIRLFRIEND" | "SEX" |
  "HARDCORE" | "MARRIED" | "DIVORCED" | "BDSM/SLAVE" | "BDSM/DOMINATRIX")`.

## Use codegraph first

A **codegraph** MCP server indexes every symbol/edge/file in the workspace (SQLite knowledge
graph, sub-ms reads). **Consult it before writing or editing code — do not hand-grep or spawn a
file-reading sub-agent to explore.**

- Almost any "how does X work / where is X / trace the flow" question → **`codegraph_explore`**
  (one call returns the verbatim source of the relevant symbols, grouped by file). Usually the
  only call you need.
- "What is symbol X" (location only) → `codegraph_search`.
- "What calls this / what does it call / what breaks if I change it" →
  `codegraph_callers` / `codegraph_callees` / `codegraph_impact`.

Fall back to Read/Grep only to confirm a specific detail codegraph didn't cover.

## Hard constraints

- **NO data migrations.** `dev.charluv.com` runs on **live production data**. Schema changes must
  be additive (nullable fields, backward-compatible). Never rename/repurpose a stored id or write
  a migration job. (E.g. archetype display labels were changed while keeping the stored ids.)
- **Use `pnpm`, never `npm`** (repo is a pnpm workspace; `npm install` fails).
- **Moderation runs on the local vision LLM**, not external OpenAI.
- **Never sexualize minors** — the 18+ safeguard in the levels preamble (`CHARLUV_LEVELS_PROMPT`)
  applies to all characters.
- Fix bugs on sight, even pre-existing or unrelated ones — don't just flag them.

## Commands

```bash
pnpm checks          # format + typecheck + test (run before declaring done)
pnpm typecheck       # tsc -p tsconfig.json --noEmit (web)
pnpm test            # mocha tests/**.spec.js
pnpm start           # concurrently: vite web + watched server + tsc
```

- **srv typecheck** (heavier, needs more memory):
  `NODE_OPTIONS=--max-old-space-size=6144 npx tsc -p srv.tsconfig.json --noEmit`
- Web files can be quickly syntax-checked with `ts.transpileModule` (the bundler is Vite, not tsc).
- Vite resolves `.ts` before `.js`. Do not check in compiled web `.js`/`.js.map`.

## Domain notes

- **Progression archetypes** (`common/progression.ts`): `ARCHETYPES` (ids `romantic`,
  `girlfriend`, `casual`, `submissive`, `dominant`) map XP level → stage token. `getArchetype`,
  `getProgressionSteps`, `resolveStage`. No archetype on a character = **fixed** (no fallback to
  romantic). Display the `.label`, not the raw id. XP lives on `char.xp`, granted per message.
- **Credits**: message 10, image gen/regen 25, **create 100** (charged when the AI is finalized
  on the final wizard step — the hidden draft made on entering that step is free), **edit 30**,
  LoRA train 300, publish **+500** reward. Free tier refills +5/2min up to 500;
  premium +20/2min up to 5,000.
- **Publishing**: any user can make a character public (`published`/`moderation`/`reportCount`
  fields); auto-publish on the local vision-LLM moderation pass, also surfaced in admin for a
  second stage; auto-hide at 3 reports.

## Git

- Default branch for PRs is **`trunk`**. Active work is on `feat/charluv-rewrite`.
- **Commit/push only when explicitly asked.** End commit messages with:

  ```
  Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01XXNb2Kcdayr1ZvUpy5a3nA
  ```
