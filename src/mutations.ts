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
  maxHp: 100,
  speed: 230,
  damage: 22,
  reach: 8,
  regen: 0.5,
  divideCost: 15,
  maxColony: 3,
  allyDamage: 12,
  allyMaxHp: 40,
  magnet: 0,
  copies: 0,
  stealth: 1,
  armor: 1,
  abilityDamage: 18,
  abilityCooldown: 0.7,
  shots: 3,
  dashDuration: 0,
};

export const VIRUS_STATS: PlayerStats = {
  maxHp: 65,
  speed: 260,
  damage: 30,
  reach: 6,
  regen: 0.4,
  divideCost: 0,
  maxColony: 6,
  allyDamage: 9,
  allyMaxHp: 18,
  magnet: 0,
  copies: 2,
  stealth: 1,
  armor: 1,
  abilityDamage: 45,
  abilityCooldown: 2,
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
  { id: 'flagella', name: 'Wici', description: '+15% prędkości ruchu', apply: (s) => { s.speed *= 1.15; } },
  { id: 'wall', name: 'Gruba ściana komórkowa', description: '+30 maks. zdrowia', apply: (s) => { s.maxHp += 30; } },
  { id: 'toxins', name: 'Toksyny', description: '+40% zadawanych obrażeń', apply: (s) => { s.damage *= 1.4; } },
  { id: 'fimbriae', name: 'Fimbrie', description: '+8 zasięgu ataku', apply: (s) => { s.reach += 8; } },
  { id: 'biofilm', name: 'Biofilm', description: '+1,5 regeneracji zdrowia na sekundę', apply: (s) => { s.regen += 1.5; } },
  {
    id: 'mitosis',
    name: 'Szybki podział',
    description: 'Podział kosztuje 20% mniej biomasy',
    apply: (s) => { s.divideCost = Math.max(5, Math.round(s.divideCost * 0.8)); },
  },
  { id: 'quorum', name: 'Quorum sensing', description: '+2 miejsca w kolonii', apply: (s) => { s.maxColony += 2; } },
  {
    id: 'offspring',
    name: 'Agresywne potomstwo',
    description: 'Kolonia: +50% obrażeń i +20 zdrowia',
    apply: (s) => { s.allyDamage *= 1.5; s.allyMaxHp += 20; },
  },
  { id: 'chemotaxis', name: 'Chemotaksja', description: 'Przyciągasz pożywienie z daleka', apply: (s) => { s.magnet += 70; } },
  { id: 'capsule', name: 'Otoczka śluzowa', description: '-20% otrzymywanych obrażeń', apply: (s) => { s.armor *= 0.8; } },
  {
    id: 'bacteriocins',
    name: 'Bakteriocyny',
    description: 'Salwa toksyn: +1 pocisk i +20% obrażeń',
    apply: (s) => { s.shots += 1; s.abilityDamage *= 1.2; },
  },
  {
    id: 'secretion',
    name: 'Szybkie wydzielanie',
    description: 'Salwa toksyn odnawia się o 25% szybciej',
    apply: (s) => { s.abilityCooldown *= 0.75; },
  },
];

export const VIRUS_MUTATIONS: Mutation[] = [
  { id: 'light-capsid', name: 'Lekki kapsyd', description: '+15% prędkości ruchu', apply: (s) => { s.speed *= 1.15; } },
  { id: 'envelope', name: 'Otoczka lipidowa', description: '+20 maks. zdrowia', apply: (s) => { s.maxHp += 20; } },
  { id: 'lytic', name: 'Enzymy lityczne', description: '+40% szybkości infekcji i obrażeń', apply: (s) => { s.damage *= 1.4; } },
  { id: 'spikes', name: 'Dłuższe wypustki', description: '+8 zasięgu infekcji', apply: (s) => { s.reach += 8; } },
  { id: 'replication', name: 'Szybka replikacja', description: '+1 kopia z każdej zainfekowanej komórki', apply: (s) => { s.copies += 1; } },
  { id: 'pandemic', name: 'Pandemia', description: '+3 miejsca na kopie', apply: (s) => { s.maxColony += 3; } },
  {
    id: 'virulent',
    name: 'Zjadliwe kopie',
    description: 'Kopie: +50% obrażeń i +10 zdrowia',
    apply: (s) => { s.allyDamage *= 1.5; s.allyMaxHp += 10; },
  },
  {
    id: 'antigen-drift',
    name: 'Dryf antygenowy',
    description: 'Układ odpornościowy zauważa Cię z 25% mniejszej odległości',
    apply: (s) => { s.stealth *= 0.75; },
  },
  { id: 'resistance', name: 'Ucieczka immunologiczna', description: '-20% otrzymywanych obrażeń', apply: (s) => { s.armor *= 0.8; } },
  { id: 'latency', name: 'Latencja', description: '+1 regeneracji zdrowia na sekundę', apply: (s) => { s.regen += 1; } },
  {
    id: 'penetration',
    name: 'Penetracja',
    description: 'Szarża: +50% obrażeń',
    apply: (s) => { s.abilityDamage *= 1.5; },
  },
  {
    id: 'momentum',
    name: 'Rozpęd',
    description: 'Szarża odnawia się o 30% szybciej',
    apply: (s) => { s.abilityCooldown *= 0.7; },
  },
];

export function rollMutations(list: Mutation[], count = 3): Mutation[] {
  return Phaser.Utils.Array.Shuffle([...list]).slice(0, count);
}
