import { SR, arc, brown, buf, chance, crackle, drive, env, fadeOut, filter, gain, glide, hump, mix, modes, noise, normalize, osc, pick, pluck, rand, shape, vocal, whisper, wobble } from "./audio-dsp";
import type { Buf, Mode, Vowel } from "./audio-dsp";

/**
 * Every sound effect in the game, as a recipe that synthesizes one take of it. Each recipe is rendered a few times
 * with fresh randomness so that no two crossbows, swords or deaths sound quite alike. Presentation only.
 */

// ---- building blocks ----------------------------------------------------------------------------------------

const done = (d: Buf, peak = 0.9): Buf => normalize(fadeOut(d), peak);
/** Several parts laid over one another, each [sound, start (s), gain], in a buffer long enough for all of them. */
const layer = (...parts: [Buf, number?, number?][]): Buf => {
  const d = buf(Math.max(...parts.map(([b, at = 0]) => at + b.length / SR)) + 0.01);
  for (const [b, at = 0, g = 1] of parts) mix(d, b, at, g);
  return d;
};
/** Air cut by something swung or thrown: band-passed noise whose pitch and loudness swell and fall. */
const swish = (dur: number, lo: number, hi: number, amp = 1, q = 1.3): Buf => {
  const h = hump(0, dur, 0.62);
  return shape(filter(noise(dur), "bp", t => lo + (hi - lo) * h(t), q), t => amp * h(t));
};
/** A low body blow: a falling sine with a hard front. */
const thump = (dur: number, f0: number, f1: number, amp = 1): Buf => gain(env(osc(dur, glide(f0, f1, dur * 0.5)), 0.0015, dur), amp);
/** A tiny burst of high grit: the front edge of a hit. */
const tick = (dur = 0.005, hp = 3000, amp = 1): Buf => gain(env(filter(noise(dur + 0.01), "hp", hp), 0.0003, dur), amp);
/** Struck steel: the inharmonic modes of a free bar and a plate, jittered so each blade is its own. */
const METAL = [1, 1.59, 2.14, 2.76, 3.6, 4.4, 5.4, 6.9, 8.93, 11.2] as const;
const metal = (base: number, t60: number, amp = 1, n = 8): Buf =>
  modes(t60 * 1.3 + 0.05, METAL.slice(0, n).map((r, i): Mode => [base * r * rand(0.97, 1.03), (amp * rand(0.45, 1)) / (1 + i * 0.45), (t60 * rand(0.7, 1.15)) / (1 + i * 0.22)]));
/** Knocked wood: a few short, hollow modes. */
const wood = (base: number, t60: number, amp = 1): Buf => {
  const d = modes(t60 + 0.05, [[base, amp, t60], [base * 2.57, amp * 0.5, t60 * 0.6], [base * 4.17, amp * 0.25, t60 * 0.4], [base * 6.1, amp * 0.12, t60 * 0.3]]);
  return mix(d, tick(0.003, 1500, amp * 0.6));
};
/** Stone hit stone: a gritty burst and a dull, quickly damped ring. */
const stone = (amp = 1, f = rand(380, 520)): Buf => {
  return layer([gain(env(filter(noise(0.12), "bp", rand(1300, 2000), 1.1), 0.0008, 0.06), amp)], [modes(0.15, [[f, 1, 0.07], [f * 2.7, 0.6, 0.05], [f * 5.3, 0.35, 0.03]]), 0, amp * 0.6]);
};
/** Falling grit and splinters, `density` clicks a second through a band around `f`. */
const debris = (dur: number, density: number, f: number, amp = 1): Buf =>
  gain(filter(crackle(dur, t => density * Math.exp((-3 * t) / dur), t => Math.exp((-2 * t) / dur), 0.004), "bp", f, 0.9), amp);
/** Bone on bone: dry hollow clicks, thinning out. */
const rattle = (dur: number, n: number, amp = 1): Buf => {
  const d = buf(dur + 0.1);
  for (let i = 0; i < n; i++) mix(d, wood(rand(900, 2300), rand(0.02, 0.05), rand(0.3, 1)), dur * Math.pow(Math.random(), 1.6), amp);
  return d;
};
/** A church bell: hum, prime, minor third, fifth, nominal and the bright upper partials, each with its own decay. */
const BELL: readonly (readonly [number, number, number])[] = [[0.5, 0.55, 1], [1, 1, 0.8], [1.19, 0.65, 0.6], [1.5, 0.4, 0.45], [2, 0.55, 0.38], [2.51, 0.3, 0.25], [2.66, 0.22, 0.22], [3.01, 0.2, 0.18], [4.17, 0.12, 0.12], [5.43, 0.08, 0.09]];
export const bellTone = (base: number, sec: number, amp = 1): Buf => {
  const d = modes(sec, BELL.map(([r, a, l]): Mode => [base * r * rand(0.998, 1.002), a * amp, sec * l]));
  mix(d, env(osc(sec, base * 1.003), 0.01, sec * 0.7), 0, amp * 0.15); // the strike beat against the prime
  return mix(d, gain(env(filter(noise(0.05), "bp", base * 6, 2), 0.0005, 0.04), amp * 0.5));
};
/** Fire: a roaring band of noise, a low body and a crackle of embers. */
const fire = (dur: number, lo: number, hi: number, amp = 1): Buf => {
  const d = buf(dur + 0.1), e = (t: number): number => (t < 0.05 ? t / 0.05 : Math.exp((-(t - 0.05) * 3.2) / dur));
  mix(d, shape(filter(noise(dur), "bp", t => lo + (hi - lo) * Math.min(1, t / (dur * 0.3)) * (1 + 0.2 * Math.sin(t * 37)), 0.55), e));
  mix(d, shape(filter(noise(dur), "lp", 240), e), 0, 0.9);
  mix(d, filter(crackle(dur, t => 110 * Math.exp((-2 * t) / dur), e, 0.002), "hp", 1700), 0.02, 0.6);
  return gain(d, amp);
};
/** A body falling: thump on the ground and a rustle of cloth. */
const fall = (amp = 1, low = 1): Buf => {
  const d = buf(0.35);
  mix(d, thump(0.22, 120 * low, 48 * low), 0, amp);
  return mix(d, env(filter(noise(0.2), "bp", 1300, 0.7), 0.01, 0.15), 0.01, amp * 0.3);
};
/** A man's cry or grunt. */
const cry = (dur: number, hi: number, lo: number, v: Vowel = pick(["a", "o", "e", "u"] as const), rough = 0.25): Buf =>
  shape(vocal(dur, glide(hi, lo, dur), v, { size: rand(0.92, 1.08), rough, breath: 0.3 }), t => (t < 0.03 ? t / 0.03 : Math.exp((-(t - 0.03) * 5) / dur)));
/** Gunpowder: flint on steel, the pan flash, a crack, the blast and its rolling echo. `size` 1 is a musket. */
const report = (size: number): Buf => {
  const d = buf(0.4 + 1.3 * size);
  mix(d, metal(rand(3200, 4200), 0.04, 0.35, 4));
  mix(d, env(filter(noise(0.06), "hp", 3000), 0.002, 0.05), 0.004, 0.25);
  const t0 = rand(0.02, 0.04);
  mix(d, drive(env(filter(noise(0.025), "hp", 700), 0.0003, 0.014), 3), t0, 1);
  mix(d, env(filter(noise(0.7 * size), "lp", glide(6000, 220, 0.25 * size)), 0.001, 0.35 * size), t0, 0.95);
  mix(d, env(osc(0.6 * size, glide(130 / size, 36, 0.3 * size)), 0.001, 0.4 * size), t0, 0.8 + 0.2 * size);
  mix(d, env(filter(brown(1.2 * size + 0.2), "lp", 650), 0.06, 1.1 * size), t0 + 0.05, 0.4);
  return done(drive(d, 1.7), 0.95);
};
/** A sung note, short: angelic flourishes. */
const choirHit = (freqs: number[], dur: number, amp: number): Buf => {
  const d = buf(dur);
  for (const f of freqs) mix(d, shape(vocal(dur, f, "a", { breath: 0.1 }), t => (t < 0.08 ? t / 0.08 : Math.exp((-(t - 0.08) * 4) / dur))), 0, amp);
  return d;
};
/** Friction squeal (gibbet, winch, a wooden arm): a stick-slip pulse train ringing resonant bodies. */
const creak = (dur: number, rate: (t: number) => number, body: number[]): Buf => {
  const d = buf(dur);
  let next = 0;
  for (let i = 0; i < d.length; i++) if (i >= next) { d[i] = rand(0.5, 1); next = i + Math.max(8, Math.round(SR / Math.max(4, rate(i / SR)))); }
  const out = buf(dur);
  for (const f of body) mix(out, filter(Float32Array.from(d), "bp", f * rand(0.95, 1.05), 9), 0, 1);
  return shape(out, hump(0, dur, 0.3));
};

const TAU22 = Math.PI * 2 * 22; // a bat's wingbeat

// ---- the recipes ----------------------------------------------------------------------------------------------

interface Recipe { make: () => Buf; takes?: number; gap?: number; gain?: number; wet?: number; pitch?: number; max?: number }

const R = {
  // the interface
  click: { make: () => done(layer([wood(rand(1500, 1800), 0.04)], [tick(0.002, 5000), 0, 0.3]), 0.5), takes: 2, wet: 0.05 },
  deny: { make: () => { const d = buf(0.4); mix(d, thump(0.2, 150, 90)); mix(d, env(filter(osc(0.3, 98, "saw"), "lp", 520), 0.005, 0.25), 0, 0.4); mix(d, wood(210, 0.12), 0.08, 0.5); return done(d, 0.7); }, takes: 1 },
  coin: { make: () => {
    const d = buf(0.8), clink = (f: number): Buf => mix(modes(0.6, [[f, 1, 0.4], [f * 1.47, 0.6, 0.3], [f * 2.09, 0.5, 0.22], [f * 2.56, 0.3, 0.15], [f * 3.9, 0.2, 0.08]]), tick(0.002, 4000, 0.5));
    [0, rand(0.06, 0.09), rand(0.15, 0.2)].forEach((t, i) => mix(d, clink(rand(2500, 3400)), t, 1 - i * 0.25));
    return done(d, 0.55);
  }, wet: 0.15 },
  build: { make: () => { // mallet and chisel on stone, then the course settles
    const d = buf(1.1);
    [0, 0.17, 0.34].forEach((t, i) => { mix(d, stone(1 - i * 0.1), t); mix(d, metal(rand(2400, 3000), 0.12, 0.3, 4), t); });
    mix(d, debris(0.5, 70, 1800, 0.35), 0.42); mix(d, thump(0.3, 90, 45), 0.42, 0.6);
    return done(d, 0.8);
  }, takes: 2, gap: 150, wet: 0.25 },
  teleport: { make: () => { // a rush of air drawn into the grave, a ghostly rising note, and he steps out
    const d = buf(1.5);
    mix(d, shape(filter(noise(1.2), "bp", glide(250, 2400, 1.0), 2.2), hump(0, 1.1, 0.85)), 0, 0.8);
    mix(d, env(osc(1.2, glide(110, 330, 0.9), "tri"), 0.6, 0.9), 0, 0.2);
    mix(d, thump(0.5, 120, 40), 0.9, 0.9);
    mix(d, modes(0.6, [[1760, 0.2, 0.8], [2637, 0.15, 0.6], [3520, 0.1, 0.5]]), 0.9);
    return done(d, 0.75);
  }, takes: 2, wet: 0.5 },
  study: { make: () => { // pages turned and a soft chime of understanding
    const d = buf(1.6), page = (): Buf => shape(filter(noise(0.22), "bp", glide(900, 3200, 0.2), 0.8), t => hump(0, 0.22, 0.4)(t) * (0.6 + 0.4 * Math.sin(t * 190)));
    mix(d, page(), 0, 0.5); mix(d, page(), 0.16, 0.4);
    mix(d, modes(1.3, [[1318.5, 0.3, 1.2], [1975.5, 0.2, 0.9], [2637, 0.12, 0.6]]), 0.3);
    return done(d, 0.6);
  }, takes: 1, wet: 0.4 },

  // weapons: the moment of the attack, as heard from the attacker
  xbow: { make: () => { // the latch, the thrum of a heavy string, the stock's thunk, the bolt away
    const d = buf(0.5);
    mix(d, tick(0.004, 2000), 0, 0.5);
    mix(d, drive(pluck(0.4, rand(140, 190), 0.16, 0.75), 2), 0.003, 0.8);
    mix(d, wood(rand(380, 460), 0.07), 0.002, 0.7);
    mix(d, swish(0.14, 1400, 3600, 0.35, 2), 0.01);
    return done(d, 0.8);
  }, takes: 4, gap: 45, gain: 0.55, max: 6 },
  ballista: { make: () => {
    const d = buf(0.9);
    mix(d, drive(pluck(0.7, rand(62, 74), 0.4, 0.6), 3), 0, 0.9);
    mix(d, wood(rand(160, 190), 0.15), 0, 1); mix(d, metal(rand(300, 380), 0.3, 0.3), 0, 0.5);
    mix(d, swish(0.32, 300, 1400, 0.6, 1.2), 0.02);
    return done(d, 0.9);
  }, gain: 0.8 },
  musket: { make: () => report(1), gain: 0.75, gap: 60, max: 5 },
  silver: { make: () => done(layer([report(1.3)], [metal(rand(1800, 2200), 0.5, 0.2, 5), 0.03]), 0.95), gain: 0.85, gap: 60 },
  cannon: { make: () => done(layer([report(2.3)], [fire(0.8, 200, 700, 0.35), 0.05]), 0.95), takes: 2, gain: 1, gap: 150 },
  flame: { make: () => done(fire(rand(0.4, 0.55), 350, 1300)), gap: 80, gain: 0.55, max: 5 },
  breath: { make: () => { // the wyrm draws breath with a growl, then lets the fire go
    const d = buf(1.4);
    mix(d, shape(vocal(0.9, glide(rand(70, 90), 48, 0.9), "o", { size: 0.55, rough: 0.6, breath: 0.4 }), hump(0, 0.9, 0.2)), 0, 0.8);
    mix(d, fire(1.0, 250, 1100), 0.15);
    return done(d);
  }, gain: 0.85, gap: 150 },
  sword: { make: () => { // a short cut and the edge's thin ring; the blow itself is the victim's sound
    const d = buf(0.5);
    mix(d, swish(0.09, 600, 2600, 0.5), 0); mix(d, metal(rand(1300, 1900), 0.2, 0.25, 6), 0.06);
    return done(d, 0.55);
  }, gap: 40, gain: 0.5, max: 6 },
  greatsword: { make: () => done(layer([swish(0.16, 300, 1600, 0.7)], [metal(rand(650, 900), 0.35, 0.3), 0.1]), 0.65), gap: 50, gain: 0.55 },
  bonesword: { make: () => done(layer([swish(0.08, 500, 2000, 0.4)], [metal(rand(900, 1300), 0.1, 0.2, 5), 0.05], [rattle(0.12, 4, 0.5), 0.02]), 0.5), gap: 50, gain: 0.45 },
  rapier: { make: () => { // a flick, a whispering ring of fine steel
    const d = buf(0.6);
    mix(d, swish(0.07, 1200, 4800, 0.6, 1.8)); mix(d, metal(rand(2500, 3200), 0.45, 0.2, 5), 0.05);
    return done(d, 0.6);
  }, gain: 0.55 },
  ghostblade: { make: () => { // the Shade's blades: air, and a cold shimmer
    const d = buf(0.6);
    mix(d, swish(0.1, 2000, 5200, 0.6, 2.2));
    mix(d, modes(0.5, Array.from({ length: 5 }, (): Mode => [rand(3000, 6500), rand(0.1, 0.2), rand(0.2, 0.4)])), 0.04);
    mix(d, gain(whisper(0.3, 0.05, 1.2), 0.4), 0);
    return done(d, 0.55);
  }, gain: 0.5, wet: 0.45 },
  polearm: { make: () => done(layer([swish(0.18, 250, 1300, 0.8, 1.1)], [metal(rand(450, 650), 0.28, 0.25), 0.11]), 0.6), gap: 45, gain: 0.55, max: 5 },
  lance: { make: () => { // a couched lance: the thrust, the crack of ash wood and steel
    const d = buf(0.8);
    mix(d, swish(0.1, 200, 900, 0.6));
    mix(d, thump(0.25, 140, 55), 0.07, 1); mix(d, debris(0.18, 900, 2400, 0.6), 0.07); mix(d, metal(rand(380, 520), 0.5, 0.5), 0.07);
    return done(d);
  }, gain: 0.75 },
  maul: { make: () => { // an iron maul: a slow heave, the blow, a dull ring and the chains of the penitent
    const d = buf(1);
    mix(d, swish(0.22, 180, 900, 0.6));
    mix(d, thump(0.3, 110, 45), 0.13, 1); mix(d, metal(rand(180, 260), 0.6, 0.6), 0.13);
    mix(d, filter(crackle(0.25, 120, 1, 0.002), "bp", 4200, 1.5), 0.15, 0.4);
    return done(d);
  }, gain: 0.75 },
  whip: { make: () => { // the scourge: a rising whoosh, a crack, the chains jingling
    const d = buf(0.5);
    mix(d, swish(0.14, 600, 3800, 0.5, 1.5));
    mix(d, drive(env(filter(noise(0.01), "hp", 1500), 0.0002, 0.006), 4), 0.12, 0.9);
    for (let i = 0; i < 4; i++) mix(d, metal(rand(3500, 5200), 0.08, 0.3, 3), rand(0.12, 0.26));
    return done(d, 0.7);
  }, gain: 0.6 },
  bite: { make: () => { // a snarl, then the snap of jaws
    const d = buf(0.4);
    mix(d, shape(vocal(0.24, rand(100, 140), "a", { size: 0.8, rough: 0.9, breath: 0.6 }), hump(0, 0.24, 0.4)), 0, 0.7);
    mix(d, wood(rand(1000, 1300), 0.03), 0.16, 1); mix(d, wood(rand(1100, 1400), 0.02), 0.19, 0.6);
    return done(d, 0.6);
  }, gap: 50, gain: 0.5, max: 5 },
  bat: { make: () => {
    const d = buf(0.3);
    for (let k = 0; k < 3; k++) mix(d, env(osc(0.04, glide(rand(5000, 7200), rand(3200, 4400), 0.035)), 0.002, 0.03), k * rand(0.035, 0.055), 0.6);
    mix(d, shape(filter(noise(0.15), "bp", 900, 1), t => (Math.sin(t * TAU22) > 0 ? 1 : 0.2) * (1 - t / 0.15)), 0, 0.25);
    return done(d, 0.45);
  }, gap: 70, gain: 0.4, max: 4 },
  claw: { make: () => { // stone claws raking: a scrape, a crack, the beat of heavy wings
    const d = buf(0.6), w = wobble(0.3, 30);
    mix(d, shape(filter(noise(0.3), "bp", t => 2000 + 800 * w(t), 4), t => hump(0, 0.3, 0.3)(t) * (0.5 + 0.5 * Math.abs(w(t * 3)))), 0.05, 0.8);
    mix(d, stone(0.8), 0.06); mix(d, swish(0.28, 140, 600, 0.6, 0.9));
    return done(d, 0.65);
  }, gain: 0.55 },
  club: { make: () => { // the ogre grunts and brings the tree-trunk down
    const d = buf(0.8);
    mix(d, cry(0.25, rand(90, 100), 72, "u", 0.5), 0, 0.5);
    mix(d, swish(0.22, 150, 700, 0.7)); mix(d, thump(0.35, 90, 38), 0.15, 1); mix(d, wood(rand(140, 180), 0.12, 0.8), 0.15);
    return done(d);
  }, gain: 0.75 },
  smash: { make: () => { // the Colossus: a huge sweep, a ground-shaking blow, bones grinding
    const d = buf(1.3);
    mix(d, swish(0.3, 100, 500, 0.8, 0.9));
    mix(d, thump(0.7, 75, 26), 0.2, 1); mix(d, debris(0.6, 300, 1400, 0.5), 0.2); mix(d, rattle(0.4, 9, 0.6), 0.22);
    mix(d, filter(crackle(0.4, 200, 1, 0.006), "bp", 900, 2), 0.05, 0.25);
    return done(d);
  }, gain: 0.85, gap: 90 },
  axe: { make: () => { // the headsman's axe: a long heavy swing and a deep chop
    const d = buf(0.8);
    mix(d, swish(0.24, 220, 1100, 0.8));
    mix(d, thump(0.16, 210, 90), 0.15, 1); mix(d, wood(rand(220, 260), 0.08, 0.8), 0.15); mix(d, metal(rand(850, 1000), 0.15, 0.25, 5), 0.15);
    return done(d);
  }, gain: 0.7 },
  scythe: { make: () => { // the Pale Rider: a long sweep of air, a breath from the grave, a cold ring
    const d = buf(1);
    mix(d, swish(0.36, 400, 3000, 0.7, 2));
    mix(d, shape(vocal(0.6, glide(85, 70, 0.6), "u", { breath: 0.8 }), hump(0, 0.6, 0.4)), 0, 0.3);
    mix(d, metal(rand(1500, 1800), 0.6, 0.3, 5), 0.2);
    return done(d, 0.75);
  }, gain: 0.7, wet: 0.45 },
  toll: { make: () => { // the Belfry Titan's blow tolls its bell and shakes the ground
    const d = buf(3.6);
    mix(d, bellTone(rand(98, 110), 3.5, 1)); mix(d, thump(0.6, 60, 26), 0, 1.2); mix(d, debris(0.6, 200, 1200, 0.4), 0.05);
    return done(d);
  }, takes: 2, gain: 0.8, gap: 300, wet: 0.5 },
  curse: { make: () => { // whispered words and two sour notes sinking together
    const d = buf(0.55);
    mix(d, shape(whisper(0.45, 0.06), hump(0, 0.45, 0.3)), 0, 0.8);
    const f = rand(300, 360);
    for (const r of [1, 1.06]) mix(d, env(filter(osc(0.45, glide(f * r, f * r * 0.7, 0.45), "tri"), "lp", 1500), 0.05, 0.4), 0, 0.3);
    return done(d, 0.55);
  }, gain: 0.5, wet: 0.45 },
  necro: { make: () => { // a moan out of the grave on a dark wind
    const d = buf(0.7);
    mix(d, shape(vocal(0.55, glide(rand(160, 190), rand(105, 125), 0.5), "u", { breath: 0.7 }), hump(0, 0.55, 0.35)), 0, 0.6);
    mix(d, swish(0.45, 200, 900, 0.6, 2)); mix(d, env(osc(0.6, 55), 0.1, 0.5), 0, 0.3);
    return done(d, 0.6);
  }, gain: 0.55, wet: 0.5 },
  frost: { make: () => { // ice gathering: a cold hiss and glassy tinkles
    const d = buf(0.7);
    mix(d, shape(filter(noise(0.4), "hp", 5000), hump(0, 0.4, 0.7)), 0, 0.4);
    for (let i = 0; i < 8; i++) mix(d, modes(0.4, [[rand(2500, 7000), rand(0.1, 0.25), rand(0.12, 0.35)]]), rand(0, 0.3));
    mix(d, swish(0.4, 300, 1200, 0.4, 1.5));
    return done(d, 0.55);
  }, gain: 0.5, wet: 0.5 },
  holyfire: { make: () => {
    const d = buf(1);
    mix(d, fire(0.6, 400, 1600, 0.8)); mix(d, choirHit([440, 554, 659], 0.8, 0.25), 0.02);
    return done(d, 0.75);
  }, gain: 0.7, wet: 0.55 },
  zap: { make: () => { // chain lightning: a crack, then a buzzing, stuttering arc and the sizzle
    const d = buf(0.5), w = wobble(0.5, 30), gate = wobble(0.5, 90);
    mix(d, drive(env(filter(noise(0.02), "hp", 1200), 0.0002, 0.012), 4), 0, 1);
    mix(d, shape(filter(osc(0.4, t => 70 + 40 * w(t), "saw"), "hp", 150), t => (gate(t) > -0.2 ? 1 : 0.1) * Math.exp(-t * 7)), 0.005, 0.5);
    mix(d, filter(crackle(0.4, t => 600 * Math.exp(-t * 6), 1, 0.001), "bp", 3500, 0.8), 0, 0.8);
    mix(d, env(filter(noise(0.4), "hp", 6000), 0.002, 0.3), 0, 0.2);
    return done(drive(d, 1.5), 0.7);
  }, gain: 0.6, wet: 0.35 },
  arc: { make: () => done(layer([filter(crackle(0.18, t => 500 * Math.exp(-t * 12), 1, 0.001), "bp", 3200, 0.8)], [drive(env(filter(noise(0.01), "hp", 2000), 0.0002, 0.008), 3)]), 0.5), gap: 60, gain: 0.35 },
  trebuchet: { make: () => { // the winch creaks, the arm whips through the air and slams into its crossbar
    const d = buf(1.1);
    mix(d, creak(0.35, glide(25, 60, 0.35), [700, 1300, 2100]), 0, 0.4);
    mix(d, swish(0.35, 150, 700, 0.8, 1)); mix(d, wood(rand(100, 125), 0.25), 0.3, 1); mix(d, thump(0.3, 80, 40), 0.3, 0.8);
    return done(d, 0.8);
  }, gain: 0.7 },
  beam: { make: () => { // a tower's lance of holy light: a bright struck chord, a hiss, a soft blow
    const d = buf(0.7), f = rand(1000, 1120);
    [1, 1.5, 2.01].forEach((r, i) => mix(d, env(osc(0.6, glide(f * r * 1.12, f * r, 0.08)), 0.003, 0.45), 0, [0.3, 0.2, 0.12][i]));
    mix(d, env(filter(noise(0.15), "hp", 5000), 0.001, 0.12), 0, 0.3); mix(d, thump(0.2, 180, 90, 0.4));
    return done(d, 0.6);
  }, gain: 0.5, wet: 0.5, gap: 60 },
  beamBig: { make: () => {
    const d = buf(1.2), f = rand(520, 580);
    [1, 1.5, 2.01, 3].forEach((r, i) => mix(d, env(osc(1.1, glide(f * r * 1.15, f * r, 0.12)), 0.004, 0.9), 0, [0.3, 0.22, 0.14, 0.08][i]));
    mix(d, env(filter(noise(0.25), "hp", 4000), 0.001, 0.2), 0, 0.35); mix(d, thump(0.4, 140, 50, 0.8));
    return done(d, 0.75);
  }, gain: 0.65, wet: 0.55, gap: 120 },

  // what a blow sounds like on what it strikes
  hitFlesh: { make: () => { const d = buf(0.25); mix(d, thump(0.12, rand(160, 200), 70, 0.8)); mix(d, env(filter(noise(0.1), "bp", rand(700, 1000), 1.4), 0.001, 0.07), 0, 0.5); mix(d, tick(0.003, 2000, 0.3)); return done(d, 0.6); }, takes: 4, gap: 35, gain: 0.5, max: 6 },
  hitArmor: { make: () => done(layer([metal(rand(480, 900), rand(0.45, 0.8), 1)], [tick(0.004, 2500, 1.2)], [env(filter(noise(0.05), "hp", 4000), 0.0005, 0.03), 0, 0.4]), 0.7), takes: 5, gap: 35, gain: 0.5, max: 6, wet: 0.25 },
  hitStone: { make: () => done(layer([stone(1)], [debris(0.25, 160, 2200, 0.5), 0.01]), 0.65), gap: 50, gain: 0.5, max: 4 },
  hitBone: { make: () => done(layer([wood(rand(800, 1000), 0.05)], [debris(0.08, 1200, 3000, 0.6)], [rattle(0.2, 4, 0.5), 0.02]), 0.6), gap: 40, gain: 0.5, max: 4 },
  hitWood: { make: () => done(layer([wood(rand(250, 340), 0.1)], [debris(0.15, 700, 2500, 0.5), 0.005]), 0.65), gap: 50, gain: 0.5, max: 4 },
  hitSpirit: { make: () => done(layer([swish(0.15, 1500, 4000, 0.6, 2)], [modes(0.4, [[rand(2000, 3000), 0.2, 0.3], [rand(3500, 4500), 0.12, 0.2]]), 0.03]), 0.45), gain: 0.4, wet: 0.5 },
  boltHit: { make: () => { const d = buf(0.2); mix(d, thump(0.06, 260, 140, 0.6)); mix(d, tick(0.003, 1500)); mix(d, wood(rand(500, 700), 0.04, 0.4)); return done(d, 0.55); }, takes: 4, gap: 35, gain: 0.4, max: 5 },
  ping: { make: () => done(mix(metal(rand(2200, 3200), 0.15, 1, 5), tick(0.002, 4000)), 0.5), takes: 4, gap: 35, gain: 0.35, max: 5 },
  skewer: { make: () => { const d = buf(0.5); mix(d, wood(rand(180, 220), 0.1)); mix(d, thump(0.15, 150, 60)); mix(d, debris(0.2, 900, 2500, 0.6), 0.005); return done(d, 0.8); }, gain: 0.7 },
  crash: { make: () => { // a stone ball lands: the ground shudders, rock splits and showers down
    const d = buf(1.1);
    mix(d, thump(0.5, 75, 30)); mix(d, env(filter(noise(0.4), "lp", glide(3000, 200, 0.3)), 0.001, 0.3), 0, 0.8);
    mix(d, debris(0.9, 220, 1500, 0.7), 0.02); for (let i = 0; i < 3; i++) mix(d, stone(0.6), rand(0.05, 0.4));
    return done(drive(d, 1.4));
  }, gain: 0.85, gap: 100, wet: 0.35 },
  blast: { make: () => { // the Hellmouth's shell bursts and the ground takes fire
    const d = buf(1.8);
    mix(d, thump(0.8, 65, 24, 1.2)); mix(d, env(filter(noise(0.6), "lp", glide(5000, 180, 0.4)), 0.001, 0.5), 0, 1);
    mix(d, debris(1, 260, 1400, 0.7), 0.02); mix(d, fire(1.4, 200, 900, 0.7), 0.1);
    return done(drive(d, 1.6));
  }, takes: 2, gain: 1, gap: 150, wet: 0.4 },
  shatter: { make: () => { // a bolt of blight-ice bursts
    const d = buf(0.7);
    mix(d, drive(env(filter(noise(0.015), "hp", 2000), 0.0002, 0.01), 3)); mix(d, thump(0.2, 120, 50, 0.6));
    for (let i = 0; i < 12; i++) mix(d, modes(0.3, [[rand(2500, 8000), rand(0.08, 0.2), rand(0.05, 0.2)]]), Math.pow(Math.random(), 2) * 0.4);
    mix(d, env(filter(noise(0.5), "hp", 4000), 0.001, 0.4), 0, 0.3);
    return done(d, 0.65);
  }, gain: 0.55, wet: 0.45 },
  hexHit: { make: () => done(layer([thump(0.15, 320, 120, 0.6)], [env(filter(noise(0.12), "bp", 600, 1.2), 0.001, 0.1), 0, 0.4]), 0.45), gain: 0.4, wet: 0.3 },
  fireHit: { make: () => done(layer([thump(0.3, 100, 45)], [fire(0.5, 300, 900, 0.8), 0.01]), 0.7), gain: 0.6, wet: 0.35 },

  // deaths
  dieMan: { make: () => {
    const d = buf(0.7);
    if (chance(0.7)) mix(d, cry(rand(0.25, 0.42), rand(150, 220), rand(90, 120)), 0, 0.45);
    mix(d, fall(1), rand(0.15, 0.25));
    return done(d, 0.6);
  }, takes: 6, gap: 80, gain: 0.55, max: 4 },
  dieArmor: { make: () => {
    const d = buf(0.9);
    if (chance(0.6)) mix(d, cry(rand(0.2, 0.3), rand(120, 170), 85, "u", 0.4), 0, 0.4);
    for (let i = 0; i < 6; i++) mix(d, metal(rand(600, 2400), rand(0.1, 0.3), rand(0.2, 0.5), 5), rand(0.15, 0.5));
    mix(d, fall(1, 0.8), 0.18);
    return done(d, 0.65);
  }, takes: 4, gap: 90, gain: 0.55, max: 3 },
  dieBone: { make: () => done(layer([rattle(0.55, 18, 1)], [thump(0.12, 160, 80, 0.4), 0.05]), 0.6), gap: 70, gain: 0.5, max: 4 },
  dieBeast: { make: () => { const d = buf(0.6); mix(d, cry(0.22, rand(780, 900), rand(420, 500), "i", 0.15), 0, 0.5); mix(d, cry(0.15, 520, 380, "u", 0.1), 0.25, 0.25); mix(d, fall(0.6, 1.4), 0.12); return done(d, 0.55); }, gap: 80, gain: 0.5 },
  dieBat: { make: () => done(env(osc(0.14, glide(rand(6000, 7500), 2400, 0.12)), 0.002, 0.12), 0.35), gap: 60, gain: 0.35 },
  dieStone: { make: () => { const d = buf(1); for (let i = 0; i < 4; i++) mix(d, stone(rand(0.5, 1)), rand(0, 0.3)); mix(d, debris(0.8, 300, 1500, 0.8), 0.05); mix(d, thump(0.4, 90, 35), 0.25); return done(d, 0.75); }, gain: 0.6 },
  dieSpirit: { make: () => { const d = buf(1.1); mix(d, shape(vocal(0.9, glide(rand(380, 450), 190, 0.9), "u", { breath: 0.8 }), hump(0, 0.9, 0.15)), 0, 0.5); mix(d, swish(0.8, 3000, 800, 0.4, 2)); return done(d, 0.55); }, gain: 0.5, wet: 0.6 },
  dieEngine: { make: () => { const d = buf(1); mix(d, debris(0.6, 900, 2000, 1)); for (let i = 0; i < 4; i++) mix(d, wood(rand(150, 400), 0.15), rand(0, 0.35)); mix(d, thump(0.4, 100, 40), 0.2); return done(d, 0.8); }, gain: 0.7 },
  dieBig: { make: () => { // a giant falls: a groan, the ground shakes
    const d = buf(1.6);
    mix(d, shape(vocal(0.8, glide(rand(85, 100), 50, 0.8), "o", { size: 0.6, rough: 0.7, breath: 0.4 }), hump(0, 0.8, 0.2)), 0, 0.6);
    mix(d, thump(0.8, 60, 24, 1.2), 0.45); mix(d, debris(0.7, 250, 1200, 0.5), 0.47);
    return done(d);
  }, gain: 0.85, gap: 150, wet: 0.35 },
  collapse: { make: () => { // masonry gives way: a long rumble and the stones coming down
    const d = buf(2.4);
    mix(d, env(filter(brown(2.2), "lp", 300), 0.05, 2), 0, 1); mix(d, debris(2, 400, 1300, 0.8), 0.05);
    for (let i = 0; i < 7; i++) mix(d, stone(rand(0.6, 1), rand(250, 400)), rand(0.05, 1.2));
    mix(d, thump(0.9, 55, 22, 1.2), 0.1);
    return done(drive(d, 1.4));
  }, takes: 2, gain: 1, gap: 250, wet: 0.45 },

  // the field
  bell: { make: () => done(bellTone(98, 6), 0.85), takes: 1, gain: 0.7, wet: 0.7 },
  bellFar: { make: () => done(bellTone(rand(130, 175), 5), 0.6), takes: 2, wet: 0.9 },
  thunder: { make: () => { // the crack overhead, then the long roll across the sky
    const d = buf(4.2), roll = wobble(4, 3);
    mix(d, drive(env(filter(noise(0.08), "hp", 1500), 0.0005, 0.06), 3), 0, 0.8);
    mix(d, shape(filter(brown(4), "lp", glide(900, 120, 2.5)), t => Math.max(0, 0.6 + 0.4 * roll(t)) * (t < 0.05 ? t / 0.05 : Math.exp(-t * 1.1))), 0.02, 1.2);
    mix(d, env(osc(2, glide(70, 28, 2)), 0.02, 2), 0.02, 0.5);
    return done(drive(d, 1.3));
  }, takes: 2, gap: 350, wet: 0.6 },
  rumble: { make: () => { const r = wobble(3.5, 2); return done(shape(filter(brown(3.5), "lp", 160), t => hump(0, 3.5, 0.3)(t) * (0.6 + 0.4 * r(t))), 0.6); }, takes: 2, wet: 0.5 },
  fog: { make: () => { // a long breath out of the crypt: hissing vapour, a sinking drone and a tolling bell
    const d = buf(6.5);
    mix(d, shape(filter(noise(5.5), "bp", glide(900, 260, 5.5), 0.8), hump(0, 5.5, 0.25)), 0, 0.5);
    mix(d, shape(filter(noise(4), "hp", 5200), hump(0, 4, 0.3)), 0.4, 0.2);
    for (const f of [110, 116.5]) mix(d, shape(filter(osc(5, glide(f, f * 0.45, 5), "saw"), "lp", 320), hump(0, 5, 0.3)), 0, 0.35);
    mix(d, bellTone(77.8, 4, 0.8), 0.2); mix(d, bellTone(73.4, 4, 0.6), 2.2);
    return done(d);
  }, takes: 1, wet: 0.8 },
  vultures: { make: () => { // carrion birds cry out to one another over the beat of their wings
    const d = buf(1.6);
    for (const [at, f] of [[0, rand(950, 1150)], [0.38, rand(800, 950)], [0.85, rand(1000, 1200)]] as const)
      mix(d, shape(vocal(0.5, arc(f * 0.8, f, f * 0.6, 0.12, 0.5), "e", { size: 1.8, rough: 1.2, breath: 0.9 }), hump(0, 0.5, 0.2)), at, 0.6);
    for (let i = 0; i < 6; i++) mix(d, swish(0.12, 300, 900, 0.4, 0.8), 0.1 + i * 0.2);
    return done(d, 0.85);
  }, takes: 1, wet: 0.6 },
  crow: { make: () => {
    const d = buf(1.3), n = pick([1, 2, 2, 3]);
    for (let i = 0; i < n; i++) { const f = rand(420, 560); mix(d, shape(vocal(0.28, arc(f * 0.9, f * 1.2, f * 0.8, 0.07, 0.28), "a", { size: 1.6, rough: 1, breath: 0.6 }), hump(0, 0.28, 0.25)), i * rand(0.33, 0.42), 0.7); }
    return done(d, 0.7);
  }, wet: 0.6 },
  owl: { make: () => {
    const d = buf(1.6), f = rand(330, 380);
    for (const [at, len] of [[0, 0.35], [0.55, 0.18], [0.78, 0.45]] as const) mix(d, shape(mix(osc(len, glide(f * 1.04, f, len)), filter(noise(len), "bp", f * 1.1, 4), 0, 0.3), hump(0, len, 0.3)), at, 0.6);
    return done(d, 0.6);
  }, takes: 2, wet: 0.7 },
  wolf: { make: () => {
    const d = buf(3.4), f = rand(310, 360), vib = (t: number): number => 1 + 0.012 * Math.sin(t * 31) * Math.min(1, t);
    mix(d, filter(shape(vocal(3, t => (t < 0.6 ? f * (1 + 0.7 * t / 0.6) : t < 2.2 ? f * 1.7 : f * (1.7 - 0.45 * (t - 2.2) / 0.8)) * vib(t), "u", { size: 1.2, breath: 0.25 }), hump(0, 3, 0.3)), "lp", 2200));
    return done(d, 0.6);
  }, takes: 2, wet: 0.85 },
  gibbet: { make: () => done(creak(rand(0.9, 1.4), (() => { const w = wobble(1.5, 2); return (t: number) => 25 + 15 * w(t); })(), [480, 950, 1700]), 0.5), takes: 2, wet: 0.5 },
  chains: { make: () => { const d = buf(1.2); for (let i = 0; i < 8; i++) mix(d, metal(rand(1800, 4200), rand(0.1, 0.2), rand(0.3, 1), 4), Math.pow(Math.random(), 1.4) * 0.9); return done(d, 0.5); }, takes: 2, wet: 0.5 },
  whistle: { make: () => done(layer([env(osc(1, t => glide(2200, 480, 1)(t) * (1 + 0.01 * Math.sin(t * 40))), 0.05, 1.2)], [shape(filter(noise(1), "bp", glide(3000, 900, 1), 3), hump(0, 1, 0.8)), 0, 0.3]), 0.5), gap: 120, wet: 0.35 },
  burst: { make: () => { // an urn shatters and its foul breath bursts out
    const d = buf(1.3);
    for (let i = 0; i < 10; i++) mix(d, modes(0.25, [[rand(1500, 4500), rand(0.2, 0.5), rand(0.03, 0.12)], [rand(4000, 7000), 0.2, 0.05]]), Math.pow(Math.random(), 2) * 0.25);
    mix(d, thump(0.5, 92, 34)); mix(d, shape(filter(noise(1.1), "lp", glide(1500, 250, 1)), t => (t < 0.03 ? t / 0.03 : Math.exp(-t * 3))), 0, 0.7);
    mix(d, bellTone(233, 1.2, 0.25), 0.02);
    return done(d);
  }, gap: 120, wet: 0.5 },
  raise: { make: () => { // the earth splits, bones knit together, a ghostly note rises
    const d = buf(1.3);
    mix(d, debris(0.5, 300, 900, 0.8)); mix(d, rattle(0.6, 10, 0.7), 0.2);
    mix(d, shape(filter(osc(1, glide(98, 196, 0.9), "saw"), "lp", 700), hump(0, 1, 0.6)), 0.1, 0.4);
    return done(d, 0.65);
  }, gap: 200, gain: 0.6, wet: 0.5 },
  rebirth: { make: () => { // a roar of fire, a bright bell and a choir
    const d = buf(2.2);
    mix(d, fire(1.4, 300, 2200, 1)); mix(d, bellTone(587.3, 1.8, 0.5), 0.15); mix(d, choirHit([587.3, 740, 880], 1.6, 0.25), 0.25);
    return done(d);
  }, takes: 1, gap: 400, wet: 0.6 },
  heal: { make: () => { const d = buf(0.9); [880, 1318.5, 1760].forEach((f, i) => mix(d, shape(osc(0.8, f * rand(0.995, 1.005)), hump(0, 0.8, 0.15)), i * 0.05, 0.25 - i * 0.05)); mix(d, shape(filter(noise(0.6), "hp", 6000), hump(0, 0.6, 0.2)), 0, 0.08); return done(d, 0.35); }, gap: 260, gain: 0.45, wet: 0.6 },
  martyr: { make: () => done(layer([choirHit([440, 523.3, 659.3], 1.2, 0.3)], [modes(1.2, [[1318.5, 0.2, 1], [1760, 0.15, 0.8]]), 0.1]), 0.6), gap: 300, gain: 0.6, wet: 0.7 },
} satisfies Record<string, Recipe>;

export type Sfx = keyof typeof R;
export const SFX: Record<Sfx, Recipe> = R;

// ---- who sounds like what -------------------------------------------------------------------------------------

/**
 * What each unit attacks with. `hit` is the sound where the blow lands: "victim" picks it from what was struck
 * (steel rings on armor, a thud on flesh), any other name is that sound. `delay` is when, in seconds after the
 * attack, the blow lands (a melee swing's own timing; projectiles add their flight).
 */
export interface Weapon { sound: Sfx; hit?: Sfx | "victim"; delay?: number; hitGain?: number }
export const WEAPON: Record<string, Weapon> = {
  arbalester: { sound: "xbow", hit: "victim" },
  oathguard: { sound: "sword", hit: "victim", delay: 0.06 },
  zealot: { sound: "flame" },
  hound: { sound: "bite", hit: "victim", delay: 0.16, hitGain: 0.5 },
  flagellant: { sound: "whip", hit: "victim", delay: 0.12, hitGain: 0.7 },
  hexbinder: { sound: "curse", hit: "hexHit" },
  halberdier: { sound: "polearm", hit: "victim", delay: 0.11 },
  bats: { sound: "bat" },
  dreadknight: { sound: "lance", hit: "victim", delay: 0.07 },
  gargoyle: { sound: "claw", hit: "victim", delay: 0.06, hitGain: 0.6 },
  witchhunter: { sound: "silver", hit: "victim", hitGain: 0.6 },
  penitent: { sound: "maul", hit: "victim", delay: 0.13, hitGain: 0.8 },
  necromancer: { sound: "necro", hit: "hexHit" },
  trebuchet: { sound: "trebuchet", hit: "crash" },
  shade: { sound: "ghostblade", hit: "victim", delay: 0.05, hitGain: 0.7 },
  colossus: { sound: "smash", hit: "victim", delay: 0.2, hitGain: 0.6 },
  wyrm: { sound: "breath" },
  cantor: { sound: "zap" },
  countess: { sound: "rapier", hit: "victim", delay: 0.05, hitGain: 0.8 },
  ballista: { sound: "ballista", hit: "skewer" },
  lich: { sound: "frost", hit: "shatter" },
  headsman: { sound: "axe", hit: "victim", delay: 0.15 },
  titan: { sound: "toll", hit: "victim", hitGain: 0.6 },
  seraph: { sound: "holyfire", hit: "fireHit" },
  rider: { sound: "scythe", hit: "victim", delay: 0.2 },
  hellmouth: { sound: "cannon", hit: "blast" },
  gallowglass: { sound: "greatsword", hit: "victim", delay: 0.1 },
  marksman: { sound: "musket", hit: "victim", hitGain: 0.5 },
  fireeater: { sound: "flame" },
  ogre: { sound: "club", hit: "victim", delay: 0.15, hitGain: 0.7 },
  skeleton: { sound: "bonesword", hit: "victim", delay: 0.05, hitGain: 0.7 },
  tower: { sound: "beam" },
  bastion: { sound: "beamBig" },
  hq: { sound: "beamBig" },
};

/** What a unit is made of, for the sound of blows on it and of its death. */
export type Material = "flesh" | "armor" | "stone" | "bone" | "wood" | "spirit" | "beast" | "bat" | "giant";
export const MATERIAL: Record<string, Material> = {
  oathguard: "armor", halberdier: "armor", dreadknight: "armor", penitent: "armor", gallowglass: "armor", titan: "giant", reliquary: "armor",
  gargoyle: "stone", tower: "stone", bastion: "stone", hq: "stone",
  skeleton: "bone", colossus: "giant",
  trebuchet: "wood", ballista: "wood", hellmouth: "wood",
  shade: "spirit", lich: "spirit",
  hound: "beast", bats: "bat", ogre: "giant", wyrm: "giant", rider: "giant", seraph: "giant",
};
/** The sound of a blow landing on each material. */
export const HIT: Record<Material, Sfx> = { flesh: "hitFlesh", armor: "hitArmor", stone: "hitStone", bone: "hitBone", wood: "hitWood", spirit: "hitSpirit", beast: "hitFlesh", bat: "hitFlesh", giant: "hitFlesh" };
/** Bolts and shot: a thwack in flesh and wood, a ping off steel and stone. */
export const BOLT_HIT: Record<Material, Sfx> = { flesh: "boltHit", armor: "ping", stone: "ping", bone: "hitBone", wood: "boltHit", spirit: "hitSpirit", beast: "boltHit", bat: "boltHit", giant: "boltHit" };
export const DEATH: Record<Material, Sfx> = { flesh: "dieMan", armor: "dieArmor", stone: "dieStone", bone: "dieBone", wood: "dieEngine", spirit: "dieSpirit", beast: "dieBeast", bat: "dieBat", giant: "dieBig" };
/** Sounds worth rendering before the first battle, most common first. */
export const WARM: Sfx[] = ["click", "xbow", "sword", "flame", "hitFlesh", "hitArmor", "boltHit", "ping", "dieMan", "dieArmor", "bell", "build", "coin", "hitStone", "beam", "beamBig", "polearm", "bite", "curse", "whip", "bat", "dieBat", "dieBeast", "collapse", "crow", "gibbet", "chains", "owl", "rumble", "bellFar", "wolf", "deny", "study", "teleport", "heal"];
