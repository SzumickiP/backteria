import Phaser from 'phaser';
import { TEX, TEX_RADIUS } from '../graphics/textures';

/** Cząstka pożywienia — świecąca kropla dryfująca w płynie. */
export class Nutrient extends Phaser.GameObjects.Image {
  readonly r: number;
  readonly phase = Math.random() * Math.PI * 2;

  constructor(scene: Phaser.Scene, x: number, y: number, r: number, tint: number) {
    super(scene, x, y, TEX.blob);
    this.r = r;
    this.setTint(tint)
      .setScale(r / TEX_RADIUS.blob)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setAlpha(0.9)
      .setDepth(1);
    scene.add.existing(this);
  }
}
