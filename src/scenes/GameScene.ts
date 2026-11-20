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
  GAME_MODES,
  ENEMY_COUNT_MUL,
  BOSS,
  type GameModeId,
  DNA,
  PROGRESSION,
  STRUCTURES,
  CLOAK,
  FIRST_MISSION_AT,
  GIVE_UP,
  START_ZONE,
  HOST_CELL_TARGET,
  MISSION_COOLDOWN,
  NUTRIENT_TARGET,
  PREY_BACTERIA_TARGET,
  PROTEIN,
  RBC_TARGET,
  CROWD,
  THREAT_PERIOD,
  TOXIN,
} from '../config';
import { unlockAchievement } from '../account/achievements';
import { updateAccount } from '../account/accounts';
import { audio } from '../audio/AudioEngine';
import { Cell } from '../entities/Cell';
import { ENEMY_DEFS, Enemy, isImmuneKind, type EnemyKind } from '../entities/Enemy';
import { Nutrient } from '../entities/Nutrient';
import { Organ } from '../entities/Organ';
import { Prey } from '../entities/Prey';
import { Structure, type StructureKind } from '../entities/Structure';
import { GameEvents, type GameSummary, type MissionType } from '../events';
import { drawFeelers, drawOrganelles } from '../graphics/organelleDraw';
import { applyBody, bodyStretch, body, loadBody } from '../body';
import { TEX, TEX_RADIUS, createTextures } from '../graphics/textures';
import { rollMutations, type Mutation, type PlayerStats } from '../mutations';
import { organellesFor, type OrganelleDef, type PlacedOrganelle } from '../organelles';
import { ACTIONS, isKey, settings, type Action } from '../settings';
import { SPECIES, type SpeciesDef, type SpeciesId } from '../species';
import { WallLayer } from '../world/WallLayer';
import { currentAnimal, inStartZone, partAt, pickStartZone, setAnimal, setStartZone, startZone, type AnimalId } from '../world/animal';
import { BIOMES, type BiomeId } from '../world/biomes';
import { Navigator, avoidWalls } from '../world/navigation';
import { biomeAt, blockedCircle, findOpenSpot, isWall } from '../world/walls';

type ControlMode = 'none' | 'mouse' | 'keyboard';

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
  title: string;
  /** narząd (obrona / infekcja) */
  organ?: Organ;
  /** gniazdo do zniszczenia (ognisko infekcji / węzeł chłonny) */
  nest?: Enemy;
  /** rzadkie składniki do zebrania */
  items?: Nutrient[];
  /** „matka” z kolonii, która dzieli się w trakcie misji mnożenia */
  mother?: Cell;
  /** postęp (zebrane / zarażone) i cel */
  count: number;
  goal: number;
  timeLeft: number;
  spawnTimer: number;
  /** odliczanie do następnego wystrzału białka */
  fireTimer: number;
}

/** Przyjazna postać, którą można spotkać rzadko. */
interface Friend {
  cell: Cell;
  label: Phaser.GameObjects.Text;
  age: number;
  wander: number;
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
  title: string;
  /** np. „Zdrowie narządu 80%”, „Zebrane 3/8” */
  detail: string;
  timeLeft: number;
  /** gdzie wskazuje strzałka (brak = misja bez miejsca) */
  x?: number;
  y?: number;
}

/** Ile zarażonych komórek w narządzie potrzeba, by go podbić (wirus). */
const CONQUEST_PER_ORGAN = 6;

/** Wielka misja bakterii „Mnożenie się”: czas podziału matki (s). */
const MULTIPLY_TIME = 50;

const TAU = Math.PI * 2;
const MOVE_ACTIONS: Action[] = ['up', 'down', 'left', 'right'];
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
  /** boss z wyzwania (jeśli żyje) */
  boss?: Enemy;
  /** poziom gracza potrzebny, by pojawił się następny boss */
  private bossLevel = BOSS.minLevel;
  private bossSummon = 0;
  private bossRetry = 0;
  private deadBoss?: Enemy;
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
  /** miejsce w ciele myszy (narząd / część ciała) */
  regionName = '';
  // Liczniki do osiągnięć (w tej grze).
  private infections = 0;
  private ordersGiven = new Set<ColonyOrder>();
  /** odwiedzone układy narządów (osiągnięcie „Anatom”) */
  private visited = new Set<string>();
  /** zwierzę, w którym toczy się gra */
  animal: AnimalId = 'mouse';
  mode: GameModeId = 'normal';
  /** podbój organizmu (wirus): postęp w narządach i podbite narządy */
  private conquest = new Map<string, number>();
  private conquered = new Set<string>();
  /** przyjazna postać (rzadka) i odliczanie do następnej */
  private friend?: Friend;
  private friendTimer = 0;
  /** sojusznicy na czas (przyjazne postacie) — kiedy odejdą */
  private allyExpire = new Map<Cell, number>();
  private lastMissionType?: MissionType;
  /** siła czerwonego błysku krawędzi ekranu po trafieniu (0–1, gaśnie) — czyta UIScene */
  hurtPulse = 0;
  /** maskowanie: pozostały czas działania i odnowienia (s) */
  cloakTime = 0;
  cloakCd = 0;

  get cloaked(): boolean {
    return this.cloakTime > 0;
  }
  private glow!: Phaser.GameObjects.Image;
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
  /** zdarzenia w organizmie gospodarza: czas do następnego, aktywne (nazwa i czas) oraz ich modyfikatory */
  private hostEventIn = 40;
  private hostEventLeft = 0;
  private hostEventName = '';
  private evSpeedMul = 1;
  private evSpawnMul = 1;
  private pendingLevelUps = 0;
  private offerOpen = false;
  private over = false;
  private control: ControlMode = 'none';
  /** klawisze trzymane teraz / wciśnięte od ostatniej klatki (KeyboardEvent.code) */
  private held = new Set<string>();
  private pressed = new Set<string>();
  /** czy gracz używał myszy (celowanie kursorem) */
  private pointerSeen = false;
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
    return 1 + (this.elapsed / THREAT_PERIOD) * GAME_MODES[this.mode].threatRate;
  }

  get xpToNext(): number {
    return PROGRESSION.xpBase + this.level * PROGRESSION.xpPerLevel;
  }

  get missionInfo(): MissionInfo | undefined {
    const m = this.mission;
    if (!m) return undefined;
    const pct = (c: Cell) => `${Math.round(Phaser.Math.Clamp(c.hp / c.maxHp, 0, 1) * 100)}%`;
    const base = { type: m.type, title: m.title, timeLeft: Math.max(0, m.timeLeft) };
    switch (m.type) {
      case 'defend':
        return { ...base, detail: `Zdrowie narządu ${pct(m.organ!)}`, x: m.organ!.x, y: m.organ!.y };
      case 'infect':
        return { ...base, detail: `Odporność narządu ${pct(m.organ!)}`, x: m.organ!.x, y: m.organ!.y };
      case 'nest':
        return { ...base, detail: `Wytrzymałość gniazda ${pct(m.nest!)}`, x: m.nest!.x, y: m.nest!.y };
      case 'collect': {
        // Strzałka wskazuje najbliższy niezebrany składnik.
        const near = this.nearestPoint(m.items ?? [], this.player);
        return { ...base, detail: `Zebrane ${m.count} / ${m.goal}`, x: near?.x, y: near?.y };
      }
      case 'outbreak':
        return { ...base, detail: `Zarażone ${m.count} / ${m.goal}` };
      case 'multiply': {
        const mo = m.mother!;
        const pctDone = Math.round(Phaser.Math.Clamp(1 - m.timeLeft / MULTIPLY_TIME, 0, 1) * 100);
        return { ...base, detail: `Podział ${pctDone}% · zdrowie matki ${pct(mo)}`, x: mo.x, y: mo.y };
      }
    }
  }

  /** Podbój organizmu przez wirusa: ile narządów podbitych, ile wszystkich, postęp w obecnym. */
  get conquestInfo(): { done: number; total: number; here?: { name: string; progress: number; goal: number; conquered: boolean } } {
    const names = this.organNames;
    const hereName = names.includes(this.regionName) ? this.regionName : undefined;
    return {
      done: this.conquered.size,
      total: names.length,
      here: hereName
        ? { name: hereName, progress: this.conquest.get(hereName) ?? 0, goal: CONQUEST_PER_ORGAN, conquered: this.conquered.has(hereName) }
        : undefined,
    };
  }

  /** Nazwy narządów bieżącego zwierzęcia (do podboju). */
  get organNames(): string[] {
    return [...new Set(currentAnimal().organs.map((o) => o.name))];
  }

  /** Podbite narządy (do dużej mapy). */
  get conqueredOrgans(): ReadonlySet<string> {
    return this.conquered;
  }

  /** Przyjazna postać w pobliżu (do minimapy). */
  get friendPos(): Point | undefined {
    return this.friend ? { x: this.friend.cell.x, y: this.friend.cell.y } : undefined;
  }

  /** Boss z wyzwania: do paska zdrowia i znaczników na mapach. */
  get bossInfo(): { name: string; hp: number; maxHp: number; x: number; y: number } | undefined {
    const b = this.boss;
    if (!b?.active || b.hp <= 0) return undefined;
    return { name: b.def.name, hp: b.hp, maxHp: b.maxHp, x: b.x, y: b.y };
  }

  get nextMissionIn(): number {
    return Math.max(0, this.nextMissionAt - this.elapsed);
  }

  /** Scena jest restartowana na tej samej instancji — stan resetujemy tutaj. */
  init(data: { species?: SpeciesId; animal?: AnimalId; mode?: GameModeId }): void {
    this.mode = data.mode ?? this.mode ?? 'normal';
    this.species = SPECIES[data.species ?? this.species?.id ?? 'bacterium'];
    // Zwierzę, w którym toczy się gra (świat, narządy, skóra).
    this.animal = data.animal ?? this.animal ?? 'mouse';
    setAnimal(this.animal);
    // Losowe miejsce startu: strefa zarażona, w której łatwiej zacząć.
    setStartZone(pickStartZone(Math.random, START_ZONE.radius));
    this.cloakTime = 0;
    this.cloakCd = 0;
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
    this.regionName = '';
    this.infections = 0;
    this.conquest = new Map();
    this.conquered = new Set();
    this.friend = undefined;
    this.friendTimer = Phaser.Math.FloatBetween(60, 90);
    this.allyExpire = new Map();
    this.lastMissionType = undefined;
    this.achieved = new Set();
    this.ordersGiven = new Set();
    this.visited = new Set();
    this.biomeCheck = 0;
    this.order = 'follow';
    this.orderTarget = undefined;
    this.mission = undefined;
    this.boss = undefined;
    this.bossLevel = BOSS.minLevel;
    this.bossSummon = 0;
    this.bossRetry = 0;
    this.biomass = 0;
    this.xp = 0;
    this.level = 1;
    this.kills = 0;
    this.missionsDone = 0;
    this.elapsed = 0;
    this.nextMissionAt = FIRST_MISSION_AT;
    this.spawnTimer = 3;
    this.hostEventIn = 40;
    this.hostEventLeft = 0;
    this.evSpeedMul = 1;
    this.evSpawnMul = 1;
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
    const z = startZone();
    const start = z ? findOpenSpot(90, z.x, z.y) : findOpenSpot(90);
    this.player = new Cell(this, start.x, start.y, sp.baseRadius, sp.texture, sp.texRadius, this.stats.maxHp).setDepth(5);
    this.player.setRotation(-Math.PI / 2);
    // Budowa ciała bakterii nadana w edytorze (kształt, rozmiar, czułki).
    loadBody();
    this.applyBodyDesign();

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
    this.glow = this.add
      .image(this.player.x, this.player.y, TEX.blob)
      .setTint(this.isVirus ? 0x5eead4 : 0x6ee7b7)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setDepth(4.95);
    this.hurtPulse = 0;
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

    // Osiągnięcie „Dwie strony”: zapamiętaj, kim gracz już grał.
    const nick = this.registry.get('account') as string | undefined;
    if (nick) {
      let both = false;
      updateAccount(nick, (acc) => {
        acc.played = [...new Set([...(acc.played ?? []), this.species.id])];
        both = acc.played.length >= 2;
      });
      if (both) this.achieve('both-sides');
    }
  }

  update(_time: number, delta: number): void {
    const dt = Math.min(delta, 50) / 1000;
    this.updateEnvironment(dt);
    if (this.over) return;
    this.elapsed += dt;
    this.abilityCd = Math.max(0, this.abilityCd - dt);
    this.convertCd = Math.max(0, this.convertCd - dt);
    this.updateBiome(dt);

    // Klawisze wg ustawień gracza (można je zmienić w Ustawieniach).
    const pressed = this.pressed;
    this.pressed = new Set();
    const just = (a: Action) => settings.keys[a].some((c) => c && pressed.has(c));
    if (just('divide')) this.divide();
    if (just('ability')) this.useAbility();
    if (just('convert')) this.requestConvert();
    if (just('cloak')) this.useCloak();
    this.cloakCd = Math.max(0, this.cloakCd - dt);
    if (this.cloakTime > 0) {
      this.cloakTime -= dt;
      if (this.cloakTime <= 0) this.endCloak();
    }
    if (just('orderFollow')) this.issueOrder('follow');
    if (just('orderAttack')) this.issueOrder('attack');
    if (just('orderHold')) this.issueOrder('hold');
    if (just('orderForage')) this.issueOrder('forage');
    if (just('editor')) {
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
    this.updateBoss(dt);
    this.updateHostEvents(dt);
    this.updateFriends(dt);
    this.player.hp = Math.min(this.stats.maxHp, this.player.hp + this.stats.regen * dt);
    this.updateCamera();
    this.hurtPulse = Math.max(0, this.hurtPulse - dt * 2.5);
    this.updateGlow();
    this.drawFlagella();
    this.organelleGfx.clear();
    const pl = this.player;
    if (this.species.rod) drawFeelers(this.organelleGfx, pl.x, pl.y, pl.radius, pl.rotation, this.elapsed);
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
    if (this.organelles.length >= 5) this.achieve('builder');
    if (this.organelles.length >= 10) this.achieve('builder10');
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
    if (this.species.rod) applyBody(s);
    // Mniejsze bakterie (kolonia) rosną w siłę wraz z poziomem gracza.
    const allyLevelMul = 1 + 0.06 * Math.max(0, (this.level ?? 1) - 1);
    s.allyMaxHp *= allyLevelMul;
    s.allyDamage *= allyLevelMul;
    this.stats = s;

    this.player.maxHp = s.maxHp;
    this.player.hp = Math.min(s.maxHp, this.player.hp + Math.max(0, s.maxHp - oldMax));
    for (const a of this.allies) {
      if (a === this.mission?.mother) continue; // matka ma własne, wzmocnione zdrowie
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
    this.achieve('architect');
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
      // Krwinka niesie tlen: dotknięta przez gracza leczy go i znika (pojawia się nowa na brzegu).
      if (this.player.isAlive && dist(d.img, this.player) < this.player.radius + 34 * d.img.scaleX * 0.55) {
        const heal = this.stats.maxHp * 0.06;
        this.player.hp = Math.min(this.stats.maxHp, this.player.hp + heal);
        this.floatText(d.img.x, d.img.y, `+${Math.max(1, Math.round(heal))} tlen`, '#fca5a5');
        const p = this.ringPoint(this.player, ACTIVE_RADIUS * 0.8, ACTIVE_RADIUS);
        d.img.setPosition(p.x, p.y);
        continue;
      }
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
    this.held.clear();
    this.pressed.clear();

    const isBound = (code: string) => ACTIONS.some((a) => isKey(a, code));
    const onKey = (e: KeyboardEvent) => {
      // Klawisze gry nie mogą przewijać strony / przenosić fokusu (np. Tab, Spacja, strzałki).
      if (isBound(e.code)) e.preventDefault();
      if (!e.repeat) this.pressed.add(e.code);
      this.held.add(e.code);
      if (MOVE_ACTIONS.some((a) => isKey(a, e.code))) this.control = 'keyboard';
    };
    const onKeyUp = (e: KeyboardEvent) => {
      this.held.delete(e.code);
    };
    const onMove = () => {
      this.pointerSeen = true;
      if (settings.mouseFollow) this.control = 'mouse';
    };
    // Po pauzie / edytorze / utracie fokusu klawisze mogły zostać puszczone bez zdarzenia.
    const releaseAll = () => this.held.clear();
    this.events.on(Phaser.Scenes.Events.RESUME, releaseAll);
    window.addEventListener('blur', releaseAll);
    const onDown = (p: Phaser.Input.Pointer) => {
      // Klik w element interfejsu (np. kartę mutacji) nie jest atakiem.
      const ui = this.scene.get('UIScene');
      if (ui?.sys.isActive() && ui.input.hitTestPointer(p).length > 0) return;
      if (p.rightButtonDown()) this.divide();
      else if (p.leftButtonDown()) this.useAbility();
    };

    kb.on('keydown', onKey);
    kb.on('keyup', onKeyUp);
    this.input.on('pointermove', onMove);
    this.input.on('pointerdown', onDown);
    this.input.mouse?.disableContextMenu();

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      kb.off('keydown', onKey);
      kb.off('keyup', onKeyUp);
      this.input.off('pointermove', onMove);
      this.input.off('pointerdown', onDown);
      this.events.off(Phaser.Scenes.Events.RESUME, releaseAll);
      window.removeEventListener('blur', releaseAll);
    });
  }

  /** Czy akcja jest teraz wciśnięta (którykolwiek z jej klawiszy). */
  private holding(a: Action): boolean {
    return settings.keys[a].some((c) => c && this.held.has(c));
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
        const dx = Number(this.holding('right')) - Number(this.holding('left'));
        const dy = Number(this.holding('down')) - Number(this.holding('up'));
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
    // Celowanie kursorem działa też przy sterowaniu klawiaturą (gdy mysz była użyta).
    if (this.control === 'mouse' || this.pointerSeen) {
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

  // ───────────────────────── maskowanie ─────────────────────────

  private useCloak(): void {
    if (this.over) return;
    if (this.cloakCd > 0) {
      this.game.events.emit(GameEvents.Toast, `Maskowanie gotowe za ${Math.ceil(this.cloakCd)} s`);
      return;
    }
    this.cloakTime = CLOAK.duration;
    this.cloakCd = CLOAK.cooldown;
    this.player.setAlpha(0.35);
    this.ringFx(this.player.x, this.player.y, 0xa5b4fc, this.player.radius * 4);
    audio.sfx('dash');
    this.game.events.emit(GameEvents.Toast, 'Maskowanie! Wrogowie Cię nie widzą (atak je przerywa)');
    // Wrogowie tracą trop — chwilowo odpuszczają pogoń za graczem.
    for (const e of this.enemies) e.chaseTime = 0;
  }

  private endCloak(): void {
    this.cloakTime = 0;
    this.player.setAlpha(1);
  }

  private useAbility(): void {
    if (this.over || this.abilityCd > 0) return;
    if (this.cloaked) this.endCloak(); // atak zdradza pozycję
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
    this.infections++;
    if (this.infections >= 30) this.achieve('pandemic');
    if (this.mission?.type === 'outbreak') this.mission.count++;
    // Podbój organizmu: każda zarażona komórka przybliża podbój narządu, w którym jest.
    this.addConquest(biomeAt(c.x, c.y).name, 1);
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
      const mo = this.mission?.organ;
      if (this.mission?.type === 'infect' && mo?.isAlive) targets.push(mo);
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
      if (a === this.mission?.mother) {
        // Matka (misja mnożenia) płynie sama za graczem, niezależnie od rozkazów.
        const mf = this.waypoint(a, { x: p.x + Math.cos(back) * (p.radius + a.radius + 24), y: p.y + Math.sin(back) * (p.radius + a.radius + 24) });
        this.steerMove(a, mf.x, mf.y, this.stats.speed * 1.35, dt, 8, { x: 0, y: 0 });
        if (this.species.rod) a.faceMovement(dt, 9);
        else a.rotation += dt * 2;
        return;
      }
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
    if (this.control === 'mouse' || this.pointerSeen) {
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
        const mo = this.mission?.organ;
        if (this.mission?.type === 'infect' && mo?.isAlive) targets.push(mo);
      }
      this.orderTarget = this.nearest(targets, point.x, point.y, 220);
    }
    if (order === 'attack' || order === 'hold') this.burst(point.x, point.y, 0x5eead4, 8);
    this.game.events.emit(GameEvents.Toast, `Rozkaz: ${ORDER_NAMES[order]}`);
    audio.sfx('order');
    if (this.allies.length > 0) this.ordersGiven.add(order);
    if (this.ordersGiven.size >= 4) this.achieve('commander');
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
    // Tłok: gdy przed nami jest za gęsto, omiń zator bokiem — w stronę, gdzie jest luźniej.
    let bx = 0;
    let by = 0;
    const speedNow = Math.hypot(c.vx, c.vy);
    if (n >= CROWD.minNeighbors && speedNow > 1) {
      const hx = c.vx / speedNow;
      const hy = c.vy / speedNow;
      let left = 0;
      let right = 0;
      for (const m of mates) {
        if (m === c) continue;
        const dx = m.x - c.x;
        const dy = m.y - c.y;
        if (dx * dx + dy * dy > radius * radius) continue;
        if (dx * hx + dy * hy < 0) continue; // tylko to, co przed nami
        if (hx * dy - hy * dx > 0) right++;
        else left++;
      }
      const ahead = left + right;
      if (ahead >= CROWD.minAhead) {
        const side = left === right ? c.detourSide : left < right ? -1 : 1;
        c.detourSide = side as 1 | -1;
        const k = Math.min(1, ahead / (CROWD.minAhead * 2)) * CROWD.detour;
        bx = -hy * side * k;
        by = hx * side * k;
      }
    }
    if (separationOnly) return { x: sx * 2.4 + bx, y: sy * 2.4 + by };
    const al = Math.hypot(ax, ay) || 1;
    cx = cx / n - c.x;
    cy = cy / n - c.y;
    const cl = Math.hypot(cx, cy) || 1;
    // W tłoku nie skupiamy się jeszcze bardziej w kupę.
    const cohesion = n >= CROWD.minNeighbors ? 0 : 0.2;
    return {
      x: sx * 2.4 + (ax / al) * 0.3 + (cx / cl) * cohesion + bx,
      y: sy * 2.4 + (ay / al) * 0.3 + (cy / cl) * cohesion + by,
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
      const m = c.swim(Math.cos(ang) * step, Math.sin(ang) * step, this.elapsed);
      c.tryMove(m.x, m.y);
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

  // ───────────────────────── zdarzenia w organizmie ─────────────────────────

  /** Losowe zdarzenia gospodarza (zranienie, gorączka, posiłek, sen, kaszel) — co 45–90 s. */
  private updateHostEvents(dt: number): void {
    if (this.hostEventLeft > 0) {
      this.hostEventLeft -= dt;
      if (this.hostEventLeft <= 0) {
        this.evSpeedMul = 1;
        this.evSpawnMul = 1;
        this.game.events.emit(GameEvents.Toast, `Koniec: ${this.hostEventName}`);
      }
      return;
    }
    this.hostEventIn -= dt;
    if (this.hostEventIn > 0) return;
    this.hostEventIn = 45 + Math.random() * 45;
    const toast = (m: string) => this.game.events.emit(GameEvents.Toast, m);
    const cam = this.cameras.main;
    const pl = this.player;
    let kind = Phaser.Math.Between(0, 5);
    // Szczepionka wymaga doświadczonego gracza i braku innego bossa.
    if (kind === 5 && (this.boss || this.level < 4)) kind = Phaser.Math.Between(0, 4);

    if (kind === 0) {
      // Zranienie: odporność mobilizuje się w okolicy, ale rana niesie też trochę tlenu i pożywienia.
      toast('⚠ Stworzenie się zraniło! Układ odpornościowy rusza do rany');
      cam.flash(300, 220, 38, 38);
      cam.shake(350, 0.006);
      const biome = BIOMES[biomeAt(pl.x, pl.y).a];
      const pool = (Object.entries(biome.immune) as [EnemyKind, number][]).filter(([k]) => ENEMY_DEFS[k].minThreat <= this.threat);
      if (pool.length && !inStartZone(pl.x, pl.y)) {
        for (let i = 0; i < 4; i++) {
          const p = this.openPoint(pl, 600, 900, 30);
          if (p) this.spawnEnemy(Phaser.Utils.Array.GetRandom(pool)[0], p);
        }
      }
      for (let i = 0; i < 8; i++) {
        if (this.isVirus) this.spawnPrey(250);
        else this.spawnNutrient(150);
      }
    } else if (kind === 1) {
      toast('🌡 Gorączka! Komórki odpornościowe są szybsze (25 s)');
      this.evSpeedMul = 1.25;
      this.hostEventName = 'gorączka';
      this.hostEventLeft = 25;
    } else if (kind === 2) {
      toast('🍽 Stworzenie zjadło posiłek — wokół pełno pożywienia');
      for (let i = 0; i < 16; i++) {
        if (this.isVirus) this.spawnPrey(250);
        else this.spawnNutrient(120);
      }
    } else if (kind === 3) {
      toast('😴 Stworzenie śpi — odporność słabnie (30 s)');
      this.evSpawnMul = 2.5;
      this.hostEventName = 'sen';
      this.hostEventLeft = 30;
    } else if (kind === 5) {
      const p = this.openPoint(pl, 700, 1100, 80, 20);
      if (!p) {
        this.hostEventIn = 5; // brak miejsca — spróbuj niedługo ponownie
        return;
      }
      toast('💉 Stworzenie dostało SZCZEPIONKĘ! Wielki obrońca atakuje każdego patogena');
      cam.flash(400, 125, 211, 252);
      this.spawnBoss('vaccine', p);
    } else {
      // Kaszel/kichnięcie: wstrząs odrzuca wszystko w jedną stronę.
      toast('💨 Stworzenie kicha! Wstrząs odrzuca wszystko');
      cam.shake(500, 0.012);
      const a = Math.random() * Math.PI * 2;
      const cells: Cell[] = [pl, ...this.enemies, ...this.allies];
      for (let s = 0; s < 5; s++) for (const c of cells) c.tryMove(Math.cos(a) * 50, Math.sin(a) * 50);
    }
  }

  // ───────────────────────── wrogowie ─────────────────────────

  private updateSpawning(dt: number): void {
    const t = this.threat;
    const D = DIFFICULTY;
    const maxAlive = this.maxEnemies;
    this.spawnTimer -= dt;
    if (this.spawnTimer > 0 || this.enemies.length >= maxAlive) return;

    const p = this.openPoint(this.player, 950, 1200, 30);
    if (!p) return; // spróbujemy w następnej klatce
    this.spawnTimer = Math.max(D.spawnMin, D.spawnStart - t * D.spawnPerThreat) * GAME_MODES[this.mode].spawnMul * this.evSpawnMul / ENEMY_COUNT_MUL;
    // Strefa zarażona: wrogowie rzadziej i nigdy w samej strefie.
    if (inStartZone(this.player.x, this.player.y)) this.spawnTimer *= START_ZONE.spawnSlowdown;
    if (inStartZone(p.x, p.y)) return;

    // Rodzaj wroga zależy od biomu, w którym jest gracz.
    const biome = BIOMES[biomeAt(p.x, p.y).a];
    // Wirusa atakuje tylko układ odpornościowy; bakterię — patogeny i organizm (układ odpornościowy).
    const weights: Partial<Record<EnemyKind, number>> = { ...biome.immune };
    if (!this.isVirus) for (const [k, w] of Object.entries(biome.enemies) as [EnemyKind, number][]) weights[k] = (weights[k] ?? 0) + w;
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

    // Osiągnięcia sprawdzane okresowo.
    if (this.elapsed >= 180) this.achieve('survivor');
    if (this.elapsed >= 600) this.achieve('veteran');
    if (this.allies.length >= 5) this.achieve('colony');
    if (this.allies.length >= 10) this.achieve('colony10');
    if (this.elapsed >= 300) this.achieve('survivor5');
    if (this.elapsed >= 300 && this.mode === 'hard') this.achieve('hard-mode');
    if (this.dna >= 10) this.achieve('dna10');

    // Miejsce w ciele myszy (narząd / część ciała) i jego biom.
    const r = biomeAt(this.player.x, this.player.y);
    if (r.system) this.visited.add(r.system);
    if (this.visited.size >= 4) this.achieve('anatomist');
    if (partAt(this.player.x, this.player.y) === 'Ogon') this.achieve('tail');
    if (r.name !== this.regionName) {
      const first = this.regionName === '';
      this.regionName = r.name;
      if (!first) {
        this.game.events.emit(GameEvents.BiomeChange, r.name);
        audio.sfx('swell');
      }
    }
    if (r.a !== this.biome) {
      this.biome = r.a;
      audio.setTheme(r.a);
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
    // Zamaskowanego gracza wrogowie nie widzą (kolonię i budowle — tak).
    const victims: Cell[] = [...(this.cloaked ? [] : [this.player]), ...this.allies, ...this.structures];
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
      // Odpuścił — przez chwilę nikogo nie goni.
      if (this.elapsed < e.giveUpUntil) continue;
      let v = this.isPeaceful(e) ? undefined : this.nearest(victims, e.x, e.y, e.aggro * this.stats.stealth);
      // Patogeny i układ odpornościowy walczą ze sobą: bliższy wróg przeciwnej frakcji ma pierwszeństwo.
      const foe = this.nearest(this.enemies.filter((o) => o !== e && o.hp > 0 && isImmuneKind(o.kind) !== isImmuneKind(e.kind) && o.speed >= 0), e.x, e.y, 260);
      if (foe && (!v || dist(e, foe) < dist(e, v))) v = foe;
      if (!v) continue;
      victimOf.set(e, v);
      // Długi pościg bez dosięgnięcia ofiary → wróg odpuszcza.
      if (dist(e, v) < e.radius + v.radius + 12) e.chaseTime = 0;
      else e.chaseTime += dt;
      if (e.chaseTime > GIVE_UP.after && !e.missionTarget && !e.guardOf && !e.def.boss) {
        e.chaseTime = 0;
        e.giveUpUntil = this.elapsed + GIVE_UP.duration;
        victimOf.delete(e);
        continue;
      }
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
      let speed = e.speed * (isImmuneKind(e.kind) ? this.evSpeedMul : 1);

      // Odpuszczający wróg odpływa od gracza; gdy oddali się poza ekran — znika.
      if (this.elapsed < e.giveUpUntil) {
        const d = dist(e, pl);
        if (d > GIVE_UP.despawnAt) {
          e.destroy();
          return false;
        }
        const away = Math.atan2(e.y - pl.y, e.x - pl.x) + Math.sin(this.elapsed + e.phase) * 0.6;
        this.steerMove(e, e.x + Math.cos(away) * 100, e.y + Math.sin(away) * 100, speed * 0.6, dt, 0);
        if (e.motion === 'spin') e.rotation += dt;
        else e.faceMovement(dt, 3);
        return true;
      }

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
      } else if (e.def.boss) {
        // Boss czeka na swoim miejscu, póki gracz nie zbliży się na zasięg wykrycia.
        e.rotation += dt * 0.3;
        return true;
      } else {
        // Ciągła presja: dryf w stronę gracza (zamaskowanego — błądzenie).
        if (this.cloaked) {
          const a = this.elapsed * 0.3 + e.phase;
          target = { x: e.x + Math.cos(a) * 100, y: e.y + Math.sin(a) * 100 };
          speed *= 0.4;
        } else {
          target = pl;
          stopAt = e.radius + pl.radius;
          speed *= 0.5;
        }
      }
      // Droga naokoło ścian (mapa odległości) + czujniki ścian w steerMove.
      const wp = this.waypoint(e, target);
      const mates = byKind.get(e.kind);
      // Przy otaczaniu tylko odpychanie (bez skupiania się w kupę), w marszu — pełne stado.
      const flock = mates ? this.flockSteer(e, mates, 120, surround.has(e)) : undefined;
      this.steerMove(e, wp.x, wp.y, speed, dt, wp === target ? stopAt : 0, flock);

      if (e.motion === 'spin') e.rotation += dt * (e.kind === 'virus' ? 1.5 : e.radius < 10 ? 2 : 0.3);
      else e.faceMovement(dt, e.kind === 'antibody' || e.kind === 'spirochete' ? 8 : 3);

      if (!e.missionTarget && !e.guardOf && !e.def.boss && e.speed > 0 && dist(e, pl) > ENEMY_DESPAWN_RADIUS) {
        e.destroy();
        return false;
      }
      return true;
    });

    // Nadmiar wrogów: usuń najdalszych (poza ekranem), aż liczba spadnie do limitu.
    const limit = this.maxEnemies;
    if (this.enemies.length > limit) {
      const removable = this.enemies
        .filter((e) => !e.missionTarget && !e.guardOf && !e.def.boss && e.speed > 0 && dist(e, pl) > GIVE_UP.excessFar)
        .sort((a, b) => dist(b, pl) - dist(a, pl));
      const drop = new Set(removable.slice(0, this.enemies.length - limit));
      if (drop.size) {
        for (const e of drop) e.destroy();
        this.enemies = this.enemies.filter((e) => !drop.has(e));
      }
    }
  }

  /** Odblokowuje osiągnięcie na koncie gracza (jeśli jeszcze go nie ma) i pokazuje powiadomienie. */
  private achieve(id: string): void {
    const nick = this.registry.get('account') as string | undefined;
    if (!nick) return;
    if (this.achieved.has(id)) return; // szybki filtr — bez czytania konta co klatkę
    this.achieved.add(id);
    const def = unlockAchievement(nick, id);
    if (def) {
      this.game.events.emit(GameEvents.Achievement, def);
      audio.sfx('success');
    }
  }

  private achieved = new Set<string>();

  /** Limit wrogów naraz przy obecnym zagrożeniu. */
  private get maxEnemies(): number {
    const D = DIFFICULTY;
    return Math.round(Math.min(D.maxAliveCap, D.maxAliveBase + Math.floor(this.threat * D.maxAlivePerThreat)) * GAME_MODES[this.mode].maxMul * ENEMY_COUNT_MUL);
  }

  // ───────────────────────── walka i infekcja ─────────────────────────

  /** Jako wirus nie atakują Cię inne patogeny (wirusy, bakterie) — walczą tylko z układem odpornościowym. */
  private isPeaceful(e: Enemy): boolean {
    return this.isVirus && !isImmuneKind(e.kind);
  }

  private resolveCombat(dt: number): void {
    const pl = this.player;
    const s = this.stats;
    const dashing = this.dashTime > 0;
    let playerHurt = false;
    const hurtAllies = new Set<Cell>();
    const organ = this.mission?.organ;

    for (const e of this.enemies) {
      let hit = false;
      const peaceful = this.isPeaceful(e);
      const dPl = peaceful ? Infinity : dist(e, pl);
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
      for (const o of this.enemies) {
        if (o !== e && isImmuneKind(o.kind) !== isImmuneKind(e.kind) && dist(e, o) < o.radius + e.radius + 3) {
          o.hp -= e.dps * 0.6 * dt;
          hit = true;
        }
      }
      for (const a of peaceful ? [] : this.allies) {
        if (dist(e, a) < a.radius + e.radius + 3) {
          e.hurt(s.allyDamage * a.damageMul * dt);
          a.hp -= e.dps * s.armor * dt;
          hit = true;
          hurtAllies.add(a);
        }
      }
      if (organ?.isAlive && e.missionTarget === organ && dist(e, organ) < organ.radius + e.radius + 2) {
        organ.hp -= e.dps * dt;
      }
      for (const st of peaceful ? [] : this.structures) {
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
        for (const a of this.allies) if (dist(c, a) < a.radius + c.radius + 3) c.hp -= s.allyDamage * a.damageMul * dt;
        if (c.hp < c.maxHp) c.setTint(COLORS.infectTint);
      }
    }

    // Szarża: jednorazowe silne trafienie każdego celu na drodze.
    if (dashing) {
      for (const c of [...this.enemies, ...infectables]) {
        if (this.dashHits.has(c) || dist(c, pl) > pl.radius + c.radius + 6) continue;
        this.dashHits.add(c);
        c.hurt(s.abilityDamage);
        this.floatText(c.x, c.y - c.radius, `-${Math.round(s.abilityDamage * c.armorMul)}`, '#5eead4');
        this.burst(c.x, c.y, COLORS.dashTrail, 6);
      }
    }

    if (playerHurt) this.hurtPulse = Math.max(this.hurtPulse, 0.6);
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
      this.achieve('first-blood');
      if (e === this.boss) this.onBossDefeated(e);
      if (this.kills >= 100) this.achieve('hunter');
      if (this.kills >= 30) this.achieve('slayer30');
      if (this.kills >= 300) this.achieve('exterminator');
      if (e.kind === 'mycobacterium' || e.kind === 'macrophage') this.achieve('giant-slayer');
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
    const o = m?.organ;
    if (!m || !o?.isAlive) return;
    m.fireTimer -= dt;
    if (m.fireTimer > 0) return;

    const hostile = m.type === 'infect';
    const candidates: Cell[] = hostile ? [...(this.cloaked ? [] : [this.player]), ...this.allies] : this.enemies;
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
        else {
          v.hurt(p.damage);
          // Liczby obrażeń tylko dla toksyn gracza (bez „szumu” od wieżyczek i narządów).
          if (!p.target) this.floatText(v.x, v.y - v.radius, `-${Math.round(p.damage * v.armorMul)}`, '#d9f99d');
        }
        if (v === this.player) {
          this.playerHitFlash = 0.15;
          this.hurtPulse = 1;
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

    switch (m.type) {
      case 'defend': {
        const o = m.organ!;
        m.spawnTimer -= dt;
        if (m.spawnTimer <= 0 && m.timeLeft > 3) {
          m.spawnTimer = Math.max(0.9, 1.8 - this.threat * 0.08);
          this.spawnAttacker(o);
        }
        if (!o.isAlive) this.endMission(false);
        else if (m.timeLeft <= 0) this.endMission(true);
        break;
      }
      case 'infect':
        if (!m.organ!.isAlive) this.endMission(true);
        else if (m.timeLeft <= 0) this.endMission(false);
        break;
      case 'nest': {
        const n = m.nest!;
        if (!n.active || n.hp <= 0) {
          this.endMission(true);
          break;
        }
        // Gniazdo wypuszcza wrogów, którzy go pilnują.
        m.spawnTimer -= dt;
        if (m.spawnTimer <= 0) {
          m.spawnTimer = Math.max(1.6, 3.2 - this.threat * 0.1);
          const kind: EnemyKind = this.isVirus ? (Math.random() < 0.3 ? 'leukocyte' : 'antibody') : Math.random() < 0.3 ? 'germ' : 'virus';
          this.spawnGuard(kind, n);
        }
        if (m.timeLeft <= 0) this.endMission(false);
        break;
      }
      case 'collect': {
        const items = m.items ?? [];
        const collectors: Cell[] = [this.player, ...this.allies];
        m.items = items.filter((it) => {
          if (!collectors.some((c) => dist(c, it) < c.radius + it.r + 8)) return true;
          this.burst(it.x, it.y, 0xfde047, 10);
          it.destroy();
          m.count++;
          audio.sfx('select');
          return false;
        });
        if (m.count >= m.goal) this.endMission(true);
        else if (m.timeLeft <= 0) this.endMission(false);
        break;
      }
      case 'outbreak':
        if (m.count >= m.goal) this.endMission(true);
        else if (m.timeLeft <= 0) this.endMission(false);
        break;
      case 'multiply': {
        const mo = m.mother!;
        if (!mo.active || !mo.isAlive) {
          this.endMission(false);
          break;
        }
        // Patogeny napierają na matkę, póki trwa podział.
        m.spawnTimer -= dt;
        if (m.spawnTimer <= 0 && m.timeLeft > 4) {
          m.spawnTimer = Math.max(1.8, 3.4 - this.threat * 0.12);
          this.spawnGuard(Math.random() < Math.min(0.4, 0.08 * this.threat) ? 'germ' : 'virus', mo);
        }
        mo.setPulse(1 + Math.sin(this.elapsed * 8) * 0.08 * (1 - m.timeLeft / MULTIPLY_TIME + 0.3));
        if (m.timeLeft <= 0) this.endMission(true);
        break;
      }
    }
  }

  // ───────────────────────── wyzwanie: boss ─────────────────────────

  /** Boss pojawia się, gdy gracz jest dość rozwinięty, w losowym miejscu mapy (widocznym na mapach). */
  private updateBoss(dt: number): void {
    // Sługi pokonanego bossa giną razem z nim.
    const dead = this.deadBoss;
    if (dead) {
      this.deadBoss = undefined;
      const minions = this.enemies.filter((e) => e.guardOf === dead);
      for (const e of minions) {
        this.burst(e.x, e.y, e.burstColor, 6);
        e.destroy();
      }
      if (minions.length) {
        const gone = new Set<Enemy>(minions);
        this.enemies = this.enemies.filter((e) => !gone.has(e));
      }
    }
    const b = this.boss;
    if (b) {
      if (!b.active || b.hp <= 0) return;
      // Boss przywołuje sługi, gdy gracz jest w pobliżu.
      this.bossSummon -= dt;
      if (this.bossSummon <= 0 && dist(b, this.player) < 900) {
        this.bossSummon = BOSS.summonEvery;
        const minions = this.enemies.filter((e) => e.guardOf === b).length;
        const kinds: EnemyKind[] = this.isVirus || b.kind === 'vaccine' ? ['antibody', 'leukocyte'] : ['virus', 'germ'];
        for (let i = 0; i < 2 && minions + i < BOSS.maxMinions; i++) this.spawnGuard(kinds[Math.random() < 0.7 ? 0 : 1], b);
        this.ringFx(b.x, b.y, b.burstColor, b.radius * 3);
      }
      return;
    }
    if (this.level < this.bossLevel || this.elapsed < BOSS.minTime || this.elapsed < this.bossRetry) return;
    const p = this.openPoint(this.player, BOSS.minDist, BOSS.maxDist, 110, 20);
    if (!p) {
      this.bossRetry = this.elapsed + 3;
      return;
    }
    this.spawnBoss(this.isVirus ? 'alphaMacrophage' : 'virusKing', p);
  }

  private spawnBoss(kind: EnemyKind, p: Point): void {
    const boss = this.spawnEnemy(kind, p);
    if (kind === 'vaccine') {
      boss.baseTint = 0x7dd3fc; // błękitna biała krwinka
      boss.resetTint();
    }
    this.boss = boss;
    this.bossSummon = 3;
    this.ringFx(p.x, p.y, boss.burstColor, boss.radius * 4);
    const name = boss.def.name;
    this.game.events.emit(GameEvents.MissionStart, `Boss: ${name}`, 'Czerwony znacznik na mapie pokazuje, gdzie czeka. Przygotuj się!');
    audio.sfx('alarm');
  }

  private onBossDefeated(b: Enemy): void {
    this.boss = undefined;
    this.bossLevel = this.level + BOSS.levelStep;
    this.dna += BOSS.dna;
    this.achieve('boss-slayer');
    this.bossLevelAchievements();
    this.deadBoss = b; // sługi znikną w updateBoss (tu trwa filtrowanie listy wrogów)
    for (let i = 0; i < 4; i++) {
      this.time.delayedCall(i * 220, () => this.ringFx(b.x, b.y, i % 2 ? 0xfde68a : b.burstColor, b.radius * (3 + i * 1.5)));
    }
    this.cameras.main.flash(500, 253, 230, 138);
    this.cameras.main.shake(350, 0.01);
    this.missionsDone++;
    this.game.events.emit(GameEvents.MissionEnd, `Boss: ${b.def.name}`, true, `Boss pokonany! Nagroda: doświadczenie i +${BOSS.dna} DNA`, true);
    audio.sfx('success');
  }

  private bossLevelAchievements(): void {
    if (this.mode === 'hard') this.achieve('boss-hard');
  }

  /** Losuje rodzaj misji (inny niż poprzedni) i ją rozpoczyna. */
  private startMission(): void {
    const kinds: MissionType[] = this.isVirus ? ['infect', 'nest', 'outbreak'] : ['defend', 'nest', 'collect'];
    const pool = kinds.filter((k) => k !== this.lastMissionType);
    let type = Phaser.Utils.Array.GetRandom(pool) as MissionType;
    // Wielka misja bakterii: mnożenie się — potrzebuje kogoś z kolonii (nie przyjaciela na czas).
    const motherPick = this.isVirus || this.lastMissionType === 'multiply'
      ? undefined
      : Phaser.Utils.Array.GetRandom(this.allies.filter((a) => a.isAlive && !this.allyExpire.has(a)));
    if (motherPick && Math.random() < 0.3) type = 'multiply';
    const base = { type, count: 0, goal: 0, spawnTimer: 2, fireTimer: 0 };
    let subtitle = '';

    switch (type) {
      case 'defend':
      case 'infect': {
        // Narząd potrzebuje dużej wolnej przestrzeni (komora lub szeroki tunel).
        const p = this.openPoint(this.player, 800, 1250, 110, 40);
        if (!p) return this.retryMissionSoon();
        const hp = type === 'defend' ? 220 : Math.round(260 * (1 + 0.1 * (this.threat - 1)));
        const organ = new Organ(this, p.x, p.y, 48, hp);
        if (type === 'defend') {
          this.mission = { ...base, title: 'Obroń narząd', organ, timeLeft: 35 };
          subtitle = 'Leć za strzałką i obroń go';
          for (let i = 0; i < 4; i++) this.spawnAttacker(organ);
        } else {
          this.mission = { ...base, title: 'Zainfekuj narząd', organ, timeLeft: 45 };
          subtitle = 'Zainfekuj narząd, zanim upłynie czas';
          const leukos = Math.min(5, 1 + Math.floor(this.threat / 2));
          for (let i = 0; i < leukos; i++) this.spawnGuard('leukocyte', organ);
          for (let i = 0; i < 6; i++) this.spawnGuard('antibody', organ);
        }
        break;
      }
      case 'nest': {
        const p = this.openPoint(this.player, 800, 1200, 90, 40);
        if (!p) return this.retryMissionSoon();
        const nest = this.spawnEnemy(this.isVirus ? 'lymphNode' : 'infectionNest', p);
        if (this.isVirus) {
          nest.baseTint = 0x9aa8ff;
          nest.resetTint();
        }
        const title = this.isVirus ? 'Zniszcz węzeł chłonny' : 'Zniszcz ognisko infekcji';
        this.mission = { ...base, title, nest, timeLeft: 50, spawnTimer: 1 };
        subtitle = 'Gniazdo wypuszcza wrogów — zniszcz je na czas';
        for (let i = 0; i < 3; i++) this.spawnGuard(this.isVirus ? 'antibody' : 'virus', nest);
        break;
      }
      case 'collect': {
        const center = this.openPoint(this.player, 650, 950, 60, 40);
        if (!center) return this.retryMissionSoon();
        const items: Nutrient[] = [];
        for (let i = 0; i < 8; i++) {
          const q = this.openPoint(center, 0, 420, 16, 12);
          if (!q) continue;
          const it = new Nutrient(this, q.x, q.y, 10, 0xfde047).setDepth(2.5);
          this.tweens.add({ targets: it, scale: it.scale * 1.35, duration: 500, yoyo: true, repeat: -1 });
          items.push(it);
        }
        if (items.length < 4) {
          for (const it of items) it.destroy();
          return this.retryMissionSoon();
        }
        this.mission = { ...base, title: 'Zbierz rzadkie składniki', items, goal: items.length, timeLeft: 40 };
        subtitle = `Złote cząstki — zbierz wszystkie (${items.length}) na czas`;
        break;
      }
      case 'outbreak':
        this.mission = { ...base, title: 'Wywołaj epidemię', goal: 10, timeLeft: 45 };
        subtitle = 'Zaraź 10 komórek w 45 sekund';
        break;
      case 'multiply': {
        // Jedna z kolonii staje się silniejszą „matką”: sama płynie za graczem, ale nie słucha rozkazów.
        const mother = motherPick!;
        mother.setRadius(this.species.allyRadius * 1.6);
        mother.maxHp = this.stats.allyMaxHp * 4;
        mother.hp = mother.maxHp;
        mother.damageMul = 2.5;
        mother.setTint(0x6ee7b7);
        this.ringFx(mother.x, mother.y, 0x6ee7b7, mother.radius * 4);
        this.mission = { ...base, title: 'Mnożenie się', mother, timeLeft: MULTIPLY_TIME, spawnTimer: 3 };
        subtitle = 'Matka z kolonii się dzieli — osłaniaj ją, aż skończy';
        break;
      }
    }
    this.lastMissionType = type;
    this.game.events.emit(GameEvents.MissionStart, this.mission!.title, subtitle);
    audio.sfx('alarm');
  }

  private retryMissionSoon(): void {
    this.nextMissionAt = this.elapsed + 2;
  }

  private spawnAttacker(organ: Organ): void {
    const p = this.openPoint(organ, 380, 520, 25);
    if (!p) return;
    const kind: EnemyKind = Math.random() < Math.min(0.4, 0.08 * this.threat) ? 'germ' : 'virus';
    this.spawnEnemy(kind, p).missionTarget = organ;
  }

  private spawnGuard(kind: EnemyKind, around: Cell): void {
    const p = this.openPoint(around, around.radius + 60, around.radius + 160, 30) ?? { x: around.x, y: around.y };
    this.spawnEnemy(kind, p).guardOf = around;
  }

  private endMission(success: boolean): void {
    const m = this.mission!;
    this.mission = undefined;
    this.nextMissionAt = this.elapsed + MISSION_COOLDOWN;

    // Uczestnicy misji (napastnicy, strażnicy) znikają po jej zakończeniu — zostaje tylko gracz i kolonia.
    const participants = this.enemies.filter(
      (e) =>
        (m.organ && e.missionTarget === m.organ) ||
        (e.guardOf && (e.guardOf === m.organ || e.guardOf === m.nest || e.guardOf === m.mother)),
    );
    if (participants.length) {
      for (const e of participants) {
        this.burst(e.x, e.y, e.burstColor, 6);
        e.destroy();
      }
      const gone = new Set<Enemy>(participants);
      this.enemies = this.enemies.filter((e) => !gone.has(e));
    }

    let detail = '';
    if (success) {
      this.missionsDone++;
      this.achieve('defender');
      if (this.missionsDone >= 3) this.achieve('hero');
      if (this.missionsDone >= 5) this.achieve('missions5');
      this.dna += DNA.perMission;
      this.gainXp(Math.round(PROGRESSION.missionXpBase + PROGRESSION.missionXpPerThreat * this.threat));
      detail = `Nagroda: doświadczenie i +${DNA.perMission} DNA`;
      switch (m.type) {
        case 'defend': {
          const o = m.organ!;
          this.biomass += PROGRESSION.missionBiomass;
          this.player.hp = Math.min(this.stats.maxHp, this.player.hp + this.stats.maxHp * PROGRESSION.missionHeal);
          this.burst(o.x, o.y, COLORS.burstOrgan, 16);
          detail += ', biomasa i leczenie';
          break;
        }
        case 'infect': {
          const o = m.organ!;
          o.setTint(COLORS.infectedOrgan);
          this.burst(o.x, o.y, COLORS.burstCopy, 24);
          this.releaseCopies(o.x, o.y, 5);
          // Zainfekowany narząd mocno przybliża podbój tego miejsca w organizmie.
          this.addConquest(biomeAt(o.x, o.y).name, 3);
          detail += ' i nowe kopie';
          break;
        }
        case 'nest':
          this.dna += 1;
          this.achieve('nest-buster');
          detail = `Gniazdo zniszczone! Nagroda: doświadczenie i +${DNA.perMission + 1} DNA`;
          if (this.isVirus) {
            // Wirus po pokonaniu węzła chłonnego zaraża okolicę: kopie i duży postęp podboju.
            const nx = m.nest?.x ?? this.player.x;
            const ny = m.nest?.y ?? this.player.y;
            this.burst(nx, ny, COLORS.burstCopy, 24);
            this.releaseCopies(nx, ny, 5);
            this.addConquest(biomeAt(nx, ny).name, 3);
            detail += ', zarażenie okolicy i nowe kopie';
          }
          break;
        case 'collect':
          this.biomass += 25;
          this.player.hp = Math.min(this.stats.maxHp, this.player.hp + this.stats.maxHp * 0.2);
          detail += ', biomasa i leczenie';
          break;
        case 'outbreak':
          this.releaseCopies(this.player.x, this.player.y, 3);
          detail += ' i nowe kopie';
          break;
        case 'multiply': {
          this.achieve('mother');
          const mo = m.mother!;
          this.dna += 1;
          this.burst(mo.x, mo.y, COLORS.burstAlly, 24);
          this.ringFx(mo.x, mo.y, 0x6ee7b7, mo.radius * 5);
          this.releaseCopies(mo.x, mo.y, 5);
          detail = `Matka się podzieliła! Nagroda: doświadczenie, +${DNA.perMission + 1} DNA i nowa kolonia`;
          break;
        }
      }
    } else {
      switch (m.type) {
        case 'defend': {
          const o = m.organ!;
          o.destroyOrgan();
          this.burst(o.x, o.y, COLORS.burstOrgan, 24);
          this.cameras.main.shake(250, 0.008);
          detail = 'Narząd został zniszczony';
          break;
        }
        case 'infect':
          detail = 'Narząd się obronił';
          break;
        case 'nest':
          if (m.nest?.active) {
            this.burst(m.nest.x, m.nest.y, m.nest.burstColor, 10);
            m.nest.destroy();
            this.enemies = this.enemies.filter((e) => e !== m.nest);
          }
          detail = 'Gniazdo przetrwało i się wycofało';
          break;
        case 'collect':
          detail = 'Nie zdążyłeś zebrać wszystkiego';
          break;
        case 'outbreak':
          detail = 'Epidemia wygasła';
          break;
        case 'multiply':
          detail = 'Matka zginęła, zanim się podzieliła';
          break;
      }
    }
    // Matka wraca do zwykłej kolonii (zostaje trochę silniejsza po sukcesie).
    const mother = m.mother;
    if (mother?.active) {
      mother.clearTint();
      mother.resetTint();
      if (!success) mother.damageMul = 1;
    }
    // Sprzątanie: niezebrane składniki znikają, narząd zanika po chwili.
    for (const it of m.items ?? []) it.destroy();
    const o = m.organ;
    if (o) this.tweens.add({ targets: o, alpha: 0, delay: 2500, duration: 2000, onComplete: () => o.destroy() });

    const big = m.type === 'multiply';
    if (big && success && m.mother?.active) {
      // Widoczne świętowanie: kilka rozchodzących się pierścieni, błysk kamery i napis nad matką.
      const mo = m.mother;
      for (let i = 0; i < 4; i++) {
        this.time.delayedCall(i * 220, () => this.ringFx(mo.x, mo.y, i % 2 ? 0xfde68a : 0x6ee7b7, mo.radius * (5 + i * 2)));
      }
      this.cameras.main.flash(500, 110, 231, 183);
      this.floatText(mo.x, mo.y - mo.radius - 10, '+5 kopii!', '#6ee7b7');
    }
    this.game.events.emit(GameEvents.MissionEnd, m.title, success, detail, big);
    audio.sfx(success ? 'success' : 'fail');
  }

  // ───────────────────────── podbój organizmu (wirus) ─────────────────────────

  /** Dodaje postęp podboju narządu; po osiągnięciu progu narząd jest podbity. */
  private addConquest(name: string, amount: number): void {
    if (!this.isVirus || this.over || this.conquered.has(name) || !this.organNames.includes(name)) return;
    const v = (this.conquest.get(name) ?? 0) + amount;
    this.conquest.set(name, v);
    if (v < CONQUEST_PER_ORGAN) return;
    this.conquered.add(name);
    const total = this.organNames.length;
    this.game.events.emit(GameEvents.Conquest, name, this.conquered.size, total);
    audio.sfx('success');
    this.gainXp(10);
    if (this.conquered.size >= total) this.victory();
  }

  /** Wygrana wirusa: cały organizm podbity. */
  private victory(): void {
    this.over = true;
    this.achieve('conqueror');
    audio.sfx('levelup');
    audio.setTheme('menu');
    audio.setIntensity(0);
    this.flagella.clear();
    this.bars.clear();
    const summary: GameSummary = {
      species: this.species.id,
      time: this.elapsed,
      level: this.level,
      kills: this.kills,
      missions: this.missionsDone,
    };
    this.game.events.emit(GameEvents.Victory, summary);
  }

  // ───────────────────────── przyjazne postacie (rzadkie) ─────────────────────────

  private updateFriends(dt: number): void {
    // Sojusznicy na czas odchodzą po upływie czasu.
    for (const [a, until] of this.allyExpire) {
      if (a.active && this.elapsed < until) continue;
      this.allyExpire.delete(a);
      if (a.active) {
        this.burst(a.x, a.y, 0xfde68a, 12);
        a.destroy();
        this.allies = this.allies.filter((x) => x !== a);
        this.game.events.emit(GameEvents.Toast, 'Przyjazny sojusznik odpłynął');
      }
    }

    const f = this.friend;
    if (!f) {
      this.friendTimer -= dt;
      if (this.friendTimer <= 0) {
        this.friendTimer = Phaser.Math.FloatBetween(90, 140);
        this.spawnFriend();
      }
      return;
    }
    f.age += dt;
    const c = f.cell;
    // Spokojne błąkanie się.
    f.wander += Phaser.Math.FloatBetween(-0.8, 0.8) * dt;
    this.steerMove(c, c.x + Math.cos(f.wander) * 100, c.y + Math.sin(f.wander) * 100, 45, dt, 0);
    if (this.species.rod) c.faceMovement(dt, 4);
    else c.rotation += dt;
    c.setPulse(1 + Math.sin(this.elapsed * 3) * 0.05);
    f.label.setPosition(c.x, c.y - c.radius * 1.6 - 14);

    const d = dist(c, this.player);
    if (d < c.radius + this.player.radius + 25) {
      this.recruitFriend();
    } else if (f.age > 75 || d > DESPAWN_RADIUS) {
      this.burst(c.x, c.y, 0xfde68a, 8);
      c.destroy();
      f.label.destroy();
      this.friend = undefined;
    }
  }

  private spawnFriend(): void {
    const p = this.openPoint(this.player, 550, 850, 30, 20);
    if (!p) return;
    const virus = this.isVirus;
    const c = virus
      ? new Cell(this, p.x, p.y, 12, TEX.playerVirus, TEX_RADIUS.virus, 1)
      : new Cell(this, p.x, p.y, 14, TEX.probiotic, TEX_RADIUS.rod, 1);
    if (virus) {
      c.baseTint = 0xf9a8d4;
      c.resetTint();
    }
    c.setDepth(4.2);
    const name = virus ? 'Wirus satelitarny' : 'Pałeczka kwasu mlekowego';
    const label = this.add
      .text(p.x, p.y, `★ ${name} (przyjazna)`, { fontFamily: 'system-ui, sans-serif', fontSize: '12px', color: '#fde68a', stroke: '#1c0a10', strokeThickness: 3 })
      .setOrigin(0.5)
      .setDepth(10);
    this.friend = { cell: c, label, age: 0, wander: Math.random() * TAU };
    this.game.events.emit(GameEvents.Friend, `★ W pobliżu jest przyjazna postać: ${name}! (żółta gwiazdka na minimapie)`);
    audio.sfx('swell');
  }

  /** Spotkanie przyjaznej postaci: leczenie, DNA i silny sojusznik na 60 s. */
  private recruitFriend(): void {
    const f = this.friend!;
    this.friend = undefined;
    const c = f.cell;
    f.label.destroy();
    this.player.hp = Math.min(this.stats.maxHp, this.player.hp + this.stats.maxHp * 0.25);
    this.dna += 1;
    const sp = this.species;
    const a = new Cell(this, c.x, c.y, sp.allyRadius * 1.5, c.texture.key, sp.texRadius, this.stats.allyMaxHp * 3).setDepth(4);
    a.baseTint = c.baseTint;
    a.resetTint();
    a.damageMul = 2.5;
    c.destroy();
    this.allies.push(a);
    this.allyExpire.set(a, this.elapsed + 60);
    this.burst(a.x, a.y, 0xfde68a, 20);
    this.achieve('friendship');
    audio.sfx('levelup');
    this.game.events.emit(GameEvents.Friend, '★ Przyjaciel dołączył na 60 s! Leczenie i +1 DNA');
  }

  // ───────────────────────── rozwój ─────────────────────────

  private gainXp(amount: number): void {
    this.xp += amount;
    while (this.xp >= this.xpToNext) {
      this.xp -= this.xpToNext;
      this.level++;
      this.ringFx(this.player.x, this.player.y, 0xfde68a, this.player.radius * 5);
      audio.sfx('levelup');
      if (this.level >= 5) this.achieve('level5');
      if (this.level >= 20) this.achieve('level20');
      if (this.level >= 10) this.achieve('level10');
      this.pendingLevelUps++;
      if (this.level % DNA.everyLevels === 0) {
        this.dna += 1;
        this.game.events.emit(GameEvents.Toast, '+1 DNA — V: zbuduj komórkę');
      }
      this.updatePlayerRadius();
      this.recomputeStats();
      for (const a of this.allies) this.ringFx(a.x, a.y, 0xfde68a, a.radius * 3);
    }
  }

  private updatePlayerRadius(): void {
    const sp = this.species;
    const size = sp.rod ? body.size : 1;
    this.player.setRadius(Math.min(sp.baseRadius + (this.level - 1) * sp.growthPerLevel, sp.maxRadius) * size);
  }

  /** Stosuje budowę ciała (rozmiar, kształt, czułki) — wołane przy starcie i po zmianie w edytorze. */
  applyBodyDesign(): void {
    if (this.species.rod) {
      const st = bodyStretch();
      this.player.setStretch(st.x, st.y);
    }
    this.updatePlayerRadius();
    this.recomputeStats();
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
    this.glow.setVisible(false);
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

  // ───────────────────────── efekty wizualne ─────────────────────────

  /** Rozchodzący się pierścień (awans, ważne zdarzenia). */
  private ringFx(x: number, y: number, color: number, radius: number): void {
    const ring = this.add.circle(x, y, radius, 0x000000, 0).setStrokeStyle(4, color, 0.9).setDepth(6).setScale(0.15);
    this.tweens.add({ targets: ring, scale: 1, alpha: 0, duration: 650, ease: 'Cubic.easeOut', onComplete: () => ring.destroy() });
  }

  /** Unoszący się napis (np. liczba obrażeń). */
  private floatText(x: number, y: number, text: string, color: string): void {
    const t = this.add
      .text(x + Phaser.Math.Between(-6, 6), y, text, { fontFamily: 'system-ui, sans-serif', fontSize: '14px', fontStyle: 'bold', color, stroke: '#1c0a10', strokeThickness: 3 })
      .setOrigin(0.5)
      .setDepth(11);
    this.tweens.add({ targets: t, y: y - 34, alpha: 0, duration: 700, ease: 'Cubic.easeOut', onComplete: () => t.destroy() });
  }

  /** Poświata pod graczem — łatwiej go dostrzec w tłumie. */
  private updateGlow(): void {
    const p = this.player;
    this.glow
      .setPosition(p.x, p.y)
      .setScale((p.radius / 5) * (1 + Math.sin(this.elapsed * 3) * 0.08))
      .setAlpha(0.22 + 0.06 * Math.sin(this.elapsed * 3));
  }

  private nearestPoint<T extends Point>(list: T[], from: Point): T | undefined {
    let best: T | undefined;
    let bestD = Infinity;
    for (const p of list) {
      const d = dist(p, from);
      if (d < bestD) {
        bestD = d;
        best = p;
      }
    }
    return best;
  }

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
