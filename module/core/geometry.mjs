/**
 * Geometria 2D pura (nessuna dipendenza da Foundry): usata da fisica, regole e tavolo.
 * Poligoni = array di [x, y]; coordinate in "pixel del tavolo".
 */

/** RNG deterministico (mulberry32). */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function rng() {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function pointInPolygon(x, y, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export function distToSegment(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  let t = len2 === 0 ? 0 : ((px - ax) * dx + (py - ay) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

/** Distanza dal bordo del poligono (sempre >= 0, dentro o fuori). */
export function distToPolygonEdge(x, y, poly) {
  let best = Infinity;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const d = distToSegment(x, y, poly[j][0], poly[j][1], poly[i][0], poly[i][1]);
    if (d < best) best = d;
  }
  return best;
}

export function polygonArea(poly) {
  let a = 0;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    a += poly[j][0] * poly[i][1] - poly[i][0] * poly[j][1];
  }
  return Math.abs(a) / 2;
}

export function polygonCentroid(poly) {
  let a = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const f = poly[j][0] * poly[i][1] - poly[i][0] * poly[j][1];
    a += f;
    cx += (poly[j][0] + poly[i][0]) * f;
    cy += (poly[j][1] + poly[i][1]) * f;
  }
  if (Math.abs(a) < 1e-9) {
    const n = poly.length;
    return [poly.reduce((s, p) => s + p[0], 0) / n, poly.reduce((s, p) => s + p[1], 0) / n];
  }
  return [cx / (3 * a), cy / (3 * a)];
}

export function polygonBounds(poly) {
  const xs = poly.map((p) => p[0]);
  const ys = poly.map((p) => p[1]);
  return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) };
}

/** Taglia il poligono tenendo i punti con nx*x + ny*y <= c (Sutherland–Hodgman, 1 semipiano). */
export function clipHalfPlane(poly, nx, ny, c) {
  const out = [];
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i];
    const q = poly[(i + 1) % poly.length];
    const dp = nx * p[0] + ny * p[1] - c;
    const dq = nx * q[0] + ny * q[1] - c;
    if (dp <= 0) out.push(p);
    if (dp <= 0 !== dq <= 0) {
      const t = dp / (dp - dq);
      out.push([p[0] + t * (q[0] - p[0]), p[1] + t * (q[1] - p[1])]);
    }
  }
  return out;
}

export function rectPolygon({ x, y, w, h }) {
  return [
    [x, y],
    [x + w, y],
    [x + w, y + h],
    [x, y + h],
  ];
}

/** Celle di Voronoi (convesse) dei semi, ritagliate nel rettangolo. */
export function voronoiCells(seeds, rect) {
  const base = rectPolygon(rect);
  return seeds.map((s, i) => {
    let poly = base;
    for (let j = 0; j < seeds.length; j++) {
      if (i === j) continue;
      const o = seeds[j];
      const nx = o[0] - s[0];
      const ny = o[1] - s[1];
      const c = (o[0] * o[0] + o[1] * o[1] - s[0] * s[0] - s[1] * s[1]) / 2;
      poly = clipHalfPlane(poly, nx, ny, c);
      if (poly.length < 3) break;
    }
    return poly;
  });
}

/** Semi sparsi (best-candidate di Mitchell) dentro il rettangolo. */
export function scatterSeeds(n, rect, rng, candidates = 14) {
  const seeds = [];
  const rand = () => [rect.x + rng() * rect.w, rect.y + rng() * rect.h];
  seeds.push(rand());
  while (seeds.length < n) {
    let best = null;
    let bestD = -1;
    for (let k = 0; k < candidates; k++) {
      const c = rand();
      let d = Infinity;
      for (const s of seeds) d = Math.min(d, Math.hypot(c[0] - s[0], c[1] - s[1]));
      if (d > bestD) {
        bestD = d;
        best = c;
      }
    }
    seeds.push(best);
  }
  return seeds;
}

/**
 * Genera `n` Sezioni (poligoni convessi, che coprono tutto il foglio) con Lloyd leggero
 * così da avere aree simili ma forme irregolari, come disegnate a mano.
 */
export function generateSections(n, rect, rng, { relax = 2 } = {}) {
  let seeds = scatterSeeds(n, rect, rng);
  let cells = voronoiCells(seeds, rect);
  for (let it = 0; it < relax; it++) {
    seeds = cells.map((c, i) => {
      if (c.length < 3) return seeds[i];
      const [cx, cy] = polygonCentroid(c);
      // sposta solo parzialmente: manteniamo un po' di irregolarità
      return [seeds[i][0] * 0.4 + cx * 0.6, seeds[i][1] * 0.4 + cy * 0.6];
    });
    cells = voronoiCells(seeds, rect);
  }
  return cells.map((poly, i) => ({ id: `s${i + 1}`, poly: poly.map(([x, y]) => [round1(x), round1(y)]) }));
}

export function round1(v) {
  return Math.round(v * 10) / 10;
}

/** Punto dentro il poligono, il più vicino a (x, y), con almeno `margin` dal bordo. */
export function nearestInteriorPoint(poly, x, y, margin = 18) {
  const [cx, cy] = polygonCentroid(poly);
  const steps = 40;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const px = x + (cx - x) * t;
    const py = y + (cy - y) * t;
    if (pointInPolygon(px, py, poly) && distToPolygonEdge(px, py, poly) >= margin) return [px, py];
  }
  return [cx, cy];
}

/**
 * Posizioni per `count` biglie dentro una Sezione senza sovrapporsi a `occupied` ([x,y]).
 * Spirale attorno al baricentro; ritorna [x,y][].
 */
export function packInSection(poly, occupied, count, radius, rng = Math.random) {
  let [cx, cy] = polygonCentroid(poly);
  // le biglie vanno sotto il Tema scritto al centro, non sopra: ancora spostata verso il basso
  if (pointInPolygon(cx, cy + 52, poly) && distToPolygonEdge(cx, cy + 52, poly) > radius + 6) cy += 52;
  const placed = [];
  const taken = occupied.map((p) => [p[0], p[1]]);
  const gap = radius * 2 + 3;
  let angle = rng() * Math.PI * 2;
  let ring = 0;
  let guard = 0;
  while (placed.length < count && guard++ < 4000) {
    const r = ring * gap * 0.55;
    const x = cx + Math.cos(angle) * r;
    const y = cy + Math.sin(angle) * r;
    const ok =
      pointInPolygon(x, y, poly) &&
      distToPolygonEdge(x, y, poly) >= radius + 2 &&
      taken.every((p) => Math.hypot(p[0] - x, p[1] - y) >= gap);
    if (ok) {
      placed.push([round1(x), round1(y)]);
      taken.push([x, y]);
    }
    angle += 0.9;
    ring += 0.045;
  }
  // fallback (sezione minuscola): sovrapponi pure
  while (placed.length < count) placed.push([round1(cx), round1(cy)]);
  return placed;
}
