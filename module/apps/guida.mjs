import { ARTE, urlArte } from "../data/arte.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/** Guida: introduzione, comandi e crediti. */
export class FFGuida extends HandlebarsApplicationMixin(ApplicationV2) {
  static instance = null;

  static DEFAULT_OPTIONS = {
    id: "friends-forever-guida",
    classes: ["friends-forever", "ff-guida"],
    window: { title: "Friends Forever — Guida, comandi e crediti", icon: "fa-solid fa-book-skull", resizable: true },
    position: { width: 760, height: 720 },
    actions: { tab: FFGuida.onTab },
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
    return { tab: this.tab ?? "intro", cover: urlArte(ARTE.copertina), art: !!urlArte(ARTE.copertina) };
  }

  _onRender() {
    const tab = this.tab ?? "intro";
    this.element.querySelectorAll("[data-page]").forEach((p) => p.classList.toggle("is-active", p.dataset.page === tab));
    this.element.querySelectorAll("[data-action='tab']").forEach((b) => b.classList.toggle("is-active", b.dataset.tab === tab));
    this.element.classList.toggle("has-art", !!urlArte(ARTE.copertina));
  }

  static onTab(event, target) {
    this.tab = target.dataset.tab;
    this._onRender();
  }
}
