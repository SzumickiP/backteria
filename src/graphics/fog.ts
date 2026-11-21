import Phaser from 'phaser';
import { BIOMES, type BiomeId, type RGB } from '../world/biomes';
import { biomeAt } from '../world/walls';

/**
 * Lekka mgła płynów ustrojowych: dwie dryfujące warstwy bezszwowego szumu (zabarwione wg biomu),
 * drobiny zawieszone w płynie (paralaksa) i winieta jak w okularze mikroskopu.
 * Wszystko w przestrzeni ekranu (scrollFactor 0), przesuwane razem z kamerą.
 */

const FOG_TEX = 'fog-noise';
const MOTE_TEX = 'fog-motes';
const VIGNETTE_TEX = 'fog-vignette';

/** Gęstość mgły w biomach (0–1, mnożnik przezroczystości). */
const DENSITY: Record<BiomeId, number> = {
  tissue: 0.8,
  vessel: 0.7,
  lung: 1.25,
  gut: 1.1,
  brain: 0.95,
  infected: 1.0,
};

/** Kolor mgły: rozjaśniona błona biomu przemieszana z jego podłożem. */
function fogColor(id: BiomeId): RGB {
  const b = BIOMES[id];
  return [
    b.rim[0] * 0.7 + b.wallMid[0] * 0.3,
    b.rim[1] * 0.7 + b.wallMid[1] * 0.3,
    b.rim[2] * 0.7 + b.wallMid[2] * 0.3,
  ];
}

function hash(ix: number, iy: number, seed: number): number {
  let h = Math.imul(ix, 374761393) ^ Math.imul(iy, 668265263) ^ Math.imul(seed, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Bezszwowy szum wartości (okres `period` komórek siatki). */
function tileNoise(x: number, y: number, period: number, seed: number): number {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = x - x0;
  const fy = y - y0;
  const u = fx * fx * (3 - 2 * fx);
  const v = fy * fy * (3 - 2 * fy);
  const m = (k: number) => ((k % period) + period) % period;
  const a = hash(m(x0), m(y0), seed);
  const b = hash(m(x0 + 1), m(y0), seed);
  const c = hash(m(x0), m(y0 + 1), seed);
  const d = hash(m(x0 + 1), m(y0 + 1), seed);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

function makeTextures(scene: Phaser.Scene): void {
  if (!scene.textures.exists(FOG_TEX)) {
    const S = 256;
    const tex = scene.textures.createCanvas(FOG_TEX, S, S)!;
    const ctx = tex.getContext();
    const img = ctx.createImageData(S, S);
    for (let y = 0; y < S; y++) {
      for (let x = 0; x < S; x++) {
        let n = 0;
        let amp = 0.5;
        let norm = 0;
        for (let o = 0; o < 4; o++) {
          const period = 4 << o;
          n += tileNoise((x / S) * period, (y / S) * period, period, 7 + o) * amp;
          norm += amp;
          amp *= 0.5;
        }
        n /= norm;
        // Kłęby: miękkie progowanie, żeby były przerwy (lekka, nie jednolita mgła).
        const t = Math.min(1, Math.max(0, (n - 0.38) / 0.4));
        const a = t * t * (3 - 2 * t);
        const p = (y * S + x) * 4;
        img.data[p] = 255;
        img.data[p + 1] = 255;
        img.data[p + 2] = 255;
        img.data[p + 3] = a * 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    tex.refresh();
  }

  if (!scene.textures.exists(MOTE_TEX)) {
    const S = 512;
    const tex = scene.textures.createCanvas(MOTE_TEX, S, S)!;
    const ctx = tex.getContext();
    const rng = new Phaser.Math.RandomDataGenerator(['motes']);
    for (let i = 0; i < 170; i++) {
      const x = rng.frac() * S;
      const y = rng.frac() * S;
      const r = 0.6 + rng.frac() * rng.frac() * 2.6;
      const a = 0.25 + rng.frac() * 0.55;
      // Rysowanie z zawinięciem, żeby kafel był bezszwowy.
      for (const ox of [-S, 0, S]) {
        for (const oy of [-S, 0, S]) {
          const cx = x + ox;
          const cy = y + oy;
          if (cx < -8 || cy < -8 || cx > S + 8 || cy > S + 8) continue;
          const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r * 2.2);
          g.addColorStop(0, `rgba(255,255,255,${a})`);
          g.addColorStop(0.45, `rgba(255,255,255,${a * 0.45})`);
          g.addColorStop(1, 'rgba(255,255,255,0)');
          ctx.fillStyle = g;
          ctx.fillRect(cx - r * 2.2, cy - r * 2.2, r * 4.4, r * 4.4);
        }
      }
    }
    tex.refresh();
  }

  if (!scene.textures.exists(VIGNETTE_TEX)) {
    const S = 512;
    const tex = scene.textures.createCanvas(VIGNETTE_TEX, S, S)!;
    const ctx = tex.getContext();
    const g = ctx.createRadialGradient(S / 2, S / 2, S * 0.28, S / 2, S / 2, S * 0.72);
    g.addColorStop(0, 'rgba(8,0,4,0)');
    g.addColorStop(0.6, 'rgba(8,0,4,0.25)');
    g.addColorStop(1, 'rgba(8,0,4,0.7)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, S, S);
    tex.refresh();
  }
}

export class FogLayer {
  private readonly far: Phaser.GameObjects.TileSprite;
  private readonly near: Phaser.GameObjects.TileSprite;
  private readonly motes: Phaser.GameObjects.TileSprite;
  private readonly vignette: Phaser.GameObjects.Image;
  private color: RGB = [255, 200, 210];
  private density = 1;
  private target: { color: RGB; density: number } = { color: [255, 200, 210], density: 1 };
  private check = 0;
  private time = 0;

  constructor(private readonly scene: Phaser.Scene) {
    makeTextures(scene);
    // Zapas na oddalenie kamery (zoom do ok. 0,7): warstwy w przestrzeni ekranu też są skalowane.
    const w = scene.scale.width / 0.65;
    const h = scene.scale.height / 0.65;
    const cx = scene.scale.width / 2;
    const cy = scene.scale.height / 2;
    const layer = (key: string, depth: number) =>
      scene.add.tileSprite(cx, cy, w, h, key).setOrigin(0.5).setScrollFactor(0).setDepth(depth);
    this.far = layer(FOG_TEX, 1.6).setTileScale(3.2).setAlpha(0.1);
    this.motes = layer(MOTE_TEX, 5.5).setBlendMode(Phaser.BlendModes.ADD).setAlpha(0.22);
    this.near = layer(FOG_TEX, 5.6).setTileScale(4.6).setAlpha(0.07);
    this.vignette = scene.add.image(cx, cy, VIGNETTE_TEX).setScrollFactor(0).setDepth(9).setDisplaySize(w, h);
  }

  update(dt: number, x: number, y: number): void {
    this.time += dt;
    this.check -= dt;
    if (this.check <= 0) {
      this.check = 0.3;
      const id = biomeAt(x, y).a;
      this.target = { color: fogColor(id), density: DENSITY[id] };
    }
    // Płynna zmiana koloru i gęstości przy przejściu między biomami.
    const k = Math.min(1, dt * 1.5);
    for (let i = 0; i < 3; i++) this.color[i] += (this.target.color[i] - this.color[i]) * k;
    this.density += (this.target.density - this.density) * k;
    const tint = Phaser.Display.Color.GetColor(this.color[0], this.color[1], this.color[2]);

    const cam = this.scene.cameras.main;
    const sx = cam.scrollX;
    const sy = cam.scrollY;
    const t = this.time;
    // Dalsza mgła: wolniejsza paralaksa i dryf; bliższa: szybsza (wrażenie głębi w płynie).
    this.far.setTilePosition((sx * 0.9 + t * 6) / 3.2, (sy * 0.9 + t * 3) / 3.2);
    this.near.setTilePosition((sx * 1.15 - t * 9) / 4.6, (sy * 1.15 + t * 5) / 4.6);
    this.motes.setTilePosition(sx * 1.3 + Math.sin(t * 0.4) * 14 + t * 4, sy * 1.3 + Math.cos(t * 0.3) * 10 - t * 2);
    this.far.setTint(tint).setAlpha(0.1 * this.density);
    this.near.setTint(tint).setAlpha((0.065 + 0.015 * Math.sin(t * 0.5)) * this.density);
    this.motes.setTint(tint);
  }

  destroy(): void {
    this.far.destroy();
    this.near.destroy();
    this.motes.destroy();
    this.vignette.destroy();
  }
}
