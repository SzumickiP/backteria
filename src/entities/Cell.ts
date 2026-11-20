import Phaser from 'phaser';

type BlockedFn = (x: number, y: number, r: number) => boolean;

/** Próby ruchu przy przeszkodzie: wprost, potem ślizg pod coraz większym kątem. */
const SLIDE_ANGLES = [0.6, -0.6, 1.2, -1.2];

/**
 * Wspólna baza dla wszystkich „żywych” komórek: gracza, kolonii, narządów, wrogów i ofiar.
 * Logicznie to koło o promieniu `radius` (kolizje), graficznie — tekstura skalowana do tego promienia.
 */
export class Cell extends Phaser.GameObjects.Image {
  /** Test kolizji ze ścianami — ustawiany przez GameScene (null = brak ścian). */
  static blocked: BlockedFn | null = null;

  hp: number;
  maxHp: number;
  /** stałe zabarwienie (np. po ewolucji) — przywracane po błysku obrażeń */
  baseTint?: number;
  /** mnożnik otrzymywanych obrażeń (np. woskowy pancerz prątka = 0.5) */
  armorMul = 1;
  /** mnożnik zadawanych obrażeń (np. przyjazny sojusznik jest silniejszy od zwykłej kolonii) */
  damageMul = 1;
  /** prędkość z poprzedniej klatki (px/s) — do zachowań stadnych */
  vx = 0;
  vy = 0;
  /** czujniki ścian: korekta kąta ruchu i czas do ponownego sprawdzenia (rozłożone losowo między komórki) */
  avoidOffset = 0;
  avoidTimer = Math.random() * 0.12;
  /** jak długo komórka czeka w pierścieniu wokół celu (otaczanie) */
  surroundTime = 0;
  /** czy widzi swój cel (bez ściany po drodze) i kiedy sprawdzić to ponownie (czas gry) */
  seesTarget = true;
  losCheckAt = 0;
  private _radius: number;
  private pulse = 1;
  private readonly texRadius: number;
  private lastX: number;
  private lastY: number;

  /**
   * @param texRadius promień logiczny, dla którego narysowano teksturę (px tekstury)
   */
  constructor(scene: Phaser.Scene, x: number, y: number, radius: number, texture: string, texRadius: number, maxHp: number) {
    super(scene, x, y, texture);
    this.texRadius = texRadius;
    this._radius = radius;
    this.maxHp = maxHp;
    this.hp = maxHp;
    this.lastX = x;
    this.lastY = y;
    this.applyScale();
    scene.add.existing(this);
  }

  get radius(): number {
    return this._radius;
  }

  get isAlive(): boolean {
    return this.hp > 0;
  }

  setRadius(r: number): this {
    this._radius = r;
    this.applyScale();
    return this;
  }

  /** Zadaje obrażenia z uwzględnieniem pancerza. */
  hurt(amount: number): void {
    this.hp -= amount * this.armorMul;
  }

  /** Przywraca stałe zabarwienie (albo jego brak). */
  resetTint(): this {
    if (this.baseTint === undefined) this.clearTint();
    else this.setTint(this.baseTint);
    return this;
  }

  /** Delikatne „oddychanie” komórki (mnożnik skali). */
  setPulse(p: number): this {
    this.pulse = p;
    this.applyScale();
    return this;
  }

  /**
   * Przesuwa komórkę z uwzględnieniem ścian: gdy droga jest zablokowana, próbuje ślizgać się wzdłuż ściany.
   * @returns czy udało się wykonać jakikolwiek ruch
   */
  tryMove(dx: number, dy: number): boolean {
    const blocked = Cell.blocked;
    const r = this._radius * 0.85;
    // Brak ścian albo komórka już w ścianie (np. urosła) — ruch swobodny, żeby mogła się wydostać.
    if (!blocked || blocked(this.x, this.y, r)) {
      this.x += dx;
      this.y += dy;
      return true;
    }
    if (!blocked(this.x + dx, this.y + dy, r)) {
      this.x += dx;
      this.y += dy;
      return true;
    }
    const len = Math.hypot(dx, dy);
    if (len < 1e-6) return false;
    const base = Math.atan2(dy, dx);
    for (const off of SLIDE_ANGLES) {
      const step = len * Math.cos(off);
      const nx = this.x + Math.cos(base + off) * step;
      const ny = this.y + Math.sin(base + off) * step;
      if (!blocked(nx, ny, r)) {
        this.x = nx;
        this.y = ny;
        return true;
      }
    }
    return false;
  }

  /** Przesuwa komórkę w stronę punktu, zatrzymując się `stopAt` px przed nim. */
  moveToward(tx: number, ty: number, speed: number, dt: number, stopAt = 0): boolean {
    const dx = tx - this.x;
    const dy = ty - this.y;
    const dist = Math.hypot(dx, dy);
    if (dist <= stopAt || dist < 0.5) return true;
    const step = Math.min(dist - stopAt, speed * dt);
    return this.tryMove((dx / dist) * step, (dy / dist) * step);
  }

  /** Obraca komórkę (pałeczkę) płynnie w kierunku, w którym się przesunęła od ostatniej klatki. */
  faceMovement(dt: number, turnRate = 7): void {
    const dx = this.x - this.lastX;
    const dy = this.y - this.lastY;
    this.lastX = this.x;
    this.lastY = this.y;
    if (dx * dx + dy * dy < 0.01) return;
    this.rotation = Phaser.Math.Angle.RotateTo(this.rotation, Math.atan2(dy, dx), turnRate * dt);
  }

  private applyScale(): void {
    this.setScale((this._radius / this.texRadius) * this.pulse);
  }
}
