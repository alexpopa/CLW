# Units, research and balance

This is the reference for every unit in the game: what it costs, what it does, what beats it, and how its numbers were arrived at. The rules of a match are in [GAME_DESIGN.md](GAME_DESIGN.md); the original game that inspired the design is described in the [Colonial Line Wars specification](COLONIAL_LINE_WARS.md).

All numbers live in `packages/sim/src/data.ts`. The tables below are printed from that file by `packages/sim/scripts/units-doc.ts`; after changing a unit, run it and paste the output here.

All names, abilities and statistics are original to this game.

## How research works

A player starts with three known units: the Arbalester, the Oathguard and the Pyre Zealot. Everything else is researched.

- **A study** unlocks one unit so that its chantry can be built. The unit's tier must be open.
- **A rite** opens the next tier. It unlocks no unit by itself: every unit of the tier still needs its own study.
- A player runs **one research at a time**, rite or study. Gold is paid when it starts. It cannot be cancelled.
- Research is per player, so teammates will be able to specialise when team games arrive.

| Research | Cost | Time |
|---|---:|---:|
| Study a tier I unit | 90 | 12 s |
| The Second Rite (opens tier II) | 400 | 30 s |
| Study a tier II unit | 150 | 18 s |
| The Third Rite (opens tier III) | 800 | 45 s |
| Study a tier III unit | 260 | 25 s |
| The Fourth Rite (opens tier IV) | 1,500 | 60 s |
| Study a tier IV unit | 450 | 35 s |

Learning everything costs 8,050 gold and eleven minutes of research time, which is more than a match allows early on. The intended decision is the one the original game is built on: which few units to learn, and when to stop adding chantries and pay for the next rite.

## Gravekeepers

Chantries are raised by the player's two gravekeepers, who walk the building ground and are not units (they cannot fight or be harmed, and never enter the lane).

| Key | Keeper | Raises | Also |
|---|---|---|---|
| 1 | **Sexton** | Tiers I, II, III | |
| 2 | **Undertaker** | Tiers I, II, III and IV | Hires mercenaries |

Select a keeper (1 or 2, or click him), pick a card, click the ground. Gold is paid on the order; he walks there (9 lane units a second) and the chantry stands at once. Up to eight orders queue per keeper. A move order (right-click, or left-click with no unit chosen) cancels his queue and refunds it. The build menu is only shown while a keeper is selected, and tier IV and the mercenaries only appear in the Undertaker's menu. Card keys are 3 4 5 6 7 8 9 0.

Keepers are written for team games: every order carries a lane, and a keeper may walk to any lane of his own team's ground, so in 2v2 and 3v3 a player will be able to build in an ally's lane.

## The roster

Reach and speed are in lane units and lane units per second (the lane is 480 long and 24 deep). "Hits air" says whether the unit's attack can strike flying units. Units marked ×2 muster two soldiers per wave from one chantry.

### Tier I

Each study costs 90 gold and takes 12 s; the first three units are known from the start.

| Key | Unit | Cost | Health | Armor | Attack | Reach | Speed | Hits air | Ability |
|---|---|---:|---:|---:|---|---:|---:|---|---|
| 3 | **Arbalester** (known) | 140 | 80 | 0 | 11 every 1 s (11/s) | 6 | 6 | yes | Skyward Bolts: can shoot flying foes. |
| 4 | **Oathguard** (known) | 190 | 280 | 1 | 9 every 1 s (9/s) | 1.5 | 6 | no | Shield Wall: takes 2 less damage from every ranged attack. |
| 5 | **Pyre Zealot** (known) | 145 | 110 | 0 | 5 every 0.5 s (10/s) | 3 | 6 | no | Immolate: foes it scorches keep burning for 2 damage a second, through any armor. |
| 6 | **Grave Hounds** (×2) | 145 | 112 | 0 | 8 every 0.6 s (13/s) | 1.2 | 8.4 | no | Pack: each kennel looses two hounds every wave. |
| 7 | **Flagellant** | 170 | 215 | 0 | 16 every 1 s (16/s) | 1.5 | 6.4 | no | Frenzy: strikes faster the more it bleeds, up to twice as fast near death. |
| 8 | **Hexbinder** | 170 | 120 | 0 | 12 every 1.2 s (10/s) | 7 | 6 | yes | Leaden Curse: foes she hits move and attack 40% slower for 2 seconds. Can curse flying foes. |

### Tier II

Opened by the Second Rite (400 gold, 30 s). Each study costs 150 gold and takes 18 s.

| Key | Unit | Cost | Health | Armor | Attack | Reach | Speed | Hits air | Ability |
|---|---|---:|---:|---:|---|---:|---:|---|---|
| 3 | **Plague Doctor** | 150 | 125 | 0 | mends 16/s | 5 | 6 | – | Mend: restores 16 health a second to the nearest wounded ally, on foot or on the wing. |
| 4 | **Dreadknight** | 350 | 350 | 2 | 20 every 1 s (20/s) | 2.5 | 6.8 | no | Lance Charge: its first strike against each new foe deals triple damage. |
| 5 | **Gargoyle** (flies) | 310 | 270 | 1 | 17 every 1 s (17/s) | 1.5 | 6.4 | yes | Flight: only foes that can strike the air may harm it. Claws flyers and walkers alike. |
| 6 | **Witch Hunter** | 310 | 160 | 0 | 26 every 1.5 s (17/s) | 8 | 6 | yes | Silver Shot: two and a half times its damage to flying foes. Lantern: reveals veiled foes within 9. |
| 7 | **Iron Penitent** | 360 | 480 | 2 | 23 every 1.2 s (19/s) | 1.5 | 5.6 | no | Sunder: every blow strips 1 armor from its victim, up to 4. |
| 8 | **Necromancer** | 470 | 165 | 0 | 16 every 1.2 s (13/s) | 7 | 6 | yes | Raise Dead: when anyone on foot dies within 10, a Skeleton rises to fight for the Necromancer (once every 3 seconds). |
| 9 | **Trebuchet** | 480 | 180 | 1 | 32 every 3 s (11/s) | 13 | 4.4 | no | Siege Stones: half again as much damage to towers and the cathedral, from beyond their reach. Cannot hit foes nearer than 4 or in the air. |
| 0 | **Shade** | 485 | 265 | 0 | 33 every 0.8 s (41/s) | 1.5 | 7.2 | no | Veil: cannot be targeted from farther than 2 unless revealed. Ghost Blades: ignore armor. |

### Tier III

Opened by the Third Rite (800 gold, 45 s). Each study costs 260 gold and takes 25 s.

| Key | Unit | Cost | Health | Armor | Attack | Reach | Speed | Hits air | Ability |
|---|---|---:|---:|---:|---|---:|---:|---|---|
| 3 | **Bone Colossus** | 905 | 900 | 2 | 30 every 1.5 s (20/s) | 2.5 | 4.8 | no | Cleave: hits every foe around its target. Ossuary: collapses into four Skeletons when slain. |
| 4 | **Ash Wyrm** (flies) | 1080 | 700 | 1 | 12 every 0.5 s (24/s) | 5 | 6 | yes | Searing Breath: +25% damage for each consecutive hit on the same foe, up to +200%. Flies. |
| 5 | **Tempest Cantor** | 730 | 200 | 0 | 33 every 1.5 s (22/s) | 8 | 6 | yes | Chain Lightning: each strike leaps to 4 more foes within 4, losing a quarter of its force per leap. Strikes the air too. |
| 6 | **Reliquary** | 300 | 520 | 2 | none | 5 | 5.6 | – | Sanctuary: allies within 7 gain 3 armor and regain 15 health a second. Does not fight. |
| 7 | **Crimson Countess** | 990 | 800 | 1 | 42 every 0.8 s (53/s) | 1.5 | 6.8 | no | Blood Feast: heals herself for half of the damage she deals. |
| 8 | **Impaler** | 685 | 210 | 1 | 42 every 2.5 s (17/s) | 12 | 4.8 | yes | Impale: skewers every foe in a line 14 long. Two and a half times its damage to flying foes. |
| 9 | **Pale Lich** | 720 | 200 | 0 | 18 every 1.5 s (12/s) | 8 | 6 | yes | Grave Frost: bursts in an area, ignores armor, and slows everyone caught by 40% for 3 seconds. |
| 0 | **Headsman** | 785 | 850 | 2 | 44 every 1.4 s (31/s) | 1.8 | 6 | no | Execute: every blow deals bonus damage equal to 10% of its victim's full health. |

### Tier IV

Opened by the Fourth Rite (1500 gold, 60 s). Only the Undertaker can raise these. Each study costs 450 gold and takes 35 s.

| Key | Unit | Cost | Health | Armor | Attack | Reach | Speed | Hits air | Ability |
|---|---|---:|---:|---:|---|---:|---:|---|---|
| 3 | **Belfry Titan** | 2000 | 2300 | 3 | 55 every 1.8 s (31/s) | 2.8 | 4.4 | no | Death Knell: each toll crushes every foe around its target and leaves them 30% slower for 2 seconds. |
| 4 | **Ashen Seraph** (flies) | 2400 | 950 | 2 | 36 every 1 s (36/s) | 7 | 6 | yes | Cinder Lance: bursts in an area, ignores armor, strikes ground and air. Flies. |
| 5 | **Pale Rider** | 1900 | 1350 | 2 | 58 every 0.9 s (64/s) | 2.5 | 7.6 | no | Reaping Charge: its first strike on each new foe deals triple damage. Harvest: heals for 30% of the damage it deals, and each blow takes 4% of the victim's full health. |
| 6 | **Hellmouth** | 1950 | 520 | 2 | 85 every 3.5 s (24/s) | 15 | 4 | no | Brimstone: a huge burning blast; those caught burn for 6 a second for 4 seconds. Double damage to towers and the cathedral. Cannot hit foes nearer than 5 or in the air. |

### Mercenaries

| Key | Band | Hire | Soldiers | Health | Armor | Attack | Reach | Hits air | Notes |
|---|---|---:|---:|---:|---:|---|---:|---|---|
| 3 | **Gallowglass** | 90 | 2 | 300 | 2 | 20 every 1 s (20/s) | 1.6 | no | Two mailed axemen from across the sea. They hold a line for as long as they are paid to. |
| 4 | **Free Marksmen** | 100 | 3 | 110 | 0 | 18 every 1.2 s (15/s) | 7 | yes | Three poachers with long guns. They shoot whatever walks or flies. |
| 5 | **Fire-Eater** | 110 | 1 | 280 | 0 | 9 every 0.5 s (18/s) in an area | 3.5 | no | A carnival fire-breather gone to war. A swarm is only kindling. |
| 6 | **Shackled Ogre** | 210 | 1 | 1400 | 1 | 50 every 1.5 s (33/s) in an area | 2.5 | no | Bought from a debtor's pit, still dragging its chains. It flattens whatever stands closest. |

### Not buildable

- **Skeleton:** 90 health, 10 damage a second, melee. Raised by a Necromancer or left by a fallen Bone Colossus. Crumbles after 40 seconds. Skeletons are not worth anything to a Necromancer when they die (they cannot be raised again).
- **Guard Tower:** 2,400 health, armor 2, 24 damage every 0.6 s, reach 9. Strikes ground and air. Four per side; see [GAME_DESIGN.md](GAME_DESIGN.md).

## Tier IV and mercenaries

Tier IV is the top of the roster: four units, each several times the price of a tier III unit, and only the Undertaker can raise them. They are meant to be the strongest things on the lane and each still has an answer: the Belfry Titan and the Pale Rider cannot reach flyers and are slowed and executed like any giant; the Ashen Seraph is a flyer and dies to silver shot and the Impaler; the Hellmouth cannot shoot up or close.

Mercenaries are not built. The Undertaker pays once, the band appears in front of the base towers, and it leaves at the middle of the lane. A chantry of a comparable unit costs three to five times as much but musters every wave for the rest of the match, so mercenaries are worth it only to survive a push or to take the middle shrine at a moment that matters. Their dead can be raised by Necromancers like anyone else's.

## Abilities

Every ability is automatic: units use them on their own, and the autopilot uses them exactly as well as a player does. Each ability is a data field on `UnitDef` that `sim.ts` reads generically, so a new unit can combine existing abilities without new rules.

| Ability (field) | Units | Rule |
|---|---|---|
| Flight (`flying`) | Gargoyle, Ash Wyrm | Can only be attacked by units that hit air. Ignores the ground melee in front of it, and is ignored by it. Does not hold shrines. |
| Anti-air (`air`) | see tables | The attack can target flying units. Area, line and chain attacks only hurt flyers if the attacker has this. |
| Pack (`count`) | Grave Hounds | One chantry musters two units per wave. |
| Shield Wall (`ward`) | Oathguard | Takes 2 less damage from every attack made from farther than melee reach (3). Stacks with armor. |
| Immolate (`dot`) | Pyre Zealot | Each foe hit burns for 2 damage a second for 2 s. Burning ignores armor. Re-applying refreshes it. |
| Leaden Curse, Grave Frost (`slow`) | Hexbinder, Pale Lich | Foes hit move slower and attack slower for a few seconds. The strongest slow applies; it does not stack. |
| Frenzy (`frenzy`) | Flagellant | The time between its attacks shrinks in proportion to missing health, down to half at the point of death. |
| Lance Charge (`charge`) | Dreadknight | The first hit against each new target deals triple damage. |
| Sunder (`sunder`) | Iron Penitent | Each hit permanently removes 1 armor from the target, down to 4 below its normal armor (never below zero). Works on towers. |
| Ghost Blades, Grave Frost (`pierce`) | Shade, Pale Lich | The attack ignores armor (but not Shield Wall). |
| Veil (`veil`) | Shade | Cannot be targeted from farther than 2 unless revealed. Area attacks aimed at something else still hurt it. |
| Lantern (`reveal`) | Witch Hunter | Enemy veiled units within 9 can be targeted by everyone as usual. |
| Silver Shot, Impale, Siege Stones (`bonus`) | Witch Hunter, Impaler, Trebuchet | Extra damage against one kind of target: flying units (Witch Hunter, Impaler: two and a half times) or towers and the cathedral (Trebuchet: half again as much, from outside their reach). |
| Minimum range (`minRange`) | Trebuchet | Cannot attack anything nearer than 4. With enemies inside that distance and nothing else to shoot, it holds still. |
| Raise Dead (`raise`) | Necromancer | When a unit on foot (not a Skeleton, not a flyer, not a tower) dies within 10 of a Necromancer whose ability is ready, a Skeleton rises for the Necromancer's side. Ready again after 3 s. If several Necromancers could claim a corpse, the nearest does. |
| Cleave (`splash`) | Bone Colossus, Pyre Zealot, Trebuchet, Pale Lich | The attack hits every enemy within a radius of the target. |
| Ossuary (`spawnOnDeath`) | Bone Colossus | Leaves four Skeletons when it dies. |
| Searing Breath (`ramp`) | Ash Wyrm | Each consecutive hit on the same target deals 25% more than the last, up to +200% after eight hits. Changing target resets it. |
| Chain Lightning (`chain`) | Tempest Cantor | After the target, the bolt leaps to the nearest unstruck enemy within 4, up to four times, losing a quarter of its damage each leap. |
| Sanctuary (`aura`) | Reliquary | Allies within 7 (not itself, not towers) have 3 more armor and regain 15 health a second. Several Reliquaries do not stack. |
| Blood Feast (`leech`) | Crimson Countess | Heals herself for half of the damage she deals. |
| Impale (`line`) | Impaler | The stake hits every enemy within 0.9 of a line 14 long, starting at the Impaler and passing through its target. |
| Execute (`maim`) | Headsman | Each hit deals extra damage equal to 10% of the target's full health. Not against towers or the cathedral. |
| Mend (`heal`) | Plague Doctor | Heals the nearest wounded ally in reach; stays behind the fighting. |

## Who beats what

The roster is built around the counter system of the original: no unit is good against everything, and the answer to a unit is usually cheaper than the unit. The relationships below are checked by `packages/sim/src/balance.test.ts`.

| If the enemy builds | Answer with | Why |
|---|---|---|
| Massed cheap infantry or Grave Hounds | Pyre Zealot, Bone Colossus, Pale Lich, Tempest Cantor | Area damage hits many small units at once. |
| Arbalesters and other archers | Oathguard, Grave Hounds, Shade | Shield Wall blunts every arrow; hounds and Shades reach the archers quickly. |
| Heavy armor (Dreadknight, Iron Penitent) | Iron Penitent, Shade, Pale Lich, Pyre Zealot | Sunder strips armor; ghost blades, frost and fire ignore it. |
| One huge unit (Bone Colossus, Crimson Countess) | Hexbinder, Arbalesters, flyers, Headsman | A slowed giant is half a giant; massed bolts ignore its cleave; neither can reach the air; Execute scales with the victim's health. |
| Flyers (Gargoyle, Ash Wyrm) | Witch Hunter, Hexbinder, Impaler; Arbalesters against the Wyrm; your own Wyrm against Gargoyles | Silver shot and the stake do two and a half times their damage to flyers; a cursed flyer barely moves. Melee units cannot touch them. |
| Trebuchets and Impalers | Shade, Grave Hounds, Dreadknight, Gargoyle | Fast units get inside the engines' reach; the Trebuchet cannot shoot up or close. |
| Shades | A Witch Hunter among your archers, any area damage, Headsman | The lantern lets everyone shoot them; fire and frost do not need to see them. |
| Necromancers | Flyers, Tempest Cantor, anything that kills the Necromancer first | Flyers leave no corpses to raise and the Skeletons cannot reach them. |
| Plague Doctors and a Reliquary | Burst and area damage, Shades | Healing loses to damage that kills in one or two hits; Shades slip past to the support. |
| Towers and the cathedral | Trebuchet, Iron Penitent | The Trebuchet outranges towers and hits stone harder; Sunder works on towers. |

Flyers deserve a note. They are strong against an army with no anti-air and poor against a prepared one, and they travel alone over the fighting, so they reach the enemy towers (which do shoot upward) before the rest of the army. They are a punish for a careless opponent, not a main army.

## How balance is tested

Balance is measured, not guessed. Three tools ship with the sim; none of them needs the client.

1. **Clash** (`clash()` in `packages/sim/src/arena.ts`, `npm run balance`). Two armies of equal gold are lined up in an empty lane and fight once. The result is a margin: the share of side A's value still alive minus the share of side B's. Run for every pair of fighting units it gives the matchup table, both massed and "mixed" (half of each side's gold spent on a plain escort, so a front-line unit has archers behind it and a ranged unit has a shield wall in front).
2. **Lane** (`stream()`, `npm run balance:lane`). The same armies as standing production on the real lane, with towers, cathedral guns, shrines, travel time and a new wave every 30 seconds, for eight minutes, at three army sizes. This catches what a single clash cannot: a fast unit arriving alone at a tower, a slow one never arriving, a support unit that only matters over time. It is what the unit costs were finally set against.
3. **Whole matches** (`npm run balance:ai`). The autopilot plays itself with different research orders and army mixes, with the economy and research running. This checks that matches finish, that every tier is reached and that no way of playing wins every time.

`packages/sim/scripts/tune.ts` automates the loop: it measures every unit's average result and reprices the unit toward its tier's target (later tiers may be slightly better per gold, because reaching them costs research), then repeats.

Targets, from the [specification](COLONIAL_LINE_WARS.md#24-proposed-counter-system):

- Identical armies draw. In both tools a mirrored fight is exactly symmetric, which is tested.
- No unit beats every other unit for the same gold, and every unit beats some.
- A proper counter wins clearly for the same gold; an army with much more gold beats its counter.
- Support units help without making a line unkillable.

### What the testing changed

The harness found and fixed several things that playing by hand would have taken a long time to notice:

- **A first-strike bias in the rules.** Units used to move one after another within a tick, so a unit later in the list saw its enemy already stepped into range and fired a tick earlier. In a mirrored fight one side won every time. Movement is now applied after every unit has decided. Three smaller asymmetries (pack spawn positions, burn timing, which Necromancer claims a corpse) were fixed the same way. A mirrored match now stays mirrored to the last tick.
- **The Trebuchet** was by far the best unit for its gold. Its damage, area and rate of fire were cut and it gained a minimum range; what it keeps is reach beyond a tower's.
- **Fast units are worse than they look.** Hounds, cavalry, Shades and flyers outrun their army and meet the enemy alone. They were slowed toward the army's pace and made cheaper.
- **Flyers** won every clash against armies without anti-air but lost most lane matches, because towers shoot upward. They were made much cheaper rather than tougher, to keep them a counter-pick.
- **Support units** are only worth a fraction of an army; the Plague Doctor and the Reliquary were priced for that.
- **Mirrored autopilots never finished.** Two identical armies cancel each other forever. Sudden death now makes both cathedrals crumble, faster for the side holding fewer shrines.

### Where the numbers stand

Measured with the tools above at the costs in the tables.

**Massed clash, 3,300 gold each** (`npm run balance`): average margin against the other 19 fighting units, and each unit's worst matchup.

| Unit | Average | Worst matchup | | Unit | Average | Worst matchup |
|---|---:|---|---|---|---:|---|
| Arbalester | −18 | Grave Hounds | | Necromancer | −51 | Crimson Countess |
| Oathguard | −23 | Gargoyle | | Trebuchet | −25 | Gargoyle |
| Pyre Zealot | +2 | Gargoyle | | Shade | +4 | Headsman |
| Grave Hounds | +37 | Crimson Countess | | Bone Colossus | +19 | Ash Wyrm |
| Flagellant | +25 | Gargoyle | | Ash Wyrm | +45 | Hexbinder |
| Hexbinder | +3 | Grave Hounds | | Tempest Cantor | −40 | Grave Hounds |
| Dreadknight | +24 | Grave Hounds | | Crimson Countess | +15 | Arbalester |
| Gargoyle | +42 | Ash Wyrm | | Impaler | −44 | Crimson Countess |
| Witch Hunter | −14 | Grave Hounds | | Pale Lich | −4 | Crimson Countess |
| Iron Penitent | −1 | Gargoyle | | Headsman | +6 | Gargoyle |

Every unit has clear losing matchups, including the tier III units against tier I answers. The spread is deliberate and comes from pricing units for the lane rather than for a massed duel: melee units and flyers look strong when 3,300 gold of them meets 3,300 gold of archers in the open, and ranged casters and engines look weak, but on the lane the casters stand behind a front line and the fast units arrive piecemeal under tower fire.

**Lane, three army sizes, eight minutes** (`npm run balance:lane`): each unit's average score against the other 21, where the unit takes its natural place in a plain army (a front-line unit with Arbalesters behind it, a ranged unit behind Oathguards, a support unit as a fifth of an Oathguard-and-Arbalester army). The score is the share of the enemy's towers and cathedral destroyed minus the share lost, so 0 is even and ±100 is a rout.

| Unit | Lane | | Unit | Lane | | Unit | Lane |
|---|---:|---|---|---:|---|---|---:|
| Arbalester | −8 | | Dreadknight | +5 | | Bone Colossus | +28 |
| Oathguard | −8 | | Gargoyle | −9 | | Ash Wyrm | +8 |
| Pyre Zealot | −2 | | Witch Hunter | +27 | | Tempest Cantor | +6 |
| Grave Hounds | −2 | | Iron Penitent | +4 | | Reliquary | −26 |
| Flagellant | −3 | | Necromancer | +4 | | Crimson Countess | +3 |
| Hexbinder | −12 | | Trebuchet | −19 | | Impaler | +3 |
| Plague Doctor | −18 | | Shade | +11 | | Pale Lich | +5 |
| | | | | | | Headsman | +5 |

Seventeen of the 22 units are within 12 points of even. The five outside it are the open items: the Witch Hunter and the Bone Colossus are somewhat too good for their gold on the lane, and the Trebuchet, the Plague Doctor and the Reliquary somewhat too poor. One measurement of this kind moves by 10 to 20 points between runs, so these are leads, not verdicts.

**Whole matches** (`npm run balance:ai`, 24 seeds): every match ended with a winner, in 16 to 30 minutes, and the two sides won about equally often (11 and 13). Both sides reached tier II in every match and tier III in nearly all.

Which AI profile wins is **not** settled. Across tuning passes the win rates of the four profiles swung from one extreme to the other after changes of a few percent to single units. The cause is the test, not only the units: the sim has no randomness, so 24 seeds are really six pairings played over and over, and each is decided by an early engagement that then snowballs. Treat profile win rates as a smoke test. In the final run *siege line* won 9 of 9 and *host of the dead* 8 of 10, while *hunt and sky* won 0 of 7 and *blood court* 1 of 10. The profile built around melee specialists (*blood court*) lost most of its matches in every pass, which is consistent with the clash results for mixed armies: an army that is mostly melee specialists loses to a front line with ranged damage behind it. That is the first thing to look at with human playtests.

### Known limits

- The sim has no randomness, so two autopilots with the same plan play the same match, and two autopilots with the same profile on opposite sides can mirror each other until sudden death decides the match. Variety in the whole-match test comes only from the four AI profiles and the seed's choice between them.
- Lane matches snowball: winning the first engagement often decides the eight minutes. Results for one pairing at one army size are noisy, which is why the tuner averages three sizes and many opponents.
- All of this measures units against the autopilot's armies. It has not been tuned against human play yet. Expect to revisit costs after playtests; the tools make that a short job.
