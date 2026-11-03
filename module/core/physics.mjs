/**
 * Fisica delle biglie (pura, senza Foundry). Un tiro = una simulazione a passo fisso.
 * Il foglio ("Mappa") sta dentro un tavolo con bordi; fuori dal foglio l'attrito è maggiore.
 * Le "cancellature" lasciano macchie (attrito + deviazioni) e pieghe (rallentano e deviano),
 * che crescono di fase in fase: dare una direzione precisa diventa sempre più difficile.
 */
import { mulberry32 } from "./geometry.mjs";

export const PHYS = {
  dt: 1 / 120,
  radius: 15,
  restitution: 0.93,
  wallRestitution: 0.55,
  c0: 420, // decelerazione costante (px/s²) sul foglio
  c1: 0.35, // resistenza proporzionale (1/s)
  outsideFactor: 1.6, // attrito fuori dal foglio
  smudgeExtra: 520, // decelerazione extra dentro una macchia
  smudgeWobble: 0.03, // rad per passo, scalato dal peso
  creaseSlow: 0.84,
  creaseTurn: 0.34, // rad (±metà)
  stopSpeed: 9,
  maxTime: 14,
  maxLaunch: 1900,
  sampleEvery: 4, // passi tra due campioni di traiettoria (30 fps)
};

export const TABLE = { w: 1280, h: 900 };
export const PAPER = { x: 90, y: 70, w: 1100, h: 760 };

/** Mondo vuoto con il foglio e (opzionali) macchie/pieghe/ostacoli. */
export function createWorld(extra = {}) {
  return {
    table: { ...TABLE },
    paper: { ...PAPER },
    smudges: [],
    creases: [],
    obstacles: [],
    torn: null, // {x,y,w,h}: metà strappata (fuori mappa)
    marbles: [], // {id, x, y}
    ...extra,
  };
}

/** Quante macchie/pieghe ha la Mappa all'indice di fase `phaseIndex` (0 = foglio nuovo). */
export function erasureResidue(phaseIndex, paper, rng) {
  const smudges = [];
  const creases = [];
  if (phaseIndex <= 0) return { smudges, creases };
  const nS = Math.min(3 + Math.round(phaseIndex * 1.6), 22);
  for (let i = 0; i < nS; i++) {
    smudges.push({
      x: paper.x + 30 + rng() * (paper.w - 60),
      y: paper.y + 30 + rng() * (paper.h - 60),
      r: 40 + rng() * 70,
      k: 0.5 + rng() * 0.5,
    });
  }
  const nC = Math.min(Math.floor(phaseIndex / 2) + (phaseIndex > 4 ? 1 : 0), 7);
  for (let i = 0; i < nC; i++) {
    const horizontal = rng() < 0.5;
    if (horizontal) {
      const y = paper.y + 60 + rng() * (paper.h - 120);
      creases.push({ x1: paper.x + 10, y1: y, x2: paper.x + paper.w - 10, y2: y + (rng() - 0.5) * 120 });
    } else {
      const x = paper.x + 60 + rng() * (paper.w - 120);
      creases.push({ x1: x, y1: paper.y + 10, x2: x + (rng() - 0.5) * 120, y2: paper.y + paper.h - 10 });
    }
  }
  return { smudges, creases };
}

/** Disordine sul tavolo: bicchieri, ciotole, accendini... (cerchi fissi) nel margine fuori dal foglio. */
export function clutterObstacles(paper, table, rng, count = 5) {
  const out = [];
  const items = ["bicchiere", "ciotola", "accendino", "cellulare", "bottiglia", "posacenere"];
  let guard = 0;
  while (out.length < count && guard++ < 400) {
    const r = 22 + rng() * 22;
    const x = r + rng() * (table.w - 2 * r);
    const y = r + rng() * (table.h - 2 * r);
    const onPaper =
      x > paper.x - r - 6 && x < paper.x + paper.w + r + 6 && y > paper.y - r - 6 && y < paper.y + paper.h + r + 6;
    if (onPaper) continue;
    if (out.some((o) => Math.hypot(o.x - x, o.y - y) < o.r + r + 20)) continue;
    out.push({ x: Math.round(x), y: Math.round(y), r: Math.round(r), kind: items[out.length % items.length] });
  }
  return out;
}

function segmentsCross(ax, ay, bx, by, cx, cy, dx, dy) {
  const d1x = bx - ax;
  const d1y = by - ay;
  const d2x = dx - cx;
  const d2y = dy - cy;
  const den = d1x * d2y - d1y * d2x;
  if (Math.abs(den) < 1e-9) return false;
  const t = ((cx - ax) * d2y - (cy - ay) * d2x) / den;
  const u = ((cx - ax) * d1y - (cy - ay) * d1x) / den;
  return t >= 0 && t <= 1 && u >= 0 && u <= 1;
}

function insideRect(x, y, r) {
  return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
}

/**
 * Simula il tiro di `throwerId` con velocità iniziale. Le altre biglie in `world.marbles` sono ferme.
 * @returns {{
 *   tracks: {id:string,t0:number,pts:number[]}[],
 *   final: Record<string,{x:number,y:number}>,
 *   contact: null|{with:string,t:number,x:number,y:number},
 *   duration:number, collisions:{t:number,a:string,b:string,v:number}[]
 * }}
 */
export function simulateThrow(world, throwerId, launch, { seed = 1, params = {} } = {}) {
  const P = { ...PHYS, ...params };
  const rng = mulberry32(seed);
  const r = P.radius;
  const bodies = world.marbles.map((m) => ({ id: m.id, x: m.x, y: m.y, vx: 0, vy: 0, moved: false }));
  let sp = Math.hypot(launch.vx, launch.vy);
  const k = sp > P.maxLaunch ? P.maxLaunch / sp : 1;
  const thrower = { id: throwerId, x: launch.x, y: launch.y, vx: launch.vx * k, vy: launch.vy * k, moved: true };
  bodies.push(thrower);
  const samples = bodies.map(() => []); // per body: [x,y,...]
  const collisions = [];
  let contact = null;
  const creaseCool = new Map();
  const W = world.table.w;
  const H = world.table.h;
  const steps = Math.ceil(P.maxTime / P.dt);
  let step = 0;

  const record = () => {
    bodies.forEach((b, i) => {
      samples[i].push(Math.round(b.x * 10) / 10, Math.round(b.y * 10) / 10);
    });
  };
  record();

  for (step = 1; step <= steps; step++) {
    let anyMoving = false;
    for (const b of bodies) {
      let speed = Math.hypot(b.vx, b.vy);
      if (speed === 0) continue;
      const px = b.x;
      const py = b.y;
      b.x += b.vx * P.dt;
      b.y += b.vy * P.dt;
      b.moved = true;
      const onPaper = insideRect(b.x, b.y, world.paper);
      let decel = (P.c0 + P.c1 * speed) * (onPaper ? 1 : P.outsideFactor);
      if (onPaper) {
        for (const s of world.smudges) {
          const d = Math.hypot(b.x - s.x, b.y - s.y);
          if (d < s.r) {
            const w = (1 - d / s.r) * s.k;
            decel += P.smudgeExtra * w;
            const a = (rng() - 0.5) * 2 * P.smudgeWobble * w;
            const c = Math.cos(a);
            const sn = Math.sin(a);
            const vx = b.vx * c - b.vy * sn;
            const vy = b.vx * sn + b.vy * c;
            b.vx = vx;
            b.vy = vy;
          }
        }
        world.creases.forEach((cr, ci) => {
          const key = `${b.id}:${ci}`;
          if (creaseCool.get(key) > step - 24) return;
          if (segmentsCross(px, py, b.x, b.y, cr.x1, cr.y1, cr.x2, cr.y2)) {
            creaseCool.set(key, step);
            const a = (rng() - 0.5) * P.creaseTurn;
            const c = Math.cos(a);
            const sn = Math.sin(a);
            const vx = (b.vx * c - b.vy * sn) * P.creaseSlow;
            const vy = (b.vx * sn + b.vy * c) * P.creaseSlow;
            b.vx = vx;
            b.vy = vy;
          }
        });
      }
      speed = Math.hypot(b.vx, b.vy);
      const ns = speed - decel * P.dt;
      if (ns <= P.stopSpeed) {
        b.vx = 0;
        b.vy = 0;
      } else {
        const f = ns / speed;
        b.vx *= f;
        b.vy *= f;
        anyMoving = true;
      }
      // bordi del tavolo
      if (b.x < r) {
        b.x = r;
        b.vx = Math.abs(b.vx) * P.wallRestitution;
      } else if (b.x > W - r) {
        b.x = W - r;
        b.vx = -Math.abs(b.vx) * P.wallRestitution;
      }
      if (b.y < r) {
        b.y = r;
        b.vy = Math.abs(b.vy) * P.wallRestitution;
      } else if (b.y > H - r) {
        b.y = H - r;
        b.vy = -Math.abs(b.vy) * P.wallRestitution;
      }
      // ostacoli del tavolo
      for (const o of world.obstacles) {
        const dx = b.x - o.x;
        const dy = b.y - o.y;
        const d = Math.hypot(dx, dy);
        if (d < o.r + r && d > 0) {
          const nx = dx / d;
          const ny = dy / d;
          b.x = o.x + nx * (o.r + r);
          b.y = o.y + ny * (o.r + r);
          const vn = b.vx * nx + b.vy * ny;
          if (vn < 0) {
            b.vx -= (1 + P.wallRestitution) * vn * nx;
            b.vy -= (1 + P.wallRestitution) * vn * ny;
          }
          anyMoving = anyMoving || Math.hypot(b.vx, b.vy) > 0;
        }
      }
    }
    // urti tra biglie
    for (let i = 0; i < bodies.length; i++) {
      for (let j = i + 1; j < bodies.length; j++) {
        const a = bodies[i];
        const b = bodies[j];
        if (a.vx === 0 && a.vy === 0 && b.vx === 0 && b.vy === 0) continue;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const d = Math.hypot(dx, dy);
        if (d >= 2 * r || d === 0) continue;
        const nx = dx / d;
        const ny = dy / d;
        const overlap = 2 * r - d;
        a.x -= (nx * overlap) / 2;
        a.y -= (ny * overlap) / 2;
        b.x += (nx * overlap) / 2;
        b.y += (ny * overlap) / 2;
        const rv = (a.vx - b.vx) * nx + (a.vy - b.vy) * ny;
        if (rv > 0) {
          const jn = ((1 + P.restitution) * rv) / 2;
          a.vx -= jn * nx;
          a.vy -= jn * ny;
          b.vx += jn * nx;
          b.vy += jn * ny;
          collisions.push({ t: step * P.dt, a: a.id, b: b.id, v: Math.round(rv) });
          if (!contact && (a.id === throwerId || b.id === throwerId)) {
            const other = a.id === throwerId ? b : a;
            contact = { with: other.id, t: step * P.dt, x: thrower.x, y: thrower.y };
          }
          anyMoving = true;
        }
      }
    }
    if (step % P.sampleEvery === 0) record();
    if (!anyMoving && bodies.every((b) => b.vx === 0 && b.vy === 0)) break;
  }
  record();

  const final = {};
  const tracks = [];
  bodies.forEach((b, i) => {
    final[b.id] = { x: Math.round(b.x * 10) / 10, y: Math.round(b.y * 10) / 10 };
    const pts = samples[i];
    let differs = false;
    for (let q = 2; q < pts.length; q += 2) {
      if (pts[q] !== pts[0] || pts[q + 1] !== pts[1]) {
        differs = true;
        break;
      }
    }
    if (!differs) return; // mai mossa
    // taglia la coda immobile e la testa immobile
    let end = pts.length / 2 - 1;
    while (end > 0 && pts[end * 2] === pts[(end - 1) * 2] && pts[end * 2 + 1] === pts[(end - 1) * 2 + 1]) end--;
    let t0 = 0;
    while (t0 < end && pts[(t0 + 1) * 2] === pts[0] && pts[(t0 + 1) * 2 + 1] === pts[1]) t0++;
    tracks.push({ id: b.id, t0, pts: pts.slice(t0 * 2, (end + 1) * 2) });
  });
  return { tracks, final, contact, duration: step * P.dt, collisions };
}

/** Velocità di lancio da un trascinamento "fionda" (da `from` verso `to`: parte il lato opposto). */
export function launchFromDrag(from, to, gain = 7.5, max = PHYS.maxLaunch) {
  let vx = (from.x - to.x) * gain;
  let vy = (from.y - to.y) * gain;
  const sp = Math.hypot(vx, vy);
  if (sp > max) {
    vx *= max / sp;
    vy *= max / sp;
  }
  return { x: from.x, y: from.y, vx, vy };
}
