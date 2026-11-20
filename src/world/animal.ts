import type { BiomeId } from './biomes';

/**
 * Mapa to wnętrze MYSZY (widok z góry, głowa w lewo, ogon w prawo).
 * Ciało i narządy opisane są prostymi kształtami (elipsy, „kapsuły” o zmiennej grubości).
 * Te same kształty służą do: granicy świata (skóra), rozmieszczenia biomów i rysowania dużej mapy.
 */

export type Shape =
  | { kind: 'ellipse'; x: number; y: number; rx: number; ry: number }
  | { kind: 'capsule'; ax: number; ay: number; bx: number; by: number; ra: number; rb: number };

const E = (x: number, y: number, rx: number, ry: number): Shape => ({ kind: 'ellipse', x, y, rx, ry });
const C = (ax: number, ay: number, bx: number, by: number, ra: number, rb = ra): Shape => ({ kind: 'capsule', ax, ay, bx, by, ra, rb });

/** Łamana jako ciąg kapsuł z płynnie zmienianą grubością. */
function polyline(points: [number, number][], r0: number, r1: number): Shape[] {
  const out: Shape[] = [];
  const n = points.length - 1;
  for (let i = 0; i < n; i++) {
    const ra = r0 + ((r1 - r0) * i) / n;
    const rb = r0 + ((r1 - r0) * (i + 1)) / n;
    out.push(C(points[i][0], points[i][1], points[i + 1][0], points[i + 1][1], ra, rb));
  }
  return out;
}

export interface BodyPart {
  name: string;
  shapes: Shape[];
}

/** Części ciała (granica świata = suma wszystkich kształtów). */
export const BODY_PARTS: BodyPart[] = [
  { name: 'Głowa', shapes: [E(-16000, 0, 5200, 4200), E(-21000, 0, 2700, 1900), E(-14200, -4700, 2300, 2300), E(-14200, 4700, 2300, 2300), E(-10600, 0, 3300, 3700)] },
  { name: 'Tułów', shapes: [E(0, 0, 12500, 7600)] },
  {
    name: 'Łapa',
    shapes: [
      C(-6500, -6000, -8600, -11200, 1500), E(-8900, -12000, 1900, 1500),
      C(-6500, 6000, -8600, 11200, 1500), E(-8900, 12000, 1900, 1500),
      C(6500, -6200, 9200, -11600, 1800), E(9600, -12400, 2100, 1600),
      C(6500, 6200, 9200, 11600, 1800), E(9600, 12400, 2100, 1600),
    ],
  },
  { name: 'Ogon', shapes: polyline([[11500, 0], [16000, 800], [21000, 2500], [26000, 2000], [31000, -500], [35500, -2600]], 1400, 650) },
];

export interface OrganRegion {
  name: string;
  biome: BiomeId;
  shapes: Shape[];
  /** kolor na dużej mapie */
  color: number;
}

const HEART = { x: -4300, y: 900 };

/** Narządy — w kolejności pierwszeństwa (pierwszy pasujący wygrywa). */
export const ORGANS: OrganRegion[] = [
  { name: 'Mózg', biome: 'brain', shapes: [E(-16600, 0, 3800, 3000)], color: 0xd8b4c4 },
  { name: 'Serce', biome: 'vessel', shapes: [E(HEART.x, HEART.y, 1800, 1600)], color: 0xdc2626 },
  {
    name: 'Naczynia krwionośne',
    biome: 'vessel',
    color: 0xb91c1c,
    shapes: [
      // aorta wzdłuż kręgosłupa i tętnice szyjne
      ...polyline([[HEART.x, HEART.y], [-1000, -1500], [5000, -1800], [11000, -600], [20000, 1800], [30000, 600]], 650, 380),
      ...polyline([[HEART.x, HEART.y], [-8000, -600], [-12500, -1500], [-15500, -2600]], 600, 420),
      ...polyline([[HEART.x, HEART.y], [-8000, 1200], [-12500, 1800], [-15500, 2800]], 600, 420),
      // do łap
      ...polyline([[-3000, -2200], [-6500, -6200], [-8800, -11500]], 560, 420),
      ...polyline([[-3000, 2600], [-6500, 6200], [-8800, 11500]], 560, 420),
      ...polyline([[6000, -1800], [7000, -6400], [9400, -12000]], 600, 450),
      ...polyline([[6000, 1200], [7000, 6400], [9400, 12000]], 600, 450),
    ],
  },
  { name: 'Płuca', biome: 'lung', shapes: [E(-5600, -3500, 3300, 2700), E(-5600, 3600, 3300, 2700)], color: 0xf0b8c8 },
  { name: 'Jelita', biome: 'gut', shapes: [E(5200, 300, 6400, 5300)], color: 0xc08850 },
];

// ───────────────────────── odległości ─────────────────────────

/** Przybliżona odległość ze znakiem (ujemna = w środku). */
export function shapeDist(s: Shape, x: number, y: number): number {
  if (s.kind === 'ellipse') {
    const k = Math.hypot((x - s.x) / s.rx, (y - s.y) / s.ry);
    return (k - 1) * Math.min(s.rx, s.ry);
  }
  const dx = s.bx - s.ax;
  const dy = s.by - s.ay;
  const len2 = dx * dx + dy * dy || 1;
  const t = Math.max(0, Math.min(1, ((x - s.ax) * dx + (y - s.ay) * dy) / len2));
  const r = s.ra + (s.rb - s.ra) * t;
  return Math.hypot(x - (s.ax + dx * t), y - (s.ay + dy * t)) - r;
}

export function shapesDist(shapes: Shape[], x: number, y: number): number {
  let d = Infinity;
  for (const s of shapes) {
    const v = shapeDist(s, x, y);
    if (v < d) d = v;
  }
  return d;
}

const ALL_BODY = BODY_PARTS.flatMap((p) => p.shapes);

/** Odległość od skóry (ujemna = wewnątrz myszy). */
export function bodyDist(x: number, y: number): number {
  return shapesDist(ALL_BODY, x, y);
}

/** Granice świata (do dużej mapy). */
export const BODY_BOUNDS = { minX: -24500, maxX: 37000, minY: -14500, maxY: 14500 } as const;

/** Punkt startu gracza — szyja / klatka piersiowa. */
export const START_POINT = { x: -9500, y: 0 } as const;

export interface RegionSample {
  /** biom (styl ścian i wrogowie) w tym miejscu */
  a: BiomeId;
  /** sąsiedni biom (na granicy) */
  b: BiomeId;
  /** waga sąsiedniego biomu (0 = czysty a, 0.5 = sama granica) */
  t: number;
  /** nazwa miejsca do wyświetlenia */
  name: string;
}

const BLEND = 700;
const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** Który narząd / część ciała jest w punkcie (x, y) i jak blisko granicy innego. */
export function regionAt(x: number, y: number): RegionSample {
  let nearest: OrganRegion | undefined;
  let nearestD = Infinity;
  for (const o of ORGANS) {
    const d = shapesDist(o.shapes, x, y);
    if (d < 0) {
      // W narządzie: przy jego brzegu mieszamy z tkanką wokół.
      return { a: o.biome, b: 'tissue', t: 0.5 * (1 - smooth(0, BLEND, -d)), name: o.name };
    }
    if (d < nearestD) {
      nearestD = d;
      nearest = o;
    }
  }
  let name = 'Tkanka łączna';
  let best = Infinity;
  for (const p of BODY_PARTS) {
    const d = shapesDist(p.shapes, x, y);
    if (d < best) {
      best = d;
      name = p.name;
    }
  }
  if (best > 0) name = 'Skóra';
  const t = nearest && nearestD < BLEND ? 0.5 * (1 - smooth(0, BLEND, nearestD)) : 0;
  return { a: 'tissue', b: nearest?.biome ?? 'tissue', t, name };
}
