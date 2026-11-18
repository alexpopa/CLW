/**
 * Offline synthesis toolkit. Every sound effect is computed here sample by sample into a Float32Array and handed to
 * WebAudio as a buffer: struck metal and wood are banks of decaying resonances, strings are plucked delay lines,
 * voices are a buzzing throat shaped by vowel formants. No recordings and no asset files. Presentation only.
 */
export const SR = 44100;
export const TAU = Math.PI * 2;
export type Buf = Float32Array;
/** A fixed value, or one that changes with time (seconds from the start of the sound). */
export type Curve = number | ((t: number) => number);

export const rand = (a: number, b: number): number => a + Math.random() * (b - a);
export const chance = (p: number): boolean => Math.random() < p;
export const pick = <T>(xs: readonly T[]): T => xs[Math.floor(Math.random() * xs.length)]!;
const val = (c: Curve, t: number): number => (typeof c === "number" ? c : c(t));
const clamp = (x: number, a: number, b: number): number => Math.max(a, Math.min(b, x));

export const buf = (sec: number): Buf => new Float32Array(Math.max(1, Math.ceil(sec * SR)));
/** Exponential slide from a to b over dur seconds, then holds b. */
export const glide = (a: number, b: number, dur: number) => (t: number): number => (t >= dur ? b : a * Math.pow(b / a, t / dur));
/** Exponential rise from a to peak at `mid`, then down to b at `end`. */
export const arc = (a: number, peak: number, b: number, mid: number, end: number) => (t: number): number =>
  t < mid ? a * Math.pow(peak / a, t / mid) : t >= end ? b : peak * Math.pow(b / peak, (t - mid) / (end - mid));
/** A smooth swell from 0 to 1 and back over [at, at + dur], peaking at `peak` (0..1) of the way. */
export const hump = (at: number, dur: number, peak = 0.5) => (t: number): number => {
  const u = (t - at) / dur;
  if (u <= 0 || u >= 1) return 0;
  return Math.sin((Math.PI / 2) * (u < peak ? u / peak : 1 + (u - peak) / (1 - peak))) ** 2;
};

/** Add src into dst, starting `at` seconds in, scaled by gain. */
export function mix(dst: Buf, src: Buf, at = 0, gain = 1): Buf {
  const o = Math.round(at * SR), n = Math.min(src.length, dst.length - o);
  for (let i = 0; i < n; i++) dst[i + o]! += src[i]! * gain;
  return dst;
}
/** Silence before `at`, a linear attack, then an exponential decay that falls 60 dB in t60 seconds. */
export function env(d: Buf, attack: number, t60: number, at = 0): Buf {
  const a = Math.max(1, Math.round(attack * SR)), o = Math.round(at * SR), k = Math.exp(-6.9 / (Math.max(0.001, t60) * SR));
  let g = 1;
  for (let i = 0; i < d.length; i++) {
    if (i < o) { d[i] = 0; continue; }
    const j = i - o;
    if (j < a) d[i]! *= j / a;
    else { d[i]! *= g; g *= k; }
  }
  return d;
}
/** Multiply by a function of time. */
export function shape(d: Buf, f: (t: number) => number): Buf {
  for (let i = 0; i < d.length; i++) d[i]! *= f(i / SR);
  return d;
}
export function gain(d: Buf, g: number): Buf { for (let i = 0; i < d.length; i++) d[i]! *= g; return d; }

export function noise(sec: number): Buf {
  const d = buf(sec);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return d;
}
/** Brown noise (integrated white): the stuff of rumbles and rolling thunder. Peak about 1. */
export function brown(sec: number): Buf {
  const d = buf(sec);
  let y = 0;
  for (let i = 0; i < d.length; i++) { y = y * 0.996 + (Math.random() * 2 - 1) * 0.09; d[i] = y; }
  return normalize(d, 1);
}
/** A smooth random signal in [-1, 1] that wanders about `rate` times a second (gusts, jitter, a growl's roughness). */
export function wobble(sec: number, rate: number): (t: number) => number {
  const n = Math.ceil(sec * rate) + 3, pts = Array.from({ length: n }, () => Math.random() * 2 - 1);
  return t => {
    const x = Math.max(0, t * rate), i = Math.min(n - 2, Math.floor(x)), f = x - i, w = (1 - Math.cos(Math.PI * f)) / 2;
    return pts[i]! * (1 - w) + pts[i + 1]! * w;
  };
}

/**
 * State-variable filter (topology-preserving), in place. Band-pass is normalised to unity gain at its centre.
 * Cutoff and resonance may move with time; coefficients are refreshed every 16 samples.
 */
export function filter(d: Buf, mode: "lp" | "bp" | "hp", cutoff: Curve, q: Curve = 0.707): Buf {
  let ic1 = 0, ic2 = 0, k = 1, a1 = 0, a2 = 0, a3 = 0;
  const fixed = typeof cutoff === "number" && typeof q === "number";
  for (let i = 0; i < d.length; i++) {
    if (i === 0 || (!fixed && (i & 15) === 0)) {
      const t = i / SR, g = Math.tan((Math.PI * clamp(val(cutoff, t), 10, SR * 0.45)) / SR);
      k = 1 / Math.max(0.05, val(q, t)); a1 = 1 / (1 + g * (g + k)); a2 = g * a1; a3 = g * a2;
    }
    const v0 = d[i]!, v3 = v0 - ic2, v1 = a1 * ic1 + a2 * v3, v2 = ic2 + a2 * ic1 + a3 * v3;
    ic1 = 2 * v1 - ic1; ic2 = 2 * v2 - ic2;
    d[i] = mode === "lp" ? v2 : mode === "bp" ? k * v1 : v0 - k * v1 - v2;
  }
  return d;
}

const blep = (t: number, dt: number): number => {
  if (t < dt) { t /= dt; return t + t - t * t - 1; }
  if (t > 1 - dt) { t = (t - 1) / dt; return t * t + t + t + 1; }
  return 0;
};
/** A band-limited oscillator whose pitch may move with time. */
export function osc(sec: number, freq: Curve, wave: "sine" | "saw" | "square" | "tri" = "sine"): Buf {
  const d = buf(sec);
  let ph = Math.random();
  for (let i = 0; i < d.length; i++) {
    const dt = Math.min(0.45, val(freq, i / SR) / SR);
    ph += dt; if (ph >= 1) ph -= 1;
    d[i] = wave === "sine" ? Math.sin(TAU * ph)
      : wave === "saw" ? 2 * ph - 1 - blep(ph, dt)
      : wave === "square" ? (ph < 0.5 ? 1 : -1) + blep(ph, dt) - blep((ph + 0.5) % 1, dt)
      : 1 - 4 * Math.abs(ph - 0.5);
  }
  return d;
}

/** One resonance of a struck object: frequency (Hz), loudness, and the time it takes to die away 60 dB. */
export type Mode = readonly [freq: number, amp: number, t60: number];
/** A bank of decaying resonances, as when metal, wood, stone or a bell is struck (recursive oscillators: cheap). */
export function modes(sec: number, list: readonly Mode[], at = 0): Buf {
  const d = buf(sec), o = Math.round(at * SR);
  for (const [f, a, t60] of list) {
    if (f <= 0 || f >= SR * 0.45) continue;
    const w = (TAU * f) / SR, r = Math.exp(-6.9 / (Math.max(0.002, t60) * SR)), c = 2 * r * Math.cos(w), r2 = r * r;
    const end = Math.min(d.length, o + Math.ceil(t60 * 1.3 * SR));
    let prev = 0, y = a * Math.sin(w);
    for (let n = o + 1; n < end; n++) { d[n]! += y; const next = c * y - r2 * prev; prev = y; y = next; }
  }
  return d;
}

/** Karplus–Strong plucked string. `bright` (0..1) is how much of the pluck's edge survives; t60 its ring. */
export function pluck(sec: number, freq: number, t60: number, bright = 0.5): Buf {
  const d = buf(sec), rho = 0.5 * (1 - 0.9 * bright), period = Math.max(2, SR / freq - rho), N = Math.floor(period), frac = period - N;
  const L = N + 4, hist = new Float32Array(L), exc = new Float32Array(N);
  let s = 0, mean = 0;
  const smooth = 0.15 + 0.85 * bright;
  for (let i = 0; i < N; i++) { s += smooth * (Math.random() * 2 - 1 - s); exc[i] = s; mean += s; }
  mean /= N;
  const g = Math.pow(10, -3 / (t60 * freq));
  let prevDelayed = 0;
  for (let n = 0; n < d.length; n++) {
    const x = n < N ? exc[n]! - mean : 0;
    const a = hist[((n - N) % L + L) % L]!, b = hist[((n - N - 1) % L + L) % L]!;
    const delayed = n >= N + 1 ? a * (1 - frac) + b * frac : 0;
    const y = x + g * ((1 - rho) * delayed + rho * prevDelayed);
    prevDelayed = delayed; hist[n % L] = y; d[n] = y;
  }
  return d;
}

/** Sparse clicks (crackling fire, debris, rattling bone), `density` per second, each a tiny burst of grit. */
export function crackle(sec: number, density: Curve, amp: Curve = 1, len = 0.003): Buf {
  const d = buf(sec);
  let i = 0;
  for (;;) {
    const dens = Math.max(0.5, val(density, i / SR));
    i += Math.max(1, Math.round((-Math.log(1 - Math.random()) / dens) * SR));
    if (i >= d.length) break;
    const a = val(amp, i / SR) * rand(0.25, 1), n = Math.max(2, Math.round(len * SR * rand(0.5, 1.6)));
    for (let j = 0; j < n && i + j < d.length; j++) d[i + j]! += a * (Math.random() * 2 - 1) * (1 - j / n);
  }
  return d;
}

/** Vowel formants: [centre Hz, bandwidth Hz, level]. */
export const VOWEL = {
  a: [[730, 90, 1], [1090, 110, 0.5], [2440, 160, 0.22]],
  o: [[570, 80, 1], [840, 100, 0.45], [2410, 170, 0.18]],
  u: [[300, 70, 1], [870, 100, 0.3], [2240, 150, 0.12]],
  e: [[530, 80, 1], [1840, 120, 0.4], [2480, 160, 0.3]],
  i: [[270, 60, 1], [2290, 140, 0.35], [3010, 200, 0.25]],
} as const;
export type Vowel = keyof typeof VOWEL;
/**
 * A throat: a buzzing glottis (saw) through vowel formants. `size` scales the formants (big beasts below 1, birds
 * above), `rough` adds growl, `breath` mixes in air.
 */
export function vocal(sec: number, f0: Curve, vowel: Vowel, o: { size?: number; rough?: number; breath?: number } = {}): Buf {
  const size = o.size ?? 1, rough = o.rough ?? 0, breath = o.breath ?? 0.15;
  const jit = wobble(sec, 30), grit = wobble(sec, 70);
  const src = osc(sec, t => val(f0, t) * (1 + 0.02 * jit(t) + rough * 0.08 * grit(t)), "saw");
  const air = noise(sec);
  for (let i = 0; i < src.length; i++) src[i] = src[i]! * (1 + rough * 0.9 * grit(i / SR + 0.37)) + air[i]! * breath;
  const out = buf(sec);
  for (const [f, bw, lvl] of VOWEL[vowel]) mix(out, filter(Float32Array.from(src), "bp", f * size, (f * size) / (bw * Math.max(0.6, size))), 0, lvl);
  return out;
}
/** Breath through the mouth, no voice: whispers that change vowel every `step` seconds. */
export function whisper(sec: number, step: number, size = 1): Buf {
  const vs = Array.from({ length: Math.ceil(sec / step) + 1 }, () => pick(Object.keys(VOWEL) as Vowel[]));
  const out = buf(sec);
  for (let k = 0; k < 3; k++) {
    const f = (t: number): number => VOWEL[vs[Math.floor(t / step)]!][k]![0] * size;
    mix(out, filter(noise(sec), "bp", f, t => f(t) / 120), 0, VOWEL.a[k]![2]);
  }
  return out;
}

/** Soft saturation: thickens and glues a sound together. */
export function drive(d: Buf, amount: number): Buf {
  const n = Math.tanh(amount);
  for (let i = 0; i < d.length; i++) d[i] = Math.tanh(d[i]! * amount) / n;
  return d;
}
export function normalize(d: Buf, peak = 0.9): Buf {
  let m = 0;
  for (let i = 0; i < d.length; i++) m = Math.max(m, Math.abs(d[i]!));
  return m > 0 ? gain(d, peak / m) : d;
}
export function fadeOut(d: Buf, sec = 0.02): Buf {
  const n = Math.min(d.length, Math.round(sec * SR));
  for (let i = 0; i < n; i++) d[d.length - 1 - i]! *= i / n;
  return d;
}

/**
 * A cathedral's answer: a stereo impulse response with a few early reflections off stone, then a dense tail that
 * darkens as it dies (high frequencies are swallowed first). Rendered at the context's own rate.
 */
export function cathedralImpulse(rate: number, sec = 3.6): [Float32Array, Float32Array] {
  const n = Math.round(rate * sec), pre = Math.round(rate * 0.018);
  return [0, 1].map(ch => {
    const d = new Float32Array(n);
    for (let r = 0; r < 9; r++) { const at = pre + Math.round(rate * rand(0.005, 0.07)); d[at] = rand(0.2, 0.6) * (Math.random() < 0.5 ? -1 : 1); }
    let lp = 0;
    for (let i = pre; i < n; i++) {
      const u = (i - pre) / (n - pre), decay = Math.pow(1 - u, 2.2) * Math.exp(-u * 2.2);
      const k = 0.85 - 0.75 * u; // the tail's brightness falls as it decays
      lp += k * (Math.random() * 2 - 1 - lp);
      d[i]! += lp * decay * (i - pre < rate * 0.04 ? (i - pre) / (rate * 0.04) : 1) * (ch ? 0.97 : 1);
    }
    return normalize(d, 0.5);
  }) as [Float32Array, Float32Array];
}
