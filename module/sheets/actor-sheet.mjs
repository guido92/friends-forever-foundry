import { tally } from "../core/rules.mjs";
import { annotaDialog, rimuoviDialog } from "../apps/annota.mjs";
import { ARTE, urlArte } from "../data/arte.mjs";

const { HandlebarsApplicationMixin } = foundry.applications.api;
const { ActorSheetV2 } = foundry.applications.sheets;

/** Foglio Personaggio + Tabella dell'Amicizia (colonne LEGAMI / PROBLEMATICHE). */
export class FFActorSheet extends HandlebarsApplicationMixin(ActorSheetV2) {
  static DEFAULT_OPTIONS = {
    classes: ["friends-forever", "ff-sheet"],
    position: { width: 820, height: 760 },
    window: { resizable: true },
    form: { submitOnChange: true },
    actions: {
      addVoce: FFActorSheet.#onAddVoce,
      editVoce: FFActorSheet.#onEditVoce,
      removeVoce: FFActorSheet.#onRemoveVoce,
      restoreVoce: FFActorSheet.#onRestoreVoce,
      deleteVoce: FFActorSheet.#onDeleteVoce,
    },
  };

  static PARTS = {
    sheet: {
      template: "systems/friends-forever/templates/actor/personaggio.hbs",
      scrollable: [".ff-cols", ".ff-notes"],
    },
  };

  async _prepareContext(options) {
    const ctx = await super._prepareContext(options);
    const actor = this.document;
    const voci = actor.items.filter((i) => i.type === "legame" || i.type === "problematica");
    const view = (i) => ({
      id: i.id,
      tipo: i.type,
      nome: i.name,
      descrizione: i.system.descrizione,
      con: i.system.con.map((c) => c.nome).join(", "),
      fase: i.system.fase,
      indistruttibile: i.system.indistruttibile,
      rimosso: i.system.rimosso,
      rimossoRacconto: i.system.rimossoRacconto,
      canDelete: game.user.isGM || (!i.system.indistruttibile && this.isEditable),
    });
    const attive = (t) => voci.filter((i) => i.type === t).map(view);
    const t = tally(voci.map((i) => ({ tipo: i.type, ...i.system.toObject() })));
    return Object.assign(ctx, {
      actor,
      system: actor.system,
      banner: urlArte(ARTE.scheda),
      editable: this.isEditable,
      legami: attive("legame"),
      problemi: attive("problematica"),
      tally: t,
      noteHTML: await foundry.applications.ux.TextEditor.implementation.enrichHTML(actor.system.note, {
        relativeTo: actor,
        secrets: actor.isOwner,
      }),
    });
  }

  _onRender(context, options) {
    super._onRender?.(context, options);
    this.element.classList.toggle("has-art", !!context.banner);
  }

  static async #onAddVoce(event, target) {
    const tipo = target.dataset.tipo;
    await annotaDialog({ actor: this.document, tipo, manuale: true });
  }

  static #onEditVoce(event, target) {
    const item = this.document.items.get(target.closest("[data-item-id]").dataset.itemId);
    item?.sheet.render(true);
  }

  static async #onRemoveVoce(event, target) {
    const item = this.document.items.get(target.closest("[data-item-id]").dataset.itemId);
    if (!item) return;
    if (item.system.indistruttibile && !game.user.isGM) {
      ui.notifications.warn("Le voci Indistruttibili non possono essere rimosse in alcun modo.");
      return;
    }
    await rimuoviDialog({ actor: this.document, item });
  }

  static async #onRestoreVoce(event, target) {
    if (!game.user.isGM) return;
    const item = this.document.items.get(target.closest("[data-item-id]").dataset.itemId);
    await item?.update({ "system.rimosso": false, "system.rimossoRacconto": "" });
  }

  static async #onDeleteVoce(event, target) {
    const item = this.document.items.get(target.closest("[data-item-id]").dataset.itemId);
    if (!item) return;
    if (item.system.indistruttibile && !game.user.isGM) return;
    await item.delete();
  }
}

/** Voce singola (Legame/Problematica): editor completo del testo. */
const { ItemSheetV2 } = foundry.applications.sheets;
export class FFVoceSheet extends HandlebarsApplicationMixin(ItemSheetV2) {
  static DEFAULT_OPTIONS = {
    classes: ["friends-forever", "ff-voce"],
    position: { width: 480, height: 420 },
    window: { resizable: true },
    form: { submitOnChange: true },
  };

  static PARTS = {
    sheet: { template: "systems/friends-forever/templates/item/voce.hbs" },
  };

  async _prepareContext(options) {
    const ctx = await super._prepareContext(options);
    const item = this.document;
    return Object.assign(ctx, {
      item,
      system: item.system,
      editable: this.isEditable,
      isLegame: item.type === "legame",
      con: item.system.con.map((c) => c.nome).join(", "),
      lockedIndestructible: item.system.indistruttibile && !game.user.isGM,
      descrizioneHTML: await foundry.applications.ux.TextEditor.implementation.enrichHTML(item.system.descrizione, {
        relativeTo: item,
      }),
    });
  }
}
