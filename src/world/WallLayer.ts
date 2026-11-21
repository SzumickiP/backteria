import Phaser from 'phaser';
import { BIOMES, type RGB } from './biomes';
import { biomeAt, opennessIn, perlin } from './walls';

/**
 * Rozmiar kafla ścian w świecie (px) i rozdzielczość jego tekstury.
 * RES celowo NIE jest potęgą dwójki: takie tekstury WebGL próbkuje z zawijaniem (REPEAT),
 * co dawało cienkie linie na łączeniach kafli (mieszanie z przeciwległą krawędzią).
 */
const CHUNK = 768;
const RES = 240;
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
  /** wartości openness z wierszy py-1, py, py+1 (indeks px+1; px = -1 i px = RES to kolumny sąsiednie) */
  prev: Float32Array;
  cur: Float32Array;
  nxt: Float32Array;
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
      prev: new Float32Array(RES + 2),
      cur: new Float32Array(RES + 2),
      nxt: new Float32Array(RES + 2),
    };
    // Wiersze -1 i 0 (potrzebne do oświetlenia pierwszego wiersza).
    this.sampleRow(job, -1, job.prev);
    this.sampleRow(job, 0, job.cur);
    return job;
  }

  private sampleRow(job: Job, py: number, out: Float32Array): void {
    const wy = job.j * CHUNK + (py + 0.5) * STEP;
    for (let px = -1; px <= RES; px++) {
      const wx = job.i * CHUNK + (px + 0.5) * STEP;
      out[px + 1] = opennessIn(wx, wy, biomeAt(wx, wy));
    }
  }

  /** Liczy jeden wiersz; zwraca true, gdy kafel jest gotowy. */
  private step(job: Job): boolean {
    const py = job.row;
    this.sampleRow(job, py + 1, job.nxt);
    this.paintRow(job, py);
    const old = job.prev;
    job.prev = job.cur;
    job.cur = job.nxt;
    job.nxt = old;
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

  /**
   * Realistyczna, gładka ściana tkanki: zaokrąglona (bevel) krawędź liczona z gradientu pola openness,
   * oświetlenie z lewego górnego rogu (dyfuzja + wilgotny połysk), prześwitywanie krwi przy krawędzi,
   * sieć naczyń włosowatych i plamista, komórkowa faktura. Na podłożu miękki cień zależny od odległości.
   */
  private paintRow(job: Job, py: number): void {
    const d = job.img.data;
    const { i, j, prev, cur, nxt } = job;
    const wy = j * CHUNK + (py + 0.5) * STEP;
    // Kierunek światła (z lewej-góry) i wektor połówkowy do odbicia.
    const LX = -0.5, LY = -0.6, LZ = 0.62;
    for (let px = 0; px < RES; px++) {
      const wx = i * CHUNK + (px + 0.5) * STEP;
      const c = px + 1;
      const o = cur[c];
      const p = (py * RES + px) * 4;

      // Kolory biomu (płynnie mieszane na granicach).
      const bs = biomeAt(wx, wy);
      const A = BIOMES[bs.a];
      const B = BIOMES[bs.b];
      const floor = mixRgb(A.floor, B.floor, bs.t);
      const floorA = A.floorAlpha + (B.floorAlpha - A.floorAlpha) * bs.t;

      // Gradient (Sobel, na piksel świata) — wskazuje kierunek ku wolnej przestrzeni; |g| daje odległość od krawędzi.
      const gx = (nxt[c + 1] + 2 * cur[c + 1] + prev[c + 1] - nxt[c - 1] - 2 * cur[c - 1] - prev[c - 1]) / (8 * STEP);
      const gy = (nxt[c - 1] + 2 * nxt[c] + nxt[c + 1] - prev[c - 1] - 2 * prev[c] - prev[c + 1]) / (8 * STEP);
      const gm = Math.max(Math.hypot(gx, gy), 1e-6);
      const dirx = gx / gm;
      const diry = gy / gm;
      const dist = Math.abs(o) / gm; // odległość od krawędzi w px świata

      const deep = mixRgb(A.wallDeep, B.wallDeep, bs.t);
      const rimC = mixRgb(A.rim, B.rim, bs.t);

      if (o > 0) {
        // Wolna przestrzeń: zabarwienie podłoża, miękki cień ściany (w prawo-dół, w kolorze głębi tkanki)
        // i delikatna poświata światła przechodzącego przez cienką krawędź tkanki.
        let shadowA = 0;
        let glowA = 0;
        if (dist < 160) {
          const facing = dirx * 0.64 + diry * 0.77;
          shadowA = Math.exp(-dist / 34) * 0.55 * Math.min(1.2, Math.max(0.3, 0.8 + 0.5 * facing));
          glowA = Math.exp(-dist / 10) * 0.16 * Math.max(0, 0.4 - facing);
        }
        // Płyn: subtelne, wolnozmienne zmętnienie (zamiast jednolitego tła).
        const murk = floorA > 0 ? floorA * (0.75 + 0.5 * (0.5 + 0.5 * perlin(wx * 0.004, wy * 0.004, 95))) : 0;
        const sc0 = deep[0] * 0.18;
        const sc1 = deep[1] * 0.12;
        const sc2 = deep[2] * 0.16;
        // Składanie warstw (podłoże → cień → poświata), operator „over”.
        let a = murk;
        let r = floor[0] * murk;
        let g = floor[1] * murk;
        let b = floor[2] * murk;
        r = sc0 * shadowA + r * (1 - shadowA);
        g = sc1 * shadowA + g * (1 - shadowA);
        b = sc2 * shadowA + b * (1 - shadowA);
        a = shadowA + a * (1 - shadowA);
        r = rimC[0] * glowA + r * (1 - glowA);
        g = rimC[1] * glowA + g * (1 - glowA);
        b = rimC[2] * glowA + b * (1 - glowA);
        a = glowA + a * (1 - glowA);
        if (a < 0.004) {
          d[p + 3] = 0;
          continue;
        }
        d[p] = r / a;
        d[p + 1] = g / a;
        d[p + 2] = b / a;
        d[p + 3] = a * 255;
        continue;
      }

      // Ściana.
      const mid = mixRgb(A.wallMid, B.wallMid, bs.t);
      const depthK = smooth(0, 70, dist);

      // Normalna: zaokrąglona krawędź (bevel) wygasająca w głąb ściany.
      const slope = 1.2 * Math.exp(-dist / 19);
      const inv = 1 / Math.hypot(dirx * slope, diry * slope, 1);
      const nx = dirx * slope * inv;
      const ny = diry * slope * inv;
      const nz = inv;
      const diff = Math.max(0, nx * LX + ny * LY + nz * LZ) / Math.hypot(LX, LY, LZ);
      // Wilgotny połysk (Blinn-Phong, półwektor ~ światło + widz z góry).
      const hx = LX, hy = LY, hz = LZ + 1;
      const hl = Math.hypot(hx, hy, hz);
      const nh = Math.max(0, (nx * hx + ny * hy + nz * hz) / hl);
      const spec = nh ** 22 * 0.4 * (0.4 + 0.6 * (1 - smooth(0, 40, dist)));

      // Faktura: plamista tkanka + włókna + sieć naczyń włosowatych.
      const mottle = 0.5 + 0.5 * perlin(wx * 0.011, wy * 0.011, 91);
      const cells = perlin(wx * 0.05, wy * 0.05, 92);
      // Makrocieniowanie (tkanka nie jest jednolita) i drobne pory/krypty w głębi ściany.
      const macro = 0.86 + 0.26 * (0.5 + 0.5 * perlin(wx * 0.0022, wy * 0.0022, 94));
      const pore = smooth(0.55, 0.8, perlin(wx * 0.085, wy * 0.085, 96)) * depthK * 0.22;
      const fiber = (0.9 + 0.1 * mottle + 0.05 * cells) * macro * (1 - pore);
      const vein = 1 - Math.abs(perlin(wx * 0.014 + 5, wy * 0.014 - 3, 93));
      const capillary = smooth(0.93, 0.99, vein) * (1 - depthK * 0.5);
      const grain = ((Math.imul(px * 73856093 ^ py * 19349663 ^ (i * 83492791 + j), 2654435761) >>> 24) / 255 - 0.5) * 2.5;

      let r = (mid[0] + (deep[0] - mid[0]) * depthK) * fiber;
      let g = (mid[1] + (deep[1] - mid[1]) * depthK) * fiber;
      let b = (mid[2] + (deep[2] - mid[2]) * depthK) * fiber;
      // Naczynia włosowate: ciemniejsza, bardziej czerwona sieć pod powierzchnią.
      r += (r * 0.8 + 20 - r) * capillary * 0.22;
      g += (g * 0.35 - g) * capillary * 0.3;
      b += (b * 0.45 - b) * capillary * 0.3;

      // Oświetlenie.
      const shade = 0.62 + 0.62 * diff;
      r *= shade;
      g *= shade;
      b *= shade;
      // Prześwitywanie (subsurface): ciepły, jasny pas tuż przy krawędzi + cienka błona śluzowa.
      const sss = Math.exp(-dist / 9) * 0.38;
      const membrane = 1 - smooth(0, 3.2, dist);
      const k = Math.min(1, sss * (0.6 + 0.4 * diff) + membrane * 0.35);
      r += (rimC[0] - r) * k;
      g += (rimC[1] - g) * k;
      b += (rimC[2] - b) * k;
      const sp = spec * 255;
      r += sp * 0.9 + grain;
      g += sp * 0.85 + grain * 0.6;
      b += sp * 0.8 + grain * 0.6;

      // Gładka krawędź: antyaliasing po odległości (miękkie mieszanie ze cieniem).
      const a = smooth(0, 4.2, dist);
      const shadowEdge = 0.5;
      d[p] = r * a + 22 * (1 - a);
      d[p + 1] = g * a + 2 * (1 - a);
      d[p + 2] = b * a + 10 * (1 - a);
      d[p + 3] = (a + shadowEdge * (1 - a)) * 255;
    }
  }
}
