import Phaser from 'phaser';
import { CHUNK } from '../config';
import { GameEvents } from '../events';
import { TEX, createTextures } from '../graphics/textures';
import { net, type SnapObj, type ToGuest, type ToHost } from '../net/link';
import { settings } from '../settings';
import { WallLayer } from '../world/WallLayer';
import { setAnimal, setStartZone, startZone, type AnimalId } from '../world/animal';
import { findOpenSpot } from '../world/walls';

interface View {
  img: Phaser.GameObjects.Image;
  tx: number;
  ty: number;
  hp: number;
  seen: number;
}

/**
 * Scena gościa w grze wieloosobowej: nie liczy rozgrywki, tylko rysuje migawki od gospodarza,
 * wysyła swoje sterowanie i pokazuje prosty HUD. Świat (ściany, tło) jest deterministyczny,
 * więc wystarczy znać zwierzę i strefę startu.
 */
export class GuestScene extends Phaser.Scene {
  private walls?: WallLayer;
  private tiles: Phaser.GameObjects.Image[] = [];
  private views = new Map<number, View>();
  private bars!: Phaser.GameObjects.Graphics;
  private hud!: Phaser.GameObjects.Text;
  private center!: Phaser.GameObjects.Text;
  private held = new Set<string>();
  private you = -1;
  private seq = 0;
  private sendIn = 0;
  private camPos = new Phaser.Math.Vector2();
  private respawn = 0;
  private ended = false;
  private info = { hp: 0, maxHp: 1, level: 1, time: 0, players: [] as string[] };

  constructor() {
    super('GuestScene');
  }

  create(): void {
    createTextures(this);
    this.cameras.main.setBackgroundColor('#1c0a10');
    this.bars = this.add.graphics().setDepth(10);
    const style = { fontFamily: 'system-ui, sans-serif', fontSize: '16px', color: '#f5e9ee', stroke: '#1c0a10', strokeThickness: 4 };
    this.hud = this.add.text(12, 10, '', style).setScrollFactor(0).setDepth(20);
    this.center = this.add
      .text(this.scale.width / 2, this.scale.height / 2, 'Połączono. Czekam, aż gospodarz rozpocznie grę…', { ...style, fontSize: '22px', align: 'center' })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(20);
    this.scale.on('resize', (s: Phaser.Structs.Size) => this.center.setPosition(s.width / 2, s.height / 2));

    const kb = this.input.keyboard!;
    kb.on('keydown', (e: KeyboardEvent) => {
      this.held.add(e.code);
      if (e.code === 'Escape') this.leave();
    });
    kb.on('keyup', (e: KeyboardEvent) => this.held.delete(e.code));
    this.input.on('pointerdown', () => this.center.text.includes('Esc') && this.leave());
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.walls?.destroy());

    const link = net.links[0];
    if (!link) return this.end('Brak połączenia z gospodarzem.');
    link.onMessage = (m) => this.onMessage(m as ToGuest);
    link.onChange = () => {
      if (!link.open) this.end('Gospodarz się rozłączył.');
    };
    if (link.closed) this.end('Gospodarz się rozłączył.');
  }

  private leave(): void {
    this.game.events.emit(GameEvents.Logout);
  }

  private end(text: string): void {
    this.ended = true;
    this.center.setText(`${text}\nNaciśnij Esc, aby wyjść.`);
  }

  private onMessage(m: ToGuest): void {
    if (m.t === 'init') {
      for (const v of this.views.values()) v.img.destroy();
      this.views.clear();
      this.walls?.destroy();
      setAnimal(m.animal as AnimalId);
      setStartZone(m.zone);
      this.walls = new WallLayer(this);
      const z = startZone();
      const s = z ? findOpenSpot(90, z.x, z.y) : findOpenSpot(90);
      this.camPos.set(s.x, s.y);
      this.walls.update(s.x, s.y, this.scale.width / 1.5, this.scale.height / 1.5, Infinity);
      if (!this.tiles.length) {
        for (let i = 0; i < 16; i++) {
          this.tiles.push(
            this.add
              .image(0, 0, TEX.tissue)
              .setOrigin(0)
              .setDisplaySize(CHUNK.texW * CHUNK.scale + 2, CHUNK.texH * CHUNK.scale + 2)
              .setDepth(0),
          );
        }
      }
      this.cameras.main.centerOn(s.x, s.y);
      this.center.setText('');
    } else if (m.t === 'over') {
      this.end(m.text);
    } else if (m.t === 'snap') {
      this.applySnapshot(m);
    }
  }

  private applySnapshot(m: Extract<ToGuest, { t: 'snap' }>): void {
    this.you = m.you;
    this.respawn = m.respawn;
    this.info = { hp: m.hp, maxHp: m.maxHp, level: m.level, time: m.time, players: m.players };
    const seen = ++this.seq;
    for (const o of m.objs as SnapObj[]) {
      const [id, x, y, rot, sx, sy, tex, tint, alpha, blend, depth, hp] = o;
      let v = this.views.get(id);
      if (!v) {
        if (!this.textures.exists(tex)) continue;
        const img = this.add.image(x, y, tex);
        v = { img, tx: x, ty: y, hp, seen };
        this.views.set(id, v);
      }
      v.tx = x;
      v.ty = y;
      v.hp = hp;
      v.seen = seen;
      const img = v.img;
      if (img.texture.key !== tex && this.textures.exists(tex)) img.setTexture(tex);
      img.setRotation(rot).setScale(sx, sy).setAlpha(alpha).setDepth(depth);
      img.setBlendMode(blend);
      if (tint < 0) img.clearTint();
      else img.setTint(tint);
    }
    for (const [id, v] of this.views) {
      if (v.seen !== seen) {
        v.img.destroy();
        this.views.delete(id);
      }
    }
  }

  update(_t: number, delta: number): void {
    const dt = Math.min(delta, 50) / 1000;
    const k = 1 - Math.exp(-dt * 18);
    this.bars.clear();
    for (const v of this.views.values()) {
      v.img.x = Phaser.Math.Linear(v.img.x, v.tx, k);
      v.img.y = Phaser.Math.Linear(v.img.y, v.ty, k);
      if (v.hp >= 0 && v.hp < 1) {
        const w = Math.max(20, v.img.displayWidth * 0.6);
        this.bars.fillStyle(0x000000, 0.55).fillRect(v.img.x - w / 2, v.img.y - v.img.displayHeight / 2 - 10, w, 4);
        this.bars.fillStyle(0xf87171, 1).fillRect(v.img.x - w / 2, v.img.y - v.img.displayHeight / 2 - 10, w * v.hp, 4);
      }
    }

    // Kamera podąża za własną komórką (albo zostaje, gdy gracz czeka na odrodzenie).
    const me = this.views.get(this.you);
    const cam = this.cameras.main;
    if (me) {
      this.camPos.set(me.img.x, me.img.y);
      cam.centerOn(me.img.x, me.img.y);
    }
    this.walls?.update(this.camPos.x, this.camPos.y, this.scale.width / 2, this.scale.height / 2, 4);
    const cw = CHUNK.texW * CHUNK.scale;
    const ch = CHUNK.texH * CHUNK.scale;
    const x0 = Math.floor(cam.worldView.x / cw);
    const y0 = Math.floor(cam.worldView.y / ch);
    this.tiles.forEach((t, i) => t.setPosition((x0 + (i % 4)) * cw, (y0 + Math.floor(i / 4)) * ch));

    // Sterowanie: kierunek z klawiszy (te same przypisania co w grze), ~20 razy na sekundę.
    this.sendIn -= dt;
    if (this.sendIn <= 0 && !this.ended) {
      this.sendIn = 0.05;
      const h = (a: 'up' | 'down' | 'left' | 'right') => settings.keys[a].some((c) => c && this.held.has(c));
      const msg: ToHost = { t: 'in', dx: Number(h('right')) - Number(h('left')), dy: Number(h('down')) - Number(h('up')) };
      net.links[0]?.send(msg);
    }

    const i = this.info;
    const lines = [`Zdrowie: ${Math.max(0, Math.ceil(i.hp))}/${Math.ceil(i.maxHp)}`, `Poziom gospodarza: ${i.level} · czas ${Math.floor(i.time / 60)}:${String(Math.floor(i.time % 60)).padStart(2, '0')}`];
    if (i.players.length) lines.push(`Gracze: ${i.players.join(', ')}`);
    if (this.respawn > 0) lines.push(`Odrodzenie za ${Math.ceil(this.respawn)} s`);
    lines.push('Esc — wyjście');
    this.hud.setText(lines.join('\n'));
  }
}
