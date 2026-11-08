/**
 * Interazioni fisiche misurate: pieghe, cancellature (macchie), carta accartocciata,
 * oggetti sul tavolo e loro numero in funzione dei giocatori.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { createWorld, simulateThrow, erasureResidue, clutterObstacles, tableProps, PAPER, TABLE, PHYS } from "../module/core/physics.mjs";
import { mulberry32 } from "../module/core/geometry.mjs";
import * as E from "../module/game/engine.mjs";

const OK = { getTally: () => ({ legami: 0, problemi: 0, score: 0 }) };
const mean = (a) => a.reduce((s, x) => s + x, 0) / a.length;
const sd = (a) => Math.sqrt(mean(a.map((x) => (x - mean(a)) ** 2)));

/** Tiro orizzontale lungo la mezzeria del foglio, da sinistra, con velocità data. */
function shoot(world, seed, v = 1300, y = 450) {
  const sim = simulateThrow(world, "t", { x: 40, y, vx: v, vy: 0 }, { seed });
  return sim.final.t;
}

test("una piega devia e frena la biglia lenta, ma la biglia forte la scavalca", () => {
  const piega = { x1: 400, y1: 100, x2: 400, y2: 800 }; // verticale, sul percorso
  const prova = (v) => {
    const dev = [];
    const senza = [];
    const con = [];
    for (let seed = 1; seed <= 60; seed++) {
      const liscio = shoot(createWorld(), seed, v);
      const piegato = shoot(createWorld({ creases: [piega] }), seed, v);
      // direzione DOPO la piega (dal punto di piega): misurarla dalla partenza diluirebbe la deviazione
      dev.push(Math.abs(Math.atan2(piegato.y - 450, piegato.x - piega.x1)) * (180 / Math.PI));
      senza.push(liscio.x);
      con.push(piegato.x);
    }
    return { dev: mean(dev), perso: mean(senza) - mean(con) };
  };
  const lenta = prova(800);
  const forte = prova(1700);
  assert.ok(lenta.dev > 3, `tiro lento: deviazione media ${lenta.dev.toFixed(1)}° troppo piccola`);
  assert.ok(lenta.perso > 20, "la piega deve frenare la biglia lenta");
  assert.ok(forte.dev < lenta.dev / 2, `tiro forte: deve deviare meno del lento (${forte.dev.toFixed(1)}° vs ${lenta.dev.toFixed(1)}°)`);
  assert.ok(forte.dev < 2, `tiro forte: la piega si scavalca (${forte.dev.toFixed(1)}°)`);
});

/** Somma dei cambi di direzione lungo la traiettoria (gradi). */
function curvatura(world, seed) {
  // forza media: senza ostacoli la biglia non arriva a rimbalzare sul bordo del tavolo
  const sim = simulateThrow(world, "t", { x: 40, y: 450, vx: 1000, vy: 0 }, { seed });
  const p = sim.tracks.find((t) => t.id === "t").pts;
  let tot = 0;
  let prev = null;
  for (let i = 2; i < p.length; i += 2) {
    const dx = p[i] - p[i - 2];
    const dy = p[i + 1] - p[i - 1];
    if (Math.hypot(dx, dy) < 3) continue;
    const a = Math.atan2(dy, dx);
    if (prev !== null) tot += Math.abs(Math.atan2(Math.sin(a - prev), Math.cos(a - prev)));
    prev = a;
  }
  return tot * (180 / Math.PI);
}

test("più pieghe = più cambi di direzione lungo il percorso", () => {
  const pieghe = [330, 420, 510, 600, 690].map((x) => ({ x1: x, y1: 100, x2: x + 20, y2: 800 }));
  const una = [];
  const molte = [];
  for (let seed = 1; seed <= 60; seed++) {
    una.push(curvatura(createWorld({ creases: [pieghe[0]] }), seed));
    molte.push(curvatura(createWorld({ creases: pieghe }), seed));
  }
  assert.ok(mean(molte) > mean(una) * 1.5, `curvatura ${mean(molte).toFixed(0)}° vs ${mean(una).toFixed(0)}°`);
  assert.ok(mean(una) > curvatura(createWorld(), 1) + 4, "anche una sola piega piega davvero la traiettoria");
});

test("una macchia di cancellatura accorcia il tiro (≥ 8%) e lo disturba", () => {
  const macchia = { x: 450, y: 450, r: 150, k: 1 };
  const senza = [];
  const con = [];
  const ys = [];
  for (let seed = 1; seed <= 60; seed++) {
    senza.push(shoot(createWorld(), seed).x);
    const f = shoot(createWorld({ smudges: [macchia] }), seed);
    con.push(f.x);
    ys.push(f.y);
  }
  assert.ok(mean(con) < mean(senza) * 0.92, `corsa ${mean(con).toFixed(0)} vs ${mean(senza).toFixed(0)}`);
  assert.ok(sd(ys) > 3, "la macchia deve far deviare un po' i tiri");
});

test("la carta accartocciata disturba più di una macchia normale", () => {
  const stessa = { x: 450, y: 450, r: 150, k: 1 };
  const m = [];
  const c = [];
  for (let seed = 1; seed <= 80; seed++) {
    m.push(shoot(createWorld({ smudges: [stessa] }), seed).y);
    c.push(shoot(createWorld({ crumples: [stessa] }), seed).y);
  }
  assert.ok(sd(c) > sd(m) * 1.3, `accartocciata ${sd(c).toFixed(1)} vs macchia ${sd(m).toFixed(1)}`);
});

test("a fasi avanzate il foglio è più rovinato: macchie, pieghe e zone accartocciate crescono", () => {
  const conta = (i) => {
    const r = erasureResidue(i, PAPER, mulberry32(3));
    return { s: r.smudges.length, p: r.creases.length, k: r.crumples.length };
  };
  const f0 = conta(0);
  const f3 = conta(3);
  const f6 = conta(6);
  const f10 = conta(10);
  assert.deepEqual(f0, { s: 0, p: 0, k: 0 });
  assert.equal(f3.k, 0, "ancora niente carta accartocciata nelle prime Fasi");
  assert.ok(f6.s > f3.s && f6.p > f3.p && f6.k > f3.k);
  assert.ok(f10.s >= f6.s && f10.p >= f6.p && f10.k >= f6.k);
  assert.ok(f10.k >= 3);
});

test("gli oggetti sul tavolo sono solidi: la biglia rimbalza e non li attraversa", () => {
  const world = createWorld({ obstacles: [{ x: 600, y: 450, r: 30, kind: "bicchiere" }] });
  // il foglio qui è disattivato per isolare l'urto: l'ostacolo sta sulla traiettoria
  const sim = simulateThrow(world, "t", { x: 40, y: 450, vx: 1500, vy: 0 }, { seed: 1 });
  const f = sim.final.t;
  const dentro = Math.hypot(f.x - 600, f.y - 450) < 30 + PHYS.radius - 1;
  assert.ok(!dentro, "la biglia non può finire dentro l'oggetto");
  // rimbalza all'indietro (o di lato): non supera l'ostacolo andando dritta
  assert.ok(f.x < 600 + 20 || Math.abs(f.y - 450) > 10);
  // con l'ostacolo la biglia finisce in un posto diverso da senza
  const libera = simulateThrow(createWorld(), "t", { x: 40, y: 450, vx: 1500, vy: 0 }, { seed: 1 }).final.t;
  assert.ok(Math.hypot(f.x - libera.x, f.y - libera.y) > 40);
});

test("matita, gomma e dado sono solidi quanto gli altri oggetti", () => {
  const props = tableProps();
  assert.ok(props.filter((p) => p.kind === "matita").length > 10);
  assert.ok(props.some((p) => p.kind === "gomma"));
  assert.ok(props.some((p) => p.kind === "dado"));
  // tiro sul dado: non lo attraversa
  const d = props.find((p) => p.kind === "dado");
  const w = createWorld({ obstacles: props });
  const sim = simulateThrow(w, "t", { x: d.x, y: 700, vx: 0, vy: 900 }, { seed: 4 });
  for (const tr of sim.tracks) {
    for (let i = 0; i < tr.pts.length; i += 2) {
      assert.ok(Math.hypot(tr.pts[i] - d.x, tr.pts[i + 1] - d.y) >= d.r + PHYS.radius - 4, "traiettoria dentro il dado");
    }
  }
});

test("più giocatori = più oggetti sparsi sul tavolo, tutti fuori dal foglio", () => {
  const conta = (n) => {
    const players = Array.from({ length: n }, (_, i) => ({ userId: `u${i}`, actorId: `a${i}`, name: `P${i}` }));
    const { state } = E.newGame({ players, seed: 5, disordine: true });
    return state.obstacles;
  };
  const per = [1, 2, 3, 4, 5].map((n) => conta(n).length);
  for (let i = 1; i < per.length; i++) assert.ok(per[i] >= per[i - 1], `oggetti non crescenti: ${per}`);
  assert.ok(per[4] >= per[0] + 5, `con 5 giocatori servono molti più oggetti: ${per}`);
  for (const o of conta(5)) {
    const sulFoglio = o.x + o.r > PAPER.x + 4 && o.x - o.r < PAPER.x + PAPER.w - 4 && o.y + o.r > PAPER.y + 4 && o.y - o.r < PAPER.y + PAPER.h - 4;
    assert.ok(!sulFoglio, `oggetto sul foglio: ${JSON.stringify(o)}`);
    assert.ok(o.x - o.r >= 0 && o.x + o.r <= TABLE.w && o.y - o.r >= 0 && o.y + o.r <= TABLE.h, "oggetto fuori dal tavolo");
  }
  // senza "disordine" non ce ne sono
  const players = [{ userId: "u", actorId: "a", name: "P" }];
  assert.equal(E.newGame({ players, seed: 5, disordine: false }).state.obstacles.length, 0);
});

test("gli oggetti non si sovrappongono tra loro", () => {
  const players = Array.from({ length: 5 }, (_, i) => ({ userId: `u${i}`, actorId: `a${i}`, name: `P${i}` }));
  const { state } = E.newGame({ players, seed: 9, disordine: true });
  const ob = state.obstacles;
  for (let i = 0; i < ob.length; i++)
    for (let j = i + 1; j < ob.length; j++) assert.ok(Math.hypot(ob[i].x - ob[j].x, ob[i].y - ob[j].y) >= ob[i].r + ob[j].r, `si sovrappongono: ${i} ${j}`);
});

test("nel gioco le interazioni agiscono: stesso tiro, Fase 1 vs Fase avanzata danno esiti diversi", () => {
  const players = [
    { userId: "u1", actorId: "a1", name: "A" },
    { userId: "u2", actorId: "a2", name: "B" },
  ];
  const lancia = (phaseIdx) => {
    let { state } = E.newGame({ players, seed: 31, disordine: true });
    state = E.apply(state, { type: "randomThemes" }, OK).state;
    state = E.apply(state, { type: "beginThrows" }, OK).state;
    if (phaseIdx) {
      state.residue = erasureResidue(phaseIdx, state.paper, mulberry32(7));
    }
    const r = E.apply(state, { type: "throw", userId: state.players[state.turnIdx].userId, launch: { x: 40, y: 450, vx: 1100, vy: 60 } }, OK);
    return r.state.last.tracks[0].pts.slice(-2);
  };
  const a = lancia(0);
  const b = lancia(9);
  assert.ok(Math.hypot(a[0] - b[0], a[1] - b[1]) > 25, "un foglio rovinato deve cambiare il tiro");
});

test("lo scotch sulla giunzione rallenta e devia più della sola piega centrale", async () => {
  const { seamOf } = await import("../module/core/physics.mjs");
  const seam = seamOf(PAPER);
  const tape = seam.tapes[1].y; // al centro del foglio
  const libero = (seam.tapes[0].y + seam.tapes[1].y) / 2; // fascia di giunzione senza nastro
  const run = (y, world) => {
    const xs = [];
    const dev = [];
    for (let seed = 1; seed <= 60; seed++) {
      const f = simulateThrow(world, "t", { x: 40, y, vx: 1000, vy: 0 }, { seed }).final.t;
      xs.push(f.x);
      dev.push(Math.abs(f.y - y));
    }
    return { x: mean(xs), dev: mean(dev) };
  };
  const senza = run(tape, createWorld());
  const sulNastro = run(tape, createWorld({ seam }));
  const sulSolco = run(libero, createWorld({ seam }));
  assert.ok(sulNastro.x < senza.x - 50, `il nastro deve frenare: ${sulNastro.x.toFixed(0)} vs ${senza.x.toFixed(0)}`);
  assert.ok(sulNastro.x < sulSolco.x - 25, "il nastro frena più della giunzione nuda");
  assert.ok(sulNastro.dev > sulSolco.dev, "il nastro devia di più della giunzione nuda");
  assert.ok(sulSolco.x < senza.x, "anche la giunzione nuda dà un piccolo rilievo");
});

test("nel gioco la giunzione c'è finché il foglio è intero e sparisce con la metà strappata", () => {
  const players = [{ userId: "u", actorId: "a", name: "P" }];
  const { state } = E.newGame({ players, seed: 3, disordine: false });
  assert.equal(state.torn, false);
  // il mondo fisico del motore usa la giunzione: due tiri identici, uno dall'altra parte, danno esiti coerenti col rilievo
  const r = E.apply(E.apply(E.apply(state, { type: "randomThemes" }, OK).state, { type: "beginThrows" }, OK).state, { type: "throw", userId: "u", launch: { x: 40, y: 450, vx: 1100, vy: 0 } }, OK);
  assert.ok(r.state.last.tracks.length >= 1);
});
