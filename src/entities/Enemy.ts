import Phaser from 'phaser';
import { COLORS, DIFFICULTY } from '../config';
import { TEX, TEX_RADIUS } from '../graphics/textures';
import { Cell } from './Cell';
import type { Organ } from './Organ';

/**
 * Wrogowie bakterii: virus, germ i bakterie o specjalnościach (coccus, bacillus, spore, toxigen,
 * mycobacterium, spirochete). Wrogowie wirusa (układ odpornościowy): leukocyte, antibody, macrophage.
 */
export type EnemyKind =
  | 'virus'
  | 'germ'
  | 'coccus'
  | 'bacillus'
  | 'spore'
  | 'toxigen'
  | 'mycobacterium'
  | 'spirochete'
  | 'leukocyte'
  | 'antibody'
  | 'macrophage'
  | 'infectionNest'
  | 'lymphNode';

export interface EnemyDef {
  name: string;
  radius: number;
  hp: number;
  speed: number;
  /** obrażenia na sekundę przy kontakcie */
  dps: number;
  xp: number;
  biomass: number;
  texture: string;
  texRadius: number;
  burstColor: number;
  /** spin — wiruje; face — obraca się w kierunku ruchu */
  motion: 'spin' | 'face';
  /** z jakiej odległości zauważa gracza */
  aggro: number;
  /** od jakiego poziomu zagrożenia może się pojawić */
  minThreat: number;
  /** mnożnik otrzymywanych obrażeń */
  armor?: number;
  /** ilu pojawia się naraz (gromada) */
  group?: number;
  /** strzela toksynami z dystansu */
  shooter?: boolean;
  /** po śmierci uwalnia inne jednostki */
  onDeath?: { kind: EnemyKind; count: number };
  /** ma wici (rysowane falujące nici) */
  flagella?: { color: number; count: number };
  /** porusza się w stadzie z innymi tego samego rodzaju */
  flock?: boolean;
}

export const ENEMY_DEFS: Record<EnemyKind, EnemyDef> = {
  virus: {
    name: 'Wirus', radius: 13, hp: 25, speed: 95, dps: 12, xp: 3, biomass: 1, minThreat: 0,
    texture: TEX.virus, texRadius: TEX_RADIUS.virus, burstColor: COLORS.burstVirus, motion: 'spin', aggro: 600,
  },
  germ: {
    name: 'Zarazek', radius: 18, hp: 90, speed: 60, dps: 25, xp: 8, biomass: 4, minThreat: 1.5,
    texture: TEX.germ, texRadius: TEX_RADIUS.rod, burstColor: COLORS.burstGerm, motion: 'face', aggro: 600,
    flagella: { color: COLORS.flagellaGerm, count: 2 }, flock: true,
  },
  coccus: {
    name: 'Ziarniaki', radius: 8, hp: 14, speed: 105, dps: 6, xp: 1, biomass: 1, minThreat: 0, group: 5,
    texture: TEX.coccus, texRadius: TEX_RADIUS.coccus, burstColor: 0xc084fc, motion: 'spin', aggro: 650, flock: true,
  },
  bacillus: {
    name: 'Laseczka przetrwalnikowa', radius: 16, hp: 60, speed: 65, dps: 14, xp: 6, biomass: 3, minThreat: 1.3,
    texture: TEX.bacillus, texRadius: TEX_RADIUS.rod, burstColor: 0xe9c46a, motion: 'face', aggro: 600,
    onDeath: { kind: 'spore', count: 3 }, flagella: { color: 0xd4b483, count: 1 }, flock: true,
  },
  spore: {
    name: 'Przetrwalnik', radius: 6, hp: 8, speed: 150, dps: 5, xp: 1, biomass: 0, minThreat: 99,
    texture: TEX.spore, texRadius: TEX_RADIUS.spore, burstColor: 0xfef3c7, motion: 'spin', aggro: 700, flock: true,
  },
  toxigen: {
    name: 'Pałeczka toksynotwórcza', radius: 15, hp: 50, speed: 70, dps: 10, xp: 7, biomass: 3, minThreat: 1.5,
    texture: TEX.toxigen, texRadius: TEX_RADIUS.rod, burstColor: 0x84cc16, motion: 'face', aggro: 650, shooter: true,
    flagella: { color: 0x9bbf5a, count: 2 }, flock: true,
  },
  mycobacterium: {
    name: 'Prątek', radius: 20, hp: 200, speed: 40, dps: 22, xp: 12, biomass: 5, minThreat: 2, armor: 0.5,
    texture: TEX.mycobacterium, texRadius: TEX_RADIUS.rod, burstColor: 0xd6d3d1, motion: 'face', aggro: 550, flock: true,
  },
  spirochete: {
    name: 'Krętek', radius: 11, hp: 28, speed: 175, dps: 11, xp: 5, biomass: 2, minThreat: 1.2,
    texture: TEX.spirochete, texRadius: TEX_RADIUS.spirochete, burstColor: 0x67e8f9, motion: 'face', aggro: 750, flock: true,
  },
  leukocyte: {
    name: 'Biała krwinka', radius: 28, hp: 160, speed: 62, dps: 28, xp: 12, biomass: 0, minThreat: 0,
    texture: TEX.leukocyte, texRadius: TEX_RADIUS.leukocyte, burstColor: COLORS.burstLeukocyte, motion: 'spin', aggro: 600,
  },
  antibody: {
    name: 'Przeciwciała', radius: 8, hp: 12, speed: 150, dps: 7, xp: 2, biomass: 0, minThreat: 0, group: 3,
    texture: TEX.antibody, texRadius: TEX_RADIUS.antibody, burstColor: COLORS.burstAntibody, motion: 'face', aggro: 750, flock: true,
  },
  macrophage: {
    name: 'Makrofag', radius: 42, hp: 340, speed: 42, dps: 40, xp: 25, biomass: 0, minThreat: 2,
    texture: TEX.macrophage, texRadius: TEX_RADIUS.leukocyte, burstColor: 0xa5b4fc, motion: 'spin', aggro: 500,
  },
  // Gniazda z misji — nieruchome, wypuszczają wrogów, trzeba je zniszczyć (nigdy nie pojawiają się losowo).
  infectionNest: {
    name: 'Ognisko infekcji', radius: 46, hp: 380, speed: 0, dps: 18, xp: 30, biomass: 10, minThreat: 99,
    texture: TEX.virus, texRadius: TEX_RADIUS.virus, burstColor: COLORS.burstVirus, motion: 'spin', aggro: 0,
  },
  lymphNode: {
    name: 'Węzeł chłonny', radius: 50, hp: 420, speed: 0, dps: 22, xp: 35, biomass: 0, minThreat: 99,
    texture: TEX.organ, texRadius: TEX_RADIUS.organ, burstColor: 0xa5b4fc, motion: 'spin', aggro: 0,
  },
};

export class Enemy extends Cell {
  readonly kind: EnemyKind;
  readonly def: EnemyDef;
  readonly speed: number;
  readonly dps: number;
  readonly xp: number;
  readonly biomass: number;
  readonly burstColor: number;
  readonly motion: 'spin' | 'face';
  readonly aggro: number;
  readonly phase = Math.random() * Math.PI * 2;
  /** odliczanie do strzału (pałeczka toksynotwórcza) */
  fireTimer = Phaser.Math.FloatBetween(0.5, 1.5);
  /** jak długo goni ofiarę bez dosięgnięcia jej (s) */
  chaseTime = 0;
  /** do kiedy (czas gry) wróg „odpuścił” i odpływa */
  giveUpUntil = 0;
  /** zadanie „obroń narząd”: ten wróg atakuje narząd */
  missionTarget?: Organ;
  /** zadanie: ten wróg pilnuje narządu / gniazda */
  guardOf?: Cell;

  /** Statystyki rosną wraz z poziomem zagrożenia. */
  constructor(scene: Phaser.Scene, x: number, y: number, kind: EnemyKind, threat: number) {
    const d = ENEMY_DEFS[kind];
    const t = Math.max(0, threat - 1);
    super(scene, x, y, d.radius, d.texture, d.texRadius, Math.round(d.hp * (1 + DIFFICULTY.hpPerThreat * t)));
    this.kind = kind;
    this.def = d;
    this.speed = d.speed * (1 + DIFFICULTY.speedPerThreat * t);
    this.dps = d.dps * (1 + DIFFICULTY.dpsPerThreat * t);
    this.xp = d.xp;
    this.biomass = d.biomass;
    this.burstColor = d.burstColor;
    this.motion = d.motion;
    this.aggro = d.aggro;
    this.armorMul = d.armor ?? 1;
    this.setDepth(d.radius > 25 ? 3.5 : 3);
    this.setRotation(Math.random() * Math.PI * 2);
  }
}
