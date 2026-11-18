# AGENTS.md — instructions for ANY coding agent (Claude, Fable, Codex, Cursor, humans)

This repo is agent-agnostic. No tool-specific config is required. Read this first, then `docs/`.

## What this is
A browser-based "line wars" RTS (inspired by the genre; Colonial Line Wars is the reference for *feel*). Players earn income, place production buildings that send a unit every wave, fight over shrines for income, and win by destroying the enemy cathedral. Parallel lanes on a scrolling map: 1v1, 2v2 or 3v3 with one lane per player of a team, a simple AI to fill empty seats.
**Legal:** original names, art, sounds and stats only. Never copy Blizzard/StarCraft assets, names, text or data.

Read the [Colonial Line Wars research and recreation specification](docs/COLONIAL_LINE_WARS.md) for the original-game overview and the phased recreation plan. [docs/GAME_DESIGN.md](docs/GAME_DESIGN.md) describes what is implemented today (1v1 to 3v3 vs AI or online, one lane per player, production buildings raised by two gravekeepers, recurring waves, four researched unit tiers, hired mercenaries). [docs/UNITS.md](docs/UNITS.md) lists every unit, its ability and its counters, and explains how balance is measured: read it before changing any unit, and re-run the balance scripts after.

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
npm run balance      # equal-gold matchup table for every unit (add "-- 4000 mixed" for escorted armies)
npm run balance:lane # lane tuner: every unit in a standing army on the real lane, in parallel (slow)
npm run balance:ai   # whole autopilot-vs-autopilot matches, win rate per AI profile
npm run balance:levels # one AI difficulty against another ("-- 24 1 0" = 24 matches, Medium vs Easy)
```
(If `npx` is missing in your shell, use `./node_modules/.bin/<tool>`.)

## Non-negotiable rules
1. **`packages/sim` is pure & deterministic.** No DOM, no Node APIs, no `Math.random`, no `Date.now`, no floats for positions (integers / milli-tiles). Same seed + same commands ⇒ same state. Test it.
2. **Clients never mutate game state.** They send `Command`s; the sim (and on the server, the authoritative sim) applies them.
3. **Balance numbers live in `packages/sim/src/data.ts`**, not scattered in logic. Abilities are data fields on `UnitDef`, read generically by `sim.ts`: never special-case a unit id in the rules.
4. **Auth is behind `AuthProvider`** (`apps/server/src/auth/types.ts`). Game code only ever sees `UserIdentity`.
5. **Server is authoritative** for multiplayer. Never trust client-reported state.
6. Secrets only via env (`.env.example` documents them). Never commit `.env`.
7. Keep changes small, typed, and covered by tests where the sim is touched.
8. **Everything is lane-aware (owner decision).** Matches have one to three lanes, and gravekeepers build in allies' lanes. Anything new that stands, moves or is ordered somewhere carries a lane, and every command that places or sends something takes one; never assume a single lane or that a player only acts in his own.

## Layout
```
packages/sim        deterministic game rules (shared by client + server)
packages/protocol   WebSocket message types, UserIdentity
apps/client         Vite + three.js renderer, HUD, input, camera, synthesized audio
apps/server         Node: auth, lobbies, authoritative match loop (hub.ts), WebSocket endpoint (index.ts)
docs/               design + architecture + auth + deployment + roadmap
docs/handoff/       self-contained briefs per agent (start here if you were handed a brief)
```
