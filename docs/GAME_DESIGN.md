# Game design (current build: Phase 1, 1v1 vs AI)

Working title: **Gravemarch**. This describes what is implemented. For the original game and the long-term plan see the [Colonial Line Wars research and recreation specification](COLONIAL_LINE_WARS.md); this build is [Phase 1](COLONIAL_LINE_WARS.md#38-phase-1--functional-core) of it. The shared [project rules](../AGENTS.md) govern implementation.

All numbers below live in `packages/sim/src/data.ts` and started from Part III of the specification. They are original values, not statistics from any existing game.

## Core loop
One horizontal lane, 480 units long and 24 deep. Team 0's cathedral is at the left end, team 1's at the right. The player is team 0; a simple AI is team 1.
1. **Build chantries.** Pay gold once to place a production building anywhere on your building ground, a 24 × 24 walled, paved precinct in front of your cathedral. A chantry covers 2 × 2 cells of a hidden 1-unit grid, so neighbours can be offset from each other; nothing may overlap. The ground holds up to 144 chantries. No grid is drawn: the precinct's paving and low wall show where you may build, and a footprint marker appears only while you are placing. Construction takes 2 s.
2. **Waves.** Every 30 s (one global timer) each finished chantry musters one unit where it stands, so placement decides formation: front columns reach the fight first.
3. **Units fight on their own.** They march toward the enemy cathedral, engage the nearest enemy in reach, and attack the cathedral when nothing else is in the way. There is no unit control.
4. **Shrines.** Three checkpoints sit at 25 %, 50 % and 75 % of the lane. Each is drawn as a pair of shrines flanking the lane, one on either edge, so nothing stands in the army's path; it is still one checkpoint, held by whoever's units stand between the pair. Each side starts the match holding the shrine nearest its cathedral (its home shrine); the middle one is neutral. A shrine flips to a team whose units stand on it uncontested. Each shrine held pays income.
5. **Guard towers.** Two towers (2,400 HP, armor 2, 24 damage every 0.6 s, range 9) stand on each home shrine and two more at the front of each building ground, near the top and bottom edges of the lane. They shoot attackers, and advancing units stop to fight them: an army has to bring down the base towers before it can reach the chantries and the cathedral. The home shrine cannot be captured while either of its towers stands. A fallen tower is gone for the match.
6. **Income** every 10 s: `32 + shrines held × (4 + tithe bonus)`.
7. **Tithe** (lane investment): four levels costing 180 / 300 / 480 / 700 that add +5 / +8 / +12 / +16 gold per held shrine. Never refunded. Worth it when you hold two or more shrines.
8. **The Second Rite** (research): 400 gold, 30 s, unlocks the three tier-2 units.
9. **Selling** a chantry refunds 75 % before its first wave and 25 % after.
10. **Victory**: the enemy cathedral (4,500 HP, with a weak defensive attack) reaches zero. After 25 minutes cathedrals stop defending themselves and take triple damage, so matches always end.

## Units
| Key | Unit | Tier | Cost | HP | Role |
|---|---|---:|---:|---:|---|
| 1 | Arbalester | 1 | 125 | 90 | Cheap ranged infantry |
| 2 | Oathguard | 1 | 160 | 240 | Armored melee frontline |
| 3 | Pyre Zealot | 1 | 185 | 140 | Short-range area damage, weak against armor |
| 4 | Plague Doctor | 2 | 270 | 125 | Heals wounded allies, does not attack |
| 5 | Dreadknight | 2 | 335 | 330 | Fast, heavily armored lancer |
| 6 | Trebuchet | 2 | 550 | 230 | Very long range area damage, slow |

Combat rules: damage taken = `max(1, damage − armor)`; damage and healing from one tick are applied together so neither side strikes first; units of the same team keep a little spacing so lines form. Units cross the lane at 15 units per second (17.5 for the Dreadknight, 11 for the Trebuchet).

## AI
`simpleAI(state, player)` in `packages/sim/src/ai.ts`. Stateless and rule-abiding: it defends when enemies pass its nearest shrine, saves for the Second Rite after five chantries, raises the tithe when it holds two shrines, and otherwise builds toward a fixed army mix. It is an autopilot for testing, not a challenge.

## Presentation
Gothic dark fantasy. Everything is original and generated at load time: low-poly 3D models built from primitives (`apps/client/src/models.ts`), procedural textures (`textures.ts`) and synthesized sound (`audio.ts`). There are no downloaded art or audio assets. Soldiers and chantries are drawn small against the lane so large armies and dense building ground stay readable. The camera is a fixed elevated RTS view that scrolls horizontally along the lane.

Controls: 1–6 pick a unit, click your building ground to build, click a chantry then X to sell, E tithe, R rite, drag / wheel / A-D / arrows / screen edges / map strip to scroll, Space home, P pause.

## Online play (1v1)
The title screen offers "Host a match" and "Join" next to the solo game. The host gets a four-letter code; the match starts the moment a second player joins with it, or the host can choose to play the server's autopilot instead. Players are guests who pick a display name; there are no accounts yet. The match server (`apps/server`) owns the match: it applies each player's commands, runs the autopilot for any empty seat, and sends every client the exact commands of each tick to replay on its own copy of the sim. A player who leaves is replaced by the autopilot. Pause and game speed are solo-only. Not yet: reconnecting to a match in progress, spectators, rankings.

## Not in this build
Three lanes and nine shrines, 2v2 and 3v3, the three factions, tiers 3–4, unit abilities, player-cast abilities, accounts in the client, hosted multiplayer. These are Phases 2–4 of the specification. The sim already keys units, buildings and shrines by lane and players by team so they can be added without replacing it.
