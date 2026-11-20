import Phaser from 'phaser';
import { recordResult } from '../account/accounts';
import { audio, SOUND_MODE_NAMES } from '../audio/AudioEngine';
import { CONVERT, STRUCTURES } from '../config';
import type { StructureKind } from '../entities/Structure';
import { GameEvents, type GameSummary, type MissionType } from '../events';
import type { Mutation } from '../mutations';
import { SPECIES } from '../species';
import { BIOMES } from '../world/biomes';
import { biomeAt, openness } from '../world/walls';
import { ORDER_NAMES, type GameScene } from './GameScene';

/** Minimapa: rozmiar w px ekranu i ile px świata przypada na 1 px mapy. */
const MINIMAP = { size: 150, res: 100, worldPerPx: 44, rowsPerFrame: 4 } as const;

const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';
const TEXT = '#f5e9ee';
const MUTED = '#c29aa8';
const ACCENT = '#6ee7b7';
const SHADOW = { offsetX: 0, offsetY: 1, color: '#000000', blur: 4, fill: true };

const formatTime = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

/** HUD, komunikaty, wybór mutacji, wskaźnik zadania, pauza i ekran końca gry — warstwa nad GameScene. */
export class UIScene extends Phaser.Scene {
  private gs!: GameScene;
  private hud!: Phaser.GameObjects.Graphics;
  private hpText!: Phaser.GameObjects.Text;
  private statsText!: Phaser.GameObjects.Text;
  private rightText!: Phaser.GameObjects.Text;
  private missionText!: Phaser.GameObjects.Text;
  private arrowText!: Phaser.GameObjects.Text;
  private hint!: Phaser.GameObjects.Text;
  private banner!: Phaser.GameObjects.Text;
  private toast!: Phaser.GameObjects.Text;
  private mutationPanel?: Phaser.GameObjects.Container;
  private mutationChoices: Mutation[] = [];
  private convertPanel?: Phaser.GameObjects.Container;
  private overlay?: Phaser.GameObjects.Container;
  private pauseOverlay?: Phaser.GameObjects.Container;
  private minimapTex?: Phaser.Textures.CanvasTexture;
  private minimapImg!: Phaser.GameObjects.Image;
  private minimapDots!: Phaser.GameObjects.Graphics;
  private minimapData?: ImageData;
  private biomeText!: Phaser.GameObjects.Text;
  /** środek mapy (świat) dla bieżącego przebiegu rysowania + numer wiersza */
  private mmCenter = { x: 0, y: 0 };
  private mmShown = { x: 0, y: 0 };
  private mmRow = 0;

  constructor() {
    super('UIScene');
  }

  create(): void {
    this.gs = this.scene.get('GameScene') as GameScene;
    this.mutationPanel = undefined;
    this.convertPanel = undefined;
    this.overlay = undefined;
    this.pauseOverlay = undefined;

    const base = { fontFamily: FONT, color: TEXT, shadow: SHADOW };
    this.hud = this.add.graphics();
    this.hpText = this.add.text(0, 0, '', { ...base, fontSize: '12px', color: '#ffffff' });
    this.statsText = this.add.text(16, 50, '', { ...base, fontSize: '15px', lineSpacing: 4 });
    this.rightText = this.add.text(0, 16, '', { ...base, fontSize: '15px', align: 'right', lineSpacing: 4 }).setOrigin(1, 0);
    this.missionText = this.add.text(0, 16, '', { ...base, fontSize: '16px', align: 'center', lineSpacing: 6 }).setOrigin(0.5, 0);
    this.arrowText = this.add.text(0, 0, '', { ...base, fontSize: '12px', color: '#fde68a' }).setOrigin(0.5);
    this.hint = this.add.text(16, 0, '', { ...base, fontSize: '13px', color: MUTED }).setOrigin(0, 1);
    this.banner = this.add
      .text(0, 0, '', { fontFamily: FONT, fontSize: '34px', fontStyle: 'bold', color: TEXT, align: 'center', stroke: '#1c0a10', strokeThickness: 6 })
      .setOrigin(0.5)
      .setAlpha(0);
    this.toast = this.add
      .text(0, 0, '', { fontFamily: FONT, fontSize: '16px', color: '#fde68a', stroke: '#1c0a10', strokeThickness: 4 })
      .setOrigin(0.5)
      .setAlpha(0);

    this.createMinimap();

    const ev = this.game.events;
    const handlers: [string, (...args: never[]) => void][] = [
      [GameEvents.BiomeChange, (name: string) => this.showBanner(name, 'Nowy biom')],
      [GameEvents.Start, () => this.onStart()],
      [GameEvents.LevelUp, (choices: Mutation[], pending: number) => this.showMutations(choices, pending)],
      [GameEvents.ConvertOffer, () => this.showConvert()],
      [GameEvents.ConvertClose, () => this.closeConvert()],
      [GameEvents.Toast, (msg: string) => this.showToast(msg)],
      [GameEvents.GameOver, (s: GameSummary) => this.showGameOver(s)],
      [GameEvents.MissionStart, (type: MissionType) => this.onMissionStart(type)],
      [GameEvents.MissionEnd, (type: MissionType, success: boolean) => this.onMissionEnd(type, success)],
    ];
    for (const [name, fn] of handlers) ev.on(name, fn);

    const onKey = (e: KeyboardEvent) => this.onKey(e);
    this.input.keyboard!.on('keydown', onKey);

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      for (const [name, fn] of handlers) ev.off(name, fn);
      this.input.keyboard?.off('keydown', onKey);
    });

    this.onStart();
  }

  update(): void {
    const g = this.gs;
    if (!g.player || !g.stats || !g.species) return;
    const { width, height } = this.scale;

    // Pasek zdrowia
    const barW = 220;
    this.hud.clear();
    this.hud.fillStyle(0x000000, 0.5).fillRoundedRect(16, 16, barW, 16, 4);
    const hpFrac = Phaser.Math.Clamp(g.player.hp / g.stats.maxHp, 0, 1);
    this.hud.fillStyle(hpFrac > 0.3 ? 0x10b981 : 0xef4444, 1).fillRoundedRect(16, 16, Math.max(8, barW * hpFrac), 16, 4);
    this.hpText.setText(`${Math.ceil(Math.max(0, g.player.hp))} / ${Math.round(g.stats.maxHp)}`).setPosition(22, 17);

    // Pasek doświadczenia
    this.hud.fillStyle(0x000000, 0.5).fillRect(16, 37, barW, 6);
    this.hud.fillStyle(0xfbbf24, 1).fillRect(16, 37, barW * Phaser.Math.Clamp(g.xp / g.xpToNext, 0, 1), 6);

    const lines = [`${g.species.name} · poziom ${g.level} · DNA ${g.dna}${g.dna > 0 ? ' (V — buduj)' : ''}`];
    if (!g.isVirus) lines.push(`Biomasa ${Math.floor(g.biomass)}`);
    lines.push(`${g.species.colonyLabel} ${g.allies.length}/${g.stats.maxColony} · rozkaz: ${ORDER_NAMES[g.order]}`);
    lines.push(`Budowle ${g.structures.length}/${CONVERT.maxStructures} · przeróbka (E): ${g.convertCd > 0 ? `${Math.ceil(g.convertCd)} s` : 'gotowa'}`);
    lines.push(`${g.species.abilityName} (LPM/F): ${g.abilityCd > 0 ? `${g.abilityCd.toFixed(1)} s` : 'gotowe'}`);
    this.statsText.setText(lines);

    // Pasek odnowienia ataku specjalnego (pod tekstem).
    const abY = this.statsText.y + this.statsText.height + 4;
    const cdFrac = 1 - Phaser.Math.Clamp(g.abilityCd / g.stats.abilityCooldown, 0, 1);
    this.hud.fillStyle(0x000000, 0.5).fillRect(16, abY, 120, 5);
    this.hud.fillStyle(cdFrac >= 1 ? 0xbef264 : 0x6b7280, 1).fillRect(16, abY, 120 * cdFrac, 5);

    this.rightText
      .setText([`Czas ${formatTime(g.elapsed)}`, `Zagrożenie ${Math.floor(g.threat)}`, `Zabici ${g.kills}`, `Zadania ${g.missionsDone}`])
      .setPosition(width - 16, 16);

    this.updateMissionUi(width, height);
    this.updateMinimap(width, height);

    this.hint
      .setText([
        g.isVirus
          ? 'Mysz/WASD — ruch  ·  LPM/F — szarża  ·  dotknij komórki — zaraź  ·  E — przerób komórkę  ·  Esc — pauza'
          : `Mysz/WASD — ruch  ·  LPM/F — toksyny  ·  Spacja/PPM — podział (${g.stats.divideCost})  ·  E — przerób komórkę  ·  Esc — pauza`,
        `Rozkazy (miejsce = kursor):  Q — za mną  ·  G — atak  ·  H — trzymaj pozycję  ·  T — ${g.isVirus ? 'zarażaj' : 'zbieraj'}   ·   V — edytor komórki   ·   N — dźwięk`,
      ])
      .setPosition(16, height - 12);

    this.banner.setPosition(width / 2, height * 0.3);
    this.toast.setPosition(width / 2, height - 150);
  }

  // ───────────────────────── minimapa ─────────────────────────

  private createMinimap(): void {
    const key = 'minimap';
    if (this.textures.exists(key)) this.textures.remove(key);
    const tex = this.textures.createCanvas(key, MINIMAP.res, MINIMAP.res);
    this.minimapTex = tex ?? undefined;
    this.minimapData = tex?.getContext().createImageData(MINIMAP.res, MINIMAP.res);
    this.minimapImg = this.add.image(0, 0, key).setOrigin(0).setDisplaySize(MINIMAP.size, MINIMAP.size).setAlpha(0.92);
    this.minimapDots = this.add.graphics();
    this.biomeText = this.add
      .text(0, 0, '', { fontFamily: FONT, fontSize: '12px', color: TEXT, shadow: SHADOW, align: 'right' })
      .setOrigin(1, 1);
    this.mmRow = 0;
    const p = this.gs.player;
    this.mmCenter = { x: p?.x ?? 0, y: p?.y ?? 0 };
    this.mmShown = { ...this.mmCenter };
  }

  /**
   * Teren minimapy liczony jest po kilka wierszy na klatkę (żeby nie było zacięć),
   * a kropki (gracz, kolonia, wrogowie, budowle, cel) rysowane na bieżąco.
   */
  private updateMinimap(width: number, height: number): void {
    const g = this.gs;
    const tex = this.minimapTex;
    const data = this.minimapData;
    if (!tex || !data) return;
    const S = MINIMAP.size;
    const R = MINIMAP.res;
    const W = MINIMAP.worldPerPx;
    const x0 = width - 16 - S;
    const y0 = height - 30 - S;
    this.minimapImg.setPosition(x0, y0);

    // Teren.
    const d = data.data;
    for (let n = 0; n < MINIMAP.rowsPerFrame; n++) {
      const py = this.mmRow;
      const wy = this.mmCenter.y + (py - R / 2) * W;
      for (let px = 0; px < R; px++) {
        const wx = this.mmCenter.x + (px - R / 2) * W;
        const i = (py * R + px) * 4;
        const biome = BIOMES[biomeAt(wx, wy).a];
        if (openness(wx, wy) < 0) {
          d[i] = biome.minimap[0];
          d[i + 1] = biome.minimap[1];
          d[i + 2] = biome.minimap[2];
        } else {
          d[i] = 24 + biome.floor[0] * 0.15;
          d[i + 1] = 10 + biome.floor[1] * 0.15;
          d[i + 2] = 16 + biome.floor[2] * 0.15;
        }
        d[i + 3] = 255;
      }
      this.mmRow++;
      if (this.mmRow >= R) {
        tex.getContext().putImageData(data, 0, 0);
        tex.refresh();
        this.mmShown = { ...this.mmCenter };
        this.mmRow = 0;
        this.mmCenter = { x: g.player.x, y: g.player.y };
        break;
      }
    }

    // Kropki — względem środka aktualnie pokazanego terenu.
    const k = S / (R * W);
    const toMap = (wx: number, wy: number) => ({ x: x0 + S / 2 + (wx - this.mmShown.x) * k, y: y0 + S / 2 + (wy - this.mmShown.y) * k });
    const inside = (p: { x: number; y: number }) => p.x >= x0 && p.x <= x0 + S && p.y >= y0 && p.y <= y0 + S;
    const dots = this.minimapDots;
    dots.clear();
    dots.lineStyle(2, 0x7a3a52, 1).strokeRect(x0 - 1, y0 - 1, S + 2, S + 2);

    for (const e of g.enemies) {
      const p = toMap(e.x, e.y);
      if (inside(p)) dots.fillStyle(0xef4444, 1).fillCircle(p.x, p.y, e.radius > 20 ? 2.5 : 1.6);
    }
    for (const s of g.structures) {
      const p = toMap(s.x, s.y);
      if (inside(p)) dots.fillStyle(STRUCTURES[s.kind].tint, 1).fillRect(p.x - 2.5, p.y - 2.5, 5, 5);
    }
    for (const a of g.allies) {
      const p = toMap(a.x, a.y);
      if (inside(p)) dots.fillStyle(0x86efac, 1).fillCircle(p.x, p.y, 1.5);
    }
    const m = g.missionInfo;
    if (m) {
      const p = toMap(m.x, m.y);
      const c = { x: Phaser.Math.Clamp(p.x, x0 + 4, x0 + S - 4), y: Phaser.Math.Clamp(p.y, y0 + 4, y0 + S - 4) };
      const pulse = 3.5 + Math.sin(this.time.now / 180) * 1.2;
      dots.fillStyle(m.type === 'defend' ? 0xf472b6 : 0xa78bfa, 1).fillCircle(c.x, c.y, pulse);
    }
    const pp = toMap(g.player.x, g.player.y);
    dots.fillStyle(0xffffff, 1).fillCircle(pp.x, pp.y, 3);
    dots.lineStyle(1, 0x000000, 0.8).strokeCircle(pp.x, pp.y, 3);

    this.biomeText.setText(BIOMES[g.biome].name).setPosition(x0 + S, y0 - 4);
  }

  // ───────────────────────── zadanie + strzałka ─────────────────────────

  private updateMissionUi(width: number, height: number): void {
    const g = this.gs;
    const m = g.missionInfo;
    if (!m) {
      this.missionText.setText(`Następne zadanie za ${Math.ceil(g.nextMissionIn)} s`).setColor(MUTED).setPosition(width / 2, 16);
      this.arrowText.setVisible(false);
      return;
    }

    const label = m.type === 'defend' ? 'Obroń narząd' : 'Zainfekuj narząd';
    this.missionText
      .setText(`Zadanie: ${label} — ${Math.ceil(m.timeLeft)} s\n${m.type === 'defend' ? 'Zdrowie' : 'Odporność'} narządu ${Math.round(m.hpFrac * 100)}%`)
      .setColor('#fde68a')
      .setPosition(width / 2, 16);

    // Pozycja narządu na ekranie.
    const cam = g.cameras.main;
    const sx = (m.x - cam.worldView.x) * cam.zoom;
    const sy = (m.y - cam.worldView.y) * cam.zoom;
    const margin = 48;
    const onScreen = sx > margin && sx < width - margin && sy > margin && sy < height - margin;
    const color = m.type === 'defend' ? 0xf472b6 : 0xa78bfa;

    if (onScreen) {
      // Pulsujący pierścień wokół narządu.
      const r = 48 * cam.zoom + 14 + Math.sin(this.time.now / 200) * 4;
      this.hud.lineStyle(2, color, 0.8).strokeCircle(sx, sy, r);
      this.arrowText.setVisible(false);
      return;
    }

    const cx = width / 2;
    const cy = height / 2;
    const dx = sx - cx;
    const dy = sy - cy;
    const t = Math.min((width / 2 - margin) / Math.abs(dx || 1e-6), (height / 2 - margin) / Math.abs(dy || 1e-6));
    const ax = cx + dx * t;
    const ay = cy + dy * t;
    const ang = Math.atan2(dy, dx);
    const tri = (a: number, r: number) => ({ x: ax + Math.cos(ang + a) * r, y: ay + Math.sin(ang + a) * r });
    const p1 = tri(0, 18);
    const p2 = tri(2.5, 14);
    const p3 = tri(-2.5, 14);
    this.hud.fillStyle(0x000000, 0.5).fillCircle(ax, ay, 20);
    this.hud.fillStyle(color, 1).fillTriangle(p1.x, p1.y, p2.x, p2.y, p3.x, p3.y);

    const worldDist = Math.hypot(m.x - g.player.x, m.y - g.player.y);
    this.arrowText
      .setVisible(true)
      .setText(`${Math.round(worldDist / 10)} µm`)
      .setPosition(ax - Math.cos(ang) * 34, ay - Math.sin(ang) * 34);
  }

  private onMissionStart(type: MissionType): void {
    if (type === 'defend') this.showBanner('Narząd zaatakowany!', 'Leć za strzałką i obroń go');
    else this.showBanner('Nowy cel!', 'Zainfekuj narząd, zanim upłynie czas');
  }

  private onMissionEnd(type: MissionType, success: boolean): void {
    if (success) this.showBanner('Zadanie wykonane!', type === 'defend' ? 'Narząd ocalał · nagroda' : 'Narząd zainfekowany · nowe kopie');
    else this.showBanner('Zadanie nieudane', type === 'defend' ? 'Narząd został zniszczony' : 'Narząd się obronił');
  }

  // ───────────────────────── komunikaty ─────────────────────────

  private onStart(): void {
    this.mutationPanel?.destroy();
    this.mutationPanel = undefined;
    this.closeConvert();
    this.overlay?.destroy();
    this.overlay = undefined;
    this.pauseOverlay?.destroy();
    this.pauseOverlay = undefined;
    const pl = this.gs.player;
    if (pl) {
      this.mmCenter = { x: pl.x, y: pl.y };
      this.mmShown = { ...this.mmCenter };
      this.mmRow = 0;
    }
    const sp = this.gs.species;
    if (sp) this.showBanner(sp.name, sp.id === 'virus' ? 'Zarażaj, mnóż się, przetrwaj' : 'Jedz, rośnij, dziel się, przetrwaj');
  }

  private showBanner(title: string, subtitle?: string): void {
    this.tweens.killTweensOf(this.banner);
    this.banner.setText(subtitle ? [title, subtitle] : title).setAlpha(1);
    this.tweens.add({ targets: this.banner, alpha: 0, delay: 1800, duration: 600 });
  }

  private showToast(msg: string): void {
    this.tweens.killTweensOf(this.toast);
    this.toast.setText(msg).setAlpha(1);
    this.tweens.add({ targets: this.toast, alpha: 0, delay: 1200, duration: 400 });
  }

  // ───────────────────────── mutacje (bez pauzy) ─────────────────────────

  private showMutations(choices: Mutation[], pending: number): void {
    this.mutationPanel?.destroy();
    this.mutationChoices = choices;
    const accent = ACCENT;
    const border = 0x7a3a52;

    const { width, height } = this.scale;
    const gap = 10;
    const cardW = Math.min(230, (width - 32 - gap * 2) / 3);
    const cardH = 78;
    const total = cardW * 3 + gap * 2;
    const x0 = (width - total) / 2;
    const y0 = height - 40 - cardH;

    const c = this.add.container(0, 0).setDepth(50);
    const more = pending > 1 ? `  (+${pending - 1} kolejne)` : '';
    const title = `Mutacja! Wybierz 1 / 2 / 3${more}`;
    c.add(
      this.add
        .text(width / 2, y0 - 8, title, { fontFamily: FONT, fontSize: '16px', fontStyle: 'bold', color: accent, shadow: SHADOW })
        .setOrigin(0.5, 1),
    );

    choices.forEach((m, i) => {
      const x = x0 + i * (cardW + gap);
      const card = this.add
        .rectangle(x, y0, cardW, cardH, 0x2a1019, 0.9)
        .setOrigin(0)
        .setStrokeStyle(2, border)
        .setInteractive({ useHandCursor: true });
      card.on('pointerover', () => card.setStrokeStyle(3, 0x6ee7b7));
      card.on('pointerout', () => card.setStrokeStyle(2, border));
      card.on('pointerdown', () => this.pick(i));

      const name = this.add.text(x + 10, y0 + 8, `${i + 1}. ${m.name}`, {
        fontFamily: FONT,
        fontSize: '15px',
        fontStyle: 'bold',
        color: accent,
        wordWrap: { width: cardW - 20 },
      });
      const desc = this.add.text(x + 10, y0 + 32, m.description, {
        fontFamily: FONT,
        fontSize: '13px',
        color: TEXT,
        wordWrap: { width: cardW - 20 },
      });
      c.add([card, name, desc]);
    });

    c.setAlpha(0);
    this.tweens.add({ targets: c, alpha: 1, duration: 200 });
    this.mutationPanel = c;
  }

  private pick(i: number): void {
    const m = this.mutationChoices[i];
    if (!m) return;
    this.mutationPanel?.destroy();
    this.mutationPanel = undefined;
    this.mutationChoices = [];
    this.gs.chooseMutation(m);
    this.showToast(`Mutacja: ${m.name}`);
  }

  // ───────────────────────── przerabianie komórki ─────────────────────────

  private static readonly CONVERT_KINDS: StructureKind[] = ['turret', 'factory', 'nest'];

  private showConvert(): void {
    this.closeConvert();
    const { width, height } = this.scale;
    const kinds = UIScene.CONVERT_KINDS;
    const gap = 10;
    const cardW = Math.min(200, (width - 32 - gap * 2) / 3);
    const cardH = 70;
    const total = cardW * 3 + gap * 2;
    const x0 = (width - total) / 2;
    const y0 = height * 0.5 + 60;

    const c = this.add.container(0, 0).setDepth(60);
    c.add(
      this.add
        .text(width / 2, y0 - 8, 'Przerób komórkę na:  1 / 2 / 3   (E — anuluj)', {
          fontFamily: FONT, fontSize: '16px', fontStyle: 'bold', color: '#5eead4', shadow: SHADOW,
        })
        .setOrigin(0.5, 1),
    );
    kinds.forEach((k, i) => {
      const def = STRUCTURES[k];
      const x = x0 + i * (cardW + gap);
      const card = this.add
        .rectangle(x, y0, cardW, cardH, 0x10262a, 0.9)
        .setOrigin(0)
        .setStrokeStyle(2, def.tint)
        .setInteractive({ useHandCursor: true });
      card.on('pointerdown', () => this.pickConvert(i));
      c.add(card);
      c.add(this.add.text(x + 10, y0 + 8, `${i + 1}. ${def.name}`, { fontFamily: FONT, fontSize: '15px', fontStyle: 'bold', color: '#ffffff' }));
      c.add(this.add.text(x + 10, y0 + 30, def.description, { fontFamily: FONT, fontSize: '12px', color: TEXT, wordWrap: { width: cardW - 20 } }));
    });
    this.convertPanel = c;
  }

  private closeConvert(): void {
    this.convertPanel?.destroy();
    this.convertPanel = undefined;
  }

  private pickConvert(i: number): void {
    const kind = UIScene.CONVERT_KINDS[i];
    if (!kind) return;
    this.closeConvert();
    this.gs.convertCell(kind);
  }

  // ───────────────────────── klawiatura, pauza ─────────────────────────

  private onKey(e: KeyboardEvent): void {
    // Edytor komórki ma własną obsługę klawiszy.
    if (this.scene.isActive('EditorScene')) return;
    if (this.overlay) {
      if (e.code === 'KeyR') this.restart();
      else if (e.code === 'KeyM') this.toMenu();
      return;
    }
    if (e.code === 'Escape' || e.code === 'KeyP') {
      this.togglePause();
      audio.sfx('click');
      return;
    }
    if (e.code === 'KeyN') {
      this.showToast(`Dźwięk: ${SOUND_MODE_NAMES[audio.cycleMode()]}`);
      audio.sfx('click');
      return;
    }
    if (this.pauseOverlay) {
      if (e.code === 'KeyM') this.toMenu();
      return;
    }
    const i = ['Digit1', 'Digit2', 'Digit3'].indexOf(e.code);
    const j = ['Numpad1', 'Numpad2', 'Numpad3'].indexOf(e.code);
    const k = i >= 0 ? i : j;
    if (k < 0) return;
    // Wybór budowli ma pierwszeństwo przed mutacją.
    if (this.convertPanel) this.pickConvert(k);
    else if (this.mutationPanel) this.pick(k);
  }

  private togglePause(): void {
    if (this.pauseOverlay) {
      this.pauseOverlay.destroy();
      this.pauseOverlay = undefined;
      this.scene.resume('GameScene');
      return;
    }
    this.scene.pause('GameScene');
    const { width, height } = this.scale;
    const c = this.add.container(0, 0).setDepth(150);
    c.add(this.add.rectangle(0, 0, width, height, 0x000000, 0.55).setOrigin(0));
    c.add(this.add.text(width / 2, height / 2 - 20, 'Pauza', { fontFamily: FONT, fontSize: '36px', fontStyle: 'bold', color: TEXT }).setOrigin(0.5));
    c.add(
      this.add
        .text(width / 2, height / 2 + 25, 'Esc — wróć do gry   ·   M — menu', { fontFamily: FONT, fontSize: '16px', color: MUTED })
        .setOrigin(0.5),
    );
    this.pauseOverlay = c;
  }

  // ───────────────────────── koniec gry ─────────────────────────

  private showGameOver(s: GameSummary): void {
    this.mutationPanel?.destroy();
    this.mutationPanel = undefined;
    this.closeConvert();
    this.overlay?.destroy();
    const { width, height } = this.scale;
    const c = this.add.container(0, 0).setDepth(200);
    c.add(this.add.rectangle(0, 0, width, height, 0x000000, 0.7).setOrigin(0));

    c.add(
      this.add
        .text(width / 2, height / 2 - 60, SPECIES[s.species].deathText, { fontFamily: FONT, fontSize: '32px', fontStyle: 'bold', color: '#fca5a5' })
        .setOrigin(0.5),
    );
    c.add(
      this.add
        .text(width / 2, height / 2 - 10, `Czas ${formatTime(s.time)}   ·   Poziom ${s.level}   ·   Zabici ${s.kills}   ·   Zadania ${s.missions}`, {
          fontFamily: FONT,
          fontSize: '18px',
          color: TEXT,
        })
        .setOrigin(0.5),
    );

    // Zapis wyniku na koncie gracza.
    const nick = this.registry.get('account') as string | undefined;
    if (nick && recordResult(nick, s)) {
      c.add(
        this.add
          .text(width / 2, height / 2 + 18, `Nowy rekord gracza ${nick}!`, { fontFamily: FONT, fontSize: '16px', fontStyle: 'bold', color: '#fde68a' })
          .setOrigin(0.5, 0),
      );
    }

    const button = (y: number, label: string, onClick: () => void) => {
      const b = this.add
        .text(width / 2, y, label, { fontFamily: FONT, fontSize: '19px', color: '#1c0a10', backgroundColor: '#6ee7b7', padding: { x: 16, y: 8 } })
        .setOrigin(0.5)
        .setInteractive({ useHandCursor: true });
      b.on('pointerdown', onClick);
      c.add(b);
    };
    button(height / 2 + 70, 'Zagraj ponownie  [R]', () => this.restart());
    button(height / 2 + 125, 'Zmień postać  [M]', () => this.toMenu());

    this.overlay = c;
  }

  private restart(): void {
    this.overlay?.destroy();
    this.overlay = undefined;
    this.gs.scene.restart({ species: this.gs.species.id });
  }

  private toMenu(): void {
    this.scene.stop('GameScene');
    this.scene.start('MenuScene');
  }
}
