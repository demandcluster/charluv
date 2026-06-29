# Presence Registry Wiring — C Report

## Edits

### `srv/queue/index.ts`
- Added `import { isPresent, startPresenceRefresh } from './presence'`
- Changed `inferenceGate` construction to pass `isPresent` as 3rd arg
- Updated `startQueue()` to call `startPresenceRefresh()`, fold stop-fn into cleanup

### `srv/api/ws/handlers.ts`
- Added `import { markPresent, clearPresent } from '../../queue/presence'`
- `login`: added `markPresent({ userId: client.userId }, client.uid)` after `userSockets.set`
- `logout`: added `clearPresent({ userId }, client.uid)` after `const userId = client.userId`

### `srv/api/ws/handle.ts`
- Added `import { markPresent, clearPresent } from '../../queue/presence'`
- End of `handleMessage`: added `markPresent({ socketId: client.uid }, client.uid)` after `allSockets.set`
- `client.on('close')`: added `clearPresent({ socketId: client.uid }, client.uid)` before `handlers.logout`
- `client.on('error')`: added `clearPresent({ socketId: client.uid }, client.uid)` before `handlers.logout`

## Typecheck
`NODE_OPTIONS=--max-old-space-size=6144 pnpm exec tsc -p srv.tsconfig.json --noEmit` — **clean (no output)**

## Prettier
`pnpm exec prettier --check srv/queue/index.ts srv/api/ws/handlers.ts srv/api/ws/handle.ts` — **All matched files use Prettier code style!**

## Tests
`pnpm test`: **109 passing, 18 failing** — matches pre-existing baseline; 0 new failures.

## Files Changed
- `/home/dlite/charluv/srv/queue/index.ts`
- `/home/dlite/charluv/srv/api/ws/handlers.ts`
- `/home/dlite/charluv/srv/api/ws/handle.ts`
