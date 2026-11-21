import { openness } from './walls';

/**
 * „Myślenie” ruchu: omijanie ścian i szukanie drogi naokoło nich.
 *
 * 1. Mapa odległości (flow field) — BFS po zgrubnej siatce od punktu docelowego (zwykle gracza).
 *    Każda komórka zna liczbę kroków do celu, więc z dowolnego miejsca wystarczy iść do sąsiada
 *    o mniejszej odległości — droga sama prowadzi tunelami naokoło ścian.
 * 2. Czujniki (context steering) — przed ruchem sprawdzamy kilka kierunków przed sobą i wybieramy
 *    najbliższy zamierzonemu, który nie prowadzi w ścianę.
 */

const CELL = 48;
/** Margines „wolności” komórki siatki (jednostki openness) — żeby droga nie ocierała się o ściany. */
const FREE_MARGIN = 0.012;
const DIRS: [number, number, number][] = [
  [1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1],
  [1, 1, 1.414], [1, -1, 1.414], [-1, 1, 1.414], [-1, -1, 1.414],
];

export class Navigator {
  private freeCache = new Map<number, boolean>();
  private dist?: Float32Array;
  private ox = 0;
  private oy = 0;
  private size = 0;

  /** Zapomina zapamiętane wolne/zajęte pola (po zmianie kształtu świata). */
  resetCache(): void {
    this.freeCache.clear();
  }

  private key(cx: number, cy: number): number {
    // Unikalny klucz dla współrzędnych w zakresie ±2^20.
    return (cx + 1048576) * 2097152 + (cy + 1048576);
  }

  private isFree(cx: number, cy: number): boolean {
    const k = this.key(cx, cy);
    let v = this.freeCache.get(k);
    if (v === undefined) {
      v = openness((cx + 0.5) * CELL, (cy + 0.5) * CELL) > FREE_MARGIN;
      if (this.freeCache.size > 200000) this.freeCache.clear();
      this.freeCache.set(k, v);
    }
    return v;
  }

  /** Przelicza mapę odległości do punktu (tx, ty) w promieniu `radius` px. */
  buildFlow(tx: number, ty: number, radius: number): void {
    const n = Math.ceil(radius / CELL);
    const size = n * 2 + 1;
    const tcx = Math.floor(tx / CELL);
    const tcy = Math.floor(ty / CELL);
    this.ox = tcx - n;
    this.oy = tcy - n;
    this.size = size;
    const dist = new Float32Array(size * size).fill(Infinity);

    // Dijkstra „na skróty”: kolejka kubełkowa wystarcza przy wagach 1 i 1.414.
    const queue: number[] = [];
    const start = n * size + n;
    dist[start] = 0;
    queue.push(start);
    let head = 0;
    while (head < queue.length) {
      const i = queue[head++];
      const x = i % size;
      const y = (i - x) / size;
      const d = dist[i];
      for (const [dx, dy, w] of DIRS) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= size || ny >= size) continue;
        const j = ny * size + nx;
        if (dist[j] <= d + w) continue;
        if (!this.isFree(this.ox + nx, this.oy + ny)) continue;
        // Po skosie tylko, gdy oba „rogi” są wolne (bez przeciskania się przez narożnik ściany).
        if (dx && dy && (!this.isFree(this.ox + x + dx, this.oy + y) || !this.isFree(this.ox + x, this.oy + y + dy))) continue;
        dist[j] = d + w;
        queue.push(j);
      }
    }
    this.dist = dist;
  }

  /**
   * Kierunek „w dół” mapy odległości z punktu (x, y) — czyli droga do celu naokoło ścian.
   * undefined, gdy punkt jest poza mapą albo nie ma do celu drogi.
   */
  flowDir(x: number, y: number): { x: number; y: number } | undefined {
    const dist = this.dist;
    if (!dist) return undefined;
    const cx = Math.floor(x / CELL) - this.ox;
    const cy = Math.floor(y / CELL) - this.oy;
    if (cx < 0 || cy < 0 || cx >= this.size || cy >= this.size) return undefined;
    let best = dist[cy * this.size + cx];
    let bx = 0;
    let by = 0;
    for (const [dx, dy] of DIRS) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= this.size || ny >= this.size) continue;
      const d = dist[ny * this.size + nx];
      if (d < best) {
        best = d;
        bx = dx;
        by = dy;
      }
    }
    if (!bx && !by) return undefined;
    // Celuj w środek lepszej komórki (płynniej niż czysty kierunek siatki).
    const tx = (this.ox + cx + bx + 0.5) * CELL;
    const ty = (this.oy + cy + by + 0.5) * CELL;
    const l = Math.hypot(tx - x, ty - y) || 1;
    return { x: (tx - x) / l, y: (ty - y) / l };
  }

  /** Czy odcinek między punktami jest wolny od ścian (próbki co ~40 px). */
  lineOfSight(x0: number, y0: number, x1: number, y1: number): boolean {
    const d = Math.hypot(x1 - x0, y1 - y0);
    const steps = Math.ceil(d / 40);
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      if (openness(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t) < 0) return false;
    }
    return true;
  }
}

/** Kąty sprawdzane przez czujniki (od najbliższego zamierzonemu kierunkowi). */
const FEELER_ANGLES = [0, 0.4, -0.4, 0.8, -0.8, 1.25, -1.25, 1.7, -1.7, 2.3, -2.3, Math.PI];

/**
 * Czujniki: zwraca kierunek najbliższy (dx, dy), który na odległość ok. `look` px nie prowadzi w ścianę.
 * Gdy wszystko zablokowane — kierunek bez zmian (kolizje i tak nie pozwolą wejść w ścianę).
 */
export function avoidWalls(x: number, y: number, r: number, dx: number, dy: number, look = 55): { x: number; y: number } {
  const base = Math.atan2(dy, dx);
  for (const off of FEELER_ANGLES) {
    const a = base + off;
    const c = Math.cos(a);
    const s = Math.sin(a);
    // Dwa czujniki: blisko (tuż przed błoną) i dalej (zawczasu).
    if (openness(x + c * (r + 10), y + s * (r + 10)) < 0.004) continue;
    if (openness(x + c * (r + look), y + s * (r + look)) < 0.004) continue;
    return { x: c, y: s };
  }
  return { x: dx, y: dy };
}
