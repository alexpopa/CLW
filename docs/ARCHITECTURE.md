# Architecture

## Stack
| Layer | Choice | Why |
|---|---|---|
| Language | TypeScript everywhere, npm workspaces | one language; shared sim code client+server |
| Renderer | three.js (WebGL) | 3D models, lighting and shadows with an elevated RTS camera; no engine lock-in |
| Build | Vite | |
| Sim | `@lw/sim` plain TS | deterministic, testable, runs in browser AND Node |
| Server | Node + `ws` (to add) | authoritative matches |
| DB | D1 on Sites or a database on the Node host (planned) | Profiles, match history, ratings |
| Auth | RGBoner single sign-on in the Sites accounts Worker | See [Auth](AUTH.md) |

## Key idea: the sim is the game
`createGame(cfg) → GameState`, `step(state, commands)`. Fixed 20 ticks/s. Everything else (render, UI, network, AI) is a layer around it.
Consequences:
- **Solo vs AI needs no server** — runs in the browser. This is also what makes a static-hosted version possible (DEPLOYMENT.md).
- **Multiplayer** = same sim on server + clients. Clients send `Command`s; server orders them per tick, broadcasts `{tick, cmds}`; clients step in lockstep; server sends periodic `snapshot`s to correct drift/reconnect. Server's copy is the truth for results/ratings.
- **Replays** are free: seed + command log.
- **AI** is just a function `(state, me) → Command[]` (`ai.ts`). Keep it simple.

## Client (Fable owns)
- `scene.ts`: three.js scene (ground, cloister, cathedrals, shrines, chantries, units, effects) and camera. `churchyard.ts` lays out original decorative scenery in team-game cathedral courts, leaving paved army walks clear; its ground texture is generated in `textures.ts`. `models.ts`: original low-poly models built from primitives. `textures.ts`: procedural textures. `audio.ts`: synthesized WebAudio sound. `hud.ts` + `hud.css`: DOM overlay (gold, income, wave bell, cathedral health, unit cards, tithe, rite, map strip). `main.ts`: input and the fixed-step loop.
- **Horizontal scrolling**: camera x, edge-scroll + drag + wheel + minimap click; world = `laneLengthTiles` wide. Lanes stack vertically; see GAME_DESIGN.md §Map.
- Interpolate unit positions between sim ticks for smooth render (render at display rate, sim at 20 Hz).
- Never put rules in the client.

## Server (to build; see ROADMAP)
- HTTP: `/health`, `/auth/*`, `/me`. WS: `ClientMsg`/`ServerMsg` in `@lw/protocol`.
- Lobbies (in-memory) → match runner (setInterval at 20 Hz, command queue, input validation, snapshots every ~5 s).
- Validate every command (player owns slot, affordable — sim already ignores invalid ones, still rate-limit).
- Keep persistence behind an interface so the host can supply its database.

## Testing
Sim: vitest, determinism + rule tests. Add a "N-minute AI-vs-AI match always terminates, never throws" soak test. Client: manual + screenshot checks via the browser.
