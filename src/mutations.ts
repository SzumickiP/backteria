import Phaser from 'phaser';

export interface PlayerStats {
  maxHp: number;
  /** px/s */
  speed: number;
  /** obrażenia (lub tempo infekcji) na sekundę wobec celów w zasięgu */
  damage: number;
  /** zasięg ataku poza krawędzią komórki (px) */
  reach: number;
  /** regeneracja zdrowia na sekundę */
  regen: number;
  /** bakteria: koszt podziału w biomasie */
  divideCost: number;
  maxColony: number;
  allyDamage: number;
  allyMaxHp: number;
  /** bakteria: dodatkowy promień przyciągania pożywienia (px) */
  magnet: number;
  /** wirus: ile kopii uwalnia zainfekowana komórka */
  copies: number;
  /** mnożnik zasięgu, z jakiego wrogowie Cię zauważają (mniej = lepiej) */
  stealth: number;
  /** mnożnik otrzymywanych obrażeń (mniej = lepiej) */
  armor: number;
  /** atak specjalny (LPM / F): obrażenia jednego pocisku toksyn lub szarży */
  abilityDamage: number;
  /** czas odnowienia ataku specjalnego (s) */
  abilityCooldown: number;
  /** bakteria: liczba pocisków w salwie toksyn */
  shots: number;
  /** wirus: czas trwania szarży (s) */
  dashDuration: number;
}

export const BACTERIUM_STATS: PlayerStats = {
  maxHp: 85,
  speed: 230,
  damage: 24,
  reach: 14,
  regen: 0.3,
  divideCost: 20,
  maxColony: 3,
  allyDamage: 9,
  allyMaxHp: 30,
  magnet: 0,
  copies: 0,
  stealth: 1,
  armor: 1,
  abilityDamage: 14,
  abilityCooldown: 0.9,
  shots: 3,
  dashDuration: 0,
};

export const VIRUS_STATS: PlayerStats = {
  maxHp: 55,
  speed: 260,
  damage: 32,
  reach: 12,
  regen: 0.25,
  divideCost: 0,
  maxColony: 5,
  allyDamage: 7,
  allyMaxHp: 14,
  magnet: 0,
  copies: 2,
  stealth: 1,
  armor: 1,
  abilityDamage: 35,
  abilityCooldown: 2.6,
  shots: 0,
  dashDuration: 0.22,
};

export interface Mutation {
  id: string;
  name: string;
  description: string;
  apply(stats: PlayerStats): void;
}

export const BACTERIUM_MUTATIONS: Mutation[] = [
  { id: 'flagella', name: 'Wici', description: '+8% prędkości ruchu', apply: (s) => { s.speed *= 1.08; } },
  { id: 'wall', name: 'Gruba ściana komórkowa', description: '+15 maks. zdrowia', apply: (s) => { s.maxHp += 15; } },
  { id: 'toxins', name: 'Toksyny', description: '+30% zadawanych obrażeń', apply: (s) => { s.damage *= 1.3; } },
  { id: 'fimbriae', name: 'Fimbrie', description: '+6 zasięgu ataku', apply: (s) => { s.reach += 6; } },
  { id: 'biofilm', name: 'Biofilm', description: '+0,6 regeneracji zdrowia na sekundę', apply: (s) => { s.regen += 0.6; } },
  {
    id: 'mitosis',
    name: 'Szybki podział',
    description: 'Podział kosztuje 10% mniej biomasy',
    apply: (s) => { s.divideCost = Math.max(8, Math.round(s.divideCost * 0.9)); },
  },
  { id: 'quorum', name: 'Quorum sensing', description: '+1 miejsce w kolonii', apply: (s) => { s.maxColony += 1; } },
  {
    id: 'offspring',
    name: 'Agresywne potomstwo',
    description: 'Kolonia: +25% obrażeń i +10 zdrowia',
    apply: (s) => { s.allyDamage *= 1.25; s.allyMaxHp += 10; },
  },
  { id: 'chemotaxis', name: 'Chemotaksja', description: 'Przyciągasz pożywienie z +40 px', apply: (s) => { s.magnet += 40; } },
  { id: 'capsule', name: 'Otoczka śluzowa', description: '-10% otrzymywanych obrażeń', apply: (s) => { s.armor *= 0.9; } },
  {
    id: 'bacteriocins',
    name: 'Bakteriocyny',
    description: 'Salwa toksyn: +1 pocisk',
    apply: (s) => { s.shots += 1; },
  },
  {
    id: 'secretion',
    name: 'Szybkie wydzielanie',
    description: 'Salwa toksyn odnawia się o 12% szybciej',
    apply: (s) => { s.abilityCooldown *= 0.88; },
  },
];

export const VIRUS_MUTATIONS: Mutation[] = [
  { id: 'light-capsid', name: 'Lekki kapsyd', description: '+8% prędkości ruchu', apply: (s) => { s.speed *= 1.08; } },
  { id: 'envelope', name: 'Otoczka lipidowa', description: '+10 maks. zdrowia', apply: (s) => { s.maxHp += 10; } },
  { id: 'lytic', name: 'Enzymy lityczne', description: '+30% szybkości infekcji i obrażeń', apply: (s) => { s.damage *= 1.3; } },
  { id: 'spikes', name: 'Dłuższe wypustki', description: '+6 zasięgu infekcji', apply: (s) => { s.reach += 6; } },
  { id: 'replication', name: 'Szybka replikacja', description: '+1 kopia z każdej zainfekowanej komórki', apply: (s) => { s.copies += 1; } },
  { id: 'pandemic', name: 'Pandemia', description: '+2 miejsca na kopie', apply: (s) => { s.maxColony += 2; } },
  {
    id: 'virulent',
    name: 'Zjadliwe kopie',
    description: 'Kopie: +25% obrażeń i +5 zdrowia',
    apply: (s) => { s.allyDamage *= 1.25; s.allyMaxHp += 5; },
  },
  {
    id: 'antigen-drift',
    name: 'Dryf antygenowy',
    description: 'Układ odpornościowy zauważa Cię z 12% mniejszej odległości',
    apply: (s) => { s.stealth *= 0.88; },
  },
  { id: 'resistance', name: 'Ucieczka immunologiczna', description: '-10% otrzymywanych obrażeń', apply: (s) => { s.armor *= 0.9; } },
  { id: 'latency', name: 'Latencja', description: '+0,5 regeneracji zdrowia na sekundę', apply: (s) => { s.regen += 0.5; } },
  {
    id: 'penetration',
    name: 'Penetracja',
    description: 'Szarża: +25% obrażeń',
    apply: (s) => { s.abilityDamage *= 1.25; },
  },
  {
    id: 'momentum',
    name: 'Rozpęd',
    description: 'Szarża odnawia się o 15% szybciej',
    apply: (s) => { s.abilityCooldown *= 0.85; },
  },
];

export function rollMutations(list: Mutation[], count = 3): Mutation[] {
  return Phaser.Utils.Array.Shuffle([...list]).slice(0, count);
}
