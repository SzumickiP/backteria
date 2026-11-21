import type { SpeciesId } from './species';

/** Zdarzenia przesyłane między GameScene a UIScene przez game.events. */
export const GameEvents = {
  Start: 'bt-start',
  LevelUp: 'bt-levelup',
  Toast: 'bt-toast',
  GameOver: 'bt-game-over',
  MissionStart: 'bt-mission-start',
  MissionEnd: 'bt-mission-end',
  /** gracz chce przerobić komórkę — pokaż wybór budowli */
  ConvertOffer: 'bt-convert-offer',
  ConvertClose: 'bt-convert-close',
  /** gracz wszedł do innego biomu (argument: nazwa biomu) */
  BiomeChange: 'bt-biome-change',
  /** gracz chce się wylogować (obsługa w main.ts) */
  Logout: 'bt-logout',
  /** zdobyto osiągnięcie (argument: AchievementDef) */
  Achievement: 'bt-achievement',
  /** wirus podbił narząd (nazwa, ile podbitych, ile wszystkich) */
  Conquest: 'bt-conquest',
  /** wygrana: wirus podbił cały organizm (argument: GameSummary) */
  Victory: 'bt-victory',
  /** pojawiła się / dołączyła przyjazna postać (komunikat) */
  Friend: 'bt-friend',
} as const;

export type MissionType = 'defend' | 'infect' | 'nest' | 'collect' | 'outbreak' | 'multiply' | 'boss';

export interface GameSummary {
  species: SpeciesId;
  time: number;
  level: number;
  kills: number;
  missions: number;
  /** tryb „Martwy żywiciel”: zajęty ułamek ciała (0–1) */
  area?: number;
  /** co gracz zrobił w tej grze — do scenki końcowej */
  ending?: EndingInfo;
}

export interface EndingInfo {
  /** nazwa zwierzęcia (np. „Mysz”) */
  animal: string;
  hard: boolean;
  brain: boolean;
  conquered: number;
  organs: number;
  colony: number;
  structures: number;
  /** utracona kończyna (biernik, np. „łapę”) */
  limb?: string;
  /** teren rywali (tryb „Martwy żywiciel”) */
  rival?: number;
}
