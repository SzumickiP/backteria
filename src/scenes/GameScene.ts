import Phaser from 'phaser';
import {
  ACTIVE_RADIUS,
  CHUNK,
  COLORS,
  CONVERT,
  DASH,
  DESPAWN_RADIUS,
  ENEMY_DESPAWN_RADIUS,
  DIFFICULTY,
  DNA,
  PROGRESSION,
  STRUCTURES,
  FIRST_MISSION_AT,
  HOST_CELL_TARGET,
  MISSION_COOLDOWN,
  NUTRIENT_TARGET,
  PREY_BACTERIA_TARGET,
  PROTEIN,
  RBC_TARGET,
  THREAT_PERIOD,
  TOXIN,
} from '../config';
import { audio } from '../audio/AudioEngine';
import { Cell } from '../entities/Cell';
import { ENEMY_DEFS, Enemy, type EnemyKind } from '../entities/Enemy';
import { Nutrient } from '../entities/Nutrient';
import { Organ } from '../entities/Organ';
import { Prey } from '../entities/Prey';
import { Structure, type StructureKind } from '../entities/Structure';
import { GameEvents, type GameSummary, type MissionType } from '../events';
import { drawOrganelles } from '../graphics/organelleDraw';
import { TEX, createTextures } from '../graphics/textures';
import { rollMutations, type Mutation, type PlayerStats } from '../mutations';
import { organellesFor, type OrganelleDef, type PlacedOrganelle } from '../organelles';
import { SPECIES, type SpeciesDef, type SpeciesId } from '../species';
import { WallLayer } from '../world/WallLayer';
import { BIOMES, type BiomeId } from '../world/biomes';
import { Navigator, avoidWalls } from '../world/navigation';
import { biomeAt, blockedCircle, findOpenSpot, isWall } from '../world/walls';

type ControlMode = 'none' | 'mouse' | 'keyboard';
type KeyName = 'up' | 'down' | 'left' | 'right' | 'w' | 'a' | 's' | 'd' | 'space' | 'f' | 'e' | 'q' | 'g' | 'h' | 't' | 'v';

/** Rozkazy dla kolonii / kopii. */
export type ColonyOrder = 'follow' | 'attack' | 'hold' | 'forage';

export const ORDER_NAMES: Record<ColonyOrder, string> = {
  follow: 'Za mną',
  attack: 'Atak',
  hold: 'Trzymaj pozycję',
  forage: 'Zbieraj',
};
type Point = { x: number; y: number };

interface Drifter {
  img: Phaser.GameObjects.Image;
  vx: number;
  vy: number;
  spin: number;
}

interface Mote {
  img: Phaser.GameObjects.Image;
  bx: number;
  by: number;
  /** współczynnik paralaksy (>1 = bliżej obiektywu) */
  f: number;
}

interface Mission {
  type: MissionType;
  organ: Organ;
  timeLeft: number;
  spawnTimer: number;
  /** odliczanie do następnego wystrzału białka */
  fireTimer: number;
}

/** Pocisk: białko obronne narządu albo toksyna gracza. */
interface Projectile {
  img: Phaser.GameObjects.Image;
  vx: number;
  vy: number;
  speed: number;
  /** cel do naprowadzania (białka narządu); brak = lot prosty */
  target?: Cell;
  life: number;
  damage: number;
  /** true — leci w gracza i jego kopie; false — w wrogów */
  hostile: boolean;
  burstColor: number;
}

export interface MissionInfo {
  type: MissionType;
  timeLeft: number;
  hpFrac: number;
  x: number;
  y: number;
}

const TAU = Math.PI * 2;
const MOVE_CODES = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);
const MOTE_COUNT = 45;
const dist = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);

/**
 * Główna scena: nieskończona mapa z tunelami, ciągła rozgrywka, zadania.
 * HUD i menu mutacji są w UIScene, która czyta publiczne pola tej sceny.
 */
export class GameScene extends Phaser.Scene {
  species!: SpeciesDef;
  stats!: PlayerStats;
  player!: Cell;
  allies: Cell[] = [];
  enemies: Enemy[] = [];
  biomass = 0;
  xp = 0;
  level = 1;
  kills = 0;
  missionsDone = 0;
  elapsed = 0;
  nextMissionAt = 0;
  /** pozostały czas odnowienia ataku specjalnego (s) */
  abilityCd = 0;
  /** pozostały czas do możliwości przerobienia kolejnej komórki (s) */
  convertCd = 0;
  structures: Structure[] = [];
  /** punkty DNA do wydania w edytorze komórki */
  dna = 0;
  /** organella dodane przez gracza do komórki */
  organelles: PlacedOrganelle[] = [];
  private appliedMutations: Mutation[] = [];
  private organelleGfx!: Phaser.GameObjects.Graphics;
  /** biom, w którym jest gracz */
  biome: BiomeId = 'tissue';
  /** aktualny rozkaz dla kolonii */
  order: ColonyOrder = 'follow';
  private orderPoint: Point = { x: 0, y: 0 };
  private orderTarget?: Cell;
  private biomeCheck = 0;

  private convertTarget?: Organ;
  /** nawigacja: mapa odległości do gracza (droga naokoło ścian) */
  private nav = new Navigator();
  private flowTimer = 0;

  private mission?: Mission;
  private nutrients: Nutrient[] = [];
  private hostCells: Organ[] = [];
  private preyBacteria: Prey[] = [];
  private chunks: Phaser.GameObjects.Image[] = [];
  private walls!: WallLayer;
  private drifters: Drifter[] = [];
  private motes: Mote[] = [];
  private projectiles: Projectile[] = [];
  /** czas podświetlenia gracza po trafieniu pociskiem */
  private playerHitFlash = 0;
  private dashTime = 0;
  private dashDir: Point = { x: 1, y: 0 };
  private dashHits = new Set<Cell>();
  /** ostatni kierunek ruchu — celowanie przy sterowaniu klawiaturą */
  private aim: Point = { x: 0, y: -1 };
  private spawnTimer = 0;
  private pendingLevelUps = 0;
  private offerOpen = false;
  private over = false;
  private control: ControlMode = 'none';
  private keys!: Record<KeyName, Phaser.Input.Keyboard.Key>;
  private bars!: Phaser.GameObjects.Graphics;
  private flagella!: Phaser.GameObjects.Graphics;

  constructor() {
    super('GameScene');
  }

  get isVirus(): boolean {
    return this.species.id === 'virus';
  }

  /** Poziom zagrożenia — rośnie płynnie z czasem (1, 2, 3...). */
  get threat(): number {
    return 1 + this.elapsed / THREAT_PERIOD;
  }

  get xpToNext(): number {
    return PROGRESSION.xpBase + this.level * PROGRESSION.xpPerLevel;
  }

  get missionInfo(): MissionInfo | undefined {
    const m = this.mission;
    if (!m) return undefined;
    return {
      type: m.type,
      timeLeft: Math.max(0, m.timeLeft),
      hpFrac: Phaser.Math.Clamp(m.organ.hp / m.organ.maxHp, 0, 1),
      x: m.organ.x,
      y: m.organ.y,
    };
  }

  get nextMissionIn(): number {
    return Math.max(0, this.nextMissionAt - this.elapsed);
  }

  /** Scena jest restartowana na tej samej instancji — stan resetujemy tutaj. */
  init(data: { species?: SpeciesId }): void {
    this.species = SPECIES[data.species ?? this.species?.id ?? 'bacterium'];
    this.stats = { ...this.species.stats };
    this.allies = [];
    this.enemies = [];
    this.nutrients = [];
    this.hostCells = [];
    this.preyBacteria = [];
    this.chunks = [];
    this.drifters = [];
    this.motes = [];
    this.projectiles = [];
    this.playerHitFlash = 0;
    this.dashTime = 0;
    this.dashHits = new Set();
    this.aim = { x: 0, y: -1 };
    this.abilityCd = 0;
    this.convertCd = 0;
    this.structures = [];
    this.dna = 0;
    this.organelles = [];
    this.appliedMutations = [];
    this.convertTarget = undefined;
    this.nav = new Navigator();
    this.flowTimer = 0;
    this.biome = 'tissue';
    this.biomeCheck = 0;
    this.order = 'follow';
    this.orderTarget = undefined;
    this.mission = undefined;
    this.biomass = 0;
    this.xp = 0;
    this.level = 1;
    this.kills = 0;
    this.missionsDone = 0;
    this.elapsed = 0;
    this.nextMissionAt = FIRST_MISSION_AT;
    this.spawnTimer = 3;
    this.pendingLevelUps = 0;
    this.offerOpen = false;
    this.over = false;
    this.control = 'none';
  }

  create(): void {
    createTextures(this);
    Cell.blocked = blockedCircle;
    this.walls = new WallLayer(this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.walls.destroy();
      Cell.blocked = null;
    });

    const sp = this.species;
    const start = findOpenSpot(90);
    this.player = new Cell(this, start.x, start.y, sp.baseRadius, sp.texture, sp.texRadius, this.stats.maxHp).setDepth(5);
    this.player.setRotation(-Math.PI / 2);

    this.createEnvironment();
    this.walls.update(start.x, start.y, this.scale.width / 1.5, this.scale.height / 1.5, Infinity);
    // Komórki ciała: wirus je zaraża, a obie postacie mogą je przerabiać na budowle.
    this.fill(() => this.hostCells.length < this.hostTarget, () => this.spawnHostCell(250), 400);
    if (this.isVirus) {
      this.fill(() => this.preyBacteria.length < PREY_BACTERIA_TARGET, () => this.spawnPrey(250), 400);
    } else {
      this.fill(() => this.nutrients.length < NUTRIENT_TARGET, () => this.spawnNutrient(60), 1500);
    }

    this.flagella = this.add.graphics().setDepth(2.9);
    this.organelleGfx = this.add.graphics().setDepth(5.2);
    this.bars = this.add.graphics().setDepth(10);

    const cam = this.cameras.main;
    cam.removeBounds();
    cam.roundPixels = true;
    cam.startFollow(this.player, true, 0.12, 0.12);
    cam.setZoom(1);
    if (this.game.renderer.type === Phaser.WEBGL && cam.postFX) {
      cam.postFX.clear();
      cam.postFX.addVignette(0.5, 0.5, 0.82, 0.32);
    }

    this.setupInput();

    if (!this.scene.isActive('UIScene')) this.scene.launch('UIScene');
    this.game.events.emit(GameEvents.Start);
    audio.playMusic(biomeAt(this.player.x, this.player.y).a);
  }

  update(_time: number, delta: number): void {
    const dt = Math.min(delta, 50) / 1000;
    this.updateEnvironment(dt);
    if (this.over) return;
    this.elapsed += dt;
    this.abilityCd = Math.max(0, this.abilityCd - dt);
    this.convertCd = Math.max(0, this.convertCd - dt);
    this.updateBiome(dt);

    if (Phaser.Input.Keyboard.JustDown(this.keys.space)) this.divide();
    if (Phaser.Input.Keyboard.JustDown(this.keys.f)) this.useAbility();
    if (Phaser.Input.Keyboard.JustDown(this.keys.e)) this.requestConvert();
    if (Phaser.Input.Keyboard.JustDown(this.keys.q)) this.issueOrder('follow');
    if (Phaser.Input.Keyboard.JustDown(this.keys.g)) this.issueOrder('attack');
    if (Phaser.Input.Keyboard.JustDown(this.keys.h)) this.issueOrder('hold');
    if (Phaser.Input.Keyboard.JustDown(this.keys.t)) this.issueOrder('forage');
    if (Phaser.Input.Keyboard.JustDown(this.keys.v)) {
      this.openEditor();
      return;
    }

    this.movePlayer(dt);
    this.updateHostCells();
    if (this.isVirus) this.updatePrey(dt);
    else this.updateNutrients(dt);
    // Mapa odległości do gracza (droga naokoło ścian) — przeliczana 2× na sekundę.
    this.flowTimer -= dt;
    if (this.flowTimer <= 0) {
      this.flowTimer = 0.5;
      this.nav.buildFlow(this.player.x, this.player.y, 1400);
    }
    this.updateAllies(dt);
    this.updateStructures(dt);
    this.updateEnemies(dt);
    this.updateOrganDefense(dt);
    this.updateProjectiles(dt);
    this.resolveCombat(dt);
    this.checkGameOver();
    if (this.over) return;
    this.updateSpawning(dt);
    this.updateMission(dt);
    this.player.hp = Math.min(this.stats.maxHp, this.player.hp + this.stats.regen * dt);
    this.updateCamera();
    this.drawFlagella();
    this.organelleGfx.clear();
    const pl = this.player;
    drawOrganelles(this.organelleGfx, pl.x, pl.y, pl.radius, pl.rotation, this.species.rod, this.organelles, this.organelleDefs, this.elapsed);
    this.drawBars();

    if (!this.offerOpen && this.pendingLevelUps > 0) this.offerMutation();
  }

  /** Wywoływane przez UIScene po wybraniu mutacji. Gra toczy się dalej (bez pauzy). */
  chooseMutation(m: Mutation): void {
    if (!this.offerOpen) return;
    this.appliedMutations.push(m);
    this.pendingLevelUps--;
    audio.sfx('select');
    this.recomputeStats();
    // Mała nagroda za awans: leczenie 20%.
    this.player.hp = Math.min(this.stats.maxHp, this.player.hp + this.stats.maxHp * PROGRESSION.levelUpHeal);
    this.offerOpen = false;
  }

  // ───────────────────────── ewolucja: budowa komórki z organelli ─────────────────────────

  /** Definicje organelli tej postaci (wg id). */
  get organelleDefs(): Map<string, OrganelleDef> {
    if (this.defsFor !== this.species.id) {
      this.defsCache = new Map(organellesFor(this.species.id).map((d) => [d.id, d]));
      this.defsFor = this.species.id;
    }
    return this.defsCache;
  }

  private defsCache = new Map<string, OrganelleDef>();
  private defsFor?: SpeciesId;

  organelleCount(id: string): number {
    return this.organelles.filter((o) => o.id === id).length;
  }

  /** Wywoływane przez edytor. Zwraca komunikat błędu albo undefined, gdy się udało. */
  addOrganelle(placed: PlacedOrganelle): string | undefined {
    const def = this.organelleDefs.get(placed.id);
    if (!def) return 'Nieznane organellum';
    if (this.organelleCount(def.id) >= def.max) return `Maksymalnie ${def.max} × ${def.name}`;
    if (this.dna < def.cost) return `Potrzeba ${def.cost} DNA`;
    this.dna -= def.cost;
    audio.sfx('build');
    this.organelles.push(placed);
    this.recomputeStats();
    return undefined;
  }

  /** Usuwa organellum (zwrot punktów DNA). */
  removeOrganelle(index: number): void {
    const o = this.organelles[index];
    if (!o) return;
    const def = this.organelleDefs.get(o.id);
    this.organelles.splice(index, 1);
    if (def) this.dna += def.cost;
    audio.sfx('click');
    this.recomputeStats();
  }

  /** Statystyki = bazowe postaci + wszystkie mutacje + wszystkie organella. */
  private recomputeStats(): void {
    const oldMax = this.stats.maxHp;
    const oldAllyMax = this.stats.allyMaxHp;
    const s: PlayerStats = { ...this.species.stats };
    for (const m of this.appliedMutations) m.apply(s);
    const defs = this.organelleDefs;
    for (const o of this.organelles) defs.get(o.id)?.apply(s);
    this.stats = s;

    this.player.maxHp = s.maxHp;
    this.player.hp = Math.min(s.maxHp, this.player.hp + Math.max(0, s.maxHp - oldMax));
    for (const a of this.allies) {
      a.maxHp = s.allyMaxHp;
      a.hp = Math.min(s.allyMaxHp, a.hp + Math.max(0, s.allyMaxHp - oldAllyMax));
    }
  }

  private openEditor(): void {
    if (this.over) return;
    this.scene.launch('EditorScene');
    this.scene.bringToTop('EditorScene');
    this.scene.pause();
  }

  /** Wywoływane przez UIScene po wybraniu budowli (albo `undefined` = anuluj). */
  convertCell(kind: StructureKind | undefined): void {
    const c = this.convertTarget;
    this.convertTarget = undefined;
    if (!kind || this.over) return;
    if (!c || !c.active || !c.isAlive) {
      this.game.events.emit(GameEvents.Toast, 'Ta komórka już nie istnieje');
      return;
    }
    this.hostCells = this.hostCells.filter((h) => h !== c);
    const s = new Structure(this, c.x, c.y, kind);
    c.destroy();
    this.structures.push(s);
    this.convertCd = CONVERT.cooldown;
    audio.sfx('structure');
    this.burst(s.x, s.y, STRUCTURES[kind].tint, 20);

    // Limit budowli — najstarsza się rozpada.
    if (this.structures.length > CONVERT.maxStructures) {
      const old = this.structures.shift()!;
      this.burst(old.x, old.y, COLORS.burstOrgan, 12);
      old.destroy();
    }
    this.game.events.emit(GameEvents.Toast, `Komórka przerobiona: ${STRUCTURES[kind].name}`);
  }

  // ───────────────────────── otoczenie (nieskończona mapa) ─────────────────────────

  private createEnvironment(): void {
    // 4×4 kafle tkanki (podłoże), przesuwane za kamerą — tło nie ma końca.
    for (let i = 0; i < 16; i++) {
      // +2 px zakładki — bez szczelin między kaflami przy ułamkowych pozycjach kamery.
      this.chunks.push(
        this.add
          .image(0, 0, TEX.tissue)
          .setOrigin(0)
          .setDisplaySize(CHUNK.texW * CHUNK.scale + 2, CHUNK.texH * CHUNK.scale + 2)
          .setDepth(0),
      );
    }

    for (let i = 0; i < RBC_TARGET; i++) {
      const p = this.ringPoint(this.player, 0, ACTIVE_RADIUS);
      const img = this.add
        .image(p.x, p.y, TEX.rbc)
        .setScale(Phaser.Math.FloatBetween(1.6, 2.3))
        .setRotation(Math.random() * TAU)
        .setAlpha(Phaser.Math.FloatBetween(0.55, 0.85))
        .setDepth(0.5);
      const a = Math.random() * TAU;
      const v = Phaser.Math.FloatBetween(6, 16);
      this.drifters.push({ img, vx: Math.cos(a) * v, vy: Math.sin(a) * v, spin: Phaser.Math.FloatBetween(-0.15, 0.15) });
    }

    const { width, height } = this.scale;
    for (let i = 0; i < MOTE_COUNT; i++) {
      const f = Phaser.Math.FloatBetween(1.15, 1.6);
      const img = this.add
        .image(0, 0, TEX.dot)
        .setScrollFactor(0)
        .setTint(COLORS.mote)
        .setAlpha(Phaser.Math.FloatBetween(0.05, 0.18) * f)
        .setScale(Phaser.Math.FloatBetween(0.4, 1.6) * f)
        .setDepth(8);
      this.motes.push({ img, bx: Math.random() * width, by: Math.random() * height, f });
    }
  }

  private updateEnvironment(dt: number): void {
    const cam = this.cameras.main;
    const view = cam.worldView;

    const cw = CHUNK.texW * CHUNK.scale;
    const ch = CHUNK.texH * CHUNK.scale;
    const x0 = Math.floor(view.x / cw);
    const y0 = Math.floor(view.y / ch);
    for (let j = 0; j < 4; j++) {
      for (let i = 0; i < 4; i++) this.chunks[j * 4 + i].setPosition((x0 + i) * cw, (y0 + j) * ch);
    }

    // Ściany: generowane wokół gracza w tle, maks. ~4 ms na klatkę (bez zacięć).
    const z = cam.zoom || 1;
    this.walls.update(this.player.x, this.player.y, this.scale.width / 2 / z, this.scale.height / 2 / z, 4);

    for (const d of this.drifters) {
      d.img.x += d.vx * dt;
      d.img.y += d.vy * dt;
      d.img.rotation += d.spin * dt;
      if (dist(d.img, this.player) > DESPAWN_RADIUS) {
        const p = this.ringPoint(this.player, ACTIVE_RADIUS * 0.8, ACTIVE_RADIUS);
        d.img.setPosition(p.x, p.y);
      }
    }

    const { width, height } = this.scale;
    const pad = 40;
    const t = this.time.now / 1000;
    for (const mo of this.motes) {
      const x = mo.bx - cam.scrollX * (mo.f - 1) + Math.sin(t * 0.3 + mo.by) * 10;
      const y = mo.by - cam.scrollY * (mo.f - 1) + Math.cos(t * 0.25 + mo.bx) * 10;
      mo.img.setPosition(Phaser.Math.Wrap(x, -pad, width + pad), Phaser.Math.Wrap(y, -pad, height + pad));
    }
  }

  // ───────────────────────── wejście i ruch ─────────────────────────

  private setupInput(): void {
    const kb = this.input.keyboard!;
    this.keys = {
      up: kb.addKey('UP'),
      down: kb.addKey('DOWN'),
      left: kb.addKey('LEFT'),
      right: kb.addKey('RIGHT'),
      w: kb.addKey('W'),
      a: kb.addKey('A'),
      s: kb.addKey('S'),
      d: kb.addKey('D'),
      space: kb.addKey('SPACE'),
      f: kb.addKey('F'),
      e: kb.addKey('E'),
      q: kb.addKey('Q'),
      g: kb.addKey('G'),
      h: kb.addKey('H'),
      t: kb.addKey('T'),
      v: kb.addKey('V'),
    };

    const onKey = (e: KeyboardEvent) => {
      if (MOVE_CODES.has(e.code)) this.control = 'keyboard';
    };
    const onMove = () => {
      this.control = 'mouse';
    };
    const onDown = (p: Phaser.Input.Pointer) => {
      // Klik w element interfejsu (np. kartę mutacji) nie jest atakiem.
      const ui = this.scene.get('UIScene');
      if (ui?.sys.isActive() && ui.input.hitTestPointer(p).length > 0) return;
      if (p.rightButtonDown()) this.divide();
      else if (p.leftButtonDown()) this.useAbility();
    };

    kb.on('keydown', onKey);
    this.input.on('pointermove', onMove);
    this.input.on('pointerdown', onDown);
    this.input.mouse?.disableContextMenu();

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      kb.off('keydown', onKey);
      this.input.off('pointermove', onMove);
      this.input.off('pointerdown', onDown);
    });
  }

  private movePlayer(dt: number): void {
    const p = this.player;

    if (this.dashTime > 0) {
      this.dashTime -= dt;
      const step = this.stats.speed * DASH.speedMul * dt;
      if (!p.tryMove(this.dashDir.x * step, this.dashDir.y * step)) this.dashTime = 0;
      this.trail(p.x, p.y);
    } else {
      // Większy gracz jest nieco wolniejszy.
      const speed = this.stats.speed * (this.species.baseRadius / p.radius) ** 0.25;
      const x0 = p.x;
      const y0 = p.y;
      if (this.control === 'keyboard') {
        const k = this.keys;
        const dx = Number(k.right.isDown || k.d.isDown) - Number(k.left.isDown || k.a.isDown);
        const dy = Number(k.down.isDown || k.s.isDown) - Number(k.up.isDown || k.w.isDown);
        if (dx || dy) {
          const len = Math.hypot(dx, dy);
          p.tryMove((dx / len) * speed * dt, (dy / len) * speed * dt);
        }
      } else if (this.control === 'mouse') {
        const ptr = this.input.activePointer;
        ptr.updateWorldPoint(this.cameras.main);
        p.moveToward(ptr.worldX, ptr.worldY, speed, dt, p.radius * 0.6);
      }
      const mx = p.x - x0;
      const my = p.y - y0;
      const ml = Math.hypot(mx, my);
      if (ml > 0.01) this.aim = { x: mx / ml, y: my / ml };
      // Prędkość gracza — kolonia wyrównuje do niej kierunek (stado).
      p.vx = mx / dt;
      p.vy = my / dt;
    }

    if (this.species.rod) p.faceMovement(dt);
    else p.rotation += dt * (this.dashTime > 0 ? 12 : 0.8);
    p.setPulse(1 + Math.sin(this.elapsed * 4) * 0.03);
  }

  /** Kierunek ataku: do kursora (mysz) albo w kierunku ostatniego ruchu (klawiatura). */
  private aimDirection(): Point {
    if (this.control === 'mouse') {
      const ptr = this.input.activePointer;
      ptr.updateWorldPoint(this.cameras.main);
      const dx = ptr.worldX - this.player.x;
      const dy = ptr.worldY - this.player.y;
      const l = Math.hypot(dx, dy);
      if (l > 1) return { x: dx / l, y: dy / l };
    }
    return this.aim;
  }

  // ───────────────────────── atak specjalny ─────────────────────────

  private useAbility(): void {
    if (this.over || this.abilityCd > 0) return;
    const dir = this.aimDirection();
    const s = this.stats;
    const p = this.player;
    this.abilityCd = s.abilityCooldown;

    if (this.isVirus) {
      // Szarża.
      this.dashTime = s.dashDuration;
      audio.sfx('dash');
      this.dashDir = dir;
      this.dashHits.clear();
      this.burst(p.x, p.y, COLORS.dashTrail, 8);
      return;
    }

    // Salwa toksyn — wachlarz pocisków.
    const base = Math.atan2(dir.y, dir.x);
    for (let i = 0; i < s.shots; i++) {
      const a = base + (i - (s.shots - 1) / 2) * TOXIN.spread;
      const x = p.x + Math.cos(a) * p.radius;
      const y = p.y + Math.sin(a) * p.radius;
      const img = this.add
        .image(x, y, TEX.blob)
        .setTint(COLORS.toxin)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setScale(0.9)
        .setDepth(4.5);
      this.projectiles.push({
        img,
        vx: Math.cos(a) * TOXIN.speed,
        vy: Math.sin(a) * TOXIN.speed,
        speed: TOXIN.speed,
        life: TOXIN.life,
        damage: s.abilityDamage,
        hostile: false,
        burstColor: COLORS.toxin,
      });
    }
    p.setPulse(0.9);
    audio.sfx('shoot');
  }

  private trail(x: number, y: number): void {
    const c = this.add.image(x, y, TEX.dot).setTint(COLORS.dashTrail).setScale(this.player.radius / 6).setAlpha(0.5).setDepth(4.9);
    this.tweens.add({ targets: c, alpha: 0, scale: 0.2, duration: 300, onComplete: () => c.destroy() });
  }

  // ───────────────────────── bakteria: pożywienie i podział ─────────────────────────

  private spawnNutrient(minR: number): boolean {
    const p = this.openPoint(this.player, minR, ACTIVE_RADIUS, 12);
    if (!p) return false;
    this.nutrients.push(
      new Nutrient(this, p.x, p.y, Phaser.Math.Between(4, 7), Phaser.Utils.Array.GetRandom([...COLORS.nutrients])),
    );
    return true;
  }

  private updateNutrients(dt: number): void {
    const p = this.player;
    const pullRadius = p.radius + this.stats.magnet + 30;

    for (let i = this.nutrients.length - 1; i >= 0; i--) {
      const n = this.nutrients[i];
      n.x += Math.cos(this.elapsed * 0.7 + n.phase) * 6 * dt;
      n.y += Math.sin(this.elapsed * 0.5 + n.phase) * 6 * dt;

      const d = dist(n, p);
      // Pożywienie zjada gracz albo dowolna komórka kolonii (zbieranie na rozkaz).
      const eater = d < p.radius + n.r || this.allies.some((a) => dist(n, a) < a.radius + n.r + 2);
      if (eater) {
        n.destroy();
        this.nutrients.splice(i, 1);
        this.biomass += 1;
        audio.sfx('eat');
        this.gainXp(1);
      } else if (d > DESPAWN_RADIUS) {
        n.destroy();
        this.nutrients.splice(i, 1);
      } else if (this.stats.magnet > 0 && d < pullRadius) {
        const step = Math.min(d, 280 * dt);
        n.x += ((p.x - n.x) / d) * step;
        n.y += ((p.y - n.y) / d) * step;
      }
    }

    // Nowe pożywienie pojawia się poza ekranem.
    this.fill(() => this.nutrients.length < NUTRIENT_TARGET, () => this.spawnNutrient(1000), 20);
  }

  private divide(): void {
    if (this.over) return;
    if (this.isVirus) {
      this.game.events.emit(GameEvents.Toast, 'Wirus namnaża się, zarażając komórki');
      return;
    }
    const cost = this.stats.divideCost;
    if (this.allies.length >= this.stats.maxColony) {
      this.game.events.emit(GameEvents.Toast, `Kolonia jest pełna (${this.stats.maxColony})`);
      return;
    }
    if (this.biomass < cost) {
      this.game.events.emit(GameEvents.Toast, `Podział wymaga ${cost} biomasy`);
      return;
    }
    this.biomass -= cost;
    const a = this.createAlly(this.player.x, this.player.y);
    a.setRotation(this.player.rotation);
    this.burst(a.x, a.y, COLORS.burstAlly, 8);
    audio.sfx('divide');
  }

  private createAlly(x: number, y: number): Cell {
    const sp = this.species;
    const a = new Cell(this, x, y, sp.allyRadius, sp.allyTexture, sp.texRadius, this.stats.allyMaxHp).setDepth(4);
    this.allies.push(a);
    return a;
  }

  // ───────────────────────── przerabianie komórek ─────────────────────────

  /** E: wybierz najbliższą komórkę ciała i zaproponuj, na co ją przerobić. */
  private requestConvert(): void {
    if (this.over) return;
    if (this.convertTarget) {
      // Drugie E zamyka wybór.
      this.convertTarget = undefined;
      this.game.events.emit(GameEvents.ConvertClose);
      return;
    }
    if (this.convertCd > 0) {
      this.game.events.emit(GameEvents.Toast, `Przeróbka komórki gotowa za ${Math.ceil(this.convertCd)} s`);
      return;
    }
    const pl = this.player;
    const target = this.nearest(this.hostCells, pl.x, pl.y, pl.radius + CONVERT.range + 30, (c) =>
      dist(c, pl) < pl.radius + c.radius + CONVERT.range,
    );
    if (!target) {
      this.game.events.emit(GameEvents.Toast, 'Podejdź do komórki ciała (różowej), żeby ją przerobić');
      return;
    }
    this.convertTarget = target;
    this.burst(target.x, target.y, COLORS.burstCopy, 8);
    this.game.events.emit(GameEvents.ConvertOffer);
    audio.sfx('click');
  }

  private updateStructures(dt: number): void {
    const pl = this.player;
    for (const s of this.structures) {
      s.setPulse(1 + Math.sin(this.elapsed * 2 + s.x) * 0.02);
      switch (s.kind) {
        case 'turret': {
          s.timer -= dt;
          if (s.timer > 0) break;
          const cfg = STRUCTURES.turret;
          const target = this.nearest(this.enemies, s.x, s.y, cfg.range);
          if (!target) break;
          s.timer = cfg.interval;
          this.fireProtein(s, target, cfg.damage, false, cfg.tint);
          break;
        }
        case 'factory': {
          s.timer -= dt;
          if (s.timer > 0) break;
          s.timer = STRUCTURES.factory.interval;
          if (this.allies.length < this.stats.maxColony) {
            this.createAlly(s.x, s.y);
            this.burst(s.x, s.y, STRUCTURES.factory.tint, 10);
          }
          break;
        }
        case 'nest': {
          const cfg = STRUCTURES.nest;
          for (const c of [pl, ...this.allies]) {
            if (dist(c, s) < cfg.range) c.hp = Math.min(c.maxHp, c.hp + cfg.heal * dt);
          }
          break;
        }
      }
    }
  }

  // ───────────────────────── komórki ciała i ofiary wirusa ─────────────────────────

  /** Bakteria: mniej komórek ciała (tylko do przerabiania); wirus: więcej (też do zarażania). */
  private get hostTarget(): number {
    return this.isVirus ? HOST_CELL_TARGET : Math.round(HOST_CELL_TARGET * 0.5);
  }

  private updateHostCells(): void {
    const pl = this.player;
    this.hostCells = this.hostCells.filter((c) => {
      if (dist(c, pl) <= DESPAWN_RADIUS) return true;
      if (c === this.convertTarget) return true;
      c.destroy();
      return false;
    });
    this.fill(() => this.hostCells.length < this.hostTarget, () => this.spawnHostCell(1000), 10);
  }

  private spawnHostCell(minR: number): boolean {
    const r = Phaser.Math.Between(18, 26);
    const p = this.openPoint(this.player, minR, ACTIVE_RADIUS, r + 10);
    if (!p) return false;
    this.hostCells.push(new Organ(this, p.x, p.y, r, Math.round(30 * (1 + 0.1 * (this.threat - 1)))));
    return true;
  }

  private spawnPrey(minR: number): boolean {
    const p = this.openPoint(this.player, minR, ACTIVE_RADIUS, 20);
    if (!p) return false;
    this.preyBacteria.push(new Prey(this, p.x, p.y));
    return true;
  }

  private updatePrey(dt: number): void {
    const pl = this.player;

    this.preyBacteria = this.preyBacteria.filter((b) => {
      const d = dist(b, pl);
      if (d > DESPAWN_RADIUS) {
        b.destroy();
        return false;
      }
      if (d < 240) {
        // Ucieczka przed wirusem.
        const a = Math.atan2(b.y - pl.y, b.x - pl.x);
        if (!b.tryMove(Math.cos(a) * b.speed * dt, Math.sin(a) * b.speed * dt)) b.wander = a + Math.PI / 2;
        else b.wander = a;
      } else {
        b.turnTimer -= dt;
        if (b.turnTimer <= 0) {
          b.wander += Phaser.Math.FloatBetween(-1.2, 1.2);
          b.turnTimer = Phaser.Math.FloatBetween(1, 3);
        }
        const v = b.speed * 0.4 * dt;
        if (!b.tryMove(Math.cos(b.wander) * v, Math.sin(b.wander) * v)) b.wander += Math.PI * 0.7;
      }
      b.faceMovement(dt, 5);
      return true;
    });

    this.fill(() => this.preyBacteria.length < PREY_BACTERIA_TARGET, () => this.spawnPrey(1000), 10);
  }

  /** Komórka/bakteria zainfekowana do końca pęka i uwalnia kopie wirusa. */
  private onInfected(c: Cell, xp: number, color: number): void {
    audio.sfx('infect');
    this.burst(c.x, c.y, color, 12);
    this.burst(c.x, c.y, COLORS.burstCopy, 6);
    this.releaseCopies(c.x, c.y, this.stats.copies);
    this.gainXp(xp);
    c.destroy();
  }

  private releaseCopies(x: number, y: number, n: number): void {
    for (let i = 0; i < n; i++) {
      if (this.allies.length < this.stats.maxColony) {
        this.createAlly(x + Phaser.Math.Between(-10, 10), y + Phaser.Math.Between(-10, 10));
      } else {
        this.gainXp(1); // nadmiarowe kopie zamieniają się w doświadczenie
      }
    }
  }

  // ───────────────────────── sojusznicy ─────────────────────────

  private updateAllies(dt: number): void {
    const p = this.player;
    const n = this.allies.length;
    const targets: Cell[] = [...this.enemies];
    if (this.isVirus) {
      targets.push(...this.hostCells, ...this.preyBacteria);
      if (this.mission?.type === 'infect' && this.mission.organ.isAlive) targets.push(this.mission.organ);
    }

    // Umysł zbiorowy: cała kolonia (z graczem jako „mózgiem”) wybiera JEDEN wspólny cel
    // i atakuje go razem. Cel i zachowanie zależą od rozkazu gracza.
    if (this.orderTarget && (!this.orderTarget.active || !this.orderTarget.isAlive)) this.orderTarget = undefined;
    const op = this.orderPoint;
    let focus: Cell | undefined;
    switch (this.order) {
      case 'follow':
        focus = this.nearest(targets, p.x, p.y, 340);
        break;
      case 'attack':
        focus = this.orderTarget ?? this.nearest(targets, op.x, op.y, 300);
        break;
      case 'hold':
        focus = this.nearest(targets, op.x, op.y, 200);
        break;
      case 'forage':
        focus = this.nearest(this.enemies, p.x, p.y, 160); // obrona tylko przed bliskim zagrożeniem
        break;
    }
    const mates: Cell[] = [p, ...this.allies];
    const back = Math.atan2(-this.aim.y, -this.aim.x);
    // Zbieranie: każda komórka bierze inny najbliższy cel (pożywienie / komórkę do zarażenia).
    const claimed = new Set<object>();
    const forageTargets: { x: number; y: number }[] = this.isVirus ? [...this.hostCells, ...this.preyBacteria] : this.nutrients;

    // Otaczanie wspólnego celu: miejsca w pierścieniu wg obecnego kąta wokół celu (bez krzyżowania dróg).
    const slotOf = new Map<Cell, number>();
    if (focus) {
      [...this.allies]
        .sort((a, b) => Math.atan2(a.y - focus.y, a.x - focus.x) - Math.atan2(b.y - focus.y, b.x - focus.x))
        .forEach((a, i) => slotOf.set(a, i));
    }
    const slotBase = focus && this.allies.length ? Math.atan2(this.allies[0].y - focus.y, this.allies[0].x - focus.x) : 0;

    this.allies.forEach((a, i) => {
      const flock = this.flockSteer(a, mates, 110);
      const speed = this.stats.speed * 1.25;
      if (focus) {
        // Kolonia otacza cel ze wszystkich stron i atakuje razem.
        const ang = slotBase + ((slotOf.get(a) ?? i) / Math.max(1, n)) * TAU;
        const ring = (focus.radius + a.radius) * 0.85;
        const t = this.waypoint(a, { x: focus.x + Math.cos(ang) * ring, y: focus.y + Math.sin(ang) * ring });
        this.steerMove(a, t.x, t.y, speed, dt, 2, flock);
      } else if (this.order === 'attack' || this.order === 'hold') {
        // Marsz do wskazanego miejsca i ustawienie w krąg.
        const ang = (i / Math.max(1, n)) * TAU;
        const r = this.order === 'hold' ? 40 + (i % 2) * 18 : 20;
        this.steerMove(a, op.x + Math.cos(ang) * r, op.y + Math.sin(ang) * r, speed, dt, 6, flock);
      } else if (this.order === 'forage') {
        let best: { x: number; y: number } | undefined;
        let bestD = 500;
        for (const t of forageTargets) {
          if (claimed.has(t)) continue;
          const d = dist(t, a);
          if (d < bestD && dist(t, p) < 650) {
            bestD = d;
            best = t;
          }
        }
        if (best) {
          claimed.add(best);
          this.steerMove(a, best.x, best.y, speed, dt, 0, flock);
        } else {
          this.steerMove(a, p.x, p.y, speed, dt, p.radius + 40, flock);
        }
      } else {
        // Formacja za graczem: stado płynie tam, gdzie gracz.
        const spread = (i - (n - 1) / 2) * 0.35;
        const r = p.radius + 30 + (i % 3) * 14;
        const f = this.waypoint(a, { x: p.x + Math.cos(back + spread) * r, y: p.y + Math.sin(back + spread) * r });
        this.steerMove(a, f.x, f.y, this.stats.speed * 1.35, dt, 8, flock);
      }
      if (this.species.rod) a.faceMovement(dt, 9);
      else a.rotation += dt * 2;
      // Wspólny rytm „oddechu” — kolonia pulsuje jednocześnie.
      a.setPulse(1 + Math.sin(this.elapsed * 4) * 0.04);
    });
  }

  /** Rozkaz dla kolonii; miejsce = kursor myszy (albo punkt przed graczem przy klawiaturze). */
  private issueOrder(order: ColonyOrder): void {
    if (this.over) return;
    if (this.allies.length === 0) {
      this.game.events.emit(GameEvents.Toast, this.isVirus ? 'Nie masz jeszcze kopii' : 'Nie masz jeszcze kolonii — podziel się (Spacja)');
    }
    this.order = order;
    const p = this.player;
    let point: Point;
    if (this.control === 'mouse') {
      const ptr = this.input.activePointer;
      ptr.updateWorldPoint(this.cameras.main);
      point = { x: ptr.worldX, y: ptr.worldY };
    } else {
      point = { x: p.x + this.aim.x * 260, y: p.y + this.aim.y * 260 };
    }
    this.orderPoint = point;
    this.orderTarget = undefined;
    if (order === 'attack') {
      const targets: Cell[] = [...this.enemies];
      if (this.isVirus) {
        targets.push(...this.hostCells, ...this.preyBacteria);
        if (this.mission?.type === 'infect' && this.mission.organ.isAlive) targets.push(this.mission.organ);
      }
      this.orderTarget = this.nearest(targets, point.x, point.y, 220);
    }
    if (order === 'attack' || order === 'hold') this.burst(point.x, point.y, 0x5eead4, 8);
    this.game.events.emit(GameEvents.Toast, `Rozkaz: ${ORDER_NAMES[order]}`);
    audio.sfx('order');
  }

  // ───────────────────────── zachowanie stadne ─────────────────────────

  /**
   * Siły stada (boids): rozdzielanie (nie wpadaj na sąsiadów), wyrównanie (płyń jak sąsiedzi)
   * i spójność (trzymaj się grupy). Zwraca wektor do dodania do kierunku ruchu.
   */
  private flockSteer(c: Cell, mates: Cell[], radius: number, separationOnly = false): Point {
    let sx = 0;
    let sy = 0;
    let ax = 0;
    let ay = 0;
    let cx = 0;
    let cy = 0;
    let n = 0;
    for (const m of mates) {
      if (m === c) continue;
      const dx = c.x - m.x;
      const dy = c.y - m.y;
      const d = Math.hypot(dx, dy);
      if (d > radius || d < 0.01) continue;
      n++;
      const personal = (c.radius + m.radius) * 1.7 + 4;
      if (d < personal) {
        const k = (personal - d) / personal;
        sx += (dx / d) * k;
        sy += (dy / d) * k;
      }
      ax += m.vx;
      ay += m.vy;
      cx += m.x;
      cy += m.y;
    }
    if (n === 0) return { x: 0, y: 0 };
    if (separationOnly) return { x: sx * 2.4, y: sy * 2.4 };
    const al = Math.hypot(ax, ay) || 1;
    cx = cx / n - c.x;
    cy = cy / n - c.y;
    const cl = Math.hypot(cx, cy) || 1;
    return {
      x: sx * 2.4 + (ax / al) * 0.3 + (cx / cl) * 0.2,
      y: sy * 2.4 + (ay / al) * 0.3 + (cy / cl) * 0.2,
    };
  }

  /** Ruch w stronę celu z dodaną siłą stada; zapisuje prędkość komórki. */
  private steerMove(c: Cell, tx: number, ty: number, speed: number, dt: number, stopAt: number, flock?: Point): void {
    const dx = tx - c.x;
    const dy = ty - c.y;
    const d = Math.hypot(dx, dy);
    let mx = 0;
    let my = 0;
    if (d > stopAt) {
      // Zwolnij przy dojściu do celu.
      const k = Math.min(1, (d - stopAt) / 40);
      mx = (dx / d) * k;
      my = (dy / d) * k;
    }
    if (flock) {
      mx += flock.x;
      my += flock.y;
    }
    const l = Math.hypot(mx, my);
    const x0 = c.x;
    const y0 = c.y;
    if (l > 0.03) {
      // Czujniki ścian: kierunek korygowany zawczasu (co ~0.12 s, potem używany jako przesunięcie kąta).
      const desired = Math.atan2(my, mx);
      c.avoidTimer -= dt;
      if (c.avoidTimer <= 0) {
        c.avoidTimer = 0.12;
        const a = avoidWalls(c.x, c.y, c.radius, mx / l, my / l, 30 + speed * 0.25);
        c.avoidOffset = Phaser.Math.Angle.Wrap(Math.atan2(a.y, a.x) - desired);
      }
      const ang = desired + c.avoidOffset;
      const step = speed * dt * Math.min(1, l);
      c.tryMove(Math.cos(ang) * step, Math.sin(ang) * step);
    }
    c.vx = (c.x - x0) / dt;
    c.vy = (c.y - y0) / dt;
  }

  /**
   * Punkt pośredni na drodze do celu: gdy cel jest daleko lub za ścianą, idź mapą odległości
   * (tunelami naokoło ścian); gdy blisko i widać go — prosto.
   */
  private waypoint(c: Cell, target: Point): Point {
    const d = dist(c, target);
    // Mapa odległości prowadzi do gracza — używamy jej, gdy cel jest przy graczu, ale za ścianą.
    if (d > 90 && dist(target, this.player) < 220) {
      if (this.elapsed >= c.losCheckAt) {
        c.seesTarget = this.nav.lineOfSight(c.x, c.y, target.x, target.y);
        c.losCheckAt = this.elapsed + 0.25 + Math.random() * 0.1;
      }
      if (!c.seesTarget) {
        const f = this.nav.flowDir(c.x, c.y);
        if (f) return { x: c.x + f.x * 120, y: c.y + f.y * 120 };
      }
    }
    return target;
  }

  // ───────────────────────── wrogowie ─────────────────────────

  private updateSpawning(dt: number): void {
    const t = this.threat;
    const D = DIFFICULTY;
    const maxAlive = Math.min(D.maxAliveCap, D.maxAliveBase + Math.floor(t * D.maxAlivePerThreat));
    this.spawnTimer -= dt;
    if (this.spawnTimer > 0 || this.enemies.length >= maxAlive) return;

    const p = this.openPoint(this.player, 950, 1200, 30);
    if (!p) return; // spróbujemy w następnej klatce
    this.spawnTimer = Math.max(D.spawnMin, D.spawnStart - t * D.spawnPerThreat);

    // Rodzaj wroga zależy od biomu, w którym jest gracz.
    const biome = BIOMES[biomeAt(p.x, p.y).a];
    const weights = this.isVirus ? biome.immune : biome.enemies;
    const pool = (Object.entries(weights) as [EnemyKind, number][]).filter(([k]) => ENEMY_DEFS[k].minThreat <= t);
    const total = pool.reduce((s, [, w]) => s + w, 0);
    let r = Math.random() * total;
    let kind = pool[0]?.[0] ?? 'virus';
    for (const [k, w] of pool) {
      r -= w;
      if (r <= 0) {
        kind = k;
        break;
      }
    }
    const group = ENEMY_DEFS[kind].group ?? 1;
    for (let i = 0; i < group; i++) {
      this.spawnEnemy(kind, { x: p.x + Phaser.Math.Between(-25, 25), y: p.y + Phaser.Math.Between(-25, 25) });
    }
  }

  private updateBiome(dt: number): void {
    this.biomeCheck -= dt;
    if (this.biomeCheck > 0) return;
    this.biomeCheck = 0.5;

    // Intensywność muzyki: wrogowie w pobliżu + ogólne zagrożenie.
    const near = this.enemies.filter((e) => dist(e, this.player) < 600).length;
    audio.setIntensity(near / 12 + (this.threat - 1) * 0.04);

    const b = biomeAt(this.player.x, this.player.y).a;
    if (b !== this.biome) {
      this.biome = b;
      this.game.events.emit(GameEvents.BiomeChange, BIOMES[b].name);
      audio.setTheme(b);
      audio.sfx('swell');
    }
  }

  /** Pałeczka toksynotwórcza wystrzeliwuje kroplę toksyny w ofiarę. */
  private fireToxinAt(from: Enemy, target: Cell): void {
    const a = Math.atan2(target.y - from.y, target.x - from.x);
    const speed = 330;
    const img = this.add
      .image(from.x + Math.cos(a) * from.radius, from.y + Math.sin(a) * from.radius, TEX.blob)
      .setTint(0xa3e635)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setScale(0.8)
      .setDepth(4.5);
    this.projectiles.push({
      img,
      vx: Math.cos(a) * speed,
      vy: Math.sin(a) * speed,
      speed,
      life: 1.6,
      damage: 8 * (1 + 0.05 * (this.threat - 1)),
      hostile: true,
      burstColor: 0xa3e635,
    });
  }

  private spawnEnemy(kind: EnemyKind, p: Point): Enemy {
    const e = new Enemy(this, p.x, p.y, kind, this.threat);
    this.enemies.push(e);
    return e;
  }

  private updateEnemies(dt: number): void {
    const victims: Cell[] = [this.player, ...this.allies, ...this.structures];
    const pl = this.player;
    // Stada: wrogowie tego samego rodzaju poruszają się razem.
    const byKind = new Map<EnemyKind, Enemy[]>();
    for (const e of this.enemies) {
      if (!e.def.flock) continue;
      const list = byKind.get(e.kind);
      if (list) list.push(e);
      else byKind.set(e.kind, [e]);
    }

    // Myślenie gatunku: wrogowie tego samego rodzaju atakujący ten sam cel najpierw go OTACZAJĄ
    // (rozstawiają się po okręgu), a gdy pierścień jest gotowy — uderzają razem ze wszystkich stron.
    const victimOf = new Map<Enemy, Cell>();
    const packs = new Map<Cell, Map<EnemyKind, Enemy[]>>();
    for (const e of this.enemies) {
      const v = this.nearest(victims, e.x, e.y, e.aggro * this.stats.stealth);
      if (!v) continue;
      victimOf.set(e, v);
      if (e.def.shooter || e.missionTarget || e.guardOf) continue;
      let byK = packs.get(v);
      if (!byK) packs.set(v, (byK = new Map()));
      const list = byK.get(e.kind);
      if (list) list.push(e);
      else byK.set(e.kind, [e]);
    }
    const surround = new Map<Enemy, Point>();
    for (const [v, byK] of packs) {
      for (const pack of byK.values()) {
        if (pack.length < 2) continue;
        // Kierunek, z którego nadchodzi gromada (środek ciężkości), i kąty członków względem niego.
        const gx = pack.reduce((s, e) => s + e.x, 0) / pack.length;
        const gy = pack.reduce((s, e) => s + e.y, 0) / pack.length;
        const center = Math.atan2(gy - v.y, gx - v.x);
        const rel = (e: Enemy) => Phaser.Math.Angle.Wrap(Math.atan2(e.y - v.y, e.x - v.x) - center);
        // Kolejność wg kąta — bez krzyżowania się dróg; miejsca rozłożone równo wokół celu,
        // symetrycznie względem kierunku nadejścia (skrajni obchodzą cel z obu stron).
        pack.sort((a, b) => rel(a) - rel(b));
        const base = center - ((pack.length - 1) / 2) * ((Math.PI * 2) / pack.length);
        const contact = v.radius + pack[0].radius;
        const ring = contact + 70;
        const step = (Math.PI * 2) / pack.length;
        const slot = (i: number, r: number) => ({ x: v.x + Math.cos(base + i * step) * r, y: v.y + Math.sin(base + i * step) * r });
        // Pierścień gotowy, gdy ≥ 70% gromady stoi na swoich miejscach wokół celu.
        const inPlace = pack.filter((e, i) => dist(e, slot(i, ring)) < 50).length;
        const ready = inPlace >= Math.ceil(pack.length * 0.7);
        pack.forEach((e, i) => {
          e.surroundTime += dt;
          // Atak razem, gdy pierścień gotowy albo otaczanie trwa za długo (cel ucieka).
          const strike = ready || e.surroundTime > 4;
          if (strike && e.surroundTime > 6) e.surroundTime = 0; // po ataku — kolejne okrążenie
          surround.set(e, slot(i, strike ? contact * 0.85 : ring));
        });
      }
    }

    this.enemies = this.enemies.filter((e) => {
      const victim = victimOf.get(e);
      let target: Point;
      let stopAt = 0;
      let speed = e.speed;

      // Pałeczka toksynotwórcza: trzyma dystans i strzela.
      if (e.def.shooter && victim && !e.missionTarget) {
        const d = dist(e, victim);
        e.fireTimer -= dt;
        if (e.fireTimer <= 0 && d < 430) {
          e.fireTimer = 1.8;
          this.fireToxinAt(e, victim);
        }
        if (d < 420) {
          const away = Math.atan2(e.y - victim.y, e.x - victim.x);
          // Za blisko — odsuń się; w dobrej odległości — krąż bokiem.
          const ang = d < 230 ? away : away + Math.PI / 2;
          const flock = byKind.has(e.kind) ? this.flockSteer(e, byKind.get(e.kind)!, 120) : undefined;
          this.steerMove(e, e.x + Math.cos(ang) * 100, e.y + Math.sin(ang) * 100, speed * (d < 230 ? 1 : 0.6), dt, 0, flock);
          e.faceMovement(dt, 3);
          return true;
        }
      }

      if (e.missionTarget?.isAlive && (!victim || dist(e, victim) > 160)) {
        target = e.missionTarget;
        stopAt = e.radius + e.missionTarget.radius;
      } else if (e.guardOf?.isAlive && (!victim || dist(victim, e.guardOf) > 550)) {
        // Strażnik krąży wokół narządu.
        const g = e.guardOf;
        const a = this.elapsed * 0.4 + e.phase;
        target = { x: g.x + Math.cos(a) * (g.radius + 90), y: g.y + Math.sin(a) * (g.radius + 90) };
        speed *= 0.6;
      } else if (victim) {
        const slot = surround.get(e);
        if (slot) {
          target = slot;
          stopAt = 2;
        } else {
          target = victim;
          stopAt = e.radius + victim.radius;
        }
      } else {
        // Ciągła presja: dryf w stronę gracza.
        target = pl;
        stopAt = e.radius + pl.radius;
        speed *= 0.5;
      }
      // Droga naokoło ścian (mapa odległości) + czujniki ścian w steerMove.
      const wp = this.waypoint(e, target);
      const mates = byKind.get(e.kind);
      // Przy otaczaniu tylko odpychanie (bez skupiania się w kupę), w marszu — pełne stado.
      const flock = mates ? this.flockSteer(e, mates, 120, surround.has(e)) : undefined;
      this.steerMove(e, wp.x, wp.y, speed, dt, wp === target ? stopAt : 0, flock);

      if (e.motion === 'spin') e.rotation += dt * (e.kind === 'virus' ? 1.5 : e.radius < 10 ? 2 : 0.3);
      else e.faceMovement(dt, e.kind === 'antibody' || e.kind === 'spirochete' ? 8 : 3);

      if (!e.missionTarget && !e.guardOf && dist(e, pl) > ENEMY_DESPAWN_RADIUS) {
        e.destroy();
        return false;
      }
      return true;
    });
  }

  // ───────────────────────── walka i infekcja ─────────────────────────

  private resolveCombat(dt: number): void {
    const pl = this.player;
    const s = this.stats;
    const dashing = this.dashTime > 0;
    let playerHurt = false;
    const hurtAllies = new Set<Cell>();
    const organ = this.mission?.organ;

    for (const e of this.enemies) {
      let hit = false;
      const dPl = dist(e, pl);
      if (dPl < pl.radius + e.radius + s.reach) {
        e.hurt(s.damage * dt);
        hit = true;
      }
      // Podczas szarży gracz jest nietykalny.
      if (!dashing && dPl < pl.radius + e.radius + 2) {
        pl.hp -= e.dps * s.armor * dt;
        playerHurt = true;
        audio.sfx('hurt');
      }
      for (const a of this.allies) {
        if (dist(e, a) < a.radius + e.radius + 3) {
          e.hurt(s.allyDamage * dt);
          a.hp -= e.dps * s.armor * dt;
          hit = true;
          hurtAllies.add(a);
        }
      }
      if (organ?.isAlive && e.missionTarget === organ && dist(e, organ) < organ.radius + e.radius + 2) {
        organ.hp -= e.dps * dt;
      }
      for (const st of this.structures) {
        if (dist(e, st) < st.radius + e.radius + 2) {
          st.hp -= e.dps * dt;
          st.setTint(COLORS.hurt);
        }
      }
      if (hit) e.setTint(COLORS.hitFlash);
      else e.resetTint();
    }

    // Wirus: infekowanie komórek, bakterii i narządu z zadania.
    const infectables: Cell[] = [];
    if (this.isVirus) {
      infectables.push(...this.hostCells, ...this.preyBacteria);
      if (this.mission?.type === 'infect' && organ?.isAlive) infectables.push(organ);
      for (const c of infectables) {
        if (dist(c, pl) < pl.radius + c.radius + s.reach) c.hp -= s.damage * dt;
        for (const a of this.allies) if (dist(c, a) < a.radius + c.radius + 3) c.hp -= s.allyDamage * dt;
        if (c.hp < c.maxHp) c.setTint(COLORS.infectTint);
      }
    }

    // Szarża: jednorazowe silne trafienie każdego celu na drodze.
    if (dashing) {
      for (const c of [...this.enemies, ...infectables]) {
        if (this.dashHits.has(c) || dist(c, pl) > pl.radius + c.radius + 6) continue;
        this.dashHits.add(c);
        c.hurt(s.abilityDamage);
        this.burst(c.x, c.y, COLORS.dashTrail, 6);
      }
    }

    if (playerHurt || this.playerHitFlash > 0) pl.setTint(COLORS.hurt);
    else pl.resetTint();
    for (const a of this.allies) {
      if (hurtAllies.has(a)) a.setTint(COLORS.hurt);
      else a.resetTint();
    }

    this.structures = this.structures.filter((st) => {
      if (st.hp > 0) {
        if (this.elapsed % 0.2 < dt) st.resetTint(); // błysk obrażeń gaśnie
        return true;
      }
      this.burst(st.x, st.y, STRUCTURES[st.kind].tint, 16);
      this.game.events.emit(GameEvents.Toast, `${STRUCTURES[st.kind].name} zniszczona`);
      audio.sfx('popBig');
      st.destroy();
      return false;
    });

    const spawned: [EnemyKind, Point][] = [];
    this.enemies = this.enemies.filter((e) => {
      if (e.hp > 0) return true;
      this.kills++;
      if (!this.isVirus) this.biomass += e.biomass;
      this.gainXp(e.xp);
      this.burst(e.x, e.y, e.burstColor, e.radius > 15 ? 14 : 8);
      audio.sfx(e.radius > 20 ? 'popBig' : 'pop');
      // Laseczka przetrwalnikowa: po śmierci uwalnia przetrwalniki.
      const od = e.def.onDeath;
      if (od) for (let i = 0; i < od.count; i++) spawned.push([od.kind, { x: e.x + Phaser.Math.Between(-12, 12), y: e.y + Phaser.Math.Between(-12, 12) }]);
      e.destroy();
      return false;
    });
    for (const [k, p] of spawned) this.spawnEnemy(k, p);

    if (this.isVirus) {
      this.hostCells = this.hostCells.filter((c) => {
        if (c.hp > 0) return true;
        this.onInfected(c, 5, COLORS.burstOrgan);
        return false;
      });
      this.preyBacteria = this.preyBacteria.filter((b) => {
        if (b.hp > 0) return true;
        this.onInfected(b, 4, COLORS.burstPrey);
        return false;
      });
    }

    this.allies = this.allies.filter((a) => {
      if (a.hp > 0) return true;
      this.burst(a.x, a.y, this.isVirus ? COLORS.burstCopy : COLORS.burstAlly, 6);
      a.destroy();
      return false;
    });
  }

  // ───────────────────────── pociski ─────────────────────────

  /** Narząd z zadania strzela białkami w najbliższego napastnika w zasięgu. */
  private updateOrganDefense(dt: number): void {
    const m = this.mission;
    if (!m || !m.organ.isAlive) return;
    m.fireTimer -= dt;
    if (m.fireTimer > 0) return;

    const o = m.organ;
    const hostile = m.type === 'infect';
    const candidates: Cell[] = hostile ? [this.player, ...this.allies] : this.enemies;
    const target = this.nearest(candidates, o.x, o.y, PROTEIN.range + o.radius);
    if (!target) return; // timer zostaje ≤ 0 — strzał, gdy tylko ktoś się zbliży

    const cfg = hostile ? PROTEIN.infect : PROTEIN.defend;
    m.fireTimer = cfg.interval;
    this.fireProtein(o, target, cfg.damage, hostile);
  }

  private fireProtein(from: Cell, target: Cell, damage: number, hostile: boolean, tint?: number): void {
    const a = Math.atan2(target.y - from.y, target.x - from.x) + Phaser.Math.FloatBetween(-0.3, 0.3);
    const x = from.x + Math.cos(a) * from.radius * 0.9;
    const y = from.y + Math.sin(a) * from.radius * 0.9;
    const img = this.add.image(x, y, TEX.protein).setDepth(4.5).setScale(0.3);
    if (tint !== undefined) img.setTint(tint);
    this.tweens.add({ targets: img, scale: 1, duration: 150 });
    this.projectiles.push({
      img,
      vx: Math.cos(a) * PROTEIN.speed,
      vy: Math.sin(a) * PROTEIN.speed,
      speed: PROTEIN.speed,
      target,
      life: PROTEIN.life,
      damage,
      hostile,
      burstColor: tint ?? COLORS.burstOrgan,
    });

    // Narząd / wieżyczka „pulsuje” przy wystrzale.
    this.tweens.addCounter({
      from: 1.06,
      to: 1,
      duration: 220,
      onUpdate: (tw) => from.active && from.setPulse(tw.getValue() ?? 1),
    });
    this.burst(x, y, tint ?? COLORS.burstOrgan, 3);
    // Tylko strzały widoczne w pobliżu gracza są słyszalne.
    if (dist(from, this.player) < 700) audio.sfx('protein');
  }

  private updateProjectiles(dt: number): void {
    this.playerHitFlash = Math.max(0, this.playerHitFlash - dt);
    const dashing = this.dashTime > 0;

    this.projectiles = this.projectiles.filter((p) => {
      p.life -= dt;
      const t = p.target;
      if (t && t.active && t.isAlive) {
        // Lekkie naprowadzanie na cel.
        const desired = Math.atan2(t.y - p.img.y, t.x - p.img.x);
        const ang = Phaser.Math.Angle.RotateTo(Math.atan2(p.vy, p.vx), desired, 3.5 * dt);
        p.vx = Math.cos(ang) * p.speed;
        p.vy = Math.sin(ang) * p.speed;
      }
      p.img.x += p.vx * dt;
      p.img.y += p.vy * dt;
      p.img.rotation += 5 * dt;

      if (isWall(p.img.x, p.img.y)) {
        this.burst(p.img.x, p.img.y, p.burstColor, 3);
        p.img.destroy();
        return false;
      }

      const victims: Cell[] = p.hostile ? [this.player, ...this.allies] : this.enemies;
      for (const v of victims) {
        if (!v.isAlive || dist(p.img, v) > v.radius + 5) continue;
        if (v === this.player && dashing) continue; // szarża = nietykalność
        if (p.hostile) v.hp -= p.damage * this.stats.armor;
        else v.hurt(p.damage);
        if (v === this.player) {
          this.playerHitFlash = 0.15;
          audio.sfx('hurt');
        }
        this.burst(p.img.x, p.img.y, p.burstColor, 5);
        p.img.destroy();
        return false;
      }

      if (p.life <= 0) {
        p.img.destroy();
        return false;
      }
      if (p.life < 0.25) p.img.setAlpha(p.life / 0.25);
      return true;
    });
  }

  // ───────────────────────── zadania ─────────────────────────

  private updateMission(dt: number): void {
    const m = this.mission;
    if (!m) {
      if (this.elapsed >= this.nextMissionAt) this.startMission();
      return;
    }
    m.timeLeft -= dt;

    if (m.type === 'defend') {
      m.spawnTimer -= dt;
      if (m.spawnTimer <= 0 && m.timeLeft > 3) {
        m.spawnTimer = Math.max(0.9, 1.8 - this.threat * 0.08);
        this.spawnAttacker(m.organ);
      }
      if (!m.organ.isAlive) this.endMission(false);
      else if (m.timeLeft <= 0) this.endMission(true);
    } else {
      if (!m.organ.isAlive) this.endMission(true);
      else if (m.timeLeft <= 0) this.endMission(false);
    }
  }

  private startMission(): void {
    // Narząd potrzebuje dużej wolnej przestrzeni (komora lub szeroki tunel).
    const p = this.openPoint(this.player, 800, 1250, 110, 40);
    if (!p) {
      this.nextMissionAt = this.elapsed + 2;
      return;
    }
    const type: MissionType = this.isVirus ? 'infect' : 'defend';
    const hp = type === 'defend' ? 220 : Math.round(260 * (1 + 0.1 * (this.threat - 1)));
    const organ = new Organ(this, p.x, p.y, 48, hp);
    this.mission = { type, organ, timeLeft: type === 'defend' ? 35 : 45, spawnTimer: 2, fireTimer: 0 };

    if (type === 'defend') {
      for (let i = 0; i < 4; i++) this.spawnAttacker(organ);
    } else {
      const leukos = Math.min(5, 1 + Math.floor(this.threat / 2));
      for (let i = 0; i < leukos; i++) this.spawnGuard('leukocyte', organ);
      for (let i = 0; i < 6; i++) this.spawnGuard('antibody', organ);
    }
    this.game.events.emit(GameEvents.MissionStart, type);
    audio.sfx('alarm');
  }

  private spawnAttacker(organ: Organ): void {
    const p = this.openPoint(organ, 380, 520, 25);
    if (!p) return;
    const kind: EnemyKind = Math.random() < Math.min(0.4, 0.08 * this.threat) ? 'germ' : 'virus';
    this.spawnEnemy(kind, p).missionTarget = organ;
  }

  private spawnGuard(kind: EnemyKind, organ: Organ): void {
    const p = this.openPoint(organ, organ.radius + 60, organ.radius + 160, 30) ?? { x: organ.x, y: organ.y };
    this.spawnEnemy(kind, p).guardOf = organ;
  }

  private endMission(success: boolean): void {
    const m = this.mission!;
    this.mission = undefined;
    this.nextMissionAt = this.elapsed + MISSION_COOLDOWN;

    for (const e of this.enemies) {
      if (e.missionTarget === m.organ) e.missionTarget = undefined;
      if (e.guardOf === m.organ) e.guardOf = undefined;
    }

    const o = m.organ;
    if (success) {
      this.missionsDone++;
      this.dna += DNA.perMission;
      this.game.events.emit(GameEvents.Toast, `+${DNA.perMission} DNA za zadanie — V: edytor komórki`);
      this.gainXp(Math.round(PROGRESSION.missionXpBase + PROGRESSION.missionXpPerThreat * this.threat));
      if (m.type === 'defend') {
        this.biomass += PROGRESSION.missionBiomass;
        this.player.hp = Math.min(this.stats.maxHp, this.player.hp + this.stats.maxHp * PROGRESSION.missionHeal);
        this.burst(o.x, o.y, COLORS.burstOrgan, 16);
      } else {
        o.setTint(COLORS.infectedOrgan);
        this.burst(o.x, o.y, COLORS.burstCopy, 24);
        this.releaseCopies(o.x, o.y, 5);
      }
    } else if (m.type === 'defend') {
      o.destroyOrgan();
      this.burst(o.x, o.y, COLORS.burstOrgan, 24);
      this.cameras.main.shake(250, 0.008);
    }

    // Narząd znika po chwili.
    this.tweens.add({ targets: o, alpha: 0, delay: 2500, duration: 2000, onComplete: () => o.destroy() });
    this.game.events.emit(GameEvents.MissionEnd, m.type, success);
    audio.sfx(success ? 'success' : 'fail');
  }

  // ───────────────────────── rozwój ─────────────────────────

  private gainXp(amount: number): void {
    this.xp += amount;
    while (this.xp >= this.xpToNext) {
      this.xp -= this.xpToNext;
      this.level++;
      audio.sfx('levelup');
      this.pendingLevelUps++;
      if (this.level % DNA.everyLevels === 0) {
        this.dna += 1;
        this.game.events.emit(GameEvents.Toast, '+1 DNA — V: zbuduj komórkę');
      }
      this.updatePlayerRadius();
    }
  }

  private updatePlayerRadius(): void {
    const sp = this.species;
    this.player.setRadius(Math.min(sp.baseRadius + (this.level - 1) * sp.growthPerLevel, sp.maxRadius));
  }

  private offerMutation(): void {
    this.offerOpen = true;
    this.game.events.emit(GameEvents.LevelUp, rollMutations(this.species.mutations, 3), this.pendingLevelUps);
  }

  private checkGameOver(): void {
    if (this.player.hp > 0) return;
    this.over = true;
    audio.sfx('death');
    audio.setTheme('menu');
    audio.setIntensity(0);
    this.burst(this.player.x, this.player.y, this.isVirus ? COLORS.burstCopy : COLORS.burstPlayer, 24);
    this.player.setVisible(false);
    this.flagella.clear();
    this.organelleGfx.clear();
    this.bars.clear();
    const summary: GameSummary = {
      species: this.species.id,
      time: this.elapsed,
      level: this.level,
      kills: this.kills,
      missions: this.missionsDone,
    };
    this.game.events.emit(GameEvents.GameOver, summary);
  }

  // ───────────────────────── grafika ─────────────────────────

  private updateCamera(): void {
    const cam = this.cameras.main;
    const sp = this.species;
    const growth = (this.player.radius - sp.baseRadius) / (sp.maxRadius - sp.baseRadius);
    cam.setZoom(Phaser.Math.Linear(cam.zoom, 1 - 0.25 * growth, 0.05));
  }

  /** Wici: falujące nici z tyłu pałeczek. */
  private drawFlagella(): void {
    const g = this.flagella;
    g.clear();
    const t = this.elapsed;
    if (this.species.rod) {
      this.flagellum(g, this.player, COLORS.flagellaPlayer, 3, t, 14);
      this.allies.forEach((a, i) => this.flagellum(g, a, COLORS.flagellaAlly, 1, t + i, 16));
    }
    for (const e of this.enemies) {
      const f = e.def.flagella;
      if (f) this.flagellum(g, e, f.color, f.count, t + e.phase, 8);
    }
    for (const b of this.preyBacteria) this.flagellum(g, b, COLORS.flagellaPrey, 1, t, 10);

    // Umysł zbiorowy: delikatne „nici sygnałowe” (quorum sensing) między członkami kolonii.
    const mates: Cell[] = [this.player, ...this.allies];
    g.lineStyle(1, this.isVirus ? COLORS.burstCopy : COLORS.flagellaAlly, 0.12 + 0.06 * Math.sin(t * 4));
    for (let i = 0; i < mates.length; i++) {
      for (let j = i + 1; j < mates.length; j++) {
        if (dist(mates[i], mates[j]) < 120) g.lineBetween(mates[i].x, mates[i].y, mates[j].x, mates[j].y);
      }
    }
  }

  private flagellum(g: Phaser.GameObjects.Graphics, c: Cell, color: number, count: number, t: number, freq: number): void {
    const back = c.rotation + Math.PI;
    const start = c.radius * 1.25;
    const len = c.radius * 2.2;
    const amp = c.radius * 0.28;
    const segments = 14;
    g.lineStyle(Math.max(1, c.radius * 0.09), color, 0.55);
    for (let k = 0; k < count; k++) {
      const a = back + (k - (count - 1) / 2) * 0.35;
      const dx = Math.cos(a);
      const dy = Math.sin(a);
      g.beginPath();
      for (let i = 0; i <= segments; i++) {
        const s = i / segments;
        const d = start + s * len;
        const w = Math.sin(s * 9 - t * freq + k * 1.7) * amp * s;
        const x = c.x + dx * d - dy * w;
        const y = c.y + dy * d + dx * w;
        if (i === 0) g.moveTo(x, y);
        else g.lineTo(x, y);
      }
      g.strokePath();
    }
  }

  private drawBars(): void {
    const g = this.bars;
    g.clear();

    const pl = this.player;
    g.lineStyle(1, COLORS.playerAura, 0.22).strokeCircle(pl.x, pl.y, pl.radius + this.stats.reach + 6);

    const bar = (c: Cell, color: number, always = false) => {
      if (!always && c.hp >= c.maxHp) return;
      const w = Math.max(24, c.radius * 2);
      const x = c.x - w / 2;
      const y = c.y - c.radius * 1.4 - 10;
      g.fillStyle(0x000000, 0.6).fillRect(x, y, w, 4);
      g.fillStyle(color, 1).fillRect(x, y, w * Phaser.Math.Clamp(c.hp / c.maxHp, 0, 1), 4);
    };

    const o = this.mission?.organ;
    if (o?.isAlive) bar(o, this.mission!.type === 'infect' ? COLORS.infectBar : COLORS.organBar, true);
    for (const st of this.structures) {
      bar(st, STRUCTURES[st.kind].tint, true);
      const range = st.kind === 'turret' ? STRUCTURES.turret.range : st.kind === 'nest' ? STRUCTURES.nest.range : 0;
      if (range) g.lineStyle(1, STRUCTURES[st.kind].tint, 0.18).strokeCircle(st.x, st.y, range);
    }
    // Znacznik rozkazu dla kolonii.
    if (this.allies.length > 0 && (this.order === 'attack' || this.order === 'hold')) {
      const t = this.orderTarget;
      const mx = t ? t.x : this.orderPoint.x;
      const my = t ? t.y : this.orderPoint.y;
      const r = (t ? t.radius + 10 : 22) + Math.sin(this.elapsed * 6) * 3;
      const color = this.order === 'attack' ? 0xf87171 : 0x5eead4;
      g.lineStyle(2, color, 0.8).strokeCircle(mx, my, r);
      g.lineStyle(1, color, 0.25).lineBetween(pl.x, pl.y, mx, my);
    }
    // Podświetlenie komórki wybranej do przeróbki.
    if (this.convertTarget?.active) {
      g.lineStyle(2, 0x5eead4, 0.9).strokeCircle(this.convertTarget.x, this.convertTarget.y, this.convertTarget.radius + 8);
    }
    for (const a of this.allies) bar(a, COLORS.allyBar);
    for (const e of this.enemies) bar(e, COLORS.enemyBar);
    for (const c of this.hostCells) bar(c, COLORS.infectBar);
    for (const b of this.preyBacteria) bar(b, COLORS.infectBar);
  }

  private burst(x: number, y: number, color: number, count: number): void {
    for (let i = 0; i < count; i++) {
      const c = this.add
        .image(x, y, TEX.dot)
        .setTint(color)
        .setScale(Phaser.Math.FloatBetween(0.4, 0.9))
        .setDepth(6);
      const angle = Math.random() * TAU;
      const d = Phaser.Math.Between(15, 50);
      this.tweens.add({
        targets: c,
        x: x + Math.cos(angle) * d,
        y: y + Math.sin(angle) * d,
        alpha: 0,
        scale: 0.1,
        duration: 550,
        ease: 'Cubic.easeOut',
        onComplete: () => c.destroy(),
      });
    }
  }

  // ───────────────────────── pomocnicze ─────────────────────────

  /** Wywołuje `spawn`, dopóki `need()` — ale najwyżej `maxAttempts` razy (żeby nie zawiesić gry). */
  private fill(need: () => boolean, spawn: () => boolean, maxAttempts: number): void {
    for (let i = 0; i < maxAttempts && need(); i++) spawn();
  }

  private ringPoint(center: Point, minR: number, maxR: number): Point {
    const a = Math.random() * TAU;
    // sqrt — równomierny rozkład po powierzchni pierścienia
    const r = Math.sqrt(Phaser.Math.FloatBetween(minR * minR, maxR * maxR));
    return { x: center.x + Math.cos(a) * r, y: center.y + Math.sin(a) * r };
  }

  /** Losowy punkt w pierścieniu, w którym zmieści się koło o promieniu `clearance` (poza ścianami). */
  private openPoint(center: Point, minR: number, maxR: number, clearance: number, attempts = 8): Point | undefined {
    for (let i = 0; i < attempts; i++) {
      const p = this.ringPoint(center, minR, maxR);
      if (!blockedCircle(p.x, p.y, clearance)) return p;
    }
    return undefined;
  }

  private nearest<T extends Cell>(list: T[], x: number, y: number, maxDist: number, filter?: (t: T) => boolean): T | undefined {
    let best: T | undefined;
    let bestD = maxDist;
    for (const t of list) {
      if (!t.isAlive || (filter && !filter(t))) continue;
      const d = Math.hypot(x - t.x, y - t.y);
      if (d < bestD) {
        bestD = d;
        best = t;
      }
    }
    return best;
  }
}
