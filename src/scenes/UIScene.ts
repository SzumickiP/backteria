import Phaser from 'phaser';
import type { AchievementDef } from '../account/achievements';
import { recordResult } from '../account/accounts';
import { audio, SOUND_MODE_NAMES } from '../audio/AudioEngine';
import { CLOAK, CONVERT, STRUCTURES } from '../config';
import type { StructureKind } from '../entities/Structure';
import { GameEvents, type GameSummary, type MissionType } from '../events';
import type { Mutation } from '../mutations';
import { isKey, keyLabel, keyName, settings } from '../settings';
import { SPECIES } from '../species';
import { SYSTEMS, currentAnimal, type Shape } from '../world/animal';
import { BIOMES } from '../world/biomes';

/** Kształt powiększony o `d` px (obrys skóry na dużej mapie). */
const grow = (s: Shape, d: number): Shape =>
  s.kind === 'ellipse' ? { ...s, rx: s.rx + d, ry: s.ry + d } : { ...s, ra: s.ra + d, rb: s.rb + d };
import { biomeAt, openness } from '../world/walls';
import { ORDER_NAMES, type GameScene } from './GameScene';

/** Minimapa: rozmiar w px ekranu i ile px świata przypada na 1 px mapy. */
const MINIMAP = { size: 150, res: 100, worldPerPx: 44, rowsPerFrame: 4 } as const;

const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';
const TEXT = '#f5e9ee';
const MUTED = '#c29aa8';
const ACCENT = '#6ee7b7';
const SHADOW = { offsetX: 0, offsetY: 1, color: '#000000', blur: 4, fill: true };

/** Kolor znacznika zadania: obrona — różowy, cele wirusa — fiolet, gniazda — czerwony, zbieranie — złoty. */
function missionColor(type: MissionType): number {
  switch (type) {
    case 'defend':
      return 0xf472b6;
    case 'nest':
      return 0xef4444;
    case 'collect':
      return 0xfde047;
    case 'multiply':
      return 0x6ee7b7;
    default:
      return 0xa78bfa;
  }
}

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
  /** podpisy slotów umiejętności: [klawisz, nazwa, czas] × 3 */
  private slotTexts: Phaser.GameObjects.Text[][] = [];
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
    this.slotTexts = [0, 1, 2].map(() => [
      this.add.text(0, 0, '', { ...base, fontSize: '13px', fontStyle: 'bold', color: '#fde68a' }).setOrigin(0.5),
      this.add.text(0, 0, '', { ...base, fontSize: '12px', color: TEXT }).setOrigin(0.5, 0),
      this.add.text(0, 0, '', { ...base, fontSize: '20px', fontStyle: 'bold', color: '#ffffff' }).setOrigin(0.5),
    ]);
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
      [GameEvents.BiomeChange, (name: string) => this.showBanner(name, currentAnimal().inside)],
      [GameEvents.Achievement, (def: AchievementDef) => this.queueAchievement(def)],
      [GameEvents.Start, () => this.onStart()],
      [GameEvents.LevelUp, (choices: Mutation[], pending: number) => this.showMutations(choices, pending)],
      [GameEvents.ConvertOffer, () => this.showConvert()],
      [GameEvents.ConvertClose, () => this.closeConvert()],
      [GameEvents.Toast, (msg: string) => this.showToast(msg)],
      [GameEvents.GameOver, (s: GameSummary) => this.showGameOver(s)],
      [GameEvents.MissionStart, (title: string, subtitle: string) => this.onMissionStart(title, subtitle)],
      [GameEvents.MissionEnd, (title: string, success: boolean, detail: string, big?: boolean) => this.onMissionEnd(title, success, detail, big)],
      [GameEvents.Conquest, (name: string, done: number, total: number) => this.showBanner(`Podbito: ${name}`, `Podbój organizmu ${done} / ${total}`)],
      [GameEvents.Victory, (s: GameSummary) => this.showGameOver(s, true)],
      [GameEvents.Friend, (msg: string) => this.showToast(msg)],
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
    this.hud.fillStyle(0x000000, 0.55).fillRoundedRect(16, 16, barW, 16, 6);
    const hpFrac = Phaser.Math.Clamp(g.player.hp / g.stats.maxHp, 0, 1);
    const hpW = Math.max(10, barW * hpFrac);
    const hpOk = hpFrac > 0.3;
    this.hud.fillStyle(hpOk ? 0x0b8f65 : 0xb91c1c, 1).fillRoundedRect(16, 16, hpW, 16, 6);
    this.hud.fillStyle(hpOk ? 0x34d399 : 0xf87171, 1).fillRoundedRect(16, 16, hpW, 9, { tl: 6, tr: 6, bl: 0, br: 0 });
    this.hud.fillStyle(0xffffff, 0.22).fillRoundedRect(19, 18, Math.max(4, hpW - 6), 3, 1.5);
    this.hud.lineStyle(1.5, 0xf5e9ee, 0.45).strokeRoundedRect(16, 16, barW, 16, 6);
    this.hpText.setText(`${Math.ceil(Math.max(0, g.player.hp))} / ${Math.round(g.stats.maxHp)}`).setPosition(24, 17);

    // Pasek doświadczenia
    const xpW = barW * Phaser.Math.Clamp(g.xp / g.xpToNext, 0, 1);
    this.hud.fillStyle(0x000000, 0.55).fillRoundedRect(16, 37, barW, 7, 3);
    if (xpW > 1) {
      this.hud.fillStyle(0xd99a0b, 1).fillRoundedRect(16, 37, Math.max(6, xpW), 7, 3);
      this.hud.fillStyle(0xfde68a, 0.9).fillRoundedRect(16, 37, Math.max(6, xpW), 3.5, 2);
    }
    this.hud.lineStyle(1, 0xf5e9ee, 0.3).strokeRoundedRect(16, 37, barW, 7, 3);

    const lines = [`${g.species.name} · poziom ${g.level} · DNA ${g.dna}${g.dna > 0 ? ' (V — buduj)' : ''}`];
    if (!g.isVirus) lines.push(`Biomasa ${Math.floor(g.biomass)}`);
    lines.push(`${g.species.colonyLabel} ${g.allies.length}/${g.stats.maxColony} · rozkaz: ${ORDER_NAMES[g.order]}`);
    // Główna misja wirusa: podbój całego organizmu.
    if (g.isVirus) {
      const c = g.conquestInfo;
      const here = c.here ? ` · ${c.here.name}: ${c.here.conquered ? 'podbity ✓' : `${c.here.progress}/${c.here.goal}`}` : '';
      lines.push(`Podbój organizmu ${c.done}/${c.total}${here}`);
    }
    lines.push(`Budowle ${g.structures.length}/${CONVERT.maxStructures}`);
    this.statsText.setText(lines);

    // Duże sloty umiejętności w lewym dolnym rogu: klawisz, nazwa, odliczanie i wypełnienie.
    const slots = [
      {
        key: 'LPM/' + keyLabel('ability'), name: g.species.abilityName,
        cd: g.abilityCd, max: g.stats.abilityCooldown, active: false, activeFrac: 0, color: 0xbef264,
      },
      {
        key: keyLabel('cloak'), name: 'Maskowanie',
        cd: g.cloakCd, max: CLOAK.cooldown, active: g.cloaked, activeFrac: g.cloakTime / CLOAK.duration, color: 0x67e8f9,
      },
      {
        key: keyLabel('convert'), name: 'Przeróbka',
        cd: g.convertCd, max: CONVERT.cooldown, active: false, activeFrac: 0, color: 0xf0abfc,
      },
    ];
    const SW = 86, SH = 64, GAP = 10;
    const sy = height - 44 - SH;
    slots.forEach((s, i) => {
      const sx = 16 + i * (SW + GAP);
      const ready = s.cd <= 0;
      const frac = s.active ? Phaser.Math.Clamp(s.activeFrac, 0, 1) : 1 - Phaser.Math.Clamp(s.cd / s.max, 0, 1);
      this.hud.fillStyle(0x12060a, 0.82).fillRoundedRect(sx, sy, SW, SH, 8);
      // wypełnienie od dołu
      const fh = Math.max(0, (SH - 4) * frac);
      this.hud.fillStyle(s.color, s.active ? 0.55 : ready ? 0.4 : 0.2).fillRoundedRect(sx + 2, sy + SH - 2 - fh, SW - 4, fh, 6);
      const glow = ready || s.active ? 0.6 + 0.4 * Math.sin(this.time.now / 220) : 0;
      this.hud.lineStyle(ready || s.active ? 3 : 1.5, ready || s.active ? s.color : 0xf5e9ee, ready || s.active ? 0.6 + 0.4 * glow : 0.35)
        .strokeRoundedRect(sx, sy, SW, SH, 8);
      const [kt, nt, tt] = this.slotTexts[i];
      kt.setText(s.key).setPosition(sx + SW / 2, sy + 13);
      nt.setText(s.name).setPosition(sx + SW / 2, sy + 24).setColor(ready || s.active ? TEXT : MUTED);
      tt.setText(s.active ? `${s.activeFrac * CLOAK.duration < 0 ? 0 : (s.activeFrac * CLOAK.duration).toFixed(1)} s` : ready ? 'GOTOWE' : s.cd < 10 ? `${s.cd.toFixed(1)} s` : `${Math.ceil(s.cd)} s`)
        .setPosition(sx + SW / 2, sy + SH - 17)
        .setFontSize(ready && !s.active ? 14 : 20)
        .setColor(s.active ? '#a5f3fc' : ready ? '#d9f99d' : '#ffffff');
    });

    this.rightText
      .setText([`Czas ${formatTime(g.elapsed)}`, `Zagrożenie ${Math.floor(g.threat)}`, `Zabici ${g.kills}`, `Zadania ${g.missionsDone}`])
      .setPosition(width - 16, 16);

    this.updateMissionUi(width, height);
    this.updateMinimap(width, height);
    this.updateBigMap();

    this.hint
      .setText(this.hintLines(g.isVirus, g.stats.divideCost))
      .setPosition(16, height - 12);

    this.banner.setPosition(width / 2, height * 0.3);
    // Komunikaty nad panelem mutacji (nie nachodzą na niego).
    this.toast.setPosition(width / 2, height - 215);

    // Krawędzie ekranu: czerwony błysk przy trafieniu i pulsowanie przy niskim zdrowiu.
    const lowHp = hpFrac < 0.3 ? 0.18 + 0.14 * Math.sin(this.time.now / 160) : 0;
    const edge = Math.max(g.hurtPulse * 0.45, lowHp);
    if (edge > 0.01) {
      for (let i = 0; i < 4; i++) {
        this.hud.lineStyle(14 + i * 12, 0xdc2626, edge * (1 - i * 0.24)).strokeRect(0, 0, width, height);
      }
    }
  }

  // ───────────────────────── osiągnięcia ─────────────────────────

  private achievementQueue: AchievementDef[] = [];
  private achievementShowing = false;

  private queueAchievement(def: AchievementDef): void {
    this.achievementQueue.push(def);
    if (!this.achievementShowing) this.showNextAchievement();
  }

  /** Złota plakietka u góry ekranu; kilka osiągnięć naraz pokazuje się po kolei. */
  private showNextAchievement(): void {
    const def = this.achievementQueue.shift();
    if (!def) {
      this.achievementShowing = false;
      return;
    }
    this.achievementShowing = true;
    const { width } = this.scale;
    const w = Math.min(380, width - 32);
    const c = this.add.container(width / 2, 70).setDepth(130).setAlpha(0);
    c.add(this.add.rectangle(0, 0, w, 62, 0x2a1a0c, 0.95).setStrokeStyle(2, 0xfbbf24));
    c.add(this.add.text(0, -14, `🏆 Osiągnięcie: ${def.name}`, { fontFamily: FONT, fontSize: '17px', fontStyle: 'bold', color: '#fde68a' }).setOrigin(0.5));
    c.add(this.add.text(0, 12, def.description, { fontFamily: FONT, fontSize: '13px', color: TEXT }).setOrigin(0.5));
    this.tweens.add({
      targets: c,
      alpha: 1,
      y: 80,
      duration: 250,
      hold: 2800,
      yoyo: true,
      onComplete: () => {
        c.destroy();
        this.showNextAchievement();
      },
    });
  }

  // ───────────────────────── duża mapa (wnętrze myszy) ─────────────────────────

  private bigMap?: Phaser.GameObjects.Container;
  private bigMapDots?: Phaser.GameObjects.Graphics;
  private bigMapView = { ox: 0, oy: 0, k: 1 };

  private toggleBigMap(): void {
    if (this.bigMap) {
      this.bigMap.destroy();
      this.bigMap = undefined;
      this.bigMapDots = undefined;
      return;
    }
    audio.sfx('click');
    const { width, height } = this.scale;
    const animal = currentAnimal();
    const B = animal.bounds;
    const pad = 30;
    // Miejsce na tytuł u góry (50 px) i legendę u dołu (40 px).
    const k = Math.min((width - pad * 2) / (B.maxX - B.minX), (height - pad * 2 - 90) / (B.maxY - B.minY));
    const ox = (width - (B.maxX - B.minX) * k) / 2 - B.minX * k;
    const oy = 50 + (height - 90 - (B.maxY - B.minY) * k) / 2 - B.minY * k;
    this.bigMapView = { ox, oy, k };

    const c = this.add.container(0, 0).setDepth(140);
    c.add(this.add.rectangle(0, 0, width, height, 0x0d0408, 0.88).setOrigin(0));
    c.add(
      this.add
        .text(width / 2, 14, `${animal.inside}   ·   ${keyLabel('map')} — zamknij`, { fontFamily: FONT, fontSize: '20px', fontStyle: 'bold', color: TEXT })
        .setOrigin(0.5, 0),
    );

    const g = this.add.graphics();
    const shape = (s: Shape, color: number, alpha = 1) => {
      g.fillStyle(color, alpha);
      if (s.kind === 'ellipse') {
        g.fillEllipse(ox + s.x * k, oy + s.y * k, s.rx * 2 * k, s.ry * 2 * k);
        return;
      }
      const ax = ox + s.ax * k;
      const ay = oy + s.ay * k;
      const bx = ox + s.bx * k;
      const by = oy + s.by * k;
      const len = Math.hypot(bx - ax, by - ay) || 1;
      const nx = -(by - ay) / len;
      const ny = (bx - ax) / len;
      const ra = s.ra * k;
      const rb = s.rb * k;
      g.fillPoints([
        new Phaser.Math.Vector2(ax + nx * ra, ay + ny * ra),
        new Phaser.Math.Vector2(bx + nx * rb, by + ny * rb),
        new Phaser.Math.Vector2(bx - nx * rb, by - ny * rb),
        new Phaser.Math.Vector2(ax - nx * ra, ay - ny * ra),
      ], true);
      g.fillCircle(ax, ay, ra);
      g.fillCircle(bx, by, rb);
    };
    // Skóra (obrys) i tkanka.
    for (const p of animal.parts) for (const s of p.shapes) shape(grow(s, 260), 0xf0a0b0, 0.9);
    for (const p of animal.parts) for (const s of p.shapes) shape(s, 0x7a2840);
    // Narządy w kolorach układów (od najmniej ważnych — na wierzchu te o pierwszeństwie).
    for (const o of [...animal.organs].reverse()) {
      const color = o.name === 'Serce' ? 0xff3b3b : SYSTEMS[o.system].color;
      for (const s of o.shapes) shape(s, color, o.channel ? 0.85 : 0.95);
    }
    // Wirus: narządy już podbite — fioletowa nakładka.
    if (this.gs.isVirus) {
      for (const o of animal.organs) if (this.gs.conqueredOrgans.has(o.name)) for (const s of o.shapes) shape(s, 0x7c3aed, 0.65);
    }
    c.add(g);

    // Podpisy narządów.
    for (const o of animal.organs) {
      if (o.label === null) continue;
      const s = o.shapes[0];
      const [lx, ly] = o.label ?? (s.kind === 'ellipse' ? [s.x, s.y] : [(s.ax + s.bx) / 2, (s.ay + s.by) / 2]);
      c.add(
        this.add
          .text(ox + lx * k, oy + ly * k, o.name, { fontFamily: FONT, fontSize: '12px', color: '#ffffff', stroke: '#1c0a10', strokeThickness: 4 })
          .setOrigin(0.5),
      );
    }

    // Legenda układów.
    const systems = Object.values(SYSTEMS);
    const legendW = 170;
    let lx = width / 2 - (systems.length * legendW) / 2;
    for (const sys of systems) {
      const sq = this.add.rectangle(lx, height - 22, 14, 14, sys.color).setOrigin(0, 0.5);
      const t = this.add.text(lx + 20, height - 22, sys.name, { fontFamily: FONT, fontSize: '13px', color: TEXT }).setOrigin(0, 0.5);
      c.add([sq, t]);
      lx += legendW;
    }

    this.bigMapDots = this.add.graphics();
    c.add(this.bigMapDots);
    this.bigMap = c;
  }

  /** Kropki na dużej mapie: gracz, cel zadania, budowle. */
  private updateBigMap(): void {
    const g = this.gs;
    const dots = this.bigMapDots;
    if (!dots || !g.player) return;
    const { ox, oy, k } = this.bigMapView;
    dots.clear();
    for (const s of g.structures) dots.fillStyle(STRUCTURES[s.kind].tint, 1).fillRect(ox + s.x * k - 3, oy + s.y * k - 3, 6, 6);
    const m = g.missionInfo;
    if (m?.x !== undefined && m.y !== undefined) dots.fillStyle(missionColor(m.type), 1).fillCircle(ox + m.x * k, oy + m.y * k, 5);
    const fr = g.friendPos;
    if (fr) dots.fillStyle(0xfde68a, 1).fillCircle(ox + fr.x * k, oy + fr.y * k, 5);
    const pulse = 5 + Math.sin(this.time.now / 160) * 2;
    dots.lineStyle(2, 0xffffff, 1).strokeCircle(ox + g.player.x * k, oy + g.player.y * k, pulse + 3);
    dots.fillStyle(0x6ee7b7, 1).fillCircle(ox + g.player.x * k, oy + g.player.y * k, 4);
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
    const pulse = 3.5 + Math.sin(this.time.now / 180) * 1.2;
    const clampIn = (p: { x: number; y: number }) => ({ x: Phaser.Math.Clamp(p.x, x0 + 4, x0 + S - 4), y: Phaser.Math.Clamp(p.y, y0 + 4, y0 + S - 4) });
    const m = g.missionInfo;
    if (m?.x !== undefined && m.y !== undefined) {
      const c = clampIn(toMap(m.x, m.y));
      dots.fillStyle(missionColor(m.type), 1).fillCircle(c.x, c.y, pulse);
    }
    // Przyjazna postać — żółta gwiazdka.
    const fr = g.friendPos;
    if (fr) {
      const c = clampIn(toMap(fr.x, fr.y));
      dots.fillStyle(0xfde68a, 1).fillCircle(c.x, c.y, pulse);
      dots.lineStyle(1.5, 0xffffff, 0.9).strokeCircle(c.x, c.y, pulse + 2.5);
    }
    const pp = toMap(g.player.x, g.player.y);
    dots.fillStyle(0xffffff, 1).fillCircle(pp.x, pp.y, 3);
    dots.lineStyle(1, 0x000000, 0.8).strokeCircle(pp.x, pp.y, 3);

    this.biomeText.setText(`${g.regionName}  ·  ${keyLabel('map')} — mapa`).setPosition(x0 + S, y0 - 4);
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

    this.missionText
      .setText(`Zadanie: ${m.title} — ${Math.ceil(m.timeLeft)} s\n${m.detail}`)
      .setColor('#fde68a')
      .setPosition(width / 2, 16);

    // Misja bez miejsca (np. epidemia) — bez strzałki.
    if (m.x === undefined || m.y === undefined) {
      this.arrowText.setVisible(false);
      return;
    }
    const mx = m.x;
    const my = m.y;

    // Pozycja celu na ekranie.
    const cam = g.cameras.main;
    const sx = (mx - cam.worldView.x) * cam.zoom;
    const sy = (my - cam.worldView.y) * cam.zoom;
    const margin = 48;
    const onScreen = sx > margin && sx < width - margin && sy > margin && sy < height - margin;
    const color = missionColor(m.type);

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

    const worldDist = Math.hypot(mx - g.player.x, my - g.player.y);
    this.arrowText
      .setVisible(true)
      .setText(`${Math.round(worldDist / 10)} µm`)
      .setPosition(ax - Math.cos(ang) * 34, ay - Math.sin(ang) * 34);
  }

  private onMissionStart(title: string, subtitle: string): void {
    this.showBanner(`Nowe zadanie: ${title}`, subtitle);
  }

  private onMissionEnd(title: string, success: boolean, detail: string, big = false): void {
    if (success && big) {
      this.showBigVictory(title, detail);
      return;
    }
    this.showBanner(success ? `Wykonane: ${title}` : `Nieudane: ${title}`, detail);
  }

  /** Efektowne zakończenie wielkiej misji: błysk ekranu, powiększający się napis, dłuższy komunikat. */
  private showBigVictory(title: string, detail: string): void {
    const { width, height } = this.scale;
    const flash = this.add.rectangle(0, 0, width, height, 0x6ee7b7, 0.4).setOrigin(0).setDepth(60);
    this.tweens.add({ targets: flash, alpha: 0, duration: 900, onComplete: () => flash.destroy() });

    const big = this.add
      .text(width / 2, height * 0.32, `★ ${title.toUpperCase()} — SUKCES! ★`, {
        fontFamily: FONT,
        fontSize: '34px',
        fontStyle: 'bold',
        color: '#d1fae5',
        stroke: '#065f46',
        strokeThickness: 6,
        shadow: SHADOW,
        align: 'center',
        wordWrap: { width: width - 40 },
      })
      .setOrigin(0.5)
      .setDepth(61)
      .setScale(0.4)
      .setAlpha(0);
    this.tweens.add({ targets: big, scale: 1, alpha: 1, duration: 450, ease: 'Back.Out' });
    this.tweens.add({ targets: big, alpha: 0, y: big.y - 30, delay: 3600, duration: 700, onComplete: () => big.destroy() });

    this.tweens.killTweensOf(this.banner);
    this.banner.setText([`Wielka misja wykonana!`, detail]).setAlpha(1);
    this.tweens.add({ targets: this.banner, alpha: 0, delay: 4200, duration: 700 });
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

  /** Podpowiedzi sterowania — z aktualnie przypisanymi klawiszami. */
  private hintLines(virus: boolean, divideCost: number): string[] {
    const k = keyLabel;
    // Ruch: pierwsze klawisze 4 kierunków (np. „WASD”), a drugie — jeśli to strzałki — jako „strzałki”.
    const dirs = ['up', 'left', 'down', 'right'] as const;
    const first = dirs.map((d) => keyName(settings.keys[d][0]));
    const firstText = first.every((n) => n.length === 1) ? first.join('') : first.join(' ');
    const arrows = dirs.every((d, i) => settings.keys[d][1] === ['ArrowUp', 'ArrowLeft', 'ArrowDown', 'ArrowRight'][i]);
    const move = [settings.mouseFollow ? 'Mysz' : '', firstText, arrows ? 'strzałki' : ''].filter(Boolean).join(' / ');
    return [
      virus
        ? `${move} — ruch  ·  LPM/${k('ability')} — szarża  ·  dotknij komórki — zaraź  ·  ${k('convert')} — przerób komórkę  ·  ${k('pause')} — pauza`
        : `${move} — ruch  ·  LPM/${k('ability')} — toksyny  ·  PPM/${k('divide')} — podział (${divideCost})  ·  ${k('convert')} — przerób komórkę  ·  ${k('pause')} — pauza`,
      `Rozkazy (miejsce = kursor):  ${k('orderFollow')} — za mną  ·  ${k('orderAttack')} — atak  ·  ${k('orderHold')} — pozycja  ·  ${k('orderForage')} — ${virus ? 'zarażaj' : 'zbieraj'}   ·   ${k('editor')} — edytor  ·  ${k('map')} — mapa  ·  ${k('sound')} — dźwięk`,
    ];
  }

  private onKey(e: KeyboardEvent): void {
    // Edytor komórki i ustawienia mają własną obsługę klawiszy.
    if (this.scene.isActive('EditorScene') || this.scene.isActive('SettingsScene')) return;
    if (this.overlay) {
      if (e.code === 'KeyR') this.restart();
      else if (e.code === 'KeyM') this.toMenu();
      return;
    }
    if (isKey('pause', e.code)) {
      this.togglePause();
      audio.sfx('click');
      return;
    }
    if (isKey('sound', e.code)) {
      this.showToast(`Dźwięk: ${SOUND_MODE_NAMES[audio.cycleMode()]}`);
      audio.sfx('click');
      return;
    }
    if (isKey('map', e.code)) {
      this.toggleBigMap();
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
        .text(width / 2, height / 2 + 25, `${keyLabel('pause')} — wróć do gry   ·   M — menu`, { fontFamily: FONT, fontSize: '16px', color: MUTED })
        .setOrigin(0.5),
    );
    const settingsBtn = this.add
      .text(width / 2, height / 2 + 70, '⚙ Ustawienia', { fontFamily: FONT, fontSize: '17px', color: TEXT, backgroundColor: '#2a1019', padding: { x: 14, y: 7 } })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });
    settingsBtn.on('pointerdown', () => {
      audio.sfx('click');
      this.scene.launch('SettingsScene', { from: 'pause' });
      this.scene.bringToTop('SettingsScene');
    });
    c.add(settingsBtn);
    this.pauseOverlay = c;
  }

  // ───────────────────────── koniec gry ─────────────────────────

  private showGameOver(s: GameSummary, victory = false): void {
    this.mutationPanel?.destroy();
    this.mutationPanel = undefined;
    this.closeConvert();
    this.overlay?.destroy();
    const { width, height } = this.scale;
    const c = this.add.container(0, 0).setDepth(200);
    c.add(this.add.rectangle(0, 0, width, height, 0x000000, 0.7).setOrigin(0));

    c.add(
      this.add
        .text(width / 2, height / 2 - 60, victory ? `${currentAnimal().inside.replace('Wnętrze', 'Organizm')} podbity! Wygrana!` : SPECIES[s.species].deathText, {
          fontFamily: FONT,
          fontSize: '32px',
          fontStyle: 'bold',
          color: victory ? '#86efac' : '#fca5a5',
        })
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
    this.gs.scene.restart({ species: this.gs.species.id, animal: this.gs.animal, mode: this.gs.mode });
  }

  private toMenu(): void {
    this.scene.stop('GameScene');
    this.scene.start('MenuScene');
  }
}
