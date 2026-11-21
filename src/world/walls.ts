import { arenaOpenness, bodyDist, currentAnimal, regionAt, type RegionSample } from './animal';
import type { BiomeId } from './biomes';

/**
 * Proceduralny świat: wnętrze myszy — biomy wg narządów (animal.ts) i ściany tkanki w każdym z nich.
 *
 * `openness(x, y)` > 0 — wolna przestrzeń, < 0 — ściana. Wartość działa też jak przybliżona
 * „odległość” od krawędzi (w jednostkach szumu), co wykorzystuje renderer do cieniowania.
 */

const GX = [1, -1, 0, 0, 0.7071, -0.7071, 0.7071, -0.7071];
const GY = [0, 0, 1, -1, 0.7071, 0.7071, -0.7071, -0.7071];

function hashInt(ix: number, iy: number, seed: number): number {
  let h = Math.imul(ix, 374761393) ^ Math.imul(iy, 668265263) ^ Math.imul(seed, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return (h ^ (h >>> 16)) >>> 0;
}

const hash01 = (ix: number, iy: number, seed: number) => hashInt(ix, iy, seed) / 4294967296;
const fade = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);

/** Szum Perlina 2D, zakres ok. [-1, 1]. */
export function perlin(x: number, y: number, seed: number): number {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = x - x0;
  const fy = y - y0;
  const g = (ix: number, iy: number, dx: number, dy: number) => {
    const h = hashInt(ix, iy, seed) & 7;
    return GX[h] * dx + GY[h] * dy;
  };
  const u = fade(fx);
  const v = fade(fy);
  const a = g(x0, y0, fx, fy);
  const b = g(x0 + 1, y0, fx - 1, fy);
  const c = g(x0, y0 + 1, fx, fy - 1);
  const d = g(x0 + 1, y0 + 1, fx - 1, fy - 1);
  return (a + (b - a) * u + (c - a + (a - b + d - c) * u) * v) * 1.4;
}

function fbm(x: number, y: number, seed: number): number {
  return perlin(x, y, seed) * 0.72 + perlin(x * 2.13 + 17.3, y * 2.13 - 9.1, seed + 1) * 0.28;
}

// ───────────────────────── biomy ─────────────────────────

/** Biomy wynikają z anatomii myszy (narządy w ciele) — patrz animal.ts. */
export type BiomeSample = RegionSample;

export function biomeAt(x: number, y: number): BiomeSample {
  return regionAt(x, y);
}

// ───────────────────────── kształt ścian w biomach ─────────────────────────

/** Strefa zarażona: rozpadła, „zjedzona” tkanka — szerokie przejścia i duże komory (łatwy start). */
function openInfected(x: number, y: number): number {
  const n1 = fbm(x / 1100, y / 1100, 121);
  const n2 = fbm(x / 700 + 9, y / 700 - 4, 122);
  return Math.max(0.16 - Math.abs(n1), (n2 + 0.1) * 0.5);
}

/** Mózg: równoległe, pofałdowane zakręty (bruzdy) z poprzecznymi przejściami. */
function openBrain(x: number, y: number): number {
  const warp = perlin(x / 1100, y / 1100, 101) * 2.2;
  const v = Math.sin((x * 0.6 + y * 0.8) / 170 + warp * 2);
  let o = (0.75 - Math.abs(v)) * 0.06;
  // Poprzeczne przejścia między bruzdami.
  o = Math.max(o, 0.06 - Math.abs(perlin(x / 1300, y / 1300, 102)) * 1.1);
  return o;
}

/** Tkanka łączna: sieć krętych, przecinających się tuneli i komór. */
function openTissue(x: number, y: number): number {
  const n1 = fbm(x / 1300, y / 1300, 11);
  const n2 = fbm(x / 1700 + 50.5, y / 1700 - 31.2, 23);
  const n3 = fbm(x / 1000 - 7.7, y / 1000 + 3.3, 37);
  return Math.max(0.08 - Math.abs(n1), 0.08 - Math.abs(n2), (n3 - 0.5) * 0.6);
}

/** Naczynie krwionośne: szerokie, gładkie, długie kanały z odgałęzieniami. */
function openVessel(x: number, y: number): number {
  const wx = x + 320 * perlin(x / 1800, y / 1800, 61);
  const wy = y + 320 * perlin(x / 1800 + 9.1, y / 1800 - 4.2, 62);
  const main = perlin(wx / 2600, wy / 2600, 63);
  const branch = perlin(wx / 1500 + 7.7, wy / 1500, 64);
  return Math.max(0.13 - Math.abs(main), 0.06 - Math.abs(branch));
}

/** Pęcherzyki płucne: okrągłe komory z cienkimi ściankami, przejściami i oskrzelikami. */
function openLung(x: number, y: number): number {
  const cs = 420;
  const cx = Math.floor(x / cs);
  const cy = Math.floor(y / cs);
  let f1 = Infinity;
  let f2 = Infinity;
  for (let j = cy - 1; j <= cy + 1; j++) {
    for (let k = cx - 1; k <= cx + 1; k++) {
      const sx = (k + 0.15 + 0.7 * hash01(k, j, 71)) * cs;
      const sy = (j + 0.15 + 0.7 * hash01(k, j, 72)) * cs;
      const d = Math.hypot(sx - x, sy - y);
      if (d < f1) {
        f2 = f1;
        f1 = d;
      } else if (d < f2) f2 = d;
    }
  }
  // (f2 - f1) / 2 ≈ odległość do ścianki między pęcherzykami (px).
  let o = ((f2 - f1) / 2 - 15) / 500;
  const door = perlin(x / 150, y / 150, 73);
  if (door > 0.32) o = Math.max(o, (door - 0.32) * 0.4);
  // Oskrzeliki — dłuższe korytarze łączące grupy pęcherzyków.
  o = Math.max(o, 0.045 - Math.abs(perlin(x / 2400, y / 2400, 74)));
  return o;
}

/** Jelito: kanały z palczastymi kosmkami wyrastającymi ze ścian. */
function openGut(x: number, y: number): number {
  const n1 = fbm(x / 1500, y / 1500, 81);
  const n2 = fbm(x / 2000 + 3.3, y / 2000 - 8.8, 82);
  let o = Math.max(0.105 - Math.abs(n1), 0.07 - Math.abs(n2));
  const v = 1 - Math.abs(perlin(x / 70, y / 70, 83));
  o -= 0.05 * v * v * v * v;
  return o;
}

const OPEN: Record<BiomeId, (x: number, y: number) => number> = {
  tissue: openTissue,
  vessel: openVessel,
  lung: openLung,
  brain: openBrain,
  infected: openInfected,
  gut: openGut,
};

/**
 * Sieć krętych łączników we wszystkich biomach: zerowe poziomice dwóch szumów o różnej skali
 * tworzą długie, przecinające się korytarze (ok. 120–150 px), które spinają osobne kieszenie w całość.
 */
function connectors(x: number, y: number): number {
  const a = 0.034 - Math.abs(perlin(x / 2600, y / 2600, 131)) * 0.9;
  const b = 0.03 - Math.abs(perlin(x / 3600 + 11.3, y / 3600 - 7.1, 132)) * 0.9;
  return Math.max(a, b);
}

const ROOM_CELL = 1500;

/**
 * Komory: w części komórek siatki (1500 px) okrągła, organicznie poszarpana przestrzeń.
 * Komora mieści się w swojej komórce, więc wystarczy sprawdzić jedną.
 */
function chamber(x: number, y: number): number {
  const ci = Math.floor(x / ROOM_CELL);
  const cj = Math.floor(y / ROOM_CELL);
  if (hash01(ci, cj, 141) > 0.32) return -1;
  const r = 200 + 150 * hash01(ci, cj, 142);
  const m = r + 90;
  const cx = ci * ROOM_CELL + m + (ROOM_CELL - 2 * m) * hash01(ci, cj, 143);
  const cy = cj * ROOM_CELL + m + (ROOM_CELL - 2 * m) * hash01(ci, cj, 144);
  const dx = x - cx;
  const dy = y - cy;
  if (Math.abs(dx) > m || Math.abs(dy) > m) return -1;
  // Poszarpany brzeg (wypustki tkanki) zamiast idealnego koła.
  const edge = r * (1 + 0.18 * perlin(x / 160, y / 160, 145));
  return (edge - Math.hypot(dx, dy)) / 700;
}

export function openness(x: number, y: number): number {
  return opennessIn(x, y, biomeAt(x, y));
}

/** Jak `openness`, ale z już policzonym biomem (oszczędza obliczenia w rendererze). */
export function opennessIn(x: number, y: number, s: BiomeSample): number {
  // Skóra myszy: poza ciałem (i tuż przy skórze) zawsze ściana.
  const skin = (-bodyDist(x, y) - 120) * 0.0004;
  if (skin < -0.15) return skin;
  let o = OPEN[s.a](x, y);
  // Płynne przejście kształtu ścian na granicy biomów.
  if (s.t >= 0.01) o = o * (1 - s.t) + OPEN[s.b](x, y) * s.t;
  // Łączniki i komory: mniej ślepych zaułków i zamkniętych kieszeni, więcej miejsca do walki.
  o = Math.max(o, connectors(x, y), chamber(x, y));
  // Kanały układów (naczynia, przewód pokarmowy, tchawica, rdzeń) — zawsze przejezdne.
  o = Math.max(o, s.channel);
  return Math.min(arenaOpenness(x, y, o), skin);
}

export const isWall = (x: number, y: number): boolean => openness(x, y) < 0;

const CX = Array.from({ length: 8 }, (_, k) => Math.cos((k / 8) * Math.PI * 2));
const CY = Array.from({ length: 8 }, (_, k) => Math.sin((k / 8) * Math.PI * 2));

/** Czy koło o promieniu r w punkcie (x, y) nachodzi na ścianę. */
export function blockedCircle(x: number, y: number, r: number): boolean {
  if (isWall(x, y)) return true;
  for (let k = 0; k < 8; k++) if (isWall(x + CX[k] * r, y + CY[k] * r)) return true;
  return false;
}

/** Najbliższe miejsce startu (spirala od punktu 0,0), gdzie zmieści się koło o promieniu r. */
export function findOpenSpot(r: number, cx = currentAnimal().start.x, cy = currentAnimal().start.y): { x: number; y: number } {
  for (let i = 0; i < 4000; i++) {
    const a = i * 0.7;
    const d = i * 6;
    const x = cx + Math.cos(a) * d;
    const y = cy + Math.sin(a) * d;
    if (!blockedCircle(x, y, r)) return { x, y };
  }
  return { x: cx, y: cy };
}
