import { describe, expect, it } from "vitest";
import { addUnit, createGame as newGame, parseCommand, UNIT_RESEARCH, step, towersOf, simpleAI, incomeOf, cellCenter, hqX, INVEST_TIERS, MAP, RESEARCH, RULES, TICK_RATE, UNITS } from "./index";
import type { GameConfig, GameState, TimedCommand } from "./index";

/** Most tests want an empty lane: no guard towers. */
const createGame = (cfg: GameConfig): GameState => { const s = newGame(cfg); s.units = []; return s; };
const ticks = (s: GameState, n: number) => { for (let i = 0; i < n; i++) step(s); };
/** Chantries standing plus those ordered and on their way. */
const planned = (s: GameState) => s.buildings.length + s.keepers.reduce((n, k) => n + k.jobs.length, 0);
/** Long enough for a gravekeeper to walk anywhere on its ground. */
const WALK = 4 * TICK_RATE;
function aiMatch(seed: number, maxTicks: number): GameState {
  const s = newGame({ teamSize: 1, seed, aiSlots: [0, 1] });
  for (let i = 0; i < maxTicks && s.winner === null; i++) {
    const cmds: TimedCommand[] = [];
    for (const p of s.players) for (const cmd of simpleAI(s, p.id)) cmds.push({ player: p.id, cmd });
    step(s, cmds);
  }
  return s;
}
const spawn = (s: GameState, type: string, team: 0 | 1, x: number, y = 12000) => addUnit(s, type, team, team, 0, x, y);

describe("sim", () => {
  it("is deterministic for the same seed", () => {
    expect(JSON.stringify(aiMatch(42, 300 * TICK_RATE))).toBe(JSON.stringify(aiMatch(42, 300 * TICK_RATE)));
  });

  it("building costs credits and produces one unit per wave at the building's cell", () => {
    const s = createGame({ teamSize: 1, seed: 1 });
    step(s, [{ player: 0, cmd: { type: "build", keeper: 0, unit: "arbalester", col: 2, row: 3 } }]);
    expect(s.players[0]!.credits).toBe(RULES.startCredits - UNITS.arbalester!.cost);
    ticks(s, RULES.waveIntervalTicks - 2);
    expect(s.units.length).toBe(0);
    ticks(s, 1);
    expect(s.units.length).toBe(1);
    expect(s.units[0]).toMatchObject({ team: 0, type: "arbalester", ...cellCenter(0, 2, 3) });
    ticks(s, RULES.waveIntervalTicks);
    expect(s.units.length).toBe(2);
  });

  it("rejects invalid builds: occupied cell, out of zone, locked tier, unaffordable", () => {
    const s = createGame({ teamSize: 1, seed: 1 });
    step(s, [
      { player: 0, cmd: { type: "build", keeper: 0, unit: "arbalester", col: 0, row: 0 } },
      { player: 0, cmd: { type: "build", keeper: 0, unit: "arbalester", col: 0, row: 0 } },
      { player: 0, cmd: { type: "build", keeper: 0, unit: "arbalester", col: 1, row: 1 } },             // overlaps the first
      { player: 0, cmd: { type: "build", keeper: 0, unit: "arbalester", col: MAP.zoneCols - 1, row: 0 } }, // hangs out of the zone
      { player: 0, cmd: { type: "build", keeper: 0, unit: "doctor", col: 4, row: 0 } },
      { player: 0, cmd: { type: "build", keeper: 0, unit: "tower", col: 6, row: 0 } },
    ]);
    expect(planned(s)).toBe(1);
    step(s, [{ player: 0, cmd: { type: "build", keeper: 0, unit: "oathguard", col: 1, row: 2 } }, { player: 0, cmd: { type: "build", keeper: 0, unit: "oathguard", col: 3, row: 3 } }]);
    expect(planned(s)).toBe(2); // third is unaffordable
    ticks(s, WALK);
    expect(s.buildings.length).toBe(2);
  });

  it("refunds 75% before the first wave and 25% after", () => {
    const s = createGame({ teamSize: 1, seed: 1 });
    s.players[0]!.credits = 1000;
    step(s, [{ player: 0, cmd: { type: "build", keeper: 0, unit: "oathguard", col: 0, row: 0 } }, { player: 0, cmd: { type: "build", keeper: 0, unit: "oathguard", col: 0, row: 2 } }]);
    ticks(s, WALK);
    const [a, b] = s.buildings;
    const before = s.players[0]!.credits;
    step(s, [{ player: 0, cmd: { type: "sell", buildingId: a!.id } }, { player: 1, cmd: { type: "sell", buildingId: b!.id } }]);
    expect(s.players[0]!.credits).toBe(before + Math.floor(UNITS.oathguard!.cost * 0.75));
    expect(s.buildings.length).toBe(1); // the enemy cannot sell ours
    ticks(s, RULES.waveIntervalTicks);
    const mid = s.players[0]!.credits;
    step(s, [{ player: 0, cmd: { type: "sell", buildingId: b!.id } }]);
    expect(s.players[0]!.credits).toBe(mid + Math.floor(UNITS.oathguard!.cost * 0.25));
  });

  it("units capture beacons and beacons plus investment raise income", () => {
    const s = createGame({ teamSize: 1, seed: 1 });
    s.beacons[0]!.owner = null;
    expect(incomeOf(s, 0)).toBe(RULES.baseIncome);
    spawn(s, "oathguard", 0, MAP.beaconX[0]!);
    step(s);
    expect(s.beacons[0]!.owner).toBe(0);
    expect(incomeOf(s, 0)).toBe(RULES.baseIncome + RULES.beaconIncome);
    step(s, [{ player: 0, cmd: { type: "invest" } }]);
    expect(s.players[0]!.credits).toBe(RULES.startCredits - INVEST_TIERS[0]!.cost);
    expect(incomeOf(s, 0)).toBe(RULES.baseIncome + RULES.beaconIncome + INVEST_TIERS[0]!.bonus);
    expect(incomeOf(s, 1)).toBe(RULES.baseIncome + RULES.beaconIncome); // its home shrine
    const before = s.players[0]!.credits;
    ticks(s, RULES.incomeIntervalTicks);
    expect(s.players[0]!.credits).toBe(before + incomeOf(s, 0));
  });

  it("a contested beacon does not flip", () => {
    const s = createGame({ teamSize: 1, seed: 1 });
    s.beacons[1]!.owner = 1;
    spawn(s, "oathguard", 0, MAP.beaconX[1]! - 4000, 2000);
    spawn(s, "oathguard", 1, MAP.beaconX[1]! + 4000, 22000);
    step(s);
    expect(s.beacons[1]!.owner).toBe(1);
  });

  it("a rite opens a tier; each unit beyond the first three needs its own study, one research at a time", () => {
    const s = createGame({ teamSize: 1, seed: 1 });
    const p = s.players[0]!;
    p.credits = 5000;
    expect(p.unlocked).toEqual(["arbalester", "oathguard", "zealot"]);
    step(s, [{ player: 0, cmd: { type: "build", keeper: 0, unit: "hound", col: 0, row: 0 } },      // tier 1, but not studied
      { player: 0, cmd: { type: "research", unit: "doctor" } },                            // tier 2 is not open
      { player: 0, cmd: { type: "research", unit: "tower" } }, { player: 0, cmd: { type: "research", unit: "skeleton" } },
      { player: 0, cmd: { type: "research", unit: "oathguard" } }]);                       // already known
    expect([planned(s), p.research, p.credits]).toEqual([0, null, 5000]);
    step(s, [{ player: 0, cmd: { type: "research", unit: "hound" } }, { player: 0, cmd: { type: "research" } }]); // the second must wait
    expect(p.credits).toBe(5000 - UNIT_RESEARCH[1]!.cost);
    ticks(s, UNIT_RESEARCH[1]!.ticks - 2);
    expect(p.unlocked).not.toContain("hound");
    ticks(s, 1);
    expect(p.unlocked).toContain("hound");
    step(s, [{ player: 0, cmd: { type: "build", keeper: 0, unit: "hound", col: 0, row: 0 } }, { player: 0, cmd: { type: "research" } }]);
    expect(planned(s)).toBe(1);
    ticks(s, RESEARCH[2]!.ticks);
    expect(p.tier).toBe(2);
    step(s, [{ player: 0, cmd: { type: "build", keeper: 0, unit: "doctor", col: 4, row: 0 } }]);     // open tier, unstudied unit
    expect(planned(s)).toBe(1);
    step(s, [{ player: 0, cmd: { type: "research", unit: "doctor" } }]);
    ticks(s, UNIT_RESEARCH[2]!.ticks);
    step(s, [{ player: 0, cmd: { type: "build", keeper: 0, unit: "doctor", col: 4, row: 0 } }, { player: 0, cmd: { type: "research", unit: "colossus" } }]);
    expect(planned(s)).toBe(2);
    expect(p.research).toBeNull();                                                         // tier 3 is not open
    step(s, [{ player: 0, cmd: { type: "research" } }]);
    ticks(s, RESEARCH[3]!.ticks);
    expect(p.tier).toBe(3);
    step(s, [{ player: 0, cmd: { type: "research" } }]);
    ticks(s, RESEARCH[4]!.ticks);
    expect(p.tier).toBe(4);
    step(s, [{ player: 0, cmd: { type: "research" } }]);
    expect(p.research).toBeNull();                                                         // there is no fifth tier
  });

  it("units fight; armor reduces damage; doctors heal", () => {
    const s = createGame({ teamSize: 1, seed: 1 });
    spawn(s, "arbalester", 0, 100000);
    spawn(s, "dreadknight", 1, 102000);
    step(s);
    expect(s.units[1]!.hp).toBe(UNITS.dreadknight!.hp - (UNITS.arbalester!.damage - UNITS.dreadknight!.armor));
    const lance = Math.trunc((UNITS.dreadknight!.damage * UNITS.dreadknight!.charge!) / 100);
    expect(s.units[0]!.hp).toBe(UNITS.arbalester!.hp - lance);
    spawn(s, "doctor", 0, 98000);
    step(s);
    expect(s.units[0]!.hp).toBe(UNITS.arbalester!.hp - lance + UNITS.doctor!.heal);
  });

  it("splash hits every enemy in the radius", () => {
    const s = createGame({ teamSize: 1, seed: 1 });
    spawn(s, "trebuchet", 0, 100000);
    spawn(s, "oathguard", 1, 112000, 12000);
    spawn(s, "oathguard", 1, 113000, 13000);
    step(s);
    expect(s.units.filter(u => u.team === 1).every(u => u.hp < UNITS.oathguard!.hp)).toBe(true);
  });

  it("each side starts with its home shrine and two towers; the shrine only falls after both towers", () => {
    const s = newGame({ teamSize: 1, seed: 1 });
    expect(s.beacons.map(b => b.owner)).toEqual([0, null, 1]);
    expect([towersOf(s, 0), towersOf(s, 1)]).toEqual([4, 4]); // two on the home shrine, two at the base
    const home = MAP.beaconX[2]!;
    const homeTowers = (g: GameState, team: 0 | 1) => g.units.filter(u => u.type === "tower" && u.team === team && Math.abs(u.x - home) < MAP.captureRadius).length;
    for (let i = 0; i < 14; i++) spawn(s, "dreadknight", 0, home - 20000, 2000 + i * 1500);
    let seenOneTower = false;
    for (let i = 0; i < 120 * TICK_RATE && homeTowers(s, 1) > 0; i++) {
      step(s);
      if (homeTowers(s, 1) === 1) seenOneTower = true;
      if (homeTowers(s, 1) > 0) expect(s.beacons[2]!.owner).toBe(1);
    }
    expect(seenOneTower).toBe(true);
    expect(homeTowers(s, 1)).toBe(0);
    expect(s.units.filter(u => u.team === 0 && u.type !== "tower").length).toBeLessThan(14); // towers fought back
    ticks(s, 5 * TICK_RATE);
    expect(s.beacons[2]!.owner).toBe(0);
  });

  it("an army must bring down the base towers before it reaches the cathedral", () => {
    const s = newGame({ teamSize: 1, seed: 1 });
    const baseTowers = () => s.units.filter(u => u.type === "tower" && u.team === 1 && u.x > MAP.beaconX[2]! + MAP.captureRadius).length;
    expect(baseTowers()).toBe(2);
    for (let i = 0; i < 16; i++) spawn(s, "dreadknight", 0, MAP.beaconX[2]! + 20000, 1500 + i * 1400);
    for (let i = 0; i < 180 * TICK_RATE && s.teams[1].hqHp === RULES.hqHp; i++) step(s);
    expect(s.teams[1].hqHp).toBeLessThan(RULES.hqHp);
    expect(baseTowers()).toBe(0);
  });

  it("destroying the headquarters wins the match", () => {
    const s = createGame({ teamSize: 1, seed: 1 });
    for (let i = 0; i < 30; i++) spawn(s, "dreadknight", 0, hqX(1) - 9000, 1000 + i * 700);
    for (let i = 0; i < 60 * TICK_RATE && s.winner === null; i++) step(s);
    expect(s.teams[1].hqHp).toBe(0);
    expect(s.winner).toBe(0);
  });

  it("in sudden death the cathedrals crumble, faster for the side holding fewer shrines, so a deadlock still ends", () => {
    const s = createGame({ teamSize: 1, seed: 1 });
    s.tick = RULES.overtimeTick;
    s.beacons[1]!.owner = 0; // team 0 holds two shrines, team 1 one
    ticks(s, 10 * TICK_RATE);
    expect(RULES.hqHp - s.teams[0].hqHp).toBe(10 * RULES.overtimeDecay * 2);
    expect(RULES.hqHp - s.teams[1].hqHp).toBe(10 * RULES.overtimeDecay * 3);
    for (let i = 0; i < 20 * 60 * TICK_RATE && s.winner === null; i++) step(s);
    expect(s.winner).toBe(0);
  });

  it("gravekeepers walk to the spot and raise the chantry at once; orders queue, and walking away refunds them", () => {
    const s = createGame({ teamSize: 1, seed: 1 });
    const k = s.keepers.find(q => q.owner === 0 && q.slot === 0)!, start = { x: k.x, y: k.y };
    step(s, [{ player: 0, cmd: { type: "build", keeper: 0, unit: "arbalester", col: 20, row: 20 } },
      { player: 0, cmd: { type: "build", keeper: 0, unit: "arbalester", col: 20, row: 20 } },   // that ground is already promised
      { player: 0, cmd: { type: "build", keeper: 1, unit: "arbalester", col: 21, row: 21 } },   // ...also to the other keeper
      { player: 0, cmd: { type: "build", keeper: 0, unit: "oathguard", col: 0, row: 0 } },
      { player: 1, cmd: { type: "build", keeper: 0, unit: "arbalester", col: 20, row: 20 } }]); // the enemy has its own ground
    expect(k.jobs.length).toBe(2);
    expect(s.players[0]!.credits).toBe(RULES.startCredits - UNITS.arbalester!.cost - UNITS.oathguard!.cost);
    expect(s.buildings.length).toBe(0);                     // nobody is there yet
    let arrived = 0;
    while (s.buildings.filter(b => b.owner === 0).length === 0) { step(s); arrived++; }
    expect(arrived).toBeGreaterThan(10);                    // it had to walk
    expect(s.buildings.find(b => b.owner === 0)).toMatchObject({ unit: "arbalester", col: 20, row: 20, readyTick: s.tick - 1 });
    expect(Math.hypot(k.x - start.x, k.y - start.y)).toBeGreaterThan(10000);
    step(s, [{ player: 0, cmd: { type: "move", keeper: 0, x: 0, y: 12000 } }]); // off the ground: it stops at the edge, and the oathguard order is dropped
    expect(k.jobs.length).toBe(0);
    expect(s.players[0]!.credits).toBe(RULES.startCredits - UNITS.arbalester!.cost);
    ticks(s, WALK * 2);
    expect([k.x, k.y]).toEqual([MAP.zoneStart, 12000]);
    expect(s.buildings.filter(b => b.owner === 0).length).toBe(1);
    ticks(s, RULES.waveIntervalTicks);
    expect(s.units.filter(u => u.type === "arbalester" && u.team === 0).length).toBe(1); // it musters from the very next wave
  });

  it("only the Undertaker raises tier IV and hires mercenaries, who fight to the middle of the lane and leave", () => {
    const s = createGame({ teamSize: 1, seed: 1 });
    const p = s.players[0]!;
    p.credits = 10000; p.tier = 4; p.unlocked.push("titan");
    step(s, [{ player: 0, cmd: { type: "build", keeper: 0, unit: "titan", col: 4, row: 4 } }]);
    expect(planned(s)).toBe(0);
    step(s, [{ player: 0, cmd: { type: "build", keeper: 1, unit: "titan", col: 4, row: 4 } },
      { player: 0, cmd: { type: "build", keeper: 1, unit: "gallowglass", col: 8, row: 8 } }, // mercenaries are hired, not built
      { player: 0, cmd: { type: "hire", unit: "gallowglass" } }, { player: 0, cmd: { type: "hire", unit: "ogre" } }, // one hiring at a time
      { player: 0, cmd: { type: "hire", unit: "arbalester" } }]);
    expect(planned(s)).toBe(1);
    expect(p.credits).toBe(10000 - UNITS.titan!.cost - UNITS.gallowglass!.cost);
    const band = s.units.filter(u => u.type === "gallowglass");
    expect(band.length).toBe(UNITS.gallowglass!.count);
    expect(band.every(u => u.team === 0 && u.x > MAP.zoneStart + MAP.zoneCols * MAP.cell)).toBe(true); // in front of the building ground
    spawn(s, "arbalester", 1, 150000);
    const foe = s.units[s.units.length - 1]!;
    let leftAt = -1;
    for (let i = 0; i < 90 * TICK_RATE && leftAt < 0; i++) { step(s); if (s.events.some(e => e.t === "leave")) leftAt = s.tick; }
    expect(s.units).not.toContain(foe);                    // they cut down what stood in their way
    expect(leftAt).toBeGreaterThan(0);
    expect(s.units.some(u => u.type === "gallowglass")).toBe(false);
    step(s, [{ player: 0, cmd: { type: "hire", unit: "ogre" } }]);
    expect(s.units.filter(u => u.type === "ogre").length).toBe(1);
  });

  it("team games: a lane per player, a tripled cathedral, keepers who cross lanes, and the Sexton's teleport", () => {
    const s = newGame({ teamSize: 3, seed: 1, aiSlots: [1, 2, 3, 4, 5] });
    expect([s.laneCount, s.players.length, s.beacons.length, s.keepers.length]).toEqual([3, 6, 9, 12]);
    expect(s.players.map(p => [p.team, p.lane])).toEqual([[0, 0], [0, 1], [0, 2], [1, 0], [1, 1], [1, 2]]);
    expect(s.teams[0].hqHp).toBe(3 * RULES.hqHp);
    expect(s.units.filter(u => u.type === "tower").length).toBe(24);
    const sexton = s.keepers.find(k => k.owner === 0 && k.slot === 0)!, undertaker = s.keepers.find(k => k.owner === 0 && k.slot === 1)!;
    // build in an ally's lane: without his teleport the Sexton has to walk across the middle lane to get there
    step(s, [{ player: 0, cmd: { type: "build", keeper: 0, unit: "arbalester", col: 10, row: 10, lane: 2 } },
      { player: 0, cmd: { type: "build", keeper: 1, unit: "arbalester", col: 14, row: 10, lane: 2 } }, // the Undertaker raises tier IV only
      { player: 0, cmd: { type: "teleport", keeper: 1, x: 30000, y: 12000, lane: 2 } }]); // only the Sexton can
    expect(undertaker.lane).toBe(0);
    let walked = 0;
    while (!s.buildings.some(b => b.owner === 0)) { step(s); walked++; }
    expect(s.buildings.find(b => b.owner === 0)).toMatchObject({ lane: 2, col: 10, row: 10, team: 0 });
    expect([sexton.lane, undertaker.lane, undertaker.jobs.length]).toEqual([2, 0, 0]);
    expect(walked).toBeGreaterThan(3 * TICK_RATE);
    // the Sexton is there at once, wherever he is sent on his side's ground, as often as he is sent
    step(s, [{ player: 0, cmd: { type: "teleport", keeper: 0, x: 400000, y: 5000, lane: 1 } }]);
    expect([sexton.lane, sexton.x, sexton.y]).toEqual([1, MAP.zoneStart + MAP.zoneCols * MAP.cell, 5000]); // clamped to his own ground
    expect(s.events.some(e => e.t === "teleport")).toBe(true);
    step(s, [{ player: 0, cmd: { type: "teleport", keeper: 0, x: 30000, y: 5000, lane: 0 } }]);
    expect(sexton.lane).toBe(0);
    step(s, [{ player: 0, cmd: { type: "teleport", keeper: 0, x: 30000, y: 5000, lane: 2 } }]);
    expect(sexton.lane).toBe(2);
    // the chantry in the ally's lane musters there
    ticks(s, RULES.waveIntervalTicks);
    expect(s.units.some(u => u.type === "arbalester" && u.owner === 0 && u.lane === 2)).toBe(true);
  });

  it("a 3v3 of autopilots plays to a finish", () => {
    const s = newGame({ teamSize: 3, seed: 5, aiSlots: [0, 1, 2, 3, 4, 5] });
    for (let i = 0; i < 45 * 60 * TICK_RATE && s.winner === null; i++) {
      const cmds: TimedCommand[] = [];
      for (const p of s.players) for (const cmd of simpleAI(s, p.id)) cmds.push({ player: p.id, cmd });
      step(s, cmds);
    }
    expect(s.winner).not.toBeNull();
    expect(new Set(s.buildings.map(b => b.lane)).size).toBe(3);
  });

  it("parseCommand accepts only well-formed commands and drops unknown fields", () => {
    expect(parseCommand({ type: "build", keeper: 1, unit: "arbalester", col: 2, row: 4, credits: 9999 })).toEqual({ type: "build", keeper: 1, unit: "arbalester", col: 2, row: 4 });
    expect(parseCommand({ type: "move", keeper: 0, x: 30000, y: 12000, speed: 9 })).toEqual({ type: "move", keeper: 0, x: 30000, y: 12000 });
    expect(parseCommand({ type: "hire", unit: "ogre" })).toEqual({ type: "hire", unit: "ogre" });
    expect(parseCommand({ type: "teleport", keeper: 0, x: 1, y: 2, lane: 1 })).toEqual({ type: "teleport", keeper: 0, x: 1, y: 2, lane: 1 });
    expect(parseCommand({ type: "invest", lane: 0 })).toEqual({ type: "invest", lane: 0 });
    expect(parseCommand({ type: "research", unit: "hound", tier: 3 })).toEqual({ type: "research", unit: "hound" });
    expect(parseCommand({ type: "research" })).toEqual({ type: "research" });
    for (const bad of [null, 5, "build", {}, { type: "win" }, { type: "build", keeper: 0, unit: "__proto__", col: 0, row: 0 }, { type: "build", keeper: 0, unit: "arbalester", col: "0", row: 0 },
      { type: "build", keeper: 0, unit: "arbalester", col: 0.5, row: 0 }, { type: "build", unit: "arbalester", col: 0, row: 0 }, { type: "build", keeper: 2, unit: "arbalester", col: 0, row: 0 },
      { type: "move", keeper: 0, x: 1.5, y: 0 }, { type: "move", keeper: "0", x: 1, y: 0 }, { type: "hire", unit: "hasOwnProperty" }, { type: "hire" }, { type: "sell", buildingId: "1" }, { type: "research", unit: "toString" }, { type: "research", unit: 3 }, { type: "invest", lane: "length" }])
      expect(parseCommand(bad)).toBeNull();
    const s = createGame({ teamSize: 1, seed: 1 });
    step(s, [{ player: 0, cmd: { type: "invest", lane: "length" as unknown as number } }, { player: 0, cmd: { type: "build", keeper: 0, unit: "constructor", col: 0, row: 0 } },
      { player: 0, cmd: { type: "build", keeper: 7 as 0, unit: "arbalester", col: 0, row: 0 } }, { player: 0, cmd: { type: "move", keeper: 0, x: 0, y: 0, lane: 9 } }]);
    expect(s.players[0]!.credits).toBe(RULES.startCredits);
    expect(s.players[0]!.invest).toEqual([0]);
  });

  it("AI-vs-AI matches always finish, with every system in use", () => {
    let topTier = 1;
    for (const seed of [1, 2, 3]) { // three different pairings of AI profiles
      const s = aiMatch(seed, 45 * 60 * TICK_RATE);
      expect(s.winner).not.toBeNull();
      expect(s.players.every(p => p.tier >= 2 && p.unlocked.length > 5)).toBe(true); // both sides performed a rite and studied units
      expect(s.players.some(p => p.invest[0]! > 0)).toBe(true);
      topTier = Math.max(topTier, ...s.players.map(p => p.tier));
    }
    expect(topTier).toBe(3);
  });
  it("the Storm of Wrath strikes every enemy soldier on every lane alike, needs tier III, gold and rest, and stacks", () => {
    const s = createGame({ teamSize: 2, seed: 1 });
    const storm = (player: number) => step(s, [{ player, cmd: { type: "storm" } }]);
    const p = s.players[0]!;
    p.credits = 5000;
    storm(0);
    expect(s.storms.length).toBe(0);                       // tier I: the sky stays quiet
    for (const q of s.players) q.tier = 3;
    const foes = [addUnit(s, "colossus", 2, 1, 0, 400000, 12000), addUnit(s, "wyrm", 3, 1, 1, 300000, 5000)]; // ground in one lane, wings in the other
    const mine = addUnit(s, "colossus", 0, 0, 0, 30000, 12000), tower = addUnit(s, "tower", 2, 1, 0, 460000, 3000);
    storm(0); storm(0);                                    // the second call finds him resting
    expect([s.storms.length, p.credits]).toEqual([1, 5000 - RULES.stormCost]);
    ticks(s, RULES.stormTicks + 5);
    const strikes = RULES.stormTicks / RULES.stormInterval;
    for (const u of foes) expect(u.hp).toBe(UNITS[u.type]!.hp - strikes * RULES.stormDamage); // armor does not help
    expect([mine.hp, tower.hp]).toEqual([UNITS.colossus!.hp, UNITS.tower!.hp]);
    expect(s.storms.length).toBe(0);
    s.players[1]!.credits = 5000; p.stormReady = 0;         // two allies at once: twice the wrath
    const before = foes[0]!.hp;
    step(s, [{ player: 0, cmd: { type: "storm" } }, { player: 1, cmd: { type: "storm" } }]);
    ticks(s, RULES.stormTicks + 5);
    expect(foes[0]!.hp).toBe(before - 2 * strikes * RULES.stormDamage);
    expect(parseCommand({ type: "storm", junk: 1 })).toEqual({ type: "storm" });
  });
  it("the Deadly Fog rolls down one lane from the caster's cathedral, kills every enemy soldier it covers, and comes once a match", () => {
    const s = createGame({ teamSize: 2, seed: 1 });
    const near = addUnit(s, "titan", 2, 1, 1, 60000, 12000), wings = addUnit(s, "wyrm", 3, 1, 1, RULES.fogReach - 2000, 5000);
    const beyond = addUnit(s, "oathguard", 2, 1, 1, 470000, 12000), other = addUnit(s, "titan", 2, 1, 0, 60000, 12000);
    const mine = addUnit(s, "titan", 0, 0, 1, 50000, 3000), tower = addUnit(s, "tower", 2, 1, 1, 70000, 20000);
    const alive = (u: { id: number }) => s.units.some(q => q.id === u.id);
    step(s, [{ player: 0, cmd: { type: "fog", lane: 1 } }, { player: 0, cmd: { type: "fog", lane: 0 } }]); // the second call finds it spent
    expect([s.fogs.length, s.fogs[0]!.lane, s.players[0]!.fogUsed, s.players[0]!.credits]).toEqual([1, 1, true, RULES.startCredits]);
    expect(alive(near)).toBe(true);                         // it has not reached him yet
    ticks(s, Math.ceil((RULES.fogRollTicks * 60000) / RULES.fogReach) + 2);
    // the greatest dies like the least; the far one still waits; the other lane, his own men and towers are untouched
    expect([alive(near), alive(wings), alive(other), alive(mine), alive(tower)]).toEqual([false, true, true, true, true]);
    ticks(s, RULES.fogRollTicks);
    expect([alive(wings), alive(beyond)]).toEqual([false, true]);
    expect(MAP.laneLength - beyond.x).toBeLessThan(MAP.laneLength - RULES.fogReach); // still outside it
    ticks(s, RULES.fogHoldTicks + 2);
    expect(s.fogs.length).toBe(0);
    step(s, [{ player: 0, cmd: { type: "fog" } }, { player: 2, cmd: { type: "fog" } }]);   // the enemy still has his own: it rolls from his end
    expect(s.fogs.map(f => [f.team, f.lane])).toEqual([[1, 0]]);
    expect(parseCommand({ type: "fog", lane: 1, junk: 1 })).toEqual({ type: "fog", lane: 1 });
    expect(parseCommand({ type: "fog", lane: 1.5 })).toBeNull();
  });
  it("a player may raise the tithe on an ally's lane: it lifts his own income from that lane's shrines and nobody else's", () => {
    const s = createGame({ teamSize: 2, seed: 1 });
    const before = [0, 1, 2].map(p => incomeOf(s, p));
    s.players[0]!.credits = 1000;
    step(s, [{ player: 0, cmd: { type: "invest", lane: 1 } }, { player: 0, cmd: { type: "invest", lane: 2 } }]); // lane 1 is his ally's; there is no lane 2
    expect(s.players[0]!.invest).toEqual([0, 1]);
    expect(s.players[0]!.credits).toBe(1000 - INVEST_TIERS[0]!.cost);
    expect([0, 1, 2].map(p => incomeOf(s, p))).toEqual([before[0]! + INVEST_TIERS[0]!.bonus, before[1], before[2]]); // one home shrine held in lane 1
  });

  it("a soldier a hair out of reach closes the gap instead of standing there", () => {
    const s = createGame({ teamSize: 1, seed: 1 });
    const a = spawn(s, "oathguard", 0, 133279, 12401), b = spawn(s, "arbalester", 1, 134567, 13172); // 1501 apart: one past the Oathguard's reach
    b.cooldown = 1e9;
    ticks(s, 3 * TICK_RATE);
    expect(b.hp).toBeLessThan(UNITS.arbalester!.hp);
    expect(a.hp).toBe(UNITS.oathguard!.hp);
  });
});
