import { Rng } from "./rng";
import { INVEST_TIERS, KEEPERS, LANE_WIDTH, MAP, RESEARCH, RULES, TICK_RATE, UNITS, UNIT_ORDER, UNIT_RESEARCH } from "./data";
import type { UnitDef } from "./data";
import type { Command, GameConfig, GameState, KeeperState, PlayerId, PlayerState, TeamId, TimedCommand, UnitState } from "./types";

// ---- geometry helpers (shared with the client) ----
export const hqX = (team: TeamId): number => (team === 0 ? MAP.hqOffset : MAP.laneLength - MAP.hqOffset);
/** Centre of a building whose rear-top grid cell is (col,row). Col 0 is the rear column (nearest the team's own HQ). */
export function cellCenter(team: TeamId, col: number, row: number): { x: number; y: number } {
  const half = (MAP.footprint * MAP.cell) / 2;
  const local = MAP.zoneStart + col * MAP.cell + half;
  return { x: team === 0 ? local : MAP.laneLength - local, y: row * MAP.cell + half };
}
/** True when a building may stand with its rear-top cell at (col,row): inside the zone and overlapping nothing. */
export function canBuild(s: GameState, team: TeamId, lane: number, col: number, row: number): boolean {
  const f = MAP.footprint;
  if (!Number.isInteger(col) || !Number.isInteger(row)) return false;
  if (col < 0 || col > MAP.zoneCols - f || row < 0 || row > MAP.zoneRows - f) return false;
  return !s.buildings.some(b => b.team === team && b.lane === lane && Math.abs(b.col - col) < f && Math.abs(b.row - row) < f);
}
/** True when a chantry may be ORDERED there: free now, and not already promised to another of the team's build orders. */
export function canPlan(s: GameState, team: TeamId, lane: number, col: number, row: number): boolean {
  const f = MAP.footprint;
  return canBuild(s, team, lane, col, row)
    && !s.keepers.some(k => k.team === team && k.jobs.some(j => j.lane === lane && Math.abs(j.col - col) < f && Math.abs(j.row - row) < f));
}
/** The nearest point to (x, y) that a keeper of `team` may stand on: its building ground, never the lane. */
export function keeperGround(team: TeamId, x: number, y: number): { x: number; y: number } {
  const lo = MAP.zoneStart, hi = MAP.zoneStart + MAP.zoneCols * MAP.cell, local = Math.max(lo, Math.min(hi, team === 0 ? x : MAP.laneLength - x));
  return { x: team === 0 ? local : MAP.laneLength - local, y: Math.max(500, Math.min(LANE_WIDTH - 500, y)) };
}
export const keeperOf = (s: GameState, player: PlayerId, slot: number): KeeperState | undefined => s.keepers.find(k => k.owner === player && k.slot === slot);
/** Distance of the base towers from their team's own lane end. */
export const baseTowerLocalX = (): number => MAP.zoneStart + MAP.zoneCols * MAP.cell + MAP.baseTowerAhead;
/** Living guard towers of a team in a lane. */
export function towersOf(s: GameState, team: TeamId, lane = 0): number {
  let n = 0;
  for (const u of s.units) if (u.type === "tower" && u.team === team && u.lane === lane) n++;
  return n;
}

// ---- economy helpers ----
export function investBonus(level: number): number {
  let b = 0;
  for (let i = 0; i < level; i++) b += INVEST_TIERS[i]!.bonus;
  return b;
}
export function beaconsHeld(s: GameState, team: TeamId, lane: number): number {
  let n = 0;
  for (const b of s.beacons) if (b.lane === lane && b.owner === team) n++;
  return n;
}
/** Credits the player receives on each income tick. */
export function incomeOf(s: GameState, player: PlayerId): number {
  const p = s.players[player]!;
  let inc = RULES.baseIncome;
  for (const b of s.beacons) if (b.owner === p.team) inc += RULES.beaconIncome + investBonus(p.invest[b.lane] ?? 0);
  return inc;
}

// ---- research helpers ----
export const isBuildable = (unit: string): boolean => { const d = Object.hasOwn(UNITS, unit) ? UNITS[unit] : undefined; return !!d && !d.structure && !d.summoned && !d.merc; };
export const isMerc = (unit: string): boolean => Object.hasOwn(UNITS, unit) && UNITS[unit]!.merc === true;
export const isUnlocked = (p: PlayerState, unit: string): boolean => p.unlocked.includes(unit);
/** What the "research" command would start for this player, or null if it may not start (ignoring gold and a research already under way). */
export function researchOffer(p: PlayerState, unit?: string): { tier: number; unit: string | null; cost: number; ticks: number } | null {
  if (unit === undefined) {
    const next = RESEARCH[p.tier + 1];
    return next ? { tier: p.tier + 1, unit: null, ...next } : null;
  }
  if (!isBuildable(unit) || isUnlocked(p, unit)) return null;
  const tier = UNITS[unit]!.tier, study = UNIT_RESEARCH[tier];
  return study && tier <= p.tier ? { tier, unit, ...study } : null;
}

/** Create a unit at full health and add it to the lane. */
export function addUnit(s: GameState, type: string, owner: PlayerId, team: TeamId, lane: number, x: number, y: number): UnitState {
  const def = UNITS[type]!;
  const u: UnitState = { id: s.nextId++, type, owner, team, lane, x, y, hp: def.hp, cooldown: 0, target: 0,
    slowUntil: 0, slowPct: 0, dotUntil: 0, dotFrom: 0, dotDmg: 0, sunder: 0, ramp: 0, lastHit: 0, abilityCd: 0, expire: def.life ? s.tick + def.life : 0 };
  s.units.push(u);
  return u;
}

export function sellRefund(unit: string, produced: boolean): number {
  return Math.floor((UNITS[unit]!.cost * (produced ? RULES.sellRefundUsedPct : RULES.sellRefundFreshPct)) / 100);
}

export function createGame(cfg: GameConfig): GameState {
  const n = cfg.teamSize;
  const laneCount = cfg.lanes ?? 1;
  const s: GameState = {
    tick: 0, rngState: cfg.seed >>> 0, nextId: 1, teamSize: n, laneCount,
    players: Array.from({ length: n * 2 }, (_, i) => ({
      id: i, team: (i < n ? 0 : 1) as TeamId, lane: (i % n) % laneCount,
      credits: RULES.startCredits, tier: 1, unlocked: UNIT_ORDER.filter(id => UNITS[id]!.free), research: null, mercReady: 0,
      invest: Array.from({ length: laneCount }, () => 0),
      isAI: cfg.aiSlots?.includes(i) ?? false,
    })),
    teams: [{ hqHp: RULES.hqHp, hqCooldown: 0 }, { hqHp: RULES.hqHp, hqCooldown: 0 }],
    beacons: [], buildings: [], keepers: [], units: [], events: [], winner: null,
  };
  // Two gravekeepers per player wait near the rear of their own building ground.
  for (const p of s.players) for (const slot of [0, 1] as const) {
    const at = keeperGround(p.team, p.team === 0 ? MAP.zoneStart + 4 * MAP.cell : MAP.laneLength - MAP.zoneStart - 4 * MAP.cell, LANE_WIDTH / 2 + (slot ? 3 : -3) * MAP.cell);
    s.keepers.push({ owner: p.id, team: p.team, slot, lane: p.lane, ...at, tlane: p.lane, tx: at.x, ty: at.y, jobs: [] });
  }
  const lastB = MAP.beaconX.length - 1;
  for (let lane = 0; lane < laneCount; lane++) {
    // Each team starts holding the shrine nearest its cathedral, guarded by two towers.
    MAP.beaconX.forEach((x, i) => s.beacons.push({ id: s.nextId++, lane, x, owner: (i === 0 ? 0 : i === lastB ? 1 : null) as TeamId | null }));
    // ...and two more guard the front of its building ground, so the cathedral has a last line of defence.
    const shrineLocal = MAP.beaconX[0]! + MAP.towerAhead, baseLocal = baseTowerLocalX();
    for (const team of [0, 1] as const)
      for (const [local, ys] of [[baseLocal, MAP.baseTowerY], [shrineLocal, MAP.towerY]] as const) for (const y of ys)
        addUnit(s, "tower", team === 0 ? 0 : n, team, lane, team === 0 ? local : MAP.laneLength - local, y);
  }
  return s;
}

const int = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v);
/**
 * Turn untrusted input (a network message) into a Command, or null. Copies only the known fields,
 * so nothing else a client sends can reach the sim. Rules (cost, tier, room) are still checked by step().
 */
export function parseCommand(raw: unknown): Command | null {
  if (typeof raw !== "object" || raw === null) return null;
  const r = raw as Record<string, unknown>;
  const lane = r.lane === undefined ? {} : int(r.lane) ? { lane: r.lane } : null;
  if (!lane) return null;
  const keeper = r.keeper === 0 || r.keeper === 1 ? r.keeper : null;
  if (r.type === "build") return keeper !== null && typeof r.unit === "string" && Object.hasOwn(UNITS, r.unit) && int(r.col) && int(r.row) ? { type: "build", keeper, unit: r.unit, col: r.col, row: r.row, ...lane } : null;
  if (r.type === "move") return keeper !== null && int(r.x) && int(r.y) ? { type: "move", keeper, x: r.x, y: r.y, ...lane } : null;
  if (r.type === "hire") return typeof r.unit === "string" && Object.hasOwn(UNITS, r.unit) ? { type: "hire", unit: r.unit } : null;
  if (r.type === "sell") return int(r.buildingId) ? { type: "sell", buildingId: r.buildingId } : null;
  if (r.type === "invest") return { type: "invest", ...lane };
  if (r.type === "research") {
    if (r.unit === undefined) return { type: "research" };
    return typeof r.unit === "string" && Object.hasOwn(UNITS, r.unit) ? { type: "research", unit: r.unit } : null;
  }
  return null;
}

function applyCommand(s: GameState, player: PlayerId, c: Command): void {
  const me = s.players[player];
  if (!me) return;
  if (c.type === "build") {
    const lane = c.lane ?? me.lane, k = keeperOf(s, player, c.keeper);
    if (!k || k.jobs.length >= RULES.keeperQueue || !isBuildable(c.unit) || !isUnlocked(me, c.unit)) return;
    const def = UNITS[c.unit]!;
    if (def.tier > KEEPERS[k.slot].maxTier || me.credits < def.cost) return;
    if (!Number.isInteger(lane) || lane < 0 || lane >= s.laneCount) return;
    if (!canPlan(s, me.team, lane, c.col, c.row)) return;
    me.credits -= def.cost; // paid on the order, handed back if the chantry cannot be raised
    k.jobs.push({ unit: def.id, lane, col: c.col, row: c.row });
  } else if (c.type === "move") {
    const lane = c.lane ?? me.lane, k = keeperOf(s, player, c.keeper);
    if (!k || !Number.isInteger(lane) || lane < 0 || lane >= s.laneCount) return;
    for (const j of k.jobs) me.credits += UNITS[j.unit]!.cost;
    k.jobs = [];
    const at = keeperGround(k.team, c.x, c.y);
    k.tlane = lane; k.tx = at.x; k.ty = at.y;
  } else if (c.type === "hire") {
    if (!isMerc(c.unit) || s.tick < me.mercReady) return;
    const def = UNITS[c.unit]!, k = s.keepers.find(q => q.owner === player && KEEPERS[q.slot].mercs);
    if (!k || me.credits < def.cost) return;
    me.credits -= def.cost; me.mercReady = s.tick + RULES.mercCooldownTicks;
    // The band forms up in front of the base towers of the lane the Undertaker is in.
    const local = baseTowerLocalX() + RULES.mercAhead, n = def.count ?? 1;
    for (let i = 0; i < n; i++)
      addUnit(s, def.id, player, me.team, k.lane, me.team === 0 ? local : MAP.laneLength - local, LANE_WIDTH / 2 + Math.trunc((i - (n - 1) / 2) * 2 * MAP.cell));
    s.events.push({ t: "hired", player, unit: def.id });
  } else if (c.type === "sell") {
    const i = s.buildings.findIndex(b => b.id === c.buildingId && b.owner === player);
    if (i < 0) return;
    const b = s.buildings[i]!;
    me.credits += sellRefund(b.unit, b.produced);
    s.buildings.splice(i, 1);
  } else if (c.type === "invest") {
    const lane = c.lane ?? me.lane;
    if (!Number.isInteger(lane) || lane < 0 || lane >= s.laneCount) return;
    const level = me.invest[lane];
    if (level === undefined) return;
    const tier = INVEST_TIERS[level];
    if (!tier || me.credits < tier.cost) return;
    me.credits -= tier.cost;
    me.invest[lane] = level + 1;
  } else if (c.type === "research") {
    const offer = researchOffer(me, c.unit);
    if (!offer || me.research || me.credits < offer.cost) return;
    me.credits -= offer.cost;
    me.research = { tier: offer.tier, unit: offer.unit, startTick: s.tick, doneTick: s.tick + offer.ticks };
  }
}

const dist = (ax: number, ay: number, bx: number, by: number): number => {
  const dx = ax - bx, dy = ay - by;
  return Math.floor(Math.sqrt(dx * dx + dy * dy));
};
const isStructure = (u: UnitState): boolean => UNITS[u.type]!.structure === true;
/** How far `o` is for noticing it. A structure is noticed by distance along the lane only, so nobody slips past it. */
const noticeDist = (u: UnitState, o: UnitState): number => (isStructure(o) ? Math.abs(u.x - o.x) : dist(u.x, u.y, o.x, o.y));
/** Offsets for units that appear together (a pack, a collapsing colossus); x is mirrored for team 1 so both sides match. */
const SCATTER = [[-450, -450], [450, 450], [-450, 450], [450, -450]] as const;

/** Advance exactly one tick. Deterministic in (state, commands). Mutates `s` in place for speed. */
export function step(s: GameState, commands: TimedCommand[] = []): void {
  if (s.winner !== null) return;
  s.events = [];
  for (const { player, cmd } of commands) applyCommand(s, player, cmd);

  const overtime = s.tick >= RULES.overtimeTick;
  const byId = new Map<number, UnitState>();
  for (const u of s.units) byId.set(u.id, u);

  // Auras and lanterns are worked out once, from where everyone stood at the start of the tick.
  const auraArmor = new Map<UnitState, number>(), auraRegen = new Map<UnitState, number>(), revealed = new Set<UnitState>();
  for (const a of s.units) {
    const d = UNITS[a.type]!;
    if (!d.aura && !d.reveal) continue;
    for (const o of s.units) {
      if (o === a || o.lane !== a.lane) continue;
      const far = dist(a.x, a.y, o.x, o.y);
      if (d.aura && o.team === a.team && !isStructure(o) && far <= d.aura.radius) {
        auraArmor.set(o, Math.max(auraArmor.get(o) ?? 0, d.aura.armor));
        auraRegen.set(o, Math.max(auraRegen.get(o) ?? 0, d.aura.regen));
      }
      if (d.reveal && o.team !== a.team && UNITS[o.type]!.veil && far <= d.reveal) revealed.add(o);
    }
  }

  // Damage, healing and afflictions are collected and applied after every unit has acted, so
  // array order gives neither team a first-strike advantage.
  const delta = new Map<UnitState, number>();
  const afflict: (() => void)[] = [];
  const moves: [UnitState, number, number][] = []; // everyone decides from where all stood at the start of the tick, then all move
  const hqDamage: [number, number] = [0, 0];
  const change = (u: UnitState, amount: number) => delta.set(u, (delta.get(u) ?? 0) + amount);
  /** One unit's attack landing on one victim, with every on-hit ability. */
  const hit = (u: UnitState, def: UnitDef, v: UnitState, base: number): void => {
    const vd = UNITS[v.type]!;
    let dmg = base;
    if (def.bonus) {
      if (vd.flying && def.bonus.flying) dmg += Math.trunc((base * def.bonus.flying) / 100);
      if (vd.structure && def.bonus.structure) dmg += Math.trunc((base * def.bonus.structure) / 100);
      if (vd.armor >= 2 && !vd.structure && def.bonus.armored) dmg += Math.trunc((base * def.bonus.armored) / 100);
    }
    if (def.maim && !vd.structure) dmg += Math.trunc((vd.hp * def.maim) / 100);
    const armor = def.pierce ? 0 : Math.max(0, vd.armor + (auraArmor.get(v) ?? 0) - v.sunder);
    const ward = vd.ward && def.range > RULES.meleeReach ? vd.ward : 0;
    const dealt = Math.max(1, dmg - armor - ward);
    change(v, -dealt);
    if (def.leech) change(u, Math.trunc((dealt * def.leech) / 100));
    if (def.sunder && v.sunder < def.sunder) { const cap = def.sunder; afflict.push(() => { if (v.sunder < cap) v.sunder++; }); }
    if (vd.structure) return; // stone neither burns nor slows
    if (def.slow) { const { pct, ticks } = def.slow; afflict.push(() => {
      v.slowPct = s.tick < v.slowUntil ? Math.max(v.slowPct, pct) : pct; v.slowUntil = Math.max(v.slowUntil, s.tick + ticks); }); }
    if (def.dot) { const { dmg: burn, ticks } = def.dot; afflict.push(() => {
      if (s.tick > v.dotUntil) { v.dotDmg = burn; v.dotFrom = s.tick; } else v.dotDmg = Math.max(v.dotDmg, burn);
      v.dotUntil = Math.max(v.dotUntil, s.tick + ticks); }); }
  };
  const canHit = (def: UnitDef, o: UnitState): boolean => !UNITS[o.type]!.flying || def.air === true;
  /** A full attack: works out who is struck (one foe, an area, a line, a chain) and how hard. */
  const strike = (u: UnitState, def: UnitDef, target: UnitState): void => {
    let base = def.damage;
    if (def.charge && u.lastHit !== target.id) base = Math.trunc((base * def.charge) / 100);
    if (def.ramp) {
      u.ramp = u.lastHit === target.id ? Math.min(def.ramp.max, u.ramp + 1) : 0;
      base += Math.trunc((base * def.ramp.pct * u.ramp) / 100);
    }
    u.lastHit = target.id;
    s.events.push({ t: "shot", id: u.id, unit: u.type, team: u.team, to: target.id, x1: u.x, y1: u.y, x2: target.x, y2: target.y });
    if (def.line) {
      // Everything within `width` of the segment that starts at the attacker and runs `length` through the target.
      const dx = target.x - u.x, dy = target.y - u.y, len = Math.max(1, dist(u.x, u.y, target.x, target.y));
      for (const o of s.units) {
        if (o.team === u.team || o.lane !== u.lane || !canHit(def, o)) continue;
        const ox = o.x - u.x, oy = o.y - u.y, along = Math.trunc((ox * dx + oy * dy) / len), across = Math.abs(Math.trunc((ox * dy - oy * dx) / len));
        if (o === target || (along >= 0 && along <= def.line.length && across <= def.line.width)) hit(u, def, o, base);
      }
    } else if (def.splash > 0) {
      for (const o of s.units)
        if (o.team !== u.team && o.lane === u.lane && canHit(def, o) && dist(o.x, o.y, target.x, target.y) <= def.splash) hit(u, def, o, base);
    } else hit(u, def, target, base);
    if (def.chain) {
      const struck = new Set<UnitState>([target]);
      let from = target, force = base;
      for (let j = 0; j < def.chain.jumps; j++) {
        force = Math.trunc((force * (100 - def.chain.falloff)) / 100);
        let next: UnitState | undefined, nextD = def.chain.radius + 1;
        for (const o of s.units) {
          if (o.team === u.team || o.lane !== u.lane || struck.has(o) || !canHit(def, o)) continue;
          const d = dist(from.x, from.y, o.x, o.y);
          if (d < nextD) { next = o; nextD = d; }
        }
        if (!next) break;
        hit(u, def, next, force);
        s.events.push({ t: "arc", team: u.team, from: from.id, to: next.id, x1: from.x, y1: from.y, x2: next.x, y2: next.y });
        struck.add(next); from = next;
      }
    }
  };

  for (const u of s.units) {
    const def = UNITS[u.type]!;
    const dir = u.team === 0 ? 1 : -1;
    const enemyTeam = (1 - u.team) as TeamId;
    if (u.cooldown > 0) u.cooldown--;
    if (u.abilityCd > 0) u.abilityCd--;
    if (u.expire && s.tick >= u.expire) { change(u, -u.hp); continue; }
    // Burning bites once a second, counted from when the fire caught; sanctuary mends on the second.
    if (s.tick <= u.dotUntil && s.tick > u.dotFrom && (s.tick - u.dotFrom) % TICK_RATE === 0) change(u, -u.dotDmg);
    if (s.tick % TICK_RATE === 0 && u.hp < def.hp) { const regen = auraRegen.get(u); if (regen) change(u, regen); }
    const slowed = s.tick < u.slowUntil;
    const speed = slowed ? Math.trunc((def.speed * (100 - u.slowPct)) / 100) : def.speed;
    const rearm = (): void => {
      let t = def.interval;
      if (def.frenzy) t -= Math.trunc((t * def.frenzy * (def.hp - u.hp)) / (def.hp * 100));
      if (slowed) t = Math.trunc((t * 100) / (100 - u.slowPct));
      u.cooldown = Math.max(1, t);
    };
    /** Distance at which `o` can be attacked right now, or -1 if it cannot be (in the air, veiled, too near). */
    const reach = (o: UnitState): number => {
      if (!canHit(def, o)) return -1;
      const od = UNITS[o.type]!;
      if (od.veil || def.minRange) {
        const real = dist(u.x, u.y, o.x, o.y);
        if (od.veil && real > od.veil && !revealed.has(o)) return -1;
        if (def.minRange && real < def.minRange) return -2;
      }
      return noticeDist(u, o);
    };

    let nearestEnemy: UnitState | undefined, nearestEnemyD = Infinity, threatD = Infinity, tooClose = false;
    let patient: UnitState | undefined, patientD = Infinity;
    for (const o of s.units) {
      if (o.lane !== u.lane || o === u) continue;
      if (o.team !== u.team) {
        if (def.damage === 0) { threatD = Math.min(threatD, noticeDist(u, o)); continue; }
        const d = reach(o);
        if (d === -2) tooClose = true;
        else if (d >= 0 && d < nearestEnemyD) { nearestEnemy = o; nearestEnemyD = d; }
      } else if (def.heal > 0 && !isStructure(o) && o.hp < UNITS[o.type]!.hp) {
        const d = dist(u.x, u.y, o.x, o.y);
        if (d < patientD) { patient = o; patientD = d; }
      }
    }
    const moveToward = (tx: number, ty: number, d: number, want: number) => {
      const m = Math.min(speed, want + (def.merc ? RULES.mercApproachPad : 0));
      if (d <= 0 || m <= 0) return;
      moves.push([u, Math.trunc(((tx - u.x) * m) / d), Math.trunc(((ty - u.y) * m) / d)]);
    };
    const advance = () => { moves.push([u, dir * speed, 0]); };

    if (def.damage === 0) { // support: mend if it can, and keep behind the fighting
      if (def.structure) continue;
      const within = def.range + RULES.acquirePad;
      if (patient && patientD <= within) {
        if (patientD > def.range) moveToward(patient.x, patient.y, patientD, patientD - def.range);
        else if (u.cooldown === 0) {
          change(patient, def.heal);
          rearm();
          s.events.push({ t: "heal", id: u.id, team: u.team, x1: u.x, y1: u.y, x2: patient.x, y2: patient.y });
        }
      } else if (threatD > RULES.healerHoldRange && Math.abs(u.x - hqX(enemyTeam)) > RULES.healerHoldRange) advance();
      continue;
    }

    // Keep the current target while it stays close; otherwise take the nearest enemy.
    const acquire = Math.max(RULES.acquireRange, def.range + RULES.acquirePad);
    let target = u.target ? byId.get(u.target) : undefined;
    if (target) { const d = reach(target); if (d < 0 || d > acquire) target = undefined; }
    if (!target) target = nearestEnemyD <= acquire ? nearestEnemy : undefined;
    const targetD = target ? dist(u.x, u.y, target.x, target.y) : Infinity;
    u.target = target ? target.id : 0;

    if (target) {
      if (targetD > def.range) moveToward(target.x, target.y, targetD, targetD - def.range);
      else if (u.cooldown === 0) { rearm(); strike(u, def, target); }
    } else if (tooClose) {
      // A war engine with the enemy under its nose can only wait for help.
    } else {
      // The HQ spans the lane width, so only distance along the lane matters.
      const hx = hqX(enemyTeam);
      if (Math.abs(u.x - hx) - MAP.hqRadius <= def.range) {
        if (u.cooldown === 0) {
          rearm();
          const dmg = def.damage + Math.trunc((def.damage * (def.bonus?.structure ?? 0)) / 100);
          hqDamage[enemyTeam] += dmg * (overtime ? RULES.overtimeHqDamageMult : 1);
          s.events.push({ t: "shot", id: u.id, unit: u.type, team: u.team, to: 0, x1: u.x, y1: u.y, x2: hx, y2: u.y });
        }
      } else advance();
    }
  }
  for (const apply of afflict) apply();
  for (const [u, dx, dy] of moves) { u.x += dx; u.y = Math.max(500, Math.min(LANE_WIDTH - 500, u.y + dy)); }

  // Mercenaries are paid as far as the middle of the lane: there the contract ends and they walk off.
  const half = MAP.laneLength / 2;
  s.units = s.units.filter(u => {
    if (!UNITS[u.type]!.merc || (u.team === 0 ? u.x < half : u.x > half)) return true;
    s.events.push({ t: "leave", unit: u.type, team: u.team, x: u.x, y: u.y });
    delta.delete(u);
    return false;
  });

  // Gravekeepers walk to their next job (or to where they were sent) and raise the chantry the moment they arrive.
  for (const k of s.keepers) {
    const job = k.jobs[0], goal = job ? { ...cellCenter(k.team, job.col, job.row), lane: job.lane } : { x: k.tx, y: k.ty, lane: k.tlane };
    if (k.lane !== goal.lane) { // cross to the neighbouring lane's ground over the shared edge
      const down = goal.lane > k.lane, edge = down ? LANE_WIDTH - 500 : 500;
      if (k.y === edge) { k.lane += down ? 1 : -1; k.y = down ? 500 : LANE_WIDTH - 500; }
      else k.y += Math.max(-RULES.keeperSpeed, Math.min(RULES.keeperSpeed, edge - k.y));
      continue;
    }
    const d = dist(k.x, k.y, goal.x, goal.y), reach = job ? RULES.keeperReach : 0;
    if (d > reach) {
      const m = Math.min(RULES.keeperSpeed, d - reach);
      k.x += Math.trunc(((goal.x - k.x) * m) / d); k.y += Math.trunc(((goal.y - k.y) * m) / d);
      if (m === RULES.keeperSpeed) continue; // still on the way; a shorter last step means it has arrived
      if (!job) { k.x = goal.x; k.y = goal.y; }
    }
    if (!job) continue;
    k.jobs.shift(); k.tlane = k.lane; k.tx = k.x; k.ty = k.y;
    if (canBuild(s, k.team, job.lane, job.col, job.row)) {
      s.buildings.push({ id: s.nextId++, owner: k.owner, team: k.team, lane: job.lane, col: job.col, row: job.row, unit: job.unit, readyTick: s.tick, produced: false });
      s.events.push({ t: "built", player: k.owner, slot: k.slot, unit: job.unit, lane: job.lane, x: goal.x, y: goal.y });
    } else s.players[k.owner]!.credits += UNITS[job.unit]!.cost;
  }

  // Units keep a little room around themselves, so lines form instead of one stacked blob. Flyers only crowd flyers.
  const room = RULES.unitSpacing;
  for (let i = 0; i < s.units.length; i++) {
    const a = s.units[i]!, aFlies = UNITS[a.type]!.flying === true;
    for (let j = i + 1; j < s.units.length; j++) {
      const b = s.units[j]!, dx = b.x - a.x, dy = b.y - a.y;
      if (a.team !== b.team || a.lane !== b.lane || isStructure(a) || isStructure(b) || Math.abs(dx) >= room || Math.abs(dy) >= room) continue;
      if (aFlies !== (UNITS[b.type]!.flying === true)) continue;
      const d = dist(a.x, a.y, b.x, b.y);
      if (d >= room) continue;
      const push = Math.min(RULES.separationStep, (room - d + 1) >> 1);
      const px = d === 0 ? 0 : Math.trunc((dx * push) / d), py = d === 0 ? push : Math.trunc((dy * push) / d);
      a.x -= px; a.y -= py; b.x += px; b.y += py;
    }
  }
  for (const u of s.units) if (!isStructure(u)) u.y = Math.max(500, Math.min(LANE_WIDTH - 500, u.y));

  // Headquarters guns: shoot the nearest enemy in range.
  for (const team of [0, 1] as const) {
    const hq = s.teams[team];
    if (hq.hqCooldown > 0) hq.hqCooldown--;
    if (overtime || hq.hqCooldown > 0) continue;
    const hx = hqX(team);
    let best: UnitState | undefined, bestD = RULES.hqRange + MAP.hqRadius;
    for (const u of s.units) {
      const d = Math.abs(u.x - hx);
      if (u.team !== team && d <= bestD) { best = u; bestD = d; }
    }
    if (best) {
      change(best, -Math.max(1, RULES.hqDamage - UNITS[best.type]!.armor));
      hq.hqCooldown = RULES.hqInterval;
      s.events.push({ t: "shot", id: 0, unit: "hq", team, to: best.id, x1: hx, y1: LANE_WIDTH / 2, x2: best.x, y2: best.y });
    }
  }

  // Apply damage/healing, remove the dead; some of the dead leave something behind.
  for (const [u, d] of delta) u.hp = Math.min(UNITS[u.type]!.hp, u.hp + d);
  if (delta.size > 0) {
    const dead: UnitState[] = [];
    s.units = s.units.filter(u => u.hp > 0 || (dead.push(u), false));
    for (const u of dead) {
      const def = UNITS[u.type]!;
      s.events.push({ t: "death", unit: u.type, team: u.team, x: u.x, y: u.y });
      if (def.spawnOnDeath) for (let i = 0; i < def.spawnOnDeath.count; i++) {
        const [ox, oy] = SCATTER[i % SCATTER.length]!;
        addUnit(s, def.spawnOnDeath.unit, u.owner, u.team, u.lane, u.x + (u.team === 0 ? ox : -ox), Math.max(500, Math.min(LANE_WIDTH - 500, u.y + oy)));
      }
    }
    // Raise Dead: nearest ready necromancer first, whatever order the dead fell in; at equal distance an enemy's corpse comes first.
    const claims: { corpse: UnitState; by: UnitState; d: number }[] = [];
    for (const u of dead) {
      const def = UNITS[u.type]!;
      if (def.structure || def.summoned || def.flying) continue; // nothing to raise
      for (const n of s.units) {
        const raise = UNITS[n.type]!.raise;
        if (!raise || n.abilityCd > 0 || n.lane !== u.lane) continue;
        const d = dist(n.x, n.y, u.x, u.y);
        if (d <= raise.radius) claims.push({ corpse: u, by: n, d });
      }
    }
    claims.sort((p, q) => p.d - q.d || Number(p.by.team === p.corpse.team) - Number(q.by.team === q.corpse.team));
    const risen = new Set<UnitState>();
    for (const { corpse, by } of claims) {
      if (risen.has(corpse) || by.abilityCd > 0) continue;
      const raise = UNITS[by.type]!.raise!;
      risen.add(corpse); by.abilityCd = raise.cooldown;
      addUnit(s, raise.unit, by.owner, by.team, corpse.lane, corpse.x, corpse.y);
      s.events.push({ t: "raise", team: by.team, x: corpse.x, y: corpse.y });
    }
  }
  if (overtime && s.tick % TICK_RATE === 0) // sudden death: the cathedrals crumble, faster for whoever holds less ground
    for (const team of [0, 1] as const) hqDamage[team] += RULES.overtimeDecay * (1 + s.beacons.filter(b => b.owner === 1 - team).length);
  s.teams[0].hqHp = Math.max(0, s.teams[0].hqHp - hqDamage[0]);
  s.teams[1].hqHp = Math.max(0, s.teams[1].hqHp - hqDamage[1]);

  // Beacons flip to a team that stands on them uncontested. Flyers pass overhead and hold nothing.
  for (const b of s.beacons) {
    let has0 = false, has1 = false;
    for (const u of s.units) {
      if (u.lane !== b.lane || Math.abs(u.x - b.x) > MAP.captureRadius || UNITS[u.type]!.flying) continue;
      if (u.team === 0) has0 = true; else has1 = true;
    }
    const owner: TeamId | null = has0 && !has1 ? 0 : has1 && !has0 ? 1 : b.owner;
    if (owner !== b.owner && owner !== null) { b.owner = owner; s.events.push({ t: "capture", beacon: b.id, team: owner }); }
  }

  s.tick++;

  for (const p of s.players) {
    if (p.research && s.tick >= p.research.doneTick) {
      const { tier, unit } = p.research;
      if (unit) p.unlocked.push(unit); else p.tier = tier;
      p.research = null;
      s.events.push({ t: "researched", player: p.id, tier, unit });
    }
  }
  if (s.tick % RULES.incomeIntervalTicks === 0) for (const p of s.players) p.credits += incomeOf(s, p.id);
  if (s.tick % RULES.waveIntervalTicks === 0) {
    for (const b of s.buildings) {
      const pos = cellCenter(b.team, b.col, b.row), count = UNITS[b.unit]!.count ?? 1;
      b.produced = true;
      for (let i = 0; i < count; i++) {
        const [ox, oy] = count > 1 ? SCATTER[i % SCATTER.length]! : [0, 0];
        addUnit(s, b.unit, b.owner, b.team, b.lane, pos.x + (b.team === 0 ? ox : -ox), pos.y + oy);
      }
    }
    s.events.push({ t: "wave" });
  }

  const dead0 = s.teams[0].hqHp <= 0, dead1 = s.teams[1].hqHp <= 0;
  if (dead0 && dead1) {
    // Both fell on the same tick: a seeded coin flip keeps it fair and deterministic.
    const rng = new Rng(s.rngState);
    s.winner = rng.int(2) as TeamId;
    s.rngState = rng.state;
  } else if (dead0) s.winner = 1;
  else if (dead1) s.winner = 0;
}
