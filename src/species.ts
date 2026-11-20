import { TEX, TEX_RADIUS } from './graphics/textures';
import { BACTERIUM_MUTATIONS, BACTERIUM_STATS, VIRUS_MUTATIONS, VIRUS_STATS, type Mutation, type PlayerStats } from './mutations';

export type SpeciesId = 'bacterium' | 'virus';

export interface SpeciesDef {
  id: SpeciesId;
  name: string;
  description: string[];
  texture: string;
  texRadius: number;
  baseRadius: number;
  maxRadius: number;
  growthPerLevel: number;
  allyTexture: string;
  allyRadius: number;
  /** pałeczka (obraca się w kierunku ruchu, ma wici) czy kulisty wirion (wiruje) */
  rod: boolean;
  stats: PlayerStats;
  mutations: Mutation[];
  colonyLabel: string;
  deathText: string;
  /** nazwa ataku specjalnego (LPM / F) */
  abilityName: string;
}

export const SPECIES: Record<SpeciesId, SpeciesDef> = {
  bacterium: {
    id: 'bacterium',
    name: 'Bakteria',
    description: [
      'Jedz cząstki pożywienia i rośnij.',
      'Dziel się, tworząc kolonię.',
      'Strzelaj toksynami (LPM / F).',
      'Broń narządów przed wirusami i zarazkami.',
    ],
    texture: TEX.player,
    texRadius: TEX_RADIUS.rod,
    baseRadius: 16,
    maxRadius: 42,
    growthPerLevel: 1.3,
    allyTexture: TEX.ally,
    allyRadius: 9,
    rod: true,
    stats: BACTERIUM_STATS,
    mutations: BACTERIUM_MUTATIONS,
    colonyLabel: 'Kolonia',
    deathText: 'Twoja bakteria zginęła',
    abilityName: 'Toksyny',
  },
  virus: {
    id: 'virus',
    name: 'Wirus',
    description: [
      'Zarażaj komórki i bakterie —',
      'z każdej wychodzą Twoje kopie.',
      'Szarżuj na wrogów (LPM / F).',
      'Unikaj białych krwinek i przeciwciał.',
    ],
    texture: TEX.playerVirus,
    texRadius: TEX_RADIUS.virus,
    baseRadius: 13,
    maxRadius: 30,
    growthPerLevel: 0.8,
    allyTexture: TEX.playerVirus,
    allyRadius: 7,
    rod: false,
    stats: VIRUS_STATS,
    mutations: VIRUS_MUTATIONS,
    colonyLabel: 'Kopie',
    deathText: 'Twój wirus został zniszczony',
    abilityName: 'Szarża',
  },
};
