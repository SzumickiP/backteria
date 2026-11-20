import Phaser from 'phaser';
import { COLORS } from '../config';
import { TEX, TEX_RADIUS } from '../graphics/textures';
import { Cell } from './Cell';

/** Komórka gospodarza: duża (narząd w zadaniach) lub mała (ofiara wirusa). */
export class Organ extends Cell {
  constructor(scene: Phaser.Scene, x: number, y: number, radius = 48, maxHp = 250) {
    super(scene, x, y, radius, TEX.organ, TEX_RADIUS.organ, maxHp);
    this.setDepth(2);
  }

  destroyOrgan(): void {
    this.hp = 0;
    this.setTint(COLORS.organDeadTint);
    this.setAlpha(0.7);
  }

  heal(amount: number): void {
    if (!this.isAlive) return;
    this.hp = Math.min(this.maxHp, this.hp + amount);
  }
}
