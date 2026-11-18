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

Learning everything costs 8,230 gold and eleven minutes of research time, which is more than a match allows early on. The intended decision is the one the original game is built on: which few units to learn, and when to stop adding chantries and pay for the next rite.

## Gravekeepers

Chantries are raised by the player's two gravekeepers, who walk the building ground and are not units (they cannot fight or be harmed, and never enter the lane).

| Key | Keeper | Raises | Also |
|---|---|---|---|
| 1 | **Sexton** | Tiers I, II, III | Teleports (T): at once to any ground of his side, in any lane, as often as wanted; cancels and refunds his queue |
| 2 | **Undertaker** | Tier IV only | Hires mercenaries (six seconds between bands) |

Select a keeper (1 or 2, or click him), pick a card, click the ground. Gold is paid on the order; he walks there (9 lane units a second) and the chantry stands at once. Up to eight orders queue per keeper. A move order (right-click, or left-click with no unit chosen) cancels his queue and refunds it. The build menu is only shown while a keeper is selected, and each keeper shows only his own tabs: tiers I to III for the Sexton, tier IV and the mercenaries for the Undertaker. Cards sit in two staggered rows like their keys: Q W E R above, A S D F below. Z X C switch tab.

Keepers work across lanes: every order carries a lane, and a keeper may stand on any lane of his own team's ground. In 2v2 and 3v3 a player can therefore build in an ally's lane (the chantry is his, and musters into that lane). Either keeper can walk there through the gates between building grounds or teleport. Mercenaries appear in whichever lane the Undertaker is standing in.

## The roster

Every unit has one job and at least one clear answer. Targeting is the same for everyone (each soldier fights the nearest foe it can strike), so what sets units apart is what they can hit, how their blows land, and what happens around them.

### Every unit in one line

**Tier I**
- **Arbalester:** cheap crossbowman. Weak alone, strong in numbers behind a shield; shoots flyers. Loses to the Oathguard and to anything that reaches it.
- **Oathguard:** the starting tank. Lots of health, little damage, shrugs off arrows. Cannot touch flyers.
- **Pyre Zealot:** short-range fire that scorches a crowd and keeps burning through armor. Melts light soldiers, barely scratches heavy ones.
- **Grave Hounds:** two fast, cheap dogs per kennel that run down archers and engines. Their scent unmasks a Shade for everyone. Die to fire and halberds.
- **Flagellant:** glass-cannon brawler that swings faster the more it bleeds, and whose death heals the allies around it. Blight denies the blessing.
- **Hexbinder:** weak caster whose curse slows a foe's walk and swing. The cheap answer to a single big unit or a Wyrm; Stone Skin ignores it.
- **Halberdier:** pikeman who does three times damage to anything swift (hounds, cavalry, Shades, the Countess, the Pale Rider) and takes no extra harm from a charge. Ordinary against anything slow.
- **Crypt Bats:** three fragile bats per belfry. Melee and ground-only casters cannot touch them; a curse kills one outright, a crossbow in two bolts. The question every early army must answer: can you shoot the sky?

**Tier II**
- **Plague Doctor:** heals the nearest wounded ally. Blight stops it.
- **Dreadknight:** fast armored lancer; the first blow on each new foe hits triple. Halberds stop it cold.
- **Gargoyle:** flying stone brawler that claws ground and air. Stone Skin: no curse, fire or blow moves it, so only raw damage (silver shot, massed bolts) brings it down.
- **Witch Hunter:** slow, heavy shot that does two and a half times damage to flyers, and a lantern that unmasks Shades. The anti-air specialist.
- **Iron Penitent:** slow, heavy tank whose maul strips armor, even from towers.
- **Necromancer:** ground-only caster who turns fallen walkers into Skeletons. Flyers leave no corpses and cannot be shot by him.
- **Trebuchet:** outranges towers and breaks stone. Helpless against anything close or in the air.
- **Shade:** invisible assassin with armor-piercing blades. Archers cannot see it from afar unless a lantern or a hound's nose gives it away.

**Tier III**
- **Bone Colossus:** slow giant that cleaves everything around its target and leaves four Skeletons when it falls.
- **Ash Wyrm:** flyer whose breath grows hotter on the same foe; melts single big units. Slowed and shot down by curses and silver.
- **Tempest Cantor:** chain lightning that leaps through a packed crowd, in the air too. Needs a line in front of it: massed alone it is run down.
- **Reliquary:** does not fight; allies near it gain armor and regenerate. Blight shuts the regeneration off.
- **Crimson Countess:** swift duelist who heals on every wound she deals and speeds up with every kill. A crowd of light soldiers feeds her; halberds, heavy armor and the Headsman stop her.
- **Impaler:** ground-only ballista whose stake skewers a whole file, at double damage through heavy armor. Shreds armored lines, cannot shoot the sky.
- **Pale Lich:** armor-piercing area burst that blights: nothing heals for four seconds. The answer to Doctors, Reliquaries, Countesses and Flagellants. Cannot reach the air.
- **Headsman:** each blow takes a tenth of the victim's full health. Kills giants; wasted on crowds.

**Tier IV**
- **Belfry Titan:** huge, slow bell-giant whose toll crushes a crowd and hurls it back, breaking every melee line. Cannot reach flyers.
- **Ashen Seraph:** flying armor-piercing area fire that rises once from its own ashes at half health. You must kill it twice.
- **Pale Rider:** fast and enormous, and every foe within 6 swings 35% slower in dread. Halberds and the Headsman are the answer.
- **Hellmouth:** extreme-range bombard whose blast leaves the ground burning for six seconds: area denial and tower-breaking. Helpless up close and against flyers.

### Tables

Reach and speed are in lane units and lane units per second (the lane is 480 long and 24 deep). "Hits air" says whether the unit's attack can strike flying units. Units marked ×2 or ×3 muster that many soldiers per wave from one chantry.

### Tier I

Each study costs 90 gold and takes 12 s; the first three units are known from the start.

| Key | Unit | Cost | Health | Armor | Attack | Reach | Speed | Hits air | Ability |
|---|---|---:|---:|---:|---|---:|---:|---|---|
| 3 | **Arbalester** (known) | 150 | 80 | 0 | 11 every 1 s (11/s) | 6 | 6 | yes | Skyward Bolts: can shoot flying foes. |
| 4 | **Oathguard** (known) | 200 | 280 | 1 | 9 every 1 s (9/s) | 1.5 | 6 | no | Shield Wall: takes 2 less damage from every ranged attack. |
| 5 | **Pyre Zealot** (known) | 150 | 110 | 0 | 5 every 0.5 s (10/s) | 3 | 6 | no | Immolate: foes it scorches keep burning for 2 damage a second, through any armor. |
| 6 | **Grave Hounds** (×2) | 135 | 112 | 0 | 8 every 0.6 s (13/s) | 1.2 | 8.4 | no | Pack: each kennel looses two hounds every wave. Scent: they sniff out veiled foes within 4, so anyone may strike them. |
| 7 | **Flagellant** | 195 | 215 | 0 | 16 every 1 s (16/s) | 1.5 | 6.4 | no | Frenzy: strikes faster the more it bleeds, up to twice as fast near death. Martyrdom: when it dies, every ally within 3.5 regains 20 health. |
| 8 | **Hexbinder** | 185 | 120 | 0 | 12 every 1.2 s (10/s) | 7 | 6 | yes | Leaden Curse: foes she hits move and attack 45% slower for 2 seconds. Can curse flying foes. |
| 9 | **Halberdier** | 175 | 200 | 1 | 14 every 1.1 s (13/s) | 2 | 6 | no | Set Spears: three times its damage to swift foes (hounds, cavalry, Shades, the Countess), and a charge does it no extra harm. |
| 0 | **Crypt Bats** (flies) (×3) | 125 | 12 | 0 | 6 every 0.75 s (8/s) | 1.2 | 6.8 | no | Roost: each belfry looses three bats every wave. They fly, so only foes that strike the air can harm them; they bite only walkers. |

### Tier II

Opened by the Second Rite (400 gold, 30 s). Each study costs 150 gold and takes 18 s.

| Key | Unit | Cost | Health | Armor | Attack | Reach | Speed | Hits air | Ability |
|---|---|---:|---:|---:|---|---:|---:|---|---|
| 3 | **Plague Doctor** | 105 | 125 | 0 | mends 16/s | 5 | 6 | – | Mend: restores 16 health a second to the nearest wounded ally, on foot or on the wing. |
| 4 | **Dreadknight** | 360 | 350 | 2 | 20 every 1 s (20/s) | 2.5 | 6.8 | no | Lance Charge: its first strike against each new foe deals triple damage. |
| 5 | **Gargoyle** (flies) | 390 | 270 | 1 | 17 every 1 s (17/s) | 1.5 | 6.4 | yes | Flight: only foes that can strike the air may harm it. Claws flyers and walkers alike. Stone Skin: it cannot be slowed, set burning or hurled back. |
| 6 | **Witch Hunter** | 310 | 160 | 0 | 26 every 1.5 s (17/s) | 8 | 6 | yes | Silver Shot: two and a half times its damage to flying foes. Lantern: reveals veiled foes within 11. |
| 7 | **Iron Penitent** | 415 | 480 | 2 | 23 every 1.2 s (19/s) | 1.5 | 5.6 | no | Sunder: every blow strips 1 armor from its victim, up to 4. |
| 8 | **Necromancer** | 440 | 165 | 0 | 16 every 1.2 s (13/s) | 7 | 6 | no | Raise Dead: when anyone on foot dies within 10, a Skeleton rises to fight for the Necromancer (once every 3 seconds). Its bolts cannot reach the air. |
| 9 | **Trebuchet** | 465 | 180 | 1 | 32 every 3 s (11/s) | 13 | 4.4 | no | Siege Stones: half again as much damage to towers and the cathedral, from beyond their reach. Cannot hit foes nearer than 4 or in the air. |
| 0 | **Shade** | 535 | 265 | 0 | 33 every 0.8 s (41/s) | 1.5 | 7.2 | no | Veil: cannot be targeted from farther than 2 unless revealed. Ghost Blades: ignore armor. |

### Tier III

Opened by the Third Rite (800 gold, 45 s). Each study costs 260 gold and takes 25 s.

| Key | Unit | Cost | Health | Armor | Attack | Reach | Speed | Hits air | Ability |
|---|---|---:|---:|---:|---|---:|---:|---|---|
| 3 | **Bone Colossus** | 950 | 900 | 2 | 30 every 1.5 s (20/s) | 2.5 | 4.8 | no | Cleave: hits every foe around its target. Ossuary: collapses into four Skeletons when slain. |
| 4 | **Ash Wyrm** (flies) | 1210 | 700 | 1 | 12 every 0.5 s (24/s) | 5 | 6 | yes | Searing Breath: +25% damage for each consecutive hit on the same foe, up to +200%. Flies. |
| 5 | **Tempest Cantor** | 780 | 200 | 0 | 33 every 1.5 s (22/s) | 8 | 6 | yes | Chain Lightning: each strike leaps to 4 more foes within 4, losing a quarter of its force per leap. Strikes the air too. |
| 6 | **Reliquary** | 265 | 520 | 2 | none | 5 | 5.6 | – | Sanctuary: allies within 7 gain 3 armor and regain 15 health a second. Does not fight. |
| 7 | **Crimson Countess** | 950 | 950 | 1 | 30 every 0.8 s (38/s) | 1.5 | 6.8 | no | Blood Feast: heals for two fifths of the damage she deals. Bloodlust: each foe she helps slay quickens her blade by 12%, up to five. |
| 8 | **Impaler** | 525 | 210 | 1 | 34 every 2.5 s (14/s) | 12 | 4.8 | no | Impale: skewers every walker in a line 14 long, at double damage against heavy armor (2 or more). Cannot hit the air. |
| 9 | **Pale Lich** | 675 | 200 | 0 | 18 every 1.5 s (12/s) | 8 | 6 | no | Grave Blight: bursts in an area through any armor; those caught cannot be healed by anything for 4 seconds. Cannot reach the air. |
| 0 | **Headsman** | 825 | 850 | 2 | 44 every 1.4 s (31/s) | 1.8 | 6 | no | Execute: every blow deals bonus damage equal to 10% of its victim's full health. |

### Tier IV

Opened by the Fourth Rite (1500 gold, 60 s). Only the Undertaker can raise these. Each study costs 450 gold and takes 35 s.

| Key | Unit | Cost | Health | Armor | Attack | Reach | Speed | Hits air | Ability |
|---|---|---:|---:|---:|---|---:|---:|---|---|
| 3 | **Belfry Titan** | 2000 | 2300 | 3 | 55 every 1.8 s (31/s) | 2.8 | 4.4 | no | Death Knell: each toll crushes every foe around its target and hurls them 3 back, scattering any line that stands before it. |
| 4 | **Ashen Seraph** (flies) | 2400 | 950 | 2 | 36 every 1 s (36/s) | 7 | 6 | yes | Cinder Lance: bursts in an area through armor, on ground and air. From the Ashes: the first time it falls, it rises again at half health. |
| 5 | **Pale Rider** | 1900 | 1600 | 2 | 64 every 0.9 s (71/s) | 2.5 | 7.6 | no | Dread: every foe within 6 of it attacks 35% slower, towers excepted. |
| 6 | **Hellmouth** | 1950 | 520 | 2 | 85 every 3.5 s (24/s) | 15 | 4 | no | Brimstone: a huge blast that leaves the ground burning for 6 seconds; walkers in the fire take 8 a second through armor. Double damage to towers and the cathedral. Cannot hit foes nearer than 5 or in the air. |

### Mercenaries

| Key | Band | Hire | Soldiers | Health | Armor | Attack | Reach | Hits air | Notes |
|---|---|---:|---:|---:|---:|---|---:|---|---|
| 3 | **Gallowglass** | 90 | 2 | 300 | 2 | 20 every 1 s (20/s) | 1.6 | no | Two mailed axemen from across the sea. They hold a line for as long as they are paid to. |
| 4 | **Free Marksmen** | 100 | 3 | 110 | 0 | 18 every 1.2 s (15/s) | 7 | yes | Three poachers with long guns. They shoot whatever walks or flies. |
| 5 | **Fire-Eater** | 110 | 1 | 280 | 0 | 9 every 0.5 s (18/s) in an area | 3.5 | no | A carnival fire-breather gone to war. A swarm is only kindling. |
| 6 | **Shackled Ogre** | 210 | 1 | 1400 | 1 | 50 every 1.5 s (33/s) in an area | 2.5 | no | Bought from a debtor's pit, still dragging its chains. It flattens whatever stands closest. |

### Not buildable

- **Skeleton:** 90 health, 10 damage a second, melee. Raised by a Necromancer or left by a fallen Bone Colossus. Crumbles after 40 seconds. Skeletons are not worth anything to a Necromancer when they die (they cannot be raised again).
- **Guard Tower:** 2,400 health, armor 2, 24 damage every 0.6 s, reach 9. Strikes ground and air. Two on each home shrine, per lane.
- **Cathedral Bastion:** 3,600 health, armor 3, 26 damage every 0.6 s, reach 10. Strikes ground and air. Two at the front of each building ground, per lane: the cathedral's last wall. Eight Dreadknights that break a plain tower pair in under a minute die against a bastion pair; see [GAME_DESIGN.md](GAME_DESIGN.md).

## Tier IV and mercenaries

Tier IV is the top of the roster: four units, each several times the price of a tier III unit, and only the Undertaker can raise them. They are meant to be the strongest things on the lane, each does something no lower unit does, and each still has an answer: the Belfry Titan cannot reach flyers and is executed like any giant; the Pale Rider is swift, so halberds bite it deep; the Ashen Seraph is a flyer and dies (twice) to massed silver shot; the Hellmouth cannot shoot up or close.

Mercenaries are not built. The Undertaker pays once, the band appears in front of the base towers, and it leaves at the middle of the lane. A chantry of a comparable unit costs three to five times as much but musters every wave for the rest of the match, so mercenaries are worth it only to survive a push or to take the middle shrine at a moment that matters. Their dead can be raised by Necromancers like anyone else's.

## Abilities

Every ability is automatic: units use them on their own, and the autopilot uses them exactly as well as a player does. Each ability is a data field on `UnitDef` that `sim.ts` reads generically, so a new unit can combine existing abilities without new rules.

| Ability (field) | Units | Rule |
|---|---|---|
| Flight (`flying`) | Crypt Bats, Gargoyle, Ash Wyrm, Ashen Seraph | Can only be attacked by units that hit air. Ignores the ground melee in front of it, and is ignored by it. Does not hold shrines, is never hurled back and does not burn on the ground. |
| Anti-air (`air`) | see tables | The attack can target flying units. Area, line and chain attacks only hurt flyers if the attacker has this. Melee walkers, the Necromancer, the Pale Lich, the Impaler and the war engines do not have it. |
| Pack, Roost (`count`) | Grave Hounds (2), Crypt Bats (3) | One chantry musters several units per wave. |
| Shield Wall (`ward`) | Oathguard | Takes 2 less damage from every attack made from farther than melee reach (3). Stacks with armor. |
| Immolate (`dot`) | Pyre Zealot | Each foe hit burns for 2 damage a second for 2 s. Burning ignores armor. Re-applying refreshes it. |
| Leaden Curse (`slow`) | Hexbinder | Foes hit move slower and attack slower for a few seconds. The strongest slow applies; it does not stack. |
| Frenzy (`frenzy`) | Flagellant | The time between its attacks shrinks in proportion to missing health, down to half at the point of death. |
| Martyrdom (`martyr`) | Flagellant | When it dies, every ally within 3.5 regains 20 health (not the blighted, not towers). |
| Lance Charge (`charge`) | Dreadknight | The first hit against each new target deals triple damage, unless the target is braced. |
| Set Spears (`bonus.swift`, `brace`) | Halberdier | Three times damage to any unit with a base speed of 6.8 or more (`RULES.swiftSpeed`): Hounds, Dreadknight, Shade, Countess, Pale Rider. A charge does a braced unit no extra harm. |
| Sunder (`sunder`) | Iron Penitent | Each hit permanently removes 1 armor from the target, down to 4 below its normal armor (never below zero). Works on towers. |
| Ghost Blades, Grave Blight, Cinder Lance (`pierce`) | Shade, Pale Lich, Ashen Seraph | The attack ignores armor (but not Shield Wall). |
| Veil (`veil`) | Shade | Cannot be targeted from farther than 2 unless revealed. Area attacks aimed at something else still hurt it. |
| Lantern, Scent (`reveal`) | Witch Hunter (11), Grave Hounds (4) | Enemy veiled units within that distance can be targeted by everyone as usual. |
| Silver Shot, Impale, Siege Stones (`bonus`) | Witch Hunter, Impaler, Trebuchet, Hellmouth | Extra damage against one kind of target: flyers (Witch Hunter: two and a half times), heavy armor of 2 or more (Impaler: double) or towers and the cathedral (Trebuchet half again, Hellmouth double). |
| Minimum range (`minRange`) | Trebuchet, Hellmouth | Cannot attack anything nearer than 4 (5). With enemies inside that distance and nothing else to shoot, it holds still. |
| Raise Dead (`raise`) | Necromancer | When a unit on foot (not a Skeleton, not a flyer, not a tower) dies within 10 of a Necromancer whose ability is ready, a Skeleton rises for the Necromancer's side. Ready again after 3 s. If several Necromancers could claim a corpse, the nearest does. |
| Cleave (`splash`) | Pyre Zealot, Trebuchet, Bone Colossus, Pale Lich, Belfry Titan, Ashen Seraph, Hellmouth | The attack hits every enemy within a radius of the target. |
| Ossuary (`spawnOnDeath`) | Bone Colossus | Leaves four Skeletons when it dies. |
| Searing Breath (`ramp`) | Ash Wyrm | Each consecutive hit on the same target deals 25% more than the last, up to +200% after eight hits. Changing target resets it. |
| Chain Lightning (`chain`) | Tempest Cantor | After the target, the bolt leaps to the nearest unstruck enemy within 4, up to four times, losing a quarter of its damage each leap. |
| Sanctuary (`aura`) | Reliquary | Allies within 7 (not itself, not towers) have 3 more armor and regain 15 health a second. Several Reliquaries do not stack. |
| Blood Feast (`leech`) | Crimson Countess | Heals herself for two fifths of the damage she deals, unless blighted. |
| Bloodlust (`bloodlust`) | Crimson Countess | Every foe she struck on the tick it died counts as her kill; each kill shortens the time between her blows by 12%, up to five kills, for the rest of her life. |
| Impale (`line`) | Impaler | The stake hits every enemy within 0.9 of a line 14 long, starting at the Impaler and passing through its target. |
| Grave Blight (`blight`) | Pale Lich | Every foe hit cannot be healed by anything (Mend, Sanctuary, Blood Feast, Martyrdom) for 4 s. |
| Execute (`maim`) | Headsman | Each hit deals extra damage equal to 10% of the target's full health. Not against towers or the cathedral. |
| Mend (`heal`) | Plague Doctor | Heals the nearest wounded ally in reach that is not blighted; stays behind the fighting. |
| Stone Skin (`steadfast`) | Gargoyle | Cannot be slowed, set burning, or hurled back. |
| Death Knell (`knock`) | Belfry Titan | Every walker struck is hurled 3 back toward its own end of the lane (not towers, flyers or Stone Skin). Melee foes must walk back in; ranged foes lose little. |
| Dread (`dread`) | Pale Rider | Every enemy soldier within 6 (not towers) takes 35% longer between attacks, mends included. |
| From the Ashes (`undying`) | Ashen Seraph | The first blow that would kill it leaves it at half health instead, with burns, curses and blight cleared. Once per life. |
| Brimstone (`field`) | Hellmouth | Each blast leaves burning ground of radius 3.5 for 6 s; enemy walkers standing in it take 8 a second through armor (not flyers or Stone Skin). |

## Who beats what

The roster is built around the counter system of the original: no unit is good against everything, and the answer to a unit is usually cheaper than the unit. The relationships below are checked by `packages/sim/src/balance.test.ts`.

| If the enemy builds | Answer with | Why |
|---|---|---|
| Massed cheap infantry or Grave Hounds | Pyre Zealot, Bone Colossus, Tempest Cantor, Halberdier (against hounds) | Area damage hits many small units at once; halberds bite deep into anything swift. |
| Arbalesters and other archers | Oathguard, Grave Hounds, Crimson Countess, Shade | Shield Wall blunts every arrow; hounds and Shades reach the archers quickly; every archer the Countess kills makes her faster. |
| Crypt Bats | Hexbinder, Gargoyle, Arbalesters in numbers, towers; a Reliquary | A curse or a tower's shot kills a bat outright, a bolt in two; Gargoyles claw them from the sky; three armor leaves their bites almost harmless. The Witch Hunter's slow silver is wasted on them. |
| Fast units: Hounds, Dreadknight, Shade, Countess, Pale Rider | Halberdier | Set Spears: three times damage to the swift, and a lance charge does it no extra harm. |
| Heavy armor (Dreadknight, Iron Penitent, Headsman, Bone Colossus) | Impaler, Iron Penitent, Shade, Pale Lich, Pyre Zealot | The stake does double through heavy armor and skewers the whole file; Sunder strips armor; ghost blades, blight and fire ignore it. |
| One huge unit (Bone Colossus, Belfry Titan) | Headsman, Hexbinder, flyers | Execute scales with the victim's health; a cursed giant is half a giant; neither can reach the air. |
| The Crimson Countess | Halberdier, Iron Penitent, Headsman, flyers | She is swift, her quick blows glance off heavy armor, Execute bites her large health, and she cannot reach the air. A crowd of light soldiers or curses only feeds her Bloodlust. |
| Healing and sustain (Plague Doctor, Reliquary, Countess, Flagellants) | Pale Lich | Grave Blight: nothing heals for four seconds, not even Martyrdom. |
| Flyers (Gargoyle, Ash Wyrm, Ashen Seraph) | Witch Hunter; Arbalesters and Hexbinders against the Wyrm | Silver shot does two and a half times to flyers; a cursed flyer barely moves, but the Gargoyle's Stone Skin ignores curses, so it needs raw damage. |
| Ground-only casters and engines (Necromancer, Pale Lich, Impaler, Trebuchet, Hellmouth) | Any flyer, Shade, Grave Hounds | None of them can shoot the sky; fast units get inside the engines' reach. |
| Shades | Grave Hounds, a Witch Hunter, any area damage, Halberdier | Scent and lantern let everyone strike them; fire and lightning do not need to see them; halberds bite the swift. |
| Necromancers | Flyers, Tempest Cantor, anything that kills the Necromancer first | Flyers leave no corpses, the Necromancer cannot shoot them, and the Skeletons cannot reach them. |
| The Belfry Titan | Flyers, Headsman, ranged soldiers | It cannot reach the air; Execute takes a tenth of its huge health each blow; the knockback hurts melee lines, not archers. |
| The Pale Rider | Halberdier, Headsman, archers beyond its dread | It is swift; its dread only reaches 6. |
| The Ashen Seraph | Witch Hunters, many of them | Silver shot does two and a half times to wings; the Seraph's fire shreds light archers and curses, and it must be killed twice. |
| Towers and the cathedral | Trebuchet, Hellmouth, Iron Penitent | Engines outrange towers and hit stone harder; Sunder works on towers. |

Flyers deserve a note. They are strong against an army with no anti-air and poor against a prepared one, and they travel alone over the fighting, so they reach the enemy towers (which do shoot upward) before the rest of the army. Fewer units can shoot the sky than before (melee, the Necromancer, the Pale Lich, the Impaler and the engines cannot), and the Crypt Bats bring that question to tier I: an army of halberds and shields with no bow among it has no answer to them.

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
- **Units that stood a hair out of reach.** A unit walking up to a stationary target could stop a fraction of a unit short because of integer rounding, and then never attack. It mostly hurt melee units, and made armies of them look weaker than they are. The bug came back once when the first fix was simplified away, and was found again by `scripts/stall.ts`, which plays whole autopilot matches and reports any soldier that stands idle for 15 seconds: it found hundreds per match. A last step too short to survive rounding is now taken along the longer axis, a test pins it, and costs were re-tuned afterwards. The Crimson Countess, who had only looked weak against archers because she kept stopping short, was given a slower, heavier blade (so she wastes blows on small soldiers) and less leech; the Hexbinder's curse went from 40% to 45% and the Witch Hunter's lantern from 9 to 11.
- **Fast units are worse than they look.** Hounds, cavalry, Shades and flyers outrun their army and meet the enemy alone. They were slowed toward the army's pace and made cheaper.
- **Flyers** won every clash against armies without anti-air but lost most lane matches, because towers shoot upward. They were made much cheaper rather than tougher, to keep them a counter-pick.
- **Support units** are only worth a fraction of an army; the Plague Doctor and the Reliquary were priced for that.
- **The roles pass (giving every unit its own job).** An audit found units doing each other's work: three slows (Hexbinder, Pale Lich, Belfry Titan), two identical anti-air bonuses (Witch Hunter, Impaler), nine area attackers, nearly every ranged unit able to shoot the sky, the Countess and the Headsman as two big melee duelists, and tier IV built from lower units' abilities glued together. Each unit now has one job and a counter: the Lich blights instead of slowing, the Impaler breaks heavy armor instead of wings, the Titan hurls foes back, the Pale Rider radiates dread, the Seraph rises from its ashes, the Hellmouth leaves burning ground, the Countess grows faster with each kill, the Gargoyle has Stone Skin, Flagellants heal as they die and hounds sniff out Shades. The Halberdier (anti-swift) and the Crypt Bats (a tier I flyer) were added, and the Necromancer, the Lich and the Impaler lost anti-air, so flyers are a real question. Ten new rules are each a data field, every one covered by a test, and a mirrored fight using all of them at once stays exactly symmetric.
- **One point of health decides the Crypt Bats.** At 11 health or less an Arbalester's bolt kills a bat outright, and since every lane army carries Arbalesters the bats lost everywhere (−50 on the lane); with much more health they beat even the crossbows. At 12 a bat takes two bolts and dies to one curse or one tower shot: Arbalesters still beat them in the open, Hexbinders and Gargoyles crush them, and on the lane they come out around −20 against armies that are half crossbow, which is fair for a counter-pick.
- **The Impaler is judged behind a line.** Massed alone with nothing in front of it, it loses every open-field duel; behind a shield wall, its job, it beats the Iron Penitent, the Bone Colossus and the Headsman by a wide margin. The "every unit beats something" test counts a siege unit's wins with that escort.
- **Mirrored autopilots never finished.** Two identical armies cancel each other forever. Sudden death now makes both cathedrals crumble, faster for the side holding fewer shrines.

### Where the numbers stand

The costs in the tables above come from the lane tuning pass run after the roles pass (three rounds of `npm run balance:lane`), with a final hand step for the units still more than about 12 points from their target: the Gargoyle, Bone Colossus, Tempest Cantor, Ash Wyrm and Iron Penitent were made a little dearer, the Hexbinder, Plague Doctor and Reliquary a little cheaper, and the Crypt Bats and the Crimson Countess were reshaped (see above) rather than repriced. Before that hand step most tier I to III units scored within about 15 points of even on the lane; the flyers stay somewhat strong for their price there and the support units somewhat weak, as in earlier passes.

In massed equal-gold clashes (`npm run balance`) every tier I to III unit averages between about −50 and +50 against the rest (melee and flyers high, ranged and siege low, the Necromancer lowest), which is the open-field picture; prices follow the lane tuner, where escorts and towers matter, which is priced for fighting behind a line. Every unit, tier IV included, loses clearly to something: the Belfry Titan to flyers and the Headsman, the Pale Rider to the Halberdier and the Headsman, the Ashen Seraph to the Witch Hunter, the Hellmouth to anything fast.

Tier IV and the mercenaries are priced by hand. They have been checked for having counters, not tuned on the lane, and nothing here has been tuned for 2v2 or 3v3. Run the three balance commands for current figures rather than trusting numbers written down here.

Whole-match results between the four AI profiles are a smoke test only: the sim has no randomness, so a set of seeds is a handful of pairings replayed, each decided by an early engagement that snowballs, and the profile win rates swung from one extreme to the other between tuning passes.

### Known limits

- The sim has no randomness, so two autopilots with the same plan play the same match, and two autopilots with the same profile on opposite sides can mirror each other until sudden death decides the match. Variety in the whole-match test comes only from the four AI profiles and the seed's choice between them.
- Lane matches snowball: winning the first engagement often decides the eight minutes. Results for one pairing at one army size are noisy, which is why the tuner averages three sizes and many opponents.
- All of this measures units against the autopilot's armies. It has not been tuned against human play yet. Expect to revisit costs after playtests; the tools make that a short job.
