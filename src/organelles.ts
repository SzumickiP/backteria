import { bodyAxes } from './body';
import type { PlayerStats } from './mutations';
import type { SpeciesId } from './species';

/**
 * Organella (narządy komórkowe) — budulec ewolucji. Gracz sam dokłada je do swojej komórki
 * w edytorze (V), płacąc punktami DNA. Każde zmienia statystyki i jest widoczne na komórce.
 */

/** Gdzie organellum się umieszcza: na błonie (krawędzi), we wnętrzu, albo jako warstwa wokół całej komórki. */
export type Placement = 'edge' | 'inside' | 'shell';

export interface OrganelleDef {
  id: string;
  name: string;
  description: string;
  cost: number;
  max: number;
  placement: Placement;
  /** kolor na podglądzie i w grze */
  color: number;
  apply(s: PlayerStats): void;
}

export interface PlacedOrganelle {
  id: string;
  /** kąt względem osi komórki (rad) */
  angle: number;
  /** odległość od środka jako ułamek promienia (0–1; dla krawędzi = 1) */
  dist: number;
}

export const BACTERIUM_ORGANELLES: OrganelleDef[] = [
  {
    id: 'flagellum', name: 'Wić', description: '+9% prędkości', cost: 1, max: 3, placement: 'edge', color: 0x9ef0cb,
    apply: (s) => { s.speed *= 1.09; },
  },
  {
    id: 'spike', name: 'Kolec', description: '+5 obrażeń i +3 zasięgu ataku', cost: 1, max: 6, placement: 'edge', color: 0xfef08a,
    apply: (s) => { s.damage += 5; s.reach += 3; },
  },
  {
    id: 'capsule', name: 'Otoczka', description: '+18 zdrowia, -5% obrażeń', cost: 2, max: 3, placement: 'shell', color: 0x93c5fd,
    apply: (s) => { s.maxHp += 18; s.armor *= 0.95; },
  },
  {
    id: 'gland', name: 'Gruczoł toksyn', description: 'Salwa toksyn: +1 pocisk', cost: 3, max: 2, placement: 'inside', color: 0xbef264,
    apply: (s) => { s.shots += 1; },
  },
  {
    id: 'ribosome', name: 'Rybosomy', description: '+0,5 regeneracji zdrowia/s', cost: 1, max: 3, placement: 'inside', color: 0xfda4af,
    apply: (s) => { s.regen += 0.5; },
  },
  {
    id: 'receptor', name: 'Chemoreceptor', description: 'Przyciąga pożywienie z +40 px', cost: 1, max: 3, placement: 'edge', color: 0x67e8f9,
    apply: (s) => { s.magnet += 40; },
  },
  {
    id: 'pilus', name: 'Pilus koniugacyjny', description: '+1 miejsce w kolonii', cost: 3, max: 2, placement: 'edge', color: 0xc4b5fd,
    apply: (s) => { s.maxColony += 1; },
  },
];

export const VIRUS_ORGANELLES: OrganelleDef[] = [
  {
    id: 'spike-protein', name: 'Białko wypustkowe', description: '+15% szybkości infekcji i obrażeń', cost: 1, max: 6, placement: 'edge', color: 0x5eead4,
    apply: (s) => { s.damage *= 1.15; },
  },
  {
    id: 'envelope', name: 'Otoczka lipidowa', description: '+12 zdrowia', cost: 1, max: 3, placement: 'shell', color: 0xfde68a,
    apply: (s) => { s.maxHp += 12; },
  },
  {
    id: 'transcriptase', name: 'Odwrotna transkryptaza', description: '+1 kopia z każdej infekcji', cost: 3, max: 2, placement: 'inside', color: 0xf0abfc,
    apply: (s) => { s.copies += 1; },
  },
  {
    id: 'armored-capsid', name: 'Wzmocniony kapsyd', description: '-8% otrzymywanych obrażeń', cost: 2, max: 3, placement: 'shell', color: 0xcbd5e1,
    apply: (s) => { s.armor *= 0.92; },
  },
  {
    id: 'cloak', name: 'Białko maskujące', description: 'Odporność widzi Cię z 8% mniejszej odległości', cost: 1, max: 3, placement: 'edge', color: 0xa5b4fc,
    apply: (s) => { s.stealth *= 0.92; },
  },
  {
    id: 'tail', name: 'Ogonek faga', description: 'Szarża: +15% czasu i +12% obrażeń', cost: 2, max: 3, placement: 'edge', color: 0xfdba74,
    apply: (s) => { s.dashDuration *= 1.15; s.abilityDamage *= 1.12; },
  },
];

export function organellesFor(species: SpeciesId): OrganelleDef[] {
  return species === 'virus' ? VIRUS_ORGANELLES : BACTERIUM_ORGANELLES;
}

/**
 * Punkt na błonie komórki dla danego kąta (w jednostkach promienia):
 * pałeczka ≈ elipsa 1.35 × 0.75, wirus = koło 0.9.
 */
export function edgePoint(rod: boolean, angle: number): { x: number; y: number } {
  const { ax, ay } = bodyAxes(rod); // pałeczka: kształt nadany przez gracza (domyślnie 1.35 × 0.75)
  return { x: Math.cos(angle) * ax, y: Math.sin(angle) * ay };
}
