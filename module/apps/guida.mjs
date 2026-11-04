import { ARTE, urlArte } from "../data/arte.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/** Indirizzo a cui arrivano assistenza e segnalazioni di bug (cambialo qui). */
export const EMAIL_ASSISTENZA = "michael.guidotti@latavernadiguido.it";

/** Informazioni utili per capire un problema, senza dati personali. */
function diagnostica() {
  const st = game.ff?.state;
  return [
    `Friends Forever (sistema): ${game.system.version}`,
    `Foundry VTT: ${game.version}`,
    `Ruolo: ${game.user.isGM ? "GM" : "giocatore"}`,
    `Browser: ${navigator.userAgent}`,
    `Schermo: ${window.innerWidth}x${window.innerHeight}`,
    st
      ? `Partita: ${st.status}, ${st.phaseLabel}, ${st.players.length} giocatori${st.solo ? ", solitario" : ""}${st.demo ? ", dimostrativa" : ""}`
      : "Partita: nessuna in corso",
  ].join("\n");
}

/** Guida: introduzione, comandi e crediti. */
export class FFGuida extends HandlebarsApplicationMixin(ApplicationV2) {
  static instance = null;

  static DEFAULT_OPTIONS = {
    id: "friends-forever-guida",
    classes: ["friends-forever", "ff-guida"],
    window: { title: "Friends Forever — Guida, comandi e crediti", icon: "fa-solid fa-book-skull", resizable: true },
    position: { width: 760, height: 720 },
    actions: { guidaTab: FFGuida.onTab, segnala: FFGuida.onSegnala, copiaDiagnostica: FFGuida.onCopia },
  };

  static PARTS = {
    body: { template: "systems/friends-forever/templates/guida/guida.hbs", scrollable: [".ff-guida-page"] },
  };

  static open(tab = "intro") {
    FFGuida.instance ??= new FFGuida();
    FFGuida.instance.tab = tab;
    FFGuida.instance.render({ force: true });
    return FFGuida.instance;
  }

  async _prepareContext() {
    return { tab: this.tab ?? "intro", cover: urlArte(ARTE.copertina), art: !!urlArte(ARTE.copertina), email: EMAIL_ASSISTENZA, diagnostica: diagnostica() };
  }

  _onRender() {
    const tab = this.tab ?? "intro";
    this.element.querySelectorAll("[data-page]").forEach((p) => p.classList.toggle("is-active", p.dataset.page === tab));
    this.element.querySelectorAll("[data-action='guidaTab']").forEach((b) => b.classList.toggle("is-active", b.dataset.tab === tab));
    this.element.classList.toggle("has-art", !!urlArte(ARTE.copertina));
  }

  static onSegnala(event, target) {
    const tipo = target.dataset.tipo === "assistenza" ? "Assistenza" : "Segnalazione bug";
    const corpo = `Ciao,\n\n[Descrivi qui cosa è successo e cosa ti aspettavi. Se puoi, scrivi i passi per ripeterlo.]\n\n---\nInformazioni tecniche (non modificare):\n${diagnostica()}\n`;
    window.open(`mailto:${EMAIL_ASSISTENZA}?subject=${encodeURIComponent(`[Friends Forever Foundry] ${tipo}`)}&body=${encodeURIComponent(corpo)}`, "_self");
  }

  static async onCopia() {
    await game.clipboard.copyPlainText(diagnostica());
    ui.notifications.info("Informazioni tecniche copiate: incollale nella tua email.");
  }

  static onTab(event, target) {
    this.tab = target.dataset.tab;
    this._onRender();
  }
}
