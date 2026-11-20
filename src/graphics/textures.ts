import Phaser from 'phaser';
import { CHUNK } from '../config';

/**
 * Proceduralne tekstury rysowane na canvasie przy starcie gry.
 * Nie potrzebują żadnych plików graficznych (brak problemów z licencjami).
 */

type Ctx = CanvasRenderingContext2D;
type Rng = Phaser.Math.RandomDataGenerator;

export const TEX = {
  tissue: 'tissue',
  player: 'player',
  ally: 'ally',
  germ: 'germ',
  prey: 'prey',
  probiotic: 'probiotic',
  virus: 'virus',
  playerVirus: 'player-virus',
  leukocyte: 'leukocyte',
  macrophage: 'macrophage',
  antibody: 'antibody',
  coccus: 'coccus',
  bacillus: 'bacillus',
  spore: 'spore',
  toxigen: 'toxigen',
  mycobacterium: 'mycobacterium',
  spirochete: 'spirochete',
  organ: 'organ',
  rbc: 'rbc',
  protein: 'protein',
  blob: 'blob',
  dot: 'dot',
} as const;

/** Promień logiczny (px tekstury), dla którego narysowano teksturę — służy do skalowania. */
export const TEX_RADIUS = {
  rod: 40, virus: 40, organ: 96, rbc: 34, blob: 8, leukocyte: 48, antibody: 20, protein: 10,
  coccus: 20, spore: 12, spirochete: 40,
} as const;

const TAU = Math.PI * 2;

export function createTextures(scene: Phaser.Scene): void {
  make(scene, TEX.tissue, CHUNK.texW, CHUNK.texH, drawTissue);
  make(scene, TEX.player, 140, 92, (c, w, h) =>
    drawRod(c, w, h, { light: '#c8f7e1', mid: '#4fd1a1', dark: '#1d7558', membrane: '#0d5a41', granule: '#0a3a2a', pili: false, seed: 'player' }),
  );
  make(scene, TEX.ally, 140, 92, (c, w, h) =>
    drawRod(c, w, h, { light: '#e6fdee', mid: '#8ee8b0', dark: '#3a9a62', membrane: '#1f6b40', granule: '#14482b', pili: false, seed: 'ally' }),
  );
  make(scene, TEX.germ, 140, 92, (c, w, h) =>
    drawRod(c, w, h, { light: '#fcc98a', mid: '#d97a2b', dark: '#8a3b0f', membrane: '#5c2408', granule: '#3b1505', pili: true, seed: 'germ' }),
  );
  make(scene, TEX.prey, 140, 92, (c, w, h) =>
    drawRod(c, w, h, { light: '#d6e6ff', mid: '#6f9be0', dark: '#30579a', membrane: '#1e3a6e', granule: '#14284d', pili: false, seed: 'prey' }),
  );
  make(scene, TEX.probiotic, 140, 92, (c, w, h) =>
    drawRod(c, w, h, { light: '#fffbe6', mid: '#f5d76e', dark: '#b8901f', membrane: '#7a5c0a', granule: '#5c4306', pili: false, seed: 'probiotic' }),
  );
  make(scene, TEX.virus, 100, 100, (c, w, h) =>
    drawVirus(c, w, h, {
      stem: '#92400e', knob: ['#fef3c7', '#f59e0b', '#b45309'], capsid: ['#fff7cc', '#facc15', '#ca8a04', '#713f12'],
      dots: 'rgba(113,63,18,0.35)', rim: '#78350f', seed: 'virus',
    }),
  );
  make(scene, TEX.playerVirus, 100, 100, (c, w, h) =>
    drawVirus(c, w, h, {
      stem: '#0f766e', knob: ['#ccfbf1', '#2dd4bf', '#0f766e'], capsid: ['#e6fffa', '#5eead4', '#14b8a6', '#134e4a'],
      dots: 'rgba(19,78,74,0.35)', rim: '#115e59', seed: 'player-virus',
    }),
  );
  make(scene, TEX.leukocyte, 136, 136, (c, w, h) => drawLeukocyte(c, w, h, LEUKOCYTE));
  make(scene, TEX.macrophage, 136, 136, (c, w, h) => drawLeukocyte(c, w, h, MACROPHAGE));
  make(scene, TEX.bacillus, 140, 92, (c, w, h) =>
    drawRod(c, w, h, {
      light: '#fef3c7', mid: '#d6a85a', dark: '#7c5a22', membrane: '#5b3f12', granule: '#3d2a0b', pili: false, seed: 'bacillus',
      extra: (ctx) => {
        // Przetrwalnik (endospora) w środku komórki.
        const g = ctx.createRadialGradient(10, -3, 1, 12, 0, 13);
        g.addColorStop(0, '#fffbeb');
        g.addColorStop(0.6, '#fcd34d');
        g.addColorStop(1, '#a16207');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.ellipse(12, 0, 15, 10, 0, 0, TAU);
        ctx.fill();
        ctx.strokeStyle = '#fef9c3';
        ctx.lineWidth = 2;
        ctx.stroke();
      },
    }),
  );
  make(scene, TEX.toxigen, 140, 92, (c, w, h) =>
    drawRod(c, w, h, {
      light: '#ecfccb', mid: '#84cc16', dark: '#3f6212', membrane: '#365314', granule: '#1a2e05', pili: false, seed: 'toxigen',
      extra: (ctx, hl) => {
        // Krople toksyn na biegunach.
        for (const [x, y, r] of [[hl - 10, -8, 4], [hl - 6, 6, 3], [-hl + 9, 4, 3.5]]) {
          ctx.fillStyle = 'rgba(217,249,157,0.9)';
          ctx.beginPath();
          ctx.arc(x, y, r, 0, TAU);
          ctx.fill();
        }
      },
    }),
  );
  make(scene, TEX.mycobacterium, 140, 92, (c, w, h) =>
    drawRod(c, w, h, {
      light: '#f5f5f4', mid: '#a8a29e', dark: '#57534e', membrane: '#44403c', granule: '#292524', pili: false, seed: 'myco',
      extra: (ctx, hl, hw) => {
        // Woskowa, prążkowana ściana komórkowa.
        ctx.strokeStyle = 'rgba(68,64,60,0.55)';
        ctx.lineWidth = 2;
        for (let x = -hl + 14; x < hl - 10; x += 9) {
          ctx.beginPath();
          ctx.ellipse(x, 0, 3, hw - 2, 0, 0, TAU);
          ctx.stroke();
        }
      },
    }),
  );
  make(scene, TEX.coccus, 52, 52, drawCoccus);
  make(scene, TEX.spore, 32, 32, drawSpore);
  make(scene, TEX.spirochete, 140, 44, drawSpirochete);
  make(scene, TEX.antibody, 60, 60, drawAntibody);
  make(scene, TEX.organ, 260, 260, drawOrgan);
  make(scene, TEX.rbc, 84, 84, drawRbc);
  make(scene, TEX.protein, 36, 36, drawProtein);
  make(scene, TEX.blob, 32, 32, (c) => softCircle(c, 16, [[0, 1], [0.3, 0.95], [0.55, 0.35], [1, 0]]));
  make(scene, TEX.dot, 16, 16, (c) => softCircle(c, 8, [[0, 1], [0.4, 0.6], [1, 0]]));
}

function make(scene: Phaser.Scene, key: string, w: number, h: number, draw: (ctx: Ctx, w: number, h: number) => void): void {
  if (scene.textures.exists(key)) return;
  const tex = scene.textures.createCanvas(key, w, h);
  if (!tex) return;
  draw(tex.getContext(), w, h);
  tex.refresh();
}

const smooth = (a: number, b: number, x: number): number => {
  const t = Phaser.Math.Clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

// ───────────────────────── tło: tkanka (diagram Woronoja, bezszwowy kafel) ─────────────────────────

/** Rysuje coś 9 razy z przesunięciem o wymiary kafla — żeby elementy przechodziły przez krawędzie bez szwu. */
function wrapped(W: number, H: number, draw: (ox: number, oy: number) => void): void {
  for (const ox of [-W, 0, W]) for (const oy of [-H, 0, H]) draw(ox, oy);
}

function drawTissue(ctx: Ctx, W: number, H: number): void {
  const rng = new Phaser.Math.RandomDataGenerator(['tissue']);
  const cs = 40; // rozmiar komórki tkanki w px tekstury; W i H muszą być jego wielokrotnością
  const gw = W / cs;
  const gh = H / cs;
  const n = gw * gh;
  const sx = new Float32Array(n);
  const sy = new Float32Array(n);
  const shade = new Float32Array(n);
  const nx = new Float32Array(n);
  const ny = new Float32Array(n);
  const nr = new Float32Array(n);

  for (let gy = 0; gy < gh; gy++) {
    for (let gx = 0; gx < gw; gx++) {
      const i = gy * gw + gx;
      sx[i] = (gx + 0.15 + rng.frac() * 0.7) * cs;
      sy[i] = (gy + 0.15 + rng.frac() * 0.7) * cs;
      shade[i] = 0.82 + rng.frac() * 0.36;
      const a = rng.frac() * TAU;
      const off = rng.frac() * cs * 0.15;
      nx[i] = sx[i] + Math.cos(a) * off;
      ny[i] = sy[i] + Math.sin(a) * off;
      nr[i] = cs * (0.15 + rng.frac() * 0.08);
    }
  }

  const img = ctx.createImageData(W, H);
  const d = img.data;
  for (let y = 0; y < H; y++) {
    const cy = Math.floor(y / cs);
    for (let x = 0; x < W; x++) {
      const cx = Math.floor(x / cs);
      let f1 = Infinity;
      let f2 = Infinity;
      let i1 = 0;
      let o1x = 0;
      let o1y = 0;
      // Sąsiednie komórki siatki z zawijaniem (kafel bez szwów).
      for (let j = cy - 1; j <= cy + 1; j++) {
        const jj = (j + gh) % gh;
        const oy = j < 0 ? -H : j >= gh ? H : 0;
        for (let k = cx - 1; k <= cx + 1; k++) {
          const kk = (k + gw) % gw;
          const ox = k < 0 ? -W : k >= gw ? W : 0;
          const i = jj * gw + kk;
          const dx = sx[i] + ox - x;
          const dy = sy[i] + oy - y;
          const dd = dx * dx + dy * dy;
          if (dd < f1) {
            f2 = f1;
            f1 = dd;
            i1 = i;
            o1x = ox;
            o1y = oy;
          } else if (dd < f2) f2 = dd;
        }
      }
      const d1 = Math.sqrt(f1);
      const d2 = Math.sqrt(f2);

      // Cytoplazma: jaśniejsza w środku komórki.
      const s = shade[i1] * (1.12 - 0.3 * Math.min(1, d1 / cs));
      let r = 64 * s;
      let g = 24 * s;
      let b = 40 * s;

      // Jądro komórki z ciemniejszym brzegiem.
      const dn = Math.hypot(nx[i1] + o1x - x, ny[i1] + o1y - y);
      const nuc = 1 - smooth(nr[i1] - 1.5, nr[i1] + 0.8, dn);
      if (nuc > 0) {
        const rim = 1 - 0.35 * smooth(nr[i1] - 3, nr[i1], dn);
        const m = nuc * 0.85;
        r += (76 * rim - r) * m;
        g += (32 * rim - g) * m;
        b += (80 * rim - b) * m;
      }

      // Błona między komórkami (stonowana, żeby nie konkurowała z rozgrywką).
      const mem = (1 - smooth(0, 3, d2 - d1)) * 0.75;
      r += (112 - r) * mem;
      g += (42 - g) * mem;
      b += (64 - b) * mem;

      const noise = (rng.frac() - 0.5) * 8;
      const p = (y * W + x) * 4;
      d[p] = r + noise;
      d[p + 1] = g + noise;
      d[p + 2] = b + noise;
      d[p + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);

  // Plamy cienia / prześwitów — tkanka nie jest jednolita.
  for (let i = 0; i < 40; i++) {
    const x = rng.frac() * W;
    const y = rng.frac() * H;
    const rad = 50 + rng.frac() * 130;
    const dark = rng.frac() < 0.6;
    wrapped(W, H, (ox, oy) => {
      const gr = ctx.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, rad);
      gr.addColorStop(0, dark ? 'rgba(10,0,5,0.22)' : 'rgba(255,140,170,0.06)');
      gr.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = gr;
      ctx.fillRect(x + ox - rad, y + oy - rad, rad * 2, rad * 2);
    });
  }

  // Włókna kolagenowe.
  ctx.lineCap = 'round';
  for (let i = 0; i < 45; i++) {
    const style = `rgba(255,190,205,${0.03 + rng.frac() * 0.05})`;
    const width = 0.8 + rng.frac() * 2;
    const x0 = rng.frac() * W;
    const y0 = rng.frac() * H;
    const len = 80 + rng.frac() * 220;
    const a = rng.frac() * TAU;
    const pts = [
      x0 + Math.cos(a) * len * 0.33 + (rng.frac() - 0.5) * 60,
      y0 + Math.sin(a) * len * 0.33 + (rng.frac() - 0.5) * 60,
      x0 + Math.cos(a) * len * 0.66 + (rng.frac() - 0.5) * 60,
      y0 + Math.sin(a) * len * 0.66 + (rng.frac() - 0.5) * 60,
      x0 + Math.cos(a) * len,
      y0 + Math.sin(a) * len,
    ];
    ctx.strokeStyle = style;
    ctx.lineWidth = width;
    wrapped(W, H, (ox, oy) => {
      ctx.beginPath();
      ctx.moveTo(x0 + ox, y0 + oy);
      ctx.bezierCurveTo(pts[0] + ox, pts[1] + oy, pts[2] + ox, pts[3] + oy, pts[4] + ox, pts[5] + oy);
      ctx.stroke();
    });
  }
}

// ───────────────────────── bakterie (pałeczki) ─────────────────────────

interface RodPalette {
  light: string;
  mid: string;
  dark: string;
  membrane: string;
  granule: string;
  pili: boolean;
  seed: string;
  /** dodatkowe detale rysowane na wierzchu (układ: środek komórki = 0,0) */
  extra?: (ctx: Ctx, hl: number, hw: number) => void;
}

function capsule(ctx: Ctx, hl: number, hw: number): void {
  ctx.beginPath();
  ctx.roundRect(-hl, -hw, hl * 2, hw * 2, hw);
}

/** Losowy punkt na obwodzie kapsuły wraz z normalną. */
function capsulePoint(rng: Rng, hl: number, hw: number): { x: number; y: number; nx: number; ny: number } {
  const straight = 2 * (hl - hw);
  const cap = Math.PI * hw;
  let u = rng.frac() * (2 * straight + 2 * cap);
  if (u < straight) return { x: -hl + hw + u, y: -hw, nx: 0, ny: -1 };
  u -= straight;
  if (u < straight) return { x: -hl + hw + u, y: hw, nx: 0, ny: 1 };
  u -= straight;
  if (u < cap) {
    const a = -Math.PI / 2 + u / hw;
    return { x: hl - hw + Math.cos(a) * hw, y: Math.sin(a) * hw, nx: Math.cos(a), ny: Math.sin(a) };
  }
  u -= cap;
  const a = Math.PI / 2 + u / hw;
  return { x: -(hl - hw) + Math.cos(a) * hw, y: Math.sin(a) * hw, nx: Math.cos(a), ny: Math.sin(a) };
}

function drawRod(ctx: Ctx, w: number, h: number, p: RodPalette): void {
  const rng = new Phaser.Math.RandomDataGenerator([p.seed]);
  const hl = TEX_RADIUS.rod * 1.35;
  const hw = TEX_RADIUS.rod * 0.75;
  ctx.translate(w / 2, h / 2);

  // Miękki cień / halo.
  ctx.save();
  ctx.filter = 'blur(5px)';
  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  capsule(ctx, hl + 2, hw + 2);
  ctx.fill();
  ctx.restore();

  // Fimbrie (włoski) — tylko u chorobotwórczych.
  if (p.pili) {
    ctx.save();
    ctx.strokeStyle = p.membrane;
    ctx.globalAlpha = 0.8;
    ctx.lineWidth = 1.4;
    ctx.lineCap = 'round';
    for (let i = 0; i < 60; i++) {
      const pt = capsulePoint(rng, hl, hw);
      const len = 6 + rng.frac() * 7;
      const bend = (rng.frac() - 0.5) * 6;
      ctx.beginPath();
      ctx.moveTo(pt.x, pt.y);
      ctx.quadraticCurveTo(
        pt.x + pt.nx * len * 0.5 - pt.ny * bend,
        pt.y + pt.ny * len * 0.5 + pt.nx * bend,
        pt.x + pt.nx * len,
        pt.y + pt.ny * len,
      );
      ctx.stroke();
    }
    ctx.restore();
  }

  // Ciało komórki.
  const gr = ctx.createLinearGradient(0, -hw, 0, hw);
  gr.addColorStop(0, p.light);
  gr.addColorStop(0.45, p.mid);
  gr.addColorStop(1, p.dark);
  ctx.save();
  ctx.globalAlpha = 0.94;
  capsule(ctx, hl, hw);
  ctx.fillStyle = gr;
  ctx.fill();
  ctx.restore();

  // Wnętrze: przyciemnione brzegi, nukleoid, ziarnistości, odblask.
  ctx.save();
  capsule(ctx, hl, hw);
  ctx.clip();

  ctx.filter = 'blur(4px)';
  ctx.lineWidth = 12;
  ctx.strokeStyle = p.dark;
  ctx.globalAlpha = 0.55;
  capsule(ctx, hl, hw);
  ctx.stroke();

  ctx.filter = 'blur(2.5px)';
  ctx.globalAlpha = 0.4;
  ctx.fillStyle = p.granule;
  for (let i = 0; i < 5; i++) {
    ctx.beginPath();
    ctx.ellipse(
      -hl * 0.45 + i * hl * 0.22,
      (rng.frac() - 0.5) * hw * 0.5,
      9 + rng.frac() * 6,
      5 + rng.frac() * 4,
      rng.frac() * Math.PI,
      0,
      TAU,
    );
    ctx.fill();
  }

  ctx.filter = 'none';
  for (let i = 0; i < 22; i++) {
    ctx.globalAlpha = 0.25 + rng.frac() * 0.3;
    ctx.fillStyle = rng.frac() < 0.5 ? p.granule : p.light;
    ctx.beginPath();
    ctx.arc(rng.realInRange(-hl + 8, hl - 8), rng.realInRange(-hw + 6, hw - 6), 1 + rng.frac() * 1.8, 0, TAU);
    ctx.fill();
  }

  // Nukleoid: poskręcana nić DNA w środku komórki.
  ctx.filter = 'none';
  ctx.globalAlpha = 0.5;
  ctx.strokeStyle = p.granule;
  ctx.lineWidth = 1.6;
  ctx.lineCap = 'round';
  for (let k = 0; k < 3; k++) {
    ctx.beginPath();
    for (let x = -hl * 0.5; x <= hl * 0.5; x += 3) {
      const y = Math.sin(x * 0.28 + k * 2.1) * hw * 0.32 + Math.sin(x * 0.11 + k) * hw * 0.16;
      if (x === -hl * 0.5) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }

  // Dolne światło odbite (refleks od podłoża) i ostry odblask na górze.
  ctx.filter = 'blur(3px)';
  ctx.globalAlpha = 0.28;
  ctx.fillStyle = p.light;
  ctx.beginPath();
  ctx.ellipse(hl * 0.1, hw * 0.62, hl * 0.6, hw * 0.16, 0, 0, TAU);
  ctx.fill();
  ctx.globalAlpha = 0.55;
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.ellipse(-hl * 0.1, -hw * 0.5, hl * 0.55, hw * 0.18, 0, 0, TAU);
  ctx.fill();
  ctx.filter = 'none';
  ctx.globalAlpha = 0.9;
  ctx.beginPath();
  ctx.ellipse(-hl * 0.32, -hw * 0.56, hl * 0.14, hw * 0.07, 0, 0, TAU);
  ctx.fill();
  ctx.restore();

  // Błona (podwójna: zewnętrzna ciemna + ściana komórkowa z jasną krawędzią).
  ctx.lineWidth = 3.5;
  ctx.strokeStyle = p.membrane;
  capsule(ctx, hl, hw);
  ctx.stroke();
  ctx.lineWidth = 1.6;
  ctx.strokeStyle = p.light;
  ctx.globalAlpha = 0.5;
  capsule(ctx, hl - 2.5, hw - 2.5);
  ctx.stroke();
  ctx.globalAlpha = 1;
  ctx.lineWidth = 1;
  ctx.strokeStyle = 'rgba(255,255,255,0.3)';
  capsule(ctx, hl - 5, hw - 5);
  ctx.stroke();

  if (p.extra) {
    ctx.save();
    capsule(ctx, hl - 1, hw - 1);
    ctx.clip();
    p.extra(ctx, hl, hw);
    ctx.restore();
  }
}

// ───────────────────────── inne bakterie ─────────────────────────

/** Ziarniak (np. gronkowiec) — kulista bakteria Gram-dodatnia (fioletowa). */
function drawCoccus(ctx: Ctx, w: number, h: number): void {
  const R = TEX_RADIUS.coccus;
  ctx.translate(w / 2, h / 2);
  ctx.save();
  ctx.filter = 'blur(4px)';
  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  ctx.beginPath();
  ctx.arc(0, 0, R + 2, 0, TAU);
  ctx.fill();
  ctx.restore();

  const g = ctx.createRadialGradient(-6, -7, 2, 0, 0, R);
  g.addColorStop(0, '#f5e8ff');
  g.addColorStop(0.45, '#b46cf5');
  g.addColorStop(1, '#5b1a8f');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(0, 0, R, 0, TAU);
  ctx.fill();
  // Przegroda podziałowa.
  ctx.strokeStyle = 'rgba(70,20,110,0.5)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(-R * 0.8, R * 0.25);
  ctx.quadraticCurveTo(0, R * 0.05, R * 0.8, R * 0.3);
  ctx.stroke();
  ctx.strokeStyle = '#4c1d95';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(0, 0, R, 0, TAU);
  ctx.stroke();
  ctx.filter = 'blur(2px)';
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.beginPath();
  ctx.ellipse(-6, -8, 6, 3, -0.5, 0, TAU);
  ctx.fill();
}

/** Przetrwalnik — twarda, lśniąca spora. */
function drawSpore(ctx: Ctx, w: number, h: number): void {
  ctx.translate(w / 2, h / 2);
  ctx.save();
  ctx.filter = 'blur(3px)';
  ctx.fillStyle = 'rgba(253,224,71,0.55)';
  ctx.beginPath();
  ctx.ellipse(0, 0, 13, 9, 0, 0, TAU);
  ctx.fill();
  ctx.restore();
  const g = ctx.createRadialGradient(-3, -2, 1, 0, 0, 11);
  g.addColorStop(0, '#fffbeb');
  g.addColorStop(0.6, '#fcd34d');
  g.addColorStop(1, '#a16207');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(0, 0, 11, 7, 0, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = '#fef9c3';
  ctx.lineWidth = 1.5;
  ctx.stroke();
}

/** Krętek — długa, spiralnie skręcona bakteria (skierowana wzdłuż osi x). */
function drawSpirochete(ctx: Ctx, w: number, h: number): void {
  ctx.translate(w / 2, h / 2);
  const path = () => {
    ctx.beginPath();
    for (let x = -58; x <= 58; x += 2) {
      const y = Math.sin(x * 0.32) * 8 * (1 - Math.abs(x) / 90);
      if (x === -58) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
  };
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.save();
  ctx.filter = 'blur(3px)';
  ctx.strokeStyle = 'rgba(0,0,0,0.5)';
  ctx.lineWidth = 9;
  path();
  ctx.stroke();
  ctx.restore();
  ctx.strokeStyle = '#155e75';
  ctx.lineWidth = 7;
  path();
  ctx.stroke();
  const g = ctx.createLinearGradient(-58, 0, 58, 0);
  g.addColorStop(0, '#a5f3fc');
  g.addColorStop(0.5, '#22d3ee');
  g.addColorStop(1, '#a5f3fc');
  ctx.strokeStyle = g;
  ctx.lineWidth = 4;
  path();
  ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,0.6)';
  ctx.lineWidth = 1.2;
  ctx.translate(0, -1);
  path();
  ctx.stroke();
}

// ───────────────────────── wirus ─────────────────────────

interface VirusPalette {
  stem: string;
  knob: [string, string, string];
  capsid: [string, string, string, string];
  dots: string;
  rim: string;
  seed: string;
}

function drawVirus(ctx: Ctx, w: number, h: number, p: VirusPalette): void {
  const rng = new Phaser.Math.RandomDataGenerator([p.seed]);
  const rc = 27;
  ctx.translate(w / 2, h / 2);

  ctx.save();
  ctx.filter = 'blur(5px)';
  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  ctx.beginPath();
  ctx.arc(0, 0, rc + 5, 0, TAU);
  ctx.fill();
  ctx.restore();

  // Białka wypustkowe.
  const spikes = 18;
  for (let i = 0; i < spikes; i++) {
    const a = (i / spikes) * TAU + (rng.frac() - 0.5) * 0.15;
    const c = Math.cos(a);
    const s = Math.sin(a);
    ctx.strokeStyle = p.stem;
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.moveTo(c * (rc - 2), s * (rc - 2));
    ctx.lineTo(c * 34, s * 34);
    ctx.stroke();
    const kx = c * 35.5;
    const ky = s * 35.5;
    const kg = ctx.createRadialGradient(kx - 1, ky - 1, 0.5, kx, ky, 4.4);
    kg.addColorStop(0, p.knob[0]);
    kg.addColorStop(0.5, p.knob[1]);
    kg.addColorStop(1, p.knob[2]);
    ctx.fillStyle = kg;
    ctx.beginPath();
    ctx.arc(kx, ky, 4.4, 0, TAU);
    ctx.fill();
  }

  // Kapsyd.
  const g = ctx.createRadialGradient(-9, -10, 2, 0, 0, rc);
  g.addColorStop(0, p.capsid[0]);
  g.addColorStop(0.35, p.capsid[1]);
  g.addColorStop(0.75, p.capsid[2]);
  g.addColorStop(1, p.capsid[3]);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(0, 0, rc, 0, TAU);
  ctx.fill();

  ctx.save();
  ctx.beginPath();
  ctx.arc(0, 0, rc, 0, TAU);
  ctx.clip();
  ctx.fillStyle = p.dots;
  for (let i = 0; i < 40; i++) {
    const a = rng.frac() * TAU;
    const r = Math.sqrt(rng.frac()) * rc;
    ctx.beginPath();
    ctx.arc(Math.cos(a) * r, Math.sin(a) * r, 1.6 + rng.frac() * 0.8, 0, TAU);
    ctx.fill();
  }
  // Fasetki kapsydu (ikosaedr): siatka trójkątów na powierzchni.
  ctx.strokeStyle = p.dots;
  ctx.lineWidth = 1;
  ctx.globalAlpha = 0.75;
  const hexR = rc * 0.52;
  for (let k = 0; k < 6; k++) {
    const a1 = (k / 6) * TAU + 0.3;
    const a2 = ((k + 1) / 6) * TAU + 0.3;
    ctx.beginPath();
    ctx.moveTo(Math.cos(a1) * hexR, Math.sin(a1) * hexR);
    ctx.lineTo(Math.cos(a2) * hexR, Math.sin(a2) * hexR);
    ctx.lineTo(Math.cos(a1 + 0.52) * rc * 1.1, Math.sin(a1 + 0.52) * rc * 1.1);
    ctx.closePath();
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  // Cień wewnętrzny przy krawędzi (głębia) i odblask.
  const sh = ctx.createRadialGradient(0, 0, rc * 0.6, 0, 0, rc);
  sh.addColorStop(0, 'rgba(0,0,0,0)');
  sh.addColorStop(1, 'rgba(0,0,0,0.35)');
  ctx.fillStyle = sh;
  ctx.beginPath();
  ctx.arc(0, 0, rc, 0, TAU);
  ctx.fill();
  ctx.filter = 'blur(2px)';
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.beginPath();
  ctx.ellipse(-8, -11, 10, 5, -0.4, 0, TAU);
  ctx.fill();
  ctx.filter = 'none';
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  ctx.beginPath();
  ctx.ellipse(-11, -14, 3.2, 1.6, -0.5, 0, TAU);
  ctx.fill();
  ctx.restore();

  ctx.strokeStyle = p.rim;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(0, 0, rc, 0, TAU);
  ctx.stroke();
}

// ───────────────────────── układ odpornościowy ─────────────────────────

interface ImmuneCellStyle {
  seed: string;
  /** amplituda nibynóżek (nieregularność obrysu) */
  bumpy: number;
  body: [string, string, string];
  edge: string;
  granules: string;
  nucleus: [string, string, string];
  nucleusLine: string;
  /** płaty jądra: [x, y, r] */
  lobes: [number, number, number][];
  membrane: string;
  /** wodniczki (makrofag — strawione resztki) */
  vacuoles: number;
}

const LEUKOCYTE: ImmuneCellStyle = {
  seed: 'leukocyte', bumpy: 1,
  body: ['#fcfbff', '#e4def5', '#bfb3df'], edge: 'rgba(120,100,170,0.35)', granules: 'rgba(160,130,210,0.45)',
  nucleus: ['#c4b5fd', '#7c3aed', '#4c1d95'], nucleusLine: '#6d28d9',
  lobes: [[-16, 4, 12], [0, -8, 13], [16, 5, 11]], membrane: '#8b7fb5', vacuoles: 0,
};

const MACROPHAGE: ImmuneCellStyle = {
  seed: 'macrophage', bumpy: 2.2,
  body: ['#eef2ff', '#c7d2fe', '#8b93d8'], edge: 'rgba(70,80,160,0.4)', granules: 'rgba(90,100,180,0.4)',
  nucleus: ['#a5b4fc', '#4f46e5', '#312e81'], nucleusLine: '#4338ca',
  lobes: [[-6, 6, 15], [8, 2, 12]], membrane: '#6366f1', vacuoles: 7,
};

/** Komórka odpornościowa (neutrofil / makrofag): nieregularna, ziarnista, z płatowatym jądrem. */
function drawLeukocyte(ctx: Ctx, w: number, h: number, st: ImmuneCellStyle): void {
  const rng = new Phaser.Math.RandomDataGenerator([st.seed]);
  const R = TEX_RADIUS.leukocyte;
  const p1 = rng.frac() * TAU;
  const p2 = rng.frac() * TAU;
  const p3 = rng.frac() * TAU;
  const k = st.bumpy;
  const outline = (scale: number) => {
    ctx.beginPath();
    for (let i = 0; i <= 96; i++) {
      const a = (i / 96) * TAU;
      const r = R * scale * (1 + 0.06 * k * Math.sin(4 * a + p1) + 0.04 * k * Math.sin(7 * a + p2) + 0.02 * Math.sin(13 * a + p3)) / (1 + 0.05 * (k - 1));
      if (i === 0) ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r);
      else ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    ctx.closePath();
  };
  ctx.translate(w / 2, h / 2);

  ctx.save();
  ctx.filter = 'blur(6px)';
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  outline(1.04);
  ctx.fill();
  ctx.restore();

  const bg = ctx.createRadialGradient(-12, -14, 6, 0, 0, R);
  bg.addColorStop(0, st.body[0]);
  bg.addColorStop(0.6, st.body[1]);
  bg.addColorStop(1, st.body[2]);
  ctx.save();
  ctx.globalAlpha = 0.93;
  ctx.fillStyle = bg;
  outline(1);
  ctx.fill();
  ctx.restore();

  ctx.save();
  outline(1);
  ctx.clip();
  ctx.filter = 'blur(4px)';
  ctx.lineWidth = 14;
  ctx.strokeStyle = st.edge;
  outline(1);
  ctx.stroke();
  ctx.filter = 'none';

  // Ziarnistości cytoplazmy.
  ctx.fillStyle = st.granules;
  for (let i = 0; i < 110; i++) {
    const a = rng.frac() * TAU;
    const r = Math.sqrt(rng.frac()) * R;
    ctx.beginPath();
    ctx.arc(Math.cos(a) * r, Math.sin(a) * r, 0.8 + rng.frac(), 0, TAU);
    ctx.fill();
  }

  // Wodniczki (strawione resztki).
  for (let i = 0; i < st.vacuoles; i++) {
    const a = rng.frac() * TAU;
    const r = 20 + rng.frac() * 18;
    const vr = 3 + rng.frac() * 5;
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.strokeStyle = 'rgba(60,60,120,0.5)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.arc(Math.cos(a) * r, Math.sin(a) * r, vr, 0, TAU);
    ctx.fill();
    ctx.stroke();
  }

  // Płatowate jądro: płaty połączone pasmami.
  const lobes = st.lobes;
  ctx.strokeStyle = st.nucleusLine;
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.moveTo(lobes[0][0], lobes[0][1]);
  for (const [x, y] of lobes) ctx.lineTo(x, y);
  ctx.stroke();
  for (const [x, y, r] of lobes) {
    const g = ctx.createRadialGradient(x - 4, y - 4, 1, x, y, r);
    g.addColorStop(0, st.nucleus[0]);
    g.addColorStop(0.55, st.nucleus[1]);
    g.addColorStop(1, st.nucleus[2]);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, TAU);
    ctx.fill();
  }

  ctx.filter = 'blur(5px)';
  ctx.fillStyle = 'rgba(255,255,255,0.45)';
  ctx.beginPath();
  ctx.ellipse(-16, -26, 20, 8, -0.4, 0, TAU);
  ctx.fill();
  ctx.restore();

  ctx.lineWidth = 3;
  ctx.strokeStyle = st.membrane;
  outline(1);
  ctx.stroke();
  ctx.lineWidth = 1.2;
  ctx.strokeStyle = 'rgba(255,255,255,0.4)';
  outline(0.95);
  ctx.stroke();
}

/** Przeciwciało: cząsteczka w kształcie litery Y (ramiona skierowane do przodu, w stronę +x). */
function drawAntibody(ctx: Ctx, w: number, h: number): void {
  ctx.translate(w / 2, h / 2);
  const path = () => {
    ctx.beginPath();
    ctx.moveTo(-16, 0);
    ctx.lineTo(2, 0);
    ctx.moveTo(2, 0);
    ctx.lineTo(14, -12);
    ctx.moveTo(2, 0);
    ctx.lineTo(14, 12);
  };
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  ctx.save();
  ctx.filter = 'blur(3px)';
  ctx.strokeStyle = 'rgba(0,0,0,0.5)';
  ctx.lineWidth = 11;
  path();
  ctx.stroke();
  ctx.restore();

  ctx.strokeStyle = '#1e3a8a';
  ctx.lineWidth = 9;
  path();
  ctx.stroke();
  ctx.strokeStyle = '#93c5fd';
  ctx.lineWidth = 5.5;
  path();
  ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,0.6)';
  ctx.lineWidth = 1.5;
  path();
  ctx.stroke();

  ctx.fillStyle = '#dbeafe';
  for (const [x, y] of [[14, -12], [14, 12]]) {
    ctx.beginPath();
    ctx.arc(x, y, 3.5, 0, TAU);
    ctx.fill();
  }
}

// ───────────────────────── narząd (komórka gospodarza) ─────────────────────────

function drawOrgan(ctx: Ctx, w: number, h: number): void {
  const rng = new Phaser.Math.RandomDataGenerator(['organ']);
  const R = TEX_RADIUS.organ;
  const p1 = rng.frac() * TAU;
  const p2 = rng.frac() * TAU;
  const p3 = rng.frac() * TAU;
  const outline = (scale: number) => {
    ctx.beginPath();
    for (let i = 0; i <= 96; i++) {
      const a = (i / 96) * TAU;
      const r = R * scale * (1 + 0.035 * Math.sin(3 * a + p1) + 0.025 * Math.sin(5 * a + p2) + 0.015 * Math.sin(9 * a + p3));
      if (i === 0) ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r);
      else ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    ctx.closePath();
  };
  ctx.translate(w / 2, h / 2);

  ctx.save();
  ctx.filter = 'blur(12px)';
  ctx.fillStyle = 'rgba(255,150,190,0.3)';
  outline(1.08);
  ctx.fill();
  ctx.restore();

  ctx.save();
  ctx.filter = 'blur(10px)';
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  outline(1.02);
  ctx.fill();
  ctx.restore();

  const cg = ctx.createRadialGradient(-20, -25, 10, 0, 0, R);
  cg.addColorStop(0, '#fdeef2');
  cg.addColorStop(0.55, '#f6c6d4');
  cg.addColorStop(0.9, '#e597b0');
  cg.addColorStop(1, '#c86a8e');
  ctx.save();
  ctx.globalAlpha = 0.93;
  ctx.fillStyle = cg;
  outline(1);
  ctx.fill();
  ctx.restore();

  const nucX = -12;
  const nucY = -10;
  const nucR = 34;

  ctx.save();
  outline(1);
  ctx.clip();

  ctx.filter = 'blur(6px)';
  ctx.lineWidth = 22;
  ctx.strokeStyle = 'rgba(150,40,90,0.35)';
  outline(1);
  ctx.stroke();
  ctx.filter = 'none';

  // Retikulum endoplazmatyczne.
  ctx.strokeStyle = 'rgba(190,80,130,0.28)';
  ctx.lineWidth = 2;
  for (let k = 0; k < 6; k++) {
    const a0 = rng.frac() * TAU;
    ctx.beginPath();
    ctx.arc(nucX, nucY, nucR + 10 + k * 8 + rng.frac() * 3, a0, a0 + 1.2 + rng.frac() * 1.6);
    ctx.stroke();
  }

  // Mitochondria.
  for (let i = 0; i < 9; i++) {
    const a = rng.frac() * TAU;
    const r = 52 + rng.frac() * 28;
    ctx.save();
    ctx.translate(Math.cos(a) * r, Math.sin(a) * r);
    ctx.rotate(rng.frac() * Math.PI);
    ctx.fillStyle = '#f4a28c';
    ctx.strokeStyle = '#c0563f';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.ellipse(0, 0, 11, 5, 0, 0, TAU);
    ctx.fill();
    ctx.stroke();
    ctx.strokeStyle = 'rgba(160,60,50,0.6)';
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    for (let x = -8; x <= 8; x += 2) ctx.lineTo(x, x % 4 === 0 ? -2.5 : 2.5);
    ctx.stroke();
    ctx.restore();
  }

  // Ziarnistości.
  ctx.fillStyle = 'rgba(160,60,100,0.3)';
  for (let i = 0; i < 80; i++) {
    const a = rng.frac() * TAU;
    const r = Math.sqrt(rng.frac()) * R;
    ctx.beginPath();
    ctx.arc(Math.cos(a) * r, Math.sin(a) * r, 0.8 + rng.frac(), 0, TAU);
    ctx.fill();
  }

  // Jądro.
  const ng = ctx.createRadialGradient(nucX - 10, nucY - 10, 4, nucX, nucY, nucR);
  ng.addColorStop(0, '#c9a3e6');
  ng.addColorStop(0.6, '#8e5cc0');
  ng.addColorStop(1, '#5b2d8a');
  ctx.fillStyle = ng;
  ctx.beginPath();
  ctx.arc(nucX, nucY, nucR, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = '#40196b';
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.save();
  ctx.beginPath();
  ctx.arc(nucX, nucY, nucR - 1, 0, TAU);
  ctx.clip();
  ctx.filter = 'blur(1.5px)';
  ctx.fillStyle = 'rgba(64,25,107,0.45)';
  for (let i = 0; i < 28; i++) {
    const a = rng.frac() * TAU;
    const r = Math.sqrt(rng.frac()) * nucR;
    ctx.beginPath();
    ctx.arc(nucX + Math.cos(a) * r, nucY + Math.sin(a) * r, 1.5 + rng.frac() * 2, 0, TAU);
    ctx.fill();
  }
  ctx.filter = 'blur(1px)';
  ctx.fillStyle = 'rgba(61,23,102,0.85)';
  ctx.beginPath();
  ctx.arc(nucX + 8, nucY + 6, 8, 0, TAU);
  ctx.fill();
  ctx.restore();

  ctx.filter = 'blur(6px)';
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  ctx.beginPath();
  ctx.ellipse(-35, -50, 30, 12, -0.5, 0, TAU);
  ctx.fill();
  ctx.restore();

  ctx.lineWidth = 4;
  ctx.strokeStyle = '#b03a68';
  outline(1);
  ctx.stroke();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = 'rgba(255,255,255,0.4)';
  outline(0.965);
  ctx.stroke();
}

// ───────────────────────── krwinka czerwona ─────────────────────────

function drawRbc(ctx: Ctx, w: number, h: number): void {
  const R = TEX_RADIUS.rbc;
  ctx.translate(w / 2, h / 2);

  ctx.save();
  ctx.filter = 'blur(6px)';
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.beginPath();
  ctx.arc(0, 0, R + 1, 0, TAU);
  ctx.fill();
  ctx.restore();

  // Dwuwklęsły dysk: jaśniejszy, cieńszy środek i gruby brzeg.
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, R);
  g.addColorStop(0, 'rgba(165,38,50,0.55)');
  g.addColorStop(0.35, 'rgba(180,44,56,0.62)');
  g.addColorStop(0.7, 'rgba(214,68,80,0.88)');
  g.addColorStop(0.9, 'rgba(198,54,66,0.92)');
  g.addColorStop(1, 'rgba(118,20,30,0.92)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(0, 0, R, 0, TAU);
  ctx.fill();

  ctx.filter = 'blur(3px)';
  ctx.strokeStyle = 'rgba(255,170,175,0.35)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(0, 0, R * 0.78, Math.PI * 1.05, Math.PI * 1.6);
  ctx.stroke();
}

// ───────────────────────── białko obronne narządu ─────────────────────────

/** Pofałdowane białko: zbitek kulek (domen) z poświatą. */
function drawProtein(ctx: Ctx, w: number, h: number): void {
  const rng = new Phaser.Math.RandomDataGenerator(['protein']);
  ctx.translate(w / 2, h / 2);

  ctx.save();
  ctx.filter = 'blur(4px)';
  ctx.fillStyle = 'rgba(255,170,210,0.6)';
  ctx.beginPath();
  ctx.arc(0, 0, TEX_RADIUS.protein + 2, 0, TAU);
  ctx.fill();
  ctx.restore();

  const beads: [number, number, number][] = [[0, 0, 4.5]];
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * TAU + rng.frac() * 0.5;
    const r = 4.5 + rng.frac() * 1.5;
    beads.push([Math.cos(a) * r, Math.sin(a) * r, 2.6 + rng.frac() * 1.4]);
  }
  for (const [x, y, r] of beads) {
    const g = ctx.createRadialGradient(x - r * 0.4, y - r * 0.4, 0.3, x, y, r);
    g.addColorStop(0, '#fff1f7');
    g.addColorStop(0.5, '#f9a8d4');
    g.addColorStop(1, '#be185d');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, TAU);
    ctx.fill();
  }
}

// ───────────────────────── miękkie kropki ─────────────────────────

function softCircle(ctx: Ctx, r: number, stops: [number, number][]): void {
  const g = ctx.createRadialGradient(r, r, 0, r, r, r);
  for (const [o, a] of stops) g.addColorStop(o, `rgba(255,255,255,${a})`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, r * 2, r * 2);
}
