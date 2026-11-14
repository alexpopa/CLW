/**
 * Prints the balance report used to tune packages/sim/src/data.ts:
 *   ../../node_modules/.bin/tsx scripts/balance.ts [gold]
 * Every buildable fighting unit meets every other with equal gold; each cell is the row unit's margin
 * (% of its value left minus % of the column's value left). The last columns sum up each unit.
 */
import { UNITS, UNIT_ORDER, clash, massOf } from "../src/index";
import type { Army } from "../src/index";

const gold = Number(process.argv[2] ?? 3300);
/** "mixed": half of each side's gold goes to a plain escort (arbalesters behind a front-line unit, oathguards before anything else). */
const mixed = process.argv[3] === "mixed";
const field = (id: string): Army => {
  if (!mixed) return massOf(id, gold);
  const escort = UNITS[id]!.role === "front" ? "arbalester" : "oathguard";
  const a = massOf(id, gold / 2), b = massOf(escort, gold / 2);
  return { ...b, [id]: (a[id] ?? 0) + (b[id] ?? 0) };
};
const ids = UNIT_ORDER.filter(id => UNITS[id]!.damage > 0);
const short = (id: string) => id.slice(0, 5).padStart(6);
console.log(`Equal-gold clashes (${gold} gold a side${mixed ? ", half spent on an escort" : ""}). + = row wins.\n`);
console.log(" ".repeat(12) + ids.map(short).join("") + "    avg  wins  best counter");
for (const a of ids) {
  let sum = 0, wins = 0, worst = 2, worstId = "";
  const cells = ids.map(b => {
    if (a === b) return "     ·";
    const m = clash(field(a), field(b)).margin;
    sum += m; if (m > 0.05) wins++;
    if (m < worst) { worst = m; worstId = b; }
    return String(Math.round(m * 100)).padStart(6);
  });
  console.log(`${UNITS[a]!.tier} ${a.padEnd(10)}${cells.join("")} ${String(Math.round((sum / (ids.length - 1)) * 100)).padStart(6)} ${String(wins).padStart(5)}  ${worstId} (${Math.round(worst * 100)})`);
}
