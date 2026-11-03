import test from "node:test";
import assert from "node:assert/strict";
import {
  mulberry32,
  generateSections,
  pointInPolygon,
  polygonArea,
  rectPolygon,
  distToPolygonEdge,
} from "../module/core/geometry.mjs";
import { createWorld, simulateThrow, erasureResidue, PAPER, PHYS } from "../module/core/physics.mjs";
import {
  PHASES,
  DEMO_PHASES,
  marblesPerPlayer,
  deathTriggers,
  endingMix,
  tally,
  pickDead,
  epilogueSections,
  pickEnding,
  resolveThrow,
  soloPositions,
  sectionAt,
} from "../module/core/rules.mjs";

const paperRect = { x: PAPER.x, y: PAPER.y, w: PAPER.w, h: PAPER.h };

test("le Sezioni coprono tutto il foglio senza buchi", () => {
  for (const n of [6, 8, 12, 16]) {
    const secs = generateSections(n, paperRect, mulberry32(n * 7));
    assert.equal(secs.length, n);
    const total = secs.reduce((s, c) => s + polygonArea(c.poly), 0);
    assert.ok(Math.abs(total - PAPER.w * PAPER.h) < PAPER.w * PAPER.h * 0.001, `n=${n} area ${total}`);
    // ogni punto del foglio sta in esattamente una Sezione
    const rng = mulberry32(99);
    for (let i = 0; i < 200; i++) {
      const x = PAPER.x + 1 + rng() * (PAPER.w - 2);
      const y = PAPER.y + 1 + rng() * (PAPER.h - 2);
      const hits = secs.filter((c) => pointInPolygon(x, y, c.poly)).length;
      assert.ok(hits >= 1, "punto senza Sezione");
    }
  }
});

test("le Fasi hanno il numero di Sezioni del regolamento", () => {
  assert.deepEqual(
    PHASES.map((p) => p.sections),
    [6, 8, 8, 8, 8, 12, 12, 12, 16, 16, 16],
  );
  assert.deepEqual(
    PHASES.map((p) => p.death),
    [null, null, null, null, null, null, null, 6, 5, 4, 3],
  );
  assert.deepEqual(
    DEMO_PHASES.map((p) => p.sections),
    [8, 8, 12],
  );
});

test("Dado della Morte e biglie per giocatore", () => {
  const p30 = PHASES[7];
  const p56 = PHASES[10];
  assert.equal(deathTriggers(p30, 5), false);
  assert.equal(deathTriggers(p30, 6), true);
  assert.equal(deathTriggers(p56, 2), false);
  assert.equal(deathTriggers(p56, 3), true);
  assert.equal(deathTriggers(PHASES[0], 6), false);
  assert.equal(marblesPerPlayer(1), 2);
  assert.equal(marblesPerPlayer(3), 2);
  assert.equal(marblesPerPlayer(4), 3);
  assert.equal(marblesPerPlayer(5), 3);
});

test("ripartizione dei finali dal rapporto Legami/Problematiche", () => {
  assert.deepEqual(endingMix(4, 2), { key: "A", lieto: 4, dolceamaro: 3, drammatico: 1 });
  assert.equal(endingMix(5, 2).key, "A");
  assert.equal(endingMix(3, 2).key, "B");
  assert.equal(endingMix(2, 2).key, "C");
  assert.equal(endingMix(0, 0).key, "C");
  assert.equal(endingMix(1, 3).key, "D");
  for (const [l, p] of [[4, 1], [3, 2], [2, 2], [1, 4]]) {
    const m = endingMix(l, p);
    assert.equal(m.lieto + m.dolceamaro + m.drammatico, 8);
  }
});

test("punteggio: gli Indistruttibili valgono doppio, i rimossi non contano", () => {
  const t = tally([
    { tipo: "legame" },
    { tipo: "legame", indistruttibile: true },
    { tipo: "legame", rimosso: true },
    { tipo: "problematica" },
    { tipo: "problematica", indistruttibile: true },
  ]);
  assert.deepEqual(t, { legami: 3, problemi: 3, score: 0 });
});

test("chi muore: massimo punteggio, spareggio con d6", () => {
  assert.deepEqual(pickDead({ a: 3, b: 1 }), { dead: "a", tied: ["a"], needsRoll: false });
  let r = pickDead({ a: 2, b: 2, c: 0 });
  assert.equal(r.needsRoll, true);
  assert.deepEqual(r.tied, ["a", "b"]);
  r = pickDead({ a: 2, b: 2, c: 0 }, { a: 3, b: 5 });
  assert.equal(r.dead, "b");
  r = pickDead({ a: 2, b: 2 }, { a: 4, b: 4 });
  assert.equal(r.needsRoll, true);
});

test("la fisica: tiro nel vuoto si ferma dentro il tavolo", () => {
  const w = createWorld();
  const sim = simulateThrow(w, "t", { x: 40, y: 400, vx: 900, vy: 0 }, { seed: 5 });
  assert.ok(sim.duration < PHYS.maxTime + 0.1);
  assert.ok(sim.final.t.x > 40);
  assert.equal(sim.contact, null);
  assert.ok(sim.tracks.length === 1 && sim.tracks[0].id === "t");
});

test("la fisica: urto frontale trasferisce la quantità di moto", () => {
  const w = createWorld({ marbles: [{ id: "b", x: 600, y: 400 }] });
  const sim = simulateThrow(w, "t", { x: 400, y: 400, vx: 700, vy: 0 }, { seed: 1 });
  assert.equal(sim.contact?.with, "b");
  assert.ok(sim.final.b.x > 600 + 20, "la biglia colpita si sposta");
  assert.ok(sim.final.t.x < sim.final.b.x);
});

test("la fisica è deterministica a parità di seme", () => {
  const w = createWorld({ marbles: [{ id: "b", x: 600, y: 420 }], ...erasureResidue(5, PAPER, mulberry32(3)) });
  const a = simulateThrow(w, "t", { x: 300, y: 400, vx: 800, vy: 40 }, { seed: 11 });
  const b = simulateThrow(w, "t", { x: 300, y: 400, vx: 800, vy: 40 }, { seed: 11 });
  assert.deepEqual(a.final, b.final);
});

test("più fasi = più residui di cancellatura", () => {
  const r1 = erasureResidue(1, PAPER, mulberry32(1));
  const r8 = erasureResidue(8, PAPER, mulberry32(1));
  assert.ok(r8.smudges.length > r1.smudges.length);
  assert.ok(r8.creases.length > r1.creases.length);
  assert.equal(erasureResidue(0, PAPER, mulberry32(1)).smudges.length, 0);
});

// --- regole -----------------------------------------------------------------
// Due Sezioni affiancate: A (sinistra), B (destra).
const sections = [
  { id: "A", poly: rectPolygon({ x: 100, y: 100, w: 400, h: 400 }) },
  { id: "B", poly: rectPolygon({ x: 500, y: 100, w: 400, h: 400 }) },
];
const bounds = { x: 100, y: 100, w: 800, h: 400 };
const T = { id: "t", ownerId: "ann" };
const fakeSim = (final, contactWith = null) => ({ tracks: [], final, contact: contactWith ? { with: contactWith } : null });

test("esce senza toccare nessuno: nessun effetto, si rilancia", () => {
  const o = resolveThrow({ sections, bounds, start: [], thrower: T, sim: fakeSim({ t: { x: 50, y: 50 } }) });
  assert.equal(o.case, "fuori");
  assert.equal(o.rethrow, true);
});

test("si ferma da sola in una Sezione: racconto, nessun Legame", () => {
  const o = resolveThrow({ sections, bounds, start: [], thrower: T, sim: fakeSim({ t: { x: 300, y: 300 } }) });
  assert.equal(o.case, "racconto");
  assert.equal(o.sectionId, "A");
});

test("si ferma con biglie di altri giocatori: incontro (Legame / risolvi Problematica)", () => {
  const start = [{ id: "m1", ownerId: "bob", x: 250, y: 300 }];
  const o = resolveThrow({ sections, bounds, start, thrower: T, sim: fakeSim({ t: { x: 330, y: 300 }, m1: { x: 250, y: 300 } }) });
  assert.equal(o.case, "incontro");
  assert.deepEqual(o.involved.sort(), ["ann", "bob"]);
  assert.equal(o.encounter, true);
});

test("già legati in questa Fase: Legame Indistruttibile", () => {
  const start = [{ id: "m1", ownerId: "bob", x: 250, y: 300 }];
  const o = resolveThrow({
    sections,
    bounds,
    start,
    thrower: T,
    bondedThisPhase: ["bob"],
    sim: fakeSim({ t: { x: 330, y: 300 }, m1: { x: 250, y: 300 } }),
  });
  assert.equal(o.case, "legame-indistruttibile");
});

test("solo biglie del proprio colore: elimina un Legame o crea una Problematica", () => {
  const start = [{ id: "m1", ownerId: "ann", x: 250, y: 300 }];
  const o = resolveThrow({ sections, bounds, start, thrower: T, sim: fakeSim({ t: { x: 330, y: 300 }, m1: { x: 250, y: 300 } }) });
  assert.equal(o.case, "propri");
  assert.deepEqual(o.involved, ["ann"]);
});

test("spinge fuori una biglia altrui: scontro, le biglie vengono portate nella Sezione", () => {
  const start = [{ id: "m1", ownerId: "bob", x: 250, y: 300 }];
  const sim = fakeSim({ t: { x: 520, y: 300 }, m1: { x: 700, y: 300 } }, "m1"); // m1 finita in B
  const o = resolveThrow({ sections, bounds, start, thrower: T, sim, rng: mulberry32(2) });
  assert.equal(o.case, "scontro");
  assert.equal(o.sectionId, "A");
  assert.deepEqual(o.involved.sort(), ["ann", "bob"]);
  for (const id of ["t", "m1"]) {
    const p = o.placements.find((q) => q.id === id);
    assert.equal(sectionAt(sections, p.x, p.y, bounds), "A", `${id} nella Sezione dello scontro`);
  }
});

test("spinge fuori una biglia propria con solo biglie proprie: Problematica Indistruttibile", () => {
  const start = [{ id: "m1", ownerId: "ann", x: 250, y: 300 }];
  const sim = fakeSim({ t: { x: 520, y: 300 }, m1: { x: 40, y: 300 } }, "m1"); // m1 fuori dalla Mappa
  const o = resolveThrow({ sections, bounds, start, thrower: T, sim, rng: mulberry32(2) });
  assert.equal(o.case, "problematica-indistruttibile");
  assert.deepEqual(o.involved, ["ann"]);
});

test("biglie toccate in altre Sezioni tornano al loro posto senza effetti", () => {
  const start = [
    { id: "m1", ownerId: "bob", x: 250, y: 300 }, // A: la prima toccata
    { id: "m2", ownerId: "cat", x: 700, y: 300 }, // B: sbalzata per rimbalzo
  ];
  const sim = fakeSim({ t: { x: 330, y: 300 }, m1: { x: 260, y: 300 }, m2: { x: 800, y: 420 } }, "m1");
  const o = resolveThrow({ sections, bounds, start, thrower: T, sim });
  assert.equal(o.case, "incontro");
  assert.deepEqual(o.involved.sort(), ["ann", "bob"]);
  const m2 = o.placements.find((p) => p.id === "m2");
  assert.deepEqual([m2.x, m2.y], [700, 300]);
});

test("solco tra due Sezioni: serve scegliere il Tema", () => {
  const o = resolveThrow({ sections, bounds, start: [], thrower: T, sim: fakeSim({ t: { x: 503, y: 300 } }) });
  assert.equal(o.case, "solco");
  assert.equal(o.pending, true);
  assert.deepEqual(o.options.sort(), ["A", "B"]);
  const chosen = resolveThrow({ sections, bounds, start: [], thrower: T, sim: fakeSim({ t: { x: 503, y: 300 } }), chosenSection: "B" });
  assert.equal(chosen.case, "racconto");
  assert.equal(chosen.sectionId, "B");
  const p = chosen.placements.find((q) => q.id === "t");
  assert.ok(distToPolygonEdge(p.x, p.y, sections[1].poly) > 7, "la biglia viene spostata dentro la Sezione");
});

test("Epilogo: 8 Sezioni sulla metà del foglio, finali in base al punteggio", () => {
  const { sections: ep, half } = epilogueSections(PAPER);
  assert.equal(ep.length, 8);
  assert.ok(Math.abs(half.w - PAPER.w / 2) < 1e-9);
  const ending = Object.fromEntries(ep.map((s, i) => [s.id, i < 4 ? "lieto" : "drammatico"]));
  const pick = pickEnding(ep, [{ x: half.x + 50, y: half.y + 50 }, { x: half.x + 60, y: half.y + 60 }, { x: half.x + 400, y: half.y + 700 }], ending);
  assert.equal(pick.ending, "lieto");
  assert.equal(pickEnding(ep, [], ending).ending, "tragico");
  const tie = pickEnding(ep, [{ x: half.x + 50, y: half.y + 50 }, { x: half.x + 400, y: half.y + 700 }], ending);
  assert.equal(tie.tie, true);
});

test("solitario: posizionamento PNG con ritorno a 1", () => {
  // esempio del manuale: 8 Sezioni, primo PNG nella 5, secondo tira 4 → 9 → Sezione 1
  assert.deepEqual(soloPositions([5, 4], 8), [5, 1]);
  assert.deepEqual(soloPositions([2, 2, 6], 6), [2, 4, 4]);
});
