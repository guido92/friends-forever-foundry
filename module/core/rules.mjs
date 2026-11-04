/**
 * Regole di Friends Forever (pure): fasi, Dado della Morte, esiti del Movimento delle biglie,
 * Epilogo. Nessuna dipendenza da Foundry, così è testabile con Node.
 */
import {
  distToPolygonEdge,
  nearestInteriorPoint,
  packInSection,
  pointInPolygon,
  polygonArea,
  polygonCentroid,
  round1,
  rectPolygon,
} from "./geometry.mjs";
import { PHYS } from "./physics.mjs";

/** Le 11 Fasi del gioco completo. `death` = valore minimo del d6 che innesca l'Epilogo. */
export const PHASES = [
  { id: "3-5", label: "3–5 anni", age: 3, sections: 6, death: null },
  { id: "6-7", label: "6–7 anni", age: 6, sections: 8, death: null },
  { id: "8-10", label: "8–10 anni", age: 8, sections: 8, death: null },
  { id: "11-15", label: "11–15 anni", age: 11, sections: 8, death: null },
  { id: "16-18", label: "16–18 anni", age: 16, sections: 8, death: null },
  { id: "19-23", label: "19–23 anni", age: 19, sections: 12, death: null },
  { id: "24-29", label: "24–29 anni", age: 24, sections: 12, death: null },
  { id: "30-39", label: "30–39 anni", age: 30, sections: 12, death: 6 },
  { id: "40-49", label: "40–49 anni", age: 40, sections: 16, death: 5 },
  { id: "50-55", label: "50–55 anni", age: 50, sections: 16, death: 4 },
  { id: "56-60", label: "56–60 anni", age: 56, sections: 16, death: 3 },
];

/** Sessione dimostrativa: 3 Fasi, poi Epilogo senza Dado della Morte. */
export const DEMO_PHASES = [
  { id: "demo-1", label: "6–10 anni", age: 6, sections: 8, death: null, spunti: ["6-7", "8-10"] },
  { id: "demo-2", label: "11–18 anni", age: 11, sections: 8, death: null, spunti: ["11-15", "16-18"] },
  { id: "demo-3", label: "19–23 anni", age: 19, sections: 12, death: null, spunti: ["19-23"] },
];

export const ENDING_TYPES = {
  lieto: { id: "lieto", label: "Finale lieto", sign: "+" },
  dolceamaro: { id: "dolceamaro", label: "Finale dolceamaro", sign: "+/−" },
  drammatico: { id: "drammatico", label: "Finale drammatico", sign: "−" },
  tragico: { id: "tragico", label: "Finale tragico", sign: "−−" },
};

/** Biglie a testa: 2 fino a 3 giocatori, 3 altrimenti. */
export function marblesPerPlayer(playerCount) {
  return playerCount <= 3 ? 2 : 3;
}

export function deathTriggers(phase, roll) {
  return phase.death != null && roll >= phase.death;
}

/** Rapporto Legami/Problematiche → quantità di finali (sempre 8 Sezioni). */
export function endingMix(legami, problemi) {
  let key;
  if (legami === problemi) key = "C";
  else if (legami >= 2 * problemi) key = "A";
  else if (legami > problemi) key = "B";
  else key = "D";
  const table = {
    A: { lieto: 4, dolceamaro: 3, drammatico: 1 },
    B: { lieto: 3, dolceamaro: 3, drammatico: 2 },
    C: { lieto: 2, dolceamaro: 3, drammatico: 3 },
    D: { lieto: 1, dolceamaro: 3, drammatico: 4 },
  };
  return { key, ...table[key] };
}

/** Voci attive di un personaggio → punteggio (le Indistruttibili valgono doppio). */
export function tally(voci) {
  let legami = 0;
  let problemi = 0;
  for (const v of voci) {
    if (v.rimosso) continue;
    const w = v.indistruttibile ? 2 : 1;
    if (v.tipo === "legame") legami += w;
    else if (v.tipo === "problematica") problemi += w;
  }
  return { legami, problemi, score: legami - problemi };
}

/**
 * Chi muore: il punteggio più alto; se pari serve un tiro di d6 tra i pari (`tieRolls`: id → tiro).
 * @returns {{dead:string|null, tied:string[], needsRoll:boolean}}
 */
export function pickDead(scores, tieRolls = {}) {
  const max = Math.max(...Object.values(scores));
  const tied = Object.keys(scores).filter((id) => scores[id] === max);
  if (tied.length === 1) return { dead: tied[0], tied, needsRoll: false };
  const rolled = tied.filter((id) => tieRolls[id] != null);
  if (rolled.length < tied.length) return { dead: null, tied, needsRoll: true };
  const best = Math.max(...tied.map((id) => tieRolls[id]));
  const top = tied.filter((id) => tieRolls[id] === best);
  if (top.length === 1) return { dead: top[0], tied, needsRoll: false };
  return { dead: null, tied: top, needsRoll: true };
}

/** Ripartisce i finali sulle 8 Sezioni dell'Epilogo (mescolati da `rng`). */
export function assignEndings(mix, rng) {
  const list = [
    ...Array(mix.lieto).fill("lieto"),
    ...Array(mix.dolceamaro).fill("dolceamaro"),
    ...Array(mix.drammatico).fill("drammatico"),
  ];
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
}

/** Sezioni dell'Epilogo: metà foglio (a destra), 2×4 celle di eguale grandezza. */
export function epilogueSections(paper) {
  const half = { x: paper.x + paper.w / 2, y: paper.y, w: paper.w / 2, h: paper.h };
  const cols = 2;
  const rows = 4;
  const cw = half.w / cols;
  const ch = half.h / rows;
  const out = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      out.push({
        id: `e${r * cols + c + 1}`,
        poly: rectPolygon({ x: half.x + c * cw, y: half.y + r * ch, w: cw, h: ch }),
      });
    }
  }
  return { half, sections: out };
}

/** Finale che vince: la Sezione con più biglie; pari → decide chi interpreta il defunto. */
export function pickEnding(sections, marbles, endingBySection) {
  const counts = new Map();
  for (const s of sections) counts.set(s.id, 0);
  for (const m of marbles) {
    const sec = sectionAt(sections, m.x, m.y);
    if (sec) counts.set(sec, counts.get(sec) + 1);
  }
  const max = Math.max(0, ...counts.values());
  if (max === 0) return { ending: "tragico", sectionIds: [], tie: false, counts };
  const top = [...counts].filter(([, n]) => n === max).map(([id]) => id);
  const kinds = [...new Set(top.map((id) => endingBySection[id]))];
  return { ending: kinds.length === 1 ? kinds[0] : null, sectionIds: top, tie: kinds.length > 1, counts };
}

/** Sezione che contiene il punto (o null). Con `bounds`, fuori dal foglio = null. */
export function sectionAt(sections, x, y, bounds = null, tol = 0) {
  if (bounds && !(x >= bounds.x && x <= bounds.x + bounds.w && y >= bounds.y && y <= bounds.y + bounds.h)) {
    // tolleranza sul bordo: una biglia ferma a pochi pixel fuori conta nella Sezione più vicina
    const near =
      tol > 0 && x >= bounds.x - tol && x <= bounds.x + bounds.w + tol && y >= bounds.y - tol && y <= bounds.y + bounds.h + tol;
    if (!near) return null;
    let best = null;
    let bestD = Infinity;
    for (const s of sections) {
      const d = distToPolygonEdge(x, y, s.poly);
      if (d < bestD) {
        bestD = d;
        best = s.id;
      }
    }
    return best;
  }
  for (const s of sections) if (pointInPolygon(x, y, s.poly)) return s.id;
  return null;
}

/** Sezioni confinanti a meno di `tol` px dal punto (per il "solco"). */
export function groovesAt(sections, x, y, tol = 7) {
  const near = sections.filter((s) => distToPolygonEdge(x, y, s.poly) < tol).map((s) => s.id);
  return near;
}

/**
 * Risolve l'esito del Movimento di un tiro.
 *
 * @param {object} ctx
 * @param {{id:string,poly:number[][]}[]} ctx.sections
 * @param {{x:number,y:number,w:number,h:number}} ctx.bounds foglio utile (con metà strappata: solo la metà)
 * @param {{id:string,ownerId:string,x:number,y:number}[]} ctx.start biglie sulla Mappa prima del tiro (esclusa quella lanciata)
 * @param {{id:string,ownerId:string}} ctx.thrower
 * @param {{tracks:any[],final:Record<string,{x:number,y:number}>,contact:null|{with:string}}} ctx.sim
 * @param {string[]} [ctx.bondedThisPhase] ownerId che hanno già un Legame con il lanciatore in questa Fase
 * @param {string} [ctx.chosenSection] Sezione scelta quando la biglia è sul solco
 * @param {()=>number} [ctx.rng]
 * @returns esito con `case`, `sectionId`, `involved` (ownerId), `placements` ({id,x,y} posizioni finali di tutte le biglie)
 */
export function resolveThrow(ctx) {
  const { sections, bounds, start, thrower, sim, bondedThisPhase = [], chosenSection = null } = ctx;
  const rng = ctx.rng ?? Math.random;
  const byId = new Map(sections.map((s) => [s.id, s]));
  const startSec = new Map(start.map((m) => [m.id, sectionAt(sections, m.x, m.y, bounds)]));
  const endPos = new Map(start.map((m) => [m.id, sim.final[m.id] ?? { x: m.x, y: m.y }]));
  const endSec = new Map(start.map((m) => [m.id, sectionAt(sections, endPos.get(m.id).x, endPos.get(m.id).y, bounds)]));
  const tPos = sim.final[thrower.id];
  const tEndSec = sectionAt(sections, tPos.x, tPos.y, bounds, 12);
  const contactedId = sim.contact?.with ?? null;
  const owners = new Map(start.map((m) => [m.id, m.ownerId]));

  // 1. nessun contatto
  if (!contactedId) {
    if (!tEndSec) {
      return finish({ case: "fuori", rethrow: true, sectionId: null, involved: [], restore: true });
    }
    if (chosenSection) return inSectionNoPush(chosenSection, true);
    const near = groovesAt(sections, tPos.x, tPos.y);
    if (near.length >= 2) {
      return { case: "solco", pending: true, options: near, rethrow: false, involved: [], sectionId: null, placements: [] };
    }
    // ferma entro la tolleranza ma di poco fuori dal foglio: la biglia viene rimessa dentro la Sezione
    const sullaCarta = tPos.x >= bounds.x && tPos.x <= bounds.x + bounds.w && tPos.y >= bounds.y && tPos.y <= bounds.y + bounds.h;
    return inSectionNoPush(tEndSec, !sullaCarta);
  }

  // 2. contatto: conta solo la Sezione della prima biglia toccata
  const contactSec = startSec.get(contactedId);
  if (!contactSec) {
    // toccata una biglia ai margini del foglio (centro fuori): trattiamo come uscita con contatto
    return finish({ case: "fuori", rethrow: true, sectionId: null, involved: [], restore: true, note: "contatto fuori mappa" });
  }
  const originals = start.filter((m) => startSec.get(m.id) === contactSec);
  const pushed = originals.filter((m) => endSec.get(m.id) !== contactSec);
  if (pushed.length > 0) {
    const allOwn = originals.every((m) => m.ownerId === thrower.ownerId);
    const involved = unique([thrower.ownerId, ...pushed.map((m) => m.ownerId)]);
    if (allOwn) {
      return finish({
        case: "problematica-indistruttibile",
        sectionId: contactSec,
        involved: [thrower.ownerId],
        move: [thrower.id, ...pushed.map((m) => m.id)],
      });
    }
    return finish({ case: "scontro", sectionId: contactSec, involved, move: [thrower.id, ...pushed.map((m) => m.id)] });
  }
  return inSectionNoPush(contactSec, true);

  // ---- helper ----
  function inSectionNoPush(sectionId, moveThrower) {
    const present = start.filter((m) => startSec.get(m.id) === sectionId);
    const others = unique(present.filter((m) => m.ownerId !== thrower.ownerId).map((m) => m.ownerId));
    const bonded = others.filter((o) => bondedThisPhase.includes(o));
    const move = moveThrower ? [thrower.id] : [];
    if (others.length > 0 && bonded.length > 0) {
      return finish({ case: "legame-indistruttibile", sectionId, involved: [thrower.ownerId, ...others], move });
    }
    if (others.length > 0) {
      return finish({ case: "incontro", sectionId, involved: [thrower.ownerId, ...others], move });
    }
    if (present.length > 0) {
      return finish({ case: "propri", sectionId, involved: [thrower.ownerId], move });
    }
    return finish({ case: "racconto", sectionId, involved: [thrower.ownerId], move });
  }

  function finish(o) {
    const sectionId = o.sectionId ?? null;
    const sec = sectionId ? byId.get(sectionId) : null;
    const move = new Set(o.move ?? []);
    const placements = [];
    // posizioni finali di tutti
    const finals = new Map();
    for (const m of start) finals.set(m.id, { ...endPos.get(m.id) });
    finals.set(thrower.id, { ...tPos });
    // biglie di altre Sezioni toccate/sbalzate tornano al loro posto, senza effetti
    for (const m of start) {
      if (sectionId && startSec.get(m.id) === sectionId) continue;
      finals.set(m.id, { x: m.x, y: m.y });
    }
    // chi va portato dentro la Sezione dello scontro / del contatto
    if (sec && move.size) {
      const occupied = [];
      for (const m of start) {
        if (move.has(m.id)) continue;
        const f = finals.get(m.id);
        if (sectionAt(sections, f.x, f.y, bounds) === sectionId) occupied.push([f.x, f.y]);
      }
      const ids = [...move];
      // il lanciatore resta dov'è se è già dentro e non sovrapposto; altrimenti ricollocalo
      const spots = packInSection(sec.poly, occupied, ids.length, PHYS.radius, rng);
      ids.forEach((id, i) => finals.set(id, { x: spots[i][0], y: spots[i][1] }));
    }
    for (const [id, p] of finals) placements.push({ id, x: round1(p.x), y: round1(p.y) });
    return {
      case: o.case,
      rethrow: !!o.rethrow,
      sectionId,
      involved: o.involved ?? [],
      note: o.note ?? null,
      pending: false,
      encounter: ["incontro", "legame-indistruttibile", "scontro"].includes(o.case),
      placements,
    };
  }
}

function unique(a) {
  return [...new Set(a)];
}

/** Pulsante "correzione": riposiziona il lanciatore nella Sezione scelta, dopo la scelta sul solco. */
export function seatOnGroove(sections, sectionId, x, y) {
  const sec = sections.find((s) => s.id === sectionId);
  const [px, py] = nearestInteriorPoint(sec.poly, x, y, PHYS.radius + 4);
  return { x: round1(px), y: round1(py) };
}

/** A fine Fase: se nessun incontro ha prodotto Legami/Problematiche, tutti eliminano un Legame. */
export function phaseEndPenalty(encounters) {
  return encounters === 0;
}

// ---------------------------------------------------------------------------
// Modalità in solitario
// ---------------------------------------------------------------------------

/** Tema dalla tabella della Fase: due d6 (X, Y) → casella; `cells` ha 36 voci, riga 1 per prima. */
export function soloTheme(cells, x, y) {
  return cells[(y - 1) * 6 + (x - 1)];
}

/**
 * Posizionamento dei PNG: il primo d6 dà la Sezione; i successivi proseguono il conteggio
 * (superato il numero di Sezioni si riparte da 1).
 * @returns numeri di Sezione 1..n
 */
export function soloPositions(rolls, sectionCount) {
  const out = [];
  let acc = 0;
  for (const r of rolls) {
    acc = out.length === 0 ? r : acc + r;
    acc = ((acc - 1) % sectionCount) + 1;
    out.push(acc);
  }
  return out;
}

export function sectionCentroid(section) {
  return polygonCentroid(section.poly);
}

export function sectionArea(section) {
  return polygonArea(section.poly);
}
