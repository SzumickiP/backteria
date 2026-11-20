import Phaser from 'phaser';
import { TEX, TEX_RADIUS } from '../graphics/textures';
import { Cell } from './Cell';

/** Neutralna bakteria — ofiara wirusa. Błąka się i ucieka, gdy wirus jest blisko. */
export class Prey extends Cell {
  readonly speed = Phaser.Math.FloatBetween(60, 80);
  wander = Math.random() * Math.PI * 2;
  turnTimer = 0;

  constructor(scene: Phaser.Scene, x: number, y: number) {
    super(scene, x, y, 12, TEX.prey, TEX_RADIUS.rod, 25);
    this.setDepth(3);
    this.setRotation(this.wander);
  }
}
