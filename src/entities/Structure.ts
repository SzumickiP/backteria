import Phaser from 'phaser';
import { CONVERT, STRUCTURES } from '../config';
import { TEX, TEX_RADIUS } from '../graphics/textures';
import { Cell } from './Cell';

export type StructureKind = keyof typeof STRUCTURES;

/** Komórka ciała przerobiona przez gracza na budowlę (wieżyczka, fabryka, gniazdo). */
export class Structure extends Cell {
  readonly kind: StructureKind;
  /** odliczanie do następnej akcji (strzał / nowa komórka) */
  timer = 0;
  private readonly label: Phaser.GameObjects.Text;

  constructor(scene: Phaser.Scene, x: number, y: number, kind: StructureKind) {
    super(scene, x, y, CONVERT.radius, TEX.organ, TEX_RADIUS.organ, CONVERT.hp);
    this.kind = kind;
    this.baseTint = STRUCTURES[kind].tint;
    this.resetTint();
    this.setDepth(2.2);
    this.label = scene.add
      .text(x, y - CONVERT.radius - 24, STRUCTURES[kind].name, {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '12px',
        color: '#ffffff',
        stroke: '#1c0a10',
        strokeThickness: 3,
      })
      .setOrigin(0.5)
      .setDepth(10);
  }

  override destroy(fromScene?: boolean): void {
    this.label?.destroy();
    super.destroy(fromScene);
  }
}
