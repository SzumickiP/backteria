import type { BiomeId } from './biomes';

/**
 * Mapa to wnętrze ZWIERZĘCIA (widok z góry, głowa w lewo). Do wyboru: mysz, ryba, ptak.
 *
 * Ciało i narządy są opisane prostymi kształtami (elipsy, „kapsuły” o zmiennej grubości).
 * Narządy należą do UKŁADÓW (nerwowy, krwionośny, oddechowy, pokarmowy). Rurowe części układów
 * (naczynia, przewód pokarmowy, tchawica, rdzeń) są „kanałami” — gwarantowanymi przejściami,
 * którymi można przepłynąć przez całe ciało.
 */

export type Shape =
  | { kind: 'ellipse'; x: number; y: number; rx: number; ry: number }
  | { kind: 'capsule'; ax: number; ay: number; bx: number; by: number; ra: number; rb: number };

const E = (x: number, y: number, rx: number, ry: number): Shape => ({ kind: 'ellipse', x, y, rx, ry });
const C = (ax: number, ay: number, bx: number, by: number, ra: number, rb = ra): Shape => ({ kind: 'capsule', ax, ay, bx, by, ra, rb });

/** Łamana jako ciąg kapsuł z płynnie zmienianą grubością. */
function line(points: [number, number][], r0: number, r1 = r0): Shape[] {
  const out: Shape[] = [];
  const n = points.length - 1;
  for (let i = 0; i < n; i++) {
    const ra = r0 + ((r1 - r0) * i) / n;
    const rb = r0 + ((r1 - r0) * (i + 1)) / n;
    out.push(C(points[i][0], points[i][1], points[i + 1][0], points[i + 1][1], ra, rb));
  }
  return out;
}

export type SystemId = 'nervous' | 'circulatory' | 'respiratory' | 'digestive';

export const SYSTEMS: Record<SystemId, { name: string; color: number }> = {
  nervous: { name: 'Układ nerwowy', color: 0xc4a5d8 },
  circulatory: { name: 'Układ krwionośny', color: 0xdc2626 },
  respiratory: { name: 'Układ oddechowy', color: 0xf3b4c6 },
  digestive: { name: 'Układ pokarmowy', color: 0xc08850 },
};

export interface BodyPart {
  name: string;
  shapes: Shape[];
}

export interface OrganRegion {
  name: string;
  system: SystemId;
  biome: BiomeId;
  shapes: Shape[];
  /** rurowy kanał (gwarantowane przejście przez środek) */
  channel?: boolean;
  /** gdzie podpisać na dużej mapie (domyślnie środek pierwszego kształtu); null = bez podpisu */
  label?: [number, number] | null;
}

export type AnimalId = 'mouse' | 'fish' | 'bird';

export interface AnimalDef {
  id: AnimalId;
  name: string;
  /** „Wnętrze myszy” itp. */
  inside: string;
  description: string;
  parts: BodyPart[];
  /** narządy w kolejności pierwszeństwa (pierwszy pasujący wygrywa) */
  organs: OrganRegion[];
  bounds: { minX: number; maxX: number; minY: number; maxY: number };
  start: { x: number; y: number };
}

// ───────────────────────── MYSZ ─────────────────────────

const MOUSE_HEART: [number, number] = [-4300, 900];
const MOUSE: AnimalDef = {
  id: 'mouse',
  name: 'Mysz',
  inside: 'Wnętrze myszy',
  description: 'Zwarte ciało, długi ogon, cztery łapy.',
  bounds: { minX: -24500, maxX: 37000, minY: -14500, maxY: 14500 },
  start: { x: -9500, y: 0 },
  parts: [
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
    { name: 'Ogon', shapes: line([[11500, 0], [16000, 800], [21000, 2500], [26000, 2000], [31000, -500], [35500, -2600]], 1400, 650) },
  ],
  organs: [
    { name: 'Mózg', system: 'nervous', biome: 'brain', shapes: [E(-16600, 0, 3800, 3000)] },
    { name: 'Rdzeń kręgowy', system: 'nervous', biome: 'brain', channel: true, label: [3000, -3700], shapes: line([[-13200, -1200], [-8000, -3000], [0, -3600], [9000, -3000], [11800, -300], [16000, 700], [21000, 2300], [25000, 2100]], 520, 360) },
    { name: 'Serce', system: 'circulatory', biome: 'vessel', shapes: [E(MOUSE_HEART[0], MOUSE_HEART[1], 1800, 1600)] },
    {
      name: 'Naczynia krwionośne', system: 'circulatory', biome: 'vessel', channel: true, label: null,
      shapes: [
        ...line([MOUSE_HEART, [-1000, -1500], [5000, -1800], [11000, -600], [16000, 900], [21000, 2400], [26000, 2000], [29000, 500]], 650, 380),
        ...line([MOUSE_HEART, [-8000, -600], [-12500, -1500], [-15500, -2600]], 600, 420),
        ...line([MOUSE_HEART, [-8000, 1200], [-12500, 1800], [-15500, 2800]], 600, 420),
        ...line([[-3000, -2200], [-6500, -6200], [-8800, -11500]], 560, 420),
        ...line([[-3000, 2600], [-6500, 6200], [-8800, 11500]], 560, 420),
        ...line([[6000, -1800], [7000, -6400], [9400, -12000]], 600, 450),
        ...line([[6000, 1200], [7000, 6400], [9400, 12000]], 600, 450),
      ],
    },
    { name: 'Płuca', system: 'respiratory', biome: 'lung', shapes: [E(-5600, -3500, 3300, 2700), E(-5600, 3600, 3300, 2700)] },
    { name: 'Tchawica', system: 'respiratory', biome: 'lung', channel: true, label: [-13000, -700], shapes: [...line([[-21500, -300], [-14000, -400], [-8500, -200]], 550), ...line([[-8500, -200], [-6500, -2500]], 480), ...line([[-8500, -200], [-6500, 2600]], 480)] },
    { name: 'Przełyk', system: 'digestive', biome: 'gut', channel: true, label: [-11000, 2300], shapes: line([[-22000, 500], [-14000, 1500], [-8500, 2200], [-2000, 4300], [700, 3600]], 520) },
    { name: 'Żołądek', system: 'digestive', biome: 'gut', shapes: [E(2000, 3200, 2600, 2000)] },
    { name: 'Jelita', system: 'digestive', biome: 'gut', channel: true, label: [6500, 1200], shapes: line([[3800, 3800], [7500, 5000], [9800, 3000], [7000, 1200], [3500, 300], [2200, -2200], [6200, -4200], [9800, -2500], [11200, -300], [12500, 300]], 680) },
  ],
};

// ───────────────────────── RYBA ─────────────────────────

const FISH_HEART: [number, number] = [-8800, 1900];
const FISH: AnimalDef = {
  id: 'fish',
  name: 'Ryba',
  inside: 'Wnętrze ryby',
  description: 'Wydłużone ciało, skrzela, pęcherz pławny i płetwy.',
  bounds: { minX: -21000, maxX: 27500, minY: -12500, maxY: 12500 },
  start: { x: -4000, y: 0 },
  parts: [
    { name: 'Głowa', shapes: [E(-13800, 0, 5200, 4400), E(-17500, 300, 2300, 1800)] },
    { name: 'Tułów', shapes: [E(0, 0, 15000, 5600)] },
    { name: 'Płetwy', shapes: [C(-1000, -5000, 4500, -9600, 1700, 700), C(-6500, 4400, -3000, 8800, 1300, 600), C(5000, 4800, 8000, 8000, 1000, 500)] },
    { name: 'Ogon', shapes: [C(13500, 0, 18000, 0, 2600, 1700), C(17500, 0, 25000, -7500, 1600, 1100), C(17500, 0, 25000, 7500, 1600, 1100)] },
  ],
  organs: [
    { name: 'Mózg', system: 'nervous', biome: 'brain', shapes: [E(-15000, -400, 2600, 2000)] },
    { name: 'Rdzeń kręgowy', system: 'nervous', biome: 'brain', channel: true, label: [3000, -3300], shapes: line([[-12500, -1500], [-6000, -2700], [4000, -3000], [13000, -1500], [18000, 0]], 480, 320) },
    { name: 'Serce', system: 'circulatory', biome: 'vessel', shapes: [E(FISH_HEART[0], FISH_HEART[1], 1400, 1300)] },
    {
      name: 'Naczynia krwionośne', system: 'circulatory', biome: 'vessel', channel: true, label: null,
      shapes: [
        ...line([FISH_HEART, [-10500, 0], [-8000, -1500], [0, -1600], [10000, -800], [19000, 0]], 600, 380),
        ...line([FISH_HEART, [-11000, 3000], [-12000, -2800]], 480),
        ...line([[-2000, -1600], [1500, -6500]], 450),
        ...line([[19000, 0], [23500, -6200]], 380),
        ...line([[19000, 0], [23500, 6200]], 380),
      ],
    },
    { name: 'Skrzela', system: 'respiratory', biome: 'lung', shapes: [E(-10800, -2900, 1700, 2300), E(-10800, 3100, 1700, 2300)] },
    { name: 'Pęcherz pławny', system: 'respiratory', biome: 'lung', shapes: [E(2500, -1300, 4800, 1700)] },
    { name: 'Przełyk', system: 'digestive', biome: 'gut', channel: true, label: [-11500, 900], shapes: line([[-18500, 300], [-12500, 800], [-6000, 1900], [-2800, 2400]], 520) },
    { name: 'Żołądek', system: 'digestive', biome: 'gut', shapes: [E(-1200, 2500, 2200, 1500)] },
    { name: 'Jelita', system: 'digestive', biome: 'gut', channel: true, label: [6000, 3300], shapes: line([[700, 2800], [4500, 3800], [7500, 2400], [5000, 1400], [8500, 1200], [10500, 2300], [11500, 2500]], 620) },
  ],
};

// ───────────────────────── PTAK ─────────────────────────

const BIRD_HEART: [number, number] = [-4500, 0];
const BIRD: AnimalDef = {
  id: 'bird',
  name: 'Ptak',
  inside: 'Wnętrze ptaka',
  description: 'Rozłożone skrzydła, dziób, worki powietrzne.',
  bounds: { minX: -20000, maxX: 17500, minY: -23000, maxY: 23000 },
  start: { x: -6000, y: 2600 },
  parts: [
    { name: 'Głowa', shapes: [E(-11200, 0, 3600, 3100), C(-14000, 0, -19000, 0, 1100, 250)] },
    { name: 'Tułów', shapes: [E(0, 0, 9200, 5200)] },
    { name: 'Skrzydło', shapes: [C(-2500, -3500, 3500, -21000, 3800, 1300), C(-2500, 3500, 3500, 21000, 3800, 1300)] },
    { name: 'Ogon', shapes: [C(8000, 0, 15500, 0, 2200, 3600)] },
  ],
  organs: [
    { name: 'Mózg', system: 'nervous', biome: 'brain', shapes: [E(-11800, -200, 2200, 1900)] },
    { name: 'Rdzeń kręgowy', system: 'nervous', biome: 'brain', channel: true, label: [3000, -3200], shapes: line([[-9500, -1000], [-3000, -2700], [5000, -2900], [13000, -1200]], 450, 320) },
    { name: 'Serce', system: 'circulatory', biome: 'vessel', shapes: [E(BIRD_HEART[0], BIRD_HEART[1], 1700, 1600)] },
    {
      name: 'Naczynia krwionośne', system: 'circulatory', biome: 'vessel', channel: true, label: null,
      shapes: [
        ...line([BIRD_HEART, [0, -1300], [7000, -900], [13500, 0]], 600, 400),
        ...line([BIRD_HEART, [-8000, -900], [-11000, -1600]], 500),
        ...line([[-2500, -1200], [0, -8000], [2500, -16000], [3200, -20000]], 560, 380),
        ...line([[-2500, 1200], [0, 8000], [2500, 16000], [3200, 20000]], 560, 380),
      ],
    },
    { name: 'Płuca', system: 'respiratory', biome: 'lung', shapes: [E(-3600, -2900, 2000, 1500), E(-3600, 3000, 2000, 1500)] },
    { name: 'Worki powietrzne', system: 'respiratory', biome: 'lung', shapes: [E(2800, -3200, 3200, 1700), E(2800, 3200, 3200, 1700), E(0, -9500, 2000, 3800), E(0, 9500, 2000, 3800)] },
    { name: 'Tchawica', system: 'respiratory', biome: 'lung', channel: true, label: [-9000, 1300], shapes: [...line([[-18500, 0], [-11000, 600], [-6200, 700]], 480), ...line([[-6200, 700], [-4200, -2400]], 420), ...line([[-6200, 700], [-4200, 2800]], 420)] },
    { name: 'Przełyk i wole', system: 'digestive', biome: 'gut', channel: true, label: [-8500, 3300], shapes: [...line([[-15500, 150], [-12500, 1200], [-7500, 2600]], 480), E(-7000, 3000, 1500, 1200), ...line([[-7000, 3000], [-2000, 3600], [1500, 1500]], 480)] },
    { name: 'Żołądek mięśniowy', system: 'digestive', biome: 'gut', shapes: [E(2300, 1000, 1900, 1600)] },
    { name: 'Jelita', system: 'digestive', biome: 'gut', channel: true, label: [6000, 2200], shapes: line([[3800, 1500], [6500, 3200], [8000, 1200], [5500, -500], [8500, -1300], [10500, 600]], 600) },
  ],
};

export const ANIMALS: Record<AnimalId, AnimalDef> = { mouse: MOUSE, fish: FISH, bird: BIRD };
export const ANIMAL_ORDER: AnimalId[] = ['mouse', 'fish', 'bird'];

// ───────────────────────── bieżące zwierzę ─────────────────────────

let current: AnimalDef = MOUSE;
let allBody: Shape[] = MOUSE.parts.flatMap((p) => p.shapes);

/** Ustawia zwierzę, w którym toczy się gra (przed startem sceny gry). */
export function setAnimal(id: AnimalId): void {
  current = ANIMALS[id];
  allBody = current.parts.flatMap((p) => p.shapes);
}

export function currentAnimal(): AnimalDef {
  return current;
}

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

/** Odległość od skóry (ujemna = wewnątrz zwierzęcia). */
export function bodyDist(x: number, y: number): number {
  return shapesDist(allBody, x, y);
}

export interface RegionSample {
  /** biom (styl ścian i wrogowie) w tym miejscu */
  a: BiomeId;
  /** sąsiedni biom (na granicy) */
  b: BiomeId;
  /** waga sąsiedniego biomu (0 = czysty a, 0.5 = sama granica) */
  t: number;
  /** nazwa miejsca do wyświetlenia */
  name: string;
  /** układ narządów (jeśli punkt jest w narządzie) */
  system?: SystemId;
  /** „otwartość” kanału (naczynie, przewód pokarmowy…) — gwarantowane przejście; -Infinity poza kanałem */
  channel: number;
}

const BLEND = 700;
const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** Który narząd / część ciała jest w punkcie (x, y), jak blisko granicy innego i czy to kanał. */
export function regionAt(x: number, y: number): RegionSample {
  let channel = -Infinity;
  let inside: { o: OrganRegion; d: number } | undefined;
  let nearest: OrganRegion | undefined;
  let nearestD = Infinity;
  for (const o of current.organs) {
    const d = shapesDist(o.shapes, x, y);
    // Kanały liczą się zawsze (nawet gdy na wierzchu jest inny narząd) — droga przez ciało jest ciągła.
    if (o.channel && d < 0) channel = Math.max(channel, (-d - 90) * 0.0004);
    if (d < 0) {
      if (!inside) inside = { o, d };
    } else if (d < nearestD) {
      nearestD = d;
      nearest = o;
    }
  }
  if (inside) {
    const { o, d } = inside;
    return { a: o.biome, b: 'tissue', t: 0.5 * (1 - smooth(0, BLEND, -d)), name: o.name, system: o.system, channel };
  }
  let name = 'Tkanka łączna';
  let best = Infinity;
  for (const p of current.parts) {
    const d = shapesDist(p.shapes, x, y);
    if (d < best) {
      best = d;
      name = p.name;
    }
  }
  if (best > 0) name = 'Skóra';
  const t = nearest && nearestD < BLEND ? 0.5 * (1 - smooth(0, BLEND, nearestD)) : 0;
  return { a: 'tissue', b: nearest?.biome ?? 'tissue', t, name, channel };
}
