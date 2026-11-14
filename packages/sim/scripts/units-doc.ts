/**
 * Prints the unit tables of docs/UNITS.md from data.ts, so the document never drifts from the game:
 *   ../../node_modules/.bin/tsx scripts/units-doc.ts
 */
import { RESEARCH, TICK_RATE, UNITS, UNIT_RESEARCH, unitsOfTier } from "../src/index";

const ROMAN = ["", "I", "II", "III"];
const perSec = (n: number, interval: number) => Math.round((n * TICK_RATE) / interval);
for (const tier of [1, 2, 3]) {
  const study = UNIT_RESEARCH[tier]!, rite = RESEARCH[tier];
  console.log(`\n### Tier ${ROMAN[tier]}\n`);
  console.log(`${rite ? `Opened by ${tier === 2 ? "the Second Rite" : "the Third Rite"} (${rite.cost} gold, ${rite.ticks / TICK_RATE} s). ` : ""}Each study costs ${study.cost} gold and takes ${study.ticks / TICK_RATE} s${tier === 1 ? "; the first three units are known from the start" : ""}.\n`);
  console.log("| Key | Unit | Cost | Health | Armor | Attack | Reach | Speed | Hits air | Ability |");
  console.log("|---|---|---:|---:|---:|---|---:|---:|---|---|");
  unitsOfTier(tier).forEach((id, i) => {
    const d = UNITS[id]!;
    const attack = d.heal ? `mends ${perSec(d.heal, d.interval)}/s` : d.damage === 0 ? "none" : `${d.damage} every ${d.interval / TICK_RATE} s (${perSec(d.damage, d.interval)}/s)`;
    console.log(`| ${i + 1} | **${d.name}**${d.free ? " (known)" : ""}${d.flying ? " (flies)" : ""}${d.count ? ` (×${d.count})` : ""} | ${d.cost} | ${d.hp} | ${d.armor} | ${attack} | ${d.range / 1000} | ${(d.speed * TICK_RATE) / 1000} | ${d.damage === 0 ? "–" : d.air ? "yes" : "no"} | ${d.ability} |`);
  });
}
