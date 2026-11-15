/**
 * Prints the unit tables of docs/UNITS.md from data.ts, so the document never drifts from the game:
 *   ../../node_modules/.bin/tsx scripts/units-doc.ts
 */
import { MERC_ORDER, RESEARCH, TICK_RATE, UNITS, UNIT_RESEARCH, unitsOfTier } from "../src/index";

const ROMAN = ["", "I", "II", "III", "IV"];
const RITE = ["", "", "the Second Rite", "the Third Rite", "the Fourth Rite"];
const KEYS = ["3", "4", "5", "6", "7", "8", "9", "0"];
const perSec = (n: number, interval: number) => Math.round((n * TICK_RATE) / interval);
for (const tier of [1, 2, 3, 4]) {
  const study = UNIT_RESEARCH[tier]!, rite = RESEARCH[tier];
  console.log(`\n### Tier ${ROMAN[tier]}\n`);
  console.log(`${rite ? `Opened by ${RITE[tier]} (${rite.cost} gold, ${rite.ticks / TICK_RATE} s). ` : ""}${tier === 4 ? "Only the Undertaker can raise these. " : ""}Each study costs ${study.cost} gold and takes ${study.ticks / TICK_RATE} s${tier === 1 ? "; the first three units are known from the start" : ""}.\n`);
  console.log("| Key | Unit | Cost | Health | Armor | Attack | Reach | Speed | Hits air | Ability |");
  console.log("|---|---|---:|---:|---:|---|---:|---:|---|---|");
  unitsOfTier(tier).forEach((id, i) => {
    const d = UNITS[id]!;
    const attack = d.heal ? `mends ${perSec(d.heal, d.interval)}/s` : d.damage === 0 ? "none" : `${d.damage} every ${d.interval / TICK_RATE} s (${perSec(d.damage, d.interval)}/s)`;
    console.log(`| ${KEYS[i]} | **${d.name}**${d.free ? " (known)" : ""}${d.flying ? " (flies)" : ""}${d.count ? ` (×${d.count})` : ""} | ${d.cost} | ${d.hp} | ${d.armor} | ${attack} | ${d.range / 1000} | ${(d.speed * TICK_RATE) / 1000} | ${d.damage === 0 ? "–" : d.air ? "yes" : "no"} | ${d.ability} |`);
  });
}

console.log("\n### Mercenaries\n");
console.log("| Key | Band | Hire | Soldiers | Health | Armor | Attack | Reach | Hits air | Notes |");
console.log("|---|---|---:|---:|---:|---:|---|---:|---|---|");
MERC_ORDER.forEach((id, i) => {
  const d = UNITS[id]!;
  console.log(`| ${KEYS[i]} | **${d.name}** | ${d.cost} | ${d.count ?? 1} | ${d.hp} | ${d.armor} | ${d.damage} every ${d.interval / TICK_RATE} s (${perSec(d.damage, d.interval)}/s)${d.splash ? " in an area" : ""} | ${d.range / 1000} | ${d.air ? "yes" : "no"} | ${d.blurb} |`);
});
