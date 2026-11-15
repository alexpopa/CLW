# Roadmap

Legend: **F** = Fable (visuals/gameplay feel/content), **C** = Codex (auth/server plumbing), **H** = human decision.

## M0 — Scaffold ✅ (done)
Monorepo, sim vertical slice + tests, protocol types, auth interface + dev auth, docs.

## M1 — Playable solo vs AI (F) ✅ (done)

Implement [Phase 1 of the recreation specification](COLONIAL_LINE_WARS.md#38-phase-1--functional-core) as a guest-playable, one-lane match. Use the [Fable handoff](handoff/FABLE.md) for scope and acceptance checks. Done: see [GAME_DESIGN.md](GAME_DESIGN.md) for the implemented rules. Open polish items: balance pass against human play, more unit animation, AI difficulty levels.

## M1.5 — Full battlefield (F)
[Phase 2](COLONIAL_LINE_WARS.md#39-phase-2--full-battlefield): three lanes, nine shrines, 2v2 and 3v3 with AI fill, per-lane tithes, factions, tiers 3–4, abilities.

## M2 — Auth + accounts (when needed)
The accounts Worker and basic sign-in screen are implemented. The hosted client uses the same-origin account service to obtain match tickets. See [Auth](AUTH.md).

## M3 — Multiplayer (C server, F client)
**Done (1v1, guest names, private network):** `ws` server, lobbies by code, command batching per tick, AI fill, disconnect → AI takeover, client network layer beside the local sim loop.
**Still to do:** a hosted two-player acceptance test, snapshots and reconnect, 2v2/3v3 lobbies.

## M4 — Persistence & polish
Match history, simple Elo, leaderboards, replays (seed+log), sound/music, settings, tutorial.

## M5 — Content & balance
**Done:** 26 units in four tiers with automatic abilities, per-unit research, flyers and anti-air, two gravekeepers who do the building (tier IV and mercenaries through the Undertaker), four mercenary bands, rigged unit animation, a combat test harness and balance scripts (see [UNITS.md](UNITS.md)).
**Still to do:** balance against human play (tier IV and mercenary prices are first estimates), upgrades, AI difficulty levels.

## Backlog
Mobile controls, spectating, custom lobbies/passwords, anti-cheat hardening, localization.
