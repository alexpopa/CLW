# Game design (current build: one lane, 1v1, three unit tiers)

Working title: **Gravemarch**. This describes what is implemented. For the original game and the long-term plan see the [Colonial Line Wars research and recreation specification](COLONIAL_LINE_WARS.md); this build is [Phase 1](COLONIAL_LINE_WARS.md#38-phase-1--functional-core) of it plus the unit roster, research and abilities of the later phases. Every unit, its ability, its counters and how balance is tested are in [UNITS.md](UNITS.md). The shared [project rules](../AGENTS.md) govern implementation.

All numbers below live in `packages/sim/src/data.ts` and started from Part III of the specification. They are original values, not statistics from any existing game.

## Core loop
One horizontal lane, 480 units long and 24 deep. Team 0's cathedral is at the left end, team 1's at the right. The player is team 0; a simple AI is team 1.
1. **Gravekeepers build chantries.** Each player has two gravekeepers, the **Sexton** and the **Undertaker**, who walk the building ground: a 24 × 24 walled, paved precinct in front of the cathedral. They never step onto the lane, cannot fight and cannot be harmed. To build, choose a keeper, choose a unit and click the ground: the gold is paid at once, the keeper walks there, and the chantry stands the moment he arrives (there is no construction time; it musters from the next wave). Orders queue, up to eight per keeper. Sending a keeper somewhere else cancels his queue and returns the gold, and an order whose ground has been taken by the time he arrives is refunded. A chantry covers 2 × 2 cells of a hidden 1-unit grid, so neighbours can be offset from each other; nothing may overlap, including chantries on order. The ground holds up to 144 chantries. The Sexton raises tiers I to III. The Undertaker raises every tier, is the only one who can raise tier IV, and hires mercenaries.
2. **Waves.** Every 30 s (one global timer) each finished chantry musters its unit (a kennel musters two hounds) where it stands, so placement decides formation: front columns reach the fight first.
3. **Units fight on their own.** They march toward the enemy cathedral, engage the nearest enemy in reach, and attack the cathedral when nothing else is in the way. There is no unit control.
4. **Shrines.** Three checkpoints sit at 25 %, 50 % and 75 % of the lane. Each is drawn as a pair of shrines flanking the lane, one on either edge, so nothing stands in the army's path; it is still one checkpoint, held by whoever's units stand between the pair. Each side starts the match holding the shrine nearest its cathedral (its home shrine); the middle one is neutral. A shrine flips to a team whose units stand on it uncontested. Each shrine held pays income.
5. **Guard towers.** Two towers (2,400 HP, armor 2, 24 damage every 0.6 s, range 9) stand on each home shrine and two more at the front of each building ground, near the top and bottom edges of the lane. They shoot attackers, and advancing units stop to fight them: an army has to bring down the base towers before it can reach the chantries and the cathedral. The home shrine cannot be captured while either of its towers stands. A fallen tower is gone for the match.
6. **Income** every 10 s: `32 + shrines held × (4 + tithe bonus)`.
7. **Tithe** (lane investment): four levels costing 180 / 300 / 480 / 700 that add +5 / +8 / +12 / +16 gold per held shrine. Never refunded. Worth it when you hold two or more shrines.
8. **Research.** You begin knowing three tier I units. Everything else must be researched, one research at a time:
   - **Study** a unit of an open tier to unlock its chantry: 90 gold and 12 s for a tier I unit, 150 gold and 18 s for tier II, 260 gold and 25 s for tier III.
   - **The Second Rite** (400 gold, 30 s) opens tier II and **the Third Rite** (800 gold, 45 s) opens tier III. A rite unlocks no unit by itself: each of the tier's eight units still needs its own study.

   - **The Fourth Rite** (1,500 gold, 60 s) opens tier IV; each of its four units costs 450 gold and 35 s to study.

   There are 26 units (6 + 8 + 8 + 4), so nobody can afford to learn everything early: what to study first, and when to stop building and pay for a rite, is the main strategic choice.
9. **Mercenaries.** The Undertaker hires bands for a single payment (90 to 210 gold, six seconds between hirings). A band appears in front of the base towers of the lane he is in, fights whatever it meets, and leaves when it reaches the middle of the lane. Mercenaries are for holding your half or retaking the middle shrine; they never reach the enemy.
10. **Selling** a chantry refunds 75 % before its first wave and 25 % after.
11. **Victory**: the enemy cathedral (4,500 HP, with a weak defensive attack) reaches zero. After 25 minutes sudden death begins: cathedrals stop defending themselves, take triple damage, and crumble by 8 health a second for each of (1 + shrines the enemy holds), so a match always ends within about ten more minutes and holding ground decides a deadlock.

## Units
Six tier I, eight tier II, eight tier III and four tier IV units, each with an automatic ability, plus four mercenary bands. The full tables, the counter relationships and the balance method are in [UNITS.md](UNITS.md). In short:

- **Tier I:** Arbalester, Oathguard, Pyre Zealot (known from the start); Grave Hounds, Flagellant, Hexbinder.
- **Tier II:** Plague Doctor, Dreadknight, Gargoyle (flies), Witch Hunter, Iron Penitent, Necromancer, Trebuchet, Shade.
- **Tier III:** Bone Colossus, Ash Wyrm (flies), Tempest Cantor, Reliquary, Crimson Countess, Impaler, Pale Lich, Headsman.
- **Tier IV (Undertaker only):** Belfry Titan, Ashen Seraph (flies), Pale Rider, Hellmouth.
- **Mercenaries (hired, not built):** Gallowglass, Free Marksmen, Fire-Eater, Shackled Ogre.

Combat rules:
- Damage taken = `max(1, damage − armor)`. Some abilities ignore armor, strip it, or add to it.
- **Ground and air.** Flying units can only be attacked by units whose attack reaches the air (the unit tables say which). A unit that cannot hit anything in front of it marches on. Flyers do not hold shrines. Towers and cathedrals strike both.
- Units choose the nearest enemy they are able to attack and keep it while it stays close.
- Everyone decides from where all units stood at the start of the tick; damage, healing, afflictions and movement are then applied together. Neither side ever acts first, and a mirrored match stays exactly mirrored (tested).
- Units of the same team keep a little spacing so lines form; flyers only crowd other flyers.
- Most units cross the lane at 6 units per second. Hounds, cavalry, the Shade and the Countess are faster; war engines and the largest units are slower.

## AI
`simpleAI(state, player)` in `packages/sim/src/ai.ts`. Stateless and rule-abiding. Each match the seed gives each autopilot one of four ways to play (`AI.profiles` in `data.ts`): *host of the dead* (Flagellants, Iron Penitents, Necromancers, then the Bone Colossus), *hunt and sky* (Hounds, Dreadknights, Gargoyles, then the Ash Wyrm), *siege line* (Hexbinders, Trebuchets, the Impaler under a Reliquary) and *blood court* (Shades, Dreadknights, then the Countess and the Headsman). A profile is a research order and a target army mix. The autopilot defends when enemies pass its nearest shrine, researches the next step of its order once it has enough chantries, builds anti-air when the enemy fields flyers, raises the tithe when it holds two shrines, and otherwise builds toward its mix. It gives each of its gravekeepers one order at a time, uses the Undertaker for tier IV, and hires mercenaries when enemies are past its nearest shrine and it has gold to spare. It is an opponent for practice and a test vehicle, not a challenge for an experienced player.

## Presentation
Gothic dark fantasy. Everything is original and generated at load time: low-poly 3D models built from primitives (`apps/client/src/models.ts`), procedural textures (`textures.ts`) and synthesized sound (`audio.ts`). There are no downloaded art or audio assets. Soldiers and chantries are drawn small against the lane so large armies and dense building ground stay readable. Units are rigged, not rigid: each has a gait (walk, shuffle, gallop, lope, stomp, float, roll, fly), turns toward its target, leans into its stride, lunges when it strikes and breathes when it stands, and carries separately moving pieces (capes, wings, tails, hanging chains and lanterns, wheels, orbiting ice). Each attack has its own effect and sound: bolts, gunshots, curses, frost bursts, chain lightning, fire breath, the Impaler's stake. The camera is a fixed elevated RTS view that scrolls horizontally along the lane.

The bar always shows the two gravekeepers. The build menu appears only while one is selected, and shows one tab at a time: tiers I to III for the Sexton, and for the Undertaker also tier IV and the mercenaries. A card you know is picked for building; a card of an open tier you have not studied starts its study when clicked and shows its progress; cards of a sealed tier show the tier numeral; a mercenary card hires the band. A selected keeper has a ring under him, his queued chantries are drawn as ghost footprints, and hovering a card shows the unit's ability, statistics and what it can strike.

Controls: 1 selects the Sexton and 2 the Undertaker (or click them); Tab switches tab; 3 4 5 6 7 8 9 0 pick, study or hire the cards of the shown tab; left-click your ground to place the chosen unit (keep clicking to queue more) or, with no unit chosen, to send the keeper walking; right-click cancels placing, or sends the keeper walking; Esc backs out one step; click a chantry then X to sell; E tithe, R rite, drag / wheel / A-D / arrows / screen edges / map strip to scroll, Space home, P pause.

## Online play (1v1)
The title screen offers "Host a match" and "Join" next to the solo game. The host gets a four-letter code; the match starts the moment a second player joins with it, or the host can choose to play the server's autopilot instead. Players are guests who pick a display name; there are no accounts yet. The match server (`apps/server`) owns the match: it applies each player's commands, runs the autopilot for any empty seat, and sends every client the exact commands of each tick to replay on its own copy of the sim. A player who leaves is replaced by the autopilot. Pause and game speed are solo-only. Not yet: reconnecting to a match in progress, spectators, rankings.

## Not in this build
Three lanes and nine shrines, 2v2 and 3v3, the three factions, player-cast abilities, accounts in the client, hosted multiplayer. These are Phases 2–4 of the specification. Gravekeepers are already built for team games: a keeper has a lane, every build and move order names one, a keeper may stand on any lane of his own team's ground and walks across the shared edge to reach a neighbouring lane, and mercenaries appear in whichever lane the Undertaker is in. The sim already keys units, buildings and shrines by lane and players by team so they can be added without replacing it.
