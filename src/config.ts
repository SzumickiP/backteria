/** Tło to powtarzalny „kafel” tkanki: tekstura texW×texH px wyświetlana w skali `scale`. */
export const CHUNK = { texW: 800, texH: 520, scale: 3 } as const;

/** Promień wokół gracza, w którym utrzymujemy obiekty (pożywienie, ofiary, krwinki). */
export const ACTIVE_RADIUS = 1500;
/** Obiekty dalej niż to od gracza są usuwane. */
export const DESPAWN_RADIUS = 1800;
/** Wrogowie dalej niż to od gracza (i niezwiązani z zadaniem) są usuwani. */
export const ENEMY_DESPAWN_RADIUS = 2300;

export const NUTRIENT_TARGET = 100;
export const HOST_CELL_TARGET = 32;
export const PREY_BACTERIA_TARGET = 14;
export const RBC_TARGET = 26;

/** Co ile sekund zagrożenie rośnie o 1. */
export const THREAT_PERIOD = 22;
export const FIRST_MISSION_AT = 20;
export const MISSION_COOLDOWN = 40;

/** Białka obronne wystrzeliwane przez narządy z zadań. */
export const PROTEIN = {
  range: 400,
  speed: 280,
  life: 2.4,
  /** narząd broni się przed patogenami (tryb bakterii) */
  defend: { interval: 0.6, damage: 18 },
  /** narząd broni się przed wirusem i jego kopiami (tryb wirusa) */
  infect: { interval: 1.0, damage: 7 },
} as const;

/** Przerabianie komórek ciała na budowle (klawisz E). */
export const CONVERT = { cooldown: 40, range: 90, maxStructures: 2, hp: 100, radius: 28 } as const;

export const STRUCTURES = {
  turret: { name: 'Wieżyczka', description: 'Strzela białkami we wrogów w pobliżu', tint: 0x9be8c8, interval: 1.1, range: 340, damage: 9 },
  factory: { name: 'Fabryka', description: 'Co 14 s tworzy nową komórkę kolonii', tint: 0xfde68a, interval: 14 },
  nest: { name: 'Gniazdo', description: 'Leczy Ciebie i kolonię w pobliżu', tint: 0xf0abfc, range: 150, heal: 3 },
} as const;

/** Punkty DNA na budowę komórki (edytor, klawisz V): 1 punkt co `everyLevels` poziomów + za zadania. */
export const DNA = { everyLevels: 2, perMission: 1 } as const;

/** Maskowanie: przez chwilę wrogowie nie widzą gracza. */
export const CLOAK = { duration: 4, cooldown: 18 } as const;

/** Strefa zarażona (losowy start): promień i ułatwienia. */
export const START_ZONE = {
  radius: 1500,
  /** ile razy rzadziej pojawiają się wrogowie, gdy gracz jest w strefie */
  spawnSlowdown: 3,
  /** ile razy więcej pożywienia / komórek w strefie */
  bounty: 1.5,
} as const;

/** Wrogowie odpuszczają pościg i nadmiar wrogów jest usuwany. */
export const GIVE_UP = {
  /** po ilu sekundach pościgu bez dosięgnięcia ofiary wróg odpuszcza */
  after: 12,
  /** jak długo odpuszcza (s) */
  duration: 8,
  /** odpuszczający wróg znika, gdy oddali się na tyle od gracza (px) */
  despawnAt: 1100,
  /** nadmiarowi wrogowie dalej niż tyle od gracza (poza ekranem) są usuwani */
  excessFar: 900,
} as const;

/** Rozwój gracza: krzywa doświadczenia i nagrody. */
export const PROGRESSION = {
  xpBase: 10,
  xpPerLevel: 8,
  /** leczenie przy wyborze mutacji (ułamek maks. zdrowia) */
  levelUpHeal: 0.1,
  missionXpBase: 15,
  missionXpPerThreat: 4,
  /** leczenie za obronę narządu */
  missionHeal: 0.15,
  missionBiomass: 12,
} as const;

/** Trudność: tempo i siła wrogów. */
export const DIFFICULTY = {
  /** maks. wrogów naraz: base + perThreat × zagrożenie (do cap) */
  maxAliveBase: 8,
  maxAlivePerThreat: 4,
  maxAliveCap: 70,
  /** odstęp między pojawieniami (s): max(min, start - perThreat × zagrożenie) */
  spawnStart: 1.8,
  spawnPerThreat: 0.12,
  spawnMin: 0.3,
  /** wzrost statystyk wroga na poziom zagrożenia */
  hpPerThreat: 0.18,
  dpsPerThreat: 0.08,
  speedPerThreat: 0.02,
} as const;

/** Atak specjalny bakterii: salwa toksyn. */
export const TOXIN = { speed: 540, life: 0.85, spread: 0.16 } as const;

/** Atak specjalny wirusa: szarża (krótki, szybki zryw z nietykalnością). */
export const DASH = { duration: 0.22, speedMul: 3.6 } as const;

export const COLORS = {
  toxin: 0xbef264,
  dashTrail: 0x5eead4,
  bg: 0x1c0a10,
  hurt: 0xff8a8a,
  hitFlash: 0xffc4c4,
  infectTint: 0xc4a5f5,
  infectedOrgan: 0x9f7aea,
  playerAura: 0x4fd1a1,
  flagellaPlayer: 0x9ef0cb,
  flagellaAlly: 0xc4f5d6,
  flagellaGerm: 0xe8a060,
  flagellaPrey: 0xa8c4f0,
  organBar: 0xdb2777,
  allyBar: 0x22c55e,
  enemyBar: 0xef4444,
  infectBar: 0xa78bfa,
  burstPlayer: 0x6ee7b7,
  burstAlly: 0x86efac,
  burstVirus: 0xfacc15,
  burstGerm: 0xf97316,
  burstLeukocyte: 0xede9fe,
  burstAntibody: 0x93c5fd,
  burstOrgan: 0xf9a8d4,
  burstPrey: 0x93b4f0,
  burstCopy: 0x5eead4,
  organDeadTint: 0x707070,
  mote: 0xffc9d6,
  /** Zimne barwy — żeby nie myliły się z żółtymi wirusami. */
  nutrients: [0xa5f3fc, 0xe9d5ff, 0xc7f9e0],
} as const;
