import { describe, expect, it } from "vitest";
import { createGame as newGame, parseCommand, step, towersOf, simpleAI, incomeOf, cellCenter, hqX, INVEST_TIERS, MAP, RESEARCH, RULES, TICK_RATE, UNITS } from "./index";
import type { GameConfig, GameState, TimedCommand } from "./index";

/** Most tests want an empty lane: no guard towers. */
const createGame = (cfg: GameConfig): GameState => { const s = newGame(cfg); s.units = []; return s; };
const ticks = (s: GameState, n: number) => { for (let i = 0; i < n; i++) step(s); };
function aiMatch(seed: number, maxTicks: number): GameState {
  const s = newGame({ teamSize: 1, seed, aiSlots: [0, 1] });
  for (let i = 0; i < maxTicks && s.winner === null; i++) {
    const cmds: TimedCommand[] = [];
    for (const p of s.players) for (const cmd of simpleAI(s, p.id)) cmds.push({ player: p.id, cmd });
    step(s, cmds);
  }
  return s;
}
const spawn = (s: GameState, type: string, team: 0 | 1, x: number, y = 12000) => {
  s.units.push({ id: s.nextId++, type, owner: team, team, lane: 0, x, y, hp: UNITS[type]!.hp, cooldown: 0, target: 0 });
};

describe("sim", () => {
  it("is deterministic for the same seed", () => {
    expect(JSON.stringify(aiMatch(42, 300 * TICK_RATE))).toBe(JSON.stringify(aiMatch(42, 300 * TICK_RATE)));
  });

  it("building costs credits and produces one unit per wave at the building's cell", () => {
    const s = createGame({ teamSize: 1, seed: 1 });
    step(s, [{ player: 0, cmd: { type: "build", unit: "arbalester", col: 2, row: 3 } }]);
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
      { player: 0, cmd: { type: "build", unit: "arbalester", col: 0, row: 0 } },
      { player: 0, cmd: { type: "build", unit: "arbalester", col: 0, row: 0 } },
      { player: 0, cmd: { type: "build", unit: "arbalester", col: 1, row: 1 } },             // overlaps the first
      { player: 0, cmd: { type: "build", unit: "arbalester", col: MAP.zoneCols - 1, row: 0 } }, // hangs out of the zone
      { player: 0, cmd: { type: "build", unit: "doctor", col: 4, row: 0 } },
      { player: 0, cmd: { type: "build", unit: "tower", col: 6, row: 0 } },
    ]);
    expect(s.buildings.length).toBe(1);
    step(s, [{ player: 0, cmd: { type: "build", unit: "oathguard", col: 1, row: 2 } }, { player: 0, cmd: { type: "build", unit: "oathguard", col: 3, row: 3 } }]);
    expect(s.buildings.length).toBe(2); // third is unaffordable
  });

  it("refunds 75% before the first wave and 25% after", () => {
    const s = createGame({ teamSize: 1, seed: 1 });
    step(s, [{ player: 0, cmd: { type: "build", unit: "oathguard", col: 0, row: 0 } }, { player: 0, cmd: { type: "build", unit: "oathguard", col: 0, row: 2 } }]);
    const [a, b] = s.buildings;
    const before = s.players[0]!.credits;
    step(s, [{ player: 0, cmd: { type: "sell", buildingId: a!.id } }, { player: 1, cmd: { type: "sell", buildingId: b!.id } }]);
    expect(s.players[0]!.credits).toBe(before + 120);
    expect(s.buildings.length).toBe(1); // the enemy cannot sell ours
    ticks(s, RULES.waveIntervalTicks);
    const mid = s.players[0]!.credits;
    step(s, [{ player: 0, cmd: { type: "sell", buildingId: b!.id } }]);
    expect(s.players[0]!.credits).toBe(mid + 40);
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

  it("research takes time and unlocks tier 2", () => {
    const s = createGame({ teamSize: 1, seed: 1 });
    s.players[0]!.credits = 1000;
    step(s, [{ player: 0, cmd: { type: "research" } }]);
    expect(s.players[0]!.credits).toBe(1000 - RESEARCH[2]!.cost);
    ticks(s, RESEARCH[2]!.ticks - 2);
    expect(s.players[0]!.tier).toBe(1);
    ticks(s, 1);
    expect(s.players[0]!.tier).toBe(2);
    step(s, [{ player: 0, cmd: { type: "build", unit: "doctor", col: 0, row: 0 } }]);
    expect(s.buildings.length).toBe(1);
  });

  it("units fight; armor reduces damage; doctors heal", () => {
    const s = createGame({ teamSize: 1, seed: 1 });
    spawn(s, "arbalester", 0, 100000);
    spawn(s, "dreadknight", 1, 102000);
    step(s);
    expect(s.units[1]!.hp).toBe(UNITS.dreadknight!.hp - (UNITS.arbalester!.damage - UNITS.dreadknight!.armor));
    expect(s.units[0]!.hp).toBe(UNITS.arbalester!.hp - UNITS.dreadknight!.damage);
    spawn(s, "doctor", 0, 98000);
    step(s);
    expect(s.units[0]!.hp).toBe(UNITS.arbalester!.hp - UNITS.dreadknight!.damage + UNITS.doctor!.heal);
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

  it("parseCommand accepts only well-formed commands and drops unknown fields", () => {
    expect(parseCommand({ type: "build", unit: "arbalester", col: 2, row: 4, credits: 9999 })).toEqual({ type: "build", unit: "arbalester", col: 2, row: 4 });
    expect(parseCommand({ type: "invest", lane: 0 })).toEqual({ type: "invest", lane: 0 });
    for (const bad of [null, 5, "build", {}, { type: "win" }, { type: "build", unit: "__proto__", col: 0, row: 0 }, { type: "build", unit: "arbalester", col: "0", row: 0 },
      { type: "build", unit: "arbalester", col: 0.5, row: 0 }, { type: "sell", buildingId: "1" }, { type: "invest", lane: "length" }])
      expect(parseCommand(bad)).toBeNull();
    const s = createGame({ teamSize: 1, seed: 1 });
    step(s, [{ player: 0, cmd: { type: "invest", lane: "length" as unknown as number } }, { player: 0, cmd: { type: "build", unit: "constructor", col: 0, row: 0 } }]);
    expect(s.players[0]!.credits).toBe(RULES.startCredits);
    expect(s.players[0]!.invest).toEqual([0]);
  });

  it("AI-vs-AI matches always finish, with every system in use", () => {
    for (const seed of [1, 2, 3]) {
      const s = aiMatch(seed, 45 * 60 * TICK_RATE);
      expect(s.winner).not.toBeNull();
      expect(s.players.some(p => p.tier === 2)).toBe(true);
      expect(s.players.some(p => p.invest[0]! > 0)).toBe(true);
    }
  });
});
