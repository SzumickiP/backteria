import type { BiomeId } from '../world/biomes';

/**
 * Dźwięk i muzyka generowane na żywo (Web Audio API) — bez plików audio, bez licencji.
 *
 * Muzyka: ambientowe pady + bas + „bąbelkowe” arpeggia z echem + bicie serca, którego tempo
 * rośnie z intensywnością rozgrywki. Każdy biom ma własną tonację, barwę i dodatki
 * (oddech w płucach, bulgotanie w jelicie, szum przepływu w naczyniu).
 */

export type SfxName =
  | 'eat'
  | 'shoot'
  | 'dash'
  | 'hurt'
  | 'pop'
  | 'popBig'
  | 'infect'
  | 'levelup'
  | 'select'
  | 'build'
  | 'click'
  | 'divide'
  | 'structure'
  | 'protein'
  | 'alarm'
  | 'success'
  | 'fail'
  | 'death'
  | 'swell'
  | 'order'
  | 'error';

export type MusicTheme = 'menu' | BiomeId;
export type SoundMode = 'all' | 'sfx' | 'off';

export const SOUND_MODE_NAMES: Record<SoundMode, string> = {
  all: 'muzyka i efekty',
  sfx: 'tylko efekty',
  off: 'wyciszony',
};

interface Theme {
  /** nuta podstawowa (MIDI) */
  root: number;
  /** skala do arpeggiów (półtony od podstawy) */
  scale: number[];
  /** akordy padów (półtony od podstawy) */
  chords: number[][];
  /** tempo bicia serca (0 = brak) */
  bpm: number;
  pad: OscillatorType;
  /** odcięcie filtra padów (Hz) */
  filter: number;
  extra?: 'breath' | 'gurgle' | 'flow';
}

const MINOR_CHORDS = [
  [0, 3, 7, 12],
  [-4, 0, 3, 8],
  [3, 7, 10, 15],
  [-2, 2, 5, 10],
];

const THEMES: Record<MusicTheme, Theme> = {
  menu: { root: 45, scale: [0, 3, 5, 7, 10], chords: MINOR_CHORDS, bpm: 0, pad: 'sine', filter: 1100 },
  tissue: { root: 45, scale: [0, 3, 5, 7, 10], chords: MINOR_CHORDS, bpm: 62, pad: 'triangle', filter: 900 },
  vessel: { root: 50, scale: [0, 3, 5, 7, 10], chords: MINOR_CHORDS, bpm: 76, pad: 'sawtooth', filter: 650, extra: 'flow' },
  lung: {
    root: 52, scale: [0, 2, 4, 7, 9], bpm: 56, pad: 'sine', filter: 1700, extra: 'breath',
    chords: [[0, 4, 7, 11], [2, 6, 9, 14], [-3, 0, 4, 7], [-5, -1, 2, 7]],
  },
  gut: {
    root: 40, scale: [0, 1, 5, 7, 8], bpm: 68, pad: 'square', filter: 480, extra: 'gurgle',
    chords: [[0, 3, 7, 12], [1, 5, 8, 13], [-2, 1, 5, 10], [0, 3, 7, 12]],
  },
};

/** Minimalny odstęp (s) między odtworzeniami tego samego efektu — żeby nie było „karabinu”. */
const THROTTLE: Partial<Record<SfxName, number>> = {
  eat: 0.06,
  hurt: 0.28,
  pop: 0.05,
  protein: 0.15,
  shoot: 0.05,
  infect: 0.1,
};

const BAR = 4.8; // długość taktu muzyki (s)
const MODE_KEY = 'backteria.sound';
const midi = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

class AudioEngine {
  private ctx?: AudioContext;
  private master!: GainNode;
  private musicBus!: GainNode;
  private sfxBus!: GainNode;
  private padFilter!: BiquadFilterNode;
  private delaySend!: GainNode;
  private noiseBuf!: AudioBuffer;

  private theme: MusicTheme = 'menu';
  private playing = false;
  private intensity = 0;
  private nextBar = 0;
  private bar = 0;
  private nextBeat = 0;
  private last = new Map<SfxName, number>();
  mode: SoundMode = 'all';

  constructor() {
    try {
      const m = localStorage.getItem(MODE_KEY) as SoundMode | null;
      if (m === 'all' || m === 'sfx' || m === 'off') this.mode = m;
    } catch {
      /* brak pamięci — domyślnie wszystko */
    }
  }

  /** Przeglądarki pozwalają włączyć dźwięk dopiero po geście użytkownika — wołane przy kliknięciu / klawiszu. */
  unlock(): void {
    if (!this.ctx) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      this.ctx = new Ctor();
      this.build();
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  private build(): void {
    const c = this.ctx!;
    const comp = c.createDynamicsCompressor();
    comp.threshold.value = -16;
    comp.ratio.value = 4;
    comp.connect(c.destination);

    this.master = c.createGain();
    this.master.gain.value = 0.8;
    this.master.connect(comp);

    this.musicBus = c.createGain();
    this.musicBus.connect(this.master);
    this.sfxBus = c.createGain();
    this.sfxBus.connect(this.master);
    this.applyMode();

    this.padFilter = c.createBiquadFilter();
    this.padFilter.type = 'lowpass';
    this.padFilter.frequency.value = 900;
    this.padFilter.Q.value = 0.7;
    this.padFilter.connect(this.musicBus);

    // Echo dla arpeggiów („podwodna” przestrzeń).
    const delay = c.createDelay(1);
    delay.delayTime.value = 0.38;
    const fb = c.createGain();
    fb.gain.value = 0.38;
    const damp = c.createBiquadFilter();
    damp.type = 'lowpass';
    damp.frequency.value = 1800;
    delay.connect(damp);
    damp.connect(fb);
    fb.connect(delay);
    delay.connect(this.musicBus);
    this.delaySend = c.createGain();
    this.delaySend.gain.value = 0.5;
    this.delaySend.connect(delay);

    this.noiseBuf = c.createBuffer(1, c.sampleRate * 2, c.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;

    window.setInterval(() => this.schedule(), 100);
  }

  // ───────────────────────── ustawienia ─────────────────────────

  /** Przełącza: muzyka i efekty → tylko efekty → wyciszony. */
  cycleMode(): SoundMode {
    this.mode = this.mode === 'all' ? 'sfx' : this.mode === 'sfx' ? 'off' : 'all';
    try {
      localStorage.setItem(MODE_KEY, this.mode);
    } catch {
      /* nic */
    }
    this.applyMode();
    return this.mode;
  }

  private applyMode(): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.musicBus.gain.setTargetAtTime(this.mode === 'all' ? 0.55 : 0, t, 0.3);
    this.sfxBus.gain.setTargetAtTime(this.mode === 'off' ? 0 : 0.9, t, 0.05);
  }

  // ───────────────────────── muzyka ─────────────────────────

  playMusic(theme: MusicTheme): void {
    this.theme = theme;
    if (!this.playing) {
      this.playing = true;
      if (this.ctx) {
        this.nextBar = this.ctx.currentTime + 0.1;
        this.nextBeat = this.ctx.currentTime + 0.5;
      }
    }
  }

  setTheme(theme: MusicTheme): void {
    this.theme = theme; // zmiana od następnego taktu (pady nachodzą na siebie — płynne przejście)
  }

  stopMusic(): void {
    this.playing = false;
  }

  /** 0 = spokojnie, 1 = bardzo groźnie (szybsze serce, jaśniejsze pady, gęstsze arpeggia). */
  setIntensity(v: number): void {
    this.intensity = Math.min(1, Math.max(0, v));
  }

  private schedule(): void {
    const c = this.ctx;
    if (!c || !this.playing || c.state !== 'running') return;
    const now = c.currentTime;
    if (this.nextBar < now) this.nextBar = now + 0.05;
    if (this.nextBeat < now) this.nextBeat = now + 0.05;
    const th = THEMES[this.theme];

    this.padFilter.frequency.setTargetAtTime(th.filter + this.intensity * 900, now, 1.5);

    while (this.nextBar < now + 0.6) {
      this.scheduleBar(this.nextBar, th);
      this.nextBar += BAR;
      this.bar++;
    }

    if (th.bpm > 0) {
      const interval = 60 / (th.bpm * (1 + this.intensity * 0.7));
      while (this.nextBeat < now + 0.6) {
        this.heartbeat(this.nextBeat);
        this.nextBeat += interval;
      }
    }
  }

  private scheduleBar(t: number, th: Theme): void {
    const chord = th.chords[this.bar % th.chords.length];
    // Pady.
    for (const n of chord) this.padVoice(t, midi(th.root + 12 + n), th.pad);
    // Bas.
    this.padVoice(t, midi(th.root - 12 + chord[0]), 'sine', 0.13);
    // „Bąbelki” — arpeggia z echem; gęstsze przy większej intensywności.
    const count = 2 + Math.round(this.intensity * 6);
    for (let i = 0; i < count; i++) {
      const deg = th.scale[Math.floor(Math.random() * th.scale.length)];
      const oct = Math.random() < 0.5 ? 24 : 36;
      this.pluck(t + Math.random() * BAR, midi(th.root + oct + deg));
    }
    // Dodatki biomu.
    if (th.extra === 'breath') this.breath(t);
    if (th.extra === 'flow') this.flow(t);
    if (th.extra === 'gurgle') for (let i = 0; i < 1 + Math.floor(Math.random() * 3); i++) this.gurgle(t + Math.random() * BAR);
  }

  private padVoice(t: number, freq: number, type: OscillatorType, vol = 0.05): void {
    const c = this.ctx!;
    const g = c.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + 1.4);
    g.gain.setValueAtTime(vol, t + BAR - 0.4);
    g.gain.linearRampToValueAtTime(0, t + BAR + 1.6);
    g.connect(this.padFilter);
    for (const det of [-6, 6]) {
      const o = c.createOscillator();
      o.type = type;
      o.frequency.value = freq;
      o.detune.value = det;
      o.connect(g);
      o.start(t);
      o.stop(t + BAR + 1.7);
    }
  }

  private pluck(t: number, freq: number): void {
    const c = this.ctx!;
    const o = c.createOscillator();
    o.type = 'sine';
    o.frequency.value = freq;
    const g = c.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.045, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.9);
    o.connect(g);
    g.connect(this.musicBus);
    g.connect(this.delaySend);
    o.start(t);
    o.stop(t + 1);
  }

  /** Bicie serca: „lub-dub”. */
  private heartbeat(t: number): void {
    const c = this.ctx!;
    const vol = 0.22 + this.intensity * 0.18;
    for (const [dt, f, v] of [[0, 62, 1], [0.24, 52, 0.7]] as const) {
      const o = c.createOscillator();
      o.type = 'sine';
      o.frequency.setValueAtTime(f * 1.8, t + dt);
      o.frequency.exponentialRampToValueAtTime(f * 0.6, t + dt + 0.18);
      const g = c.createGain();
      g.gain.setValueAtTime(0, t + dt);
      g.gain.linearRampToValueAtTime(vol * v, t + dt + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dt + 0.25);
      o.connect(g);
      g.connect(this.musicBus);
      o.start(t + dt);
      o.stop(t + dt + 0.3);
    }
  }

  private noiseSrc(t: number, dur: number): AudioBufferSourceNode {
    const s = this.ctx!.createBufferSource();
    s.buffer = this.noiseBuf;
    s.loop = true;
    s.start(t, Math.random());
    s.stop(t + dur);
    return s;
  }

  private breath(t: number): void {
    const c = this.ctx!;
    const s = this.noiseSrc(t, BAR);
    const f = c.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.setValueAtTime(500, t);
    f.frequency.linearRampToValueAtTime(1100, t + BAR * 0.45);
    f.frequency.linearRampToValueAtTime(400, t + BAR);
    f.Q.value = 0.8;
    const g = c.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.06, t + BAR * 0.45);
    g.gain.linearRampToValueAtTime(0, t + BAR);
    s.connect(f).connect(g).connect(this.musicBus);
  }

  private flow(t: number): void {
    const c = this.ctx!;
    const s = this.noiseSrc(t, BAR + 0.5);
    const f = c.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 300;
    const g = c.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.09, t + 1);
    g.gain.linearRampToValueAtTime(0, t + BAR + 0.5);
    s.connect(f).connect(g).connect(this.musicBus);
  }

  private gurgle(t: number): void {
    const c = this.ctx!;
    const s = this.noiseSrc(t, 0.5);
    const f = c.createBiquadFilter();
    f.type = 'bandpass';
    f.Q.value = 8;
    f.frequency.setValueAtTime(180 + Math.random() * 120, t);
    f.frequency.exponentialRampToValueAtTime(500 + Math.random() * 300, t + 0.25);
    const g = c.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.25, t + 0.04);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.45);
    s.connect(f).connect(g).connect(this.musicBus);
  }

  // ───────────────────────── efekty ─────────────────────────

  sfx(name: SfxName): void {
    const c = this.ctx;
    if (!c || c.state !== 'running' || this.mode === 'off') return;
    const now = c.currentTime;
    const min = THROTTLE[name] ?? 0.02;
    if (now - (this.last.get(name) ?? -1) < min) return;
    this.last.set(name, now);
    const t = now + 0.005;

    switch (name) {
      case 'eat':
        this.tone(t, 'sine', 520 + Math.random() * 120, 900, 0.07, 0.08);
        break;
      case 'shoot':
        this.noise(t, 0.12, 'bandpass', 1400, 500, 0.18, 2);
        this.tone(t, 'triangle', 320, 120, 0.12, 0.12);
        break;
      case 'dash':
        this.noise(t, 0.3, 'highpass', 300, 3500, 0.22, 0.7);
        this.tone(t, 'sawtooth', 120, 60, 0.25, 0.06);
        break;
      case 'hurt':
        this.tone(t, 'square', 140, 55, 0.14, 0.12);
        this.noise(t, 0.08, 'lowpass', 900, 200, 0.12);
        break;
      case 'pop':
        this.tone(t, 'sine', 380 + Math.random() * 120, 70, 0.12, 0.14);
        this.noise(t, 0.05, 'bandpass', 2000, 800, 0.06, 3);
        break;
      case 'popBig':
        this.tone(t, 'sine', 220, 40, 0.3, 0.22);
        this.noise(t, 0.2, 'lowpass', 1200, 150, 0.16);
        break;
      case 'infect':
        [0, 0.05, 0.1].forEach((d, i) => this.tone(t + d, 'sine', 300 + i * 160, 500 + i * 200, 0.07, 0.08));
        break;
      case 'levelup':
        [0, 4, 7, 12].forEach((n, i) => this.tone(t + i * 0.07, 'triangle', midi(72 + n), undefined, 0.35, 0.09));
        break;
      case 'select':
        [0, 7, 16].forEach((n) => this.tone(t, 'triangle', midi(67 + n), undefined, 0.5, 0.06));
        break;
      case 'build':
        this.tone(t, 'sine', 200, 420, 0.18, 0.12);
        this.tone(t + 0.08, 'triangle', midi(79), undefined, 0.25, 0.06);
        break;
      case 'click':
        this.tone(t, 'square', 900, 600, 0.03, 0.04);
        break;
      case 'divide':
        this.noise(t, 0.18, 'lowpass', 600, 2000, 0.14);
        this.tone(t, 'sine', 180, 520, 0.2, 0.12);
        break;
      case 'structure':
        this.tone(t, 'sine', 90, 180, 0.6, 0.22);
        [0, 7, 12].forEach((n, i) => this.tone(t + 0.1 + i * 0.08, 'triangle', midi(60 + n), undefined, 0.4, 0.06));
        break;
      case 'protein':
        this.noise(t, 0.08, 'bandpass', 900, 1600, 0.06, 4);
        break;
      case 'alarm':
        [0, 0.25, 0.5].forEach((d) => {
          this.tone(t + d, 'triangle', 660, undefined, 0.12, 0.1);
          this.tone(t + d + 0.12, 'triangle', 520, undefined, 0.12, 0.1);
        });
        break;
      case 'success':
        [0, 4, 7, 12, 16].forEach((n, i) => this.tone(t + i * 0.09, 'triangle', midi(67 + n), undefined, 0.4, 0.1));
        break;
      case 'fail':
        [0, -3, -7, -12].forEach((n, i) => this.tone(t + i * 0.14, 'triangle', midi(64 + n), undefined, 0.4, 0.1));
        break;
      case 'death':
        this.tone(t, 'sawtooth', 220, 30, 1.6, 0.16);
        this.noise(t, 1.2, 'lowpass', 1500, 80, 0.15);
        break;
      case 'swell':
        this.noise(t, 1.4, 'bandpass', 300, 1200, 0.08, 1);
        this.tone(t, 'sine', midi(57), midi(64), 1.4, 0.05);
        break;
      case 'order':
        this.tone(t, 'triangle', midi(76), midi(79), 0.12, 0.07);
        break;
      case 'error':
        this.tone(t, 'square', 180, 150, 0.15, 0.06);
        break;
    }
  }

  private tone(t: number, type: OscillatorType, f0: number, f1: number | undefined, dur: number, vol: number): void {
    const c = this.ctx!;
    const o = c.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1 !== undefined) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    g.connect(this.sfxBus);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  private noise(t: number, dur: number, type: BiquadFilterType, f0: number, f1: number, vol: number, q = 1): void {
    const c = this.ctx!;
    const s = this.noiseSrc(t, dur + 0.02);
    const f = c.createBiquadFilter();
    f.type = type;
    f.Q.value = q;
    f.frequency.setValueAtTime(f0, t);
    f.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f).connect(g).connect(this.sfxBus);
  }
}

/** Jeden wspólny silnik dźwięku dla całej gry. */
export const audio = new AudioEngine();
