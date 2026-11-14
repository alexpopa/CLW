/**
 * Balance tuner: reprices each fighting unit until its average equal-gold result
 * (massed, and with an escort) sits at its tier's target, then prints the numbers to copy into data.ts.
 *   ../../node_modules/.bin/tsx scripts/tune.ts [rounds]
 * It only sets overall strength; who counters whom comes from the abilities and is checked by balance.test.ts.
 */
import { UNITS, UNIT_ORDER, clash, massOf, stream } from "../src/index";
import type { Army } from "../src/index";

const TARGET: Record<number, number> = { 1: -0.06, 2: 0, 3: 0.06 }; // later tiers cost research, so they may be a little better
const ids = UNIT_ORDER.filter(id => UNITS[id]!.damage > 0);
const escorted = (id: string, gold: number): Army => {
  const escort = UNITS[id]!.role === "front" ? "arbalester" : "oathguard";
  const a = massOf(id, gold / 2), b = massOf(escort, gold / 2);
  return { ...b, [id]: (a[id] ?? 0) + (b[id] ?? 0) };
};
export function averages(): Record<string, number> {
  const sum: Record<string, number> = Object.fromEntries(ids.map(id => [id, 0]));
  for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) {
    const a = ids[i]!, b = ids[j]!;
    const m = (clash(massOf(a, 3300), massOf(b, 3300)).margin + clash(escorted(a, 4000), escorted(b, 4000)).margin) / 2;
    sum[a]! += m; sum[b]! -= m;
  }
  for (const id of ids) sum[id]! /= ids.length - 1;
  return sum;
}
/**
 * "lane" mode: every unit takes its place in a plain standing army on the real lane (a front-line unit with
 * arbalesters behind it, a ranged unit behind oathguards, a support unit as a fifth of an oathguard-and-arbalester army)
 * and meets every other unit doing the same, wave after wave, for eight minutes. Slower, but it counts towers, travel and reinforcement.
 */
const all = [...UNIT_ORDER];
const army = (id: string, gold: number): Army => {
  const d = UNITS[id]!, a: Army = {};
  const add = (unit: string, share: number) => { a[unit] = (a[unit] ?? 0) + massOf(unit, gold * share)[unit]!; };
  if (d.damage === 0) { add(id, 0.2); add("oathguard", 0.4); add("arbalester", 0.4); }
  else { add(id, 0.5); add(d.role === "front" ? "arbalester" : "oathguard", 0.5); }
  return a;
};
/** Three army sizes per pairing: one match snowballs, and whole chantries make any single size lumpy. */
const SIZES = [2800, 3400, 4000];
const pairs: [string, string][] = [];
for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) pairs.push([all[i]!, all[j]!]);
const laneResult = (a: string, b: string): number => SIZES.reduce((sum, gold) => sum + stream(army(a, gold), army(b, gold), 8).score, 0) / SIZES.length;
const rounds = Number(process.argv[2] ?? 8), mode = process.argv[3];
if (mode === "shard") { // worker: play every n-th pairing with the costs handed down, print the results
  const [, , , , k, n] = process.argv;
  for (const [id, cost] of Object.entries(JSON.parse(process.env.COSTS!) as Record<string, number>)) UNITS[id]!.cost = cost;
  console.log(JSON.stringify(pairs.map((p, i) => (i % Number(n) === Number(k) ? laneResult(p[0], p[1]) : null))));
  process.exit(0);
}
if (mode === "lane") {
  const { spawn } = await import("node:child_process");
  const workers = 8;
  for (let r = 0; r <= rounds; r++) {
    const costs = JSON.stringify(Object.fromEntries(all.map(id => [id, UNITS[id]!.cost])));
    const parts = await Promise.all(Array.from({ length: workers }, (_, k) => new Promise<(number | null)[]>((resolve, reject) => {
      const child = spawn(process.execPath, [...process.execArgv, process.argv[1]!, "0", "shard", String(k), String(workers)], { env: { ...process.env, COSTS: costs } });
      let out = ""; child.stdout.on("data", d => (out += d)); child.stderr.on("data", d => process.stderr.write(d));
      child.on("close", code => (code === 0 ? resolve(JSON.parse(out)) : reject(new Error(`worker ${k} failed`))));
    })));
    const avg: Record<string, number> = Object.fromEntries(all.map(id => [id, 0]));
    pairs.forEach(([a, b], i) => { const m = parts[i % workers]![i]!; avg[a]! += m; avg[b]! -= m; });
    for (const id of all) avg[id]! /= all.length - 1;
    console.log(`round ${r}: ` + all.map(id => `${id.slice(0, 5)} ${Math.round(avg[id]! * 100)}`).join("  "));
    if (r === rounds) break;
    for (const id of all) { const d = UNITS[id]!; d.cost = Math.max(60, Math.round((d.cost * Math.exp(0.22 * (avg[id]! - TARGET[d.tier]!))) / 5) * 5); }
    console.log("  costs: " + all.map(id => `${id} ${UNITS[id]!.cost}`).join(", "));
  }
  process.exit(0);
}
for (let r = 0; r <= rounds; r++) {
  const avg = averages();
  console.log(`round ${r}: ` + ids.map(id => `${id.slice(0, 5)} ${Math.round(avg[id]! * 100)}`).join("  "));
  if (r === rounds) break;
  for (const id of ids) { // too strong for its gold: make it dearer; too weak: cheaper
    const d = UNITS[id]!;
    d.cost = Math.max(60, Math.round((d.cost * Math.exp(0.5 * (avg[id]! - TARGET[d.tier]!))) / 5) * 5);
  }
}
console.log("\n" + ids.map(id => `${id}: cost ${UNITS[id]!.cost}`).join(", "));
