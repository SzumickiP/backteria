import Phaser from 'phaser';
import { getAccount } from '../account/accounts';
import { audio, SOUND_MODE_NAMES } from '../audio/AudioEngine';
import { CHUNK } from '../config';
import { GameEvents } from '../events';
import { TEX, createTextures } from '../graphics/textures';
import { SPECIES, type SpeciesId } from '../species';

const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';
const ORDER: SpeciesId[] = ['bacterium', 'virus'];

/** Ekran startowy: wybór postaci. */
export class MenuScene extends Phaser.Scene {
  private previews: Phaser.GameObjects.Image[] = [];

  constructor() {
    super('MenuScene');
  }

  create(): void {
    createTextures(this);
    this.previews = [];
    const { width, height } = this.scale;

    this.add.tileSprite(0, 0, width, height, TEX.tissue).setOrigin(0).setTileScale(CHUNK.scale / 1.5);
    this.add.rectangle(0, 0, width, height, 0x0d0408, 0.45).setOrigin(0);

    this.add
      .text(width / 2, height * 0.14, 'Backteria', { fontFamily: FONT, fontSize: '56px', fontStyle: 'bold', color: '#f5e9ee', stroke: '#1c0a10', strokeThickness: 8 })
      .setOrigin(0.5);
    this.add
      .text(width / 2, height * 0.14 + 52, 'Wybierz, kim chcesz zagrać', { fontFamily: FONT, fontSize: '18px', color: '#c29aa8' })
      .setOrigin(0.5);

    const narrow = width < 640;
    const cardW = narrow ? Math.min(340, width - 32) : 300;
    const cardH = narrow ? 250 : 330;
    const gap = 24;
    const top = height * 0.14 + 100;

    ORDER.forEach((id, i) => {
      const sp = SPECIES[id];
      const x = narrow ? (width - cardW) / 2 : width / 2 - cardW - gap / 2 + i * (cardW + gap);
      const y = narrow ? top + i * (cardH + 16) : top;

      const card = this.add
        .rectangle(x, y, cardW, cardH, 0x2a1019, 0.9)
        .setOrigin(0)
        .setStrokeStyle(2, 0x7a3a52)
        .setInteractive({ useHandCursor: true });
      card.on('pointerover', () => card.setStrokeStyle(3, 0x6ee7b7));
      card.on('pointerout', () => card.setStrokeStyle(2, 0x7a3a52));
      card.on('pointerdown', () => this.pick(id));

      const imgY = y + (narrow ? 50 : 80);
      const img = this.add.image(x + cardW / 2, imgY, sp.texture).setScale(sp.rod ? 0.9 : 1.1);
      this.previews.push(img);

      this.add
        .text(x + cardW / 2, y + (narrow ? 100 : 150), `${i + 1}. ${sp.name}`, { fontFamily: FONT, fontSize: '24px', fontStyle: 'bold', color: '#6ee7b7' })
        .setOrigin(0.5);
      this.add
        .text(x + cardW / 2, y + (narrow ? 130 : 185), sp.description, {
          fontFamily: FONT,
          fontSize: '15px',
          color: '#f5e9ee',
          align: 'center',
          lineSpacing: 4,
          wordWrap: { width: cardW - 24 },
        })
        .setOrigin(0.5, 0);
    });

    this.add
      .text(width / 2, height - 24, 'Kliknij kartę lub naciśnij 1 / 2', { fontFamily: FONT, fontSize: '14px', color: '#c29aa8' })
      .setOrigin(0.5, 1);

    // Konto: kto gra, rekordy, wylogowanie.
    const nick = this.registry.get('account') as string | undefined;
    const acc = nick ? getAccount(nick) : undefined;
    if (acc) {
      this.add
        .text(width - 16, 16, `Gracz: ${acc.nick}  ·  rozegrane gry: ${acc.games}`, { fontFamily: FONT, fontSize: '14px', color: '#f5e9ee' })
        .setOrigin(1, 0);
      const out = this.add
        .text(width - 16, 40, 'Wyloguj', { fontFamily: FONT, fontSize: '14px', color: '#6ee7b7' })
        .setOrigin(1, 0)
        .setInteractive({ useHandCursor: true });
      out.on('pointerdown', () => this.game.events.emit(GameEvents.Logout));

      ORDER.forEach((id, i) => {
        const best = acc.best[id];
        const x = narrow ? width / 2 : width / 2 - cardW - gap / 2 + i * (cardW + gap) + cardW / 2;
        const y = narrow ? top + i * (cardH + 16) + cardH - 22 : top + cardH - 26;
        const t = best
          ? `Rekord: ${Math.floor(best.time / 60)}:${String(Math.floor(best.time % 60)).padStart(2, '0')} · poziom ${best.level}`
          : 'Rekord: —';
        this.add.text(x, y, t, { fontFamily: FONT, fontSize: '13px', color: '#fde68a' }).setOrigin(0.5, 0);
      });
    }

    // Dźwięk: muzyka menu + przełącznik trybu (N).
    audio.playMusic('menu');
    audio.setTheme('menu');
    audio.setIntensity(0);
    const soundText = this.add
      .text(16, height - 24, '', { fontFamily: FONT, fontSize: '13px', color: '#c29aa8' })
      .setOrigin(0, 1)
      .setInteractive({ useHandCursor: true });
    const showSound = () => soundText.setText(`Dźwięk: ${SOUND_MODE_NAMES[audio.mode]}  [N]`);
    const cycleSound = () => {
      audio.cycleMode();
      audio.sfx('click');
      showSound();
    };
    soundText.on('pointerdown', cycleSound);
    showSound();

    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Digit1' || e.code === 'Numpad1') this.pick('bacterium');
      if (e.code === 'Digit2' || e.code === 'Numpad2') this.pick('virus');
      if (e.code === 'KeyN') cycleSound();
    };
    this.input.keyboard!.on('keydown', onKey);
    const onResize = () => this.scene.restart();
    this.scale.on('resize', onResize);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.input.keyboard?.off('keydown', onKey);
      this.scale.off('resize', onResize);
    });
  }

  update(time: number): void {
    this.previews.forEach((img, i) => {
      img.rotation = i === 0 ? Math.sin(time / 900) * 0.3 - Math.PI / 2 : time / 2000;
    });
  }

  private pick(id: SpeciesId): void {
    audio.sfx('select');
    this.scene.start('GameScene', { species: id });
  }
}
