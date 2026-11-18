import type { GameState, PlayerId, SimEvent } from "@lw/sim";
import { UNITS } from "@lw/sim";
import { SR, cathedralImpulse, chance, noise, pick, rand } from "./audio-dsp";
import type { Buf } from "./audio-dsp";
import { BOLT_HIT, DEATH, HIT, MATERIAL, SFX, WARM, WEAPON } from "./audio-sfx";
import type { Material, Sfx } from "./audio-sfx";
import { Music } from "./audio-music";
import { laneZ } from "./layout";
import { shotKind } from "./scene";

/**
 * All sound is synthesized: effects are rendered sample by sample into buffers (audio-sfx.ts), the score is
 * composed and played live (audio-music.ts), and the wind and the night are layered here. Battle sounds are placed
 * in the world: panned, quieter, darker and more echoing the farther they are from the camera. Presentation only.
 */

/** Interface sounds and stingers the game asks for by name. */
type Stinger = "rite" | "capture" | "lost" | "victory" | "defeat";
export type Cue = Sfx | Stinger;
const STINGERS: readonly string[] = ["rite", "capture", "lost", "victory", "defeat"];
const isStinger = (c: Cue): c is Stinger => STINGERS.includes(c);
const MAX_VOICES = 44;
const VOLUME = 0.9;

interface Place { vol: number; pan: number; far: number }
interface Plan extends Place { name: Sfx; delay: number }

/** Rendered takes of every effect, made on first use or ahead of time while the menu is up. */
class Bank {
  private takes = new Map<Sfx, AudioBuffer[]>();
  private notes = new Map<string, AudioBuffer>();
  constructor(private ctx: BaseAudioContext) {}
  private wrap(d: Buf): AudioBuffer { const b = this.ctx.createBuffer(1, d.length, SR); b.getChannelData(0).set(d); return b; }
  get(name: Sfx): AudioBuffer[] {
    let t = this.takes.get(name);
    if (!t) { const r = SFX[name]; t = Array.from({ length: r.takes ?? 3 }, () => this.wrap(r.make())); this.takes.set(name, t); }
    return t;
  }
  note(key: string, make: () => Buf): AudioBuffer {
    let b = this.notes.get(key);
    if (!b) { b = this.wrap(make()); this.notes.set(key, b); }
    return b;
  }
  /** Render in the background, one effect per idle moment, so the first battle doesn't stutter. */
  warm(names: Sfx[]): void {
    const all = [...names, ...(Object.keys(SFX) as Sfx[]).filter(n => !names.includes(n))];
    const step = (): void => {
      const n = all.shift();
      if (!n) return;
      this.get(n);
      setTimeout(step, 15);
    };
    setTimeout(step, 50);
  }
}

export class Sound {
  private ctx?: AudioContext;
  private master!: GainNode;
  private sfx!: GainNode;
  private amb!: GainNode;
  private ui!: GainNode;
  private wet!: GainNode;
  private bank!: Bank;
  private music!: Music;
  private muted = false;
  private voices = 0;
  private perName = new Map<Sfx, number>();
  private last = new Map<Sfx, number>();
  private lastTake = new Map<Sfx, number>();
  /** Unit types by id, remembered after death so a killing blow still knows what it struck. */
  private kinds = new Map<number, string>();
  private camX = 0;
  private camZ = 0;

  /** Must be called from a user gesture (the Start button). */
  start(): void {
    if (this.ctx) { void this.ctx.resume(); return; }
    const ctx = this.ctx = new AudioContext({ latencyHint: "interactive" });
    // master: a gentle glue compressor, then a fast limiter so a siege can't clip
    this.master = ctx.createGain(); this.master.gain.value = VOLUME;
    const glue = ctx.createDynamicsCompressor();
    glue.threshold.value = -20; glue.knee.value = 12; glue.ratio.value = 3; glue.attack.value = 0.01; glue.release.value = 0.25;
    const limit = ctx.createDynamicsCompressor();
    limit.threshold.value = -4; limit.knee.value = 0; limit.ratio.value = 20; limit.attack.value = 0.002; limit.release.value = 0.12;
    this.master.connect(glue).connect(limit).connect(ctx.destination);
    // one cathedral for everything: the farther a sound, the more of it is the hall
    const [l, r] = cathedralImpulse(ctx.sampleRate), ir = ctx.createBuffer(2, l.length, ctx.sampleRate);
    ir.getChannelData(0).set(l); ir.getChannelData(1).set(r);
    const conv = ctx.createConvolver(); conv.buffer = ir;
    this.wet = ctx.createGain(); this.wet.gain.value = 0.42; this.wet.connect(conv).connect(this.master);
    const bus = (v: number): GainNode => { const g = ctx.createGain(); g.gain.value = v; g.connect(this.master); return g; };
    this.sfx = bus(0.5); this.ui = bus(0.6); this.amb = bus(1.6);
    const musicBus = bus(1.1);
    this.bank = new Bank(ctx);
    this.music = new Music(ctx, musicBus, this.wet, (k, make) => this.bank.note(k, make));
    this.bank.warm(WARM);
    this.music.start();
    this.ambience();
  }
  toggleMute(): boolean {
    this.muted = !this.muted;
    if (this.ctx) { this.master.gain.setTargetAtTime(this.muted ? 0 : VOLUME, this.ctx.currentTime, 0.05); this.music.muted = this.muted; }
    return this.muted;
  }

  /** An interface sound or a stinger, heard as if close by. */
  play(name: Cue, vol = 1, pan = 0): void {
    if (!this.ctx || this.muted) return;
    if (isStinger(name)) this.music.stinger(name);
    else this.voice(name, { vol, pan, far: 0 }, 0, this.ui);
  }

  /** One take of an effect, placed: farther means quieter, more muffled and more of the hall. */
  private voice(name: Sfx, at: Place, delay = 0, bus: AudioNode = this.sfx): void {
    const ctx = this.ctx!, r = SFX[name], now = performance.now();
    if (this.voices >= MAX_VOICES || (this.perName.get(name) ?? 0) >= (r.max ?? 3)) return;
    if (r.gap && now - (this.last.get(name) ?? -1e9) < r.gap) return;
    this.last.set(name, now);
    const takes = this.bank.get(name);
    let k = Math.floor(Math.random() * takes.length);
    if (takes.length > 1 && k === this.lastTake.get(name)) k = (k + 1) % takes.length;
    this.lastTake.set(name, k);
    const src = ctx.createBufferSource();
    src.buffer = takes[k]!; src.playbackRate.value = rand(0.95, 1.05) * (r.pitch ?? 1);
    let node: AudioNode = src;
    if (at.far > 0.04) {
      const lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 16000 * Math.pow(0.07, at.far);
      node = node.connect(lp);
    }
    const g = ctx.createGain(); g.gain.value = at.vol * (r.gain ?? 1) * rand(0.85, 1);
    const p = ctx.createStereoPanner(); p.pan.value = Math.max(-1, Math.min(1, at.pan));
    node.connect(g).connect(p).connect(bus);
    const send = ctx.createGain(); send.gain.value = Math.min(1, (r.wet ?? 0.2) + at.far * 0.6); p.connect(send).connect(this.wet);
    this.voices++; this.perName.set(name, (this.perName.get(name) ?? 0) + 1);
    src.onended = () => { this.voices--; this.perName.set(name, (this.perName.get(name) ?? 1) - 1); };
    src.start(ctx.currentTime + delay);
  }

  /** Where a point of the battlefield is heard from the camera; null when it is too far to bother. */
  private place(x: number, lane: number, y: number): Place | null {
    const dx = x / 1000 - this.camX, dz = laneZ(lane) + y / 1000 - this.camZ, d = Math.hypot(dx, dz * 1.2);
    const vol = 1 / (1 + (d / 40) ** 2);
    return vol < 0.03 ? null : { vol, pan: dx / 48, far: Math.min(1, d / 110) };
  }

  /** The sounds of one tick of the battle, heard from where the camera is. */
  events(game: GameState, camX: number, camZ: number, me: PlayerId): void {
    if (!this.ctx || this.muted) return;
    this.camX = camX; this.camZ = camZ;
    const myTeam = game.players[me]?.team ?? 0;
    for (const u of game.units) this.kinds.set(u.id, u.type);
    if (this.kinds.size > 4000) { const live = new Set(game.units.map(u => u.id)); for (const id of this.kinds.keys()) if (!live.has(id)) this.kinds.delete(id); }
    // each effect sounds at most once a tick, from wherever it is loudest
    const plans = new Map<string, Plan>();
    const want = (name: Sfx, at: Place | null, gain = 1, delay = 0): void => {
      if (!at) return;
      const vol = at.vol * gain, key = delay > 0.05 ? `${name}+` : name, cur = plans.get(key);
      if (!cur || cur.vol < vol) plans.set(key, { ...at, vol, name, delay });
    };
    const wide = (name: Sfx, vol = 1): void => want(name, { vol, pan: 0, far: 0 });
    let heat = 0;
    for (const e of game.events) {
      if (e.t === "shot") {
        const from = this.place(e.x1, e.lane, e.y1), w = WEAPON[e.unit] ?? { sound: "sword", hit: "victim", delay: 0.06 };
        heat += 0.02 + 0.05 * (from?.vol ?? 0);
        want(w.sound, from);
        if (!w.hit) continue;
        const mat: Material = e.to === 0 || e.chantry ? "stone" : MATERIAL[this.kinds.get(e.to) ?? ""] ?? "flesh";
        const kind = shotKind(e.unit), dist = Math.hypot(e.x2 - e.x1, e.y2 - e.y1) / 1000;
        const flight = kind === "bolt" ? 0.17 : kind === "stake" ? 0.23 : kind === "stone" ? 0.7 : kind === "orb" ? 0.11 + dist * 0.034 : 0;
        const hit = w.hit !== "victim" ? w.hit : kind === "bolt" || kind === "gun" ? BOLT_HIT[mat] : HIT[mat];
        want(hit, this.place(e.x2, e.lane, e.y2), w.hitGain ?? 1, flight + (w.delay ?? 0));
      } else if (e.t === "arc") want("arc", this.place(e.x2, e.lane, e.y2));
      else if (e.t === "death") {
        const def = UNITS[e.unit], at = this.place(e.x, e.lane, e.y);
        heat += 0.05 + 0.1 * (at?.vol ?? 0);
        want(def?.structure ? "collapse" : DEATH[MATERIAL[e.unit] ?? "flesh"], at);
      }
      else if (e.t === "raise") want("raise", this.place(e.x, e.lane, e.y));
      else if (e.t === "reborn") want("rebirth", this.place(e.x, e.lane, e.y));
      else if (e.t === "martyr") want("martyr", this.place(e.x, e.lane, e.y));
      else if (e.t === "built") want("build", this.place(e.x, e.lane, e.y));
      else if (e.t === "teleport" && e.player !== me) want("teleport", this.place(e.x, e.lane, e.y), 0.7);
      else if (e.t === "heal") want("heal", this.place(e.x2, e.lane, e.y2));
      else if (e.t === "razed") want("collapse", this.place(e.x, e.lane, e.y));
      else if (e.t === "urn") want("whistle", this.place(e.x1, e.lane, e.y1));
      else if (e.t === "burst") want("burst", this.place(e.x, e.lane, e.y));
      else if (e.t === "capture") this.music.stinger(e.team === myTeam ? "capture" : "lost");
      else if (e.t === "wave") wide("bell", 0.8);
      else if (e.t === "storm") wide("thunder");
      else if (e.t === "bolt" && e.struck > 0) wide("thunder", rand(0.4, 0.6));
      else if (e.t === "fog") wide("fog");
      else if (e.t === "vultures") wide("vultures", 0.9);
    }
    for (const p of plans.values()) this.voice(p.name, p, p.delay + Math.random() * 0.02);
    this.music.excite(heat);
  }

  // ---- the night around the battle ----------------------------------------------------------------------------

  /** Wind that gusts and howls through the ruins, never on a loop, and the odd crow, bell, wolf or creaking gibbet. */
  private ambience(): void {
    const ctx = this.ctx!, n = noise(4), nb = ctx.createBuffer(1, n.length, SR);
    nb.getChannelData(0).set(n);
    const merge = ctx.createChannelMerger(2); merge.connect(this.amb);
    const layer = (type: BiquadFilterType, f: number, q: number, v: number, ch?: number): [BiquadFilterNode, GainNode] => {
      const s = ctx.createBufferSource(), bp = ctx.createBiquadFilter(), g = ctx.createGain();
      s.buffer = nb; s.loop = true; bp.type = type; bp.frequency.value = f; bp.Q.value = q; g.gain.value = v;
      s.connect(bp).connect(g);
      if (ch === undefined) g.connect(this.amb); else g.connect(merge, 0, ch);
      s.start(0, Math.random() * 4);
      return [bp, g];
    };
    const sides = [layer("bandpass", 420, 0.6, 0.045, 0), layer("bandpass", 380, 0.6, 0.045, 1)];
    const [, body] = layer("lowpass", 140, 0.7, 0.05);
    const [howlF, howlG] = layer("bandpass", 600, 14, 0);
    const send = ctx.createGain(); send.gain.value = 0.4; howlG.connect(send).connect(this.wet);
    // gusts: each side wanders to a new strength and pitch on its own clock
    const gust = (): void => {
      const t = ctx.currentTime, heat = this.music.heat;
      for (const [f, g] of sides) if (chance(0.6)) {
        const tc = rand(0.6, 2.5);
        f.frequency.setTargetAtTime(rand(260, 950), t, tc);
        g.gain.setTargetAtTime(rand(0.02, 0.09) * (1 - heat * 0.4), t, tc);
      }
      body.gain.setTargetAtTime(rand(0.04, 0.1), t, 2);
      if (chance(0.12)) { // the wind finds a gap in the stones and sings through it
        howlF.frequency.setTargetAtTime(rand(380, 1100), t, rand(1, 3));
        howlG.gain.setTargetAtTime(rand(0.006, 0.018), t, 1.2);
        howlG.gain.setTargetAtTime(0, t + rand(3, 6), 1.5);
      }
      setTimeout(gust, rand(700, 2200));
    };
    gust();
    // the night's voices, at a distance and from either side
    const voices: [Sfx, number][] = [["crow", 4], ["gibbet", 2], ["chains", 2], ["owl", 1.5], ["bellFar", 1], ["wolf", 0.8], ["rumble", 1]];
    const total = voices.reduce((s, [, w]) => s + w, 0);
    const call = (): void => {
      if (!this.muted && ctx.state === "running" && this.music.heat < 0.7) {
        let r = Math.random() * total, name: Sfx = "crow";
        for (const [n2, w] of voices) { r -= w; if (r <= 0) { name = n2; break; } }
        this.voice(name, { vol: rand(0.15, 0.3), pan: pick([-1, 1]) * rand(0.3, 0.95), far: rand(0.35, 0.8) }, 0, this.amb);
      }
      setTimeout(call, rand(5000, 13000));
    };
    setTimeout(call, 4000);
  }
}
