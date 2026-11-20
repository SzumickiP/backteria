import Phaser from 'phaser';
import { BIOMES, type RGB } from './biomes';
import { biomeAt, opennessIn, perlin } from './walls';

/**
 * Rozmiar kafla ścian w świecie (px) i rozdzielczość jego tekstury.
 * RES celowo NIE jest potęgą dwójki: takie tekstury WebGL próbkuje z zawijaniem (REPEAT),
 * co dawało cienkie linie na łączeniach kafli (mieszanie z przeciwległą krawędzią).
 */
const CHUNK = 768;
const RES = 120;
const STEP = CHUNK / RES;

const smooth = (a: number, b: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

const mixRgb = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

/** Kafel w trakcie generowania (liczony po kilka wierszy na klatkę). */
interface Job {
  i: number;
  j: number;
  key: string;
  img: ImageData;
  row: number;
  /** wartości openness z poprzedniego wiersza (indeks px+1; px = -1 to kolumna z lewej) */
  prev: Float32Array;
  cur: Float32Array;
}

/**
 * Rysuje ściany tkanki i zabarwienie biomów kaflami wokół gracza. Generowanie jest
 * rozłożone w czasie (budżet ms na klatkę), więc eksploracja nie powoduje zacięć.
 */
export class WallLayer {
  private readonly chunks = new Map<string, Phaser.GameObjects.Image>();
  private job?: Job;

  constructor(private readonly scene: Phaser.Scene) {}

  /** @param budgetMs ile milisekund na klatkę wolno poświęcić na generowanie (Infinity = wszystko od razu) */
  update(cx: number, cy: number, halfW: number, halfH: number, budgetMs = 4): void {
    const x0 = Math.floor((cx - halfW) / CHUNK) - 1;
    const x1 = Math.floor((cx + halfW) / CHUNK) + 1;
    const y0 = Math.floor((cy - halfH) / CHUNK) - 1;
    const y1 = Math.floor((cy + halfH) / CHUNK) + 1;
    const start = performance.now();

    while (performance.now() - start < budgetMs) {
      if (!this.job) {
        const next = this.nextMissing(cx, cy, x0, x1, y0, y1);
        if (!next) break;
        this.job = this.startJob(next[0], next[1]);
        if (!this.job) break;
      }
      if (this.step(this.job)) this.job = undefined;
    }

    for (const [key, img] of this.chunks) {
      const i = Math.floor(img.x / CHUNK);
      const j = Math.floor(img.y / CHUNK);
      if (i < x0 - 2 || i > x1 + 2 || j < y0 - 2 || j > y1 + 2) {
        img.destroy();
        this.scene.textures.remove(key);
        this.chunks.delete(key);
      }
    }
  }

  destroy(): void {
    for (const [key, img] of this.chunks) {
      img.destroy();
      if (this.scene.textures.exists(key)) this.scene.textures.remove(key);
    }
    this.chunks.clear();
    this.job = undefined;
  }

  /** Generuje kafel od razu (używane w testach/pomiarach). */
  create(i: number, j: number): void {
    const job = this.startJob(i, j);
    if (job) while (!this.step(job));
  }

  private key(i: number, j: number): string {
    return `walls_${i}_${j}`;
  }

  /** Najbliższy środka brakujący kafel. */
  private nextMissing(cx: number, cy: number, x0: number, x1: number, y0: number, y1: number): [number, number] | undefined {
    let best: [number, number] | undefined;
    let bestD = Infinity;
    for (let j = y0; j <= y1; j++) {
      for (let i = x0; i <= x1; i++) {
        if (this.chunks.has(this.key(i, j))) continue;
        const dx = (i + 0.5) * CHUNK - cx;
        const dy = (j + 0.5) * CHUNK - cy;
        const d = dx * dx + dy * dy;
        if (d < bestD) {
          bestD = d;
          best = [i, j];
        }
      }
    }
    return best;
  }

  private startJob(i: number, j: number): Job | undefined {
    const key = this.key(i, j);
    if (this.scene.textures.exists(key)) {
      this.addImage(i, j, key);
      return undefined;
    }
    const job: Job = {
      i,
      j,
      key,
      img: new ImageData(RES, RES),
      row: 0,
      prev: new Float32Array(RES + 1),
      cur: new Float32Array(RES + 1),
    };
    // Wiersz -1 (potrzebny do oświetlenia pierwszego wiersza).
    this.sampleRow(job, -1, job.prev);
    return job;
  }

  private sampleRow(job: Job, py: number, out: Float32Array): void {
    const wy = job.j * CHUNK + (py + 0.5) * STEP;
    for (let px = -1; px < RES; px++) {
      const wx = job.i * CHUNK + (px + 0.5) * STEP;
      out[px + 1] = opennessIn(wx, wy, biomeAt(wx, wy));
    }
  }

  /** Liczy jeden wiersz; zwraca true, gdy kafel jest gotowy. */
  private step(job: Job): boolean {
    const py = job.row;
    this.sampleRow(job, py, job.cur);
    this.paintRow(job, py);
    [job.prev, job.cur] = [job.cur, job.prev];
    job.row++;
    if (job.row < RES) return false;

    const tex = this.scene.textures.createCanvas(job.key, RES, RES);
    if (tex) {
      tex.getContext().putImageData(job.img, 0, 0);
      tex.refresh();
      this.addImage(job.i, job.j, job.key);
    }
    return true;
  }

  private addImage(i: number, j: number, key: string): void {
    const image = this.scene.add.image(i * CHUNK, j * CHUNK, key).setOrigin(0).setScale(STEP).setDepth(1.5);
    this.chunks.set(key, image);
  }

  /** Mięsista ściana: jasna błona na krawędzi, ciemniejsze, włókniste wnętrze, cień na podłożu, kolory biomu. */
  private paintRow(job: Job, py: number): void {
    const d = job.img.data;
    const { i, j } = job;
    const wy = j * CHUNK + (py + 0.5) * STEP;
    for (let px = 0; px < RES; px++) {
      const wx = i * CHUNK + (px + 0.5) * STEP;
      const o = job.cur[px + 1];
      const p = (py * RES + px) * 4;

      // Kolory biomu (płynnie mieszane na granicach).
      const bs = biomeAt(wx, wy);
      const A = BIOMES[bs.a];
      const B = BIOMES[bs.b];
      const floor = mixRgb(A.floor, B.floor, bs.t);
      const floorA = A.floorAlpha + (B.floorAlpha - A.floorAlpha) * bs.t;

      if (o > 0.03) {
        // Wolna przestrzeń: tylko delikatne zabarwienie podłoża biomu.
        d[p] = floor[0];
        d[p + 1] = floor[1];
        d[p + 2] = floor[2];
        d[p + 3] = floorA * 255;
        continue;
      }

      // Cień rzucany przez ścianę na podłoże.
      const shadowA = o > 0 ? (1 - o / 0.03) ** 2 * 0.55 : 0.55;
      if (o >= 0) {
        const sa = shadowA + floorA * (1 - shadowA);
        d[p] = (22 * shadowA + floor[0] * floorA * (1 - shadowA)) / sa;
        d[p + 1] = (2 * shadowA + floor[1] * floorA * (1 - shadowA)) / sa;
        d[p + 2] = (10 * shadowA + floor[2] * floorA * (1 - shadowA)) / sa;
        d[p + 3] = sa * 255;
        continue;
      }

      // Ściana.
      const deep = mixRgb(A.wallDeep, B.wallDeep, bs.t);
      const mid = mixRgb(A.wallMid, B.wallMid, bs.t);
      const rimC = mixRgb(A.rim, B.rim, bs.t);
      const depth = Math.min(1, -o / 0.12);
      const rim = 1 - smooth(0, 0.018, -o);
      // Światło z lewego górnego rogu: porównanie z sąsiadem (wiersz wyżej, kolumna w lewo).
      const lit = Math.max(-1, Math.min(1, (job.prev[px] - o) * 60));
      const fiber = 0.92 + 0.08 * perlin(wx * 0.016, wy * 0.006, 91) + 0.08 * perlin(wx * 0.03, wy * 0.03, 92);
      const grain = ((Math.imul(px * 73856093 ^ py * 19349663 ^ (i * 83492791 + j), 2654435761) >>> 24) / 255 - 0.5) * 10;

      let r = (mid[0] + (deep[0] - mid[0]) * depth) * fiber;
      let g = (mid[1] + (deep[1] - mid[1]) * depth) * fiber;
      let b = (mid[2] + (deep[2] - mid[2]) * depth) * fiber;
      const rimK = rim * (0.65 + 0.35 * lit);
      r += (rimC[0] - r) * rimK;
      g += (rimC[1] - g) * rimK;
      b += (rimC[2] - b) * rimK;

      // Wygładzona krawędź: mieszanie ze cieniem (szerokość dobrana pod cienkie ścianki płuc).
      const a = Math.min(1, -o / 0.012);
      d[p] = r * a + 22 * (1 - a) + grain;
      d[p + 1] = g * a + 2 * (1 - a) + grain * 0.5;
      d[p + 2] = b * a + 10 * (1 - a) + grain * 0.5;
      d[p + 3] = (a + shadowA * (1 - a)) * 255;
    }
  }
}
