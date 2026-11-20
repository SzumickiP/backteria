import Phaser from 'phaser';
import { bodyAxes, body } from '../body';
import { edgePoint, type OrganelleDef, type PlacedOrganelle } from '../organelles';

/** Czułki bakterii (nadane w zakładce „Ciało”): faliste, równo rozmieszczone wokół błony. */
export function drawFeelers(g: Phaser.GameObjects.Graphics, x: number, y: number, r: number, rot: number, t: number): void {
  const n = body.feelers;
  if (n <= 0) return;
  const { ax, ay } = bodyAxes(true);
  const cos = Math.cos(rot);
  const sin = Math.sin(rot);
  const L = r * 0.75 * body.feelerLen;
  for (let k = 0; k < n; k++) {
    // Rozmieszczone równo, z przesunięciem, żeby nie wypadały dokładnie na osi (tam są wici).
    const a = ((k + 0.5) / n) * Math.PI * 2 + Math.PI / 2;
    const lx = Math.cos(a) * ax;
    const ly = Math.sin(a) * ay;
    const nl = Math.hypot(Math.cos(a) / ax, Math.sin(a) / ay) || 1;
    const nxl = Math.cos(a) / ax / nl;
    const nyl = Math.sin(a) / ay / nl;
    const bx = x + (lx * cos - ly * sin) * r;
    const by = y + (lx * sin + ly * cos) * r;
    const nx = nxl * cos - nyl * sin;
    const ny = nxl * sin + nyl * cos;
    g.lineStyle(Math.max(1.5, r * 0.07), 0xa7f3d0, 0.85).beginPath();
    let ex = bx;
    let ey = by;
    for (let i = 0; i <= 10; i++) {
      const s = i / 10;
      const w = Math.sin(s * 5 - t * 4 + k * 1.3) * r * 0.16 * s;
      ex = bx + nx * L * s - ny * w;
      ey = by + ny * L * s + nx * w;
      if (i === 0) g.moveTo(ex, ey);
      else g.lineTo(ex, ey);
    }
    g.strokePath();
    g.fillStyle(0xecfdf5, 1).fillCircle(ex, ey, Math.max(1.8, r * 0.06));
  }
}

/**
 * Rysuje organella na komórce (w grze i w edytorze).
 * @param r promień komórki (px), @param rot obrót komórki, @param t czas (animacja wici)
 */
export function drawOrganelles(
  g: Phaser.GameObjects.Graphics,
  x: number,
  y: number,
  r: number,
  rot: number,
  rod: boolean,
  list: PlacedOrganelle[],
  defs: Map<string, OrganelleDef>,
  t: number,
): void {
  const cos = Math.cos(rot);
  const sin = Math.sin(rot);
  /** lokalne (w promieniach) → świat */
  const W = (lx: number, ly: number) => ({ x: x + (lx * cos - ly * sin) * r, y: y + (lx * sin + ly * cos) * r });
  /** zewnętrzna normalna błony w punkcie o kącie a (lokalnie) */
  const normal = (a: number) => {
    const { ax, ay } = bodyAxes(rod);
    const nx = Math.cos(a) / ax;
    const ny = Math.sin(a) / ay;
    const l = Math.hypot(nx, ny);
    return { x: nx / l, y: ny / l };
  };

  // Warstwy otaczające całą komórkę (otoczka, kapsyd).
  let shell = 0;
  for (const o of list) {
    const def = defs.get(o.id);
    if (!def || def.placement !== 'shell') continue;
    shell++;
    const k = 1.1 + shell * 0.09;
    const pts: Phaser.Math.Vector2[] = [];
    for (let i = 0; i <= 40; i++) {
      const e = edgePoint(rod, (i / 40) * Math.PI * 2);
      const p = W(e.x * k, e.y * k);
      pts.push(new Phaser.Math.Vector2(p.x, p.y));
    }
    g.lineStyle(Math.max(2.5, r * 0.08), def.color, 0.65).strokePoints(pts, true, true);
  }

  for (const o of list) {
    const def = defs.get(o.id);
    if (!def || def.placement === 'shell') continue;
    const c = def.color;

    if (def.placement === 'inside') {
      const e = edgePoint(rod, o.angle);
      const p = W(e.x * o.dist, e.y * o.dist);
      if (o.id === 'ribosome') {
        for (let i = 0; i < 3; i++) g.fillStyle(c, 0.9).fillCircle(p.x + Math.cos(i * 2.1) * r * 0.08, p.y + Math.sin(i * 2.1) * r * 0.08, r * 0.05);
      } else if (o.id === 'transcriptase') {
        g.lineStyle(Math.max(1, r * 0.05), c, 0.9).beginPath();
        for (let i = 0; i <= 6; i++) {
          const q = W(e.x * o.dist + (i - 3) * 0.06, e.y * o.dist + (i % 2 ? 0.05 : -0.05));
          if (i === 0) g.moveTo(q.x, q.y);
          else g.lineTo(q.x, q.y);
        }
        g.strokePath();
      } else {
        g.fillStyle(c, 0.85).fillCircle(p.x, p.y, r * 0.16);
        g.fillStyle(0xffffff, 0.5).fillCircle(p.x - r * 0.05, p.y - r * 0.05, r * 0.05);
      }
      continue;
    }

    // Na błonie.
    const e = edgePoint(rod, o.angle);
    const n0 = normal(o.angle);
    const base = W(e.x, e.y);
    // normalna w świecie
    const n = { x: n0.x * cos - n0.y * sin, y: n0.x * sin + n0.y * cos };
    const tx = -n.y;
    const ty = n.x;
    const lw = Math.max(1, r * 0.07);

    switch (o.id) {
      case 'flagellum': {
        g.lineStyle(Math.max(1, r * 0.09), c, 0.6).beginPath();
        for (let i = 0; i <= 14; i++) {
          const s = i / 14;
          const d = s * r * 2.2;
          const w = Math.sin(s * 9 - t * 14 + o.angle * 3) * r * 0.28 * s;
          const px = base.x + n.x * d + tx * w;
          const py = base.y + n.y * d + ty * w;
          if (i === 0) g.moveTo(px, py);
          else g.lineTo(px, py);
        }
        g.strokePath();
        break;
      }
      case 'spike': {
        const L = r * 0.5;
        const B = r * 0.14;
        g.fillStyle(c, 0.95).fillTriangle(base.x + tx * B, base.y + ty * B, base.x - tx * B, base.y - ty * B, base.x + n.x * L, base.y + n.y * L);
        g.lineStyle(1, 0x713f12, 0.8).strokeTriangle(base.x + tx * B, base.y + ty * B, base.x - tx * B, base.y - ty * B, base.x + n.x * L, base.y + n.y * L);
        break;
      }
      case 'pilus': {
        const L = r * 0.7;
        g.lineStyle(lw * 0.7, c, 0.9).lineBetween(base.x, base.y, base.x + n.x * L, base.y + n.y * L);
        g.fillStyle(c, 1).fillCircle(base.x + n.x * L, base.y + n.y * L, r * 0.05);
        break;
      }
      case 'tail': {
        const L = r * 0.8;
        g.lineStyle(lw * 1.6, c, 0.95).lineBetween(base.x, base.y, base.x + n.x * L, base.y + n.y * L);
        const ex = base.x + n.x * L;
        const ey = base.y + n.y * L;
        g.lineStyle(lw * 0.6, c, 0.9);
        g.lineBetween(ex, ey, ex + (n.x + tx) * r * 0.25, ey + (n.y + ty) * r * 0.25);
        g.lineBetween(ex, ey, ex + (n.x - tx) * r * 0.25, ey + (n.y - ty) * r * 0.25);
        break;
      }
      case 'cloak': {
        g.fillStyle(c, 0.7).fillCircle(base.x + n.x * r * 0.1, base.y + n.y * r * 0.1, r * 0.13);
        g.lineStyle(1, 0xffffff, 0.6).strokeCircle(base.x + n.x * r * 0.1, base.y + n.y * r * 0.1, r * 0.13);
        break;
      }
      default: {
        // Receptor / białko wypustkowe: łodyżka z główką.
        const L = r * 0.38;
        g.lineStyle(lw * 0.8, c, 0.9).lineBetween(base.x, base.y, base.x + n.x * L, base.y + n.y * L);
        g.fillStyle(c, 1).fillCircle(base.x + n.x * L, base.y + n.y * L, r * 0.11);
        g.fillStyle(0xffffff, 0.6).fillCircle(base.x + n.x * L - r * 0.03, base.y + n.y * L - r * 0.03, r * 0.04);
      }
    }
  }
}
