import { bodyDist, currentAnimal } from './animal';

/** Bok pola terytorium (px świata). */
export const TERR_CELL = 700;

/**
 * Tryb „Martwy żywiciel”: siatka terytorium na całym ciele.
 * Wartość pola: +1 = Twoja kolonia, −1 = rywale, 0 = niczyje. Pole jest „zajęte”, gdy |v| > 0.5.
 */
export class Territory {
  readonly ox: number;
  readonly oy: number;
  readonly cols: number;
  readonly rows: number;
  readonly v: Float32Array;
  /** czy środek pola leży w ciele */
  readonly body: Uint8Array;
  readonly bodyCount: number;
  mine = 0;
  rival = 0;

  constructor() {
    const b = currentAnimal().bounds;
    this.ox = b.minX;
    this.oy = b.minY;
    this.cols = Math.ceil((b.maxX - b.minX) / TERR_CELL);
    this.rows = Math.ceil((b.maxY - b.minY) / TERR_CELL);
    this.v = new Float32Array(this.cols * this.rows);
    this.body = new Uint8Array(this.cols * this.rows);
    let n = 0;
    for (let j = 0; j < this.rows; j++) {
      for (let i = 0; i < this.cols; i++) {
        if (bodyDist(this.cx(i), this.cy(j)) < -150) {
          this.body[j * this.cols + i] = 1;
          n++;
        }
      }
    }
    this.bodyCount = Math.max(1, n);
  }

  cx(i: number): number {
    return this.ox + (i + 0.5) * TERR_CELL;
  }

  cy(j: number): number {
    return this.oy + (j + 0.5) * TERR_CELL;
  }

  /**
   * Zmienia wartość pól, których środek jest w promieniu r od (x, y).
   * @returns ile pól właśnie przeszło na stronę zmiany (np. stało się Twoje)
   */
  paint(x: number, y: number, r: number, amount: number): number {
    const i0 = Math.max(0, Math.floor((x - r - this.ox) / TERR_CELL));
    const i1 = Math.min(this.cols - 1, Math.floor((x + r - this.ox) / TERR_CELL));
    const j0 = Math.max(0, Math.floor((y - r - this.oy) / TERR_CELL));
    const j1 = Math.min(this.rows - 1, Math.floor((y + r - this.oy) / TERR_CELL));
    let flips = 0;
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const k = j * this.cols + i;
        if (!this.body[k]) continue;
        const d = Math.hypot(this.cx(i) - x, this.cy(j) - y);
        if (d > r + TERR_CELL * 0.5) continue;
        const w = d < TERR_CELL * 0.75 ? 1 : 0.5;
        const before = this.v[k];
        const after = Math.max(-1, Math.min(1, before + amount * w));
        this.v[k] = after;
        if (amount > 0 && before <= 0.5 && after > 0.5) flips++;
        if (amount < 0 && before >= -0.5 && after < -0.5) flips++;
      }
    }
    return flips;
  }

  /**
   * Samoistny rozrost: zajęte pola przenikają do losowego sąsiada.
   * @param mine siła rozrostu Twojej kolonii, @param rival siła rywali
   */
  spread(mine: number, rival: number): void {
    const { cols, rows, v, body } = this;
    for (let k = 0; k < v.length; k++) {
      const val = v[k];
      if (!body[k] || Math.abs(val) < 0.6) continue;
      const i = k % cols;
      const j = (k - i) / cols;
      const dir = Math.floor(Math.random() * 4);
      const ni = i + (dir === 0 ? 1 : dir === 1 ? -1 : 0);
      const nj = j + (dir === 2 ? 1 : dir === 3 ? -1 : 0);
      if (ni < 0 || nj < 0 || ni >= cols || nj >= rows) continue;
      const nk = nj * cols + ni;
      if (!body[nk]) continue;
      v[nk] = Math.max(-1, Math.min(1, v[nk] + (val > 0 ? mine : -rival)));
    }
  }

  /** Przelicza udziały (ułamek ciała zajęty przez Ciebie i przez rywali). */
  count(): void {
    let m = 0;
    let r = 0;
    for (let k = 0; k < this.v.length; k++) {
      if (!this.body[k]) continue;
      if (this.v[k] > 0.5) m++;
      else if (this.v[k] < -0.5) r++;
    }
    this.mine = m / this.bodyCount;
    this.rival = r / this.bodyCount;
  }

  /** Losowe pole ciała co najmniej `minDist` od punktu. */
  randomBodyCell(x: number, y: number, minDist: number): { x: number; y: number } | undefined {
    for (let t = 0; t < 400; t++) {
      const k = Math.floor(Math.random() * this.v.length);
      if (!this.body[k]) continue;
      const i = k % this.cols;
      const j = (k - i) / this.cols;
      const p = { x: this.cx(i), y: this.cy(j) };
      if (Math.hypot(p.x - x, p.y - y) >= minDist) return p;
    }
    return undefined;
  }
}
