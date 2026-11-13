import { Rng } from "./rng";
import { INVEST_TIERS, LANE_WIDTH, MAP, RESEARCH, RULES, UNITS } from "./data";
import type { BeaconState, Command, GameConfig, GameState, PlayerId, TeamId, TimedCommand, UnitState } from "./types";

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
export function sellRefund(unit: string, produced: boolean): number {
  return Math.floor((UNITS[unit]!.cost * (produced ? RULES.sellRefundUsedPct : RULES.sellRefundFreshPct)) / 100);
}

export function createGame(cfg: GameConfig): GameState {
  const n = cfg.teamSize;
  const laneCount = cfg.lanes ?? 1;
  let nextId = 1;
  const beacons: BeaconState[] = [];
  const units: UnitState[] = [];
  const lastB = MAP.beaconX.length - 1;
  for (let lane = 0; lane < laneCount; lane++) {
    // Each team starts holding the shrine nearest its cathedral, guarded by two towers.
    MAP.beaconX.forEach((x, i) => beacons.push({ id: nextId++, lane, x, owner: (i === 0 ? 0 : i === lastB ? 1 : null) as TeamId | null }));
    // ...and two more guard the front of its building ground, so the cathedral has a last line of defence.
    const shrineLocal = MAP.beaconX[0]! + MAP.towerAhead, baseLocal = baseTowerLocalX();
    for (const team of [0, 1] as const)
      for (const [local, ys] of [[baseLocal, MAP.baseTowerY], [shrineLocal, MAP.towerY]] as const) for (const y of ys)
        units.push({ id: nextId++, type: "tower", owner: team === 0 ? 0 : n, team, lane,
          x: team === 0 ? local : MAP.laneLength - local, y, hp: UNITS.tower!.hp, cooldown: 0, target: 0 });
  }
  return {
    tick: 0, rngState: cfg.seed >>> 0, nextId, teamSize: n, laneCount,
    players: Array.from({ length: n * 2 }, (_, i) => ({
      id: i, team: (i < n ? 0 : 1) as TeamId, lane: (i % n) % laneCount,
      credits: RULES.startCredits, tier: 1, research: null,
      invest: Array.from({ length: laneCount }, () => 0),
      isAI: cfg.aiSlots?.includes(i) ?? false,
    })),
    teams: [{ hqHp: RULES.hqHp, hqCooldown: 0 }, { hqHp: RULES.hqHp, hqCooldown: 0 }],
    beacons, buildings: [], units, events: [], winner: null,
  };
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
  if (r.type === "build") return typeof r.unit === "string" && Object.hasOwn(UNITS, r.unit) && int(r.col) && int(r.row) ? { type: "build", unit: r.unit, col: r.col, row: r.row, ...lane } : null;
  if (r.type === "sell") return int(r.buildingId) ? { type: "sell", buildingId: r.buildingId } : null;
  if (r.type === "invest") return { type: "invest", ...lane };
  if (r.type === "research") return { type: "research" };
  return null;
}

function applyCommand(s: GameState, player: PlayerId, c: Command): void {
  const me = s.players[player];
  if (!me) return;
  if (c.type === "build") {
    const def = Object.hasOwn(UNITS, c.unit) ? UNITS[c.unit] : undefined;
    const lane = c.lane ?? me.lane;
    if (!def || def.structure || def.tier > me.tier || me.credits < def.cost) return;
    if (!Number.isInteger(lane) || lane < 0 || lane >= s.laneCount) return;
    if (!canBuild(s, me.team, lane, c.col, c.row)) return;
    me.credits -= def.cost;
    s.buildings.push({ id: s.nextId++, owner: player, team: me.team, lane, col: c.col, row: c.row,
      unit: def.id, readyTick: s.tick + RULES.buildTicks, produced: false });
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
    const next = RESEARCH[me.tier + 1];
    if (!next || me.research || me.credits < next.cost) return;
    me.credits -= next.cost;
    me.research = { tier: me.tier + 1, startTick: s.tick, doneTick: s.tick + next.ticks };
  }
}

const dist = (ax: number, ay: number, bx: number, by: number): number => {
  const dx = ax - bx, dy = ay - by;
  return Math.floor(Math.sqrt(dx * dx + dy * dy));
};
const isStructure = (u: UnitState): boolean => UNITS[u.type]!.structure === true;
/** How far `o` is for noticing it. A structure is noticed by distance along the lane only, so nobody slips past it. */
const noticeDist = (u: UnitState, o: UnitState): number => (isStructure(o) ? Math.abs(u.x - o.x) : dist(u.x, u.y, o.x, o.y));

/** Advance exactly one tick. Deterministic in (state, commands). Mutates `s` in place for speed. */
export function step(s: GameState, commands: TimedCommand[] = []): void {
  if (s.winner !== null) return;
  s.events = [];
  for (const { player, cmd } of commands) applyCommand(s, player, cmd);

  const overtime = s.tick >= RULES.overtimeTick;
  const byId = new Map<number, UnitState>();
  for (const u of s.units) byId.set(u.id, u);
  // Damage and healing are collected and applied after every unit has acted, so
  // array order gives neither team a first-strike advantage.
  const delta = new Map<UnitState, number>();
  const hqDamage: [number, number] = [0, 0];
  const hurt = (target: UnitState, amount: number) =>
    delta.set(target, (delta.get(target) ?? 0) - Math.max(1, amount - UNITS[target.type]!.armor));

  for (const u of s.units) {
    const def = UNITS[u.type]!;
    const dir = u.team === 0 ? 1 : -1;
    const enemyTeam = (1 - u.team) as TeamId;
    if (u.cooldown > 0) u.cooldown--;

    let nearestEnemy: UnitState | undefined, nearestEnemyD = Infinity;
    let patient: UnitState | undefined, patientD = Infinity;
    for (const o of s.units) {
      if (o.lane !== u.lane || o === u) continue;
      if (o.team !== u.team) { const d = noticeDist(u, o); if (d < nearestEnemyD) { nearestEnemy = o; nearestEnemyD = d; } }
      else if (def.heal > 0 && !isStructure(o) && o.hp < UNITS[o.type]!.hp) {
        const d = dist(u.x, u.y, o.x, o.y);
        if (d < patientD) { patient = o; patientD = d; }
      }
    }
    const moveToward = (tx: number, ty: number, d: number, want: number) => {
      const m = Math.min(def.speed, want);
      if (d <= 0 || m <= 0) return;
      u.x += Math.trunc(((tx - u.x) * m) / d);
      u.y = Math.max(500, Math.min(LANE_WIDTH - 500, u.y + Math.trunc(((ty - u.y) * m) / d)));
    };
    const advance = () => { u.x += dir * def.speed; };

    if (def.heal > 0) {
      const reach = def.range + RULES.acquirePad;
      if (patient && patientD <= reach) {
        if (patientD > def.range) moveToward(patient.x, patient.y, patientD, patientD - def.range);
        else if (u.cooldown === 0) {
          delta.set(patient, (delta.get(patient) ?? 0) + def.heal);
          u.cooldown = def.interval;
          s.events.push({ t: "heal", id: u.id, team: u.team, x1: u.x, y1: u.y, x2: patient.x, y2: patient.y });
        }
      } else if (nearestEnemyD > RULES.healerHoldRange && Math.abs(u.x - hqX(enemyTeam)) > RULES.healerHoldRange) advance();
      continue;
    }

    // Keep the current target while it stays close; otherwise take the nearest enemy.
    const acquire = Math.max(RULES.acquireRange, def.range + RULES.acquirePad);
    let target = u.target ? byId.get(u.target) : undefined;
    if (!target || noticeDist(u, target) > acquire) target = nearestEnemyD <= acquire ? nearestEnemy : undefined;
    const targetD = target ? dist(u.x, u.y, target.x, target.y) : Infinity;
    u.target = target ? target.id : 0;

    if (target) {
      if (targetD > def.range) moveToward(target.x, target.y, targetD, targetD - def.range);
      else if (u.cooldown === 0) {
        u.cooldown = def.interval;
        if (def.splash > 0) {
          for (const o of s.units)
            if (o.team !== u.team && o.lane === u.lane && dist(o.x, o.y, target.x, target.y) <= def.splash) hurt(o, def.damage);
        } else hurt(target, def.damage);
        s.events.push({ t: "shot", id: u.id, unit: u.type, team: u.team, x1: u.x, y1: u.y, x2: target.x, y2: target.y });
      }
    } else {
      // The HQ spans the lane width, so only distance along the lane matters.
      const hx = hqX(enemyTeam);
      if (Math.abs(u.x - hx) - MAP.hqRadius <= def.range) {
        if (u.cooldown === 0) {
          u.cooldown = def.interval;
          hqDamage[enemyTeam] += def.damage * (overtime ? RULES.overtimeHqDamageMult : 1);
          s.events.push({ t: "shot", id: u.id, unit: u.type, team: u.team, x1: u.x, y1: u.y, x2: hx, y2: u.y });
        }
      } else advance();
    }
  }

  // Units keep a little room around themselves, so lines form instead of one stacked blob.
  const room = RULES.unitSpacing;
  for (let i = 0; i < s.units.length; i++) {
    const a = s.units[i]!;
    for (let j = i + 1; j < s.units.length; j++) {
      const b = s.units[j]!, dx = b.x - a.x, dy = b.y - a.y;
      if (a.team !== b.team || a.lane !== b.lane || isStructure(a) || isStructure(b) || Math.abs(dx) >= room || Math.abs(dy) >= room) continue;
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
      hurt(best, RULES.hqDamage);
      hq.hqCooldown = RULES.hqInterval;
      s.events.push({ t: "shot", id: 0, unit: "hq", team, x1: hx, y1: LANE_WIDTH / 2, x2: best.x, y2: best.y });
    }
  }

  // Apply damage/healing, remove the dead.
  for (const [u, d] of delta) u.hp = Math.min(UNITS[u.type]!.hp, u.hp + d);
  if (delta.size > 0) {
    const alive: UnitState[] = [];
    for (const u of s.units) {
      if (u.hp > 0) alive.push(u);
      else s.events.push({ t: "death", unit: u.type, team: u.team, x: u.x, y: u.y });
    }
    s.units = alive;
  }
  s.teams[0].hqHp = Math.max(0, s.teams[0].hqHp - hqDamage[0]);
  s.teams[1].hqHp = Math.max(0, s.teams[1].hqHp - hqDamage[1]);

  // Beacons flip to a team that stands on them uncontested.
  for (const b of s.beacons) {
    let has0 = false, has1 = false;
    for (const u of s.units) {
      if (u.lane !== b.lane || Math.abs(u.x - b.x) > MAP.captureRadius) continue;
      if (u.team === 0) has0 = true; else has1 = true;
    }
    const owner: TeamId | null = has0 && !has1 ? 0 : has1 && !has0 ? 1 : b.owner;
    if (owner !== b.owner && owner !== null) { b.owner = owner; s.events.push({ t: "capture", beacon: b.id, team: owner }); }
  }

  s.tick++;

  for (const p of s.players) {
    if (p.research && s.tick >= p.research.doneTick) {
      p.tier = p.research.tier; p.research = null;
      s.events.push({ t: "researched", player: p.id, tier: p.tier });
    }
  }
  if (s.tick % RULES.incomeIntervalTicks === 0) for (const p of s.players) p.credits += incomeOf(s, p.id);
  if (s.tick % RULES.waveIntervalTicks === 0) {
    for (const b of s.buildings) {
      if (b.readyTick > s.tick) continue;
      const pos = cellCenter(b.team, b.col, b.row);
      b.produced = true;
      s.units.push({ id: s.nextId++, type: b.unit, owner: b.owner, team: b.team, lane: b.lane,
        x: pos.x, y: pos.y, hp: UNITS[b.unit]!.hp, cooldown: 0, target: 0 });
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
