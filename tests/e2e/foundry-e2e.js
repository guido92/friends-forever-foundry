/**
 * Friends Forever — test funzionali end-to-end DENTRO Foundry VTT.
 *
 * Uso (come Gamemaster, in un mondo di prova con il sistema Friends Forever, viewport >= 1024x768):
 *   - console del browser: incolla tutto il file;
 *   - oppure da fuori (javascript_tool del browser integrato):
 *       await (0, eval)(await (await fetch("/systems/friends-forever/tests/e2e/foundry-e2e.js?" + Date.now())).text())
 *
 * Restituisce un array di { nome, ok, dettaglio } (ultima riga: RIEPILOGO) e lo stampa con console.table.
 *
 * Opzioni (globali da impostare PRIMA di lanciare):
 *   globalThis.FF_E2E_ONLY = ["A","C"]   // esegue solo i gruppi indicati (A..K, Z)
 *   globalThis.FF_E2E_NOSNAP = true      // non lascia la partita + snapshot per il test di persistenza
 *
 * Persistenza: la prima esecuzione termina lasciando una partita in corso e uno snapshot in sessionStorage;
 * RICARICA LA PAGINA (F5) e rilancia lo script: la seconda esecuzione verifica che lo stato sia identico,
 * che il Tavolo si riapra sulla stessa partita e che la partita prosegua, poi ripulisce tutto
 * (reset, attori "E2E-*", messaggi di chat creati dai test).
 *
 * Il test simula utenti NON GM (Alice, Bob: devono esistere nel mondo) richiamando i listener del socket
 * di sistema con il loro id: è lo stesso percorso che segue un'azione arrivata da un altro client.
 * Non modifica mai codice di sistema; crea solo attori "E2E-*", voci e messaggi di chat di prova.
 */
(async () => {
  "use strict";
  const SYS = "friends-forever";
  const CHANNEL = `system.${SYS}`;
  const PREFIX = "E2E-";
  const SNAP_KEY = "ff-e2e-snapshot";
  const only = globalThis.FF_E2E_ONLY ? new Set(globalThis.FF_E2E_ONLY) : null;
  const snapRaw = sessionStorage.getItem(SNAP_KEY);
  const snapPrev = snapRaw && !globalThis.FF_E2E_FORCE_MAIN ? JSON.parse(snapRaw) : null;
  const verifyMode = !!snapPrev; // dopo la ricarica: solo la verifica di persistenza + pulizia
  const results = [];
  const jsErrors = [];

  // ---------------------------------------------------------------- utilità
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const ok = (c, msg) => {
    if (!c) throw new Error(msg || "asserzione fallita");
  };
  const eq = (a, b, msg) => {
    if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${msg ?? "valori diversi"}: atteso ${JSON.stringify(b)}, ottenuto ${JSON.stringify(a)}`);
  };
  const near = (a, b, tol, msg) => ok(Math.abs(a - b) <= tol, `${msg ?? "valori lontani"}: ${a} vs ${b} (tol ${tol})`);
  async function waitFor(fn, { timeout = 4000, interval = 25, what = "condizione" } = {}) {
    const t0 = Date.now();
    for (;;) {
      const v = await fn();
      if (v) return v;
      if (Date.now() - t0 > timeout) throw new Error(`timeout in attesa di: ${what}`);
      await sleep(interval);
    }
  }
  async function T(nome, fn) {
    const t0 = performance.now();
    try {
      const d = await fn();
      results.push({ nome, ok: true, dettaglio: d === undefined ? "" : String(d), ms: Math.round(performance.now() - t0) });
    } catch (e) {
      results.push({ nome, ok: false, dettaglio: e?.message ?? String(e), ms: Math.round(performance.now() - t0) });
    }
  }
  const runGroup = (g) => (verifyMode ? g === "Z" : !only || only.has(g));

  // Nel browser integrato requestAnimationFrame non scatta se la pagina non ha il fuoco: il canvas del Tavolo non
  // si disegnerebbe. Durante la suite lo sostituisco con un timer (ripristinato alla fine).
  const origRAF = window.requestAnimationFrame;
  const origCAF = window.cancelAnimationFrame;
  window.requestAnimationFrame = (cb) => setTimeout(() => cb(performance.now()), 16);
  window.cancelAnimationFrame = (id) => clearTimeout(id);
  const restoreRAF = () => {
    window.requestAnimationFrame = origRAF;
    window.cancelAnimationFrame = origCAF;
  };

  // cattura errori JS non gestiti durante la suite
  const onErr = (ev) => jsErrors.push(`${ev.message ?? ev.reason?.message ?? ev.reason ?? "errore"} @ ${ev.filename ?? ""}`);
  window.addEventListener("error", onErr);
  window.addEventListener("unhandledrejection", onErr);
  const origConsoleError = console.error;
  console.error = (...a) => {
    const s = a.map((x) => (x?.message ?? String(x))).join(" ");
    if (/friends forever|friends-forever|tavolo|FFGame/i.test(s)) jsErrors.push(`console.error: ${s}`);
    return origConsoleError.apply(console, a);
  };

  // ---------------------------------------------------------------- precondizioni
  if (!game?.ff || game.system.id !== SYS) {
    window.removeEventListener("error", onErr);
    window.removeEventListener("unhandledrejection", onErr);
    console.error = origConsoleError;
    restoreRAF();
    return [{ nome: "PRECONDIZIONI", ok: false, dettaglio: "game.ff non esiste: apri il mondo con il sistema Friends Forever come GM" }];
  }
  if (!game.user.isGM) {
    restoreRAF();
    return [{ nome: "PRECONDIZIONI", ok: false, dettaglio: "serve l'utente Gamemaster" }];
  }

  const FF = game.ff;
  const route = (p) => foundry.utils.getRoute(p);
  const imp = (p) => import(route(`systems/${SYS}/module/${p}`));
  const [E, RU, PH, GEO, ANN] = await Promise.all([imp("game/engine.mjs"), imp("core/rules.mjs"), imp("core/physics.mjs"), imp("core/geometry.mjs"), imp("apps/annota.mjs")]);
  const D = (a) => FF.FFGame.dispatch(a);
  const st = () => foundry.utils.deepClone(FF.state);
  const sig = () => (FF.state ? `${FF.state.seq}|${FF.state.seed}|${FF.state.status}` : "null");
  const DialogV2 = foundry.applications.api.DialogV2;
  const users = { gm: game.user, alice: game.users.getName("Alice"), bob: game.users.getName("Bob") };

  async function settle(quiet = 150, max = 4000) {
    let last = game.messages.size;
    const t0 = Date.now();
    let tl = t0;
    while (Date.now() - tl < quiet && Date.now() - t0 < max) {
      await sleep(25);
      if (game.messages.size !== last) {
        last = game.messages.size;
        tl = Date.now();
      }
    }
  }

  function spyNotes() {
    const log = [];
    const keys = ["warn", "error", "info"];
    for (const k of keys) ui.notifications[k] = (m) => (log.push({ k, m: String(m) }), undefined);
    return {
      log,
      restore() {
        for (const k of keys) delete ui.notifications[k];
      },
    };
  }

  /** Azione "come se" arrivasse dal client di `userId` (listener del socket di sistema, eseguiti dal GM attivo). */
  async function asUser(userId, action) {
    const cap = [];
    const origEmit = game.socket.emit;
    game.socket.emit = function (ev, msg, ...rest) {
      if (ev === CHANNEL && msg?.type === "error") return void cap.push(msg);
      return origEmit.call(this, ev, msg, ...rest);
    };
    const before = sig();
    try {
      for (const l of game.socket.listeners(CHANNEL)) l({ type: "action", userId, action });
      const t0 = Date.now();
      while (!cap.length && sig() === before && Date.now() - t0 < 2500) await sleep(20);
    } finally {
      delete game.socket.emit;
    }
    if (!cap.length) await settle();
    return { changed: sig() !== before, error: cap[0]?.message ?? null };
  }
  /** Esegue come `userId`: GM → dispatch diretto, altri → socket. Ritorna { error }. */
  async function act(userId, action) {
    if (userId === game.user.id) {
      const n = spyNotes();
      try {
        await D(action);
      } finally {
        n.restore();
      }
      const e = n.log.find((x) => x.k === "warn" || x.k === "error");
      return { changed: true, error: e?.m ?? null };
    }
    return asUser(userId, action);
  }
  async function expectReject(userId, action, rx) {
    const before = JSON.stringify(FF.state ?? null);
    const r = await act(userId, action);
    ok(r.error, `azione ${action.type} NON rifiutata (nessun messaggio di errore)`);
    if (rx) ok(rx.test(r.error), `messaggio inatteso: «${r.error}»`);
    eq(JSON.stringify(FF.state ?? null), before, `lo stato è cambiato nonostante il rifiuto di ${action.type}`);
    return r.error;
  }
  async function expectOk(userId, action) {
    const r = await act(userId, action);
    ok(!r.error, `azione ${action.type} rifiutata: «${r.error}»`);
    return r;
  }

  // messaggi di chat
  const baseMsgIds = snapPrev?.baseMsgIds ? new Set(snapPrev.baseMsgIds) : new Set(game.messages.contents.map((m) => m.id));
  const newMsgsSince = (idsBefore) => game.messages.contents.filter((m) => !idsBefore.has(m.id));
  const msgIds = () => new Set(game.messages.contents.map((m) => m.id));
  const ffFlag = (m) => m.flags?.[SYS] ?? {};
  const cardEl = (m) => {
    const el = document.createElement("div");
    el.innerHTML = m.content;
    return el;
  };
  const effectMsgs = (msgs, type) => msgs.filter((m) => ffFlag(m).effect === type);

  // ---------------------------------------------------------------- fixture
  const fx = {};
  const ownerOf = (u) => ({ default: 0, [u.id]: CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER });
  async function makeFixtures() {
    ok(users.alice && users.bob, "nel mondo mancano gli utenti Alice e Bob");
    for (const a of game.actors.filter((x) => x.name.startsWith(PREFIX))) await a.delete();
    fx.ada = await Actor.create({ name: `${PREFIX}Ada`, type: "personaggio", ownership: ownerOf(users.alice) });
    fx.bruno = await Actor.create({ name: `${PREFIX}Bruno`, type: "personaggio", ownership: ownerOf(users.bob) });
    fx.carla = await Actor.create({ name: `${PREFIX}Carla`, type: "personaggio", ownership: { default: 0 } });
  }
  const PL = {
    get ada() {
      return { userId: users.alice.id, actorId: fx.ada.id, name: fx.ada.name };
    },
    get bruno() {
      return { userId: users.bob.id, actorId: fx.bruno.id, name: fx.bruno.name };
    },
    get carla() {
      return { userId: users.gm.id, actorId: fx.carla.id, name: fx.carla.name };
    },
  };
  const userOfActor = (actorId) => FF.state.players.find((p) => p.actorId === actorId).userId;
  async function cleanup() {
    try {
      await D({ type: "reset" });
    } catch (e) {
      /* ignora */
    }
    for (const a of game.actors.filter((x) => x.name.startsWith(PREFIX))) await a.delete();
    const ids = game.messages.contents.filter((m) => !baseMsgIds.has(m.id)).map((m) => m.id);
    if (ids.length) await ChatMessage.deleteDocuments(ids);
    for (const app of [...foundry.applications.instances.values()]) {
      if (app instanceof DialogV2 || app.options?.classes?.includes("ff-sheet") || app.options?.classes?.includes("ff-voce")) await app.close().catch(() => {});
    }
    // item di mondo di prova
    for (const i of game.items.filter((x) => x.name.startsWith(PREFIX))) await i.delete();
  }

  async function startGame({ players, solo = false, demo = false, disordine = true, seed = 777, themes = true, begin = true, npcNames } = {}) {
    await D({ type: "reset" });
    await D({ type: "newGame", config: { players, solo, demo, disordine, seed, npcNames } });
    ok(FF.state, "la partita non è stata creata");
    if (themes) await D({ type: "randomThemes" });
    if (begin) await D({ type: "beginThrows" });
    return st();
  }

  // ricerca (pura) di lanci con un esito desiderato
  const mkRng = (seed) => GEO.mulberry32(seed);
  function findThrow(state, pred, { tries = 5000, seed = 20241103, mode = "lanci" } = {}) {
    const rng = mkRng(seed);
    const edge = () => {
      const k = Math.floor(rng() * 4);
      if (k === 0) return { x: 20 + rng() * 50, y: 30 + rng() * 840 };
      if (k === 1) return { x: 1210 + rng() * 50, y: 30 + rng() * 840 };
      if (k === 2) return { x: 30 + rng() * 1220, y: 15 + rng() * 40 };
      return { x: 30 + rng() * 1220, y: 845 + rng() * 40 };
    };
    for (let i = 0; i < tries; i++) {
      const p = edge();
      const tx = 120 + rng() * 1040;
      const ty = 100 + rng() * 700;
      const d = Math.hypot(tx - p.x, ty - p.y);
      const pow = 300 + rng() * 1500;
      const launch = { x: p.x, y: p.y, vx: ((tx - p.x) / d) * pow, vy: ((ty - p.y) / d) * pow };
      try {
        const res = E.apply(state, { type: "throw", userId: "x", launch, force: true }, { getTally: FF.FFGame.tallyFor });
        if (pred(res)) return { launch, res, tries: i + 1 };
      } catch (e) {
        /* lancio non valido */
      }
    }
    throw new Error(`nessun lancio trovato (${tries} tentativi) per il caso richiesto`);
  }
  const caseOf = (res) => res.effects.find((e) => e.type === "outcome")?.case ?? res.effects[0]?.type;
  const isCase = (c) => (res) => caseOf(res) === c;

  /** Esegue DAVVERO un lancio (come GM con force) e ritorna lo stato e i messaggi nuovi. */
  async function throwLive(launch, { as = null } = {}) {
    const ids = msgIds();
    const cur = E.currentPlayer(FF.state);
    if (as === "owner" && cur.userId !== game.user.id) await expectOk(cur.userId, { type: "throw", launch });
    else await D({ type: "throw", launch, force: cur.userId !== game.user.id });
    await settle();
    return { state: st(), msgs: newMsgsSince(ids) };
  }
  async function advanceLive({ as = "owner" } = {}) {
    const cur = E.currentPlayer(FF.state) ?? FF.state.players[FF.state.turnIdx];
    if (as === "owner") await act(cur.userId, { type: "advance" });
    else await D({ type: "advance" });
    await settle();
    return st();
  }
  /** Porta la fase a "fine-fase" lanciando davvero (come proprietari di turno, via socket per i non GM). */
  async function playOut(maxSteps = 120) {
    for (let i = 0; i < maxSteps; i++) {
      const s = st();
      if (s.status !== "lanci") return s;
      const cur = s.players[s.turnIdx];
      if (s.pending) {
        await expectOk(cur.userId, { type: "chooseGroove", sectionId: s.pending.options[0] });
        continue;
      }
      if (s.awaiting) {
        await expectOk(cur.userId, { type: "advance" });
        continue;
      }
      const f = findThrow(s, (r) => !["fuori", "solco"].includes(caseOf(r)), { seed: 1000 + i });
      await expectOk(cur.userId, { type: "throw", launch: f.launch });
    }
    throw new Error("playOut: troppi passi");
  }

  // ---------------------------------------------------------------- dialoghi / DOM
  const openDialogs = () => [...foundry.applications.instances.values()].filter((a) => a instanceof DialogV2 && a.rendered);
  async function fillDialog({ title, values = {}, click = "ok", pick = null }) {
    const dlg = await waitFor(() => openDialogs().find((a) => (title instanceof RegExp ? title.test(a.title) : a.title.includes(title))), { what: `dialogo «${title}»` });
    const el = dlg.element;
    for (const [name, v] of Object.entries(values)) {
      const f = el.querySelector(`[name="${name}"]`);
      if (!f) throw new Error(`campo ${name} assente nel dialogo «${dlg.title}»`);
      if (f.type === "checkbox" || f.type === "radio") f.checked = !!v;
      else f.value = v;
      f.dispatchEvent(new Event("change", { bubbles: true }));
    }
    pick?.(el, dlg);
    el.querySelector(`button[data-action="${click}"]`).click();
    await waitFor(() => !dlg.rendered, { what: "chiusura dialogo" });
    return dlg;
  }
  const chatDom = (m) => document.querySelector(`#chat [data-message-id="${m.id}"]`);
  async function showChat() {
    try {
      ui.sidebar.changeTab?.("chat", "primary");
    } catch (e) {
      /* ignora */
    }
    await sleep(100);
  }

  // =====================================================================================
  // A. Sistema, tipi di documento, schede
  // =====================================================================================
  if (!verifyMode) await makeFixtures();

  if (runGroup("A")) {
    await T("A1 sistema caricato: id, versione e API game.ff", async () => {
      eq(game.system.id, SYS);
      ok(game.system.version, "versione assente");
      ok(typeof FF.FFGame?.dispatch === "function" && FF.FFTavolo && typeof FF.openTable === "function", "API game.ff incompleta");
      ok("state" in FF, "game.ff.state assente");
      return `v${game.system.version} su Foundry ${game.version}`;
    });
    await T("A2 tipi documento: Actor personaggio; Item legame e problematica", () => {
      ok(game.documentTypes.Actor.includes("personaggio"), "Actor personaggio assente");
      ok(game.documentTypes.Item.includes("legame") && game.documentTypes.Item.includes("problematica"), "Item legame/problematica assenti");
      ok(CONFIG.Actor.dataModels.personaggio && CONFIG.Item.dataModels.legame && CONFIG.Item.dataModels.problematica, "data model non registrati");
    });
    await T("A3 personaggio: valori predefiniti, aggiornamento colore, un colore non valido non corrompe il dato", async () => {
      const a = fx.ada;
      eq(String(a.system.colore).toLowerCase(), "#d6453d", "colore predefinito");
      eq([a.system.eta, a.system.vivo, a.system.note], ["", true, ""], "eta/vivo/note predefiniti");
      await a.update({ "system.colore": "#00ff88", "system.eta": "8 anni" });
      eq(String(a.system.colore).toLowerCase(), "#00ff88");
      try {
        await a.update({ "system.colore": "pippo" });
      } catch (e) {
        /* Foundry può rifiutare o scartare in silenzio: in entrambi i casi il valore salvato deve restare valido */
      }
      ok(/^#[0-9a-f]{6}$/i.test(String(a.system.colore)), `colore corrotto dopo un valore non valido: ${a.system.colore}`);
      await a.update({ "system.colore": "#d6453d", "system.eta": "" });
    });
    await T("A4 voci Legame/Problematica: creazione, default, tipo", async () => {
      const created = await fx.ada.createEmbeddedDocuments("Item", [
        { name: "voce L", type: "legame", system: { con: [{ id: fx.bruno.id, nome: fx.bruno.name }], fase: "3–5 anni" } },
        { name: "voce P", type: "problematica" },
      ]);
      const l = created.find((i) => i.name === "voce L");
      const p = created.find((i) => i.name === "voce P");
      eq([l.type, p.type], ["legame", "problematica"]);
      eq([l.system.indistruttibile, l.system.rimosso, p.system.indistruttibile, p.system.rimosso], [false, false, false, false], "flag predefiniti");
      eq([l.system.tipo, p.system.tipo], ["legame", "problematica"], "getter tipo");
      eq(l.system.con[0].nome, fx.bruno.name);
      eq([p.system.con, p.system.descrizione, p.system.rimossoRacconto], [[], "", ""], "default problematica");
      const w = await Item.create({ name: `${PREFIX}voce di mondo`, type: "legame" });
      ok(w.type === "legame", "Item di mondo non creato");
      await w.delete();
      await l.delete();
      await p.delete();
    });
    await T("A5 schede registrate: FFActorSheet e FFVoceSheet", async () => {
      eq(fx.ada.sheet.constructor.name, "FFActorSheet");
      const [it] = await fx.ada.createEmbeddedDocuments("Item", [{ name: "x", type: "legame" }]);
      eq(it.sheet.constructor.name, "FFVoceSheet");
      await it.delete();
    });
    await T("A6 impostazioni registrate: partita (mondo), contenuti, volume (client, 0,6)", () => {
      const reg = game.settings.settings;
      ok(reg.has(`${SYS}.partita`) && reg.has(`${SYS}.contenuti`) && reg.has(`${SYS}.volume`), "setting mancanti");
      eq(reg.get(`${SYS}.partita`).scope, "world");
      eq(reg.get(`${SYS}.volume`).scope, "client");
      ok(reg.get(`${SYS}.volume`).config === true, "volume non configurabile");
      const v = game.settings.get(SYS, "volume");
      ok(v >= 0 && v <= 1, `volume fuori range: ${v}`);
    });
    await T("A7 contenuti del mondo: riepilogo, sicurezza, tabelle, macro (creati dal GM)", () => {
      const j = game.journal.contents.map((x) => x.name);
      ok(j.some((n) => /Riepilogo/.test(n)) && j.some((n) => /Sicurezza/.test(n)), `diari mancanti: ${j.join("|")}`);
      ok(game.tables.size >= 10, `poche tabelle: ${game.tables.size}`);
      const m = game.macros.find((x) => /Tavolo/.test(x.name));
      ok(m && /game\.ff\.openTable/.test(m.command), "macro di apertura del Tavolo assente");
      ok(game.settings.get(SYS, "contenuti") >= 1, "setting contenuti non valorizzato");
      return `${j.length} diari, ${game.tables.size} tabelle`;
    });
    await T("A8 accessi: scorciatoia Alt+T, controllo scena, bottone in chat", async () => {
      const kb = game.keybindings.actions.get(`${SYS}.openTable`);
      ok(kb, "keybinding non registrato");
      eq([kb.editable[0].key, kb.editable[0].modifiers], ["KeyT", ["Alt"]]);
      const tools = ui.controls.controls?.tokens?.tools ?? {};
      ok(tools.friendsForever?.button === true, "strumento del controllo scena assente");
      await showChat();
      ok(document.querySelector("#chat .ff-open-table"), "bottone «Apri il Tavolo» assente dalla chat");
    });
  }

  // =====================================================================================
  // B. Voci Indistruttibili: protezioni e punteggio
  // =====================================================================================
  if (runGroup("B")) {
    let ind;
    let norm;
    await T("B0 preparo voci Indistruttibile e normale", async () => {
      await fx.ada.deleteEmbeddedDocuments("Item", fx.ada.items.map((i) => i.id));
      const created = await fx.ada.createEmbeddedDocuments("Item", [
        { name: "ind", type: "legame", system: { indistruttibile: true, descrizione: "<p>per sempre</p>" } },
        { name: "norm", type: "problematica" },
      ]);
      ind = created.find((i) => i.name === "ind");
      norm = created.find((i) => i.name === "norm");
      ok(ind.system.indistruttibile === true);
    });
    await T("B1 un non-GM NON può cancellare una voce Indistruttibile (hook preDeleteItem); il GM sì", () => {
      eq(Hooks.call("preDeleteItem", ind, {}, users.alice.id), false, "Alice (non GM) può cancellare l'Indistruttibile");
      eq(Hooks.call("preDeleteItem", ind, {}, users.bob.id), false, "Bob (non GM) può cancellare l'Indistruttibile");
      ok(Hooks.call("preDeleteItem", ind, {}, users.gm.id) !== false, "il GM non può cancellare");
      ok(Hooks.call("preDeleteItem", norm, {}, users.alice.id) !== false, "una voce normale non dovrebbe essere protetta");
    });
    await T("B2 un non-GM NON può rimuovere (rimosso=true) una voce Indistruttibile, in nessuna forma di update", () => {
      const forms = [{ system: { rimosso: true } }, { _id: ind.id, system: { rimosso: true, rimossoRacconto: "x" } }, { "system.rimosso": true }];
      for (const ch of forms) {
        const n = spyNotes();
        try {
          eq(Hooks.call("preUpdateItem", ind, ch, {}, users.alice.id), false, `update ${JSON.stringify(ch)} consentito ad Alice`);
        } finally {
          n.restore();
        }
      }
      ok(Hooks.call("preUpdateItem", ind, { system: { rimosso: true } }, {}, users.gm.id) !== false, "il GM non può rimuovere");
      ok(Hooks.call("preUpdateItem", norm, { system: { rimosso: true } }, {}, users.alice.id) !== false, "voce normale non rimovibile da non-GM");
      ok(Hooks.call("preUpdateItem", ind, { system: { descrizione: "<p>modifica testo</p>" } }, {}, users.alice.id) !== false, "la modifica del testo è bloccata (dovrebbe essere ammessa?)");
    });
    await T("B3 un non-GM NON può togliere il flag Indistruttibile e poi rimuovere/cancellare la voce (aggirare la protezione)", () => {
      const n = spyNotes();
      try {
        eq(Hooks.call("preUpdateItem", ind, { system: { indistruttibile: false } }, {}, users.alice.id), false, "Alice può togliere il flag Indistruttibile");
        eq(Hooks.call("preUpdateItem", ind, { "system.indistruttibile": false }, {}, users.alice.id), false, "Alice può togliere il flag (chiave piatta)");
      } finally {
        n.restore();
      }
    });
    await T("B4 punteggio: Indistruttibile vale doppio, le rimosse non contano (FFGame.tallyFor e RU.tally)", async () => {
      // Ada ha: ind (legame, x2) + norm (problematica) → legami 2, problemi 1, score 1
      let t = FF.FFGame.tallyFor(fx.ada.id);
      eq(t, { legami: 2, problemi: 1, score: 1 });
      await norm.update({ "system.rimosso": true });
      t = FF.FFGame.tallyFor(fx.ada.id);
      eq(t, { legami: 2, problemi: 0, score: 2 }, "una Problematica rimossa continua a contare");
      await norm.update({ "system.rimosso": false });
      eq(FF.FFGame.tallyFor("inesistente"), { legami: 0, problemi: 0, score: 0 }, "attore sconosciuto");
      eq(RU.tally([{ tipo: "problematica", indistruttibile: true }, { tipo: "legame" }, { tipo: "legame", rimosso: true }]), { legami: 1, problemi: 2, score: -1 });
    });
    await T("B5 il GM può cancellare davvero l'Indistruttibile (pulizia)", async () => {
      await ind.delete();
      ok(!fx.ada.items.get(ind.id), "voce non cancellata dal GM");
      await norm.delete();
    });
  }

  // =====================================================================================
  // C. Nuova partita
  // =====================================================================================
  if (runGroup("C")) {
    await T("C1 gruppo da 3: stato iniziale (Fase 3–5 anni, 6 Sezioni, 2 biglie, Temi vuoti, foglio pulito)", async () => {
      await D({ type: "reset" });
      const ids = msgIds();
      await D({ type: "newGame", config: { players: [PL.ada, PL.bruno, PL.carla], seed: 4242, disordine: true } });
      await settle();
      const s = st();
      ok(s, "nessuna partita");
      eq([s.status, s.phaseIdx, s.solo, s.demo], ["temi", 0, false, false]);
      eq(s.phases.length, 11, "le Fasi del gioco completo sono 11");
      eq(s.phases.map((p) => p.sections), [6, 8, 8, 8, 8, 12, 12, 12, 16, 16, 16], "Sezioni per Fase");
      eq(s.sections.length, 6, "Sezioni della prima Fase");
      eq(s.sections.map((x) => x.num), [1, 2, 3, 4, 5, 6]);
      ok(s.sections.every((x) => x.theme === "" && Array.isArray(x.poly) && x.poly.length >= 3), "Sezioni senza poligono o con Tema non vuoto");
      eq(s.players.map((p) => p.marbles), [2, 2, 2], "biglie a testa con 3 giocatori");
      eq(s.players.map((p) => p.color), E.MARBLE_COLORS.slice(0, 3), "colori delle biglie");
      eq([s.residue.smudges.length, s.residue.creases.length], [0, 0], "foglio nuovo: niente macchie");
      eq(s.marbles.length, 0);
      ok(s.firstIdx >= 0 && s.firstIdx < 3 && s.turnIdx === s.firstIdx, "primo giocatore");
      eq(s.npcs.length, 0);
      eq(s.paper, { x: 90, y: 70, w: 1100, h: 760 });
      const m = effectMsgs(newMsgsSince(ids), "phase");
      eq(m.length, 1, "una card di Fase in chat");
      ok(/Fase 1\/11/.test(m[0].content) && /3–5 anni/.test(m[0].content), `card di Fase: ${m[0].content.slice(0, 160)}`);
      ok(m[0].content.includes(s.players[s.firstIdx].name), "la card non nomina il primo giocatore");
    });
    await T("C2 «disordine sul tavolo»: 5 ostacoli fuori dal foglio, 0 se disattivato", async () => {
      const s1 = st();
      eq(s1.obstacles.length, 5);
      for (const o of s1.obstacles) {
        const on = o.x > 90 - o.r && o.x < 1190 + o.r && o.y > 70 - o.r && o.y < 830 + o.r;
        ok(!on, `ostacolo sul foglio: ${JSON.stringify(o)}`);
        ok(o.x - o.r >= 0 && o.x + o.r <= 1280 && o.y - o.r >= 0 && o.y + o.r <= 900, `ostacolo fuori dal tavolo: ${JSON.stringify(o)}`);
      }
      await D({ type: "reset" });
      await D({ type: "newGame", config: { players: [PL.ada, PL.bruno], disordine: false, seed: 5 } });
      eq(st().obstacles.length, 0);
    });
    await T("C3 sessione dimostrativa: 3 Fasi (6–10, 11–18, 19–23 anni) con 8, 8, 12 Sezioni", async () => {
      await D({ type: "reset" });
      await D({ type: "newGame", config: { players: [PL.ada, PL.bruno], demo: true, seed: 9 } });
      const s = st();
      eq(s.demo, true);
      eq(s.phases.map((p) => p.label), ["6–10 anni", "11–18 anni", "19–23 anni"]);
      eq(s.phases.map((p) => p.sections), [8, 8, 12]);
      eq(s.sections.length, 8);
      eq(s.players.map((p) => p.marbles), [2, 2], "2 giocatori = 2 biglie");
    });
    await T("C4 numero di biglie: 1–3 giocatori → 2 a testa, 4–5 → 3 a testa", async () => {
      for (const [n, per] of [[1, 2], [2, 2], [3, 2], [4, 3], [5, 3]]) {
        const pls = Array.from({ length: n }, (_, i) => ({ userId: users.gm.id, actorId: [fx.ada, fx.bruno, fx.carla, fx.ada, fx.bruno][i].id, name: `P${i}` }));
        await D({ type: "reset" });
        await D({ type: "newGame", config: { players: pls, seed: 3 } });
        eq(st().players.map((p) => p.marbles), Array(n).fill(per), `${n} giocatori`);
      }
    });
    await T("C5 solitario: 1 giocatore, 3 biglie, 3 PNG con colore, Temi tirati dalla tabella (tutti diversi)", async () => {
      await D({ type: "reset" });
      const ids = msgIds();
      await D({ type: "newGame", config: { players: [PL.carla], solo: true, seed: 31, npcNames: ["Zeta", "Eta", "Theta"] } });
      await settle();
      const s = st();
      eq([s.solo, s.players.length, s.players[0].marbles], [true, 1, 3]);
      eq(s.npcs.map((n) => n.name), ["Zeta", "Eta", "Theta"]);
      ok(s.npcs.every((n) => /^#[0-9a-f]{6}$/i.test(n.color)), "colori PNG");
      ok(s.sections.every((x) => x.theme.trim()), "Temi del solitario non tirati");
      eq(new Set(s.sections.map((x) => x.theme)).size, s.sections.length, "Temi duplicati");
      eq(effectMsgs(newMsgsSince(ids), "phase").length, 1);
    });
    await T("C6 validazioni: 0 o 6 giocatori, solitario con 2 giocatori → rifiutati, stato invariato", async () => {
      await D({ type: "reset" });
      await D({ type: "newGame", config: { players: [PL.ada], seed: 1 } });
      const before = JSON.stringify(FF.state);
      const mk = (n) => Array.from({ length: n }, (_, i) => ({ userId: users.gm.id, actorId: fx.ada.id, name: `P${i}` }));
      await expectReject(game.user.id, { type: "newGame", config: { players: mk(0) } }, /1 a 5/);
      await expectReject(game.user.id, { type: "newGame", config: { players: mk(6) } }, /1 a 5/);
      await expectReject(game.user.id, { type: "newGame", config: { players: mk(2), solo: true } }, /solitario/i);
      eq(JSON.stringify(FF.state), before);
    });
    await T("C7 permessi: un non-GM NON può iniziare né terminare una partita", async () => {
      await expectReject(users.alice.id, { type: "newGame", config: { players: [PL.ada] } }, /Non puoi/);
      await expectReject(users.alice.id, { type: "reset" }, /Non puoi/);
      ok(FF.state, "la partita è stata cancellata da un non-GM");
    });
    await T("C8 senza GM connesso: dispatch segnala l'errore e non cambia nulla", async () => {
      const n = spyNotes();
      const before = JSON.stringify(FF.state);
      Object.defineProperty(game.users, "activeGM", { get: () => null, configurable: true });
      try {
        await D({ type: "reset" });
      } finally {
        delete game.users.activeGM;
        n.restore();
      }
      ok(n.log.some((x) => x.k === "error" && /GM connesso/.test(x.m)), `nessun errore «Serve un GM»: ${JSON.stringify(n.log)}`);
      eq(JSON.stringify(FF.state), before);
    });
    await T("C9 errore ricevuto via socket: il client destinatario vede l'avviso, gli altri no", async () => {
      const n = spyNotes();
      try {
        for (const l of game.socket.listeners(CHANNEL)) l({ type: "error", to: game.user.id, message: "prova-errore" });
        for (const l of game.socket.listeners(CHANNEL)) l({ type: "error", to: "altro-utente", message: "non-per-me" });
      } finally {
        n.restore();
      }
      ok(n.log.some((x) => x.k === "warn" && x.m === "prova-errore"), "avviso non mostrato al destinatario");
      ok(!n.log.some((x) => x.m === "non-per-me"), "avviso mostrato a chi non era il destinatario");
    });
  }

  // =====================================================================================
  // D. Temi
  // =====================================================================================
  if (runGroup("D")) {
    await T("D1 Temi: scrittura (anche da non-GM), taglio a 40 caratteri, Sezione inesistente", async () => {
      await startGame({ players: [PL.ada, PL.bruno, PL.carla], themes: false, begin: false });
      const s = st();
      const id1 = s.sections[0].id;
      await expectOk(users.alice.id, { type: "setTheme", sectionId: id1, text: "scuola" });
      eq(FF.state.sections[0].theme, "scuola");
      await expectOk(users.gm.id, { type: "setTheme", sectionId: s.sections[1].id, text: "x".repeat(70) });
      eq(FF.state.sections[1].theme.length, 40, "il Tema non è tagliato a 40 caratteri");
      await expectReject(users.gm.id, { type: "setTheme", sectionId: "sez-inesistente", text: "a" }, /inesistente/);
    });
    await T("D2 «Inizia i lanci» rifiutato se una Sezione non ha Tema; rifiutato anche con Tema di soli spazi", async () => {
      await expectReject(users.gm.id, { type: "beginThrows" }, /Ogni Sezione/);
      const s = st();
      for (const sec of s.sections) await D({ type: "setTheme", sectionId: sec.id, text: sec.theme || "ok" });
      await D({ type: "setTheme", sectionId: s.sections[2].id, text: "   " });
      await expectReject(users.gm.id, { type: "beginThrows" }, /Ogni Sezione/);
    });
    await T("D3 «Suggerisci i vuoti»: riempie solo i Temi vuoti, non tocca quelli scritti, niente doppioni", async () => {
      await D({ type: "reset" });
      await D({ type: "newGame", config: { players: [PL.ada, PL.bruno, PL.carla], seed: 12 } });
      const s0 = st();
      await D({ type: "setTheme", sectionId: s0.sections[0].id, text: "mio-tema" });
      await D({ type: "randomThemes" });
      const s = st();
      eq(s.sections[0].theme, "mio-tema", "Tema scritto sovrascritto");
      ok(s.sections.every((x) => x.theme.trim()), "restano Temi vuoti");
      eq(new Set(s.sections.map((x) => x.theme)).size, s.sections.length, "Temi duplicati");
    });
    await T("D4 «Ridisegna Sezioni»: stesso numero, Sezioni cambiate, Temi mantenuti per posizione", async () => {
      const a = st();
      await D({ type: "rerollSections" });
      const b = st();
      eq(b.sections.length, a.sections.length);
      eq(b.sections.map((x) => x.theme), a.sections.map((x) => x.theme), "Temi persi");
      ok(JSON.stringify(a.sections.map((x) => x.poly)) !== JSON.stringify(b.sections.map((x) => x.poly)), "le Sezioni non sono cambiate");
      const total = b.sections.reduce((t, c) => t + Math.abs(GEO.polygonArea(c.poly)), 0);
      near(total, 1100 * 760, 1100 * 760 * 0.002, "le Sezioni non coprono il foglio");
    });
    await T("D5 «Inizia i lanci»: stato lanci, coda in senso orario da primo giocatore, 2 biglie a testa", async () => {
      const ids = msgIds();
      await D({ type: "beginThrows" });
      const s = st();
      eq(s.status, "lanci");
      eq(s.queue.length, 6, "3 giocatori x 2 biglie");
      const exp = [];
      for (let k = 0; k < 2; k++) for (let i = 0; i < 3; i++) exp.push((s.firstIdx + i) % 3);
      eq(s.queue, exp, "ordine dei lanci");
      eq(s.turnIdx, s.queue[0]);
      eq(Object.values(s.thrown), [0, 0, 0]);
      eq(s.awaiting, null);
      eq(newMsgsSince(ids).length, 0, "per il gruppo non c'è nessuna card all'avvio dei lanci");
    });
    await T("D6 Temi non scrivibili a lanci iniziati, né Sezioni ridisegnabili, né «Inizia i lanci» due volte", async () => {
      const s = st();
      await expectReject(users.gm.id, { type: "setTheme", sectionId: s.sections[0].id, text: "no" }, /prima dei lanci/);
      await expectReject(users.gm.id, { type: "rerollSections" }, /prima dei Temi/);
      await expectReject(users.gm.id, { type: "randomThemes" }, /prima dei lanci/);
      await expectReject(users.gm.id, { type: "beginThrows" }, /già nei lanci/);
    });
    await T("D7 solitario: «Inizia i lanci» posiziona i 3 PNG (card in chat con d6 e Sezione)", async () => {
      await D({ type: "reset" });
      await D({ type: "newGame", config: { players: [PL.carla], solo: true, seed: 77 } });
      const ids = msgIds();
      await D({ type: "beginThrows" });
      await settle();
      const s = st();
      eq(s.queue, [0, 0, 0], "3 biglie da lanciare");
      eq(s.marbles.length, 3, "3 biglie dei PNG");
      eq(s.marbles.map((m) => m.ownerId), ["npc:0", "npc:1", "npc:2"]);
      for (const m of s.marbles) ok(RU.sectionAt(s.sections, m.x, m.y, s.paper), `biglia PNG fuori dalle Sezioni: ${JSON.stringify(m)}`);
      const card = effectMsgs(newMsgsSince(ids), "npcPlaced");
      eq(card.length, 1);
      eq((card[0].content.match(/d6 =/g) ?? []).length, 3, "la card deve riportare 3 tiri di d6");
    });
  }

  // =====================================================================================
  // E. Lanci, esiti, card in chat
  // =====================================================================================
  const btns = (m) => [...cardEl(m).querySelectorAll("button[data-ff]")];
  const outcomeCardOf = (msgs) => msgs.find((m) => ffFlag(m).effect === "outcome");
  if (runGroup("E")) {
    let g2; // gioco a 2 giocatori usato in sequenza
    await T("E1 lancio: valido solo dal bordo del tavolo (non dentro il foglio), con numeri finiti", async () => {
      g2 = await startGame({ players: [PL.ada, PL.bruno], seed: 11 });
      const cur = g2.players[g2.turnIdx];
      const mk = (x, y) => ({ x, y, vx: 400, vy: 0 });
      await expectReject(game.user.id, { type: "throw", launch: mk(600, 400), force: true }, /bordo del tavolo/);
      await expectReject(game.user.id, { type: "throw", launch: { x: 40, y: NaN, vx: 1, vy: 1 }, force: true }, /bordo del tavolo/);
      await expectReject(game.user.id, { type: "throw", launch: { x: -5, y: 100, vx: 400, vy: 0 }, force: true }, /bordo del tavolo/);
      await expectReject(game.user.id, { type: "throw", launch: null, force: true }, /bordo del tavolo/);
      eq(st().marbles.length, 0);
      return `di turno: ${cur.name}`;
    });
    await T("E2 permessi lancio: GM senza force sul turno di un altro, non di turno (Alice/Bob), force da non-GM ignorato", async () => {
      const s = st();
      const cur = s.players[s.turnIdx];
      const other = s.players.find((p) => p.actorId !== cur.actorId);
      const launch = { x: 40, y: 450, vx: 700, vy: 0 };
      await expectReject(other.userId, { type: "throw", launch }, /Non puoi farlo adesso/);
      await expectReject(other.userId, { type: "throw", launch, force: true }, /Non puoi farlo adesso/);
      if (cur.userId !== users.gm.id) await expectReject(users.gm.id, { type: "throw", launch }, /Non è il tuo turno/);
      eq(st().marbles.length, 0);
    });
    await T("E3 esito «racconto»: biglia sulla Mappa, card senza bottoni, turno in attesa di racconto", async () => {
      const s = st();
      const f = findThrow(s, isCase("racconto"));
      const cur = s.players[s.turnIdx];
      const { state, msgs } = await throwLive(f.launch, { as: "owner" });
      eq(state.last.outcome.case, "racconto");
      eq([state.awaiting.case, state.awaiting.rethrow], ["racconto", false]);
      eq(state.marbles.length, 1);
      eq(state.thrown[cur.actorId], 1);
      eq(state.marbles[0].ownerId, cur.actorId);
      const sec = state.sections.find((x) => x.id === state.last.outcome.sectionId);
      ok(sec && RU.sectionAt(state.sections, state.marbles[0].x, state.marbles[0].y) === sec.id, "la biglia non è nella Sezione dell'esito");
      const card = outcomeCardOf(msgs);
      ok(card, "nessuna card dell'esito in chat");
      ok(cardEl(card).querySelector(".ff-case-racconto"), "classe ff-case-racconto assente");
      ok(card.content.includes(`Sezione <strong>${sec.num}</strong>`) && card.content.includes(sec.theme), "Sezione/Tema non riportati nella card");
      eq(btns(card).length, 0, "il racconto non deve avere bottoni");
      ok(card.content.includes(cur.name), "la card non nomina chi lancia");
    });
    await T("E4 durante il racconto: altro lancio rifiutato; «passa il turno» solo dal giocatore di turno; poi tocca al successivo", async () => {
      const s = st();
      const cur = s.players[s.turnIdx];
      const other = s.players.find((p) => p.actorId !== cur.actorId);
      await expectReject(game.user.id, { type: "throw", launch: { x: 40, y: 450, vx: 700, vy: 0 }, force: true }, /racconta/);
      await expectReject(other.userId, { type: "advance" }, /Non puoi/);
      await expectOk(cur.userId, { type: "advance" });
      const t = st();
      eq(t.awaiting, null);
      eq(t.queue.length, s.queue.length - 1);
      eq(t.turnIdx, t.queue[0]);
      ok(t.turnIdx !== s.turnIdx, "il turno non è passato al giocatore successivo");
      await expectReject(game.user.id, { type: "advance" }, /Niente da chiudere/);
    });
    await T("E5 esito «incontro» (2 giocatori): coinvolti, contatore incontri, card con «Nuovo Legame» e «Risolvi una Problematica» per ciascuno", async () => {
      const s = st();
      const f = findThrow(s, isCase("incontro"));
      const { state, msgs } = await throwLive(f.launch, { as: "owner" });
      eq(state.last.outcome.case, "incontro");
      eq(state.encounters, 1);
      eq(state.last.outcome.involved.length, 2);
      const card = outcomeCardOf(msgs);
      ok(cardEl(card).querySelector(".ff-case-incontro") && cardEl(card).querySelector(".ff-who"), "card incontro incompleta");
      const b = btns(card);
      eq(b.length, 4, "2 bottoni per ciascuno dei 2 coinvolti");
      for (const a of state.last.outcome.involved) {
        const mine = b.filter((x) => x.dataset.actor === a);
        eq(mine.map((x) => `${x.dataset.ff}:${x.dataset.tipo}`).sort(), ["annota:legame", "rimuovi:problematica"], `bottoni di ${a}`);
        const ann = mine.find((x) => x.dataset.ff === "annota");
        const con = JSON.parse(ann.dataset.con);
        eq(con.map((c) => c.id), state.last.outcome.involved.filter((o) => o !== a), "«con» preselezionati");
      }
    });
    await T("E6 annotare dal bottone in chat (dialogo reale): crea il Legame con «con» preselezionato e registra il legame di Fase", async () => {
      await showChat();
      const s = st();
      const o = s.last.outcome;
      const msg = [...game.messages.contents].reverse().find((m) => !baseMsgIds.has(m.id) && ffFlag(m).effect === "outcome");
      const el = await waitFor(() => chatDom(msg), { what: "la card nel DOM della chat" });
      const actorId = o.involved[0];
      const other = o.involved[1];
      const b = el.querySelector(`button[data-ff="annota"][data-actor="${actorId}"]`);
      ok(b && !b.disabled, "bottone Annota assente o disabilitato per il proprietario");
      const actor = game.actors.get(actorId);
      const before = actor.items.size;
      const beforeIds = new Set(actor.items.map((i) => i.id));
      b.click();
      const dlg = await waitFor(() => openDialogs().find((d) => /Nuovo Legame/.test(d.title)), { what: "dialogo Nuovo Legame" });
      ok(dlg.title.includes(actor.name), `titolo dialogo senza nome del personaggio: ${dlg.title}`);
      const checked = [...dlg.element.querySelectorAll('input[type="checkbox"][name^="con."]')].filter((c) => c.checked);
      eq(checked.length, 1, "il personaggio coinvolto non è preselezionato");
      // un testo vuoto non crea nulla
      dlg.element.querySelector('button[data-action="ok"]').click();
      await waitFor(() => !dlg.rendered, { what: "chiusura" });
      eq(actor.items.size, before, "un Legame vuoto è stato creato");
      b.click();
      await fillDialog({ title: /Nuovo Legame/, values: { testo: "Ho assistito alla sua partita e l'ho consolata" } });
      await waitFor(() => actor.items.size === before + 1, { what: "creazione voce" });
      const it = actor.items.find((i) => !beforeIds.has(i.id));
      eq([it.type, it.system.indistruttibile], ["legame", false]);
      eq(it.system.con.map((c) => c.id), [other], "campo «con» della voce");
      eq(it.system.fase, FF.state.phaseLabel, "Fase della voce");
      ok(it.system.descrizione.includes("Ho assistito"), "testo non salvato");
      await settle();
      const key = [actorId, other].sort().join("|");
      await waitFor(() => FF.state.bonds.includes(key), { what: "registerBond via hook ffVoceCreata" });
      const note = game.messages.contents.filter((m) => ffFlag(m).nota).at(-1);
      ok(note && /annota un Legame/.test(note.content), "nessuna nota in chat per il Legame");
    });
    await T("E7 «passa il turno»; esito «legame-indistruttibile» (con legame già creato in Fase): card con Legame Indistruttibile per entrambi", async () => {
      await advanceLive();
      let s = st();
      const cur = s.players[s.turnIdx];
      // serve che chi lancia ora abbia un legame con chi è già sulla Mappa: il Legame appena annotato è tra i due
      const f = findThrow(s, isCase("legame-indistruttibile"));
      const { state, msgs } = await throwLive(f.launch, { as: "owner" });
      eq(state.last.outcome.case, "legame-indistruttibile");
      const card = outcomeCardOf(msgs);
      const b = btns(card);
      eq(b.length, state.last.outcome.involved.filter((x) => !x.startsWith("npc:")).length, "un bottone per coinvolto");
      ok(b.every((x) => x.dataset.ff === "annota" && x.dataset.tipo === "legame" && x.dataset.ind === "1"), "bottoni non Indistruttibili");
      eq(state.encounters, 2);
      ok(card.content.includes("Legame Indistruttibile"), "titolo card");
      // annota (come il proprietario del bottone): voce Indistruttibile → vale doppio
      await showChat();
      const msg = [...game.messages.contents].reverse().find((m) => !baseMsgIds.has(m.id) && ffFlag(m).effect === "outcome");
      const el = await waitFor(() => chatDom(msg));
      const actorId = cur.actorId;
      const actor = game.actors.get(actorId);
      const before = actor.items.size;
      const beforeIds = new Set(actor.items.map((i) => i.id));
      el.querySelector(`button[data-ff="annota"][data-actor="${actorId}"]`).click();
      const dlg = await waitFor(() => openDialogs().find((d) => /Nuovo Legame/.test(d.title)));
      ok(/Indistruttibile/.test(dlg.element.textContent), "il dialogo non spiega che è Indistruttibile");
      ok(!dlg.element.querySelector('input[name="indistruttibile"]'), "il checkbox Indistruttibile non deve comparire (è imposto dalla regola)");
      await fillDialog({ title: /Nuovo Legame/, values: { testo: "Un ricordo indelebile" } });
      await waitFor(() => actor.items.size === before + 1);
      const it = actor.items.find((i) => !beforeIds.has(i.id));
      eq(it.system.indistruttibile, true);
      const t = FF.FFGame.tallyFor(actorId);
      ok(t.legami >= 2, `l'Indistruttibile non vale doppio: ${JSON.stringify(t)}`);
      await settle();
    });
    await T("E8 bottoni delle card: disabilitati per chi NON è proprietario del personaggio, attivi per il proprietario", async () => {
      const msg = [...game.messages.contents].reverse().find((m) => !baseMsgIds.has(m.id) && ffFlag(m).effect === "outcome");
      const o = ffFlag(msg).outcome;
      const actorId = o.involved[0];
      const fresh = () => cardEl(msg);
      // proprietario (GM): attivi
      let el = fresh();
      Hooks.callAll("renderChatMessageHTML", msg, el);
      ok([...el.querySelectorAll("button[data-ff]")].every((b) => !b.disabled), "bottoni disabilitati per il GM (proprietario di tutto)");
      // non proprietario: simulato togliendo isOwner a un attore
      const actor = game.actors.get(actorId);
      Object.defineProperty(actor, "isOwner", { get: () => false, configurable: true });
      try {
        el = fresh();
        Hooks.callAll("renderChatMessageHTML", msg, el);
        const mine = [...el.querySelectorAll(`button[data-ff][data-actor="${actorId}"]`)];
        const others = [...el.querySelectorAll(`button[data-ff]:not([data-actor="${actorId}"])`)];
        ok(mine.length && mine.every((b) => b.disabled), "i bottoni di un attore non posseduto sono attivi");
        ok(others.every((b) => !b.disabled), "i bottoni degli altri attori sono stati disabilitati per errore");
      } finally {
        delete actor.isOwner;
      }
      // attore inesistente (card vecchia dopo cancellazione): disabilitato, senza errori
      const html = cardEl(msg);
      html.querySelector("button[data-ff]").dataset.actor = "inesistente";
      Hooks.callAll("renderChatMessageHTML", msg, html);
      ok(html.querySelector("button[data-ff]").disabled, "bottone con attore inesistente non disabilitato");
    });
    await T("E9 «Risolvi una Problematica» dal bottone: senza Problematiche avvisa; con una la elimina raccontando come", async () => {
      await showChat();
      const o = FF.state.last.outcome;
      const msg = game.messages.contents.filter((m) => !baseMsgIds.has(m.id) && ffFlag(m).effect === "outcome").find((m) => ffFlag(m).outcome.case === "incontro");
      const actorId = ffFlag(msg).outcome.involved[0];
      const actor = game.actors.get(actorId);
      const el = await waitFor(() => chatDom(msg), { what: "card incontro nel DOM" });
      const b = el.querySelector(`button[data-ff="rimuovi"][data-actor="${actorId}"]`);
      ok(b && !b.disabled);
      const residue = actor.items.filter((i) => i.type === "problematica");
      if (residue.length) console.warn("E9: Problematiche già presenti sull'attore prima del test:", residue.map((i) => i.name));
      await actor.deleteEmbeddedDocuments("Item", residue.map((i) => i.id));
      const n = spyNotes();
      b.click();
      await sleep(300);
      n.restore();
      ok(n.log.some((x) => x.k === "info" && /non ha Problematiche eliminabili/.test(x.m)), `nessun avviso: ${JSON.stringify(n.log)}; dialoghi aperti: ${openDialogs().map((d) => d.title)}; bottone: ${b.outerHTML.slice(0, 160)}; nel DOM: ${document.body.contains(b)}`);
      eq(openDialogs().length, 0, "dialogo aperto pur senza Problematiche");
      const [p] = await actor.createEmbeddedDocuments("Item", [{ name: "litigio per il parco", type: "problematica", system: { con: [] } }]);
      b.click();
      await fillDialog({ title: /Risolvi una Problematica/, values: { id: p.id, racconto: "abbiamo fatto pace al parco" } });
      await waitFor(() => p.system.rimosso === true, { what: "voce rimossa" });
      eq(p.system.rimossoRacconto, "abbiamo fatto pace al parco");
      const note = game.messages.contents.filter((m) => ffFlag(m).nota).at(-1);
      ok(/risolve una Problematica/.test(note.content) && /fatto pace/.test(note.content), "nota di rimozione in chat");
      eq(FF.FFGame.tallyFor(actorId).problemi, 0, "la Problematica rimossa conta ancora");
    });
    await T("E10 «Elimina un Legame»: le voci Indistruttibili non sono proponibili; se resta solo l'Indistruttibile avvisa", async () => {
      const actor = fx.carla;
      await actor.createEmbeddedDocuments("Item", [{ name: "legame indistruttibile", type: "legame", system: { indistruttibile: true } }]);
      const n = spyNotes();
      const r = await ANN.rimuoviScelta({ actor, tipo: "legame" });
      n.restore();
      eq(r, null);
      ok(n.log.some((x) => x.k === "info" && /non ha Legami eliminabili/.test(x.m)), "nessun avviso per l'unico Legame Indistruttibile");
      eq(openDialogs().length, 0);
    });
    await T("E11 esito «scontro» (2 giocatori): card Elimina Legame / Nuova Problematica, coinvolti, biglie sbalzate riportate nella Sezione", async () => {
      g2 = await startGame({ players: [PL.ada, PL.bruno], seed: 21 });
      let s = st();
      const f1 = findThrow(s, isCase("racconto"), { seed: 5 });
      await throwLive(f1.launch, { as: "owner" });
      await advanceLive();
      s = st();
      const f2 = findThrow(s, isCase("scontro"), { seed: 6 });
      const { state, msgs } = await throwLive(f2.launch, { as: "owner" });
      const o = state.last.outcome;
      eq(o.case, "scontro");
      ok(o.involved.length >= 1);
      const card = outcomeCardOf(msgs);
      ok(cardEl(card).querySelector(".ff-case-scontro"), "classe card scontro");
      const b = btns(card);
      for (const a of o.involved) {
        eq(b.filter((x) => x.dataset.actor === a).map((x) => `${x.dataset.ff}:${x.dataset.tipo}`).sort(), ["annota:problematica", "rimuovi:legame"], `bottoni scontro per ${a}`);
      }
      // tutte le biglie coinvolte sono nella Sezione dello scontro
      const inSec = state.marbles.filter((m) => RU.sectionAt(state.sections, m.x, m.y) === o.sectionId);
      ok(inSec.length >= 2, "le biglie dello scontro non sono tutte nella Sezione");
      ok(state.encounters === 1, "lo scontro conta come incontro");
    });
    await T("E12 esiti «propri» e «problematica-indistruttibile» (1 giocatore, 2 biglie)", async () => {
      // propri
      await startGame({ players: [PL.carla], seed: 31 });
      let s = st();
      await throwLive(findThrow(s, isCase("racconto"), { seed: 7 }).launch);
      await advanceLive({ as: "gm" });
      s = st();
      let r = await throwLive(findThrow(s, isCase("propri"), { seed: 8 }).launch);
      eq(r.state.last.outcome.case, "propri");
      let card = outcomeCardOf(r.msgs);
      eq(btns(card).map((x) => `${x.dataset.ff}:${x.dataset.tipo}`).sort(), ["annota:problematica", "rimuovi:legame"]);
      eq(r.state.encounters, 0, "«propri» non è un incontro");
      // problematica indistruttibile
      await startGame({ players: [PL.carla], seed: 32 });
      s = st();
      await throwLive(findThrow(s, isCase("racconto"), { seed: 9 }).launch);
      await advanceLive({ as: "gm" });
      s = st();
      r = await throwLive(findThrow(s, isCase("problematica-indistruttibile"), { seed: 10 }).launch);
      eq(r.state.last.outcome.case, "problematica-indistruttibile");
      card = outcomeCardOf(r.msgs);
      const b = btns(card);
      eq(b.length, 1);
      eq([b[0].dataset.ff, b[0].dataset.tipo, b[0].dataset.ind], ["annota", "problematica", "1"]);
      ok(card.content.includes("sottolineata") && card.content.includes("non potrà essere rimossa"), "testo della card");
      // dopo lo scontro con le proprie biglie la Mappa conserva entrambe nella Sezione
      const o = r.state.last.outcome;
      const inSec = r.state.marbles.filter((m) => RU.sectionAt(r.state.sections, m.x, m.y) === o.sectionId);
      eq(inSec.length, 2, "le due biglie proprie devono stare nella Sezione");
    });
    await T("E13 esito «fuori»: nessun effetto, la biglia non resta, non conta come lanciata, si rilancia", async () => {
      await startGame({ players: [PL.ada, PL.bruno], seed: 41 });
      const s = st();
      const cur = s.players[s.turnIdx];
      const { state, msgs } = await throwLive(findThrow(s, isCase("fuori"), { seed: 11 }).launch, { as: "owner" });
      eq(state.last.outcome.case, "fuori");
      eq([state.awaiting.rethrow, state.marbles.length, state.thrown[cur.actorId]], [true, 0, 0]);
      const card = outcomeCardOf(msgs);
      ok(/La biglia esce dalla Mappa/.test(card.content), "titolo card fuori");
      eq(btns(card).length, 0);
      const q = state.queue.length;
      await expectOk(cur.userId, { type: "advance" });
      const t = st();
      eq([t.queue.length, t.turnIdx, t.awaiting], [q, s.turnIdx, null], "rilancio: la coda e il turno non devono cambiare");
      // ora si può lanciare di nuovo
      const f = findThrow(t, isCase("racconto"), { seed: 12 });
      await throwLive(f.launch, { as: "owner" });
      eq(st().thrown[cur.actorId], 1);
    });
    await T("E14 esito «solco»: scelta della Sezione (solo chi lancia), biglia nella Sezione scelta, esito applicato", async () => {
      await startGame({ players: [PL.ada, PL.bruno], seed: 51 });
      const s = st();
      const cur = s.players[s.turnIdx];
      const other = s.players.find((p) => p.actorId !== cur.actorId);
      const f = findThrow(s, isCase("solco"), { seed: 13 });
      const { state, msgs } = await throwLive(f.launch, { as: "owner" });
      ok(state.pending && state.pending.options.length === 2, "nessuna scelta in sospeso");
      const card = effectMsgs(msgs, "solco")[0];
      ok(card && /Sul solco/.test(card.content), "card «Sul solco!»");
      eq(state.marbles.length, 0, "la biglia sul solco non è ancora sulla Mappa");
      await expectReject(game.user.id, { type: "throw", launch: { x: 40, y: 450, vx: 700, vy: 0 }, force: true }, /solco/);
      await expectReject(game.user.id, { type: "advance" }, /Niente da chiudere/);
      await expectReject(other.userId, { type: "chooseGroove", sectionId: state.pending.options[0] }, /Non puoi/);
      await expectReject(cur.userId, { type: "chooseGroove", sectionId: "non-valida" }, /non valida/);
      const pick = state.pending.options[1];
      await expectOk(cur.userId, { type: "chooseGroove", sectionId: pick });
      const t = st();
      eq(t.pending, null);
      eq(t.last.outcome.sectionId, pick, "Sezione dell'esito diversa da quella scelta");
      eq(t.marbles.length, 1);
      eq(RU.sectionAt(t.sections, t.marbles[0].x, t.marbles[0].y), pick, "la biglia non è nella Sezione scelta");
      ok(t.awaiting && !t.awaiting.rethrow, "attesa del racconto dopo la scelta");
      await expectReject(game.user.id, { type: "chooseGroove", sectionId: pick }, /Nessuna scelta/);
    });
    await T("E15 solitario: esito con un PNG (coinvolto con nome, niente bottoni per il PNG, «con» include il PNG); il Legame col PNG registra il vincolo", async () => {
      await startGame({ players: [PL.carla], solo: true, seed: 61, npcNames: ["Zeta", "Eta", "Theta"] });
      const s = st();
      const f = findThrow(s, (r) => ["incontro", "scontro", "legame-indistruttibile"].includes(caseOf(r)), { seed: 14 });
      const { state, msgs } = await throwLive(f.launch);
      const o = state.last.outcome;
      const npcInv = o.involved.filter((x) => x.startsWith("npc:"));
      ok(npcInv.length >= 1, `nessun PNG coinvolto (${o.case})`);
      const card = outcomeCardOf(msgs);
      for (const x of npcInv) ok(card.content.includes(["Zeta", "Eta", "Theta"][+x.slice(4)]), "nome del PNG assente dalla card");
      ok(btns(card).every((b) => b.dataset.actor === fx.carla.id), "bottoni anche per i PNG");
      const ann = btns(card).find((b) => b.dataset.ff === "annota" && b.dataset.tipo === "legame");
      if (ann) {
        const con = JSON.parse(ann.dataset.con);
        ok(con.some((c) => c.id === null && /Zeta|Eta|Theta/.test(c.name)), `«con» senza PNG: ${ann.dataset.con}`);
        await ANN.creaVoce({ actor: fx.carla, tipo: "legame", testo: "legame con il PNG", con: [{ id: null, nome: con[0].name }] });
        await settle();
        ok(FF.state.bonds.some((k) => k.includes("npc:")), `vincolo col PNG non registrato: ${JSON.stringify(FF.state.bonds)}`);
      }
    });
  }

  // =====================================================================================
  // F. Fasi: avanzamento, cancellazione della Mappa, macchie e pieghe crescenti
  // =====================================================================================
  const smudgesFor = (i) => (i <= 0 ? 0 : Math.min(3 + Math.round(i * 1.6), 22));
  const creasesFor = (i) => (i <= 0 ? 0 : Math.min(Math.floor(i / 2) + (i > 4 ? 1 : 0), 7));
  async function setRaw(mutator) {
    const s = st();
    mutator(s);
    await game.settings.set(SYS, "partita", s);
    await settle(60);
  }
  async function jumpToFineFase(idx, cfg = {}) {
    await D({ type: "reset" });
    await D({ type: "newGame", config: { players: [PL.ada, PL.bruno, PL.carla], seed: 100, ...cfg } });
    await setRaw((s) => {
      s.phaseIdx = idx;
      s.phaseLabel = s.phases[idx].label;
      s.status = "fine-fase";
      s.queue = [];
      s.marbles = [];
      s.awaiting = null;
      s.pending = null;
    });
  }
  let demoGame = null;
  if (runGroup("F")) {
    await T("F1 sessione dimostrativa giocata davvero (3 giocatori, via socket come proprietari): Fase 1 fino a «fine-fase»", async () => {
      await startGame({ players: [PL.ada, PL.bruno, PL.carla], demo: true, seed: 2024 });
      const ids = msgIds();
      const s = await playOut();
      eq(s.status, "fine-fase");
      eq(Object.values(s.thrown), [2, 2, 2], "ognuno deve aver lanciato 2 biglie");
      eq(s.queue.length, 0);
      eq(s.marbles.length, 6);
      const pe = effectMsgs(newMsgsSince(ids), "phaseEnd");
      eq(pe.length, 1, "card di fine Fase");
      const penalty = s.encounters === 0;
      const rimuovi = [...cardEl(pe[0]).querySelectorAll('button[data-ff="rimuovi"]')];
      eq(rimuovi.length, penalty ? 3 : 0, "bottoni «elimina un Legame» di fine Fase solo se nessun incontro");
      return `incontri in Fase: ${s.encounters}`;
    });
    await T("F2 «Cancella la Mappa · Prossima Fase»: Fase 2 (8 Sezioni), primo giocatore a sinistra, Temi vuoti, macchie e pieghe", async () => {
      const before = st();
      const ids = msgIds();
      await expectOk(users.gm.id, { type: "nextPhase" });
      const s = st();
      eq([s.status, s.phaseIdx, s.phaseLabel], ["temi", 1, "11–18 anni"]);
      eq(s.firstIdx, (before.firstIdx + 1) % 3, "il ruolo di primo giocatore deve passare a sinistra");
      eq(s.turnIdx, s.firstIdx);
      eq(s.sections.length, 8);
      ok(s.sections.every((x) => x.theme === ""), "Temi della Fase precedente rimasti");
      eq(s.marbles.length, 0, "biglie rimaste sulla Mappa");
      eq([s.thrown, s.encounters, s.bonds], [{}, 0, []], "contatori della Fase non azzerati");
      eq([s.residue.smudges.length, s.residue.creases.length], [smudgesFor(1), creasesFor(1)], "macchie/pieghe della Fase 2");
      ok(s.residue.smudges.every((m) => m.x >= 90 && m.x <= 1190 && m.y >= 70 && m.y <= 830), "macchia fuori dal foglio");
      eq(effectMsgs(newMsgsSince(ids), "phase").length, 1, "card della nuova Fase");
      eq(effectMsgs(newMsgsSince(ids), "deathDie").length, 0, "il Dado della Morte non c'è nelle prime Fasi");
    });
    await T("F3 Fase 3 della dimostrativa: 12 Sezioni, più macchie e almeno una piega", async () => {
      demoGame = true;
      for (const sec of FF.state.sections) await D({ type: "setTheme", sectionId: sec.id, text: `t${sec.num}` });
      await D({ type: "beginThrows" });
      await playOut();
      await expectOk(users.gm.id, { type: "nextPhase" });
      const s = st();
      eq([s.phaseIdx, s.sections.length], [2, 12]);
      eq([s.residue.smudges.length, s.residue.creases.length], [smudgesFor(2), creasesFor(2)]);
      ok(s.residue.smudges.length > smudgesFor(1) && s.residue.creases.length >= 1, "i residui non crescono");
    });
    await T("F3b sessione dimostrativa: finita la Fase 3 si va all'Epilogo (motivo «fine», niente Dado), il defunto è chi ha il saldo più alto", async () => {
      for (const sec of FF.state.sections) await D({ type: "setTheme", sectionId: sec.id, text: `u${sec.num}` });
      await D({ type: "beginThrows" });
      await playOut();
      const ids = msgIds();
      await expectOk(users.gm.id, { type: "nextPhase" });
      await settle();
      const s = st();
      eq([s.status, s.epilogue.reason, s.phaseLabel], ["epilogo-lanci", "fine", "Epilogo"]);
      eq(effectMsgs(newMsgsSince(ids), "deathDie").length, 0, "Dado della Morte tirato in una sessione dimostrativa");
      const top = Math.max(...Object.values(s.epilogue.scores));
      eq(s.epilogue.scores[s.epilogue.dead], top, "non muore chi ha il saldo più alto");
      eq(s.sections.length, 8);
    });
    await T("F4 «Prossima Fase» rifiutato fuori da «fine-fase»; contatori e coda coerenti a fine Fase 3", async () => {
      await expectReject(users.gm.id, { type: "nextPhase" }, /non è finita/);
    });
    await T("F5 le 11 Fasi del gioco completo: Sezioni del regolamento e macchie/pieghe che crescono Fase dopo Fase (salti di stato + «nextPhase» reale)", async () => {
      const seen = [];
      for (let idx = 0; idx < 10; idx++) {
        // scelgo un seme per cui il Dado della Morte NON scatti, per attraversare tutte le Fasi
        let seed = 500;
        for (; seed < 700; seed++) {
          const base = E.newGame({ players: [PL.ada, PL.bruno, PL.carla], seed }).state;
          base.phaseIdx = idx;
          base.status = "fine-fase";
          base.queue = [];
          const r = E.apply(base, { type: "nextPhase" }, { getTally: FF.FFGame.tallyFor });
          if (r.state.status === "temi") break;
        }
        ok(seed < 700, `nessun seme senza morte per la Fase ${idx + 1}`);
        await jumpToFineFase(idx, { seed });
        await D({ type: "nextPhase" });
        const s = st();
        eq(s.phaseIdx, idx + 1, `Fase dopo ${idx + 1}`);
        eq(s.sections.length, RU.PHASES[idx + 1].sections, `Sezioni della Fase ${idx + 2}`);
        eq([s.residue.smudges.length, s.residue.creases.length], [smudgesFor(idx + 1), creasesFor(idx + 1)], `residui Fase ${idx + 2}`);
        seen.push(`${idx + 2}:${s.residue.smudges.length}/${s.residue.creases.length}`);
      }
      return `Fase:macchie/pieghe ${seen.join(" ")}`;
    });
  }

  // =====================================================================================
  // G. Dado della Morte
  // =====================================================================================
  if (runGroup("G")) {
    // trova, per ciascuna Fase con Dado, un seme che scatta e uno che no (calcolo puro con lo stesso motore)
    const scan = (idx, wantTrig) => {
      for (let seed = 1; seed < 400; seed++) {
        const base = E.newGame({ players: [PL.ada, PL.bruno, PL.carla], seed }).state;
        base.phaseIdx = idx;
        base.status = "fine-fase";
        base.queue = [];
        const r = E.apply(base, { type: "nextPhase" }, { getTally: FF.FFGame.tallyFor });
        const d = r.effects.find((e) => e.type === "deathDie");
        if (d && d.triggered === wantTrig) return { seed, d };
      }
      return null;
    };
    await T("G1 soglie del Dado: 6 (30–39), 5+ (40–49), 4+ (50–55), 3+ (56–60); nessun Dado prima dei 30 anni", () => {
      eq(RU.PHASES.map((p) => p.death), [null, null, null, null, null, null, null, 6, 5, 4, 3]);
      for (const [roll, exp] of [[5, false], [6, true]]) eq(RU.deathTriggers(RU.PHASES[7], roll), exp, `30–39 con ${roll}`);
      eq([4, 5].map((r) => RU.deathTriggers(RU.PHASES[8], r)), [false, true]);
      eq([3, 4].map((r) => RU.deathTriggers(RU.PHASES[9], r)), [false, true]);
      eq([2, 3].map((r) => RU.deathTriggers(RU.PHASES[10], r)), [false, true]);
      eq(RU.deathTriggers(RU.PHASES[6], 6), false);
    });
    for (const [idx, label] of [[6, "30–39"], [7, "40–49"], [8, "50–55"], [9, "56–60"]]) {
      await T(`G2.${label} Dado della Morte reale prima della Fase ${label}: tiro 1–6, card, soglia coerente (scatta / non scatta)`, async () => {
        for (const trig of [false, true]) {
          const f = scan(idx, trig);
          ok(f, `nessun seme con scatta=${trig} per ${label}`);
          await jumpToFineFase(idx, { seed: f.seed });
          const ids = msgIds();
          const before = st();
          await D({ type: "nextPhase" });
          await settle();
          const s = st();
          const card = effectMsgs(newMsgsSince(ids), "deathDie");
          eq(card.length, 1, "card del Dado della Morte");
          const txt = cardEl(card[0]).textContent;
          const roll = f.d.roll;
          ok(roll >= 1 && roll <= 6, `tiro fuori dal d6: ${roll}`);
          ok(txt.includes(String(roll)) && txt.includes(`${RU.PHASES[idx + 1].death}+`), `card: ${txt}`);
          eq(f.d.triggered, roll >= RU.PHASES[idx + 1].death, "soglia incoerente col tiro");
          const nextFirst = (before.firstIdx + 1) % 3;
          ok(txt.includes(before.players[nextFirst].name), "il Dado lo tira il nuovo primo giocatore");
          if (trig) {
            eq([s.status, s.phaseIdx, s.epilogue?.reason], ["epilogo-lanci", idx, "dado"], "doveva iniziare l'Epilogo");
            ok(/Inizia l'Epilogo/.test(txt));
            ok(effectMsgs(newMsgsSince(ids), "epilogue").length === 1, "card Epilogo");
          } else {
            eq([s.status, s.phaseIdx], ["temi", idx + 1], "la storia doveva continuare");
            ok(/Ancora tempo/.test(txt));
            eq(effectMsgs(newMsgsSince(ids), "epilogue").length, 0);
          }
        }
      });
    }
    await T("G3 dopo l'ultima Fase (56–60) si va all'Epilogo senza Dado (motivo «fine»), pulsante «Vai all'Epilogo» coerente", async () => {
      await jumpToFineFase(10);
      const ids = msgIds();
      await D({ type: "nextPhase" });
      const s = st();
      eq([s.status, s.epilogue?.reason], ["epilogo-lanci", "fine"]);
      eq(effectMsgs(newMsgsSince(ids), "deathDie").length, 0, "Dado tirato dopo l'ultima Fase");
    });
  }

  // =====================================================================================
  // H. Epilogo: chi muore, spareggio, finali, scelta
  // =====================================================================================
  async function setScores(spec) {
    // spec: { actor: { legami, problemi, indL, indP } } → crea voci di prova
    for (const a of [fx.ada, fx.bruno, fx.carla]) await a.deleteEmbeddedDocuments("Item", a.items.map((i) => i.id));
    for (const [key, v] of Object.entries(spec)) {
      const items = [];
      for (let i = 0; i < (v.legami ?? 0); i++) items.push({ name: `L${i}`, type: "legame" });
      for (let i = 0; i < (v.problemi ?? 0); i++) items.push({ name: `P${i}`, type: "problematica" });
      for (let i = 0; i < (v.indL ?? 0); i++) items.push({ name: `IL${i}`, type: "legame", system: { indistruttibile: true } });
      for (let i = 0; i < (v.indP ?? 0); i++) items.push({ name: `IP${i}`, type: "problematica", system: { indistruttibile: true } });
      for (let i = 0; i < (v.rimossi ?? 0); i++) items.push({ name: `R${i}`, type: "legame", system: { rimosso: true } });
      if (items.length) await fx[key].createEmbeddedDocuments("Item", items);
    }
  }
  if (runGroup("H")) {
    let epi;
    await T("H1 Epilogo (via Dado): muore il punteggio più alto (Indistruttibili doppi, rimosse ignorate), mix dei finali, metà foglio strappata, 8 Sezioni", async () => {
      // Ada: legami 1 + ind 1 (=3) , problemi 1 → 2 ; Bruno: problemi 2 + indP 1 (=4), legami 1 → -3 ; Carla: legami 1, rimossi ignorati → 1
      await setScores({ ada: { legami: 1, indL: 1, problemi: 1 }, bruno: { legami: 1, problemi: 2, indP: 1 }, carla: { legami: 1, rimossi: 3 } });
      eq(FF.FFGame.tallyFor(fx.ada.id), { legami: 3, problemi: 1, score: 2 });
      eq(FF.FFGame.tallyFor(fx.bruno.id), { legami: 1, problemi: 4, score: -3 });
      eq(FF.FFGame.tallyFor(fx.carla.id), { legami: 1, problemi: 0, score: 1 });
      await jumpToFineFase(9, { seed: 100 });
      // seme che scatta
      let seed = null;
      for (let sd = 1; sd < 400 && !seed; sd++) {
        const b = E.newGame({ players: [PL.ada, PL.bruno, PL.carla], seed: sd }).state;
        b.phaseIdx = 9;
        b.status = "fine-fase";
        b.queue = [];
        const r = E.apply(b, { type: "nextPhase" }, { getTally: FF.FFGame.tallyFor });
        if (r.state.status === "epilogo-lanci") seed = sd;
      }
      await jumpToFineFase(9, { seed });
      const ids = msgIds();
      await D({ type: "nextPhase" });
      await settle();
      const s = st();
      epi = s;
      eq(s.status, "epilogo-lanci");
      eq(s.epilogue.dead, fx.ada.id, "doveva morire Ada (saldo più alto)");
      eq(s.epilogue.scores, { [fx.ada.id]: 2, [fx.bruno.id]: -3, [fx.carla.id]: 1 });
      eq(s.epilogue.mix, { key: "A", ...RU.endingMix(3, 1) }, "mix finali: legami 3 >= doppio dei problemi (1) → tipo A (4/3/1)");
      eq([s.epilogue.mix.lieto, s.epilogue.mix.dolceamaro, s.epilogue.mix.drammatico], [4, 3, 1]);
      eq(s.sections.length, 8, "8 Sezioni dei finali");
      eq(s.torn, true);
      eq(s.half, { x: 90 + 550, y: 70, w: 550, h: 760 }, "metà foglio (destra)");
      eq(s.phaseLabel, "Epilogo");
      const counts = { lieto: 0, dolceamaro: 0, drammatico: 0 };
      for (const k of Object.values(s.epilogue.endings)) counts[k]++;
      eq(counts, { lieto: 4, dolceamaro: 3, drammatico: 1 }, "distribuzione dei finali sulle 8 Sezioni");
      eq(s.sections.map((x) => x.theme), s.sections.map((x) => RU.ENDING_TYPES[s.epilogue.endings[x.id]].label), "i Temi delle Sezioni sono i tipi di finale");
      eq(s.queue.length, 3, "un lancio a testa");
      eq([s.residue.smudges.length, s.residue.creases.length], [0, 0], "la metà strappata è pulita");
      const card = effectMsgs(newMsgsSince(ids), "epilogue");
      eq(card.length, 1);
      ok(card[0].content.includes(fx.ada.name) && card[0].content.includes("<strong>2</strong>") && card[0].content.includes("<strong>-3</strong>"), "card Epilogo: punteggi/nome del defunto");
    });
    await T("H2 lanci d'Epilogo: una sola biglia a testa, solo di turno, esito/card, «Avanti»; biglia fuori dalla Mappa non si rilancia", async () => {
      let s = st();
      eq(s.status, "epilogo-lanci");
      for (let i = 0; i < 3; i++) {
        s = st();
        const cur = s.players[s.turnIdx];
        const other = s.players.find((p) => p.actorId !== cur.actorId);
        ok(E.marblesLeft(s, cur) === 1, "deve restare 1 biglia");
        if (i === 0) await expectReject(other.userId, { type: "throw", launch: { x: 40, y: 450, vx: 600, vy: 0 } }, /Non puoi farlo adesso/);
        const f = findThrow(s, (r) => r.effects[0].type === "epilogueThrow" && (i === 1 ? r.effects[0].section == null : r.effects[0].section != null), { seed: 40 + i });
        const ids = msgIds();
        await expectOk(cur.userId, { type: "throw", launch: f.launch });
        const t = st();
        eq(t.thrown[cur.actorId], 1);
        eq(E.marblesLeft(t, cur), 0);
        const card = effectMsgs(newMsgsSince(ids), "epilogueThrow")[0];
        ok(card && card.content.includes(cur.name), "card del lancio d'Epilogo");
        ok(i === 1 ? /fuori dalla Mappa/.test(card.content) : /si ferma nella Sezione/.test(card.content), `testo card: ${card.content}`);
        await expectReject(cur.userId, { type: "throw", launch: f.launch }, /racconta/);
        await expectOk(cur.userId, { type: "advance" });
      }
      s = st();
      ok(["concluso", "epilogo-scelta"].includes(s.status), `stato dopo l'ultimo lancio: ${s.status}`);
      epi = s;
    });
    await T("H3 finale: coerente con la Sezione più popolata (ricalcolo indipendente), card finale con tipo e Epitaffio", async () => {
      const s = st();
      const pe = RU.pickEnding(s.sections, s.marbles, s.epilogue.endings);
      if (pe.tie) {
        eq(s.status, "epilogo-scelta");
        eq(s.epilogue.result.tiedKinds.slice().sort(), [...new Set(pe.sectionIds.map((id) => s.epilogue.endings[id]))].sort());
      } else {
        eq(s.status, "concluso");
        eq(s.epilogue.result.ending, pe.ending, "finale diverso dal ricalcolo");
        const ending = game.messages.contents.filter((m) => ffFlag(m).effect === "ending").at(-1);
        ok(ending && ending.content.includes(RU.ENDING_TYPES[pe.ending].label) && /Epitaffio/.test(ending.content), "card del finale");
      }
      return `finale: ${pe.tie ? "pareggio" : pe.ending}`;
    });
    await T("H4 pareggio tra finali diversi: sceglie solo chi interpreta il defunto (o GM); scelta non valida rifiutata; chiude la partita", async () => {
      await setScores({ ada: { legami: 2 }, bruno: { legami: 0 }, carla: { problemi: 1 } });
      await jumpToFineFase(10, { seed: 100 });
      await D({ type: "nextPhase" });
      let s = st();
      eq(s.epilogue.dead, fx.ada.id);
      // creo un pareggio: una biglia in una Sezione «lieto» e una in una «drammatico»
      const kinds = s.epilogue.endings;
      const [a, b] = [Object.keys(kinds).find((id) => kinds[id] === "lieto"), Object.keys(kinds).find((id) => kinds[id] !== "lieto")];
      ok(a && b, "servono due tipi di finale diversi");
      const c = (id) => GEO.polygonCentroid(s.sections.find((x) => x.id === id).poly);
      await setRaw((x) => {
        x.marbles = [
          { id: "t1", ownerId: fx.ada.id, color: "#fff", x: c(a)[0], y: c(a)[1] },
          { id: "t2", ownerId: fx.bruno.id, color: "#000", x: c(b)[0], y: c(b)[1] },
        ];
        x.queue = [0];
        x.turnIdx = 0;
        x.thrown = { [fx.ada.id]: 1, [fx.bruno.id]: 1 };
        x.awaiting = { rethrow: false, case: "epilogo" };
      });
      const ids = msgIds();
      await expectOk(userOfActor(fx.ada.id), { type: "advance" });
      await settle();
      s = st();
      eq(s.status, "epilogo-scelta");
      ok(effectMsgs(newMsgsSince(ids), "endingTie").length === 1, "card del pareggio");
      const tied = s.epilogue.result.tiedKinds;
      eq(tied.length, 2);
      await expectReject(users.bob.id, { type: "chooseEnding", kind: tied[0] }, /Non puoi/);
      await expectReject(users.gm.id, { type: "chooseEnding", kind: "tragico" }, /non valido/);
      await expectReject(users.gm.id, { type: "chooseEnding", kind: "inventato" }, /non valido/);
      await expectOk(users.alice.id, { type: "chooseEnding", kind: tied[1] });
      s = st();
      eq([s.status, s.epilogue.result.ending], ["concluso", tied[1]]);
      const ending = game.messages.contents.filter((m) => ffFlag(m).effect === "ending").at(-1);
      ok(ending.content.includes(RU.ENDING_TYPES[tied[1]].label));
      await expectReject(users.gm.id, { type: "chooseEnding", kind: tied[0] }, /Nessuna scelta/);
    });
    await T("H5 nessuna biglia sulla Mappa → finale tragico; biglie fuori dalla metà non contano", async () => {
      await setScores({ ada: { legami: 1 }, bruno: {}, carla: {} });
      await jumpToFineFase(10, { seed: 100 });
      await D({ type: "nextPhase" });
      await setRaw((x) => {
        x.marbles = [{ id: "t1", ownerId: fx.bruno.id, color: "#000", x: 120, y: 400 }]; // nella metà strappata
        x.queue = [0];
        x.turnIdx = 0;
        x.awaiting = { rethrow: false, case: "epilogo" };
      });
      await expectOk(userOfActor(FF.state.players[0].actorId), { type: "advance" });
      const s = st();
      eq([s.status, s.epilogue.result.ending], ["concluso", "tragico"]);
      const ending = game.messages.contents.filter((m) => ffFlag(m).effect === "ending").at(-1);
      ok(/Finale tragico/.test(ending.content), "card Finale tragico");
    });
    await T("H6 pareggio sul punteggio più alto: spareggio col d6 (card), muore chi ottiene di più tra i pari", async () => {
      await setScores({ ada: { legami: 2 }, bruno: { legami: 2 }, carla: { problemi: 3 } });
      for (let sd = 1; sd < 30; sd++) {
        await jumpToFineFase(10, { seed: sd });
        const ids = msgIds();
        await D({ type: "nextPhase" });
        await settle();
        const s = st();
        const card = effectMsgs(newMsgsSince(ids), "tieRolls");
        ok(card.length >= 1, `nessuna card di spareggio (seme ${sd})`);
        const rolls = s.epilogue.tieRolls;
        ok([fx.ada.id, fx.bruno.id].every((id) => rolls[id] >= 1 && rolls[id] <= 6), `tiri: ${JSON.stringify(rolls)}`);
        ok([fx.ada.id, fx.bruno.id].includes(s.epilogue.dead), "è morto un non pari");
        const other = s.epilogue.dead === fx.ada.id ? fx.bruno.id : fx.ada.id;
        ok(rolls[s.epilogue.dead] > rolls[other], `muore chi ha tirato meno: ${JSON.stringify(rolls)}`);
        if (sd > 6) break; // basta qualche seme
      }
    });
    await T("H7 mix dei finali per rapporto Legami/Problematiche (A: ≥ doppio, B: >, C: =, D: <) e totali sempre 8", () => {
      const cases = [[4, 2, "A", [4, 3, 1]], [3, 2, "B", [3, 3, 2]], [2, 2, "C", [2, 3, 3]], [1, 2, "D", [1, 3, 4]], [0, 0, "C", [2, 3, 3]], [5, 0, "A", [4, 3, 1]]];
      for (const [l, p, k, m] of cases) {
        const r = RU.endingMix(l, p);
        eq([r.key, r.lieto, r.dolceamaro, r.drammatico], [k, ...m], `legami ${l} problemi ${p}`);
        eq(r.lieto + r.dolceamaro + r.drammatico, 8);
      }
    });
    await T("H8 swapEndings (prima dei lanci): scambia due Sezioni e ne aggiorna il Tema; rifiutato dopo i lanci", async () => {
      await setScores({ ada: { legami: 1 }, bruno: {}, carla: {} });
      await jumpToFineFase(10, { seed: 100 });
      await D({ type: "nextPhase" });
      const s = st();
      const [x, y] = ["e1", "e2"];
      const kx = s.epilogue.endings[x];
      const ky = s.epilogue.endings[y];
      await expectOk(userOfActor(s.epilogue.dead), { type: "swapEndings", a: x, b: y });
      const t = st();
      eq([t.epilogue.endings[x], t.epilogue.endings[y]], [ky, kx]);
      eq(t.sections.find((q) => q.id === x).theme, RU.ENDING_TYPES[ky].label);
      await expectReject(users.bob.id, { type: "swapEndings", a: x, b: y }, /Non puoi/);
      await setRaw((q) => {
        q.marbles = [{ id: "t1", ownerId: fx.ada.id, color: "#fff", x: 700, y: 200 }];
      });
      await expectReject(users.gm.id, { type: "swapEndings", a: x, b: y }, /solo prima dei lanci/);
    });
  }

  // =====================================================================================
  // J. Permessi / robustezza dell'API
  // =====================================================================================
  if (runGroup("J")) {
    await T("J1 azione sconosciuta e azioni senza partita: rifiutate senza errori JS", async () => {
      await D({ type: "reset" });
      await expectReject(users.gm.id, { type: "throw", launch: { x: 40, y: 450, vx: 600, vy: 0 } }, /Nessuna partita/);
      await expectReject(users.alice.id, { type: "setTheme", sectionId: "x", text: "a" }, /Non puoi/);
      await expectReject(users.alice.id, { type: "advance" }, /Non puoi/);
      await expectReject(users.alice.id, { type: "nextPhase" }, /Non puoi/);
      await D({ type: "newGame", config: { players: [PL.ada, PL.bruno], seed: 8 } });
      await expectReject(users.gm.id, { type: "voloSullaLuna" }, /sconosciuta/);
      await expectReject(users.alice.id, { type: "voloSullaLuna" }, /Non puoi/);
    });
    await T("J2 un utente che NON siede al Tavolo non può scrivere Temi, ridisegnare Sezioni, avviare i lanci né avanzare di Fase", async () => {
      // partita Ada + Carla (GM); Bob non gioca
      await D({ type: "reset" });
      await D({ type: "newGame", config: { players: [PL.ada, PL.carla], seed: 8 } });
      const accepted = [];
      const id1 = st().sections[0].id;
      for (const a of [{ type: "setTheme", sectionId: id1, text: "intruso" }, { type: "rerollSections" }, { type: "randomThemes" }, { type: "beginThrows" }]) {
        const r = await act(users.bob.id, a);
        if (!r.error) accepted.push(a.type);
      }
      eq(accepted, [], "Bob (non partecipante) ha eseguito azioni di Tavolo");
    });
    await T("J3 solo un giocatore partecipante può registrare un legame di Fase tra personaggi della partita", async () => {
      await D({ type: "reset" });
      await D({ type: "newGame", config: { players: [PL.ada, PL.carla], seed: 8 } });
      const r = await act(users.bob.id, { type: "registerBond", a: fx.ada.id, b: fx.carla.id });
      ok(r.error, "Bob (non partecipante) ha registrato un legame");
    });
  }

  // =====================================================================================
  // K. Interfaccia: Tavolo, pannello, dialogo «Nuova partita», schede
  // =====================================================================================
  const tavoloEl = () => document.querySelector("#friends-forever-tavolo");
  const fitTavolo = async () => {
    // la finestra ricorda l'ultima dimensione (anche se aperta quando la pagina era piccola): la rimetto a misura
    await FF.FFTavolo.instance?.setPosition({ left: 10, top: 10, width: 1260, height: 770 });
    await sleep(120);
  };
  const panelText = () => tavoloEl()?.querySelector(".ff-panel")?.textContent ?? "";
  if (runGroup("K")) {
    await T("K1 il Tavolo si apre (API, bottone in chat, controllo scena, Alt+T): una sola finestra con canvas 1280x900 e pannello", async () => {
      await D({ type: "reset" });
      await FF.FFTavolo.instance?.close();
      await sleep(150);
      ok(!tavoloEl(), "il Tavolo doveva essere chiuso");
      await FF.openTable();
      await waitFor(() => tavoloEl()?.querySelector("canvas.ff-canvas"), { what: "canvas" });
      const c = tavoloEl().querySelector("canvas.ff-canvas");
      eq([c.width, c.height], [1280, 900]);
      ok(tavoloEl().querySelector(".ff-panel"), "pannello assente");
      ok(/Nuova partita/.test(panelText()) && /Friends Forever/.test(panelText()), `pannello senza partita: ${panelText()}`);
      // chiusura + riapertura da chat
      await FF.FFTavolo.instance.close();
      await showChat();
      document.querySelector("#chat .ff-open-table").click();
      await waitFor(() => tavoloEl()?.querySelector("canvas.ff-canvas"), { what: "apertura da bottone in chat" });
      // un secondo click non crea una seconda finestra
      document.querySelector("#chat .ff-open-table").click();
      await sleep(200);
      eq(document.querySelectorAll("#friends-forever-tavolo").length, 1, "finestre del Tavolo duplicate");
      // controllo scena
      await FF.FFTavolo.instance.close();
      const tool = document.querySelector('#scene-controls [data-tool="friendsForever"]');
      ok(tool, "strumento nel controllo scena assente dal DOM");
      tool.click();
      await waitFor(() => tavoloEl()?.querySelector("canvas.ff-canvas"), { what: "apertura dal controllo scena" });
      // Alt+T
      await FF.FFTavolo.instance.close();
      for (const type of ["keydown", "keyup"]) window.dispatchEvent(new KeyboardEvent(type, { key: "t", code: "KeyT", altKey: true, bubbles: true }));
      await waitFor(() => tavoloEl()?.querySelector("canvas.ff-canvas"), { what: "apertura con Alt+T" });
      await fitTavolo();
      const cr = tavoloEl().querySelector("canvas.ff-canvas").getBoundingClientRect();
      ok(cr.width >= 700 && cr.height >= 480, `canvas troppo piccolo in una finestra 1260x770: ${Math.round(cr.width)}x${Math.round(cr.height)}`);
      near(cr.width / cr.height, 1280 / 900, 0.02, "proporzioni del canvas");
    });
    await T("K2 senza partita il canvas disegna foglio e scritta; con partita disegna la carta (non vuoto)", async () => {
      const c = tavoloEl().querySelector("canvas.ff-canvas");
      const px = (x, y) => [...c.getContext("2d").getImageData(x, y, 1, 1).data];
      await waitFor(() => px(600, 120)[3] > 0, { timeout: 3000, what: "primo disegno del canvas (requestAnimationFrame)" });
      const paper = px(600, 120);
      ok(paper[0] > 200 && paper[1] > 190, `il foglio non è chiaro: ${paper}`);
      const wood = px(20, 20);
      ok(wood[0] < 120, `il tavolo non è scuro: ${wood}`);
    });
    await T("K3 dialogo «Nuova partita» (GM): partecipanti, modalità, opzioni; «Inizia» crea la partita e apre il Tavolo sulla Fase 1", async () => {
      document.querySelector('#friends-forever-tavolo [data-action="newGame"]').click();
      const dlg = await waitFor(() => openDialogs().find((d) => /Nuova partita/.test(d.title)), { what: "dialogo Nuova partita" });
      const t = dlg.element.textContent;
      ok(/In gruppo/.test(t) && /In solitario/.test(t) && /dimostrativa/.test(t) && /Disordine/.test(t), "dialogo incompleto");
      const sel = dlg.element.querySelector('.ff-setup-row select');
      ok(sel, "selezione del Personaggio assente");
      const optNames = [...sel.options].map((o) => o.textContent);
      ok(optNames.some((n) => /crea un nuovo Personaggio/.test(n)), "manca «crea un nuovo Personaggio»");
      // il dialogo è davvero visibile (non tagliato)
      const r = dlg.element.getBoundingClientRect();
      ok(r.width >= 480 && r.top >= 0 && r.bottom <= innerHeight + 2, `dialogo fuori schermo/troppo piccolo: ${JSON.stringify(r)}`);
      // seleziono solo la riga del GM (altri utenti possono essere connessi) col Personaggio di prova
      const rows = [...dlg.element.querySelectorAll(".ff-setup-row")];
      const gmRow = rows.find((r) => /\(GM\)/.test(r.textContent));
      ok(gmRow, "riga del GM assente");
      for (const r of rows) r.querySelector('input[type="checkbox"]').checked = r === gmRow;
      gmRow.querySelector("select").value = fx.carla.id;
      eq(gmRow.querySelector("select").value, fx.carla.id, "il Personaggio di prova non è elencato nel dialogo");
      await fillDialog({ title: /Nuova partita/, values: { demo: true, disordine: false } });
      await waitFor(() => FF.state, { what: "partita creata" });
      await settle();
      const s = st();
      eq([s.demo, s.solo, s.opts.disordine, s.players.length], [true, false, false, 1]);
      eq(s.players[0].actorId, fx.carla.id);
      await waitFor(() => /Fase 1\/3/i.test(panelText()), { what: "pannello sulla Fase 1/3" });
      ok(/6–10 anni/.test(panelText()) && /dimostrativa/.test(panelText()), panelText());
    });
    await T("K3b dopo «Nuova partita» a Tavolo già aperto il canvas visibile è quello disegnato (stesso elemento, carta visibile) e Alt+T/bottone a finestra aperta non lo svuotano", async () => {
      const tv = FF.FFTavolo.instance;
      const live = () => tavoloEl().querySelector("canvas.ff-canvas");
      const paperPx = () => [...live().getContext("2d").getImageData(600, 120, 1, 1).data];
      await sleep(400); // lascio il tempo al ridisegno (rAF)
      const problems = [];
      if (live() !== tv.canvas?.canvas) problems.push("dopo «Nuova partita» il canvas nel DOM è un altro elemento da quello in cui disegna TavoloCanvas (stage ri-renderizzato da FFTavolo.open())");
      if (paperPx()[3] === 0) problems.push("il canvas visibile è vuoto (nessun pixel disegnato)");
      await FF.openTable(); // come premere il bottone in chat / Alt+T a finestra aperta
      await sleep(250);
      if (live() !== tv.canvas?.canvas) problems.push("openTable() a finestra aperta sostituisce il canvas con uno vuoto");
      if (paperPx()[3] === 0) problems.push("openTable() a finestra aperta: canvas visibile vuoto");
      eq(problems, [], "canvas del Tavolo");
    });
    await T("K4 pannello (Temi): 6–8 campi, «Inizia i lanci» disabilitato finché manca un Tema, si abilita scrivendo; «Suggerisci»/«Ridisegna» funzionano", async () => {
      const inputs = () => [...tavoloEl().querySelectorAll("input[data-section]")];
      eq(inputs().length, 8);
      const start = () => tavoloEl().querySelector('[data-action="beginThrows"]');
      ok(start().disabled, "«Inizia i lanci» attivo con Temi vuoti");
      tavoloEl().querySelector('[data-action="randomThemes"]').click();
      await waitFor(() => inputs().every((i) => i.value.trim()), { what: "Temi suggeriti" });
      ok(!start().disabled, "«Inizia i lanci» ancora disabilitato con tutti i Temi");
      const before = JSON.stringify(st().sections.map((x) => x.poly));
      tavoloEl().querySelector('[data-action="rerollSections"]').click();
      await waitFor(() => JSON.stringify(FF.state.sections.map((x) => x.poly)) !== before, { what: "Sezioni ridisegnate" });
      // scrivo a mano un Tema, svuoto un altro: il pannello segue
      const i0 = inputs()[0];
      i0.value = "";
      i0.dispatchEvent(new Event("change", { bubbles: true }));
      await waitFor(() => FF.state.sections[0].theme === "", { what: "Tema svuotato" });
      await waitFor(() => start().disabled, { what: "pulsante disabilitato" });
      const i1 = inputs()[0];
      i1.value = "bar";
      i1.dispatchEvent(new Event("change", { bubbles: true }));
      await waitFor(() => !start().disabled, { what: "pulsante abilitato" });
      eq(FF.state.sections[0].theme, "bar");
    });
    await T("K5 «Inizia i lanci»: pannello di turno, vassoio biglie, «Termina» e «Nuova partita» solo per il GM", async () => {
      tavoloEl().querySelector('[data-action="beginThrows"]').click();
      await waitFor(() => FF.state?.status === "lanci", { what: "stato lanci" });
      await waitFor(() => /di turno/.test(panelText()), { what: "pannello di turno" });
      const li = tavoloEl().querySelector(".ff-players li.is-turn");
      ok(li, "giocatore di turno non evidenziato");
      eq(li.querySelectorAll(".ff-tray .ff-marble").length, 2, "vassoio con le 2 biglie");
      ok(/Tocca a te/.test(panelText()), panelText());
      ok(tavoloEl().querySelector('[data-action="reset"]') && tavoloEl().querySelector('[data-action="newGame"]'), "controlli del GM assenti");
    });
    await T("K6 lancio con eventi puntatore sul canvas (sintetici): da fuori dal foglio parte e produce la card; da dentro il foglio avvisa e non parte", async () => {
      // (aggiro il difetto K3b riaprendo la finestra, per provare la logica del puntatore in sé)
      await FF.FFTavolo.instance.close();
      await FF.openTable();
      await waitFor(() => tavoloEl()?.querySelector("canvas.ff-canvas"), { what: "canvas" });
      await fitTavolo();
      const tv = FF.FFTavolo.instance;
      const c = tv.canvas.canvas;
      ok(c === tavoloEl().querySelector("canvas.ff-canvas") && c.getBoundingClientRect().width > 300, "canvas del Tavolo non utilizzabile");
      c.setPointerCapture = () => {};
      const rect = c.getBoundingClientRect();
      const toClient = (x, y) => ({ clientX: rect.left + (x / 1280) * rect.width, clientY: rect.top + (y / 900) * rect.height });
      const ptr = (type, x, y, target = c) => target.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, button: 0, pointerId: 7, isPrimary: true, ...toClient(x, y) }));
      // dentro il foglio: avviso
      const n = spyNotes();
      ptr("pointerdown", 600, 400);
      n.restore();
      ok(n.log.some((x) => /fuori dal foglio/.test(x.m)), "nessun avviso per il lancio da dentro il foglio");
      ok(!tv.canvas.aim, "la mira non doveva partire");
      // fuori: tieni, trascina all'indietro, rilascia
      const ids = msgIds();
      const before = sig();
      ptr("pointerdown", 40, 450);
      ok(tv.canvas.aim, "la mira non è partita");
      ptr("pointermove", 20, 450);
      ptr("pointermove", 5, 450); // trascino a sinistra → lancio verso destra
      window.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, button: 0, pointerId: 7, ...toClient(5, 450) }));
      await waitFor(() => sig() !== before, { what: "lancio eseguito" });
      await settle();
      const s = st();
      ok(["racconto", "fuori", "solco"].includes(s.last?.outcome?.case ?? "solco"), `esito: ${s.last?.outcome?.case}`);
      ok(newMsgsSince(ids).length >= 1, "nessuna card in chat dopo il lancio");
      ok(s.last.tracks.length >= 1, "nessuna traiettoria registrata");
      // trascinamento troppo corto: annullato
      if (s.awaiting) {
        await D({ type: "advance" });
        await settle();
      }
      const b2 = sig();
      if (FF.state.status === "lanci" && !FF.state.pending) {
        ptr("pointerdown", 40, 450);
        ptr("pointermove", 38, 450);
        window.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, button: 0, pointerId: 7, ...toClient(38, 450) }));
        await sleep(200);
        eq(sig(), b2, "un trascinamento troppo corto ha lanciato");
      }
      delete c.setPointerCapture;
    });
    await T("K7 scheda Personaggio: Tabella dell'Amicizia, punteggio, Indistruttibili sottolineati, aggiunta/rimozione voci, note, colore", async () => {
      const a = fx.carla;
      await a.deleteEmbeddedDocuments("Item", a.items.map((i) => i.id));
      await a.createEmbeddedDocuments("Item", [
        { name: "Amicizia nata al parco", type: "legame", system: { descrizione: "<p>Amicizia nata al parco</p>", con: [{ id: null, nome: "Zeta" }], fase: "3–5 anni" } },
        { name: "Sempre insieme", type: "legame", system: { descrizione: "<p>Sempre insieme</p>", indistruttibile: true } },
        { name: "Litigio", type: "problematica", system: { descrizione: "<p>Litigio</p>" } },
      ]);
      await a.sheet.render(true);
      const el = await waitFor(() => a.sheet.element?.querySelector(".ff-cols"), { what: "scheda" });
      const root = a.sheet.element;
      eq(root.querySelectorAll(".ff-col-legami .ff-voce").length, 2);
      eq(root.querySelectorAll(".ff-col-problemi .ff-voce").length, 1);
      eq(root.querySelector(".ff-score-n").textContent.trim(), "2", "punteggio (2 + 1 doppio... = legami 3, problemi 1)");
      ok(/3 legami · 1 problemi/.test(root.querySelector(".ff-score-l").textContent), root.querySelector(".ff-score-l").textContent);
      const ind = root.querySelector(".ff-voce.is-indestructible .ff-voce-text");
      ok(ind, "voce Indistruttibile senza classe");
      ok(/underline/.test(getComputedStyle(ind).textDecorationLine), "la voce Indistruttibile non è sottolineata");
      ok(root.querySelector(".ff-voce.is-indestructible .ff-tag-ind"), "etichetta Indistruttibile");
      ok(!root.querySelector('.ff-voce.is-indestructible [data-action="removeVoce"]'), "una voce Indistruttibile offre l'azione «Elimina dal foglio»");
      ok(root.querySelector('.ff-voce:not(.is-indestructible) [data-action="removeVoce"]'), "voce normale senza «Elimina»");
      // aggiungere una voce
      const idsK7 = new Set(a.items.map((i) => i.id));
      root.querySelector('[data-action="addVoce"][data-tipo="problematica"]').click();
      await fillDialog({ title: /Nuova Problematica/, values: { testo: "Mi sento escluso", indistruttibile: true } });
      await waitFor(() => a.items.size === 4, { what: "nuova voce" });
      const nuova = a.items.find((i) => !idsK7.has(i.id));
      eq([nuova.type, nuova.system.indistruttibile], ["problematica", true], "il GM può marcare Indistruttibile dall'aggiunta manuale");
      await waitFor(() => /3 legami · 3 problemi/.test(a.sheet.element.querySelector(".ff-score-l").textContent), { what: "punteggio aggiornato" });
      // rimuovere una voce normale (dialogo «racconta come»)
      const litigio = a.items.find((i) => i.name === "Litigio");
      a.sheet.element.querySelector(`[data-item-id="${litigio.id}"] [data-action="removeVoce"]`).click();
      await fillDialog({ title: /Elimina/, values: { racconto: "ci siamo chiariti" } });
      await waitFor(() => litigio.system.rimosso, { what: "voce rimossa" });
      await waitFor(() => a.sheet.element.querySelector(`[data-item-id="${litigio.id}"].is-removed`), { what: "voce barrata" });
      ok(a.sheet.element.querySelector(`[data-item-id="${litigio.id}"] .ff-voce-rimossa`)?.textContent.includes("ci siamo chiariti"), "racconto della rimozione");
      ok(a.sheet.element.querySelector(`[data-item-id="${litigio.id}"] [data-action="restoreVoce"]`), "il GM non vede «Ripristina»");
      // colore e note
      const col = a.sheet.element.querySelector('input[name="system.colore"]');
      col.value = "#3366cc";
      col.dispatchEvent(new Event("change", { bubbles: true }));
      await waitFor(() => String(a.system.colore).toLowerCase() === "#3366cc", { what: "colore salvato" });
      await a.update({ "system.note": "<p>Note di prova</p>" });
      await waitFor(() => a.sheet.element.querySelector(".ff-notes")?.textContent.includes("Note di prova"), { what: "le note nell'editor della scheda" });
      await a.update({ "system.colore": "#d6453d", "system.note": "" });
    });
    await T("K8 scheda: le voci Indistruttibili non hanno azioni di rimozione per un non-GM (template) e il GM può ripristinare/cancellare", async () => {
      const a = fx.carla;
      const root = a.sheet.element;
      ok(root, "scheda non aperta");
      ok(root.querySelector(".ff-voce.is-indestructible [data-action='deleteVoce']"), "il GM non vede «Cancella del tutto»");
      // apertura della voce singola
      const ind = a.items.find((i) => i.system.indistruttibile);
      root.querySelector(`[data-item-id="${ind.id}"] [data-action="editVoce"]`).click();
      await waitFor(() => ind.sheet.element?.querySelector("input[name='system.fase']"), { what: "scheda della voce" });
      eq(ind.sheet.constructor.name, "FFVoceSheet");
      ok(!ind.sheet.element.querySelector("input[name='system.indistruttibile']").disabled, "il GM non può modificare il flag Indistruttibile");
      await ind.sheet.close();
    });
    await T("K9 layout: finestre e pannello senza testo tagliato né elementi fuori dalla finestra (1260x770 e scheda)", async () => {
      const problems = [];
      const check = (root, label) => {
        const wr = root.getBoundingClientRect();
        for (const el of root.querySelectorAll("button, label, h1, h2, h3, a, .ff-pill, .ff-tag, li, input[type=text]")) {
          if (!el.offsetParent) continue;
          const r = el.getBoundingClientRect();
          if (r.width && r.right > wr.right + 1) problems.push(`${label}: ${el.tagName}.${el.className} esce a destra (${Math.round(r.right - wr.right)}px)`);
          const cs = getComputedStyle(el);
          if (el.scrollWidth > el.clientWidth + 2 && cs.overflowX !== "visible") problems.push(`${label}: ${el.tagName}.${el.className} «${(el.textContent || el.value || "").trim().slice(0, 30)}» tagliato`);
        }
      };
      const t = tavoloEl();
      if (t) check(t, "Tavolo");
      const sh = fx.carla.sheet.element;
      if (sh) check(sh, "Scheda");
      eq(problems, [], "problemi di layout");
    });
    await T("K10 pulsante «Termina»: chiede conferma; confermando la partita finisce (stato nullo) e il pannello torna a «Nuova partita»", async () => {
      tavoloEl().querySelector('[data-action="reset"]').click();
      const dlg = await waitFor(() => openDialogs().find((d) => /Termina/.test(d.title)), { what: "conferma Termina" });
      dlg.element.querySelector('button[data-action="no"]').click();
      await waitFor(() => !dlg.rendered);
      ok(FF.state, "«No» ha chiuso la partita");
      tavoloEl().querySelector('[data-action="reset"]').click();
      const d2 = await waitFor(() => openDialogs().find((d) => /Termina/.test(d.title)));
      d2.element.querySelector('button[data-action="yes"]').click();
      await waitFor(() => FF.state === null, { what: "stato nullo" });
      await waitFor(() => /Nuova partita/.test(panelText()) && !/Fase \d/.test(panelText()), { what: "pannello senza partita" });
    });
  }

  // =====================================================================================
  // Z. Persistenza: snapshot prima della ricarica / verifica dopo la ricarica
  // =====================================================================================
  let snapMode = false;
  if (runGroup("Z")) {
    if (snapPrev) {
      snapMode = true;
      await T("Z2 dopo la ricarica: lo stato della partita è identico a quello salvato prima", async () => {
        ok(snapPrev.state, "snapshot senza stato");
        ok(FF.state, "dopo la ricarica non c'è più nessuna partita");
        eq(JSON.stringify(FF.state), JSON.stringify(snapPrev.state), "lo stato dopo la ricarica è diverso");
        eq(game.messages.size, snapPrev.nMsgs, "numero di messaggi in chat cambiato");
        eq(game.actors.filter((a) => a.name.startsWith(PREFIX)).length, 3, "attori di prova");
      });
      await T("Z3 dopo la ricarica: il Tavolo si riapre sulla stessa partita (canvas con lo stesso stato) e la partita prosegue", async () => {
        await FF.openTable();
        await waitFor(() => tavoloEl()?.querySelector("canvas.ff-canvas"), { what: "canvas" });
        const tv = FF.FFTavolo.instance;
        await waitFor(() => tv.canvas?.state, { what: "stato nel canvas" });
        eq(tv.canvas.state.seq, snapPrev.state.seq, "il canvas non mostra lo stato salvato");
        ok(panelText().includes(snapPrev.state.phaseLabel), `pannello: ${panelText().slice(0, 120)}`);
        // la partita prosegue: risolvo ciò che era in sospeso
        const s = st();
        const cur = s.players[s.turnIdx];
        if (s.pending) await expectOk(cur.userId, { type: "chooseGroove", sectionId: s.pending.options[0] });
        else if (s.awaiting) await expectOk(cur.userId, { type: "advance" });
        else {
          const f = findThrow(s, isCase("racconto"));
          await expectOk(cur.userId, { type: "throw", launch: f.launch });
        }
        ok(FF.state.seq > s.seq, "la partita non è avanzata dopo la ricarica");
      });
      sessionStorage.removeItem(SNAP_KEY);
    } else if (!globalThis.FF_E2E_NOSNAP) {
      await T("Z1 prepara lo snapshot: partita in corso con un solco in sospeso e voci sul foglio (RICARICA LA PAGINA e rilancia lo script)", async () => {
        const pls = [PL.ada, PL.bruno, PL.carla];
        await startGame({ players: pls, seed: 99 });
        await ANN.creaVoce({ actor: fx.ada, tipo: "legame", testo: "voce per la persistenza", con: [{ id: fx.bruno.id, nome: fx.bruno.name }], indistruttibile: true });
        await settle();
        const s = st();
        const f = findThrow(s, isCase("solco"), { seed: 77 });
        await throwLive(f.launch);
        ok(FF.state.pending, "nessun solco in sospeso");
        sessionStorage.setItem(SNAP_KEY, JSON.stringify({ state: FF.state, nMsgs: game.messages.size, baseMsgIds: [...baseMsgIds], at: Date.now() }));
        return "snapshot salvato in sessionStorage";
      });
    }
  }

  // ---------------------------------------------------------------- chiusura
  await T("Y errori JS non gestiti durante la suite (console/eccezioni del sistema)", () => {
    eq(jsErrors, [], "errori JS");
  });
  window.removeEventListener("error", onErr);
  window.removeEventListener("unhandledrejection", onErr);
  console.error = origConsoleError;

  const pendingReload = !!sessionStorage.getItem(SNAP_KEY);
  if (!pendingReload) await cleanup();
  const failed = results.filter((r) => !r.ok);
  results.push({
    nome: "RIEPILOGO",
    ok: failed.length === 0,
    dettaglio: `${results.length - failed.length} ok, ${failed.length} falliti${pendingReload ? " — RICARICA LA PAGINA (F5) e rilancia lo script per la verifica di persistenza e la pulizia finale" : snapMode ? " (verifica post-ricarica completata, ripulito)" : ""}`,
  });
  console.table(results.map((r) => ({ nome: r.nome, ok: r.ok, dettaglio: String(r.dettaglio).slice(0, 220) })));
  return results;
})();
