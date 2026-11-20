import type { PlayerStats } from './mutations';

/**
 * Budowa ciała bakterii — gracz sam nadaje jej kształt, rozmiar i czułki (edytor komórki, zakładka „Ciało”).
 * Nic nie kosztuje, ale ma swoje zalety i wady (patrz `applyBody`).
 */
export interface BodyDesign {
  /** 0 = kulista (ziarniak) … 1 = długa, cienka pałeczka */
  shape: number;
  /** mnożnik rozmiaru komórki */
  size: number;
  /** liczba czułków */
  feelers: number;
  /** długość czułków (mnożnik) */
  feelerLen: number;
}

export const DEFAULT_BODY: Readonly<BodyDesign> = { shape: 0.5, size: 1, feelers: 0, feelerLen: 1 };

export const BODY_LIMITS = {
  shape: { min: 0, max: 1, step: 0.1 },
  size: { min: 0.7, max: 1.5, step: 0.1 },
  feelers: { min: 0, max: 8, step: 1 },
  feelerLen: { min: 0.6, max: 1.8, step: 0.2 },
} as const;

/** Aktualny projekt ciała bakterii gracza (wspólny dla gry i edytora). */
export const body: BodyDesign = { ...DEFAULT_BODY };

const KEY = 'backteria.body';

export function loadBody(): void {
  try {
    const raw = localStorage.getItem(KEY);
    const d = raw ? (JSON.parse(raw) as Partial<BodyDesign>) : {};
    for (const k of Object.keys(BODY_LIMITS) as (keyof BodyDesign)[]) {
      const lim = BODY_LIMITS[k];
      const v = typeof d[k] === 'number' ? (d[k] as number) : DEFAULT_BODY[k];
      body[k] = Math.min(lim.max, Math.max(lim.min, v));
    }
  } catch {
    Object.assign(body, DEFAULT_BODY);
  }
}

export function saveBody(): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(body));
  } catch {
    /* brak zapisu — trudno */
  }
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** Rozciągnięcie tekstury pałeczki (domyślna tekstura = kształt 0.5). */
export function bodyStretch(d: BodyDesign = body): { x: number; y: number } {
  return { x: lerp(0.7, 1.3, d.shape), y: lerp(1.3, 0.7, d.shape) };
}

/** Półosie błony komórki (w promieniach): pałeczka = elipsa, wirus = koło. */
export function bodyAxes(rod: boolean): { ax: number; ay: number } {
  if (!rod) return { ax: 0.9, ay: 0.9 };
  const s = bodyStretch();
  return { ax: 1.35 * s.x, ay: 0.75 * s.y };
}

/** Wpływ budowy ciała na statystyki. */
export function applyBody(s: PlayerStats, d: BodyDesign = body): void {
  // Rozmiar: większa = więcej zdrowia i siły, ale wolniejsza.
  s.maxHp *= Math.pow(d.size, 1.4);
  s.damage *= Math.pow(d.size, 0.6);
  s.speed /= Math.pow(d.size, 0.5);
  // Kształt: kulista jest wytrzymała, pałeczka — szybka.
  s.maxHp *= lerp(1.12, 0.96, d.shape);
  s.speed *= lerp(0.94, 1.1, d.shape);
  // Czułki: wyczuwają pożywienie i wydłużają zasięg ataku, ale spowalniają.
  const f = d.feelers * d.feelerLen;
  s.magnet += 9 * f;
  s.reach += 1.5 * f;
  s.speed *= 1 - Math.min(0.2, 0.012 * f);
}
