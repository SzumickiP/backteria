import Phaser from 'phaser';
import { ACHIEVEMENTS, achievementCount } from '../account/achievements';
import { getAccount, listAccounts } from '../account/accounts';
import { audio, SOUND_MODE_NAMES } from '../audio/AudioEngine';
import { CHUNK, GAME_MODES, GAME_MODE_ORDER, type GameModeId } from '../config';
import { isKey, keyLabel } from '../settings';
import { ANIMALS, ANIMAL_ORDER, type AnimalId } from '../world/animal';
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
      .text(width / 2, height * 0.14 + 46, 'Wybierz zwierzę (mapę) i to, kim chcesz zagrać', { fontFamily: FONT, fontSize: '18px', color: '#c29aa8' })
      .setOrigin(0.5);

    // Wybór zwierzęcia — świat gry to jego wnętrze (układy narządów).
    this.animal = loadAnimal();
    const animY = height * 0.14 + 84;
    const animDesc = this.add.text(width / 2, animY + 24, '', { fontFamily: FONT, fontSize: '13px', color: '#c29aa8', align: 'center', wordWrap: { width: Math.min(width - 32, 640) } }).setOrigin(0.5, 0);
    const animBtns = ANIMAL_ORDER.map((id, i) => {
      const b = this.add
        .text(width / 2 + (i - (ANIMAL_ORDER.length - 1) / 2) * 120, animY, ANIMALS[id].name, { fontFamily: FONT, fontSize: '16px', padding: { x: 14, y: 5 } })
        .setOrigin(0.5)
        .setInteractive({ useHandCursor: true });
      b.on('pointerdown', () => {
        this.animal = id;
        saveAnimal(id);
        audio.sfx('click');
        refreshAnimals();
      });
      return { id, b };
    });
    const refreshAnimals = () => {
      for (const { id, b } of animBtns) {
        const on = id === this.animal;
        b.setColor(on ? '#1c0a10' : '#f5e9ee').setBackgroundColor(on ? '#6ee7b7' : '#2a1019');
      }
      animDesc.setText(`${ANIMALS[this.animal].inside}: ${ANIMALS[this.animal].description}`);
    };
    refreshAnimals();

    // Tryb rozgrywki: tempo narastania zagrożenia i liczba wrogów.
    this.mode = loadMode();
    const modeY = animY + 62;
    const modeDesc = this.add.text(width / 2, modeY + 24, '', { fontFamily: FONT, fontSize: '13px', color: '#c29aa8', align: 'center', wordWrap: { width: Math.min(width - 32, 640) } }).setOrigin(0.5, 0);
    const modeBtns = GAME_MODE_ORDER.map((id, i) => {
      const b = this.add
        .text(width / 2 + (i - 1) * 120, modeY, GAME_MODES[id].name, { fontFamily: FONT, fontSize: '16px', padding: { x: 14, y: 5 } })
        .setOrigin(0.5)
        .setInteractive({ useHandCursor: true });
      b.on('pointerdown', () => {
        this.mode = id;
        saveMode(id);
        audio.sfx('click');
        refreshModes();
      });
      return { id, b };
    });
    const refreshModes = () => {
      for (const { id, b } of modeBtns) {
        const on = id === this.mode;
        b.setColor(on ? '#1c0a10' : '#f5e9ee').setBackgroundColor(on ? '#fde68a' : '#2a1019');
      }
      modeDesc.setText(`Tryb: ${GAME_MODES[this.mode].description}`);
    };
    refreshModes();

    const narrow = width < 640;
    const cardW = narrow ? Math.min(340, width - 32) : 300;
    const cardH = narrow ? 250 : 300;
    const gap = 24;
    const top = height * 0.14 + 198;

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
    const showSound = () => soundText.setText(`Dźwięk: ${SOUND_MODE_NAMES[audio.mode]}  [${keyLabel('sound')}]`);
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
      if (isKey('sound', e.code)) cycleSound();
    };

    // Ustawienia (sterowanie, mysz, dźwięk) — menu czeka zatrzymane.
    const settingsBtn = this.add
      .text(16, 16, '⚙ Ustawienia', { fontFamily: FONT, fontSize: '15px', color: '#f5e9ee', backgroundColor: '#2a1019', padding: { x: 10, y: 6 } })
      .setInteractive({ useHandCursor: true });
    settingsBtn.on('pointerdown', () => {
      audio.sfx('click');
      this.scene.launch('SettingsScene', { from: 'menu' });
      this.scene.bringToTop('SettingsScene');
      this.scene.pause();
    });
    this.events.on(Phaser.Scenes.Events.RESUME, showSound);

    // Osiągnięcia gracza.
    if (nick) {
      const achBtn = this.add
        .text(16, 52, `🏆 Osiągnięcia ${achievementCount(nick)}/${ACHIEVEMENTS.length}`, {
          fontFamily: FONT, fontSize: '15px', color: '#fde68a', backgroundColor: '#2a1019', padding: { x: 10, y: 6 },
        })
        .setInteractive({ useHandCursor: true });
      achBtn.on('pointerdown', () => {
        audio.sfx('click');
        this.showAchievements(nick);
      });
    }
    // Tabela wyników / postępu wszystkich kont na tym urządzeniu.
    const scoreBtn = this.add
      .text(16, 88, '📊 Tabela wyników', {
        fontFamily: FONT, fontSize: '15px', color: '#93c5fd', backgroundColor: '#2a1019', padding: { x: 10, y: 6 },
      })
      .setInteractive({ useHandCursor: true });
    scoreBtn.on('pointerdown', () => {
      audio.sfx('click');
      this.showScores(nick);
    });
    this.input.keyboard!.on('keydown', onKey);
    const onResize = () => this.scene.restart();
    this.scale.on('resize', onResize);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.events.off(Phaser.Scenes.Events.RESUME, showSound);
      this.input.keyboard?.off('keydown', onKey);
      this.scale.off('resize', onResize);
    });
  }

  update(time: number): void {
    this.previews.forEach((img, i) => {
      img.rotation = i === 0 ? Math.sin(time / 900) * 0.3 - Math.PI / 2 : time / 2000;
    });
  }

  private achPanel?: Phaser.GameObjects.Container;

  /** Lista wszystkich osiągnięć: zdobyte (złote) i do zdobycia (szare). */
  private showAchievements(nick: string): void {
    this.achPanel?.destroy();
    const { width, height } = this.scale;
    const got = getAccount(nick)?.achievements ?? {};
    const c = this.add.container(0, 0).setDepth(100);
    c.add(this.add.rectangle(0, 0, width, height, 0x0d0408, 0.93).setOrigin(0).setInteractive());
    c.add(
      this.add
        .text(width / 2, 18, `Osiągnięcia — ${achievementCount(nick)} / ${ACHIEVEMENTS.length}`, { fontFamily: FONT, fontSize: '26px', fontStyle: 'bold', color: '#fde68a' })
        .setOrigin(0.5, 0),
    );
    const cols = width < 760 ? 1 : width < 1150 ? 2 : 3;
    const colW = Math.min(420, (width - 48 - 16 * (cols - 1)) / cols);
    const rowH = 66;
    const x0 = (width - colW * cols - 16 * (cols - 1)) / 2;
    const top = 66;
    const viewH = height - top - 60;
    // Lista w osobnym kontenerze z maską — przewijana kółkiem lub przeciąganiem, nic nie wychodzi poza ramkę.
    const list = this.add.container(0, top);
    ACHIEVEMENTS.forEach((a, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const x = x0 + col * (colW + 16);
      const y = row * rowH;
      const done = Boolean(got[a.id]);
      list.add(this.add.rectangle(x, y, colW, rowH - 6, done ? 0x2a1a0c : 0x1c1015, 0.95).setOrigin(0).setStrokeStyle(1, done ? 0xfbbf24 : 0x3a2a30));
      list.add(
        this.add.text(x + 10, y + 5, `${done ? '🏆' : '🔒'} ${a.name}`, {
          fontFamily: FONT, fontSize: '14px', fontStyle: 'bold', color: done ? '#fde68a' : '#8a7a80', wordWrap: { width: colW - 20 },
        }),
      );
      list.add(
        this.add.text(x + 10, y + 24, a.description, {
          fontFamily: FONT, fontSize: '12px', color: done ? '#f5e9ee' : '#8a7a80', wordWrap: { width: colW - 20 }, lineSpacing: 2,
        }),
      );
    });
    c.add(list);
    const maskG = this.make.graphics({}, false);
    maskG.fillStyle(0xffffff).fillRect(0, top - 2, width, viewH + 4);
    list.setMask(maskG.createGeometryMask());
    const contentH = Math.ceil(ACHIEVEMENTS.length / cols) * rowH;
    const minY = Math.min(top, top + viewH - contentH);
    const scrollTo = (y: number) => {
      list.y = Phaser.Math.Clamp(y, minY, top);
    };
    const onWheel = (_p: unknown, _o: unknown, _dx: number, dy: number) => scrollTo(list.y - dy * 0.6);
    let dragY: number | undefined;
    const onDown = (p: Phaser.Input.Pointer) => (dragY = p.y);
    const onMove = (p: Phaser.Input.Pointer) => {
      if (dragY === undefined || !p.isDown) return (dragY = undefined);
      scrollTo(list.y + (p.y - dragY));
      dragY = p.y;
    };
    this.input.on('wheel', onWheel);
    this.input.on('pointerdown', onDown);
    this.input.on('pointermove', onMove);
    c.once(Phaser.GameObjects.Events.DESTROY, () => {
      this.input.off('wheel', onWheel);
      this.input.off('pointerdown', onDown);
      this.input.off('pointermove', onMove);
      maskG.destroy();
    });
    if (contentH > viewH) {
      c.add(
        this.add
          .text(width - 16, height - 20, 'przewiń kółkiem ↕', { fontFamily: FONT, fontSize: '12px', color: '#c29aa8' })
          .setOrigin(1, 1),
      );
    }
    const close = this.add
      .text(width / 2, height - 20, 'Zamknij', { fontFamily: FONT, fontSize: '16px', color: '#1c0a10', backgroundColor: '#6ee7b7', padding: { x: 14, y: 6 } })
      .setOrigin(0.5, 1)
      .setInteractive({ useHandCursor: true });
    close.on('pointerdown', () => {
      audio.sfx('click');
      this.achPanel?.destroy();
      this.achPanel = undefined;
    });
    c.add(close);
    this.achPanel = c;
  }

  /** Tabela wyników: wszystkie konta z tego urządzenia, posortowane po najlepszym czasie przetrwania. */
  private showScores(me?: string): void {
    this.achPanel?.destroy();
    const { width, height } = this.scale;
    const c = this.add.container(0, 0).setDepth(100);
    c.add(this.add.rectangle(0, 0, width, height, 0x0d0408, 0.93).setOrigin(0).setInteractive());
    c.add(
      this.add
        .text(width / 2, 18, 'Tabela wyników i postępu', { fontFamily: FONT, fontSize: '26px', fontStyle: 'bold', color: '#93c5fd' })
        .setOrigin(0.5, 0),
    );
    const fmt = (b?: { time: number; level: number }) =>
      b ? `${Math.floor(b.time / 60)}:${String(Math.floor(b.time % 60)).padStart(2, '0')} · p.${b.level}` : '—';
    const bestTime = (a: ReturnType<typeof listAccounts>[number]) => Math.max(0, ...Object.values(a.best).map((b) => b?.time ?? 0));
    const rows = listAccounts().sort((a, b) => bestTime(b) - bestTime(a));

    const tableW = Math.min(width - 24, 760);
    const x0 = (width - tableW) / 2;
    const cols = [0, 0.07, 0.32, 0.43, 0.65, 0.87].map((f) => x0 + f * tableW);
    const head = ['#', 'Gracz', 'Gry', 'Bakteria (rekord)', 'Wirus (rekord)', '🏆'];
    const style = { fontFamily: FONT, fontSize: width < 600 ? '11px' : '14px' };
    head.forEach((h, i) => c.add(this.add.text(cols[i], 70, h, { ...style, fontStyle: 'bold', color: '#c29aa8' })));
    const rowH = Math.min(30, (height - 170) / Math.max(1, rows.length));
    rows.forEach((a, i) => {
      const y = 100 + i * rowH;
      const mine = me !== undefined && a.nick.toLowerCase() === me.toLowerCase();
      if (mine) c.add(this.add.rectangle(x0 - 6, y - 3, tableW + 12, rowH - 2, 0x1f3b33, 0.9).setOrigin(0));
      const color = mine ? '#6ee7b7' : '#f5e9ee';
      const cells = [String(i + 1), a.nick, String(a.games), fmt(a.best.bacterium), fmt(a.best.virus), `${Object.keys(a.achievements ?? {}).length}/${ACHIEVEMENTS.length}`];
      cells.forEach((t, k) => c.add(this.add.text(cols[k], y, t, { ...style, color })));
    });
    if (rows.length === 0) c.add(this.add.text(width / 2, 110, 'Brak kont.', { ...style, color: '#c29aa8' }).setOrigin(0.5, 0));

    const close = this.add
      .text(width / 2, height - 20, 'Zamknij', { fontFamily: FONT, fontSize: '16px', color: '#1c0a10', backgroundColor: '#6ee7b7', padding: { x: 14, y: 6 } })
      .setOrigin(0.5, 1)
      .setInteractive({ useHandCursor: true });
    close.on('pointerdown', () => {
      audio.sfx('click');
      this.achPanel?.destroy();
      this.achPanel = undefined;
    });
    c.add(close);
    this.achPanel = c;
  }

  private pick(id: SpeciesId): void {
    if (this.achPanel) return; // lista osiągnięć otwarta
    audio.sfx('select');
    this.scene.start('GameScene', { species: id, animal: this.animal, mode: this.mode });
  }

  private animal: AnimalId = 'mouse';
  private mode: GameModeId = 'normal';
}

const MODE_KEY = 'backteria.mode';

function loadMode(): GameModeId {
  try {
    const v = localStorage.getItem(MODE_KEY);
    if (v && v in GAME_MODES) return v as GameModeId;
  } catch {
    /* brak pamięci */
  }
  return 'normal';
}

function saveMode(id: GameModeId): void {
  try {
    localStorage.setItem(MODE_KEY, id);
  } catch {
    /* brak pamięci */
  }
}

const ANIMAL_KEY = 'backteria.animal';

function loadAnimal(): AnimalId {
  try {
    const v = localStorage.getItem(ANIMAL_KEY);
    if (v && v in ANIMALS) return v as AnimalId;
  } catch {
    /* brak pamięci */
  }
  return 'mouse';
}

function saveAnimal(id: AnimalId): void {
  try {
    localStorage.setItem(ANIMAL_KEY, id);
  } catch {
    /* brak pamięci */
  }
}
