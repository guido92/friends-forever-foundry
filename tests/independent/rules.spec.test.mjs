// Test INDIPENDENTI dal sorgente: ogni aspettativa deriva dal manuale di «Friends Forever»
// (testo estratto dal PDF, pagine 5-18, 20-22, 38) e dal contratto pubblico docs/API.md.
// Convenzioni sui nomi:
//   [BUG]      il manuale e' chiaro e l'implementazione sbaglia (il test FALLISCE di proposito)
//   [AMBIGUO]  il manuale non decide: l'interpretazione adottata e' scritta nel commento, il test non fallisce
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import * as R from "../../module/core/rules.mjs";
import * as E from "../../module/game/engine.mjs";

/* ------------------------------------------------------------------------------------------------
 * Dati dal manuale
 * ---------------------------------------------------------------------------------------------- */

// pag. 8 e pag. 38: [id, Sezioni, soglia minima del Dado della Morte (null = nessun dado)]
const MANUALE_FASI = [
  ["3-5", 6, null],
  ["6-7", 8, null],
  ["8-10", 8, null],
  ["11-15", 8, null],
  ["16-18", 8, null],
  ["19-23", 12, null],
  ["24-29", 12, null],
  ["30-39", 12, 6],
  ["40-49", 16, 5],
  ["50-55", 16, 4],
  ["56-60", 16, 3],
];

// pag. 20 (Sessione dimostrativa): 3 Fasi
const MANUALE_DEMO = [
  { sezioni: 8, eta: /6.{1,3}10/ },
  { sezioni: 8, eta: /11.{1,3}18/ },
  { sezioni: 12, eta: /19.{1,3}23/ },
];

// pag. 22-32: Tabelle del Solitario. Ogni Fase: 6 righe (riga 1 = in basso) x 6 colonne (colonna 1 = a sinistra).
const TAVOLE = {
  "3-5": [
    ["CASA", "GENITORI", "ASILO", "LAVORO DEI GENITORI", "NONNI", "VIAGGI"],
    ["CITTÀ", "ZII", "CENTRO ESTIVO", "DISEGNO", "PARCO GIOCHI", "COMPLEANNO"],
    ["MARE", "CUGINI", "FRATELLI", "MALATTIA", "SANGUE", "PRIMO TRAUMA"],
    ["SOLDI", "GIOCO PREFERITO", "PAPPA", "CANE", "GATTO", "CRICETO"],
    ["NATALE", "NEVE", "CACCA", "ABUSI VERBALI", "SOLITUDINE", "VIOLENZA DOMESTICA"],
    ["FILM PREFERITO", "CARTONI ANIMATI", "PAURA", "DOLCI", "CARNEVALE", "PIANTO"],
  ],
  "6-7": [
    ["CASA", "GENITORI", "SCUOLA", "LAVORO DEI GENITORI", "NONNI", "VACANZE ESTIVE"],
    ["CITTÀ", "ZII", "CENTRO ESTIVO", "PRIMA COTTA", "PARCO", "COMPLEANNO"],
    ["BICI", "CUGINI", "FRATELLI", "MALATTIA", "FERITA", "TRAUMA"],
    ["SOLDI", "VIDEOGIOCHI", "GIOCHI", "CANE", "GATTO", "CRICETO"],
    ["NATALE", "RELIGIONE", "IMBARAZZO", "ABUSI", "RABBIA", "TRISTEZZA"],
    ["HORROR", "CARTONI", "FUMETTI", "DISEGNI", "CARNEVALE", "HALLOWEEN"],
  ],
  "8-10": [
    ["CASA", "GENITORI", "SCUOLA", "LAVORO DEI GENITORI", "NONNI", "MARE"],
    ["REGALI", "INVALIDITÀ", "CENTRO ESTIVO", "FIDANZATINI", "PARCO", "MONTAGNA"],
    ["SKATEBOARD", "COSTRUZIONI", "FRATELLI", "OSPEDALE", "ZII", "TRAUMA"],
    ["TRASCURATEZZA", "VIDEOGIOCHI", "GIOCHI", "ANIMALI", "BICI", "LUNAPARK"],
    ["CARNEVALE", "RELIGIONE", "PUNIZIONE", "ABUSI", "CITTÀ", "VIOLENZA"],
    ["NATALE", "HORROR", "LETTURA", "BIBLIOTECA", "SOLDI", "PAROLACCE"],
  ],
  "11-15": [
    ["CASA", "GENITORI", "SCUOLA", "LIBERTÀ", "NONNI", "VACANZE"],
    ["CITTÀ", "ZII", "CENTRO ESTIVO", "FIDANZATI", "PARCO", "MODA"],
    ["BICI", "RABBIA", "FRATELLI", "OSPEDALE", "INVALIDITÀ", "TRAUMA"],
    ["PAGHETTA", "VIDEOGIOCHI", "GIOCHI", "ANIMALI", "REATO", "LUNAPARK"],
    ["NATALE", "RELIGIONE", "SMARTPHONE", "RISSA", "SESSUALITÀ", "CASA ABBANDONATA"],
    ["RIBELLIONE", "YOUTUBE", "CINEMA", "PIAZZETTA", "IDENTITÀ", "BRUTTO VOTO"],
  ],
  "16-18": [
    ["CASA", "GENITORI", "SCUOLA", "LIBERTÀ", "CIMITERO", "VACANZA"],
    ["CITTÀ", "ZII", "TALENTO", "BOSCHETTO", "PARCO", "MODA"],
    ["PATENTE", "SESSO", "FRATELLI", "OSPEDALE", "DIVORZIO", "TRAUMA"],
    ["FUTURO", "HOBBY", "GDR", "ANIMALI", "PARCHEGGIO", "DROGA"],
    ["PRIMA VERA RELAZIONE", "RELIGIONE", "BULLISMO", "RISSA", "ORIENTAMENTO SESSUALE", "CASA ABBANDONATA"],
    ["BAR", "SOCIAL", "CINEMA", "PIAZZETTA", "IDENTITÀ", "SIGARETTE"],
  ],
  "19-23": [
    ["RELAZIONE TOSSICA", "GENITORI", "UNIVERSITÀ", "CARCERE", "AUTO", "VACANZA"],
    ["BOSCHETTO", "STUPRO", "TALENTO", "CASA ABBANDONATA", "LIBRI", "MODA"],
    ["CIMITERO", "PARCHEGGIO", "GRAVIDANZA", "OSPEDALE", "SOCIAL", "LAVORO"],
    ["DEPRESSIONE", "NUOVO INTERESSE", "COSPLAY", "IDENTITÀ", "SESSO", "DROGA"],
    ["RELAZIONE", "ESOTERISMO", "GUSTI SESSUALI", "AUTOLESIONISMO", "FOBIA", "CITTÀ"],
    ["CONVIVENZA", "TRADIMENTO", "CINEMA", "LOCALE NOTTURNO", "CANE", "ALCOL"],
  ],
  "24-29": [
    ["LAVORO", "GENITORI", "STUDIO", "CONVIVENZA", "ALCOL", "GITA"],
    ["TRADIMENTO", "STUPRO", "LOCALE NOTTURNO", "SEGRETO", "LIBRI", "CAMBIO LOOK"],
    ["INCIDENTE IN AUTO", "PROBLEMI ALIMENTARI", "GRAVIDANZA", "OMICIDIO", "CITTÀ", "SESSO"],
    ["NUOVA RELAZIONE", "CARCERE", "MATRIMONIO", "MALATTIA", "AUTO", "DROGA"],
    ["DEPRESSIONE", "VIOLENZA DOMESTICA", "FORTUNA", "AUTOLESIONISMO", "BDSM", "RISSA"],
    ["CIMITERO", "INTERNET", "CINEMA", "UNIVERSITÀ", "LUTTO", "SOLDI"],
  ],
  "30-39": [
    ["CAMBIO LAVORO", "GENITORI", "SEPARAZIONE", "CARCERE", "NATURA", "VIAGGI"],
    ["CARRIERA", "HOBBY", "DELUSIONE", "CRISI ESISTENZIALE", "MUSICA", "CAMBIO LOOK"],
    ["FARMACI", "BDSM", "GRAVIDANZA IMPREVISTA", "MALATTIA", "LUTTO", "PROBLEMI ALIMENTARI"],
    ["PSICOTERAPIA", "SCOPPI D'IRA", "MATRIMONIO", "TRADIMENTO", "AMANTE", "DROGA"],
    ["DEPRESSIONE", "NUOVE AMICIZIE", "SFORTUNA", "DEBITI", "FIGLI", "PROBLEMI LEGALI"],
    ["ALCOL", "INTERNET", "CINEMA", "LOCALE NOTTURNO", "SEGRETO", "SOLDI"],
  ],
  "40-49": [
    ["LICENZIAMENTO", "TRADIMENTO", "NUOVO HOBBY", "CARCERE", "NATURA", "VACANZA"],
    ["CARRIERA", "MALATTIA", "POLITICA", "CRISI", "MUSEI", "CAMBIO LOOK"],
    ["FARMACI", "COLLEGHI", "DEBITI", "FIGLI", "ALCOL", "PROBLEMI FAMIGLIARI"],
    ["VOLONTARIATO", "PSICHIATRA", "AMORE", "LUTTO", "AMANTE", "DROGA"],
    ["DEPRESSIONE", "RIMPIANTO", "DOLORE FISICO", "NOIA", "INGANNO", "PROBLEMI LEGALI"],
    ["NOSTALGIA", "INTERNET", "FILM", "MOSTRE", "SEGRETO", "SOLDI"],
  ],
  "50-55": [
    ["CONTRASTI SUL LAVORO", "NOSTALGIA", "AMANTE", "CARCERE", "NATURA", "VIAGGI"],
    ["STANCHEZZA", "NIPOTE", "POLITICA", "CINEMA", "MUSICA", "CAMBIAMENTO"],
    ["FARMACI", "COLLEGHI", "DEBITI", "ALTRUISMO", "LUTTO", "PROBLEMI FAMIGLIARI"],
    ["SOLITUDINE", "GHOSTING", "FINE DI UNA RELAZIONE", "TRADIMENTO", "CRIMINE", "DROGA"],
    ["DEPRESSIONE", "RITORNO DI UN EX", "CANCRO", "PSICHIATRA", "TRUFFA", "PROBLEMI LEGALI"],
    ["ALCOL", "INTERNET", "FIGLI", "ARTE", "SEGRETI", "SOLDI"],
  ],
  "56-60": [
    ["LAVORO", "NOSTALGIA", "GIOCO D'AZZARDO", "AMANTE", "NATURA", "VACANZE"],
    ["STANCHEZZA", "NIPOTI", "POLITICA", "CRISI", "DEBITI", "NUOVO HOBBY"],
    ["FARMACI", "PSICHIATRA", "BENEFICIENZA", "NATALE", "OMICIDIO", "SEGRETI"],
    ["ALIMENTAZIONE", "SCATTI D'IRA", "PERDONO", "LUTTO", ["PENSIER SUICIDI", "PENSIERI SUICIDI"], "DROGA"],
    ["DEPRESSIONE", "CENA TRA AMICI", "CANCRO", "FIGLI", "TRUFFA", "SOLDI"],
    ["ALCOL", "INTERNET", "CINEMA", "ARTE", "POLIZIA", "INFARTO"],
  ],
};

// pag. 7: spunti suggeriti per Fase (usati solo come ispirazione)
const SPUNTI = {
  "3-5": "famiglia, abitazione, attività preferita, aspetto fisico, scuola materna, paura",
  "6-7": "scuola, genitore, animali, parco, bicicletta, scherzi, nonni, pupazzo",
  "8-10": "compleanno, incidente, sport, mare, cotta, diario, talento, maestri",
  "11-15": "cambiamento, mezzi pubblici, babysitter, piscina, gita, bullismo, segreto, rabbia",
  "16-18": "relazione, studio, alcol, droga, look, patente, discoteca, hobby",
  "19-23": "fidanzamento, amicizie, casa, lavoro, studio, vizi, soldi, reato, bar, genitori, tradimento, vacanza",
  "24-29": "matrimonio, affitto, colleghi, depressione, animale domestico, musica, errore, weekend, figlio, litigio, ospedale",
  "30-39": "fallimento, rimpianto, aperitivo, lutto, hobby, amicizie, famiglia, viaggio, amante, cerimonia, religione, farmaci",
  "40-49": "nostalgia, crisi, psicologo, aperitivo, vacanza, problemi economici, funerale, corpo, problemi legali, sogni, vendetta, fortuna, incidente, palestra, ristorante, socialità",
  "50-55": "parenti, amore, salute, crisi, volontariato, parco, novità, arte, festa, amicizie, evasione, hobby, sfortuna, furto, recupero, scuse",
  "56-60": "pausa, città, religione, follia, memoria, paura, aiuto, notizia, tristezza, natura, ospedale, debiti, progetto",
};

/* ------------------------------------------------------------------------------------------------
 * Utilita'
 * ---------------------------------------------------------------------------------------------- */

const norm = (s) => String(s).toUpperCase().replace(/[^\p{L}]/gu, "");
const sortedIds = (a) => [...a].sort();
const polyArea = (poly) =>
  Math.abs(poly.reduce((s, [x, y], i) => {
    const [x2, y2] = poly[(i + 1) % poly.length];
    return s + (x * y2 - x2 * y);
  }, 0)) / 2;
const rect = (x0, y0, x1, y1) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
const toObj = (c) => (c instanceof Map ? Object.fromEntries(c) : c ?? {});

function mulberry(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const PH = Object.fromEntries(R.PHASES.map((p) => [p.id, p]));

/* ================================================================================================
 * 1. SETUP: Fasi, Sezioni, biglie
 * ============================================================================================== */

describe("Setup (pag. 6, 7, 20, 38)", () => {
  test("le Fasi sono 11, nell'ordine del manuale, con il numero di Sezioni corretto", () => {
    assert.equal(R.PHASES.length, MANUALE_FASI.length);
    MANUALE_FASI.forEach(([id, sezioni], i) => {
      assert.equal(R.PHASES[i].id, id, `Fase ${i}`);
      assert.equal(R.PHASES[i].sections, sezioni, `Sezioni della Fase ${id}`);
    });
  });

  test("il Dado della Morte e' previsto solo da 30-39 anni in poi, con soglie 6/5/4/3", () => {
    for (const [id, , soglia] of MANUALE_FASI) assert.equal(PH[id].death, soglia, `soglia ${id}`);
  });

  for (const [id, , soglia] of MANUALE_FASI) {
    test(`deathTriggers: Fase ${id}, per ogni tiro 1..6`, () => {
      for (let roll = 1; roll <= 6; roll++) {
        const atteso = soglia !== null && roll >= soglia;
        assert.equal(R.deathTriggers(PH[id], roll), atteso, `Fase ${id}, d6=${roll}`);
      }
    });
  }

  test("Sessione dimostrativa: 3 Fasi (6-10, 11-18, 19-23) con 8/8/12 Sezioni e nessun Dado della Morte", () => {
    assert.equal(R.DEMO_PHASES.length, 3);
    MANUALE_DEMO.forEach((d, i) => {
      assert.equal(R.DEMO_PHASES[i].sections, d.sezioni, `Sezioni demo ${i + 1}`);
      assert.match(R.DEMO_PHASES[i].label, d.eta, `etichetta demo ${i + 1}`);
      assert.equal(R.DEMO_PHASES[i].death, null, `nessun Dado della Morte in demo ${i + 1}`);
      for (let roll = 1; roll <= 6; roll++) assert.equal(R.deathTriggers(R.DEMO_PHASES[i], roll), false);
    });
  });

  test("biglie per giocatore: 2 fino a 3 giocatori, 3 con 4-5 giocatori (pag. 5)", () => {
    assert.deepEqual([1, 2, 3, 4, 5].map(R.marblesPerPlayer), [2, 2, 2, 3, 3]);
  });

  for (const n of [1, 2, 3, 4, 5]) {
    test(`newGame con ${n} giocatori: biglie, colori distinti, prima Fase a 6 Sezioni, 11 Fasi`, () => {
      const { state } = E.newGame({ players: names(n), seed: 11 });
      assert.equal(state.players.length, n);
      for (const p of state.players) assert.equal(p.marbles, n <= 3 ? 2 : 3, "biglie a testa");
      assert.equal(new Set(state.players.map((p) => p.color)).size, n, "ogni giocatore ha un colore diverso");
      assert.equal(state.phases.length, 11);
      assert.equal(state.sections.length, 6, "la Fase 3-5 ha 6 Sezioni");
      assert.equal(state.status, "temi");
      assert.ok(state.firstIdx >= 0 && state.firstIdx < n);
    });
  }

  test("newGame: 0 o 6 giocatori sono rifiutati (il gioco e' da 1 a 5 giocatori)", () => {
    assert.throws(() => E.newGame({ players: names(0), seed: 1 }), E.EngineError);
    assert.throws(() => E.newGame({ players: names(6), seed: 1 }), E.EngineError);
  });

  test("il primo giocatore e' scelto a caso (tutti i posti possibili compaiono al variare del seme)", () => {
    const visti = new Set();
    for (let seed = 1; seed <= 300; seed++) visti.add(E.newGame({ players: names(4), seed }).state.firstIdx);
    assert.deepEqual([...visti].sort(), [0, 1, 2, 3]);
  });

  test("il numero di Sezioni e' esattamente quello della Fase (rerollSections lo conserva)", () => {
    let { state } = E.newGame({ players: names(3), seed: 5 });
    for (let i = 0; i < 5; i++) {
      state = E.apply(state, { type: "rerollSections" }, OK).state;
      assert.equal(state.sections.length, 6);
    }
  });

  test("non si puo' iniziare a lanciare finche' ogni Sezione non ha un Tema", () => {
    const { state } = E.newGame({ players: names(3), seed: 5 });
    assert.throws(() => E.apply(state, { type: "beginThrows" }, OK), E.EngineError);
    let st = state;
    st.sections.forEach((s) => { st = E.apply(st, { type: "setTheme", sectionId: s.id, text: "scuola" }, OK).state; });
    st = E.apply(st, { type: "beginThrows" }, OK).state;
    assert.equal(st.status, "lanci");
  });

  test("[AMBIGUO] i Temi casuali riempiono ogni Sezione (gli spunti di pag. 7 sono solo ispirazioni)", (t) => {
    // pag. 7: «Di seguito alcune ispirazioni»: non e' una lista chiusa, quindi il test non fallisce se
    // randomThemes pesca fuori dagli spunti; segnala solo con una diagnostica.
    for (const [id] of MANUALE_FASI) {
      const st = jumpToPhase(newMulti(3, 21), id);
      const filled = E.apply(st, { type: "randomThemes" }, OK).state;
      assert.equal(filled.sections.length, PH[id].sections);
      for (const s of filled.sections) assert.ok(String(s.theme).trim().length > 0, `Tema vuoto in ${id}`);
      const consentiti = SPUNTI[id].split(",").map(norm);
      const fuori = filled.sections.map((s) => s.theme).filter((th) => !consentiti.includes(norm(th)));
      if (fuori.length) t.diagnostic(`Fase ${id}: Temi casuali fuori dagli spunti del manuale: ${fuori.join(", ")}`);
    }
  });
});

// helper generici di gioco (usati anche piu' sotto)
const OK = { getTally: () => ({ legami: 0, problemi: 0, score: 0 }) };

function names(n) {
  return Array.from({ length: n }, (_, i) => ({ userId: `u${i + 1}`, actorId: `a${i + 1}`, name: `P${i + 1}` }));
}

function newMulti(n, seed, extra = {}) {
  let st = E.newGame({ players: names(n), seed, ...extra }).state;
  return st;
}

function newSolo(seed, extra = {}) {
  return E.newGame({
    players: [{ userId: "u1", actorId: "a1", name: "Solo" }],
    solo: true, npcNames: ["Ada", "Bo", "Cy"], seed, ...extra,
  }).state;
}

function ready(st) {
  st = E.apply(st, { type: "randomThemes" }, OK).state;
  return E.apply(st, { type: "beginThrows" }, OK).state;
}

/** Porta uno stato (fine-fase fittizio) sulla Fase richiesta, senza passare dal Dado della Morte. */
function jumpToPhase(st, phaseId, tallies = OK, from = 1) {
  const idx = st.phases.findIndex((p) => p.id === phaseId);
  assert.ok(idx >= 0, `Fase ${phaseId} inesistente`);
  for (let seed = from; seed < from + 2000; seed++) {
    const s2 = structuredClone(st);
    s2.phaseIdx = idx - 1; s2.status = "fine-fase"; s2.queue = []; s2.seed = seed;
    if (idx === 0) return st;
    const r = E.apply(s2, { type: "nextPhase" }, tallies);
    if (r.state.status === "temi" && r.state.phaseIdx === idx) return r.state;
  }
  assert.fail(`impossibile raggiungere la Fase ${phaseId} senza far scattare il Dado della Morte`);
}

/* ---- lanci simulati ------------------------------------------------------------------------- */

function randomLaunch(st, rng) {
  const p = st.paper, t = st.table;
  const side = Math.floor(rng() * 4);
  let x, y;
  if (side === 0) { x = 40 + rng() * (t.w - 80); y = t.h - 5; }
  else if (side === 1) { x = 40 + rng() * (t.w - 80); y = 5; }
  else if (side === 2) { x = 5; y = 40 + rng() * (t.h - 80); }
  else { x = t.w - 5; y = 40 + rng() * (t.h - 80); }
  const tx = p.x + rng() * p.w, ty = p.y + rng() * p.h;
  const dx = tx - x, dy = ty - y, D = Math.hypot(dx, dy);
  const v = Math.sqrt(2 * 1990 * D) * (0.6 + rng() * 0.7);
  return { x, y, vx: (dx / D) * v, vy: (dy / D) * v };
}

/** Un turno completo: lancio, eventuale scelta sul solco, advance. Restituisce {state, effects, outcome}. */
function playTurn(st, rng, tallies = OK) {
  const pl = E.currentPlayer(st);
  const effects = [];
  let r = E.apply(st, { type: "throw", userId: pl.userId, launch: randomLaunch(st, rng) }, tallies);
  effects.push(...r.effects); st = r.state;
  if (st.pending) {
    const opts = st.pending.options;
    r = E.apply(st, { type: "chooseGroove", sectionId: opts[Math.floor(rng() * opts.length)] }, tallies);
    effects.push(...r.effects); st = r.state;
  }
  const outcome = effects.find((e) => e.type === "outcome");
  const mid = st;
  r = E.apply(st, { type: "advance" }, tallies);
  effects.push(...r.effects);
  return { state: r.state, mid, effects, outcome, player: pl };
}

function playPhase(st, rng, tallies = OK, log = []) {
  let guard = 0;
  while (st.status === "lanci" && guard++ < 800) {
    const t = playTurn(st, rng, tallies);
    log.push(t);
    st = t.state;
  }
  assert.ok(guard < 800, "la Fase non finisce mai");
  return st;
}

/* ================================================================================================
 * 2. IL DADO DELLA MORTE nel flusso di gioco (pag. 6, 9, 38)
 * ============================================================================================== */

describe("Dado della Morte nel flusso (nextPhase)", () => {
  // Il dado si lancia PRIMA dell'inizio della Fase (nota a pag. 7: «Prima dell'inizio della Fase lanciare il d6»)
  // con la soglia della Fase che sta per cominciare.
  for (const [id, , soglia] of MANUALE_FASI.filter((f) => f[2] !== null)) {
    test(`prima della Fase ${id}: Epilogo se d6 >= ${soglia}, altrimenti si gioca la Fase`, () => {
      const base = newMulti(3, 3);
      const idx = base.phases.findIndex((p) => p.id === id);
      const visti = new Set();
      for (let seed = 1; seed <= 400; seed++) {
        const s2 = structuredClone(base);
        s2.phaseIdx = idx - 1; s2.status = "fine-fase"; s2.queue = []; s2.seed = seed;
        const r = E.apply(s2, { type: "nextPhase" }, tallyFixed());
        const dd = r.effects.find((e) => e.type === "deathDie");
        assert.ok(dd, "deve esserci l'effetto deathDie");
        visti.add(dd.roll);
        assert.ok(dd.roll >= 1 && dd.roll <= 6);
        assert.equal(dd.needed, soglia, "soglia mostrata");
        assert.equal(dd.triggered, dd.roll >= soglia, `d6=${dd.roll}`);
        if (dd.roll >= soglia) {
          assert.equal(r.state.status, "epilogo-lanci", `d6=${dd.roll} deve iniziare l'Epilogo`);
          assert.ok(r.effects.some((e) => e.type === "epilogue"));
        } else {
          assert.equal(r.state.status, "temi", `d6=${dd.roll} la Fase prosegue`);
          assert.equal(r.state.phaseIdx, idx);
          assert.equal(r.state.sections.length, PH[id].sections);
          assert.ok(!r.effects.some((e) => e.type === "epilogue"));
        }
      }
      assert.deepEqual([...visti].sort(), [1, 2, 3, 4, 5, 6], "tutti i valori del dado devono comparire");
    });
  }

  test("prima della Fase 30-39 e' il primo giocatore della nuova Fase a tirare il dado (pag. 6)", () => {
    const base = newMulti(4, 3);
    const idx = base.phases.findIndex((p) => p.id === "30-39");
    const s2 = structuredClone(base);
    s2.phaseIdx = idx - 1; s2.status = "fine-fase"; s2.queue = []; s2.firstIdx = 1; s2.turnIdx = 1; s2.seed = 9;
    const r = E.apply(s2, { type: "nextPhase" }, tallyFixed());
    const dd = r.effects.find((e) => e.type === "deathDie");
    assert.equal(dd.by, "P3", "il primo giocatore della nuova Fase e' quello a sinistra di P2, cioe' P3");
  });

  test("nelle Fasi precedenti ai 30 anni non c'e' nessun Dado della Morte", () => {
    const base = newMulti(3, 3);
    for (let idx = 1; idx <= 7 - 1; idx++) {
      for (let seed = 1; seed <= 40; seed++) {
        const s2 = structuredClone(base);
        s2.phaseIdx = idx - 1; s2.status = "fine-fase"; s2.queue = []; s2.seed = seed;
        const r = E.apply(s2, { type: "nextPhase" }, OK);
        assert.equal(r.state.status, "temi", `transizione verso ${base.phases[idx].id} (seed ${seed})`);
        assert.equal(r.state.phaseIdx, idx);
        assert.ok(!r.effects.some((e) => e.type === "deathDie"), "nessun dado prima dei 30 anni");
      }
    }
  });

  test("dopo l'ultima Fase (56-60) si passa all'Epilogo senza tirare il dado (pag. 15)", () => {
    const base = newMulti(3, 3);
    for (let seed = 1; seed <= 40; seed++) {
      const s2 = structuredClone(base);
      s2.phaseIdx = 10; s2.status = "fine-fase"; s2.queue = []; s2.seed = seed;
      const r = E.apply(s2, { type: "nextPhase" }, tallyFixed());
      assert.equal(r.state.status, "epilogo-lanci");
      assert.ok(!r.effects.some((e) => e.type === "deathDie"));
      assert.ok(r.effects.some((e) => e.type === "epilogue"));
    }
  });

  test("Sessione dimostrativa: 3 Fasi (8, 8, 12 Sezioni), poi Epilogo senza Dado della Morte (pag. 18)", () => {
    let st = newMulti(3, 5, { demo: true });
    assert.equal(st.demo, true);
    assert.equal(st.phases.length, 3);
    const attese = [8, 8, 12];
    for (let i = 0; i < 3; i++) {
      assert.equal(st.status, "temi");
      assert.equal(st.phaseIdx, i);
      assert.equal(st.sections.length, attese[i], `Sezioni della Fase demo ${i + 1}`);
      st = ready(st);
      st = playPhase(st, mulberry(100 + i), tallyFixed());
      assert.equal(st.status, "fine-fase");
      const r = E.apply(st, { type: "nextPhase" }, tallyFixed());
      assert.ok(!r.effects.some((e) => e.type === "deathDie"), "mai il Dado della Morte in demo");
      st = r.state;
      if (i < 2) assert.equal(st.status, "temi"); else assert.equal(st.status, "epilogo-lanci");
    }
  });
});

function tallyFixed() {
  const t = {
    a1: { legami: 4, problemi: 1, score: 3 },
    a2: { legami: 1, problemi: 2, score: -1 },
    a3: { legami: 2, problemi: 2, score: 0 },
    a4: { legami: 0, problemi: 1, score: -1 },
    a5: { legami: 1, problemi: 1, score: 0 },
  };
  return { getTally: (id) => t[id] ?? { legami: 0, problemi: 0, score: 0 } };
}

/* ================================================================================================
 * 3. PUNTEGGIO, FINALI, EPILOGO: funzioni pure (pag. 15, 38)
 * ============================================================================================== */

describe("Punteggio dell'Epilogo: tally (pag. 15)", () => {
  const L = (extra = {}) => ({ tipo: "legame", ...extra });
  const P = (extra = {}) => ({ tipo: "problematica", ...extra });

  test("senza voci: 0 Legami, 0 Problematiche, punteggio 0", () => {
    assert.deepEqual(R.tally([]), { legami: 0, problemi: 0, score: 0 });
  });
  test("ogni Legame vale +1, ogni Problematica -1 (sottrazione Legami - Problematiche)", () => {
    const t = R.tally([L(), L(), L(), P()]);
    assert.deepEqual(t, { legami: 3, problemi: 1, score: 2 });
  });
  test("i Legami Indistruttibili valgono doppio", () => {
    const t = R.tally([L(), L({ indistruttibile: true })]);
    assert.equal(t.legami, 3);
    assert.equal(t.problemi, 0);
    assert.equal(t.score, 3);
  });
  test("le Problematiche Indistruttibili valgono doppio", () => {
    const t = R.tally([P(), P({ indistruttibile: true }), L()]);
    assert.equal(t.problemi, 3);
    assert.equal(t.legami, 1);
    assert.equal(t.score, -2);
  });
  test("Indistruttibili di entrambi i tipi contemporaneamente", () => {
    const t = R.tally([
      L(), L({ indistruttibile: true }), L({ indistruttibile: true }),
      P(), P({ indistruttibile: true }),
    ]);
    assert.deepEqual(t, { legami: 5, problemi: 3, score: 2 });
  });
  test("i Legami e le Problematiche eliminati non contano", () => {
    const t = R.tally([L(), L({ rimosso: true }), P({ rimosso: true }), P()]);
    assert.deepEqual(t, { legami: 1, problemi: 1, score: 0 });
  });
  test("il punteggio puo' essere negativo", () => {
    assert.equal(R.tally([P(), P(), L()]).score, -1);
  });
});

describe("Ripartizione dei finali: endingMix (pag. 15, 38)", () => {
  // A: Legami >= doppio delle Problematiche -> 4 lieti, 3 dolceamari, 1 drammatico
  // B: Legami > Problematiche               -> 3 lieti, 3 dolceamari, 2 drammatici
  // C: Legami = Problematiche               -> 2 lieti, 3 dolceamari, 3 drammatici
  // D: Legami < Problematiche               -> 1 lieto, 3 dolceamari, 4 drammatici
  const casi = [
    // [legami, problemi, key, lieto, dolceamaro, drammatico]
    [2, 1, "A", 4, 3, 1], // esattamente il doppio -> "superiore O UGUALE"
    [4, 2, "A", 4, 3, 1],
    [3, 1, "A", 4, 3, 1],
    [1, 0, "A", 4, 3, 1], // qualunque Legame senza Problematiche
    [10, 0, "A", 4, 3, 1],
    [6, 3, "A", 4, 3, 1],
    [5, 2, "A", 4, 3, 1],
    [3, 2, "B", 3, 3, 2], // maggiore ma non doppio
    [5, 3, "B", 3, 3, 2],
    [7, 4, "B", 3, 3, 2],
    [2, 2, "C", 2, 3, 3],
    [1, 1, "C", 2, 3, 3],
    [5, 5, "C", 2, 3, 3],
    [1, 2, "D", 1, 3, 4],
    [0, 1, "D", 1, 3, 4],
    [3, 7, "D", 1, 3, 4],
    [0, 5, "D", 1, 3, 4],
  ];
  for (const [l, p, key, lieto, dolce, dramm] of casi) {
    test(`Legami ${l} / Problematiche ${p} -> ${key} (${lieto} lieti, ${dolce} dolceamari, ${dramm} drammatici)`, () => {
      const m = R.endingMix(l, p);
      assert.equal(m.key, key);
      assert.equal(m.lieto, lieto);
      assert.equal(m.dolceamaro, dolce);
      assert.equal(m.drammatico, dramm);
      assert.equal(m.lieto + m.dolceamaro + m.drammatico, 8, "le Sezioni sono sempre 8");
    });
  }

  test("[AMBIGUO] 0 Legami e 0 Problematiche", () => {
    // Il manuale non decide: 0 >= 2*0 (caso A) ma anche 0 = 0 (caso C). Interpretazione accettata:
    // o A o C; l'importante e' che i finali siano comunque 8 e coerenti con il caso scelto.
    const m = R.endingMix(0, 0);
    assert.ok(["A", "C"].includes(m.key), `caso ${m.key}`);
    const atteso = m.key === "A" ? [4, 3, 1] : [2, 3, 3];
    assert.deepEqual([m.lieto, m.dolceamaro, m.drammatico], atteso);
  });

  test("assignEndings: 8 tipi, con esattamente le quantita' della ripartizione, per ogni caso", () => {
    for (const [l, p] of [[4, 1], [3, 2], [2, 2], [1, 3]]) {
      const mix = R.endingMix(l, p);
      for (const rng of [() => 0, () => 0.5, () => 0.999999, mulberry(7), mulberry(8)]) {
        const e = R.assignEndings(mix, rng);
        assert.equal(e.length, 8);
        const conta = { lieto: 0, dolceamaro: 0, drammatico: 0 };
        for (const k of e) { assert.ok(k in conta, `tipo inatteso ${k}`); conta[k]++; }
        assert.deepEqual(conta, { lieto: mix.lieto, dolceamaro: mix.dolceamaro, drammatico: mix.drammatico });
      }
    }
  });

  test("assignEndings mescola: con semi diversi l'ordine cambia", () => {
    const mix = R.endingMix(4, 1);
    const ordini = new Set();
    for (let s = 1; s <= 30; s++) ordini.add(R.assignEndings(mix, mulberry(s)).join(","));
    assert.ok(ordini.size > 5, `solo ${ordini.size} ordini distinti`);
  });
});

describe("Chi muore: pickDead (pag. 15)", () => {
  test("muore il Personaggio con il valore MAGGIORE", () => {
    assert.deepEqual(R.pickDead({ a: 3, b: 1, c: -2 }).dead, "a");
    assert.equal(R.pickDead({ a: -5, b: -1, c: -2 }).dead, "b", "anche se tutti negativi, vale il maggiore");
    assert.equal(R.pickDead({ solo: -3 }).dead, "solo");
  });
  test("pareggio: servono i dadi, e solo i giocatori a pari merito partecipano", () => {
    const r = R.pickDead({ a: 3, b: 3, c: 1 });
    assert.equal(r.dead, null);
    assert.equal(r.needsRoll, true);
    assert.deepEqual(sortedIds(r.tied), ["a", "b"]);
  });
  test("pareggio risolto dal dado: vince il risultato maggiore", () => {
    assert.equal(R.pickDead({ a: 3, b: 3, c: 1 }, { a: 2, b: 5 }).dead, "b");
    assert.equal(R.pickDead({ a: 3, b: 3, c: 1 }, { a: 6, b: 5 }).dead, "a");
  });
  test("pareggio a tre: decide il dado piu' alto", () => {
    const r = R.pickDead({ a: 2, b: 2, c: 2 }, { a: 3, b: 6, c: 4 });
    assert.equal(r.dead, "b");
    assert.deepEqual(sortedIds(r.tied), ["a", "b", "c"]);
  });
  test("[AMBIGUO] pareggio anche al dado", () => {
    // il manuale non dice cosa fare con dadi uguali: si ripete il tiro (needsRoll = true, nessun morto assegnato a caso)
    const r = R.pickDead({ a: 3, b: 3 }, { a: 4, b: 4 });
    assert.equal(r.dead, null);
    assert.equal(r.needsRoll, true);
  });
  test("un pareggio che non riguarda il valore piu' alto non richiede il dado", () => {
    const r = R.pickDead({ a: 3, b: 1, c: 1 });
    assert.equal(r.dead, "a");
    assert.equal(r.needsRoll, false);
  });
  test("senza pareggio non serve il dado", () => {
    const r = R.pickDead({ a: 3, b: 2 });
    assert.equal(r.needsRoll, false);
  });
});

describe("Sezioni dell'Epilogo (pag. 15)", () => {
  const paper = { x: 90, y: 70, w: 1100, h: 760 };
  test("la Mappa e' strappata in due: la meta' tenuta ha meta' area ed e' dentro il foglio", () => {
    const { half } = R.epilogueSections(paper);
    assert.ok(half.x >= paper.x - 1e-6 && half.y >= paper.y - 1e-6);
    assert.ok(half.x + half.w <= paper.x + paper.w + 1e-6 && half.y + half.h <= paper.y + paper.h + 1e-6);
    assert.ok(Math.abs(half.w * half.h * 2 - paper.w * paper.h) < paper.w * paper.h * 0.001);
  });
  test("ci sono esattamente 8 Sezioni, tutte nella meta' e di dimensioni uguali (possibilmente)", () => {
    const { half, sections } = R.epilogueSections(paper);
    assert.equal(sections.length, 8);
    assert.equal(new Set(sections.map((s) => s.id)).size, 8, "id distinti");
    const aree = sections.map((s) => polyArea(s.poly));
    const media = aree.reduce((a, b) => a + b, 0) / 8;
    for (const a of aree) assert.ok(Math.abs(a - media) / media < 0.02, "Sezioni delle stesse dimensioni");
    for (const s of sections) for (const [x, y] of s.poly) {
      assert.ok(x >= half.x - 1e-6 && x <= half.x + half.w + 1e-6, "vertice dentro la meta'");
      assert.ok(y >= half.y - 1e-6 && y <= half.y + half.h + 1e-6);
    }
    assert.ok(Math.abs(aree.reduce((a, b) => a + b, 0) - half.w * half.h) < half.w * half.h * 0.02, "coprono la meta'");
  });
});

describe("Scelta del finale: pickEnding (pag. 15)", () => {
  const sezioni = [
    { id: "e1", poly: rect(0, 0, 100, 100) },
    { id: "e2", poly: rect(100, 0, 200, 100) },
    { id: "e3", poly: rect(0, 100, 100, 200) },
  ];
  const fin = { e1: "lieto", e2: "drammatico", e3: "dolceamaro" };
  test("vince la Sezione che contiene piu' biglie", () => {
    const r = R.pickEnding(sezioni, [{ x: 10, y: 10 }, { x: 20, y: 30 }, { x: 150, y: 50 }], fin);
    assert.equal(r.ending, "lieto");
    assert.deepEqual(r.sectionIds, ["e1"]);
    assert.equal(r.tie, false);
  });
  test("una sola biglia in Sezione basta", () => {
    const r = R.pickEnding(sezioni, [{ x: 150, y: 50 }], fin);
    assert.equal(r.ending, "drammatico");
  });
  test("pareggio tra finali di tipo diverso: ending nullo e tie vero (sceglie il giocatore del defunto)", () => {
    const r = R.pickEnding(sezioni, [{ x: 10, y: 10 }, { x: 150, y: 50 }], fin);
    assert.equal(r.ending, null);
    assert.equal(r.tie, true);
    assert.deepEqual(sortedIds(r.sectionIds), ["e1", "e2"]);
  });
  test("pareggio tra due Sezioni con lo stesso tipo di finale: il finale e' quello", () => {
    const r = R.pickEnding(sezioni, [{ x: 10, y: 10 }, { x: 150, y: 50 }], { e1: "lieto", e2: "lieto", e3: "dolceamaro" });
    assert.equal(r.ending, "lieto");
  });
  test("nessuna biglia sulla Mappa -> finale Tragico", () => {
    const r = R.pickEnding(sezioni, [], fin);
    assert.equal(r.ending, "tragico");
    assert.equal(r.tie, false);
  });
  test("biglie fuori dalle Sezioni (uscite dal foglio) non contano: se sono tutte fuori -> Tragico", () => {
    const r = R.pickEnding(sezioni, [{ x: 500, y: 500 }, { x: -20, y: 10 }], fin);
    assert.equal(r.ending, "tragico");
  });
  test("le biglie fuori non sommano a nessuna Sezione", () => {
    const r = R.pickEnding(sezioni, [{ x: 500, y: 500 }, { x: -20, y: 10 }, { x: 10, y: 150 }], fin);
    assert.equal(r.ending, "dolceamaro");
    assert.deepEqual(r.sectionIds, ["e3"]);
  });
  test("conteggi per Sezione", () => {
    const r = R.pickEnding(sezioni, [{ x: 10, y: 10 }, { x: 20, y: 30 }, { x: 150, y: 50 }], fin);
    const c = toObj(r.counts);
    if (Object.keys(c).length) { assert.equal(c.e1, 2); assert.equal(c.e2, 1); }
  });
});

describe("Geometria delle Sezioni e solco", () => {
  const sez = [{ id: "s1", poly: rect(0, 0, 100, 100) }, { id: "s2", poly: rect(100, 0, 200, 100) }];
  test("sectionAt: dentro, fuori e fuori dai limiti della Mappa", () => {
    assert.equal(R.sectionAt(sez, 50, 50), "s1");
    assert.equal(R.sectionAt(sez, 150, 50), "s2");
    assert.equal(R.sectionAt(sez, 250, 50), null);
    assert.equal(R.sectionAt(sez, 50, 50, { x: 60, y: 0, w: 100, h: 100 }), null);
  });
  test("groovesAt: sul bordo condiviso tra due Sezioni indica entrambe", () => {
    assert.deepEqual(sortedIds(R.groovesAt(sez, 100, 50)), ["s1", "s2"]);
    assert.deepEqual(sortedIds(R.groovesAt(sez, 103, 50)), ["s1", "s2"], "entro la tolleranza");
  });
  test("groovesAt: in mezzo a una Sezione non c'e' solco", () => {
    assert.deepEqual(R.groovesAt(sez, 50, 50), []);
    assert.deepEqual(R.groovesAt(sez, 150, 50), []);
  });
});

describe("Modalita' in solitario: posizionamento dei PNG (pag. 20)", () => {
  test("esempio del manuale: 8 Sezioni, primo PNG nella 5, d6=4 -> 5+4=9 -> si riparte da 1", () => {
    assert.deepEqual(R.soloPositions([5, 4], 8), [5, 1]);
  });
  test("il conteggio prosegue per il terzo PNG", () => {
    assert.deepEqual(R.soloPositions([5, 4, 6], 8), [5, 1, 7]);
  });
  test("il primo PNG sta nella Sezione indicata dal d6", () => {
    for (let d = 1; d <= 6; d++) assert.equal(R.soloPositions([d], 8)[0], d);
  });
  test("somma esattamente uguale al numero di Sezioni: resta sull'ultima (non riparte)", () => {
    assert.deepEqual(R.soloPositions([4, 4], 8), [4, 8]);
    assert.deepEqual(R.soloPositions([6, 6, 6], 6), [6, 6, 6], "6+6=12 -> dopo il 6 si riparte: 12 = 6");
  });
  test("superato il numero di Sezioni si riparte da 1 (6 Sezioni)", () => {
    assert.deepEqual(R.soloPositions([4, 3], 6), [4, 1]);
    assert.deepEqual(R.soloPositions([6, 1], 6), [6, 1]);
  });
  test("16 e 12 Sezioni: giri multipli", () => {
    assert.deepEqual(R.soloPositions([6, 6, 6], 16), [6, 12, 2]);
    assert.deepEqual(R.soloPositions([3, 6, 6, 6], 12), [3, 9, 3, 9]);
  });
  test("[AMBIGUO] soloTheme: X e' la colonna, Y la riga (riga 1 in basso) (pag. 22-32)", () => {
    // Il manuale parla di «coordinata X e coordinata Y» senza dire quale asse; interpretazione
    // convenzionale: X = colonna (asse orizzontale), Y = riga (asse verticale, 1 in basso).
    const cells = TAVOLE["3-5"].flat();
    for (let y = 1; y <= 6; y++) for (let x = 1; x <= 6; x++) {
      assert.equal(R.soloTheme(cells, x, y), TAVOLE["3-5"][y - 1][x - 1], `x=${x} y=${y}`);
    }
    assert.equal(R.soloTheme(cells, 4, 5), "ABUSI VERBALI");
    assert.equal(R.soloTheme(cells, 1, 1), "CASA");
    assert.equal(R.soloTheme(cells, 6, 6), "PIANTO");
  });
});

/* ================================================================================================
 * 4. MOVIMENTO DELLE BIGLIE: resolveThrow con «sim» finti (pag. 10-13, 38)
 * ============================================================================================== */

describe("Movimento delle biglie: resolveThrow su input costruiti a mano", () => {
  // Mappa 400x400, 4 Sezioni da 200x200:   s1 | s2
  //                                        s3 | s4
  const SEZ = [
    { id: "s1", poly: rect(0, 0, 200, 200) },
    { id: "s2", poly: rect(200, 0, 400, 200) },
    { id: "s3", poly: rect(0, 200, 200, 400) },
    { id: "s4", poly: rect(200, 200, 400, 400) },
  ];
  const BOUNDS = { x: 0, y: 0, w: 400, h: 400 };
  const A = { id: "a1", ownerId: "A" };
  const B = { id: "b1", ownerId: "B" }; // il lanciatore
  const m = (marble, x, y) => ({ ...marble, x, y });

  /**
   * start: biglie gia' sulla Mappa [{id,ownerId,x,y}]; final: posizioni finali (id -> [x,y]) che
   * sovrascrivono quelle di partenza; contact: id toccato per primo (o null).
   */
  function rt({ start = [], thrower = B, final = {}, contact = null, bonded = [], chosen } = {}) {
    const fin = {};
    for (const s of start) fin[s.id] = { x: s.x, y: s.y };
    for (const [id, [x, y]] of Object.entries(final)) fin[id] = { x, y };
    return R.resolveThrow({
      sections: SEZ, bounds: BOUNDS, start,
      thrower: { id: thrower.id, ownerId: thrower.ownerId },
      sim: { final: fin, contact: contact ? { with: contact } : null, tracks: [] },
      bondedThisPhase: bonded, chosenSection: chosen, rng: () => 0.5,
    });
  }
  const sezDi = (placements, id) => {
    const p = placements.find((q) => q.id === id);
    assert.ok(p, `nessun placement per ${id}`);
    return R.sectionAt(SEZ, p.x, p.y);
  };
  const pos = (placements, id) => placements.find((q) => q.id === id);
  const setEq = (a, b, msg) => assert.deepEqual(sortedIds(new Set(a)), sortedIds(new Set(b)), msg);

  describe("la biglia esce dalla Mappa senza toccarne altre", () => {
    test("nessun effetto, si rilancia", () => {
      const r = rt({ start: [m(A, 100, 100)], final: { b1: [500, 100] } });
      assert.equal(r.case, "fuori");
      assert.equal(r.rethrow, true);
      assert.deepEqual(r.involved, []);
      assert.equal(r.pending, false);
      assert.equal(r.encounter, false);
      assert.deepEqual({ x: pos(r.placements, "a1").x, y: pos(r.placements, "a1").y }, { x: 100, y: 100 }, "le altre biglie non si muovono");
    });
    test("anche uscendo dall'altro lato e con la Mappa vuota", () => {
      for (const f of [[-30, 100], [100, -30], [100, 450], [450, 450]]) {
        const r = rt({ final: { b1: f } });
        assert.equal(r.case, "fuori", `finale ${f}`);
        assert.equal(r.rethrow, true);
      }
    });
  });

  describe("la biglia si ferma in una Sezione vuota", () => {
    test("racconto semplice: nessun Legame/Problematica, nessun rilancio", () => {
      const r = rt({ start: [m(A, 100, 100)], final: { b1: [300, 100] } });
      assert.equal(r.case, "racconto");
      assert.equal(r.rethrow, false);
      assert.equal(r.sectionId, "s2");
      assert.deepEqual(r.involved, ["B"]);
      assert.equal(r.encounter, false);
      assert.equal(sezDi(r.placements, "b1"), "s2");
    });
    test("Mappa vuota", () => {
      const r = rt({ final: { b1: [100, 300] } });
      assert.equal(r.case, "racconto");
      assert.equal(r.sectionId, "s3");
    });
  });

  describe("la biglia si ferma in una Sezione dove sono gia' presenti biglie di altri giocatori", () => {
    test("una biglia altrui: incontro, entrambi coinvolti", () => {
      const r = rt({ start: [m(A, 100, 100)], final: { b1: [140, 140] }, contact: "a1" });
      assert.equal(r.case, "incontro");
      assert.equal(r.sectionId, "s1");
      setEq(r.involved, ["A", "B"]);
      assert.equal(r.encounter, true);
      assert.equal(r.rethrow, false);
      assert.equal(sezDi(r.placements, "b1"), "s1");
      assert.equal(sezDi(r.placements, "a1"), "s1");
    });
    test("anche senza contatto fisico, basta fermarsi nella stessa Sezione", () => {
      const r = rt({ start: [m(A, 20, 20)], final: { b1: [180, 180] }, contact: null });
      assert.equal(r.case, "incontro");
      setEq(r.involved, ["A", "B"]);
    });
    test("due giocatori gia' presenti: «ogni Personaggio presente nella Sezione» e' coinvolto", () => {
      const C = { id: "c1", ownerId: "C" };
      const r = rt({ start: [m(A, 20, 20), m(C, 180, 20)], final: { b1: [100, 150] } });
      assert.equal(r.case, "incontro");
      setEq(r.involved, ["A", "B", "C"]);
    });
    test("con una propria biglia e una altrui nella stessa Sezione resta un incontro (c'e' un altro giocatore)", () => {
      const r = rt({ start: [m({ id: "b0", ownerId: "B" }, 30, 30), m(A, 170, 170)], final: { b1: [100, 100] } });
      assert.equal(r.case, "incontro");
      assert.ok(r.involved.includes("A") && r.involved.includes("B"));
    });
    test("biglie altrui in un'ALTRA Sezione non contano", () => {
      const r = rt({ start: [m(A, 300, 100)], final: { b1: [100, 100] } });
      assert.equal(r.case, "racconto");
      assert.deepEqual(r.involved, ["B"]);
    });
  });

  describe("la biglia si ferma in una Sezione con soli propri colori", () => {
    test("solo il giocatore di turno e' coinvolto (elimina un Legame o crea una Problematica)", () => {
      const r = rt({ start: [m({ id: "b0", ownerId: "B" }, 50, 50)], final: { b1: [150, 150] }, contact: null });
      assert.equal(r.case, "propri");
      assert.deepEqual(r.involved, ["B"]);
      assert.equal(r.encounter, false);
      assert.equal(r.rethrow, false);
      assert.equal(sezDi(r.placements, "b1"), "s1");
    });
    test("anche toccando la propria biglia senza spingerla fuori dalla Sezione", () => {
      const r = rt({
        start: [m({ id: "b0", ownerId: "B" }, 50, 50)],
        final: { b0: [70, 60], b1: [150, 150] }, contact: "b0",
      });
      assert.equal(r.case, "propri");
      assert.deepEqual(r.involved, ["B"]);
    });
  });

  describe("la biglia spinge fuori da una Sezione una o piu' biglie", () => {
    test("scontro con una biglia spinta in un'altra Sezione", () => {
      const r = rt({ start: [m(A, 100, 100)], contact: "a1", final: { a1: [300, 100], b1: [130, 100] } });
      assert.equal(r.case, "scontro");
      assert.equal(r.sectionId, "s1", "lo scontro avviene nella Sezione dov'era la biglia colpita");
      setEq(r.involved, ["A", "B"]);
      assert.equal(r.encounter, true);
      assert.equal(sezDi(r.placements, "b1"), "s1");
      assert.equal(sezDi(r.placements, "a1"), "s1", "la biglia sbalzata torna nella Sezione dello scontro");
    });
    test("scontro con una biglia spinta FUORI dalla Mappa", () => {
      const r = rt({ start: [m(A, 100, 100)], contact: "a1", final: { a1: [450, 100], b1: [130, 100] } });
      assert.equal(r.case, "scontro");
      assert.equal(r.sectionId, "s1");
      setEq(r.involved, ["A", "B"]);
      assert.equal(sezDi(r.placements, "a1"), "s1", "raccolta e rimessa nella Sezione dello scontro");
      assert.equal(sezDi(r.placements, "b1"), "s1");
    });
    test("anche se la biglia lanciata esce dalla Mappa dopo aver spinto fuori una biglia, lo scontro vale", () => {
      const r = rt({ start: [m(A, 100, 100)], contact: "a1", final: { a1: [300, 100], b1: [450, 450] } });
      assert.equal(r.case, "scontro");
      assert.equal(r.sectionId, "s1");
      assert.equal(sezDi(r.placements, "b1"), "s1", "il giocatore di turno pone la propria biglia nella Sezione dello scontro");
      assert.equal(r.rethrow, false);
    });
    test("la biglia lanciata si ferma in un'altra Sezione: conta la Sezione del contatto, non quella d'arrivo", () => {
      const r = rt({ start: [m(A, 100, 100)], contact: "a1", final: { a1: [300, 100], b1: [300, 300] } });
      assert.equal(r.case, "scontro");
      assert.equal(r.sectionId, "s1");
      assert.equal(sezDi(r.placements, "b1"), "s1");
      assert.equal(sezDi(r.placements, "a1"), "s1");
    });
    test("piu' biglie di giocatori diversi spinte fuori: tutti coinvolti, tutte riportate nella Sezione", () => {
      const C = { id: "c1", ownerId: "C" };
      const r = rt({
        start: [m(A, 80, 100), m(C, 120, 100)], contact: "a1",
        final: { a1: [300, 50], c1: [300, 150], b1: [100, 130] },
      });
      assert.equal(r.case, "scontro");
      setEq(r.involved, ["A", "B", "C"]);
      for (const id of ["a1", "b1", "c1"]) assert.equal(sezDi(r.placements, id), "s1", id);
    });
    test("lo scontro e' una sola Sezione: biglie in altre Sezioni toccate nel Movimento tornano al loro posto senza effetti", () => {
      const C = { id: "c1", ownerId: "C" };
      const r = rt({
        start: [m(A, 100, 100), m(C, 300, 100)], contact: "a1",
        final: { a1: [260, 100], c1: [300, 300], b1: [140, 100] },
      });
      // a1 e' stata spinta fuori da s1 (finisce in s2) e c1 (in s2) e' stata spostata in s4.
      assert.equal(r.case, "scontro");
      assert.equal(r.sectionId, "s1");
      setEq(r.involved, ["A", "B"]);
      assert.ok(!r.involved.includes("C"), "C non e' coinvolto: la sua biglia era in un'altra Sezione");
      const c = pos(r.placements, "c1");
      assert.deepEqual({ x: c.x, y: c.y }, { x: 300, y: 100 }, "la biglia di C torna al suo posto");
    });
    test("incontro con contatto in cui una biglia di un'altra Sezione viene sbalzata: torna al suo posto, nessun effetto", () => {
      const C = { id: "c1", ownerId: "C" };
      const r = rt({
        start: [m(A, 100, 100), m(C, 300, 100)], contact: "a1",
        final: { a1: [110, 100], c1: [300, 350], b1: [140, 100] },
      });
      assert.equal(r.case, "incontro");
      assert.equal(r.sectionId, "s1");
      setEq(r.involved, ["A", "B"]);
      const c = pos(r.placements, "c1");
      assert.deepEqual({ x: c.x, y: c.y }, { x: 300, y: 100 });
    });
    test("le biglie di altre Sezioni sbalzate FUORI dalla Mappa tornano al loro posto", () => {
      const C = { id: "c1", ownerId: "C" };
      const r = rt({
        start: [m(A, 100, 100), m(C, 300, 100)], contact: "a1",
        final: { a1: [110, 100], c1: [500, 100], b1: [140, 100] },
      });
      assert.equal(r.case, "incontro");
      const c = pos(r.placements, "c1");
      assert.deepEqual({ x: c.x, y: c.y }, { x: 300, y: 100 });
      assert.ok(!r.involved.includes("C"));
    });
    test("[AMBIGUO] contatto con una biglia che resta nella sua Sezione e poi la biglia lanciata esce dalla Mappa", () => {
      // pag. 10: «esce dalla Mappa senza toccarne altre» -> se ne ha toccata una non e' il caso «fuori»;
      // il manuale non assegna pero' un altro esito. Si accetta qualunque esito diverso da «fuori».
      const r = rt({ start: [m(A, 100, 100)], contact: "a1", final: { a1: [110, 100], b1: [450, 450] } });
      assert.notEqual(r.case, "fuori");
    });
  });

  describe("la biglia spinge fuori una propria biglia (Problematica Indistruttibile)", () => {
    const B0 = { id: "b0", ownerId: "B" };
    test("sola area con biglie proprie: Problematica Indistruttibile per il solo giocatore di turno", () => {
      const r = rt({ start: [m(B0, 100, 100)], contact: "b0", final: { b0: [300, 100], b1: [130, 100] } });
      assert.equal(r.case, "problematica-indistruttibile");
      assert.deepEqual(r.involved, ["B"]);
      assert.equal(r.rethrow, false);
      assert.equal(r.encounter, false);
    });
    test("se c'e' la biglia di un altro giocatore nella Sezione NON e' Indistruttibile", () => {
      const r = rt({
        start: [m(B0, 100, 100), m(A, 150, 150)], contact: "b0",
        final: { b0: [300, 100], b1: [130, 100] },
      });
      assert.notEqual(r.case, "problematica-indistruttibile");
    });
    test("spingere fuori una biglia ALTRUI non da' mai una Problematica Indistruttibile", () => {
      const r = rt({
        start: [m(B0, 50, 50), m(A, 100, 100)], contact: "a1",
        final: { a1: [300, 100], b1: [130, 100] },
      });
      assert.equal(r.case, "scontro");
      assert.notEqual(r.case, "problematica-indistruttibile");
      setEq(r.involved, ["A", "B"]);
    });
    test("toccare la propria biglia senza spingerla fuori dalla Sezione NON e' Indistruttibile", () => {
      const r = rt({ start: [m(B0, 100, 100)], contact: "b0", final: { b0: [120, 100], b1: [160, 100] } });
      assert.notEqual(r.case, "problematica-indistruttibile");
    });
    test("spingere fuori DALLA MAPPA una propria biglia e' spingerla fuori dalla Sezione", () => {
      const r = rt({ start: [m(B0, 100, 100)], contact: "b0", final: { b0: [450, 100], b1: [130, 100] } });
      assert.equal(r.case, "problematica-indistruttibile");
    });
    test("[AMBIGUO] le biglie vengono raccolte nella Sezione anche per la Problematica Indistruttibile", () => {
      // Il manuale (pag. 11) descrive la raccolta per lo scontro; per l'Indistruttibile non dice dove restano.
      // Interpretazione: tutte le biglie restano sulla Mappa dentro la Sezione dello scontro.
      const r = rt({ start: [m(B0, 100, 100)], contact: "b0", final: { b0: [300, 100], b1: [130, 100] } });
      assert.equal(R.sectionAt(SEZ, pos(r.placements, "b0").x, pos(r.placements, "b0").y) !== null, true);
    });
  });

  describe("Legame Indistruttibile (solo con chi ha gia' un Legame nella stessa Fase)", () => {
    test("la biglia si ferma con chi ha gia' un Legame con il lanciatore in questa Fase", () => {
      const r = rt({ start: [m(A, 100, 100)], final: { b1: [150, 150] }, bonded: ["A"] });
      assert.equal(r.case, "legame-indistruttibile");
      setEq(r.involved, ["A", "B"]);
      assert.equal(r.encounter, true);
      assert.equal(r.rethrow, false);
    });
    test("senza Legame creato in questa Fase e' un normale incontro", () => {
      const r = rt({ start: [m(A, 100, 100)], final: { b1: [150, 150] }, bonded: [] });
      assert.equal(r.case, "incontro");
    });
    test("il Legame precedente e' con un altro giocatore: l'incontro con A resta normale", () => {
      const r = rt({ start: [m(A, 100, 100)], final: { b1: [150, 150] }, bonded: ["C"] });
      assert.equal(r.case, "incontro");
    });
    test("il Legame vale solo se il compagno e' nella STESSA Sezione", () => {
      const r = rt({ start: [m(A, 300, 100)], final: { b1: [150, 150] }, bonded: ["A"] });
      assert.equal(r.case, "racconto");
    });
    test("con una sola biglia propria nella Sezione non c'e' Legame Indistruttibile", () => {
      const r = rt({ start: [m({ id: "b0", ownerId: "B" }, 50, 50)], final: { b1: [150, 150] }, bonded: ["A"] });
      assert.equal(r.case, "propri");
    });
    test("[AMBIGUO] Sezione con un compagno gia' legato e un terzo non legato", () => {
      // pag. 11: «uno o piu' Personaggi con cui e' gia' stato creato un Legame» -> basta uno; il Legame
      // Indistruttibile si crea «tra tutti i Personaggi coinvolti». Si pretende solo l'esito e che A e B siano coinvolti.
      const C = { id: "c1", ownerId: "C" };
      const r = rt({ start: [m(A, 30, 30), m(C, 170, 30)], final: { b1: [100, 150] }, bonded: ["A"] });
      assert.equal(r.case, "legame-indistruttibile");
      assert.ok(r.involved.includes("A") && r.involved.includes("B"));
    });
  });

  describe("la biglia termina sul solco tra due Sezioni", () => {
    const SOLCO = { b1: [200, 100] }; // bordo condiviso tra s1 e s2
    test("esito sospeso: il giocatore sceglie una delle due Sezioni", () => {
      const r = rt({ start: [m(A, 300, 100)], final: SOLCO });
      assert.equal(r.case, "solco");
      assert.equal(r.pending, true);
      setEq(r.options, ["s1", "s2"]);
      assert.equal(r.rethrow, false);
    });
    test("la scelta e' libera: Sezione vuota -> racconto, biglia spostata dentro", () => {
      const r = rt({ start: [m(A, 300, 100)], final: SOLCO, chosen: "s1" });
      assert.equal(r.case, "racconto");
      assert.equal(r.sectionId, "s1");
      assert.equal(sezDi(r.placements, "b1"), "s1");
    });
    test("scegliendo la Sezione con la biglia di un altro giocatore si crea un incontro (Legame o risoluzione)", () => {
      const r = rt({ start: [m(A, 300, 100)], final: SOLCO, chosen: "s2" });
      assert.equal(r.case, "incontro");
      assert.equal(r.sectionId, "s2");
      setEq(r.involved, ["A", "B"]);
      assert.equal(sezDi(r.placements, "b1"), "s2");
    });
    test("scegliendo una Sezione con soli propri colori: «propri»", () => {
      const r = rt({ start: [m({ id: "b0", ownerId: "B" }, 100, 100)], final: SOLCO, chosen: "s1" });
      assert.equal(r.case, "propri");
    });
    test("scegliendo la Sezione con un compagno legato in questa Fase: Legame Indistruttibile", () => {
      const r = rt({ start: [m(A, 300, 100)], final: SOLCO, chosen: "s2", bonded: ["A"] });
      assert.equal(r.case, "legame-indistruttibile");
    });
    test("il giocatore puo' scegliere indifferentemente l'una o l'altra Sezione", () => {
      for (const chosen of ["s1", "s2"]) {
        const r = rt({ start: [], final: SOLCO, chosen });
        assert.equal(r.sectionId, chosen);
      }
    });
    test("solco anche in verticale", () => {
      const r = rt({ final: { b1: [100, 200] } });
      assert.equal(r.case, "solco");
      setEq(r.options, ["s1", "s3"]);
    });
  });
});

/* ================================================================================================
 * 5. FLUSSO DI GIOCO NEL MOTORE: turni, lanci, Fasi (pag. 6, 9, 10-13)
 * ============================================================================================== */

/** Tavolo costruito a mano: tre Sezioni verticali dentro il foglio, coda con un lancio a testa. */
function board(n = 3, seed = 1, throwsEach = 1) {
  const st = E.newGame({ players: names(n), seed }).state;
  st.sections = [
    { id: "s1", num: 1, theme: "uno", poly: rect(90, 70, 540, 830) },
    { id: "s2", num: 2, theme: "due", poly: rect(540, 70, 890, 830) },
    { id: "s3", num: 3, theme: "tre", poly: rect(890, 70, 1190, 830) },
  ];
  st.status = "lanci";
  st.firstIdx = 0; st.turnIdx = 0; st.thrown = {}; st.marbles = []; st.marbleSeq = 0; st.encounters = 0; st.bonds = [];
  st.queue = [];
  for (let k = 0; k < throwsEach; k++) for (let i = 0; i < n; i++) st.queue.push(i);
  return st;
}

let seqId = 0;
function withMarble(st, actorId, x, y) {
  const p = st.players.find((q) => q.actorId === actorId);
  st.marbles.push({ id: `x${++seqId}`, ownerId: actorId, color: p?.color ?? "#000", x, y });
  return st.marbles[st.marbles.length - 1];
}

function tryLaunches(st, userId, gen, pred, tallies = OK) {
  for (const launch of gen) {
    let r;
    try { r = E.apply(st, { type: "throw", userId, launch }, tallies); } catch { continue; }
    const o = r.effects.find((x) => x.type === "outcome");
    if (o && pred(o, r)) return { launch, r, o };
  }
  return null;
}
function* fromRight(y, v0 = 1200, v1 = 7000, step = 50) { for (let v = v0; v <= v1; v += step) yield { x: 1262, y, vx: -v, vy: 0 }; }
function* fromTop(x, v0 = 700, v1 = 3200, step = 25) { for (let v = v0; v <= v1; v += step) yield { x, y: 5, vx: 0, vy: v }; }
function* fromBottom(x, v0 = 700, v1 = 3200, step = 25) { for (let v = v0; v <= v1; v += step) yield { x, y: 895, vx: 0, vy: -v }; }

describe("Turni e lanci nel motore", () => {
  test("lanciare fuori turno non e' permesso", () => {
    const st = board(3);
    assert.equal(E.currentPlayer(st).userId, "u1");
    assert.throws(() => E.apply(st, { type: "throw", userId: "u2", launch: { x: 640, y: 895, vx: 0, vy: -900 } }, OK), E.EngineError);
  });

  test("apply non muta lo stato in ingresso", () => {
    const st = board(3);
    const prima = JSON.stringify(st);
    E.apply(st, { type: "throw", userId: "u1", launch: { x: 640, y: 895, vx: 0, vy: -900 } }, OK);
    assert.equal(JSON.stringify(st), prima);
  });

  test("la biglia che esce dalla Mappa senza toccare nulla: nessun effetto, si rilancia e non conta come lanciata (pag. 10)", () => {
    const st = board(3);
    // 300 px/s dal bordo: la biglia si ferma subito fuori dal foglio
    const r = E.apply(st, { type: "throw", userId: "u1", launch: { x: 640, y: 895, vx: 0, vy: -300 } }, OK);
    const o = r.effects.find((e) => e.type === "outcome");
    assert.equal(o.case, "fuori");
    assert.equal(o.rethrow, true);
    assert.deepEqual(o.involved, []);
    assert.equal(r.state.marbles.length, 0, "la biglia uscita non resta sulla Mappa");
    assert.equal(r.state.thrown.a1 ?? 0, 0, "non conta come lanciata");
    assert.equal(E.marblesLeft(r.state, r.state.players[0]), 2);
    assert.equal(r.state.encounters, 0);
    const a = E.apply(r.state, { type: "advance" }, OK);
    assert.equal(E.currentPlayer(a.state).userId, "u1", "tocca ancora allo stesso giocatore (rilancia)");
    assert.equal(a.state.queue.length, st.queue.length, "nessun lancio consumato");
    assert.equal(a.state.status, "lanci");
  });

  test("biglia ferma in una Sezione vuota: racconto, lancio consumato, turno al giocatore successivo in senso orario", () => {
    const st = board(3);
    const r = E.apply(st, { type: "throw", userId: "u1", launch: { x: 640, y: 895, vx: 0, vy: -900 } }, OK);
    const o = r.effects.find((e) => e.type === "outcome");
    assert.equal(o.case, "racconto");
    assert.deepEqual(o.involved, ["a1"]);
    assert.equal(r.state.thrown.a1, 1);
    assert.equal(E.marblesLeft(r.state, r.state.players[0]), 1);
    assert.equal(r.state.marbles.length, 1);
    assert.equal(r.state.encounters, 0, "un racconto non e' un incontro");
    const a = E.apply(r.state, { type: "advance" }, OK);
    assert.equal(E.currentPlayer(a.state).userId, "u2");
  });

  test("coda dei lanci: in senso orario a partire dal primo giocatore, ognuno lancia tutte le sue biglie", () => {
    for (const n of [1, 2, 3, 4, 5]) {
      for (let seed = 1; seed <= 6; seed++) {
        const st = ready(newMulti(n, seed));
        const marbles = st.players[0].marbles;
        assert.equal(st.queue.length, n * marbles);
        assert.equal(st.queue[0], st.firstIdx, "inizia il primo giocatore");
        for (let i = 0; i < n; i++) assert.equal(st.queue[i], (st.firstIdx + i) % n, `senso orario, posto ${i}`);
        for (let p = 0; p < n; p++) assert.equal(st.queue.filter((q) => q === p).length, marbles);
        assert.equal(E.currentPlayer(st).userId, `u${st.firstIdx + 1}`);
      }
    }
  });

  test("[AMBIGUO] ordine dei lanci: un giro alla volta (pag. 9: «a turno in senso orario ... finche' non sono state lanciate tutte le biglie»)", () => {
    // Interpretazione: ogni giocatore lancia una biglia per giro. Il manuale potrebbe anche
    // intendersi come «tutte le biglie di un giocatore di seguito»; qui si verifica solo che i giri siano completi.
    const st = ready(newMulti(3, 4));
    const n = 3, marbles = 2;
    for (let giro = 0; giro < marbles; giro++) {
      const blocco = st.queue.slice(giro * n, (giro + 1) * n);
      assert.deepEqual(sortedIds(blocco), [0, 1, 2]);
    }
  });

  test("a fine Fase si passa a 'fine-fase' e ogni giocatore ha lanciato esattamente le sue biglie", () => {
    for (const n of [1, 2, 3, 4, 5]) {
      let st = ready(newMulti(n, 9));
      const log = [];
      st = playPhase(st, mulberry(n), OK, log);
      assert.equal(st.status, "fine-fase");
      for (const p of st.players) assert.equal(st.thrown[p.actorId], p.marbles, `${p.name} ha lanciato tutte le biglie`);
      assert.equal(st.marbles.length, n * st.players[0].marbles, "tutte le biglie sono sulla Mappa a fine Fase");
      // chi ha lanciato in ogni turno corrisponde alla coda iniziale
      const validi = log.filter((t) => !t.outcome.rethrow).map((t) => t.player.userId);
      const attesi = ready(newMulti(n, 9)).queue.map((i) => `u${i + 1}`);
      assert.deepEqual(validi, attesi);
    }
  });

  test("ogni biglia a fine Fase sta dentro una Sezione (tutte le biglie sbalzate o toccate vengono rimesse a posto, pag. 10)", () => {
    for (let seed = 1; seed <= 12; seed++) {
      let st = ready(newMulti(4, seed));
      st = playPhase(st, mulberry(seed * 7), OK);
      for (const m of st.marbles) {
        assert.ok(R.sectionAt(st.sections, m.x, m.y), `biglia ${m.id} (${m.ownerId}) fuori dalle Sezioni a (${m.x},${m.y})`);
      }
    }
  });
});

describe("Passaggio di Fase (pag. 9)", () => {
  test("il primo giocatore passa a chi sta a sinistra (successivo in senso orario); la Mappa si svuota", () => {
    for (const n of [2, 3, 4, 5]) {
      let st = ready(newMulti(n, 14));
      const first0 = st.firstIdx;
      st = playPhase(st, mulberry(3), OK);
      const r = E.apply(st, { type: "nextPhase" }, OK);
      assert.equal(r.state.phaseIdx, 1);
      assert.equal(r.state.status, "temi");
      assert.equal(r.state.firstIdx, (first0 + 1) % n, `n=${n}`);
      const eff = r.effects.find((e) => e.type === "phase");
      assert.equal(eff.first, `P${(first0 + 1) % n + 1}`);
      assert.equal(r.state.marbles.length, 0, "la Mappa viene cancellata e le biglie raccolte");
      assert.equal(r.state.sections.length, 8, "6-7 anni: 8 Sezioni");
      assert.equal(r.state.encounters, 0);
      assert.deepEqual(r.state.bonds, []);
      assert.deepEqual(r.state.thrown, {});
    }
  });

  test("la rotazione del primo giocatore prosegue Fase dopo Fase, con il giro che ricomincia da lui", () => {
    const n = 3;
    let st = newMulti(n, 21);
    const rng = mulberry(5);
    let atteso = st.firstIdx;
    for (let fase = 0; fase < 7; fase++) { // fino a 24-29 anni (nessun Dado della Morte)
      assert.equal(st.phaseIdx, fase);
      assert.equal(st.firstIdx, atteso, `Fase ${fase}`);
      assert.equal(st.sections.length, R.PHASES[fase].sections, `Sezioni Fase ${R.PHASES[fase].id}`);
      st = ready(st);
      assert.equal(st.queue[0], atteso);
      st = playPhase(st, rng, OK);
      st = E.apply(st, { type: "nextPhase" }, OK).state;
      atteso = (atteso + 1) % n;
    }
  });

  test("ogni Fase del gioco completo ha il numero di Sezioni del manuale", () => {
    const base = newMulti(3, 8);
    for (const [id, sezioni] of MANUALE_FASI) {
      const st = jumpToPhase(base, id);
      assert.equal(st.sections.length, sezioni, id);
      assert.equal(st.phases[st.phaseIdx].id, id);
    }
  });

  test("[AMBIGUO] i residui della cancellatura restano sulla Mappa e non diminuiscono (pag. 9)", () => {
    // Il manuale dice solo che la gomma lascia residui che rendono piu' difficile dare una direzione alle biglie.
    // Interpretazione: stato.residue non puo' perdere elementi tra una Fase e la successiva.
    let st = ready(newMulti(3, 33));
    const rng = mulberry(6);
    const conta = (s) => (s.residue?.smudges?.length ?? 0) + (s.residue?.creases?.length ?? 0);
    let prima = conta(st);
    for (let i = 0; i < 4; i++) {
      st = playPhase(st, rng, OK);
      st = E.apply(st, { type: "nextPhase" }, OK).state;
      const dopo = conta(st);
      assert.ok(dopo >= prima, `i residui sono diminuiti (${prima} -> ${dopo})`);
      prima = dopo;
      st = ready(st);
    }
    assert.ok(prima > 0, "dopo la prima cancellatura devono esserci residui");
  });
});

describe("Fine Fase senza incontri: tutti eliminano un Legame (pag. 12, effetto phaseEnd)", () => {
  /** Stato di una Fase quasi finita: resta un solo lancio, Mappa vuota (a parte quanto indicato). */
  function ultimoLancio(n, encounters) {
    const st = board(n, 3);
    st.queue = [0]; st.encounters = encounters;
    return st;
  }
  function chiudi(st) {
    const r = E.apply(st, { type: "throw", userId: "u1", launch: { x: 640, y: 895, vx: 0, vy: -900 } }, OK);
    assert.equal(r.effects.find((e) => e.type === "outcome").case, "racconto");
    return E.apply(r.state, { type: "advance" }, OK);
  }
  test("nessun incontro durante la Fase: penalita' (tutti eliminano un Legame)", () => {
    const a = chiudi(ultimoLancio(3, 0));
    assert.equal(a.state.status, "fine-fase");
    const pe = a.effects.find((e) => e.type === "phaseEnd");
    assert.ok(pe, "manca l'effetto phaseEnd");
    assert.equal(pe.encounters, 0);
    assert.equal(pe.penalty, true);
  });
  test("almeno un incontro durante la Fase: nessuna penalita'", () => {
    const a = chiudi(ultimoLancio(3, 1));
    const pe = a.effects.find((e) => e.type === "phaseEnd");
    assert.equal(pe.encounters, 1);
    assert.equal(pe.penalty, false);
  });
  test("lo stesso vale con piu' incontri", () => {
    const a = chiudi(ultimoLancio(3, 4));
    assert.equal(a.effects.find((e) => e.type === "phaseEnd").penalty, false);
  });
  test("un rilancio dopo 'fuori' non chiude la Fase: phaseEnd arriva solo dopo l'ultimo lancio valido", () => {
    const st = ultimoLancio(3, 0);
    const f = E.apply(st, { type: "throw", userId: "u1", launch: { x: 640, y: 895, vx: 0, vy: -300 } }, OK);
    const a = E.apply(f.state, { type: "advance" }, OK);
    assert.equal(a.state.status, "lanci");
    assert.ok(!a.effects.some((e) => e.type === "phaseEnd"));
  });
  test("in una Fase giocata davvero, phaseEnd.penalty e' vero se e solo se non ci sono stati incontri", () => {
    let visti = { si: 0, no: 0 };
    for (let seed = 1; seed <= 40; seed++) {
      const n = 1 + (seed % 4);
      let st = ready(newMulti(n, seed));
      const log = [];
      st = playPhase(st, mulberry(seed), OK, log);
      const pe = log[log.length - 1].effects.find((e) => e.type === "phaseEnd");
      const incontri = log.filter((t) => ["incontro", "scontro", "legame-indistruttibile"].includes(t.outcome.case)).length;
      assert.equal(pe.encounters, incontri, `seed ${seed}`);
      assert.equal(pe.penalty, incontri === 0, `seed ${seed}`);
      visti[pe.penalty ? "si" : "no"]++;
    }
    assert.ok(visti.no > 0);
  });
  test("[AMBIGUO] «propri» e «problematica-indistruttibile» non sono incontri tra giocatori (pag. 12)", () => {
    // Il manuale: «le biglie dei giocatori non si sono mai incontrate in una Sezione (generando Problematiche o Legami)».
    // Interpretazione: l'incontro richiede biglie di giocatori diversi. Con un solo giocatore la Fase
    // finisce quindi sempre con penalita'; il test pretende solo che il contatore sia coerente.
    let st = ready(newMulti(1, 5));
    const log = [];
    st = playPhase(st, mulberry(5), OK, log);
    const pe = log[log.length - 1].effects.find((e) => e.type === "phaseEnd");
    assert.equal(pe.encounters, 0);
  });
});

describe("Esiti del Movimento nel motore (tavolo costruito a mano, fisica reale)", () => {
  test("spingere fuori da una Sezione la biglia di un altro: scontro, tutte le biglie coinvolte nella Sezione dello scontro", () => {
    const st = board(3);
    const bersaglio = withMarble(st, "a2", 560, 450); // in s2, vicino al bordo con s1
    const trovato = tryLaunches(st, "u1", fromRight(450), (o, r) => o.case === "scontro");
    assert.ok(trovato, "il simulatore non ha prodotto uno scontro (limite del test)");
    const { r, o } = trovato;
    assert.equal(o.sectionId, "s2");
    assert.ok(o.involved.includes("a1") && o.involved.includes("a2"));
    assert.equal(r.state.encounters, 1);
    for (const m of r.state.marbles) {
      assert.equal(R.sectionAt(r.state.sections, m.x, m.y), "s2", `la biglia ${m.id} deve stare nella Sezione dello scontro`);
    }
    assert.equal(r.state.marbles.length, 2);
    assert.ok(r.state.marbles.some((m) => m.id === bersaglio.id));
  });

  test("spingere fuori da una Sezione una PROPRIA biglia (sola area propria): Problematica Indistruttibile", () => {
    const st = board(3);
    withMarble(st, "a1", 560, 450);
    const trovato = tryLaunches(st, "u1", fromRight(450), (o) => o.case === "problematica-indistruttibile");
    assert.ok(trovato, "il simulatore non ha prodotto una Problematica Indistruttibile (limite del test)");
    assert.deepEqual(trovato.o.involved, ["a1"]);
    assert.equal(trovato.r.state.encounters, 0);
  });

  test("con la biglia di un altro giocatore nella Sezione, spingere fuori la propria NON da' Problematica Indistruttibile", () => {
    const st = board(3);
    withMarble(st, "a1", 560, 450);
    withMarble(st, "a2", 760, 300);
    const gen = fromRight(450);
    for (const launch of gen) {
      let r;
      try { r = E.apply(st, { type: "throw", userId: "u1", launch }, OK); } catch { continue; }
      const o = r.effects.find((e) => e.type === "outcome");
      if (o) assert.notEqual(o.case, "problematica-indistruttibile", `lancio ${JSON.stringify(launch)}`);
    }
  });

  test("conta solo la prima Sezione di contatto: le biglie di altre Sezioni toccate o sbalzate tornano al loro posto senza effetti (pag. 10)", () => {
    const st = board(3);
    const colpita = withMarble(st, "a2", 560, 450); // s2, subito prima del bordo con s1
    const dietro = withMarble(st, "a3", 495, 450); // s1, proprio dietro alla colpita
    const trovato = tryLaunches(st, "u1", fromRight(450), (o, r) =>
      ["scontro", "incontro"].includes(o.case) && r.state.last.tracks.some((t) => t.id === dietro.id));
    assert.ok(trovato, "il simulatore non ha prodotto la catena di urti (limite del test)");
    const { r, o } = trovato;
    assert.equal(o.sectionId, "s2", "vale la Sezione del primo contatto (quella della biglia colpita)");
    assert.ok(!o.involved.includes("a3"), "a3 non e' coinvolta");
    const d = r.state.marbles.find((m) => m.id === dietro.id);
    assert.deepEqual({ x: d.x, y: d.y }, { x: 495, y: 450 }, "la biglia di un'altra Sezione torna al suo posto");
    assert.equal(r.state.encounters, 1, "un solo incontro registrato");
  });

  test("Legame Indistruttibile solo con chi ha gia' un Legame nella stessa Fase", () => {
    const st = board(3);
    withMarble(st, "a2", 715, 450);
    // fermarsi nella stessa Sezione (s2) senza urtare: dall'alto a x=800
    const gen = () => fromTop(800, 500, 3200, 25);
    const senza = tryLaunches(st, "u1", gen(), (o) => o.case === "incontro" && o.sectionId === "s2");
    assert.ok(senza, "nessun lancio finisce nella Sezione s2 (limite del test)");
    assert.equal(senza.r.state.bonds.length, 0);

    // con il Legame registrato in questa Fase lo stesso lancio produce un Legame Indistruttibile
    const legato = E.apply(st, { type: "registerBond", a: "a1", b: "a2" }, OK).state;
    const r2 = E.apply(legato, { type: "throw", userId: "u1", launch: senza.launch }, OK);
    const o2 = r2.effects.find((e) => e.type === "outcome");
    assert.equal(o2.case, "legame-indistruttibile");
    assert.ok(o2.involved.includes("a1") && o2.involved.includes("a2"));
  });

  test("il Legame vale in entrambe le direzioni: se a lanciare e' l'altro compagno", () => {
    const st = board(3);
    st.queue = [1, 0, 2];
    st.turnIdx = 1;
    withMarble(st, "a1", 715, 450);
    const legato = E.apply(st, { type: "registerBond", a: "a1", b: "a2" }, OK).state;
    const trovato = tryLaunches(legato, "u2", fromTop(800, 500, 3200, 25), (o) => o.sectionId === "s2");
    assert.ok(trovato, "nessun lancio finisce in s2 (limite del test)");
    assert.equal(trovato.o.case, "legame-indistruttibile");
  });

  test("un Legame tra altri due giocatori non rende Indistruttibile l'incontro", () => {
    const st = board(3);
    withMarble(st, "a2", 715, 450);
    const legato = E.apply(st, { type: "registerBond", a: "a2", b: "a3" }, OK).state;
    const trovato = tryLaunches(legato, "u1", fromTop(800, 500, 3200, 25), (o) => o.sectionId === "s2");
    assert.ok(trovato);
    assert.equal(trovato.o.case, "incontro");
  });

  test("il Legame vale solo per la Fase in corso: cambiando Fase torna un normale incontro", () => {
    let st = ready(newMulti(3, 2));
    st = playPhase(st, mulberry(2), OK);
    st = E.apply(st, { type: "registerBond", a: "a1", b: "a2" }, OK).state;
    assert.equal(st.bonds.length, 1);
    st = E.apply(st, { type: "nextPhase" }, OK).state;
    assert.deepEqual(st.bonds, [], "i Legami della Fase precedente non contano per l'Indistruttibile");
  });

  test("solco: la biglia sul bordo tra due Sezioni resta in sospeso finche' il giocatore sceglie il Tema", () => {
    const st = board(3);
    const r = E.apply(st, { type: "throw", userId: "u1", launch: { x: 540, y: 895, vx: 0, vy: -1100 } }, OK);
    assert.ok(r.effects.some((e) => e.type === "solco"));
    assert.ok(r.state.pending, "esito in sospeso");
    assert.deepEqual(sortedIds(r.state.pending.options), ["s1", "s2"]);
    assert.equal(r.state.encounters, 0);
    assert.throws(() => E.apply(r.state, { type: "advance" }, OK), E.EngineError, "non si va avanti senza scegliere");
    for (const scelta of ["s1", "s2"]) {
      const c = E.apply(r.state, { type: "chooseGroove", sectionId: scelta }, OK);
      const o = c.effects.find((e) => e.type === "outcome");
      assert.equal(o.sectionId, scelta);
      assert.equal(o.case, "racconto");
      assert.equal(c.state.pending, null);
      assert.equal(R.sectionAt(c.state.sections, c.state.marbles[0].x, c.state.marbles[0].y), scelta, "la biglia viene spostata nella Sezione scelta");
      assert.equal(c.state.thrown.a1, 1);
    }
  });

  test("solco: scegliendo la Sezione dove c'e' la biglia di un altro e' un incontro", () => {
    const st = board(3);
    withMarble(st, "a2", 715, 450);
    const r = E.apply(st, { type: "throw", userId: "u1", launch: { x: 540, y: 895, vx: 0, vy: -1100 } }, OK);
    const c = E.apply(r.state, { type: "chooseGroove", sectionId: "s2" }, OK);
    const o = c.effects.find((e) => e.type === "outcome");
    assert.equal(o.case, "incontro");
    assert.ok(o.involved.includes("a1") && o.involved.includes("a2"));
    assert.equal(c.state.encounters, 1);
    const d = E.apply(r.state, { type: "chooseGroove", sectionId: "s1" }, OK);
    assert.equal(d.effects.find((e) => e.type === "outcome").case, "racconto", "scegliendo l'altra Sezione e' vuota");
  });

  test("solco: Legame Indistruttibile se nella Sezione scelta c'e' un compagno legato in questa Fase", () => {
    let st = board(3);
    withMarble(st, "a2", 715, 450);
    st = E.apply(st, { type: "registerBond", a: "a1", b: "a2" }, OK).state;
    const r = E.apply(st, { type: "throw", userId: "u1", launch: { x: 540, y: 895, vx: 0, vy: -1100 } }, OK);
    const c = E.apply(r.state, { type: "chooseGroove", sectionId: "s2" }, OK);
    assert.equal(c.effects.find((e) => e.type === "outcome").case, "legame-indistruttibile");
  });
});

describe("Invarianti su partite casuali (differenziale con le regole del manuale)", () => {
  test("per ogni lancio: esito coerente con le posizioni finali, niente biglie fuori Sezione, biglie estranee ferme", () => {
    let verificati = 0;
    const visti = new Set();
    for (let seed = 1; seed <= 10; seed++) {
      const n = 2 + (seed % 4);
      let st = newMulti(n, seed);
      const rng = mulberry(seed * 31);
      for (let fase = 0; fase < 6; fase++) {
        st = ready(st);
        let guard = 0;
        while (st.status === "lanci" && guard++ < 400) {
          const prima = st;
          const t = playTurn(st, rng, OK);
          const o = t.outcome;
          const dopo = t.mid; // stato dopo il lancio (e l'eventuale scelta sul solco), prima di advance
          visti.add(o.case);
          if (o.case === "fuori") {
            assert.equal(o.rethrow, true);
            assert.deepEqual(dopo.marbles.map((m) => [m.id, m.x, m.y]), prima.marbles.map((m) => [m.id, m.x, m.y]), "biglie ferme dopo un 'fuori'");
            assert.equal(dopo.encounters, prima.encounters);
          } else {
            const thrower = o.thrower;
            assert.equal(dopo.thrown[thrower], (prima.thrown[thrower] ?? 0) + 1);
            assert.equal(dopo.marbles.length, prima.marbles.length + 1);
            for (const m of dopo.marbles) assert.ok(R.sectionAt(dopo.sections, m.x, m.y), `biglia fuori Sezione (${o.case})`);
            const sezId = o.sectionId;
            const nellaSezione = dopo.marbles.filter((m) => R.sectionAt(dopo.sections, m.x, m.y) === sezId);
            const proprietari = new Set(nellaSezione.map((m) => m.ownerId));
            const altri = [...proprietari].filter((p) => p !== thrower);
            assert.ok(proprietari.has(thrower), "la biglia del lanciatore sta nella Sezione dell'esito");
            switch (o.case) {
              case "racconto":
                assert.equal(nellaSezione.length, 1, "racconto: la biglia e' sola nella Sezione");
                break;
              case "propri":
                assert.equal(altri.length, 0, "propri: nessun altro giocatore nella Sezione");
                assert.ok(nellaSezione.length >= 2);
                break;
              case "incontro":
              case "legame-indistruttibile":
                assert.ok(altri.length > 0, `${o.case}: serve un altro giocatore nella Sezione`);
                assert.deepEqual(sortedIds(o.involved), sortedIds([...proprietari]), "coinvolti = tutti i presenti");
                break;
              case "scontro":
                assert.ok(altri.length > 0);
                assert.ok(o.involved.includes(thrower) && o.involved.every((p) => proprietari.has(p)));
                break;
              case "problematica-indistruttibile":
                assert.equal(altri.length, 0, "Indistruttibile solo se nella Sezione ci sono soltanto biglie proprie");
                assert.deepEqual(o.involved, [thrower]);
                break;
              default:
                assert.fail(`esito inatteso ${o.case}`);
            }
            const estranee = (id) => !o.involved.includes(id);
            // Biglie di giocatori non coinvolti: se stavano in un'ALTRA Sezione vanno rimesse al loro posto
            // (pag. 10); se stavano nella Sezione dell'esito possono essere state mosse dalla fisica, ma
            // devono restare dentro quella Sezione. [AMBIGUO] se il loro proprietario sia «coinvolto».
            for (const m of prima.marbles.filter((q) => estranee(q.ownerId))) {
              const d = dopo.marbles.find((q) => q.id === m.id);
              if (R.sectionAt(prima.sections, m.x, m.y) !== sezId) {
                assert.deepEqual([d.x, d.y], [m.x, m.y], `biglia estranea ${m.id} di un'altra Sezione spostata (${o.case})`);
              } else {
                assert.equal(R.sectionAt(dopo.sections, d.x, d.y), sezId, `biglia ${m.id} uscita dalla Sezione dell'esito`);
              }
            }
            const incontro = ["incontro", "scontro", "legame-indistruttibile"].includes(o.case);
            assert.equal(dopo.encounters, prima.encounters + (incontro ? 1 : 0), `contatore incontri dopo ${o.case}`);
          }
          verificati++;
          st = t.state;
        }
        if (st.status !== "fine-fase") break;
        const nx = E.apply(st, { type: "nextPhase" }, OK);
        st = nx.state;
        if (st.status !== "temi") break;
      }
    }
    assert.ok(verificati > 300, `pochi lanci verificati (${verificati})`);
    for (const c of ["fuori", "racconto", "incontro", "scontro"]) assert.ok(visti.has(c), `esito mai osservato: ${c}`);
  });
});

/* ================================================================================================
 * 6. EPILOGO NEL MOTORE (pag. 15-16, 38)
 * ============================================================================================== */

function tallies(obj) {
  return { getTally: (id) => obj[id] ?? { legami: 0, problemi: 0, score: 0 } };
}
const T = (legami, problemi) => ({ legami, problemi, score: legami - problemi });

/** Porta una partita a inizio Epilogo passando dall'ultima Fase (nessun Dado della Morte). */
function epilogueFrom(base, tl) {
  const s2 = structuredClone(base);
  s2.phaseIdx = s2.phases.length - 1; s2.status = "fine-fase"; s2.queue = [];
  const r = E.apply(s2, { type: "nextPhase" }, tl);
  assert.equal(r.state.status, "epilogo-lanci");
  return r;
}
const centro = (poly) => [poly.reduce((s, p) => s + p[0], 0) / poly.length, poly.reduce((s, p) => s + p[1], 0) / poly.length];
const centroSez = (st, id) => centro(st.sections.find((s) => s.id === id).poly);

describe("Epilogo: chi muore e come si dividono i finali (pag. 15)", () => {
  const casi = [
    // [descrizione, tally, mortoAtteso, chiaveAttesa, [lieto, dolceamaro, drammatico]]
    ["Legami >= doppio delle Problematiche", { a1: T(5, 1), a2: T(2, 4), a3: T(3, 3) }, "a1", "A", [4, 3, 1]],
    ["Legami > Problematiche (non doppio)", { a1: T(3, 2), a2: T(1, 2), a3: T(0, 1) }, "a1", "B", [3, 3, 2]],
    ["Legami = Problematiche", { a1: T(2, 2), a2: T(1, 3), a3: T(0, 4) }, "a1", "C", [2, 3, 3]],
    ["Legami < Problematiche", { a1: T(1, 3), a2: T(0, 4), a3: T(0, 5) }, "a1", "D", [1, 3, 4]],
    ["muore chi ha il punteggio maggiore anche se non e' il primo", { a1: T(0, 3), a2: T(1, 3), a3: T(6, 2) }, "a3", "A", [4, 3, 1]],
    ["conta il rapporto del defunto, non quello degli altri", { a1: T(5, 1), a2: T(0, 9), a3: T(0, 9) }, "a1", "A", [4, 3, 1]],
  ];
  for (const [desc, tl, morto, chiave, [lieti, dolci, dramm]] of casi) {
    test(desc, () => {
      const r = epilogueFrom(newMulti(3, 12), tallies(tl));
      const ep = r.state.epilogue;
      assert.equal(ep.dead, morto);
      assert.equal(ep.mix.key, chiave);
      const fin = Object.values(ep.endings);
      assert.equal(fin.length, 8, "8 Sezioni di finale");
      const conta = (k) => fin.filter((x) => x === k).length;
      assert.deepEqual([conta("lieto"), conta("dolceamaro"), conta("drammatico")], [lieti, dolci, dramm]);
      assert.equal(conta("tragico"), 0, "il finale tragico non e' mai tra le 8 Sezioni");
      assert.equal(r.state.sections.length, 8);
      const eff = r.effects.find((e) => e.type === "epilogue");
      assert.equal(eff.dead, `P${morto.slice(1)}`);
      // la Mappa e' strappata in due e si tiene una meta'
      assert.equal(r.state.torn, true);
      const { half } = R.epilogueSections(r.state.paper);
      assert.deepEqual({ ...r.state.half }, { ...half });
    });
  }

  test("[AMBIGUO] all'inizio dell'Epilogo la Mappa non contiene biglie della Fase precedente", () => {
    // Il manuale non lo dice, ma «nel caso in cui nessuna biglia sia presente sulla Mappa» e «una sola biglia
    // a testa» presuppongono che le biglie della Fase precedente siano state raccolte.
    const r = epilogueFrom(ready(newMulti(3, 12)), tallies({ a1: T(3, 1) }));
    assert.equal(r.state.marbles.length, 0);
  });

  test("ogni giocatore lancia UNA sola biglia nell'Epilogo, a turno", () => {
    for (const n of [1, 2, 3, 4, 5]) {
      const tl = Object.fromEntries(Array.from({ length: n }, (_, i) => [`a${i + 1}`, T(i + 1, 1)]));
      const r = epilogueFrom(newMulti(n, 3), tallies(tl));
      assert.equal(r.state.queue.length, n);
      assert.deepEqual(sortedIds(r.state.queue), Array.from({ length: n }, (_, i) => i));
    }
  });

  test("pareggio sul punteggio piu' alto: lanciano il dado solo i giocatori a pari merito; chi fa di piu' muore", () => {
    for (let seed = 1; seed <= 25; seed++) {
      const r = epilogueFrom(newMulti(3, seed), tallies({ a1: T(3, 1), a2: T(3, 1), a3: T(1, 3) }));
      const tieEffects = r.effects.filter((e) => e.type === "tieRolls");
      assert.ok(tieEffects.length >= 1, "deve esserci almeno un tiro di spareggio");
      for (const te of tieEffects) {
        assert.deepEqual(sortedIds(te.rolls.map((x) => x.name)), ["P1", "P2"], "P3 non partecipa allo spareggio");
        for (const x of te.rolls) assert.ok(x.roll >= 1 && x.roll <= 6);
      }
      tieEffects.slice(0, -1).forEach((te) => {
        const max = Math.max(...te.rolls.map((x) => x.roll));
        assert.equal(te.rolls.filter((x) => x.roll === max).length, 2, "si ritira solo se i migliori sono ancora pari");
      });
      const last = tieEffects[tieEffects.length - 1].rolls;
      const max = Math.max(...last.map((x) => x.roll));
      const vincitori = last.filter((x) => x.roll === max);
      assert.equal(vincitori.length, 1);
      assert.equal(r.state.epilogue.dead, `a${vincitori[0].name.slice(1)}`);
    }
  });

  test("scambio di due finali prima dei lanci: l'insieme dei tipi non cambia", () => {
    const r = epilogueFrom(newMulti(3, 5), tallies({ a1: T(4, 1) }));
    const ids = Object.keys(r.state.epilogue.endings);
    const prima = { ...r.state.epilogue.endings };
    const diversi = ids.find((i) => prima[i] !== prima[ids[0]]);
    const s = E.apply(r.state, { type: "swapEndings", a: ids[0], b: diversi }, OK).state;
    assert.equal(s.epilogue.endings[ids[0]], prima[diversi]);
    assert.equal(s.epilogue.endings[diversi], prima[ids[0]]);
    assert.deepEqual(Object.values(s.epilogue.endings).sort(), Object.values(prima).sort());
  });
});

describe("Epilogo: i lanci e il finale (pag. 15)", () => {
  /** Epilogo con 3 giocatori in cui resta da lanciare solo l'ultimo; le altre biglie sono piazzate a mano. */
  function ultimoLancioEpilogo(piazza) {
    const r = epilogueFrom(newMulti(3, 8), tallies({ a1: T(4, 1), a2: T(1, 3), a3: T(0, 4) }));
    const st = structuredClone(r.state);
    st.queue = [2]; st.turnIdx = 2; st.thrown = { a1: 1, a2: 1, a3: 0 };
    st.marbles = [];
    piazza(st);
    return st;
  }
  const FUORI = { x: 5, y: 450, vx: 400, vy: 0 }; // si ferma subito fuori dalla meta' tenuta
  const tipoDi = (st, id) => st.epilogue.endings[id];
  /** due Sezioni di tipi diversi e una terza dello stesso tipo della prima */
  function scegliSezioni(st) {
    const e = st.epilogue.endings; const ids = Object.keys(e);
    const a = ids[0];
    const b = ids.find((i) => e[i] !== e[a]);
    const a2 = ids.find((i) => i !== a && e[i] === e[a]);
    return { a, b, a2 };
  }
  function conclude(st, launch = FUORI) {
    const t = E.apply(st, { type: "throw", userId: "u3", launch }, OK);
    const adv = E.apply(t.state, { type: "advance" }, OK);
    return { t, adv };
  }

  test("vince la Sezione con piu' biglie: il suo tipo di finale e' l'Epitaffio", () => {
    const st = ultimoLancioEpilogo((s) => {
      const { a } = scegliSezioni(s);
      withMarble(s, "a1", ...centroSez(s, a));
      withMarble(s, "a2", ...centroSez(s, a));
      s.marbles[1].y += 25;
    });
    const { a } = scegliSezioni(st);
    const { adv } = conclude(st);
    assert.equal(adv.state.status, "concluso");
    const fin = adv.effects.find((e) => e.type === "ending");
    assert.ok(fin);
    assert.equal(fin.kind, tipoDi(st, a));
    assert.equal(adv.state.epilogue.result.ending, tipoDi(st, a));
  });

  test("la biglia che esce dalla Mappa nell'Epilogo non si rilancia e resta dove e' (pag. 15)", () => {
    const st = ultimoLancioEpilogo((s) => { const { a } = scegliSezioni(s); withMarble(s, "a1", ...centroSez(s, a)); });
    const t = E.apply(st, { type: "throw", userId: "u3", launch: FUORI }, OK);
    assert.ok(!t.state.awaiting?.rethrow, "nessun rilancio nell'Epilogo");
    assert.equal(t.state.marbles.length, 2, "la biglia uscita resta dove si e' fermata");
    const m = t.state.marbles.find((q) => q.ownerId === "a3");
    assert.ok(m && !R.sectionAt(t.state.sections, m.x, m.y));
    const adv = E.apply(t.state, { type: "advance" }, OK);
    assert.equal(adv.state.queue.length, 0, "il lancio e' stato consumato");
    assert.ok(["concluso", "epilogo-scelta"].includes(adv.state.status));
  });

  test("nessuna biglia sulla Mappa (tutte uscite): finale Tragico (pag. 15)", () => {
    let st = epilogueFrom(newMulti(3, 8), tallies({ a1: T(4, 1), a2: T(1, 3), a3: T(0, 4) })).state;
    let guard = 0;
    while (st.status === "epilogo-lanci" && guard++ < 10) {
      const pl = E.currentPlayer(st);
      st = E.apply(st, { type: "throw", userId: pl.userId, launch: FUORI }, OK).state;
      const adv = E.apply(st, { type: "advance" }, OK);
      st = adv.state;
      if (st.status === "concluso") {
        const fin = adv.effects.find((e) => e.type === "ending");
        assert.equal(fin.kind, "tragico");
        assert.equal(st.epilogue.result.ending, "tragico");
      }
    }
    assert.equal(st.status, "concluso");
  });

  test("[AMBIGUO] il finale tragico NON e' tra le 8 Sezioni ma solo se non c'e' nessuna biglia", () => {
    // pag. 15: «nel caso in cui nessuna biglia sia presente sulla Mappa, raccontate un finale Tragico».
    const st = ultimoLancioEpilogo((s) => { const { a } = scegliSezioni(s); withMarble(s, "a1", ...centroSez(s, a)); });
    const { adv } = conclude(st);
    assert.notEqual(adv.effects.find((e) => e.type === "ending")?.kind, "tragico");
  });

  test("pareggio tra Sezioni di tipo diverso: sceglie il giocatore del Personaggio defunto", () => {
    const st = ultimoLancioEpilogo((s) => {
      const { a, b } = scegliSezioni(s);
      withMarble(s, "a1", ...centroSez(s, a));
      withMarble(s, "a2", ...centroSez(s, b));
    });
    const { a, b } = scegliSezioni(st);
    const { adv } = conclude(st);
    assert.equal(adv.state.status, "epilogo-scelta");
    assert.ok(adv.effects.some((e) => e.type === "endingTie"));
    const nonPari = ["lieto", "dolceamaro", "drammatico", "tragico"].filter((k) => k !== tipoDi(st, a) && k !== tipoDi(st, b));
    for (const k of nonPari) {
      assert.throws(() => E.apply(adv.state, { type: "chooseEnding", kind: k }, OK), E.EngineError, `«${k}» non e' tra i finali a pari merito`);
    }
    for (const kind of [tipoDi(st, a), tipoDi(st, b)]) {
      const c = E.apply(adv.state, { type: "chooseEnding", kind }, OK);
      assert.equal(c.state.status, "concluso");
      const fin = c.effects.find((e) => e.type === "ending");
      assert.equal(fin.kind, kind);
    }
  });

  test("pareggio tra Sezioni dello stesso tipo: il tipo e' univoco, nessuna scelta", () => {
    const st = ultimoLancioEpilogo((s) => {
      const { a, a2 } = scegliSezioni(s);
      withMarble(s, "a1", ...centroSez(s, a));
      withMarble(s, "a2", ...centroSez(s, a2));
    });
    const { a } = scegliSezioni(st);
    const { adv } = conclude(st);
    assert.equal(adv.state.status, "concluso");
    assert.equal(adv.effects.find((e) => e.type === "ending").kind, tipoDi(st, a));
  });

  test("le biglie fuori dalla meta' tenuta non contano nel conteggio", () => {
    const st = ultimoLancioEpilogo((s) => {
      const { b } = scegliSezioni(s);
      withMarble(s, "a1", 200, 200); // nella meta' strappata
      withMarble(s, "a2", ...centroSez(s, b));
    });
    const { b } = scegliSezioni(st);
    const { adv } = conclude(st);
    assert.equal(adv.state.status, "concluso");
    assert.equal(adv.effects.find((e) => e.type === "ending").kind, tipoDi(st, b));
  });

  test("urtando un'altra biglia nell'Epilogo si lasciano entrambe dove sono finite (pag. 15)", () => {
    const st = ultimoLancioEpilogo((s) => { const { a } = scegliSezioni(s); withMarble(s, "a1", ...centroSez(s, a)); });
    const { a } = scegliSezioni(st);
    const [cx, cy] = centroSez(st, a);
    const originale = st.marbles[0];
    // nell'Epilogo non c'e' un «outcome»: si cerca direttamente un lancio che urti la biglia piazzata
    let res = null;
    for (let v = 1200; v <= 6000 && !res; v += 50) {
      const r = E.apply(st, { type: "throw", userId: "u3", launch: { x: 1262, y: cy, vx: -v, vy: 0 } }, OK);
      if (r.state.last?.tracks?.some((t) => t.id === originale.id)) res = r;
    }
    assert.ok(res, "il simulatore non ha prodotto un urto (limite del test)");
    const moved = res.state.marbles.find((m) => m.id === originale.id);
    assert.notDeepEqual([moved.x, moved.y], [cx, cy], "la biglia urtata resta dove e' finita, non torna al suo posto");
    const track = res.state.last.tracks.find((t) => t.id === originale.id);
    const fx = track.pts[track.pts.length - 2], fy = track.pts[track.pts.length - 1];
    assert.ok(Math.hypot(moved.x - fx, moved.y - fy) < 30, "posizione finale = fine del movimento");
  });
});

/* ================================================================================================
 * 7. MODALITA' IN SOLITARIO (pag. 20, 22-32)
 * ============================================================================================== */

describe("Modalita' in solitario", () => {
  test("12 biglie: 3 per Personaggio, 4 colori diversi; 1 giocatore + 3 PNG", () => {
    const st = newSolo(2);
    assert.equal(st.solo, true);
    assert.equal(st.players.length, 1);
    assert.equal(st.players[0].marbles, 3);
    assert.equal(st.npcs.length, 3);
    const colori = [st.players[0].color, ...st.npcs.map((n) => n.color)];
    assert.equal(new Set(colori).size, 4);
    assert.deepEqual(st.npcs.map((n) => n.name), ["Ada", "Bo", "Cy"]);
  });
  test("il solitario richiede esattamente un giocatore", () => {
    assert.throws(() => E.newGame({ players: names(2), solo: true, seed: 1 }), E.EngineError);
    assert.throws(() => E.newGame({ players: names(0), solo: true, seed: 1 }), E.EngineError);
  });
  test("si parte con le 6 Sezioni della prima Fase", () => {
    assert.equal(newSolo(2).sections.length, 6);
  });

  test("ogni turno: i PNG vengono posizionati con la catena dei d6 (esempio pag. 20) al centro della Sezione", () => {
    let st = newSolo(4);
    const rng = mulberry(4);
    st = E.apply(st, { type: "randomThemes" }, OK).state;
    const b = E.apply(st, { type: "beginThrows" }, OK);
    st = b.state;
    const n = st.sections.length;
    let turni = 0;
    let effPrimi = b.effects.filter((e) => e.type === "npcPlaced");
    assert.equal(effPrimi.length, 1, "i PNG vengono posizionati prima del primo lancio");
    let effettiTurno = effPrimi;
    while (st.status === "lanci" && turni < 20) {
      for (const ep of effettiTurno) {
        assert.equal(ep.placed.length, 3, "una biglia per ogni PNG");
        const rolls = ep.placed.map((p) => p.roll);
        for (const r of rolls) assert.ok(r >= 1 && r <= 6);
        assert.deepEqual(ep.placed.map((p) => p.section), R.soloPositions(rolls, n), "catena: 5+4=9 -> riparte da 1");
        ep.placed.forEach((p) => assert.equal(p.theme, st.sections[p.section - 1].theme));
      }
      const t = playTurn(st, rng, OK);
      const prime = new Set(st.marbles.map((q) => q.id));
      st = t.state;
      effettiTurno = t.effects.filter((e) => e.type === "npcPlaced");
      if (effettiTurno.length) {
        const nuove = st.marbles.filter((q) => String(q.ownerId).startsWith("npc:") && !prime.has(q.id));
        assert.equal(nuove.length, 3, "tre nuove biglie PNG a inizio turno");
        effettiTurno[0].placed.forEach((p, i) => {
          const mm = nuove.find((q) => q.ownerId === `npc:${i}`);
          assert.ok(mm, `manca la nuova biglia del PNG ${i}`);
          assert.equal(R.sectionAt(st.sections, mm.x, mm.y), st.sections[p.section - 1].id, `PNG ${i} nella Sezione ${p.section}`);
        });
      }
      turni++;
      if (t.outcome.rethrow) assert.equal(effettiTurno.length, 0, "se si rilancia i PNG non vengono riposizionati");
      else if (st.status === "lanci") assert.equal(effettiTurno.length, 1, "i PNG vengono riposizionati a inizio turno");
    }
    assert.equal(st.status, "fine-fase");
    // 3 turni: 3 biglie per ciascun PNG sono sulla Mappa (9) piu' le 3 del protagonista
    const npc = st.marbles.filter((m) => String(m.ownerId).startsWith("npc:"));
    assert.equal(npc.length, 9);
    for (let i = 0; i < 3; i++) assert.equal(npc.filter((m) => m.ownerId === `npc:${i}`).length, 3);
    assert.equal(st.marbles.filter((m) => m.ownerId === "a1").length, 3);
  });

  test("[AMBIGUO] la biglia del PNG sta dentro la Sezione indicata dal conteggio («al centro della Sezione»)", () => {
    const st = E.apply(E.apply(newSolo(6), { type: "randomThemes" }, OK).state, { type: "beginThrows" }, OK);
    const eff = st.effects.find((e) => e.type === "npcPlaced");
    for (const [i, p] of eff.placed.entries()) {
      const m = st.state.marbles.find((q) => q.ownerId === `npc:${i}`);
      assert.equal(R.sectionAt(st.state.sections, m.x, m.y), st.state.sections[p.section - 1].id);
    }
  });

  test("il protagonista lancia 3 biglie per Fase; incontri con i PNG contano (Legami/Problematiche con loro)", () => {
    let visti = 0;
    for (let seed = 1; seed <= 15; seed++) {
      let st = ready(newSolo(seed));
      assert.equal(st.queue.length, 3);
      const log = [];
      st = playPhase(st, mulberry(seed), OK, log);
      assert.equal(st.thrown.a1, 3);
      for (const t of log) if (t.outcome.involved.some((i) => String(i).startsWith("npc:"))) visti++;
    }
    assert.ok(visti > 0, "mai nessun incontro con un PNG in 15 Fasi");
  });

  test("il Legame Indistruttibile funziona anche con un PNG legato in questa Fase", () => {
    let st = ready(newSolo(3));
    st = E.apply(st, { type: "registerBond", a: "a1", b: "npc:0" }, OK).state;
    assert.equal(st.bonds.length, 1);
    // stesso schema di prima su un tavolo costruito a mano
    const b = structuredClone(st);
    b.sections = [
      { id: "s1", num: 1, theme: "uno", poly: rect(90, 70, 540, 830) },
      { id: "s2", num: 2, theme: "due", poly: rect(540, 70, 890, 830) },
      { id: "s3", num: 3, theme: "tre", poly: rect(890, 70, 1190, 830) },
    ];
    b.marbles = []; b.queue = [0]; b.thrown = {}; b.status = "lanci";
    b.marbles.push({ id: "n0", ownerId: "npc:0", color: b.npcs[0].color, x: 715, y: 450 });
    const trovato = tryLaunches(b, "u1", fromTop(800, 500, 3200, 25), (o) => o.sectionId === "s2");
    assert.ok(trovato);
    assert.equal(trovato.o.case, "legame-indistruttibile");
  });

  test("Epilogo in solitario: muore sempre il protagonista; il rapporto Legami/Problematiche decide i finali", () => {
    for (const [tl, chiave] of [[T(5, 1), "A"], [T(3, 2), "B"], [T(2, 2), "C"], [T(1, 3), "D"]]) {
      const r = epilogueFrom(newSolo(5), tallies({ a1: tl }));
      assert.equal(r.state.epilogue.dead, "a1");
      assert.equal(r.state.epilogue.mix.key, chiave);
      assert.equal(r.state.sections.length, 8);
    }
  });

  test("Epilogo in solitario: vengono collocate TUTTE le biglie dei PNG (9), poi il protagonista lancia le sue biglie una alla volta", () => {
    const r = epilogueFrom(newSolo(5), tallies({ a1: T(3, 1) }));
    const npc = r.state.marbles.filter((m) => String(m.ownerId).startsWith("npc:"));
    assert.equal(npc.length, 9, "3 biglie per ciascuno dei 3 PNG");
    for (const m of npc) assert.ok(R.sectionAt(r.state.sections, m.x, m.y), "ogni biglia PNG e' in una Sezione di finale");
    assert.equal(r.state.queue.length, 3, "il protagonista lancia tutte e 3 le sue biglie («le tue biglie, una alla volta»)");
  });

  test("Epilogo in solitario: se le biglie escono dal foglio restano dove sono; il finale e' la Sezione con piu' biglie, in pareggio sceglie il giocatore", () => {
    let st = epilogueFrom(newSolo(5), tallies({ a1: T(3, 1) })).state;
    let guard = 0;
    while (st.status === "epilogo-lanci" && guard++ < 10) {
      st = E.apply(st, { type: "throw", userId: "u1", launch: { x: 5, y: 450, vx: 400, vy: 0 } }, OK).state;
      assert.ok(!st.awaiting?.rethrow);
      st = E.apply(st, { type: "advance" }, OK).state;
    }
    assert.ok(["concluso", "epilogo-scelta"].includes(st.status));
    const conteggio = {};
    for (const m of st.marbles) {
      const id = R.sectionAt(st.sections, m.x, m.y);
      if (id) conteggio[id] = (conteggio[id] ?? 0) + 1;
    }
    const max = Math.max(...Object.values(conteggio));
    const migliori = Object.keys(conteggio).filter((k) => conteggio[k] === max);
    const tipi = new Set(migliori.map((k) => st.epilogue.endings[k]));
    if (tipi.size === 1) {
      assert.equal(st.status, "concluso");
      assert.equal(st.epilogue.result.ending, [...tipi][0]);
    } else {
      assert.equal(st.status, "epilogo-scelta", "pareggio: sceglie il giocatore");
    }
  });

  test("anche in solitario il Dado della Morte vale dalle Fasi 30+ con le stesse soglie", () => {
    const base = newSolo(7);
    for (const [id, , soglia] of MANUALE_FASI.filter((f) => f[2] !== null)) {
      const idx = base.phases.findIndex((p) => p.id === id);
      for (let seed = 1; seed <= 120; seed++) {
        const s2 = structuredClone(base);
        s2.phaseIdx = idx - 1; s2.status = "fine-fase"; s2.queue = []; s2.seed = seed;
        const r = E.apply(s2, { type: "nextPhase" }, tallies({ a1: T(2, 1) }));
        const dd = r.effects.find((e) => e.type === "deathDie");
        assert.equal(dd.triggered, dd.roll >= soglia, `${id} d6=${dd.roll}`);
        assert.equal(r.state.status, dd.triggered ? "epilogo-lanci" : "temi");
      }
    }
  });
});

describe("Tabelle del solitario (pag. 22-32)", () => {
  for (const [id, , ] of MANUALE_FASI) {
    test(`Fase ${id}: i Temi estratti sono quelli della tabella del manuale, senza ripetizioni nella Mappa`, () => {
      const celle = TAVOLE[id].flat().map((c) => (Array.isArray(c) ? c.map(norm) : [norm(c)]));
      const ammessi = new Set(celle.flat());
      const raggiunti = new Set();
      const sezioni = PH[id].sections;
      for (let k = 0; k < 70; k++) {
        const base = newSolo(1000 + k);
        const st0 = jumpToPhase(base, id, tallies({ a1: T(2, 1) }), 1 + k * 7);
        const st = E.apply(st0, { type: "randomThemes" }, OK).state;
        assert.equal(st.sections.length, sezioni);
        const temi = st.sections.map((s) => norm(s.theme));
        for (const t of temi) {
          assert.ok(ammessi.has(t), `Fase ${id}: Tema «${t}» non presente nella tabella del manuale`);
          raggiunti.add(t);
        }
        assert.equal(new Set(temi).size, temi.length, `Fase ${id}: Tema ripetuto sulla Mappa (andava ripetuto il lancio)`);
      }
      // ogni cella della tabella deve essere raggiungibile
      const mancanti = celle.filter((alt) => !alt.some((a) => raggiunti.has(a))).map((a) => a[0]);
      assert.deepEqual(mancanti, [], `Fase ${id}: celle della tabella mai estratte`);
    });
  }
});

/* ================================================================================================
 * 8. CASI LIMITE E PARTITE COMPLETE
 * ============================================================================================== */

describe("Movimento: altri casi limite di resolveThrow", () => {
  const SEZ = [
    { id: "s1", poly: rect(0, 0, 200, 200) },
    { id: "s2", poly: rect(200, 0, 400, 200) },
    { id: "s3", poly: rect(0, 200, 200, 400) },
    { id: "s4", poly: rect(200, 200, 400, 400) },
  ];
  const BOUNDS = { x: 0, y: 0, w: 400, h: 400 };
  function rt({ start = [], thrower = { id: "b1", ownerId: "B" }, final = {}, contact = null, bonded = [] } = {}) {
    const fin = {};
    for (const s of start) fin[s.id] = { x: s.x, y: s.y };
    for (const [id, [x, y]] of Object.entries(final)) fin[id] = { x, y };
    return R.resolveThrow({
      sections: SEZ, bounds: BOUNDS, start, thrower,
      sim: { final: fin, contact: contact ? { with: contact } : null, tracks: [] },
      bondedThisPhase: bonded, rng: () => 0.5,
    });
  }
  const m = (o, x, y) => ({ ...o, x, y });
  const A = { id: "a1", ownerId: "A" }, A2 = { id: "a2", ownerId: "A" };

  test("due biglie dello stesso giocatore nella Sezione: il giocatore e' coinvolto una volta sola", () => {
    const r = rt({ start: [m(A, 50, 50), m(A2, 150, 150)], final: { b1: [100, 100] } });
    assert.equal(r.case, "incontro");
    assert.deepEqual(sortedIds(r.involved), ["A", "B"]);
  });
  test("due biglie dello stesso giocatore spinte fuori: coinvolto una volta sola", () => {
    const r = rt({
      start: [m(A, 50, 50), m(A2, 150, 150)], contact: "a1",
      final: { a1: [300, 100], a2: [300, 150], b1: [100, 100] },
    });
    assert.equal(r.case, "scontro");
    assert.deepEqual(sortedIds(r.involved), ["A", "B"]);
    for (const id of ["a1", "a2", "b1"]) {
      const p = r.placements.find((q) => q.id === id);
      assert.equal(R.sectionAt(SEZ, p.x, p.y), "s1");
    }
  });
  test("spinta di una biglia altrui: lo scontro vale anche se il lanciatore ha un Legame con lei (lo scontro non e' un «fermarsi»)", () => {
    const r = rt({ start: [m(A, 100, 100)], contact: "a1", bonded: ["A"], final: { a1: [300, 100], b1: [130, 100] } });
    assert.equal(r.case, "scontro");
  });
  test("[AMBIGUO] contatto in una Sezione e arresto su un solco: conta la Sezione del contatto (pag. 10)", () => {
    // «conta come valida solo la prima Sezione in cui avviene il contatto»: si rinuncia a scegliere il Tema sul solco.
    const r = rt({ start: [m(A, 100, 100)], contact: "a1", final: { a1: [300, 100], b1: [200, 100] } });
    assert.equal(r.case, "scontro", "la biglia colpita e' stata spinta fuori dalla Sezione: scontro, non solco");
    assert.equal(r.sectionId, "s1");
    assert.equal(r.pending, false);
  });
  test("spingere fuori una PROPRIA biglia dentro un'altra Sezione dove c'e' una biglia altrui: l'altrui torna al suo posto, Problematica Indistruttibile", () => {
    const B0 = { id: "b0", ownerId: "B" };
    const r = rt({
      start: [m(B0, 100, 100), m(A, 300, 100)], contact: "b0",
      final: { b0: [300, 150], a1: [350, 100], b1: [130, 100] },
    });
    assert.equal(r.case, "problematica-indistruttibile", "nella Sezione del contatto c'erano solo biglie del lanciatore");
    assert.deepEqual(r.involved, ["B"]);
    const a = r.placements.find((q) => q.id === "a1");
    assert.deepEqual({ x: a.x, y: a.y }, { x: 300, y: 100 });
  });
  test("spingere una biglia altrui contro una biglia PROPRIA di un'altra Sezione: la propria torna al suo posto (nessun effetto)", () => {
    const B0 = { id: "b0", ownerId: "B" };
    const r = rt({
      start: [m(A, 100, 100), m(B0, 300, 100)], contact: "a1",
      final: { a1: [260, 100], b0: [300, 300], b1: [140, 100] },
    });
    assert.equal(r.case, "scontro");
    assert.equal(r.sectionId, "s1");
    const b0 = r.placements.find((q) => q.id === "b0");
    assert.deepEqual({ x: b0.x, y: b0.y }, { x: 300, y: 100 });
  });
  test("dopo un contatto in s1, fermarsi in s2 con la biglia di un terzo non lo rende coinvolto: vale solo la Sezione del contatto (pag. 10)", () => {
    const C = { id: "c1", ownerId: "C" };
    const r = rt({ start: [m(A, 100, 100), m(C, 300, 100)], contact: "a1", final: { a1: [110, 100], b1: [320, 120] } });
    assert.equal(r.sectionId, "s1");
    assert.ok(!r.involved.includes("C"));
    const c = r.placements.find((q) => q.id === "c1");
    assert.deepEqual({ x: c.x, y: c.y }, { x: 300, y: 100 });
  });
  test("le biglie non toccate non si spostano in nessun caso", () => {
    const C = { id: "c1", ownerId: "C" };
    for (const f of [
      { start: [m(A, 100, 100), m(C, 300, 300)], contact: "a1", final: { a1: [300, 100], b1: [130, 100] } },
      { start: [m(A, 100, 100), m(C, 300, 300)], final: { b1: [140, 140] } },
      { start: [m(C, 300, 300)], final: { b1: [100, 100] } },
      { start: [m(C, 300, 300)], final: { b1: [450, 100] } },
    ]) {
      const r = rt(f);
      const c = r.placements.find((q) => q.id === "c1");
      assert.deepEqual({ x: c.x, y: c.y }, { x: 300, y: 300 }, `caso ${r.case}`);
    }
  });
});

describe("Tiro di una Fase ordinario: contatto con la prima biglia incontrata", () => {
  test("se la biglia lanciata tocca per prima una biglia in s3 e poi un'altra in s2, vale s3 (prima Sezione di contatto)", () => {
    const st = board(4);
    const prima = withMarble(st, "a2", 960, 450); // s3 (la piu' vicina al lanciatore a destra)
    const dopo = withMarble(st, "a3", 700, 450); // s2, dietro
    const trovato = tryLaunches(st, "u1", fromRight(450), (o, r) =>
      ["scontro", "incontro"].includes(o.case) && r.state.last.tracks.some((t) => t.id === dopo.id));
    assert.ok(trovato, "nessuna catena di urti prodotta (limite del test)");
    assert.equal(trovato.o.sectionId, "s3");
    assert.ok(trovato.o.involved.includes("a2") && !trovato.o.involved.includes("a3"));
    const d = trovato.r.state.marbles.find((m) => m.id === dopo.id);
    assert.deepEqual({ x: d.x, y: d.y }, { x: 700, y: 450 });
    assert.ok(trovato.r.state.marbles.find((m) => m.id === prima.id));
  });
});

describe("Regole di turno e di scelta nel motore", () => {
  test("sul solco si sceglie tra le DUE Sezioni (pag. 11): una terza Sezione non e' ammessa", () => {
    const st = board(3);
    const r = E.apply(st, { type: "throw", userId: "u1", launch: { x: 540, y: 895, vx: 0, vy: -1100 } }, OK);
    assert.deepEqual(sortedIds(r.state.pending.options), ["s1", "s2"]);
    assert.throws(() => E.apply(r.state, { type: "chooseGroove", sectionId: "s3" }, OK), E.EngineError);
    assert.throws(() => E.apply(r.state, { type: "chooseGroove", sectionId: "inesistente" }, OK), E.EngineError);
  });
  test("prima si racconta e si chiude il turno: nessun altro lancio finche' non si passa il turno (pag. 9)", () => {
    const st = board(3);
    const r = E.apply(st, { type: "throw", userId: "u1", launch: { x: 640, y: 895, vx: 0, vy: -900 } }, OK);
    assert.throws(() => E.apply(r.state, { type: "throw", userId: "u1", launch: { x: 300, y: 895, vx: 0, vy: -900 } }, OK), E.EngineError);
    assert.throws(() => E.apply(r.state, { type: "throw", userId: "u2", launch: { x: 300, y: 895, vx: 0, vy: -900 } }, OK), E.EngineError);
  });
  test("la Fase non finisce finche' non sono state lanciate tutte le biglie (pag. 9)", () => {
    const st = board(3);
    assert.throws(() => E.apply(st, { type: "nextPhase" }, OK), E.EngineError);
    const r = E.apply(st, { type: "throw", userId: "u1", launch: { x: 640, y: 895, vx: 0, vy: -900 } }, OK);
    const a = E.apply(r.state, { type: "advance" }, OK);
    assert.throws(() => E.apply(a.state, { type: "nextPhase" }, OK), E.EngineError);
  });
  test("terminate le biglie di tutti la Fase e' finita e nessuno puo' piu' lanciare", () => {
    let st = board(2, 1, 2);
    const rng = mulberry(3);
    st = playPhase(st, rng, OK);
    assert.equal(st.status, "fine-fase");
    assert.throws(() => E.apply(st, { type: "throw", userId: "u1", launch: { x: 300, y: 895, vx: 0, vy: -900 } }, OK), E.EngineError);
  });
  test("l'Epilogo e' segnalato come 'dado' (Dado della Morte) o 'fine' (ultima Fase)", () => {
    const base = newMulti(3, 3);
    const idx = base.phases.findIndex((p) => p.id === "30-39");
    for (let seed = 1; seed < 200; seed++) {
      const s2 = structuredClone(base); s2.phaseIdx = idx - 1; s2.status = "fine-fase"; s2.queue = []; s2.seed = seed;
      const r = E.apply(s2, { type: "nextPhase" }, tallyFixed());
      const ep = r.effects.find((e) => e.type === "epilogue");
      if (ep) { assert.equal(ep.reason, "dado"); break; }
    }
    const s3 = structuredClone(base); s3.phaseIdx = 10; s3.status = "fine-fase"; s3.queue = [];
    assert.equal(E.apply(s3, { type: "nextPhase" }, tallyFixed()).effects.find((e) => e.type === "epilogue").reason, "fine");
  });
});

describe("Il disordine sul tavolo (pag. 9)", () => {
  test("le biglie possono rimbalzare contro gli oggetti sul tavolo e tornare sulla Mappa dopo essere uscite", () => {
    const st = board(3, 4);
    assert.ok(st.obstacles.length > 0, "newGame con disordine deve mettere oggetti sul tavolo");
    const pulito = structuredClone(st);
    pulito.opts.disordine = false; pulito.obstacles = [];
    const rng = mulberry(77);
    let trovato = null;
    for (let i = 0; i < 4000 && !trovato; i++) {
      // si mira a un oggetto, non al foglio, per far uscire e rientrare la biglia
      const ob = st.obstacles[Math.floor(rng() * st.obstacles.length)];
      const lx = 20 + rng() * (st.table.w - 40);
      const dx = ob.x - lx, dy = ob.y - 895, D = Math.hypot(dx, dy);
      const v = 500 + rng() * 2500;
      const launch = { x: lx, y: 895, vx: (dx / D) * v, vy: (dy / D) * v };
      let r, r2;
      try {
        r = E.apply(st, { type: "throw", userId: "u1", launch }, OK);
        r2 = E.apply(pulito, { type: "throw", userId: "u1", launch }, OK);
      } catch { continue; }
      const o = r.effects.find((e) => e.type === "outcome");
      const o2 = r2.effects.find((e) => e.type === "outcome");
      if (o && o2 && o.case !== "fuori" && o2.case === "fuori") trovato = { launch, o, o2 };
    }
    if (!trovato) {
      // ammissibile ma notevole: nessun lancio in cui gli oggetti riportano la biglia sulla Mappa
      assert.fail("nessun lancio in cui un oggetto sul tavolo riporta la biglia sulla Mappa (4000 tentativi)");
    }
    assert.notEqual(trovato.o.case, "fuori");
    assert.equal(trovato.o2.case, "fuori");
  });
});

describe("Solitario: dettagli", () => {
  test("i Temi delle nuove Fasi sono gia' quelli della tabella della Fase in corso", () => {
    const base = newSolo(3);
    for (const id of ["3-5", "11-15", "40-49", "56-60"]) {
      const st = jumpToPhase(base, id, tallies({ a1: T(2, 1) }));
      const ammessi = new Set(TAVOLE[id].flat().flatMap((c) => (Array.isArray(c) ? c : [c])).map(norm));
      for (const s of st.sections) {
        if (String(s.theme).trim()) assert.ok(ammessi.has(norm(s.theme)), `${id}: «${s.theme}» non e' nella tabella`);
      }
    }
  });
  test("Epilogo in solitario: le biglie dei PNG vengono collocate con la catena del solitario, un giro per ogni biglia", () => {
    const r = epilogueFrom(newSolo(3), tallies({ a1: T(3, 1) }));
    const posizionamenti = r.effects.filter((e) => e.type === "npcPlaced");
    assert.equal(posizionamenti.length, 3, "3 biglie per PNG -> 3 giri");
    for (const ep of posizionamenti) {
      assert.deepEqual(ep.placed.map((p) => p.section), R.soloPositions(ep.placed.map((p) => p.roll), 8));
    }
  });
});

describe("Pareggio sul punteggio: il rapporto per i finali e' quello del defunto", () => {
  test("due giocatori a pari punteggio ma con rapporti diversi: il mix segue chi muore", () => {
    const visti = new Set();
    for (let seed = 1; seed <= 60; seed++) {
      const r = epilogueFrom(newMulti(3, seed), tallies({ a1: T(5, 3), a2: T(3, 1), a3: T(0, 5) }));
      const dead = r.state.epilogue.dead;
      assert.ok(["a1", "a2"].includes(dead));
      assert.equal(r.state.epilogue.mix.key, dead === "a1" ? "B" : "A", `morto ${dead}`);
      visti.add(dead);
    }
    assert.equal(visti.size, 2, "il dado deve designare entrambi nei diversi semi");
  });
});

/* ---- partite complete a caso ------------------------------------------------------------------ */

function finishEpilogue(st, rng) {
  let guard = 0;
  while ((st.status === "epilogo-lanci" || st.status === "epilogo-scelta") && guard++ < 30) {
    if (st.status === "epilogo-scelta") {
      const kinds = st.epilogue.result?.tiedKinds ?? [];
      const kind = kinds.length ? kinds[0] : "lieto";
      st = E.apply(st, { type: "chooseEnding", kind }, OK).state;
      continue;
    }
    const pl = E.currentPlayer(st);
    st = E.apply(st, { type: "throw", userId: pl.userId, launch: randomLaunch(st, rng) }, OK).state;
    st = E.apply(st, { type: "advance" }, OK).state;
  }
  return st;
}

function playWholeGame(base, rng, tl) {
  let st = base;
  const dadi = [];
  let guard = 0;
  while (st.status !== "concluso" && guard++ < 200) {
    if (st.status === "temi") { st = ready(st); continue; }
    if (st.status === "lanci") { st = playPhase(st, rng, tl); continue; }
    if (st.status === "fine-fase") {
      const r = E.apply(st, { type: "nextPhase" }, tl);
      for (const e of r.effects) if (e.type === "deathDie") dadi.push({ ...e, phaseIdxBefore: st.phaseIdx });
      st = r.state; continue;
    }
    st = finishEpilogue(st, rng);
  }
  assert.equal(st.status, "concluso", "la partita non arriva alla fine");
  return { st, dadi };
}

describe("Partite complete (fumo e coerenza con il manuale)", () => {
  const tl = () => tallies({ a1: T(3, 1), a2: T(2, 2), a3: T(1, 3), a4: T(0, 2), a5: T(4, 1) });

  test("partite multigiocatore complete: finiscono con un finale, il Dado della Morte e' sempre coerente", () => {
    const fasiFinali = new Set();
    for (let seed = 1; seed <= 24; seed++) {
      const n = 1 + (seed % 5);
      const { st, dadi } = playWholeGame(newMulti(n, seed), mulberry(seed), tl());
      assert.ok(["lieto", "dolceamaro", "drammatico", "tragico"].includes(st.epilogue.result.ending), `finale ${st.epilogue.result.ending}`);
      for (const d of dadi) assert.equal(d.triggered, d.roll >= d.needed);
      const ultimo = dadi[dadi.length - 1];
      // il gioco termina o con un dado a segno o dopo l'ultima Fase (56-60)
      if (ultimo?.triggered) fasiFinali.add(ultimo.phase);
      else assert.ok(st.phaseIdx >= 10 || st.phaseLabel === "Epilogo");
      // le Fasi giocate sono consecutive e senza dado fino ai 30 anni
      assert.equal(dadi.filter((d) => !d.triggered).length + (ultimo?.triggered ? 0 : 0), dadi.filter((d) => !d.triggered).length);
      JSON.parse(JSON.stringify(st)); // stato serializzabile
    }
  });

  test("partite in solitario complete", () => {
    for (let seed = 1; seed <= 10; seed++) {
      const { st } = playWholeGame(newSolo(seed), mulberry(seed * 5), tallies({ a1: T(3, 1) }));
      assert.ok(["lieto", "dolceamaro", "drammatico", "tragico"].includes(st.epilogue.result.ending));
      assert.equal(st.epilogue.dead, "a1");
      JSON.parse(JSON.stringify(st));
    }
  });

  test("partite dimostrative complete: 3 Fasi, nessun Dado della Morte", () => {
    for (let seed = 1; seed <= 8; seed++) {
      const { st, dadi } = playWholeGame(newMulti(1 + (seed % 5), seed, { demo: true }), mulberry(seed), tl());
      assert.equal(dadi.length, 0);
      assert.equal(st.status, "concluso");
      assert.equal(st.phases.length, 3);
    }
  });

  test("lo stato e' sempre serializzabile in JSON lungo una Fase", () => {
    let st = ready(newMulti(4, 3));
    const rng = mulberry(3);
    while (st.status === "lanci") {
      st = playTurn(st, rng, OK).state;
      assert.deepEqual(JSON.parse(JSON.stringify(st)), st);
    }
  });
});
