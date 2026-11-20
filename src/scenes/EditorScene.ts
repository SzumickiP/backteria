import Phaser from 'phaser';
import { audio } from '../audio/AudioEngine';
import { BODY_LIMITS, body, bodyAxes, bodyStretch, saveBody, type BodyDesign } from '../body';
import { drawFeelers, drawOrganelles } from '../graphics/organelleDraw';
import { organellesFor, type OrganelleDef, type PlacedOrganelle } from '../organelles';
import { isKey, keyLabel } from '../settings';
import type { GameScene } from './GameScene';

const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';
const TEXT = '#f5e9ee';
const MUTED = '#c29aa8';
const ACCENT = '#6ee7b7';

/**
 * Edytor komórki (ewolucja): gracz sam buduje swoją komórkę, dokładając organella
 * w wybranych miejscach i płacąc punktami DNA. Gra jest w tym czasie zatrzymana.
 */
export class EditorScene extends Phaser.Scene {
  private gs!: GameScene;
  private defs: OrganelleDef[] = [];
  private selected?: OrganelleDef;
  private preview!: Phaser.GameObjects.Image;
  private gfx!: Phaser.GameObjects.Graphics;
  private ghost!: Phaser.GameObjects.Graphics;
  private header!: Phaser.GameObjects.Text;
  private statsText!: Phaser.GameObjects.Text;
  private message!: Phaser.GameObjects.Text;
  private buttons: { def: OrganelleDef; rect: Phaser.GameObjects.Rectangle; info: Phaser.GameObjects.Text }[] = [];
  private tab: 'organelles' | 'body' = 'organelles';
  private paletteObjs: Phaser.GameObjects.GameObject[] = [];
  private bodyObjs: Phaser.GameObjects.GameObject[] = [];
  private tabButtons: { tab: 'organelles' | 'body'; b: Phaser.GameObjects.Text }[] = [];
  private bodyRows: { key: keyof BodyDesign; label: Phaser.GameObjects.Text; fmt: (v: number) => string; text: string }[] = [];
  private center = { x: 0, y: 0 };
  private R = 100;

  constructor() {
    super('EditorScene');
  }

  create(): void {
    this.gs = this.scene.get('GameScene') as GameScene;
    const sp = this.gs.species;
    this.defs = organellesFor(sp.id);
    this.selected = undefined;
    this.buttons = [];
    this.bodyRows = [];
    const { width, height } = this.scale;
    const narrow = width < 760;

    this.add.rectangle(0, 0, width, height, 0x0d0408, 0.86).setOrigin(0).setInteractive();
    this.add
      .text(width / 2, 18, 'Edytor komórki — ewolucja', { fontFamily: FONT, fontSize: '26px', fontStyle: 'bold', color: TEXT })
      .setOrigin(0.5, 0);
    this.header = this.add.text(width / 2, 54, '', { fontFamily: FONT, fontSize: '14px', color: MUTED, align: 'center' }).setOrigin(0.5, 0);

    // Podgląd komórki.
    this.center = { x: narrow ? width / 2 : width * 0.36, y: narrow ? height * 0.33 : height * 0.52 };
    this.R = Math.min(width, height) * (narrow ? 0.11 : 0.15);
    this.add.circle(this.center.x, this.center.y, this.R * 2.3, 0x1c0a10, 1).setStrokeStyle(2, 0x5a2232);
    this.preview = this.add.image(this.center.x, this.center.y, sp.texture).setScale(this.R / sp.texRadius);
    this.gfx = this.add.graphics();
    this.ghost = this.add.graphics().setAlpha(0.5);
    this.statsText = this.add
      .text(narrow ? 16 : 24, narrow ? height * 0.33 + this.R * 2.4 : height - 24, '', { fontFamily: FONT, fontSize: '13px', color: TEXT, lineSpacing: 3 })
      .setOrigin(0, narrow ? 0 : 1);
    this.message = this.add.text(this.center.x, this.center.y + this.R * 2.3 + 10, '', { fontFamily: FONT, fontSize: '14px', color: '#fca5a5' }).setOrigin(0.5, 0);

    // Zakładki: organella (za punkty DNA) / ciało bakterii (kształt, rozmiar, czułki — za darmo).
    const px = narrow ? 16 : width * 0.64;
    const pw = narrow ? width - 32 : Math.min(360, width * 0.33);
    let py = narrow ? height * 0.33 + this.R * 2.4 + 84 : 96;
    const hasBody = sp.rod;
    this.tab = 'organelles';
    this.paletteObjs = [];
    this.bodyObjs = [];
    this.tabButtons = [];
    if (hasBody) {
      const mk = (label: string, tab: 'organelles' | 'body', x: number) => {
        const b = this.add
          .text(x, py, label, { fontFamily: FONT, fontSize: '15px', padding: { x: 12, y: 6 } })
          .setInteractive({ useHandCursor: true });
        b.on('pointerdown', () => {
          audio.sfx('click');
          this.setTab(tab);
        });
        this.tabButtons.push({ tab, b });
      };
      mk('Organella (DNA)', 'organelles', px);
      mk('Ciało: kształt, rozmiar, czułki', 'body', px + 150);
      py += 40;
    }
    const bodyTop = py;
    const rowH = narrow ? 46 : 58;
    for (const def of this.defs) {
      const rect = this.add.rectangle(px, py, pw, rowH - 6, 0x2a1019, 0.95).setOrigin(0).setStrokeStyle(2, 0x5a2232).setInteractive({ useHandCursor: true });
      const dot = this.add.circle(px + 16, py + (rowH - 6) / 2, 7, def.color);
      const info = this.add.text(px + 32, py + 5, '', { fontFamily: FONT, fontSize: narrow ? '12px' : '14px', color: TEXT, lineSpacing: 2, wordWrap: { width: pw - 40 } });
      rect.on('pointerdown', (p: Phaser.Input.Pointer) => {
        if (p.rightButtonDown() || this.tab !== 'organelles') return;
        this.selected = def;
        this.message.setText('');
        audio.sfx('click');
      });
      this.buttons.push({ def, rect, info });
      this.paletteObjs.push(rect, dot, info);
      py += rowH;
    }

    const auto = this.add
      .text(narrow ? width / 2 : px + pw / 2, narrow ? height - 76 : py + 12, 'Zbuduj automatycznie  [A]', {
        fontFamily: FONT, fontSize: '16px', color: '#1c0a10', backgroundColor: '#fde68a', padding: { x: 14, y: 7 },
      })
      .setOrigin(0.5, 0)
      .setInteractive({ useHandCursor: true });
    auto.on('pointerdown', () => this.tab === 'organelles' && this.autoBuild());
    this.paletteObjs.push(auto);
    py += 46;

    // Panel „Ciało” (tylko bakteria): −/+ przy każdym parametrze.
    if (hasBody) {
      const rows: { key: keyof BodyDesign; label: string; fmt: (v: number) => string }[] = [
        { key: 'shape', label: 'Kształt', fmt: (v) => (v < 0.25 ? 'kulisty' : v > 0.75 ? 'długa pałeczka' : v < 0.45 ? 'owalny' : 'pałeczka') },
        { key: 'size', label: 'Rozmiar', fmt: (v) => `${Math.round(v * 100)}%` },
        { key: 'feelers', label: 'Czułki', fmt: (v) => (v === 0 ? 'brak' : String(v)) },
        { key: 'feelerLen', label: 'Długość czułków', fmt: (v) => `${Math.round(v * 100)}%` },
      ];
      let by = bodyTop;
      for (const r of rows) {
        const label = this.add.text(px, by + 6, '', { fontFamily: FONT, fontSize: '15px', color: TEXT });
        const mkBtn = (txt: string, x: number, dir: number) => {
          const b = this.add
            .text(x, by, txt, { fontFamily: FONT, fontSize: '20px', fontStyle: 'bold', color: '#1c0a10', backgroundColor: '#6ee7b7', padding: { x: 12, y: 2 } })
            .setInteractive({ useHandCursor: true });
          b.on('pointerdown', () => this.changeBody(r.key, dir));
          this.bodyObjs.push(b);
        };
        mkBtn('−', px + pw - 84, -1);
        mkBtn('+', px + pw - 38, 1);
        this.bodyObjs.push(label);
        this.bodyRows.push({ key: r.key, fmt: r.fmt, label, text: r.label });
        by += 46;
      }
      const hint = this.add.text(
        px, by + 8,
        'Kształt i rozmiar: kulista i duża — wytrzymała, ale wolna; długa i mała — szybka i krucha.\nCzułki wyczuwają pożywienie z dalszej odległości i wydłużają zasięg ataku, ale spowalniają.\nZmiany nic nie kosztują i działają od razu.',
        { fontFamily: FONT, fontSize: '12px', color: MUTED, lineSpacing: 3, wordWrap: { width: pw } },
      );
      this.bodyObjs.push(hint);
    }
    this.setTab('organelles');

    const done = this.add
      .text(narrow ? width / 2 : px + pw / 2, narrow ? height - 30 : py + 16, `Gotowe — wróć do gry  [${keyLabel('editor')} / Esc]`, {
        fontFamily: FONT, fontSize: '16px', color: '#1c0a10', backgroundColor: '#6ee7b7', padding: { x: 14, y: 7 },
      })
      .setOrigin(0.5, 0)
      .setInteractive({ useHandCursor: true });
    done.on('pointerdown', () => this.close());

    this.input.mouse?.disableContextMenu();
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => this.onClick(p));
    const onKey = (e: KeyboardEvent) => {
      if (isKey('editor', e.code) || e.code === 'Escape') this.close();
      else if (e.code === 'KeyA') this.autoBuild();
    };
    this.input.keyboard!.on('keydown', onKey);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.input.keyboard?.off('keydown', onKey));
  }

  update(time: number): void {
    const gs = this.gs;
    const sp = gs.species;
    this.header.setText(
      `Punkty DNA: ${gs.dna}   ·   wybierz organellum z listy i kliknij miejsce na komórce   ·   PPM na organellum — usuń (zwrot DNA)`,
    );

    for (const b of this.buttons) {
      const n = gs.organelleCount(b.def.id);
      const can = gs.dna >= b.def.cost && n < b.def.max;
      const sel = this.selected === b.def;
      b.rect.setStrokeStyle(sel ? 3 : 2, sel ? 0x6ee7b7 : can ? 0x7a3a52 : 0x3a2a30);
      b.rect.setFillStyle(sel ? 0x1f3b33 : 0x2a1019, can || sel ? 0.95 : 0.5);
      b.info.setText(`${b.def.name}  ·  ${b.def.cost} DNA  ·  ${n}/${b.def.max}\n${b.def.description}`).setColor(can || sel ? TEXT : MUTED);
    }

    const s = gs.stats;
    const lines = [
      `Zdrowie ${Math.round(s.maxHp)}   ·   prędkość ${Math.round(s.speed)}   ·   obrażenia ${s.damage.toFixed(0)}   ·   zasięg ${Math.round(s.reach)}`,
      `Regeneracja ${s.regen.toFixed(1)}/s   ·   pancerz ${Math.round((1 - s.armor) * 100)}%   ·   ${sp.colonyLabel.toLowerCase()} maks. ${s.maxColony}`,
      sp.id === 'virus'
        ? `Kopie z infekcji ${s.copies}   ·   szarża ${s.abilityDamage.toFixed(0)} obr., ${s.dashDuration.toFixed(2)} s   ·   kamuflaż ${Math.round((1 - s.stealth) * 100)}%`
        : `Salwa toksyn ${s.shots} × ${s.abilityDamage.toFixed(0)} obr.   ·   przyciąganie pożywienia +${Math.round(s.magnet)} px`,
    ];
    this.statsText.setText(lines);

    const t = time / 1000;
    const st = sp.rod ? bodyStretch() : { x: 1, y: 1 };
    const k = (this.R / sp.texRadius) * (1 + Math.sin(t * 3) * 0.015);
    this.preview.setScale(k * st.x, k * st.y);
    for (const r of this.bodyRows) r.label.setText(`${r.text}: ${r.fmt(body[r.key])}`);
    this.gfx.clear();
    if (sp.rod) drawFeelers(this.gfx, this.center.x, this.center.y, this.R, 0, t);
    drawOrganelles(this.gfx, this.center.x, this.center.y, this.R, 0, sp.rod, gs.organelles, gs.organelleDefs, t);

    // Podgląd miejsca pod kursorem.
    this.ghost.clear();
    if (this.selected && this.tab === 'organelles') {
      const placed = this.placementAt(this.input.activePointer.x, this.input.activePointer.y, this.selected);
      if (placed) drawOrganelles(this.ghost, this.center.x, this.center.y, this.R, 0, sp.rod, [placed], gs.organelleDefs, t);
    }
  }

  /** Gdzie trafiłoby organellum po kliknięciu w (x, y) — albo undefined, gdy poza dozwolonym obszarem. */
  private placementAt(x: number, y: number, def: OrganelleDef): PlacedOrganelle | undefined {
    const rod = this.gs.species.rod;
    const lx = (x - this.center.x) / this.R;
    const ly = (y - this.center.y) / this.R;
    const { ax, ay } = bodyAxes(rod);
    const nd = Math.hypot(lx / ax, ly / ay); // 1 = na błonie
    const angle = Math.atan2(ly / ay, lx / ax);
    switch (def.placement) {
      case 'edge':
        return nd > 0.55 && nd < 1.9 ? { id: def.id, angle, dist: 1 } : undefined;
      case 'inside':
        return nd < 1.05 ? { id: def.id, angle, dist: Math.min(0.75, nd) } : undefined;
      case 'shell':
        return nd < 2 ? { id: def.id, angle: 0, dist: 1 } : undefined;
    }
  }

  private onClick(p: Phaser.Input.Pointer): void {
    const gs = this.gs;
    if (p.rightButtonDown()) {
      // Usuń najbliższe organellum pod kursorem.
      const rod = gs.species.rod;
      let best = -1;
      let bestD = 0.4;
      gs.organelles.forEach((o, i) => {
        const { ax, ay } = bodyAxes(rod);
        const k = gs.organelleDefs.get(o.id)?.placement === 'shell' ? 1.2 : o.dist;
        const ox = Math.cos(o.angle) * ax * k;
        const oy = Math.sin(o.angle) * ay * k;
        const d = Math.hypot((p.x - this.center.x) / this.R - ox, (p.y - this.center.y) / this.R - oy);
        if (d < bestD) {
          bestD = d;
          best = i;
        }
      });
      if (best >= 0) {
        gs.removeOrganelle(best);
        this.message.setColor(ACCENT).setText('Usunięto organellum (zwrot DNA)');
      }
      return;
    }
    if (!this.selected || this.tab !== 'organelles') return;
    const placed = this.placementAt(p.x, p.y, this.selected);
    if (!placed) return;
    const err = gs.addOrganelle(placed);
    if (err) audio.sfx('error');
    if (err) this.message.setColor('#fca5a5').setText(err);
    else this.message.setColor(ACCENT).setText(`Dodano: ${this.selected.name}`);
  }

  /**
   * Automatyczna budowa: wydaje wszystkie punkty DNA, po kolei dokładając organella tak,
   * by rozwijać każdy rodzaj po trochu (najmniej zapełniony pierwszy), rozmieszczone równo wokół komórki.
   */
  private autoBuild(): void {
    const gs = this.gs;
    let added = 0;
    for (let guard = 0; guard < 60; guard++) {
      const options = this.defs
        .filter((d) => d.cost <= gs.dna && gs.organelleCount(d.id) < d.max)
        .sort((a, b) => gs.organelleCount(a.id) / a.max - gs.organelleCount(b.id) / b.max);
      const def = options[0];
      if (!def) break;
      const placed = this.autoPlace(def);
      if (gs.addOrganelle(placed)) break;
      added++;
    }
    if (added > 0) {
      audio.sfx('click');
      this.message.setColor(ACCENT).setText(`Zbudowano automatycznie: ${added} organelli`);
    } else {
      audio.sfx('error');
      this.message.setColor('#fca5a5').setText(gs.dna <= 0 ? 'Brak punktów DNA' : 'Nie ma czego dobudować za tyle DNA');
    }
  }

  /** Miejsce dla organellum: kąt jak najdalej od już ustawionych (równomierne rozłożenie). */
  private autoPlace(def: OrganelleDef): PlacedOrganelle {
    if (def.placement === 'shell') return { id: def.id, angle: 0, dist: 1 };
    const taken = this.gs.organelles
      .filter((o) => this.gs.organelleDefs.get(o.id)?.placement === def.placement)
      .map((o) => o.angle);
    let best = 0;
    let bestGap = -1;
    const steps = 24;
    for (let i = 0; i < steps; i++) {
      const a = (i / steps) * Math.PI * 2 - Math.PI;
      let gap = Math.PI;
      for (const t of taken) gap = Math.min(gap, Math.abs(Phaser.Math.Angle.Wrap(a - t)));
      if (gap > bestGap + 1e-6) {
        bestGap = gap;
        best = a;
      }
    }
    return { id: def.id, angle: best, dist: def.placement === 'edge' ? 1 : 0.45 };
  }

  /** Przełącza zakładkę: lista organelli albo panel budowy ciała. */
  private setTab(tab: 'organelles' | 'body'): void {
    this.tab = tab;
    if (tab === 'body') this.selected = undefined;
    for (const o of this.paletteObjs) (o as Phaser.GameObjects.Components.Visible & Phaser.GameObjects.GameObject).setVisible?.(tab === 'organelles');
    for (const o of this.bodyObjs) (o as Phaser.GameObjects.Components.Visible & Phaser.GameObjects.GameObject).setVisible?.(tab === 'body');
    for (const { tab: t, b } of this.tabButtons) {
      const on = t === tab;
      b.setColor(on ? '#1c0a10' : TEXT).setBackgroundColor(on ? '#6ee7b7' : '#2a1019');
    }
  }

  /** Zmienia parametr budowy ciała o jeden krok i od razu stosuje go w grze. */
  private changeBody(key: keyof BodyDesign, dir: number): void {
    if (this.tab !== 'body') return;
    const lim = BODY_LIMITS[key];
    const v = Math.round((body[key] + dir * lim.step) * 100) / 100;
    body[key] = Math.min(lim.max, Math.max(lim.min, v));
    saveBody();
    this.gs.applyBodyDesign();
    audio.sfx('click');
  }

  private close(): void {
    this.scene.resume('GameScene');
    this.scene.stop();
  }
}
