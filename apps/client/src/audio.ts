import type { SimEvent, TeamId } from "@lw/sim";
import { MAP, UNITS } from "@lw/sim";
import { shotKind } from "./scene";

/** All sound is synthesized with WebAudio: no audio files. Presentation only. */
type Name = "click" | "deny" | "coin" | "build" | "rite" | "bell" | "bolt" | "clang" | "flame" | "heal" | "thud" | "boom" | "smite" | "gun" | "curse" | "zap" | "frost" | "raise" | "study" | "death" | "capture" | "lost" | "victory" | "defeat" | "thunder" | "fog" | "screech" | "whistle" | "burst" | "squeak" | "rebirth";
const GAP: Partial<Record<Name, number>> = { bolt: 70, clang: 80, flame: 110, heal: 160, death: 90, thud: 200, boom: 200, smite: 120, gun: 90, curse: 120, zap: 110, frost: 150, raise: 200, thunder: 350, whistle: 120, burst: 120, squeak: 140, rebirth: 400 };

export class Sound {
  private ctx?: AudioContext;
  private out!: GainNode; private wet!: GainNode;
  private muted = false;
  private last: Partial<Record<Name, number>> = {};
  private noiseBuf!: AudioBuffer;
  private chord = 0;

  /** Must be called from a user gesture (the Start button). */
  start(): void {
    if (this.ctx) { void this.ctx.resume(); return; }
    const ctx = this.ctx = new AudioContext();
    this.out = ctx.createGain(); this.out.gain.value = 0.8;
    const comp = ctx.createDynamicsCompressor(); this.out.connect(comp).connect(ctx.destination);
    // cathedral reverb: decaying noise impulse
    const len = ctx.sampleRate * 3, imp = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) { const d = imp.getChannelData(ch); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6); }
    const conv = ctx.createConvolver(); conv.buffer = imp;
    this.wet = ctx.createGain(); this.wet.gain.value = 0.55; this.wet.connect(conv).connect(this.out);
    this.noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const n = this.noiseBuf.getChannelData(0); for (let i = 0; i < n.length; i++) n[i] = Math.random() * 2 - 1;
    this.ambience();
  }
  toggleMute(): boolean {
    this.muted = !this.muted;
    if (this.ctx) this.out.gain.setTargetAtTime(this.muted ? 0 : 0.8, this.ctx.currentTime, 0.05);
    return this.muted;
  }

  private tone(freq: number, dur: number, vol: number, type: OscillatorType = "sine", o: { to?: number; at?: number; pan?: number; wet?: number; attack?: number; lp?: number } = {}): void {
    const ctx = this.ctx!, t = ctx.currentTime + (o.at ?? 0), osc = ctx.createOscillator(), g = ctx.createGain();
    osc.type = type; osc.frequency.setValueAtTime(freq, t);
    if (o.to) osc.frequency.exponentialRampToValueAtTime(o.to, t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + (o.attack ?? 0.005)); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    let node: AudioNode = osc;
    if (o.lp) { const f = ctx.createBiquadFilter(); f.type = "lowpass"; f.frequency.value = o.lp; node = node.connect(f); }
    this.route(node.connect(g), o.pan ?? 0, o.wet ?? 0);
    osc.start(t); osc.stop(t + dur + 0.05);
  }
  private noise(dur: number, vol: number, type: BiquadFilterType, freq: number, o: { at?: number; pan?: number; wet?: number; q?: number; to?: number } = {}): void {
    const ctx = this.ctx!, t = ctx.currentTime + (o.at ?? 0), src = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    src.buffer = this.noiseBuf; src.loop = true; f.type = type; f.frequency.setValueAtTime(freq, t); f.Q.value = o.q ?? 0.8;
    if (o.to) f.frequency.exponentialRampToValueAtTime(o.to, t + dur);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    this.route(src.connect(f).connect(g), o.pan ?? 0, o.wet ?? 0);
    src.start(t, Math.random()); src.stop(t + dur + 0.05);
  }
  private route(node: AudioNode, pan: number, wet: number): void {
    const p = this.ctx!.createStereoPanner(); p.pan.value = Math.max(-1, Math.min(1, pan));
    node.connect(p); p.connect(this.out);
    if (wet > 0) { const w = this.ctx!.createGain(); w.gain.value = wet; p.connect(w).connect(this.wet); }
  }
  /** Church bell: inharmonic partials with long, staggered decays. */
  private bell(base: number, vol: number, at = 0, pan = 0): void {
    for (const [ratio, amp, dur] of [[0.5, 0.5, 5], [1, 1, 4], [1.19, 0.6, 3], [1.5, 0.4, 2.4], [2, 0.5, 2], [2.51, 0.25, 1.4], [3.01, 0.2, 1], [4.1, 0.1, 0.7]] as const)
      this.tone(base * ratio, dur, vol * amp * 0.22, "sine", { at, pan, wet: 0.7 });
    this.noise(0.05, vol * 0.2, "bandpass", base * 4, { at, pan });
  }
  private organ(freqs: number[], dur: number, vol: number, at = 0): void {
    for (const f of freqs) for (const d of [-3, 3]) this.tone(f * (1 + d / 1000), dur, vol, "sawtooth", { at, attack: dur * 0.25, lp: 900, wet: 0.9 });
  }

  play(name: Name, vol = 1, pan = 0): void {
    if (!this.ctx || this.muted) return;
    const now = performance.now(), gap = GAP[name];
    if (gap && now - (this.last[name] ?? 0) < gap) return;
    this.last[name] = now;
    const v = vol;
    switch (name) {
      case "click": this.tone(1100, 0.05, 0.05 * v, "triangle", { to: 700 }); break;
      case "deny": this.tone(150, 0.18, 0.12 * v, "sawtooth", { to: 95, lp: 700 }); break;
      case "coin": this.tone(1568, 0.12, 0.07 * v, "sine", { wet: 0.3 }); this.tone(2093, 0.2, 0.06 * v, "sine", { at: 0.07, wet: 0.3 }); break;
      case "build": for (const at of [0, 0.13, 0.26]) { this.noise(0.06, 0.3 * v, "bandpass", 1400, { at, q: 2, wet: 0.2 }); this.tone(190, 0.09, 0.2 * v, "triangle", { at, to: 120 }); } break;
      case "rite": this.organ([146.8, 220, 293.7, 440], 1.6, 0.03 * v); break;
      case "bell": this.bell(196, 0.9 * v, 0, pan); break;
      case "bolt": this.noise(0.07, 0.12 * v, "highpass", 2400, { pan }); this.tone(700, 0.08, 0.06 * v, "triangle", { to: 220, pan }); break;
      case "clang": for (const f of [1870, 2930, 4310]) this.tone(f * (0.96 + Math.random() * 0.08), 0.16, 0.035 * v, "sine", { pan, wet: 0.25 }); this.noise(0.03, 0.12 * v, "highpass", 3000, { pan }); break;
      case "flame": this.noise(0.32, 0.14 * v, "bandpass", 500, { pan, q: 0.6, to: 1600 }); break;
      case "heal": this.tone(880, 0.4, 0.035 * v, "sine", { pan, wet: 0.6, attack: 0.05 }); this.tone(1318.5, 0.5, 0.03 * v, "sine", { pan, wet: 0.6, at: 0.08, attack: 0.05 }); break;
      case "thud": this.tone(120, 0.3, 0.25 * v, "triangle", { to: 55, pan }); this.noise(0.25, 0.08 * v, "bandpass", 320, { pan, q: 3, to: 900 }); break;
      case "boom": this.tone(85, 0.6, 0.5 * v, "sine", { to: 32, pan, wet: 0.3 }); this.noise(0.45, 0.3 * v, "lowpass", 900, { pan, to: 120, wet: 0.3 }); break;
      case "smite": this.tone(1400, 0.2, 0.06 * v, "sawtooth", { to: 350, pan, wet: 0.6, lp: 3000 }); break;
      case "gun": this.noise(0.09, 0.3 * v, "lowpass", 2600, { pan, to: 400, wet: 0.35 }); this.tone(160, 0.1, 0.16 * v, "square", { to: 60, pan, lp: 900 }); break;
      case "curse": this.tone(420, 0.3, 0.05 * v, "sawtooth", { to: 170, pan, wet: 0.5, lp: 1400, attack: 0.03 }); break;
      case "zap": this.noise(0.12, 0.14 * v, "highpass", 3200, { pan, wet: 0.4 }); this.tone(2200, 0.14, 0.05 * v, "square", { to: 500, pan, wet: 0.4, lp: 5000 }); break;
      case "frost": this.noise(0.4, 0.09 * v, "bandpass", 5200, { pan, q: 4, to: 1800, wet: 0.5 }); this.tone(1760, 0.3, 0.03 * v, "sine", { pan, wet: 0.6 }); break;
      case "raise": this.tone(98, 0.7, 0.09 * v, "sawtooth", { to: 196, pan, wet: 0.7, lp: 600, attack: 0.2 }); break;
      case "study": this.organ([220, 277.2, 329.6], 1.0, 0.03 * v); this.tone(1318.5, 0.5, 0.04 * v, "sine", { at: 0.1, wet: 0.5 }); break;
      case "thunder": this.noise(0.06, 0.5 * v, "highpass", 2800, { wet: 0.5 }); this.noise(2.4, 0.5 * v, "lowpass", 700, { to: 60, wet: 0.8, at: 0.05 }); this.tone(70, 1.8, 0.4 * v, "sine", { to: 28, wet: 0.6, at: 0.05 }); break;
      case "fog": // a long breath out of the crypt: hissing vapour over a sinking drone and a tolling bell
        this.noise(5.5, 0.34 * v, "bandpass", 900, { to: 260, wet: 0.85 }); this.noise(4, 0.16 * v, "highpass", 5200, { wet: 0.6, at: 0.4 });
        this.tone(110, 5, 0.22 * v, "sawtooth", { to: 49, wet: 0.8, lp: 320, attack: 0.8 }); this.tone(116.5, 5, 0.16 * v, "sawtooth", { to: 52, wet: 0.8, lp: 320, attack: 0.8 });
        this.bell(77.8, 0.8 * v, 0.2); this.bell(73.4, 0.6 * v, 2.2); break;
      case "screech": // two carrion cries, one answering the other
        for (const [at, f] of [[0, 1480], [0.34, 1240]] as const) { this.tone(f, 0.5, 0.1 * v, "sawtooth", { to: f * 0.55, at, pan, wet: 0.7, lp: 2600 }); this.noise(0.4, 0.12 * v, "bandpass", f * 1.6, { at, pan, wet: 0.6, q: 6, to: f }); }
        break;
      case "squeak": for (const at of [0, 0.06]) this.tone(3400 + Math.random() * 600, 0.05, 0.025 * v, "sine", { to: 2600, at, pan, wet: 0.3 }); break; // a bat's chirp
      case "rebirth": this.noise(1.2, 0.3 * v, "bandpass", 700, { to: 2400, pan, wet: 0.8, q: 1.5 }); this.bell(587.3, 0.5 * v, 0.15, pan); this.bell(880, 0.35 * v, 0.4, pan); break; // a roar of fire, then a bright bell
      case "whistle": this.tone(1900, 0.7, 0.05 * v, "sine", { to: 420, pan, wet: 0.4 }); break;
      case "burst": this.noise(0.9, 0.5 * v, "lowpass", 900, { to: 70, pan, wet: 0.7 }); this.tone(92, 0.7, 0.32 * v, "sine", { to: 34, pan, wet: 0.5 }); this.noise(0.25, 0.14 * v, "highpass", 3600, { pan, at: 0.05, wet: 0.5 }); this.bell(233, 0.25 * v, 0.02, pan); break;
      case "death": this.noise(0.14, 0.14 * v, "lowpass", 600, { pan }); this.tone(170, 0.16, 0.08 * v, "triangle", { to: 70, pan }); break;
      case "capture": this.bell(392, 0.7 * v, 0, pan); this.organ([196, 293.7, 392], 1.4, 0.025 * v, 0.05); break;
      case "lost": this.bell(155.6, 0.6 * v, 0, pan); break;
      case "victory": this.organ([146.8, 220, 293.7], 1.6, 0.04); this.organ([174.6, 261.6, 349.2], 1.6, 0.04, 1.3); this.organ([146.8, 185, 220, 293.7, 440], 4, 0.045, 2.6); this.bell(293.7, 0.8, 2.6); break;
      case "defeat": this.organ([146.8, 174.6, 220], 2, 0.04); this.organ([116.5, 146.8, 174.6], 2, 0.04, 1.6); this.organ([73.4, 110, 146.8, 174.6], 4.5, 0.05, 3.2); this.bell(98, 1, 3.2); break;
    }
  }

  /** Battle sounds, quieter and panned by distance from the camera. */
  events(events: SimEvent[], camX: number, myTeam: TeamId): void {
    if (!this.ctx || this.muted) return;
    const at = (x: number): [number, number] => { const d = x / 1000 - camX; return [Math.max(0.06, 1 - Math.abs(d) / 75), d / 45]; };
    for (const e of events) {
      if (e.t === "shot") {
        const [v, p] = at(e.x1);
        const kind = shotKind(e.unit);
        if (e.unit === "bats") this.play("squeak", v, p);
        else if (kind === "bolt") this.play("bolt", v, p);
        else if (kind === "flame") this.play("flame", v, p);
        else if (kind === "stone") { this.play("thud", v, p); const [v2, p2] = at(e.x2); setTimeout(() => this.play("boom", v2, p2), 700); }
        else if (kind === "stake") { this.play("thud", v, p); this.play("bolt", v, p); }
        else if (kind === "gun") this.play("gun", v, p);
        else if (kind === "lightning") this.play("zap", v, p);
        else if (kind === "orb") this.play(e.unit === "lich" ? "frost" : "curse", v, p);
        else if (kind === "beam") this.play("smite", v * (UNITS[e.unit]?.structure ? 0.6 : 1), p);
        else if (e.unit === "colossus" || e.unit === "penitent" || e.unit === "ogre") this.play("thud", v, p);
        else if (e.unit === "titan") { this.play("thud", v, p); this.play("bell", v * 0.5, p); }
        else this.play("clang", v, p);
      } else if (e.t === "raise") this.play("raise", ...at(e.x));
      else if (e.t === "reborn") this.play("rebirth", ...at(e.x));
      else if (e.t === "martyr") this.play("heal", ...at(e.x));
      else if (e.t === "built") this.play("build", ...at(e.x));
      else if (e.t === "heal") this.play("heal", ...at(e.x1));
      else if (e.t === "death") this.play(UNITS[e.unit]?.structure ? "boom" : "death", ...at(e.x));
      else if (e.t === "capture") { const i = e.beacon - 1; this.play(e.team === myTeam ? "capture" : "lost", 1, ((MAP.beaconX[i] ?? 0) / 1000 - camX) / 60); }
      else if (e.t === "wave") this.play("bell");
      else if (e.t === "storm") this.play("thunder", 1);
      else if (e.t === "fog") this.play("fog", 1);
      else if (e.t === "razed") this.play("boom", ...at(e.x));
      else if (e.t === "vultures") this.play("screech", 1);
      else if (e.t === "urn") this.play("whistle", ...at(e.x1));
      else if (e.t === "burst") this.play("burst", ...at(e.x));
      else if (e.t === "bolt" && e.struck > 0) this.play("thunder", 0.45 + Math.random() * 0.2);
    }
  }

  /** Wind, a low drone and a slow organ progression. */
  private ambience(): void {
    const ctx = this.ctx!;
    const wind = ctx.createBufferSource(), wf = ctx.createBiquadFilter(), wg = ctx.createGain(), lfo = ctx.createOscillator(), lg = ctx.createGain();
    wind.buffer = this.noiseBuf; wind.loop = true; wf.type = "bandpass"; wf.frequency.value = 380; wf.Q.value = 0.6; wg.gain.value = 0.05;
    lfo.frequency.value = 0.09; lg.gain.value = 220; lfo.connect(lg).connect(wf.frequency);
    wind.connect(wf).connect(wg).connect(this.out); wind.start(); lfo.start();
    const df = ctx.createBiquadFilter(), dg = ctx.createGain(); df.type = "lowpass"; df.frequency.value = 200; dg.gain.value = 0.05;
    for (const f of [55, 55.35, 82.4]) { const o = ctx.createOscillator(); o.type = "sawtooth"; o.frequency.value = f; o.connect(df); o.start(); }
    df.connect(dg).connect(this.out); dg.connect(this.wet);
    const chords = [[146.8, 174.6, 220], [116.5, 146.8, 174.6], [98, 116.5, 146.8], [110, 138.6, 164.8]];
    const next = () => { if (!this.muted && ctx.state === "running") this.organ(chords[this.chord++ % chords.length]!, 9, 0.011); };
    next(); setInterval(next, 8000);
  }
}
