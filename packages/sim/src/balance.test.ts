import { describe, expect, it } from "vitest";
import { UNITS, UNIT_ORDER, addUnit, clash, createGame, massOf, step, stream } from "./index";
import type { Army } from "./index";

/**
 * Balance and ability tests (docs/UNITS.md, docs/COLONIAL_LINE_WARS.md §34). They assert relationships
 * ("fire beats a swarm"), never exact numbers, so data.ts can be retuned without rewriting them.
 */
const GOLD = 3300;
const mass = (id: string): Army => massOf(id, GOLD);
/** Margin of `a` over `b` for the same gold: +1 = a untouched and b wiped out. */
const duel = (a: string, b: string): number => clash(mass(a), mass(b)).margin;
const fighters = UNIT_ORDER.filter(id => UNITS[id]!.damage > 0);
const arena = () => { const s = createGame({ teamSize: 1, seed: 1 }); s.units = []; return s; };

describe("fairness", () => {
  it("identical armies destroy each other exactly: neither side acts first", () => {
    for (const id of fighters) expect(Math.abs(clash(mass(id), mass(id)).margin), id).toBeLessThan(1e-9);
    const mixed: Army = { oathguard: 4, arbalester: 5, zealot: 2, hound: 3, necromancer: 2, colossus: 1, cantor: 1, shade: 2, doctor: 1 };
    expect(Math.abs(clash(mixed, mixed).margin)).toBeLessThan(1e-9);
  });

  it("a mirrored match on the real lane stays mirrored, towers, waves, summons and all", () => {
    const army: Army = { oathguard: 3, arbalester: 4, hound: 2, necromancer: 2, colossus: 1, gargoyle: 2, shade: 2, doctor: 1, zealot: 2, ballista: 1 };
    const r = stream(army, army, 6);
    expect(r.score).toBe(0);
    expect(r.broken[0]).toBe(r.broken[1]);
  });

  it("swapping sides swaps the result", () => {
    for (const [a, b] of [["zealot", "hound"], ["colossus", "headsman"], ["cantor", "arbalester"]] as const)
      expect(duel(a, b)).toBeCloseTo(-duel(b, a), 9);
  });
});

describe("counters (equal gold)", () => {
  const beats = (a: string, b: string, by = 0.15) => expect(duel(a, b), `${a} vs ${b}`).toBeGreaterThan(by);

  it("area damage beats swarms", () => { beats("zealot", "hound"); beats("colossus", "hound"); beats("zealot", "arbalester"); });
  it("a shield wall beats archers, and archers do better behind one", () => {
    beats("oathguard", "arbalester");
    const guarded = clash({ oathguard: 9, arbalester: 13 }, mass("flagellant")).margin; // same gold, half of it in shields
    expect(guarded).toBeGreaterThan(duel("arbalester", "flagellant"));
  });
  it("fast units run down archers and engines", () => { beats("hound", "arbalester"); beats("hound", "hexbinder"); beats("shade", "trebuchet"); beats("shade", "ballista"); });
  it("melee cannot touch flyers; anti-air brings them down", () => {
    for (const walker of ["oathguard", "zealot", "dreadknight", "penitent", "colossus", "countess", "headsman"]) {
      const r = clash(mass("gargoyle"), mass(walker));
      expect(r.left[0], walker).toBeGreaterThan(0.9); // barely a scratch (only the cathedral gun, if they fly that far)
      expect(r.left[1], walker).toBeLessThan(0.9); // (the fastest walkers partly outrun them)
    }
    beats("witchhunter", "gargoyle"); beats("witchhunter", "wyrm"); beats("arbalester", "wyrm"); beats("ballista", "gargoyle"); beats("hexbinder", "wyrm");
  });
  it("a lantern among the archers unmasks shades", () => {
    const blind = clash({ arbalester: 20 }, mass("shade")).margin;
    const lit = clash({ arbalester: 16, witchhunter: 2 }, mass("shade")).margin; // the same gold, two lanterns
    expect(lit).toBeGreaterThan(blind + 0.15);
  });
  it("the headsman is the answer to single great foes, the hexbinder to anything slow and strong", () => {
    beats("headsman", "countess"); beats("hexbinder", "countess"); beats("hexbinder", "headsman");
    expect(duel("headsman", "colossus")).toBeGreaterThan(duel("penitent", "colossus")); // execute matters against the biggest target
  });
  it("elite units lose to their counters for the same gold", () => { beats("gargoyle", "colossus"); beats("arbalester", "countess"); beats("witchhunter", "wyrm"); });

  it("no unit beats everything, and every unit beats something", () => {
    for (const a of fighters) {
      let wins = 0, losses = 0;
      for (const b of fighters) { if (a === b) continue; const m = duel(a, b); if (m > 0.15) wins++; if (m < -0.15) losses++; }
      expect(wins, `${a} wins`).toBeGreaterThanOrEqual(1); // casters priced for fighting behind a line win few duels massed alone
      expect(losses, `${a} losses`).toBeGreaterThanOrEqual(3);
    }
  });

  it("more gold beats a counter", () => {
    expect(clash(massOf("hound", GOLD * 2), mass("zealot")).margin).toBeGreaterThan(0);
    expect(clash(massOf("colossus", GOLD * 2.5), mass("gargoyle"), { maxSeconds: 60 }).left[0]).toBeGreaterThan(0.5); // they cannot be killed fast enough
  });

  it("support helps without making a line unkillable", () => {
    const line: Army = { oathguard: 6, arbalester: 8 }, foe = massOf("flagellant", 2000);
    const plain = clash(line, foe), mended = clash({ ...line, doctor: 2 }, foe), blessed = clash({ ...line, reliquary: 1 }, foe);
    expect(mended.left[0]).toBeGreaterThan(plain.left[0]);
    expect(blessed.left[0]).toBeGreaterThan(plain.left[0]);
    const wall = clash({ oathguard: 8, doctor: 4, reliquary: 1 }, { arbalester: 12, zealot: 6, penitent: 3 }, { maxSeconds: 240 });
    expect(wall.winner).not.toBeNull(); // a healed wall still falls, or wins: no stalemate
  });
});

describe("abilities", () => {
  const foe = (s: ReturnType<typeof arena>, type: string, x: number, y = 12000) => addUnit(s, type, 1, 1, 0, x, y);
  const mine = (s: ReturnType<typeof arena>, type: string, x: number, y = 12000) => addUnit(s, type, 0, 0, 0, x, y);
  const run = (s: ReturnType<typeof arena>, n: number) => { for (let i = 0; i < n; i++) step(s); };

  it("flying units are ignored by ground-only attackers and shot by the rest", () => {
    const s = arena();
    const g = foe(s, "gargoyle", 101000), knight = mine(s, "oathguard", 100000);
    run(s, 40);
    expect(g.hp).toBe(UNITS.gargoyle!.hp);            // the knight cannot reach it...
    expect(knight.hp).toBeLessThan(UNITS.oathguard!.hp); // ...but it reaches the knight
    expect(knight.x).toBeGreaterThan(100000);          // and the knight marches on
    mine(s, "arbalester", g.x - 3000);
    run(s, 25);
    expect(g.hp).toBeLessThan(UNITS.gargoyle!.hp);
  });

  it("Shield Wall blunts ranged hits only", () => {
    const s = arena();
    const guard = foe(s, "oathguard", 106000);
    mine(s, "arbalester", 100000);
    step(s);
    expect(UNITS.oathguard!.hp - guard.hp).toBe(UNITS.arbalester!.damage - UNITS.oathguard!.armor - UNITS.oathguard!.ward!);
  });

  it("Immolate keeps burning through armor after the zealot is gone", () => {
    const s = arena();
    const knight = foe(s, "dreadknight", 102000);
    mine(s, "zealot", 100000);
    step(s);
    s.units = s.units.filter(u => u.type !== "zealot");
    const after = knight.hp;
    run(s, 80);
    expect(after - knight.hp).toBeGreaterThanOrEqual(UNITS.zealot!.dot!.dmg * 2);
    const settled = knight.hp;
    run(s, 60);
    expect(knight.hp).toBe(settled); // the fire goes out
  });

  it("a curse slows movement and attacks, and wears off", () => {
    const s = arena();
    const a = foe(s, "countess", 104000, 6000), b = foe(s, "countess", 104000, 18000);
    mine(s, "hexbinder", 100000, 6000);
    run(s, 2);
    s.units = s.units.filter(u => u.type !== "hexbinder");
    run(s, 70);
    expect(a.x).toBeGreaterThan(b.x); // team 1 walks toward x = 0, so the cursed one has covered less ground
    const gap = a.x - b.x;
    run(s, 60);
    expect(a.x - b.x).toBe(gap);      // the curse has worn off: same pace again
  });

  it("Lance Charge triples the first hit on each new foe only", () => {
    const s = arena();
    const a = foe(s, "penitent", 102000);
    mine(s, "dreadknight", 100000);
    step(s);
    const d = UNITS.dreadknight!, armor = UNITS.penitent!.armor, first = UNITS.penitent!.hp - a.hp;
    expect(first).toBe((d.damage * d.charge!) / 100 - armor);
    run(s, d.interval);
    expect(UNITS.penitent!.hp - a.hp - first).toBe(d.damage - armor);
  });

  it("Sunder strips armor up to its cap; Ghost Blades ignore it", () => {
    const s = arena();
    const t = foe(s, "colossus", 101500);
    mine(s, "penitent", 100000);
    run(s, UNITS.penitent!.interval * 8);
    expect(t.sunder).toBe(Math.min(UNITS.penitent!.sunder!, 7));
    const s2 = arena(), k = foe(s2, "dreadknight", 101400);
    mine(s2, "shade", 100000);
    step(s2);
    expect(UNITS.dreadknight!.hp - k.hp).toBe(UNITS.shade!.damage);
  });

  it("a Shade cannot be shot from afar unless a lantern is near", () => {
    const s = arena();
    const ghost = foe(s, "shade", 105000);
    const archer = mine(s, "arbalester", 100000);
    step(s);
    expect(ghost.hp).toBe(UNITS.shade!.hp);
    expect(archer.target).toBe(0);
    mine(s, "witchhunter", 99000, 6000);
    run(s, 2);
    expect(ghost.hp).toBeLessThan(UNITS.shade!.hp);
  });

  it("a Trebuchet cannot hit what is under its nose or over its head, and breaks stone faster", () => {
    const s = arena();
    const near = foe(s, "oathguard", 102000), bird = foe(s, "gargoyle", 108000, 4000);
    const engine = mine(s, "trebuchet", 100000);
    run(s, 5);
    expect([near.hp, bird.hp]).toEqual([UNITS.oathguard!.hp, UNITS.gargoyle!.hp]);
    expect(engine.x).toBe(100000); // it holds rather than roll into them
    const s2 = arena(), tower = foe(s2, "tower", 110000);
    mine(s2, "trebuchet", 100000);
    step(s2);
    expect(UNITS.tower!.hp - tower.hp).toBe(UNITS.trebuchet!.damage + Math.trunc((UNITS.trebuchet!.damage * UNITS.trebuchet!.bonus!.structure!) / 100) - UNITS.tower!.armor);
  });

  it("a Necromancer raises the fallen, at most one every cooldown, and never from skeletons or flyers", () => {
    const s = arena();
    const necro = mine(s, "necromancer", 100000);
    const victims = [foe(s, "arbalester", 103000, 10000), foe(s, "arbalester", 103000, 14000), foe(s, "gargoyle", 103000, 12000)];
    for (const v of victims) v.hp = 1;
    mine(s, "cantor", 99000); // strikes all three at once
    run(s, 2);
    const bones = () => s.units.filter(u => u.type === "skeleton");
    expect(bones().length).toBe(1);
    expect(bones()[0]!.team).toBe(0);
    expect(necro.abilityCd).toBeGreaterThan(0);
    const born = bones()[0]!;
    run(s, UNITS.skeleton!.life! + 2);
    expect(s.units).not.toContain(born); // brittle
  });

  it("a Bone Colossus cleaves and leaves four skeletons", () => {
    const s = arena();
    const big = mine(s, "colossus", 100000);
    const pack = [0, 1, 2].map(i => foe(s, "hound", 102000, 11000 + i * 1000));
    step(s);
    expect(pack.every(h => h.hp < UNITS.hound!.hp)).toBe(true);
    big.hp = 1;
    run(s, 30);
    expect(s.units.filter(u => u.type === "skeleton" && u.team === 0).length).toBe(4);
  });

  it("Searing Breath ramps on one target and resets on the next", () => {
    const s = arena();
    const big = foe(s, "tower", 104000); // something that stays put
    const wyrm = mine(s, "wyrm", 100000);
    const d = UNITS.wyrm!, hits: number[] = [];
    for (let i = 0, last = big.hp; i < 10; i++) { run(s, d.interval); hits.push(last - big.hp); last = big.hp; }
    expect(hits[1]!).toBeGreaterThan(hits[0]!);
    expect(hits[9]).toBe(hits[8]); // capped
    expect(wyrm.ramp).toBe(d.ramp!.max);
  });

  it("Chain Lightning leaps to nearby foes with less force each time", () => {
    const s = arena();
    const row = [0, 1, 2, 3, 4, 5].map(i => foe(s, "oathguard", 106000 + i * 3000));
    mine(s, "cantor", 100000);
    step(s);
    const lost = row.map(u => UNITS.oathguard!.hp - u.hp);
    expect(lost.slice(0, 5).every((v, i) => i === 0 || v < lost[i - 1]!)).toBe(true);
    expect(lost[4]).toBeGreaterThan(0);
    expect(lost[5]).toBe(0); // four leaps only
  });

  it("Sanctuary hardens and mends those around the Reliquary, not the Reliquary itself", () => {
    const s = arena();
    const ark = mine(s, "reliquary", 100000), near = mine(s, "flagellant", 102000), far = mine(s, "flagellant", 130000);
    for (const u of [ark, near, far]) u.hp -= 60;
    run(s, 41);
    expect(near.hp).toBeGreaterThan(UNITS.flagellant!.hp - 60);
    expect(far.hp).toBe(UNITS.flagellant!.hp - 60);
    expect(ark.hp).toBe(UNITS.reliquary!.hp - 60);
    const s2 = arena(), guarded = mine(s2, "flagellant", 102000);
    mine(s2, "reliquary", 100000); foe(s2, "arbalester", 107000);
    step(s2);
    expect(UNITS.flagellant!.hp - guarded.hp).toBe(UNITS.arbalester!.damage - UNITS.reliquary!.aura!.armor);
  });

  it("Blood Feast heals the Countess; Execute scales with the victim", () => {
    const s = arena();
    const lady = mine(s, "countess", 100000);
    lady.hp -= 200;
    foe(s, "trebuchet", 101400);
    step(s);
    expect(lady.hp).toBeGreaterThan(UNITS.countess!.hp - 200);
    const s2 = arena(), big = foe(s2, "colossus", 101700, 11000), small = foe(s2, "skeleton", 101700, 13000);
    mine(s2, "headsman", 100000, 11000); mine(s2, "headsman", 100000, 13000);
    step(s2);
    expect(UNITS.colossus!.hp - big.hp).toBeGreaterThan(UNITS.skeleton!.hp - small.hp + 50);
  });

  it("the Impaler skewers a whole file, and flyers in it take far more", () => {
    const s = arena();
    const file = [0, 1, 2].map(i => foe(s, "oathguard", 108000 + i * 2500)), beside = foe(s, "oathguard", 110000, 16000), bird = foe(s, "gargoyle", 112000, 12300);
    mine(s, "ballista", 100000);
    step(s);
    expect(file.every(u => u.hp < UNITS.oathguard!.hp)).toBe(true);
    expect(beside.hp).toBe(UNITS.oathguard!.hp);
    expect(UNITS.gargoyle!.hp - bird.hp).toBe(UNITS.ballista!.damage + Math.trunc((UNITS.ballista!.damage * UNITS.ballista!.bonus!.flying!) / 100) - UNITS.gargoyle!.armor);
  });

  it("Frenzy quickens a wounded Flagellant; two hounds come from one kennel", () => {
    const s = arena();
    const hale = mine(s, "flagellant", 100000, 6000), hurt = mine(s, "flagellant", 100000, 18000);
    hurt.hp = Math.ceil(UNITS.flagellant!.hp * 0.1);
    const a = foe(s, "colossus", 101400, 6000), b = foe(s, "colossus", 101400, 18000);
    a.cooldown = b.cooldown = 10000; // they only stand there
    run(s, 200);
    void hale;
    expect(UNITS.colossus!.hp - b.hp).toBeGreaterThan((UNITS.colossus!.hp - a.hp) * 1.5);
    const g = arena();
    g.players[0]!.unlocked.push("hound"); g.players[0]!.credits = 1000;
    step(g, [{ player: 0, cmd: { type: "build", unit: "hound", col: 4, row: 4 } }]);
    run(g, 600);
    expect(g.units.filter(u => u.type === "hound").length).toBe(2);
  });
});
