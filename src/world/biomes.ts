import type { EnemyKind } from '../entities/Enemy';

export type BiomeId = 'tissue' | 'vessel' | 'lung' | 'gut' | 'brain' | 'infected';
export type RGB = [number, number, number];

export interface BiomeDef {
  id: BiomeId;
  name: string;
  /** kolory ściany: wnętrze, środek, błona na krawędzi */
  wallDeep: RGB;
  wallMid: RGB;
  rim: RGB;
  /** zabarwienie podłoża (wolnej przestrzeni) */
  floor: RGB;
  floorAlpha: number;
  /** kolor ścian na minimapie */
  minimap: RGB;
  /** wagi losowania wrogów bakterii */
  enemies: Partial<Record<EnemyKind, number>>;
  /** wagi losowania układu odpornościowego (wrogowie wirusa) */
  immune: Partial<Record<EnemyKind, number>>;
}

export const BIOMES: Record<BiomeId, BiomeDef> = {
  tissue: {
    id: 'tissue',
    name: 'Tkanka łączna',
    wallDeep: [70, 16, 34],
    wallMid: [150, 46, 70],
    rim: [238, 140, 162],
    floor: [0, 0, 0],
    floorAlpha: 0,
    minimap: [150, 46, 70],
    enemies: { virus: 3, germ: 1.5, coccus: 1, bacillus: 1 },
    immune: { antibody: 3, leukocyte: 1.2 },
  },
  vessel: {
    id: 'vessel',
    name: 'Naczynie krwionośne',
    wallDeep: [86, 6, 16],
    wallMid: [176, 28, 42],
    rim: [255, 128, 128],
    floor: [140, 0, 14],
    floorAlpha: 0.22,
    minimap: [196, 40, 52],
    enemies: { virus: 3, spirochete: 2.5, coccus: 1 },
    immune: { antibody: 4, leukocyte: 1 },
  },
  lung: {
    id: 'lung',
    name: 'Pęcherzyki płucne',
    wallDeep: [150, 92, 112],
    wallMid: [222, 160, 178],
    rim: [255, 228, 236],
    floor: [70, 46, 84],
    floorAlpha: 0.28,
    minimap: [226, 172, 188],
    enemies: { mycobacterium: 2, coccus: 2, virus: 2 },
    immune: { antibody: 2, leukocyte: 1, macrophage: 1.5 },
  },
  gut: {
    id: 'gut',
    name: 'Jelito',
    wallDeep: [78, 38, 16],
    wallMid: [158, 96, 50],
    rim: [238, 192, 122],
    floor: [80, 56, 0],
    floorAlpha: 0.22,
    minimap: [176, 112, 60],
    enemies: { toxigen: 2.5, bacillus: 2, germ: 2, virus: 1 },
    immune: { antibody: 3, leukocyte: 1.5 },
  },
  infected: {
    id: 'infected',
    name: 'Strefa zarażona',
    wallDeep: [92, 84, 28],
    wallMid: [168, 156, 64],
    rim: [222, 214, 120],
    floor: [90, 110, 20],
    floorAlpha: 0.22,
    minimap: [176, 166, 70],
    // Łatwy start: tylko słabi wrogowie (i tak rzadko, bo w strefie się nie pojawiają).
    enemies: { virus: 1 },
    immune: { antibody: 1 },
  },
  brain: {
    id: 'brain',
    name: 'Mózg',
    wallDeep: [120, 88, 100],
    wallMid: [196, 158, 166],
    rim: [242, 214, 220],
    floor: [70, 40, 70],
    floorAlpha: 0.25,
    minimap: [210, 170, 180],
    enemies: { virus: 2.5, spirochete: 1.5, coccus: 1 },
    immune: { antibody: 2, leukocyte: 1, macrophage: 1.2 },
  },
};
