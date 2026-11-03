import { FFGame } from "../game/ff-game.mjs";
import { currentPlayer, marblesLeft } from "../game/engine.mjs";
import { TavoloCanvas } from "./tavolo-canvas.mjs";
import { setupDialog } from "./setup.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

const KIND_LABEL = { lieto: "Finale lieto", dolceamaro: "Finale dolceamaro", drammatico: "Finale drammatico" };

/** La finestra del Tavolo: Mappa con biglie + pannello di gioco. */
export class FFTavolo extends HandlebarsApplicationMixin(ApplicationV2) {
  static instance = null;

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
    },
  };

  static PARTS = {
    stage: { template: "systems/friends-forever/templates/tavolo/stage.hbs" },
    panel: { template: "systems/friends-forever/templates/tavolo/panel.hbs", scrollable: [".ff-panel-scroll"] },
  };

  static open() {
    FFTavolo.instance ??= new FFTavolo();
    FFTavolo.instance.render({ force: true });
    return FFTavolo.instance;
  }

  /** Chiamato quando lo stato cambia (da qualunque client). */
  static onState() {
    const app = FFTavolo.instance;
    if (!app?.rendered) return;
    app.render({ parts: ["panel"] });
    app.canvas?.setState(FFGame.state);
  }

  async _prepareContext() {
    const st = FFGame.state;
    const me = game.user;
    const ctx = { isGM: me.isGM, hasGame: !!st };
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
    });
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
    if (!this.canvas) {
      const el = this.element.querySelector("canvas.ff-canvas");
      if (el) {
        this.canvas = new TavoloCanvas(el, {
          onLaunch: (launch) => FFTavolo.#launch(launch),
          canAim: () => FFTavolo.#canAim(),
          volume: () => game.settings.get("friends-forever", "volume"),
        });
        this.canvas.setState(FFGame.state);
      }
    }
    // Temi editabili
    this.element.querySelectorAll("input[data-section]").forEach((input) => {
      input.addEventListener("change", (ev) => {
        FFGame.dispatch({ type: "setTheme", sectionId: ev.currentTarget.dataset.section, text: ev.currentTarget.value });
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

  static onOpenSheet(event, target) {
    game.actors.get(target.dataset.actor)?.sheet.render(true);
  }
}
