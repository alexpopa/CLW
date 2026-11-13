# AGENTS.md — instructions for ANY coding agent (Claude, Fable, Codex, Cursor, humans)

This repo is agent-agnostic. No tool-specific config is required. Read this first, then `docs/`.

## What this is
A browser-based "line wars" RTS (inspired by the genre; Colonial Line Wars is the reference for *feel*). Players earn income, place production buildings that send a unit every wave, fight over shrines for income, and win by destroying the enemy cathedral. Horizontal scrolling map. 1v1 today; 2v2 / 3v3 planned, simple AI to fill slots.
**Legal:** original names, art, sounds and stats only. Never copy Blizzard/StarCraft assets, names, text or data.

Read the [Colonial Line Wars research and recreation specification](docs/COLONIAL_LINE_WARS.md) for the original-game overview and the phased recreation plan. [docs/GAME_DESIGN.md](docs/GAME_DESIGN.md) describes what is implemented today (Phase 1: one lane, 1v1 vs AI, production buildings that send recurring waves).

**Art direction (owner decision):** gothic dark fantasy, 3D presentation with an elevated RTS camera, an elegant full-screen UI, and sound. All models, textures and audio are original and generated in code (`apps/client/src/models.ts`, `textures.ts`, `audio.ts`). Do not add placeholder shapes, downloaded asset packs, or anything that imitates another game's look.

## Account and hosting decisions

Follow [docs/AUTH.md](docs/AUTH.md) for the RGBoner account reference and [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) for the private Sites playtest. These decisions apply to all agents.

## Commands
```bash
npm install
npm run dev          # client (Vite) on :5173, all interfaces (LAN + Tailscale: http://<machine>.<tailnet>.ts.net:5173)
npm run dev:server   # match server on :8788 (guest sign-in, all interfaces)
npm run dev:all      # both at once: what you need for online play
npm run typecheck    # tsc -b (must pass before commit)
npm test             # vitest
npm run check        # type check, simulation tests, production build
npm run preview      # serve the built guest client locally
npm run test:accounts # Worker sign-in contract (Node 22.13+)
```
(If `npx` is missing in your shell, use `./node_modules/.bin/<tool>`.)

## Non-negotiable rules
1. **`packages/sim` is pure & deterministic.** No DOM, no Node APIs, no `Math.random`, no `Date.now`, no floats for positions (integers / milli-tiles). Same seed + same commands ⇒ same state. Test it.
2. **Clients never mutate game state.** They send `Command`s; the sim (and on the server, the authoritative sim) applies them.
3. **Balance numbers live in `packages/sim/src/data.ts`**, not scattered in logic.
4. **Auth is behind `AuthProvider`** (`apps/server/src/auth/types.ts`). Game code only ever sees `UserIdentity`.
5. **Server is authoritative** for multiplayer. Never trust client-reported state.
6. Secrets only via env (`.env.example` documents them). Never commit `.env`.
7. Keep changes small, typed, and covered by tests where the sim is touched.

## Layout
```
packages/sim        deterministic game rules (shared by client + server)
packages/protocol   WebSocket message types, UserIdentity
apps/client         Vite + three.js renderer, HUD, input, camera, synthesized audio
apps/server         Node: auth, lobbies, authoritative match loop (hub.ts), WebSocket endpoint (index.ts)
docs/               design + architecture + auth + deployment + roadmap
docs/handoff/       self-contained briefs per agent (start here if you were handed a brief)
```
