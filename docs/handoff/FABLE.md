# Brief for Fable — you own the game client and the game feel

Read `AGENTS.md`, `docs/GAME_DESIGN.md`, `docs/ARCHITECTURE.md` first. Then `packages/sim/src/*` (≈200 lines; it is the whole ruleset).

Read the [Colonial Line Wars research and recreation specification](../COLONIAL_LINE_WARS.md) before designing the game. It includes a phased plan for Fable and identifies which original mechanics remain unverified. Treat the existing smoke test and [prototype design](../GAME_DESIGN.md) as the starting code.

## Test as a guest

Run `npm install` if needed, then `npm run dev` and open `http://localhost:5173/`. The page is the playable solo match (Phase 1 is implemented; see [GAME_DESIGN.md](../GAME_DESIGN.md)). Keep this entry point open to guests. Starting, playing, and restarting a solo match must work in a fresh browser with no account cookie, Node server, D1, Resend, or secrets.

To check the production bundle locally, run `npm run build -w @lw/client`, then `npm run preview` and open the URL printed by Vite. Test with a fresh browser profile or private window. Account routes are a separate integration for account features.

## Your first milestone

Implement Phase 1 in [the recreation specification](../COLONIAL_LINE_WARS.md#38-phase-1--functional-core). Fable owns the game rules, controls, presentation, and initial balance. Rework the current simulation where the Phase 1 rules differ from the prototype, keeping the shared simulation deterministic and its balance data centralized.

- Build one lane with two headquarters, three capturable beacons, permanent production buildings, synchronized 30-second waves, and automatic movement and combat.
- Include six unit archetypes, one research unlock, one income investment, and an opponent controlled by AI. End the match when a headquarters falls.
- Give the player the information and controls needed to build, invest, research, track the next wave, and restart after the result. Use original art or placeholders.
- Use the proposed values in Part III as starting points. Cover the changed simulation rules with tests and leave room for the three-lane battlefield in Phase 2.

Solo play uses the browser simulation as a guest. See [Auth](../AUTH.md) for account integration and [Deployment](../DEPLOYMENT.md) for hosting.

## Done when

A guest can complete and restart a 1v1 match against AI in the browser. Verify that each Phase 1 system is usable during play, then run `npm run check` for type checking, simulation tests, and the production build.
