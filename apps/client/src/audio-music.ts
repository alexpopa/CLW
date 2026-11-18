import { VOWEL, chance, env, filter, mix, modes, noise, normalize, osc, pick, pluck, rand, glide, gain } from "./audio-dsp";
import type { Buf, Vowel } from "./audio-dsp";
import { bellTone } from "./audio-sfx";

/**
 * The score: composed while it plays, so it never loops. A slow minor-key progression is chosen phrase by phrase,
 * voiced for a choir, low strings or an organ, with a melody written afresh for harp, a solo voice or horns. How
 * hard the battle is going sets the mood: a quiet vigil, a gathering pulse, or driving drums and ostinato.
 * Everything is synthesized live with WebAudio (pads, strings, voices, horns) or from rendered buffers (harp,
 * drums, bells). Presentation only.
 */

const mtof = (m: number): number => 440 * Math.pow(2, (m - 69) / 12);
const mod = (a: number, n: number): number => ((a % n) + n) % n;

/** Chords as semitones above the key's tonic (a minor key, with the major dominant and the dark flat second). */
const CHORD = { i: [0, 3, 7], iv: [5, 8, 12], v: [7, 10, 14], V: [7, 11, 14], VI: [8, 12, 15], III: [3, 7, 10], VII: [10, 14, 17], bII: [1, 5, 8], I: [0, 4, 7] } as const;
type ChordName = keyof typeof CHORD;
const PROGRESSIONS: ChordName[][] = [
  ["i", "VI", "III", "VII"], ["i", "iv", "V", "i"], ["i", "VI", "iv", "V"], ["i", "bII", "i", "V"], ["i", "VII", "VI", "V"],
  ["VI", "VII", "i", "i"], ["i", "iv", "VI", "V"], ["i", "III", "iv", "V"], ["iv", "i", "VI", "V"], ["i", "v", "VI", "iv"],
  ["VI", "iv", "i", "V"], ["i", "bII", "VII", "i"],
];
/** Tonics for the bass (D2, F2, C2, G2, E2): the score drifts between keys every few phrases. */
const TONICS = [38, 41, 36, 43, 40];
const SCALE = [0, 2, 3, 5, 7, 8, 10];
const RHYTHM: Record<number, number[][]> = {
  8: [[0, 3, 4, 6], [0, 2, 4], [0, 4], [0, 1.5, 2, 4, 6], [0, 3, 6], [0, 2, 3, 4]],
  4: [[0, 2], [0, 1, 2], [0, 3], [0], [0, 1.5, 2], [0, 2, 3]],
};

type Mood = 0 | 1 | 2; // a vigil, gathering tension, open battle
type Pad = "choir" | "strings" | "organ";
type Lead = "harp" | "voice" | "horn";
interface Note { at: number; m: number; beats: number }
interface Phrase { mood: Mood; bpm: number; chordBeats: number; prog: ChordName[]; pad: Pad | null; lead: Lead | null; arp: boolean; bell: boolean; notes: Map<number, Note[]> }

export class Music {
  muted = false;
  private activity = 0;
  private intensity = 0;
  private phrase!: Phrase;
  private beatN = 0;
  private next = 0;
  private tonic = 38;
  private inKey = 0;
  private voicing = [62, 65, 69];
  private lastProg = -1;
  private holdUntil = 0;
  private organWave: PeriodicWave;
  private score: GainNode;
  /** Where instruments play into: the score, or (while a stinger is written) the stinger bus that the ducking spares. */
  private dest: AudioNode;
  private sting: GainNode;

  constructor(private ctx: AudioContext, out: AudioNode, private wet: AudioNode, private note: (key: string, make: () => Buf) => AudioBuffer) {
    this.score = ctx.createGain(); this.score.connect(out);
    this.sting = ctx.createGain(); this.sting.connect(out);
    this.dest = this.score;
    // a pipe organ's ranks: the fundamental, octave, twelfth, fifteenth and a little mixture
    const harm = [0, 1, 0.55, 0.32, 0.3, 0.08, 0.14, 0, 0.11, 0, 0.05, 0, 0.05];
    this.organWave = ctx.createPeriodicWave(new Float32Array(harm.length), Float32Array.from(harm));
  }

  start(): void {
    this.phrase = this.plan(0);
    this.next = this.ctx.currentTime + 0.4;
    setInterval(() => this.pump(), 60);
  }
  /** Battle noise near the listener pushes the score toward its fiercer moods. */
  excite(amount: number): void { this.activity = Math.min(60, this.activity + amount); }
  get heat(): number { return this.intensity; }

  private mood(): Mood { return this.intensity > 0.6 ? 2 : this.intensity > 0.25 ? 1 : 0; }

  private pump(): void {
    const ctx = this.ctx, now = ctx.currentTime;
    this.activity *= Math.exp(-0.06 / 6); // a six-second memory for the fighting
    this.intensity = 1 - Math.exp(-this.activity / 8);
    if (this.muted || ctx.state !== "running") { this.next = Math.max(this.next, now + 0.1); return; }
    if (this.next < now - 0.25) this.next = now + 0.05; // the tab slept: pick up from here rather than cram
    while (this.next < now + 0.3) {
      if (this.next < this.holdUntil) { this.next = this.holdUntil; this.beatN = 0; this.phrase = this.plan(this.mood()); continue; }
      this.beat(this.next);
      this.next += 60 / this.phrase.bpm;
    }
  }

  // ---- composition ----------------------------------------------------------------------------------------

  private plan(mood: Mood): Phrase {
    if (++this.inKey > 3 && chance(0.4)) { this.tonic = pick(TONICS.filter(x => x !== this.tonic)); this.inKey = 0; }
    let pi = Math.floor(Math.random() * PROGRESSIONS.length);
    if (pi === this.lastProg) pi = (pi + 1 + Math.floor(Math.random() * (PROGRESSIONS.length - 1))) % PROGRESSIONS.length;
    this.lastProg = pi;
    const prog = PROGRESSIONS[pi]!, chordBeats = mood === 0 ? 8 : 4;
    const arp = mood === 0 && chance(0.3);
    const pad: Pad | null = arp ? (chance(0.5) ? null : "strings") : mood === 0 ? pick<Pad>(["choir", "choir", "strings", "organ"]) : mood === 1 ? pick<Pad>(["choir", "strings"]) : "choir";
    const lead: Lead | null = chance(arp ? 0.35 : 0.6) ? pick<Lead>(mood === 0 ? ["harp", "voice", "harp"] : mood === 1 ? ["voice", "harp", "horn"] : ["horn", "horn", "voice"]) : null;
    return {
      mood, prog, chordBeats, pad, lead, arp,
      bpm: [56, 68, 82][mood]! + rand(-3, 3),
      bell: mood === 0 && chance(0.35),
      notes: lead ? this.compose(prog, chordBeats) : new Map(),
    };
  }

  /** Pitch classes of a chord in the current key. */
  private pcs(name: ChordName): number[] { return CHORD[name].map(s => mod(this.tonic + s, 12)); }
  /** Scale degree d (0 = tonic, 7 = an octave up) as a pitch over this chord: the leading tone on V, the flat second on bII. */
  private degree(d: number, chord: readonly number[], base: number): number {
    let s = SCALE[mod(d, 7)]!;
    const has = (x: number): boolean => chord.some(c => mod(c, 12) === x);
    if (s === 10 && has(11)) s = 11;
    if (s === 2 && has(1)) s = 1;
    if (s === 3 && has(4)) s = 4;
    return base + 12 * Math.floor(d / 7) + s;
  }
  /** A melody: chord tones on the strong beats, mostly stepwise between, ending on a long chord tone. */
  private compose(prog: ChordName[], chordBeats: number): Map<number, Note[]> {
    const notes = new Map<number, Note[]>(), base = this.tonic + 24;
    let d = pick([2, 4, 7]);
    prog.forEach((name, ci) => {
      const chord = CHORD[name], pcs = this.pcs(name), last = ci === prog.length - 1;
      const onsets = last ? [0] : pick(RHYTHM[chordBeats]!);
      onsets.forEach((on, k) => {
        if (k === 0) { // land on the nearest chord tone, preferring to move
          const options: number[] = [];
          for (let c = d - 3; c <= d + 3; c++) if (pcs.includes(mod(this.degree(c, chord, base), 12)) && c >= -1 && c <= 10) options.push(c);
          options.sort((a, b) => Math.abs(a - d) - Math.abs(b - d) + (a === d ? 0.5 : 0) - (b === d ? 0.5 : 0) + rand(-0.4, 0.4));
          d = options[0] ?? d;
        } else {
          d += d > 8 ? pick([-1, -1, -2, 1]) : d < 1 ? pick([1, 1, 2, -1]) : pick([-1, -1, 1, 1, -2, 2, 0]);
        }
        const end = onsets[k + 1] ?? chordBeats, at = ci * chordBeats + on;
        const list = notes.get(Math.floor(at)) ?? [];
        list.push({ at: at - Math.floor(at), m: this.degree(d, chord, base), beats: end - on });
        notes.set(Math.floor(at), list);
      });
    });
    return notes;
  }
  /** Move the three pad voices to the new chord by the smallest total motion. */
  private lead(name: ChordName): number[] {
    const pcs = this.pcs(name), perms = [[0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0]];
    let best: number[] = this.voicing, cost = Infinity;
    for (const p of perms) {
      const v = this.voicing.map((prev, i) => {
        const pc = pcs[p[i]!]!;
        let m = prev - mod(prev - pc, 12);
        if (prev - m > 6) m += 12;
        while (m < 53) m += 12;
        while (m > 79) m -= 12;
        return m;
      });
      const c = v.reduce((s, m, i) => s + Math.abs(m - this.voicing[i]!), 0) + (new Set(v).size < 3 ? 50 : 0);
      if (c < cost) { cost = c; best = v; }
    }
    return [...best].sort((a, b) => a - b);
  }

  private beat(t: number): void {
    let p = this.phrase;
    const spb = 60 / p.bpm, b = this.beatN, ci = Math.floor(b / p.chordBeats), cb = b % p.chordBeats;
    // a fight that flares up mid-phrase brings in the fiercer music at the next chord
    if (cb === 0 && ci > 0 && this.mood() > p.mood) { this.phrase = p = this.plan(this.mood()); this.beatN = 0; this.beat(t); return; }
    const name = p.prog[ci]!, chord = CHORD[name];
    let root = this.tonic + chord[0];
    while (root > 47) root -= 12;
    const dur = p.chordBeats * spb;
    if (cb === 0) {
      this.voicing = this.lead(name);
      const v = this.voicing;
      if (p.pad === "choir") for (const m of v) this.choir(m, t, dur + 0.4, [0.045, 0.055, 0.07][p.mood]!, p.mood === 2 ? "a" : pick<Vowel>(["a", "o", "o"]));
      else if (p.pad === "strings") for (const m of v) this.strings(m, t, dur + 0.3, 0.035);
      else if (p.pad === "organ") this.organ(v, t, dur + 0.2, 0.028);
      this.strings(root, t, dur + 0.4, p.mood === 2 ? 0.06 : 0.07, true);
      if (p.mood === 2) this.strings(root - 12 >= 28 ? root - 12 : root, t, dur + 0.4, 0.04, true);
      if (p.mood === 2) for (const m of v) this.horn(m - 12, t, spb * 1.6, 0.03);
      if (ci === 0 && p.bell) this.bell(this.tonic + 24, t + spb * 0.5, 0.22);
    }
    if (p.mood === 1) { // a gathering pulse: low strings on the beat, the kettledrum at each bar
      const step = [0, 0, 7, 0][cb % 4]!;
      this.staccato(root + 12 + step, t, cb % 4 === 0 ? 0.075 : 0.05, cb % 4 === 0);
      if (cb % 4 === 0) this.timpani(root, t, 0.55);
    } else if (p.mood === 2) { // open battle: driving eighths in threes, war drums under them
      for (let e = 0; e < 2; e++) {
        const k = (cb % 4) * 2 + e, accent = k === 0 || k === 3 || k === 6, at = t + (e * spb) / 2;
        this.staccato(root + 12 + (k === 6 ? 7 : 0), at, accent ? 0.085 : 0.05, accent);
        if (accent) this.drum("taiko", at, k === 0 ? 0.6 : 0.42);
        else if (chance(0.45)) this.drum("frame", at, rand(0.12, 0.22));
      }
    }
    // the last bar of a fierce phrase rolls the kettledrums up into the next
    if (p.mood >= 1 && b >= p.prog.length * p.chordBeats - 2) for (let r = 0; r < 6; r++) this.timpani(root, t + (r * spb) / 6, 0.12 + 0.05 * r + (b === p.prog.length * p.chordBeats - 1 ? 0.15 : 0));
    // a harp turning over the chord in the quiet
    if (p.arp) {
      const tones = [...chord, chord[0] + 12, chord[1] + 12, chord[2] + 12], shape = [0, 1, 2, 3, 4, 3, 2, 1];
      for (let e = 0; e < 2; e++) { const k = (cb * 2 + e) % 8; this.harp(this.tonic + 12 + tones[shape[k]!]!, t + (e * spb) / 2, k === 0 ? 0.32 : 0.22); }
    }
    for (const n of p.notes.get(b) ?? []) {
      const at = t + n.at * spb, len = n.beats * spb;
      if (p.lead === "harp") { this.harp(n.m, at, 0.36); if (n.beats >= 2) this.harp(n.m - 12, at, 0.18); }
      else if (p.lead === "voice") this.voice(n.m - (n.m > 76 ? 12 : 0), at, len, 0.05);
      else if (p.lead === "horn") this.horn(n.m - 12, at, len * 0.92, 0.05);
    }
    this.beatN++;
    if (this.beatN >= p.prog.length * p.chordBeats) { this.phrase = this.plan(this.mood()); this.beatN = 0; }
  }

  // ---- stingers -------------------------------------------------------------------------------------------

  /** Short pieces for moments: a shrine taken or lost, a rite completed, the end of a match. */
  stinger(kind: "capture" | "lost" | "rite" | "victory" | "defeat"): void {
    if (this.muted) return;
    this.dest = this.sting;
    try { this.playStinger(kind); } finally { this.dest = this.score; }
  }
  private playStinger(kind: "capture" | "lost" | "rite" | "victory" | "defeat"): void {
    const t = this.ctx.currentTime + 0.05, T = this.tonic + 12;
    const chords = (list: number[][], len: number, vol: number, vowel: Vowel, organ: boolean, from = 0): void =>
      list.forEach((c, i) => {
        const at = t + from + i * len, last = i === list.length - 1, d = last ? len * 3 : len + 0.2;
        for (const s of c) this.choir(T + 12 + s, at, d, vol, vowel, 0.6);
        if (organ) this.organ(c.map(s => T + s), at, d, vol * 0.6, 0.1);
        this.strings(T - 12 + c[0]!, at, d, vol * 1.3, true);
      });
    const duck = (sec: number): void => {
      this.holdUntil = t + sec;
      const g = this.score.gain; g.cancelScheduledValues(t); g.setValueAtTime(g.value, t); g.linearRampToValueAtTime(0, t + 1.2); g.setValueAtTime(0, t + sec - 0.5); g.linearRampToValueAtTime(1, t + sec);
    };
    if (kind === "capture") { this.bell(T + 24, t, 0.4); chords([[0, 4, 7]], 1.2, 0.05, "a", false); }
    else if (kind === "lost") { this.bell(T + 5, t, 0.45); chords([[-4, 0, 3]], 1.2, 0.05, "o", false); }
    else if (kind === "rite") { this.organ([T + 7, T + 11, T + 14], t, 1.1, 0.04, 0.05); this.organ([T, T + 3, T + 7, T + 12], t + 1.1, 2.6, 0.045, 0.05); this.bell(T + 24, t + 1.1, 0.35); }
    else if (kind === "victory") {
      duck(14);
      chords([[0, 3, 7], [5, 8, 12], [7, 11, 14], [0, 4, 7, 12]], 1.5, 0.07, "a", true);
      for (let r = 0; r < 12; r++) this.timpani(T - 12 + 7, t + 3.5 + r * 0.08, 0.15 + r * 0.04);
      this.bell(T + 12, t + 4.5, 0.6); this.bell(T + 24, t + 5.2, 0.4);
      this.drum("taiko", t + 4.5, 0.8);
    } else {
      duck(15);
      chords([[0, 3, 7], [-4, 0, 3], [-7, -4, 0], [-12, -9, -5, 0]], 2, 0.06, "o", true);
      this.bell(T - 12, t + 6, 0.7);
      for (const at of [0, 2, 4, 6]) this.timpani(T - 12, t + at, 0.35);
    }
  }

  // ---- instruments ----------------------------------------------------------------------------------------

  private sink(pan: number, wet: number): AudioNode {
    const ctx = this.ctx, p = ctx.createStereoPanner();
    p.pan.value = pan; p.connect(this.dest);
    if (wet > 0) { const w = ctx.createGain(); w.gain.value = wet; p.connect(w).connect(this.wet); }
    return p;
  }
  /** Attack to `peak`, hold until `end`, then a natural fall. */
  private amp(t: number, attack: number, end: number, release: number, peak: number): GainNode {
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(peak, t + attack);
    g.gain.setValueAtTime(peak, Math.max(t + attack, end)); g.gain.setTargetAtTime(0, Math.max(t + attack, end), release / 3);
    return g;
  }
  private vibrato(t: number, rate: number, cents: number, delay: number, stop: number): GainNode {
    const ctx = this.ctx, lfo = ctx.createOscillator(), depth = ctx.createGain();
    lfo.frequency.value = rate; depth.gain.setValueAtTime(0, t); depth.gain.linearRampToValueAtTime(cents, t + delay);
    lfo.connect(depth); lfo.start(t); lfo.stop(stop);
    return depth;
  }
  private oscs(t: number, stop: number, f: number, detunes: number[], dest: AudioNode, vib?: GainNode, type: OscillatorType = "sawtooth"): void {
    for (const d of detunes) {
      const o = this.ctx.createOscillator();
      if (type === "custom") o.setPeriodicWave(this.organWave); else o.type = type;
      o.frequency.value = f; o.detune.value = d + rand(-3, 3);
      vib?.connect(o.detune); o.connect(dest); o.start(t); o.stop(stop);
    }
  }
  /** A small choir on one note: detuned voices through vowel formants, with a slow vibrato. */
  private choir(m: number, t: number, dur: number, vol: number, vowel: Vowel, wet = 0.7): void {
    const ctx = this.ctx, end = t + dur, rel = 1.8, stop = end + rel * 1.6;
    const amp = this.amp(t, 1.1, end, rel, vol); amp.connect(this.sink(rand(-0.5, 0.5), wet));
    const lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 3600; lp.connect(amp);
    const src = ctx.createGain(); src.gain.value = 0.5;
    const size = m < 57 ? 0.92 : m > 70 ? 1.1 : 1; // lower voices sing darker
    for (const [f, bw, lvl] of VOWEL[vowel]) {
      const bp = ctx.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = f * size; bp.Q.value = (f * size) / bw;
      const g = ctx.createGain(); g.gain.value = lvl * 1.6; src.connect(bp).connect(g).connect(lp);
    }
    this.oscs(t, stop, mtof(m), [-12, 0, 11], src, this.vibrato(t, rand(4.6, 5.4), rand(9, 15), 1.4, stop));
  }
  private voice(m: number, t: number, dur: number, vol: number): void {
    const ctx = this.ctx, end = t + dur, rel = 0.9, stop = end + rel * 1.6;
    const amp = this.amp(t, 0.22, end, rel, vol); amp.connect(this.sink(rand(-0.2, 0.2), 0.75));
    const src = ctx.createGain(); src.gain.value = 0.9;
    for (const [f, bw, lvl] of VOWEL[pick<Vowel>(["o", "u", "a"])]) {
      const bp = ctx.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = f * 1.12; bp.Q.value = (f * 1.12) / bw;
      const g = ctx.createGain(); g.gain.value = lvl * 1.6; src.connect(bp).connect(g).connect(amp);
    }
    this.oscs(t, stop, mtof(m), [-4, 4], src, this.vibrato(t, rand(5.2, 5.8), rand(18, 24), 0.4, stop));
  }
  private strings(m: number, t: number, dur: number, vol: number, bass = false): void {
    const ctx = this.ctx, end = t + dur, rel = bass ? 1.2 : 1.4, stop = end + rel * 1.6;
    const amp = this.amp(t, bass ? 0.3 : 0.7, end, rel, vol); amp.connect(this.sink(bass ? 0 : rand(-0.45, 0.45), bass ? 0.35 : 0.55));
    const lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = bass ? 650 : 1700; lp.Q.value = 0.6;
    const hp = ctx.createBiquadFilter(); hp.type = "highpass"; hp.frequency.value = 45;
    lp.connect(hp).connect(amp);
    this.oscs(t, stop, mtof(m), [-7, 7], lp, this.vibrato(t, rand(5, 5.8), bass ? 5 : 9, 0.8, stop));
  }
  /** Low strings bowed short and hard: the battle ostinato. */
  private staccato(m: number, t: number, vol: number, accent: boolean): void {
    const ctx = this.ctx, stop = t + 0.5;
    const amp = ctx.createGain(); amp.gain.setValueAtTime(0, t); amp.gain.linearRampToValueAtTime(vol, t + 0.008); amp.gain.setTargetAtTime(0, t + 0.05, 0.07);
    amp.connect(this.sink(0, 0.25));
    const lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.Q.value = 2;
    lp.frequency.setValueAtTime(accent ? 2600 : 1500, t); lp.frequency.exponentialRampToValueAtTime(320, t + 0.2);
    lp.connect(amp);
    this.oscs(t, stop, mtof(m), [-9, 9], lp);
  }
  private organ(ms: number[], t: number, dur: number, vol: number, wet = 0.9): void {
    const ctx = this.ctx, end = t + dur, stop = end + 1.5;
    const amp = this.amp(t, 0.08, end, 0.8, vol); amp.connect(this.sink(0, wet));
    const lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 2600; lp.connect(amp);
    for (const m of ms) this.oscs(t, stop, mtof(m), [-3, 3], lp, undefined, "custom");
  }
  /** Brass: a filter that opens as the note speaks. */
  private horn(m: number, t: number, dur: number, vol: number): void {
    const ctx = this.ctx, end = t + dur, stop = end + 1;
    const amp = this.amp(t, 0.07, end, 0.45, vol); amp.connect(this.sink(rand(-0.25, 0.25), 0.5));
    const lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.Q.value = 1;
    lp.frequency.setValueAtTime(280, t); lp.frequency.exponentialRampToValueAtTime(1500, t + 0.12); lp.frequency.setTargetAtTime(850, t + 0.12, 0.3);
    lp.connect(amp);
    this.oscs(t, stop, mtof(m), [-6, 6], lp, this.vibrato(t, 5, 6, 0.5, stop));
  }
  private sample(b: AudioBuffer, t: number, vol: number, pan: number, wet: number, rate = 1): void {
    const s = this.ctx.createBufferSource(), g = this.ctx.createGain();
    s.buffer = b; s.playbackRate.value = rate; g.gain.value = vol;
    s.connect(g).connect(this.sink(pan, wet)); s.start(t);
  }
  private harp(m: number, t: number, vol: number): void {
    this.sample(this.note(`harp${m}`, () => normalize(filter(pluck(3, mtof(m), Math.max(0.9, 2.6 - (m - 50) * 0.04), 0.55), "lp", 4500), 0.8)), t, vol, rand(-0.35, 0.35), 0.5);
  }
  private bell(m: number, t: number, vol: number): void {
    this.sample(this.note("bell", () => normalize(bellTone(220, 6), 0.8)), t, vol, rand(-0.3, 0.3), 0.8, mtof(m) / 220);
  }
  private timpani(m: number, t: number, vol: number): void {
    const f = 73.42;
    this.sample(this.note("timpani", () => {
      const d = modes(2.2, [[f, 1, 1.8], [f * 1.5, 0.5, 1.2], [f * 1.98, 0.35, 0.9], [f * 2.44, 0.2, 0.6], [f * 2.98, 0.12, 0.4]]);
      mix(d, env(osc(0.4, glide(f * 1.5, f, 0.05)), 0.001, 0.3), 0, 0.6);
      return normalize(mix(d, gain(env(filter(noise(0.05), "lp", 900), 0.0005, 0.04), 0.5)), 0.85);
    }), t, vol, 0, 0.45, mtof(m) / f);
  }
  private drum(kind: "taiko" | "frame", t: number, vol: number): void {
    const b = this.note(kind, () => kind === "taiko"
      ? normalize(mix(mix(env(osc(1.2, glide(100, 52, 0.25)), 0.001, 0.9), modes(1, [[60, 0.6, 0.8], [97, 0.4, 0.5], [142, 0.25, 0.3]])), gain(env(filter(noise(0.06), "bp", 320, 0.8), 0.0005, 0.05), 0.8)), 0.9)
      : normalize(mix(modes(0.4, [[185, 1, 0.25], [292, 0.5, 0.15], [460, 0.3, 0.1]]), gain(env(filter(noise(0.04), "bp", 1300, 0.9), 0.0005, 0.03), 1.2)), 0.8));
    this.sample(b, t, vol, kind === "taiko" ? rand(-0.15, 0.15) : rand(-0.5, 0.5), 0.4, rand(0.97, 1.03));
  }
}
