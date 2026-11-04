/**
 * Motore della partita: macchina a stati PURA (nessuna dipendenza da Foundry).
 * `apply(state, action, ctx)` → `{ state, effects }`. Gli effetti (messaggi in chat, tiri di dado
 * mostrati, ecc.) vengono eseguiti da chi chiama (Foundry), così il flusso è testabile con Node.
 *
 * Stati (`state.status`):
 *   temi          → le Sezioni sono tracciate, i giocatori scrivono i Temi
 *   lanci         → si lanciano le biglie a turno (`state.awaiting` = in attesa della narrazione)
 *   fine-fase     → tutte le biglie lanciate
 *   epilogo-lanci → l'Epilogo: una biglia a testa sulla metà del foglio
 *   epilogo-scelta→ pareggio tra due finali: sceglie chi interpreta il defunto
 *   concluso      → partita finita
 */
import { mulberry32, generateSections, packInSection, polygonCentroid, round1 } from "../core/geometry.mjs";
import {
  PAPER,
  TABLE,
  PHYS,
  createWorld,
  simulateThrow,
  erasureResidue,
  clutterObstacles,
  tableProps,
  seamOf,
} from "../core/physics.mjs";
import {
  PHASES,
  DEMO_PHASES,
  ENDING_TYPES,
  marblesPerPlayer,
  deathTriggers,
  endingMix,
  pickDead,
  assignEndings,
  epilogueSections,
  pickEnding,
  resolveThrow,
  seatOnGroove,
  sectionAt,
  soloPositions,
  soloTheme,
} from "../core/rules.mjs";
import { spuntiPerFase } from "../data/spunti.mjs";
import { tabellaSolitario } from "../data/solitario.mjs";

export const MARBLE_COLORS = ["#d6453d", "#3b82c4", "#4caf50", "#e6b422", "#8e5bc0"];
export const NPC_COLORS = ["#e07b39", "#2fa89a", "#d867a5"];

const clone = (o) => JSON.parse(JSON.stringify(o));

export class EngineError extends Error {}

function rngFor(state) {
  state.counter = (state.counter ?? 0) + 1;
  return mulberry32((state.seed + state.counter * 7919) >>> 0);
}

function d6(state) {
  return Math.floor(rngFor(state)() * 6) + 1;
}

export function phaseOf(state) {
  return state.phases[state.phaseIdx];
}

export function boundsOf(state) {
  return state.torn ? state.half : state.paper;
}

function newMarbleId(state) {
  state.marbleSeq = (state.marbleSeq ?? 0) + 1;
  return `m${state.marbleSeq}`;
}

// ---------------------------------------------------------------------------
// Nuova partita
// ---------------------------------------------------------------------------

/**
 * @param {object} cfg
 * @param {{userId:string,actorId:string,name:string}[]} cfg.players in ordine di posto (senso orario)
 * @param {boolean} [cfg.demo]
 * @param {boolean} [cfg.solo]
 * @param {boolean} [cfg.disordine] ostacoli sul tavolo
 * @param {string[]} [cfg.npcNames] solitario: nomi dei 3 PNG
 * @param {number} [cfg.seed]
 */
export function newGame(cfg) {
  const players = cfg.players.map((p, i) => ({ ...p, color: p.color ?? MARBLE_COLORS[i % MARBLE_COLORS.length] }));
  if (players.length < 1 || players.length > 5) throw new EngineError("Servono da 1 a 5 giocatori.");
  const solo = !!cfg.solo;
  if (solo && players.length !== 1) throw new EngineError("Il solitario si gioca con un solo giocatore.");
  const seed = cfg.seed ?? Math.floor(Math.random() * 2 ** 31);
  const per = solo ? 3 : marblesPerPlayer(players.length);
  const state = {
    v: 1,
    status: "temi",
    solo,
    demo: !!cfg.demo,
    opts: { disordine: cfg.disordine ?? true },
    seed,
    counter: 0,
    marbleSeq: 0,
    seq: 0,
    paper: { ...PAPER },
    table: { ...TABLE },
    phases: (cfg.demo ? DEMO_PHASES : PHASES).map((p) => ({ ...p })),
    phaseIdx: 0,
    phaseLabel: "",
    players: players.map((p) => ({ ...p, marbles: per })),
    npcs: solo
      ? (cfg.npcNames ?? ["Amico 1", "Amico 2", "Amico 3"]).slice(0, 3).map((name, i) => ({ name, color: NPC_COLORS[i] }))
      : [],
    firstIdx: 0,
    turnIdx: 0,
    queue: [],
    thrown: {},
    sections: [],
    residue: { smudges: [], creases: [] },
    obstacles: [],
    marbles: [],
    torn: false,
    half: null,
    encounters: 0,
    bonds: [],
    awaiting: null,
    pending: null,
    last: null,
    epilogue: null,
    log: [],
  };
  const rng = mulberry32(seed);
  state.firstIdx = Math.floor(rng() * players.length);
  state.turnIdx = state.firstIdx;
  state.obstacles = state.opts.disordine ? clutterObstacles(state.paper, state.table, mulberry32(seed ^ 0x9e3779b9), Math.min(14, 3 + 2 * players.length)) : [];
  const effects = [];
  startPhase(state, effects);
  return { state, effects };
}

function startPhase(state, effects) {
  const phase = phaseOf(state);
  state.phaseLabel = phase.label;
  state.status = "temi";
  state.marbles = [];
  state.thrown = {};
  state.encounters = 0;
  state.bonds = [];
  state.awaiting = null;
  state.pending = null;
  state.last = null;
  state.torn = false;
  state.half = null;
  const rng = rngFor(state);
  state.sections = generateSections(phase.sections, state.paper, rng).map((s, i) => ({ ...s, num: i + 1, theme: "" }));
  state.residue = erasureResidue(state.phaseIdx, state.paper, rng);
  if (state.solo) rollSoloThemes(state);
  effects.push({ type: "phase", phase: phase.label, index: state.phaseIdx, total: state.phases.length, first: state.players[state.firstIdx].name });
}

function rollSoloThemes(state) {
  const table = tabellaSolitario(phaseOf(state));
  const used = new Set();
  for (const s of state.sections) {
    let theme = "";
    for (let tries = 0; tries < 60; tries++) {
      const x = d6(state);
      const y = d6(state);
      theme = soloTheme(table, x, y);
      if (!used.has(theme)) break;
    }
    used.add(theme);
    s.theme = theme;
  }
}

// ---------------------------------------------------------------------------
// Azioni
// ---------------------------------------------------------------------------

/**
 * @param {object} state stato corrente (NON viene modificato: si lavora su una copia)
 * @param {{type:string}&Record<string,any>} action
 * @param {{getTally:(actorId:string)=>{legami:number,problemi:number,score:number}}} ctx
 */
export function apply(state, action, ctx = {}) {
  const s = clone(state);
  const effects = [];
  const h = HANDLERS[action.type];
  if (!h) throw new EngineError(`Azione sconosciuta: ${action.type}`);
  h(s, action, effects, ctx);
  s.seq += 1;
  return { state: s, effects };
}

const HANDLERS = {
  setTheme(s, a) {
    if (s.status !== "temi") throw new EngineError("I Temi si scrivono prima dei lanci.");
    const sec = s.sections.find((x) => x.id === a.sectionId);
    if (!sec) throw new EngineError("Sezione inesistente.");
    sec.theme = String(a.text ?? "").slice(0, 40);
  },

  randomThemes(s) {
    if (s.status !== "temi") throw new EngineError("I Temi si scrivono prima dei lanci.");
    if (s.solo) return rollSoloThemes(s);
    const pool = spuntiPerFase(phaseOf(s));
    const used = new Set(s.sections.map((x) => x.theme).filter(Boolean));
    const rng = rngFor(s);
    const avail = pool.filter((p) => !used.has(p));
    for (const sec of s.sections) {
      if (sec.theme) continue;
      const i = Math.floor(rng() * avail.length);
      sec.theme = avail.splice(i, 1)[0] ?? pool[Math.floor(rng() * pool.length)];
    }
  },

  rerollSections(s) {
    if (s.status !== "temi") throw new EngineError("Le Sezioni si ridisegnano prima dei Temi.");
    const rng = rngFor(s);
    const old = s.sections;
    s.sections = generateSections(phaseOf(s).sections, s.paper, rng).map((x, i) => ({ ...x, num: i + 1, theme: old[i]?.theme ?? "" }));
  },

  beginThrows(s, a, effects) {
    if (s.status !== "temi") throw new EngineError("Si è già nei lanci.");
    if (s.sections.some((x) => !x.theme.trim())) throw new EngineError("Ogni Sezione deve avere un Tema.");
    s.status = "lanci";
    const n = s.players.length;
    s.queue = [];
    const per = s.players[0].marbles;
    for (let k = 0; k < per; k++) for (let i = 0; i < n; i++) s.queue.push((s.firstIdx + i) % n);
    s.thrown = Object.fromEntries(s.players.map((p) => [p.actorId, 0]));
    s.turnIdx = s.queue[0];
    s.awaiting = null;
    startTurn(s, effects);
  },

  throw(s, a, effects) {
    if (s.status !== "lanci" && s.status !== "epilogo-lanci") throw new EngineError("Non è il momento dei lanci.");
    if (s.pending) throw new EngineError("Prima scegli la Sezione sul solco.");
    if (s.awaiting) throw new EngineError("Prima racconta quanto accaduto e passa il turno.");
    const player = s.players[s.turnIdx];
    if (!a.force && a.userId !== player.userId) throw new EngineError("Non è il tuo turno.");
    if (!insideTableMargin(s, a.launch)) throw new EngineError("Lancia dal bordo del tavolo, fuori dal foglio.");
    if (s.status === "epilogo-lanci") return throwEpilogue(s, a, effects, player);
    doThrow(s, a, effects, player);
  },

  chooseGroove(s, a, effects) {
    if (!s.pending) throw new EngineError("Nessuna scelta in sospeso.");
    const p = s.pending;
    if (!p.options.includes(a.sectionId)) throw new EngineError("Sezione non valida.");
    const pos = seatOnGroove(s.sections, a.sectionId, p.final.x, p.final.y);
    p.sim.final[p.marble.id] = pos;
    s.pending = null;
    finishThrow(s, effects, p, a.sectionId);
  },

  advance(s, a, effects) {
    if (s.status === "epilogo-lanci") {
      if (!s.awaiting) throw new EngineError("Niente da chiudere.");
      s.awaiting = null;
      return nextEpilogueTurn(s, effects);
    }
    if (s.status !== "lanci" || !s.awaiting) throw new EngineError("Niente da chiudere.");
    const rethrow = s.awaiting.rethrow;
    s.awaiting = null;
    if (!rethrow) s.queue.shift();
    if (s.queue.length === 0) {
      s.status = "fine-fase";
      effects.push({ type: "phaseEnd", encounters: s.encounters, penalty: s.encounters === 0, label: phaseOf(s).label });
      return;
    }
    s.turnIdx = s.queue[0];
    if (!rethrow) startTurn(s, effects);
  },

  registerBond(s, a) {
    const key = [a.a, a.b].sort().join("|");
    if (!s.bonds.includes(key)) s.bonds.push(key);
  },

  nextPhase(s, a, effects, ctx) {
    if (s.status !== "fine-fase") throw new EngineError("La Fase non è finita.");
    const next = s.phaseIdx + 1;
    if (next >= s.phases.length) return startEpilogue(s, effects, ctx, "fine");
    const phase = s.phases[next];
    const nextFirst = (s.firstIdx + 1) % s.players.length;
    if (phase.death != null) {
      const roll = d6(s);
      const triggered = deathTriggers(phase, roll);
      s.deathRoll = { seq: s.seq + 1, roll, needed: phase.death, triggered, phase: phase.label, by: s.players[nextFirst].name };
      effects.push({
        type: "deathDie",
        roll,
        needed: phase.death,
        triggered,
        phase: phase.label,
        by: s.players[nextFirst].name,
      });
      if (triggered) {
        s.firstIdx = nextFirst;
        return startEpilogue(s, effects, ctx, "dado");
      }
    }
    s.phaseIdx = next;
    s.firstIdx = nextFirst;
    s.turnIdx = nextFirst;
    startPhase(s, effects);
  },

  chooseEnding(s, a, effects) {
    if (s.status !== "epilogo-scelta") throw new EngineError("Nessuna scelta da fare.");
    if (!s.epilogue.result.tiedKinds.includes(a.kind)) throw new EngineError("Finale non valido.");
    concludeGame(s, effects, a.kind);
  },

  swapEndings(s, a) {
    if (s.status !== "epilogo-lanci" || s.marbles.length) throw new EngineError("Si possono spostare i finali solo prima dei lanci.");
    const e = s.epilogue.endings;
    [e[a.a], e[a.b]] = [e[a.b], e[a.a]];
    for (const sec of s.sections) sec.theme = ENDING_TYPES[e[sec.id]].label;
  },

  reset(s) {
    s.status = "concluso";
    s.aborted = true;
  },
};

function insideTableMargin(s, launch) {
  if (!launch || ![launch.x, launch.y, launch.vx, launch.vy].every(Number.isFinite)) return false;
  const p = boundsOf(s); // fuori dal foglio rimasto (nell'Epilogo, la metà strappata è tavolo)
  const inPaper = launch.x > p.x && launch.x < p.x + p.w && launch.y > p.y && launch.y < p.y + p.h;
  return !inPaper && launch.x > 0 && launch.x < s.table.w && launch.y > 0 && launch.y < s.table.h;
}

// ---------------------------------------------------------------------------
// Turni e tiri
// ---------------------------------------------------------------------------

function startTurn(s, effects) {
  if (s.solo && s.status === "lanci") placeNpcMarbles(s, effects);
}

/** Solitario: a inizio turno si posiziona una biglia per ciascun PNG (conteggio a catena sui d6). */
function placeNpcMarbles(s, effects, count = s.npcs.length) {
  const nSec = s.sections.length;
  const rolls = Array.from({ length: count }, () => d6(s));
  const nums = soloPositions(rolls, nSec);
  const placed = [];
  nums.forEach((num, i) => {
    const sec = s.sections[num - 1];
    const occupied = s.marbles.map((m) => [m.x, m.y]);
    const [pos] = packInSection(sec.poly, occupied, 1, PHYS.radius, rngFor(s));
    const id = newMarbleId(s);
    s.marbles.push({ id, ownerId: `npc:${i}`, color: s.npcs[i].color, x: pos[0], y: pos[1] });
    placed.push({ npc: s.npcs[i].name, roll: rolls[i], section: sec.num, theme: sec.theme });
  });
  effects.push({ type: "npcPlaced", placed });
}

function buildWorld(s) {
  return createWorld({
    table: s.table,
    paper: boundsOf(s),
    smudges: s.residue.smudges,
    creases: s.residue.creases,
    crumples: s.residue.crumples ?? [],
    seam: s.torn ? null : seamOf(s.paper),
    obstacles: [...s.obstacles, ...tableProps()],
    torn: s.torn ? { ...s.paper } : null,
    marbles: s.marbles.map((m) => ({ id: m.id, x: m.x, y: m.y })),
  });
}

function doThrow(s, a, effects, player) {
  const marble = { id: newMarbleId(s), ownerId: player.actorId, color: player.color };
  const sim = simulateThrow(buildWorld(s), marble.id, a.launch, { seed: (s.seed + s.counter * 31 + s.marbleSeq) >>> 0 });
  s.counter += 1;
  const rec = {
    marble,
    sim,
    final: sim.final[marble.id],
    launch: a.launch,
    playerIdx: s.turnIdx,
    bonded: bondedOwners(s, player.actorId),
  };
  const first = resolveForState(s, rec, null);
  if (first.pending) {
    s.pending = { marble, sim: { final: sim.final, contact: sim.contact, tracks: [], collisions: [], duration: 0 }, final: sim.final[marble.id], options: first.options, playerIdx: rec.playerIdx, launch: a.launch };
    s.last = lastRecord(s, sim, null, marble);
    effects.push({ type: "solco", player: player.name, options: first.options.map((id) => s.sections.find((x) => x.id === id).num) });
    return;
  }
  applyOutcome(s, effects, rec, first);
}

function bondedOwners(s, ownerId) {
  const out = [];
  for (const k of s.bonds) {
    const [x, y] = k.split("|");
    if (x === ownerId) out.push(y);
    else if (y === ownerId) out.push(x);
  }
  return out;
}

function resolveForState(s, rec, chosenSection) {
  const rng = rngFor(s);
  return resolveThrow({
    sections: s.sections,
    bounds: boundsOf(s),
    start: s.marbles.map((m) => ({ id: m.id, ownerId: m.ownerId, x: m.x, y: m.y })),
    thrower: rec.marble,
    sim: rec.sim,
    bondedThisPhase: rec.bonded,
    chosenSection,
    rng,
  });
}

function finishThrow(s, effects, pending, chosenSection) {
  const rec = {
    marble: pending.marble,
    sim: pending.sim,
    final: pending.sim.final[pending.marble.id],
    playerIdx: pending.playerIdx,
    launch: pending.launch,
    bonded: bondedOwners(s, pending.marble.ownerId),
  };
  const out = resolveForState(s, rec, chosenSection);
  applyOutcome(s, effects, rec, out);
}

function lastRecord(s, sim, outcome, marble) {
  return {
    seq: s.seq + 1,
    marble,
    tracks: sim.tracks,
    hits: sim.collisions.slice(0, 60).map((c) => [Math.round(c.t * 100) / 100, c.v]),
    duration: sim.duration,
    outcome,
  };
}

function applyOutcome(s, effects, rec, out) {
  const player = s.players[rec.playerIdx];
  // aggiorna le posizioni
  const byId = new Map(out.placements.map((p) => [p.id, p]));
  for (const m of s.marbles) {
    const p = byId.get(m.id);
    if (p) {
      m.x = p.x;
      m.y = p.y;
    }
  }
  if (!out.rethrow) {
    const p = byId.get(rec.marble.id);
    s.marbles.push({ ...rec.marble, x: p.x, y: p.y });
    s.thrown[player.actorId] = (s.thrown[player.actorId] ?? 0) + 1;
  }
  if (out.encounter) s.encounters += 1;
  const sec = out.sectionId ? s.sections.find((x) => x.id === out.sectionId) : null;
  const summary = {
    case: out.case,
    rethrow: out.rethrow,
    sectionId: out.sectionId,
    sectionNum: sec?.num ?? null,
    theme: sec?.theme ?? null,
    involved: out.involved,
    thrower: player.actorId,
    throwerName: player.name,
  };
  s.last = lastRecord(s, rec.sim, summary, rec.marble);
  s.awaiting = { rethrow: out.rethrow, case: out.case };
  effects.push({ type: "outcome", ...summary, involvedNames: out.involved.map((o) => ownerName(s, o)) });
}

export function ownerName(s, ownerId) {
  const p = s.players.find((x) => x.actorId === ownerId);
  if (p) return p.name;
  const m = /^npc:(\d)$/.exec(ownerId);
  if (m) return s.npcs[+m[1]]?.name ?? "PNG";
  return ownerId;
}

// ---------------------------------------------------------------------------
// Epilogo
// ---------------------------------------------------------------------------

function startEpilogue(s, effects, ctx, reason) {
  const scores = {};
  const tallies = {};
  for (const p of s.players) {
    const t = ctx.getTally?.(p.actorId) ?? { legami: 0, problemi: 0, score: 0 };
    tallies[p.actorId] = t;
    scores[p.actorId] = t.score;
  }
  const tieRolls = {};
  let dead;
  let guard = 0;
  while (guard++ < 50) {
    const r = pickDead(scores, tieRolls);
    if (!r.needsRoll) {
      dead = r.dead;
      break;
    }
    for (const id of r.tied) tieRolls[id] = d6(s);
    effects.push({ type: "tieRolls", rolls: r.tied.map((id) => ({ name: ownerName(s, id), roll: tieRolls[id] })) });
  }
  const mix = endingMix(tallies[dead].legami, tallies[dead].problemi);
  const { half, sections } = epilogueSections(s.paper);
  const kinds = assignEndings(mix, rngFor(s));
  const endings = Object.fromEntries(sections.map((sec, i) => [sec.id, kinds[i]]));
  s.epilogue = { reason, scores, tallies, dead, mix, endings, tieRolls, result: null };
  s.status = "epilogo-lanci";
  s.torn = true;
  s.half = half;
  s.sections = sections.map((sec, i) => ({ ...sec, num: i + 1, theme: ENDING_TYPES[endings[sec.id]].label }));
  s.residue = { smudges: [], creases: [] };
  s.marbles = [];
  s.awaiting = null;
  s.pending = null;
  s.last = null;
  s.phaseLabel = "Epilogo";
  const deadIdx = s.players.findIndex((p) => p.actorId === dead);
  // inizia il giocatore a sinistra di chi muore? Il regolamento non lo precisa: parte dal primo giocatore
  s.queue = Array.from({ length: s.players.length }, (_, i) => (s.firstIdx + i) % s.players.length);
  if (s.solo) {
    s.queue = Array.from({ length: s.players[0].marbles }, () => 0);
    // Tutti i PNG, una biglia alla volta, col conteggio a catena
    for (let k = 0; k < 3; k++) placeNpcMarbles(s, effects);
  }
  s.turnIdx = s.queue[0];
  effects.push({
    type: "epilogue",
    reason,
    dead: ownerName(s, dead),
    deadIdx,
    scores: s.players.map((p) => ({ name: p.name, ...tallies[p.actorId] })),
    mix,
  });
}

function throwEpilogue(s, a, effects, player) {
  const marble = { id: newMarbleId(s), ownerId: player.actorId, color: player.color };
  const sim = simulateThrow(buildWorld(s), marble.id, a.launch, { seed: (s.seed + s.counter * 31 + s.marbleSeq) >>> 0 });
  s.counter += 1;
  for (const m of s.marbles) {
    const f = sim.final[m.id];
    if (f) {
      m.x = f.x;
      m.y = f.y;
    }
  }
  const f = sim.final[marble.id];
  s.marbles.push({ ...marble, x: f.x, y: f.y });
  s.thrown[player.actorId] = (s.thrown[player.actorId] ?? 0) + 1;
  const sec = sectionAt(s.sections, f.x, f.y, boundsOf(s));
  s.last = lastRecord(s, sim, { case: "epilogo", thrower: player.actorId, throwerName: player.name, sectionId: sec, rethrow: false }, marble);
  s.awaiting = { rethrow: false, case: "epilogo" };
  const num = sec ? s.sections.find((x) => x.id === sec).num : null;
  effects.push({
    type: "epilogueThrow",
    player: player.name,
    section: num,
    ending: sec ? s.epilogue.endings[sec] : null,
  });
}

function nextEpilogueTurn(s, effects) {
  s.queue.shift();
  if (s.queue.length > 0) {
    s.turnIdx = s.queue[0];
    return;
  }
  const pe = pickEnding(s.sections, s.marbles, s.epilogue.endings);
  const tiedKinds = [...new Set(pe.sectionIds.map((id) => s.epilogue.endings[id]))];
  s.epilogue.result = { ending: pe.ending, tie: pe.tie, tiedKinds, counts: Object.fromEntries(pe.counts) };
  if (pe.tie) {
    s.status = "epilogo-scelta";
    effects.push({ type: "endingTie", kinds: tiedKinds, chooser: ownerName(s, s.epilogue.dead) });
    return;
  }
  concludeGame(s, effects, pe.ending);
}

function concludeGame(s, effects, kind) {
  s.status = "concluso";
  s.epilogue.result = { ...(s.epilogue.result ?? {}), ending: kind };
  effects.push({ type: "ending", kind, label: ENDING_TYPES[kind].label, sign: ENDING_TYPES[kind].sign, dead: ownerName(s, s.epilogue.dead) });
}

/** Giocatore di turno (oggetto) o null. */
export function currentPlayer(state) {
  if (!["lanci", "epilogo-lanci"].includes(state.status)) return null;
  return state.players[state.turnIdx] ?? null;
}

/** Biglie ancora in mano al giocatore (da lanciare). */
export function marblesLeft(state, player) {
  if (state.status === "epilogo-lanci") {
    const total = state.solo ? player.marbles : 1;
    return Math.max(0, total - (state.thrown[player.actorId] ?? 0));
  }
  return Math.max(0, player.marbles - (state.thrown[player.actorId] ?? 0));
}
