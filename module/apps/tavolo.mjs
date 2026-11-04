import { FFGame } from "../game/ff-game.mjs";
import { currentPlayer, marblesLeft } from "../game/engine.mjs";
import { TavoloCanvas } from "./tavolo-canvas.mjs";
import { setupDialog } from "./setup.mjs";
import { annotaDialog, rimuoviScelta } from "./annota.mjs";
import { FFGuida } from "./guida.mjs";
import { outcomeActions, penaltyActions } from "../game/chat.mjs";
import { ARTE, arteDiFase, arteDisponibile, caricaImmagine, urlArte } from "../data/arte.mjs";
import { spuntiPerFase } from "../data/spunti.mjs";
import { ENDING_TYPES } from "../core/rules.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

const KIND_LABEL = { lieto: "Finale lieto", dolceamaro: "Finale dolceamaro", drammatico: "Finale drammatico" };
const DADO = ["", "⚀", "⚁", "⚂", "⚃", "⚄", "⚅"];
const esc = (s) => foundry.utils.escapeHTML(String(s ?? ""));

/** Illustrazione + titolo in testa al pannello. */
function heroFor(st) {
  if (!arteDisponibile()) return null;
  if (!st) return { url: urlArte(ARTE.copertina), kicker: "GDR masterless", title: "Friends Forever" };
  if (st.epilogue) {
    return st.status === "concluso"
      ? { url: urlArte(ARTE.finale), kicker: "Epitaffio", title: ENDING_TYPES[st.epilogue.result?.ending]?.label ?? "Finale" }
      : { url: urlArte(ARTE.epilogo), kicker: "Epilogo", title: "L'ultimo capitolo" };
  }
  const phase = st.phases[st.phaseIdx];
  return { url: arteDiFase(phase.id), kicker: `Fase ${st.phaseIdx + 1}/${st.phases.length}`, title: phase.label };
}

function splashKey(st) {
  if (!st) return null;
  if (st.epilogue) return st.status === "concluso" ? "fine" : "epi";
  return `f${st.phaseIdx}`;
}

/** Tre spunti, sempre gli stessi per la stessa partita e Fase. */
function spunti3(st, phase) {
  const pool = spuntiPerFase(phase);
  const out = [];
  let h = (st.seed + st.phaseIdx * 7919) >>> 0;
  for (let i = 0; out.length < Math.min(3, pool.length) && i < 24; i++) {
    h = (Math.imul(h, 1664525) + 1013904223) >>> 0;
    const w = pool[h % pool.length];
    if (!out.includes(w)) out.push(w);
  }
  return out.join(" · ");
}

function splashFor(st) {
  const deadName = st.players.find((p) => p.actorId === st.epilogue?.dead)?.name ?? "";
  if (st.epilogue) {
    if (st.status === "concluso") {
      return {
        art: urlArte(ARTE.finale),
        kicker: "Epitaffio",
        title: (ENDING_TYPES[st.epilogue.result?.ending]?.label ?? "Finale").toUpperCase(),
        sub: `${deadName} racconta per primo`,
        words: "poi gli altri, in senso orario",
      };
    }
    return {
      art: urlArte(ARTE.epilogo),
      kicker: "Epilogo",
      title: "UNO DI VOI NON C'È PIÙ",
      sub: deadName ? `${deadName} è il Personaggio che muore` : "",
      words: "ricordate cosa vi ha fatto legare e litigare",
      ms: 8000,
    };
  }
  const phase = st.phases[st.phaseIdx];
  return {
    art: arteDiFase(phase.id),
    kicker: `Fase ${st.phaseIdx + 1} / ${st.phases.length}`,
    title: phase.label.toUpperCase(),
    sub: `${phase.sections} Sezioni · apre ${st.players[st.firstIdx]?.name ?? ""}`,
    words: spunti3(st, phase),
  };
}

function dieSplash(d) {
  return {
    die: true,
    kicker: "Dado della Morte",
    title: DADO[d.roll],
    sub: d.triggered ? "È arrivato il momento" : "Ancora tempo: la storia continua",
    words: `${d.by} tira prima della Fase ${d.phase} · l'Epilogo inizia con ${d.needed}+ (è uscito ${d.roll})`,
    ms: 4800,
  };
}

/** La finestra del Tavolo: Mappa con biglie + pannello di gioco. */
export class FFTavolo extends HandlebarsApplicationMixin(ApplicationV2) {
  static instance = null;
  static autoSize = null;

  static DEFAULT_OPTIONS = {
    id: "friends-forever-tavolo",
    classes: ["friends-forever", "ff-tavolo"],
    window: { title: "Friends Forever — Il Tavolo", icon: "fa-solid fa-circle", resizable: true, minimizable: true },
    position: { width: 1260, height: 770 },
    actions: {
      newGame: FFTavolo.onNewGame,
      reset: FFTavolo.onReset,
      randomThemes: FFTavolo.onRandomThemes,
      rerollSections: FFTavolo.onRerollSections,
      beginThrows: FFTavolo.onBeginThrows,
      advance: FFTavolo.onAdvance,
      nextPhase: FFTavolo.onNextPhase,
      chooseGroove: FFTavolo.onChooseGroove,
      chooseEnding: FFTavolo.onChooseEnding,
      openSheet: FFTavolo.onOpenSheet,
      guida: FFTavolo.onGuida,
      annotaVoce: FFTavolo.onAnnota,
      rimuoviVoce: FFTavolo.onRimuovi,
    },
  };

  static PARTS = {
    stage: { template: "systems/friends-forever/templates/tavolo/stage.hbs" },
    panel: { template: "systems/friends-forever/templates/tavolo/panel.hbs", scrollable: [".ff-panel-scroll"] },
  };

  static open() {
    FFTavolo.instance ??= new FFTavolo();
    const app = FFTavolo.instance;
    // finestra già aperta: non ri-renderizzare lo "stage" (sostituirebbe il <canvas>)
    if (app.rendered) {
      app.render({ parts: ["panel"] });
      app.bringToFront?.();
    } else app.render({ force: true, position: FFTavolo.#posizione() });
    return app;
  }

  /** Il Tavolo occupa il 90% dello schermo, centrato: intorno si intravede lo sfondo a tema. */
  static #posizione() {
    const w = Math.round(window.innerWidth * 0.9);
    const h = Math.round(window.innerHeight * 0.9);
    FFTavolo.autoSize = { w, h };
    return { width: w, height: h, left: Math.round((window.innerWidth - w) / 2), top: Math.round((window.innerHeight - h) / 2) };
  }

  /** Se la finestra del browser cambia misura e il Tavolo non è stato ridimensionato a mano, lo riadatta. */
  static onResize() {
    const app = FFTavolo.instance;
    if (!app?.rendered || !FFTavolo.autoSize) return;
    const { w, h } = FFTavolo.autoSize;
    if (Math.abs(app.position.width - w) > 4 || Math.abs(app.position.height - h) > 4) return;
    app.setPosition(FFTavolo.#posizione());
  }

  /** Chiamato quando lo stato cambia (da qualunque client). */
  static onState() {
    const app = FFTavolo.instance;
    if (!app?.rendered) return;
    const st = FFGame.state;
    const prev = app.lastState;
    app.lastState = st;
    app.canvas?.setState(st);
    app.maybeSplash(st, prev);
    // se cambiano solo i Temi non si ri-renderizza il pannello: il campo in cui scrivi perderebbe il fuoco
    if (st && prev && st.status === "temi" && prev.status === "temi" && st.phaseIdx === prev.phaseIdx && st.sections.length === prev.sections.length && st.solo === prev.solo) {
      app.patchThemes(st);
      return;
    }
    const active = document.activeElement;
    const key = active?.matches?.("input[data-section]") ? active.dataset.section : null;
    const caret = key ? [active.selectionStart, active.selectionEnd] : null;
    app.render({ parts: ["panel"] }).then(() => {
      if (!key) return;
      const el = app.element?.querySelector(`input[data-section="${key}"]`);
      el?.focus();
      if (caret) el?.setSelectionRange(...caret);
    });
  }

  // ---- schermate di apertura (Fase, dado, Epilogo, finale)
  maybeSplash(st, prev) {
    if (st?.deathRoll && st.deathRoll.seq !== prev?.deathRoll?.seq) this.enqueueSplash(dieSplash(st.deathRoll));
    if (st && splashKey(st) !== splashKey(prev)) this.enqueueSplash(splashFor(st));
  }

  enqueueSplash(cfg) {
    if (!cfg) return;
    (this.splashQueue ??= []).push(cfg);
    if (!this.splashActive) this.nextSplash();
  }

  nextSplash() {
    const cfg = this.splashQueue?.shift();
    const stage = this.element?.querySelector(".ff-stage");
    if (!cfg || !stage) {
      this.splashActive = false;
      return;
    }
    this.splashActive = true;
    const el = document.createElement("div");
    el.className = `ff-splash${cfg.art ? "" : " no-art"}${cfg.die ? " is-die" : ""}`;
    el.innerHTML = `${cfg.art ? `<div class="ff-splash-art" style="background-image:url('${esc(cfg.art)}')"></div>` : ""}
      <div class="ff-splash-text">
        <div class="ff-splash-kicker">${esc(cfg.kicker)}</div>
        <div class="ff-splash-title">${esc(cfg.title)}</div>
        ${cfg.sub ? `<div class="ff-splash-sub">${esc(cfg.sub)}</div>` : ""}
        ${cfg.words ? `<div class="ff-splash-words">${esc(cfg.words)}</div>` : ""}
        <div class="ff-splash-hint">clicca per continuare</div>
      </div>`;
    const close = () => {
      if (el.dataset.closed) return;
      el.dataset.closed = "1";
      el.classList.add("is-out");
      setTimeout(() => {
        el.remove();
        this.nextSplash();
      }, 560);
    };
    el.addEventListener("click", close);
    setTimeout(close, cfg.ms ?? 6500);
    stage.appendChild(el);
  }

  /** Aggiorna i campi dei Temi (e il bottone "Inizia i lanci") senza ridisegnare il pannello. */
  patchThemes(st) {
    const root = this.element;
    if (!root) return;
    for (const s of st.sections) {
      const input = root.querySelector(`input[data-section="${s.id}"]`);
      if (input && input !== document.activeElement && input.value !== s.theme) input.value = s.theme;
    }
    const btn = root.querySelector('[data-action="beginThrows"]');
    if (btn) btn.disabled = !st.sections.every((s) => s.theme.trim());
  }

  async _prepareContext() {
    const st = FFGame.state;
    const me = game.user;
    const ctx = { isGM: me.isGM, hasGame: !!st, hero: heroFor(st) };
    if (!st) return ctx;
    const cur = currentPlayer(st);
    const isMyTurn = !!cur && cur.userId === me.id;
    const canAct = isMyTurn || me.isGM;
    const phase = st.phases[st.phaseIdx];
    const nextPhase = st.phases[st.phaseIdx + 1] ?? null;
    const status = st.status;
    const dead = st.epilogue ? st.players.find((p) => p.actorId === st.epilogue.dead) : null;
    const iAmDead = !!dead && (dead.userId === me.id || me.isGM);
    return Object.assign(ctx, {
      st,
      status,
      isTemi: status === "temi",
      isLanci: status === "lanci",
      isFineFase: status === "fine-fase",
      isEpilogoLanci: status === "epilogo-lanci",
      isEpilogoScelta: status === "epilogo-scelta",
      isConcluso: status === "concluso",
      phaseLabel: st.epilogue ? "Epilogo" : phase.label,
      phaseNum: st.epilogue ? null : st.phaseIdx + 1,
      phaseTotal: st.phases.length,
      solo: st.solo,
      demo: st.demo,
      cur,
      isMyTurn,
      canAct,
      awaiting: !!st.awaiting,
      rethrow: !!st.awaiting?.rethrow,
      pending: st.pending
        ? st.pending.options.map((id) => {
            const s = st.sections.find((x) => x.id === id);
            return { id, num: s.num, theme: s.theme };
          })
        : null,
      players: st.players.map((p, i) => ({
        ...p,
        isTurn: ["lanci", "epilogo-lanci"].includes(status) && i === st.turnIdx,
        left: ["lanci", "epilogo-lanci"].includes(status) ? marblesLeft(st, p) : 0,
        leftArr: Array.from({ length: ["lanci", "epilogo-lanci"].includes(status) ? marblesLeft(st, p) : 0 }),
        mine: p.userId === me.id || me.isGM,
      })),
      npcs: st.npcs,
      sections: st.sections.map((s) => ({ id: s.id, num: s.num, theme: s.theme })),
      themesEditable: status === "temi",
      allThemes: st.sections.every((s) => s.theme.trim()),
      nextPhaseLabel: nextPhase?.label ?? null,
      nextDeath: nextPhase?.death != null ? nextPhase.death : null,
      lastPhase: !nextPhase,
      encounters: st.encounters,
      deadName: dead?.name,
      iAmDead,
      tiedKinds: st.epilogue?.result?.tiedKinds?.map((k) => ({ kind: k, label: KIND_LABEL[k] })) ?? [],
      ending: st.epilogue?.result?.ending ?? null,
      endingLabel: KIND_LABEL[st.epilogue?.result?.ending] ?? (st.epilogue?.result?.ending === "tragico" ? "Finale tragico" : ""),
      help: FFTavolo.#help(st, { isMyTurn, cur }),
      azioni: FFTavolo.#azioni(st, me),
    });
  }

  /** Bottoni "Annota sul foglio" per i personaggi dell'utente (il GM vede tutti). */
  static #azioni(st, me) {
    let rows = [];
    if (["lanci", "epilogo-lanci"].includes(st.status) && st.awaiting && st.last?.outcome?.involved) rows = outcomeActions(st.last.outcome, st);
    else if (st.status === "fine-fase" && st.encounters === 0) rows = penaltyActions(st);
    return rows
      .filter((r) => me.isGM || game.actors.get(r.actorId)?.isOwner)
      .map((r) => ({
        ...r,
        buttons: r.buttons.map((b) => ({ ...b, action: b.ff === "annota" ? "annotaVoce" : "rimuoviVoce" })),
      }));
  }

  static #help(st, { isMyTurn, cur }) {
    switch (st.status) {
      case "temi":
        return st.solo
          ? "I Temi sono stati tirati sulla tabella del Solitario. Puoi modificarli, poi inizia i lanci."
          : "Ogni giocatore scrive una sola parola in una Sezione (più è vaga, più spazio all'improvvisazione). Poi inizia i lanci.";
      case "lanci":
        if (st.pending) return "La biglia è sul solco: chi ha lanciato sceglie il Tema da trattare.";
        if (st.awaiting) return "Racconta cosa accade al tuo Personaggio e annota sul foglio (bottoni nella chat). Poi passa il turno.";
        return isMyTurn
          ? "Tocca a te: tieni premuto sul bordo del tavolo (fuori dal foglio), trascina all'indietro e rilascia per lanciare."
          : `Tocca a ${cur?.name}.`;
      case "fine-fase":
        return "Tutte le biglie sono state lanciate. Il primo giocatore passa a chi siede alla sua sinistra e la Mappa viene cancellata.";
      case "epilogo-lanci":
        return "Epilogo: ogni giocatore lancia una sola biglia cercando di farla finire nella Sezione del finale che preferisce.";
      case "epilogo-scelta":
        return "Pareggio tra finali diversi: sceglie il giocatore che interpreta il defunto.";
      case "concluso":
        return "La storia è finita. Racconta l'Epitaffio.";
      default:
        return "";
    }
  }

  _onRender(context, options) {
    this.element.classList.toggle("has-art", arteDisponibile());
    if (!this.seeded) {
      this.seeded = true;
      const st0 = FFGame.state;
      this.lastState = st0;
      // partita appena iniziata mentre la finestra si apriva: mostra la schermata della prima Fase
      if (st0 && st0.seq <= 3 && st0.status === "temi") this.enqueueSplash(splashFor(st0));
    }
    const stageEl = this.element.querySelector("canvas.ff-canvas");
    if (this.canvas && this.canvas.canvas !== stageEl) {
      this.canvas.destroy();
      this.canvas = null;
    }
    if (!this.canvas) {
      const el = stageEl;
      if (el) {
        this.canvas = new TavoloCanvas(el, {
          onLaunch: (launch) => FFTavolo.#launch(launch),
          canAim: () => FFTavolo.#canAim(),
          volume: () => game.settings.get("friends-forever", "volume"),
          art: (n) => this.artImgs?.[n] ?? null,
        });
        caricaImmagine(ARTE.grunge).then((img) => {
          if (!img) return;
          (this.artImgs ??= {}).grunge = img;
          if (this.canvas) {
            this.canvas.cache.table = null;
            this.canvas.requestDraw();
          }
        });
        this.canvas.setState(FFGame.state);
      }
    }
    // Temi editabili
    this.element.querySelectorAll("input[data-section]").forEach((input) => {
      const send = (ev) => FFGame.dispatch({ type: "setTheme", sectionId: ev.currentTarget.dataset.section, text: ev.currentTarget.value });
      let timer = null;
      // i Temi si salvano mentre scrivi (così "Inizia i lanci" si abilita subito) e al cambio di campo
      input.addEventListener("input", (ev) => {
        clearTimeout(timer);
        const target = ev.currentTarget;
        timer = setTimeout(() => FFGame.dispatch({ type: "setTheme", sectionId: target.dataset.section, text: target.value }), 300);
      });
      input.addEventListener("change", (ev) => {
        clearTimeout(timer);
        send(ev);
      });
    });
  }

  async _onClose(options) {
    this.canvas?.destroy();
    this.canvas = null;
    return super._onClose(options);
  }

  static #canAim() {
    const st = FFGame.state;
    if (!st || !["lanci", "epilogo-lanci"].includes(st.status) || st.awaiting || st.pending) return { ok: false };
    const cur = currentPlayer(st);
    if (!cur) return { ok: false };
    if (cur.userId !== game.user.id && !game.user.isGM) return { ok: false };
    return { ok: true, color: cur.color };
  }

  static #launch(launch) {
    const st = FFGame.state;
    const cur = currentPlayer(st);
    FFGame.dispatch({ type: "throw", launch, force: cur?.userId !== game.user.id });
  }

  // ---- azioni del pannello
  static onNewGame() {
    return setupDialog();
  }

  static async onReset() {
    const ok = await foundry.applications.api.DialogV2.confirm({
      window: { title: "Termina la partita" },
      content: "<p>Chiudere la partita in corso? Le voci sui fogli dei Personaggi restano.</p>",
    });
    if (ok) FFGame.dispatch({ type: "reset" });
  }

  static onRandomThemes() {
    FFGame.dispatch({ type: "randomThemes" });
  }

  static onRerollSections() {
    FFGame.dispatch({ type: "rerollSections" });
  }

  static onBeginThrows() {
    FFGame.dispatch({ type: "beginThrows" });
  }

  static onAdvance() {
    FFGame.dispatch({ type: "advance" });
  }

  static onNextPhase() {
    FFGame.dispatch({ type: "nextPhase" });
  }

  static onChooseGroove(event, target) {
    FFGame.dispatch({ type: "chooseGroove", sectionId: target.dataset.section });
  }

  static onChooseEnding(event, target) {
    FFGame.dispatch({ type: "chooseEnding", kind: target.dataset.kind });
  }

  static onGuida() {
    FFGuida.open();
  }

  static async onAnnota(event, target) {
    const actor = game.actors.get(target.dataset.actor);
    if (!actor) return;
    const con = JSON.parse(target.dataset.con || "[]").map((c) => ({ id: c.id, nome: c.name ?? c.nome }));
    await annotaDialog({ actor, tipo: target.dataset.tipo, con, indistruttibile: target.dataset.ind === "1" });
  }

  static async onRimuovi(event, target) {
    const actor = game.actors.get(target.dataset.actor);
    if (!actor) return;
    await rimuoviScelta({ actor, tipo: target.dataset.tipo, preferiti: (target.dataset.pref || "").split(",").filter(Boolean) });
  }

  static onOpenSheet(event, target) {
    game.actors.get(target.dataset.actor)?.sheet.render(true);
  }
}
