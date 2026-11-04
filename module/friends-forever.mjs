import { PersonaggioData, VoceData } from "./documents/data-models.mjs";
import { FFActorSheet, FFVoceSheet } from "./sheets/actor-sheet.mjs";
import { FFGame, SYSTEM_ID } from "./game/ff-game.mjs";
import { FFTavolo } from "./apps/tavolo.mjs";
import { FFGuida } from "./apps/guida.mjs";
import { annotaDialog, rimuoviScelta } from "./apps/annota.mjs";
import { preparaContenuti, preparaScena } from "./content/setup-content.mjs";
import { rilevaArte } from "./data/arte.mjs";

Hooks.once("init", () => {
  console.log("Friends Forever | inizializzazione del sistema");
  CONFIG.Actor.dataModels.personaggio = PersonaggioData;
  CONFIG.Item.dataModels.legame = VoceData;
  CONFIG.Item.dataModels.problematica = VoceData;

  const { DocumentSheetConfig } = foundry.applications.apps;
  DocumentSheetConfig.registerSheet(Actor, SYSTEM_ID, FFActorSheet, {
    types: ["personaggio"],
    makeDefault: true,
    label: "Foglio Personaggio",
  });
  DocumentSheetConfig.registerSheet(Item, SYSTEM_ID, FFVoceSheet, {
    types: ["legame", "problematica"],
    makeDefault: true,
    label: "Voce della Tabella dell'Amicizia",
  });

  FFGame.register();

  foundry.applications.handlebars.loadTemplates(["systems/friends-forever/templates/actor/voce-riga.hbs"]);

  game.ff = {
    FFGame,
    FFTavolo,
    get state() {
      return FFGame.state;
    },
    openTable: () => FFTavolo.open(),
    openGuida: (tab) => FFGuida.open(tab),
  };

  game.keybindings.register(SYSTEM_ID, "openTable", {
    name: "Apri il Tavolo",
    editable: [{ key: "KeyT", modifiers: ["Alt"] }],
    onDown: () => {
      FFTavolo.open();
      return true;
    },
  });
});

Hooks.once("ready", async () => {
  FFGame.activateSocket();
  window.addEventListener("resize", foundry.utils.debounce(() => FFTavolo.onResize(), 200));
  await rilevaArte();
  // il Tavolo si apre da solo all'ingresso nel mondo; la guida la prima volta
  if (game.settings.get(SYSTEM_ID, "apriTavolo")) FFTavolo.open();
  if (!game.settings.get(SYSTEM_ID, "guidaVista")) {
    FFGuida.open("intro");
    game.settings.set(SYSTEM_ID, "guidaVista", true);
  }
  let hadGame = !!FFGame.state;
  Hooks.on("ffStateChanged", (state) => {
    if (state && !hadGame) FFTavolo.open();
    hadGame = !!state;
    FFTavolo.onState();
  });
  if (game.user.isGM) {
    await preparaContenuti();
    await preparaScena();
  }
});

// --- bottoni nelle card in chat -------------------------------------------------
Hooks.on("renderChatMessageHTML", (message, html) => {
  html.querySelectorAll("button[data-ff]").forEach((btn) => {
    const actor = game.actors.get(btn.dataset.actor);
    if (!actor?.isOwner) {
      btn.disabled = true;
      return;
    }
    btn.addEventListener("click", async (ev) => {
      ev.preventDefault();
      const tipo = btn.dataset.tipo;
      if (btn.dataset.ff === "annota") {
        const con = JSON.parse(btn.dataset.con || "[]").map((c) => ({ id: c.id, nome: c.name ?? c.nome }));
        await annotaDialog({ actor, tipo, con, indistruttibile: btn.dataset.ind === "1" });
      } else if (btn.dataset.ff === "rimuovi") {
        await rimuoviScelta({ actor, tipo, preferiti: (btn.dataset.pref || "").split(",").filter(Boolean) });
      }
    });
  });
});

// un Legame creato tra due Personaggi in questa Fase serve alla regola del Legame Indistruttibile
Hooks.on("ffVoceCreata", (actor, item) => {
  if (item.type !== "legame") return;
  const st = FFGame.state;
  if (!st) return;
  for (const c of item.system.con) {
    let other = c.id;
    if (!other) {
      const i = st.npcs?.findIndex((n) => n.name === c.nome) ?? -1;
      if (i >= 0) other = `npc:${i}`;
    }
    if (other) FFGame.dispatch({ type: "registerBond", a: actor.id, b: other });
  }
});

// --- gli Indistruttibili non si rimuovono ---------------------------------------
Hooks.on("preDeleteItem", (item, options, userId) => {
  if (item.system?.indistruttibile && !game.users.get(userId)?.isGM) return false;
});
Hooks.on("preUpdateItem", (item, changes, options, userId) => {
  if (!item.system?.indistruttibile || game.users.get(userId)?.isGM) return;
  const c = foundry.utils.expandObject(foundry.utils.deepClone(changes));
  const rimuove = foundry.utils.getProperty(c, "system.rimosso") === true;
  const declassa = foundry.utils.getProperty(c, "system.indistruttibile") === false;
  if (rimuove || declassa) {
    ui.notifications.warn("Le voci Indistruttibili non possono essere rimosse in alcun modo.");
    return false;
  }
});

// --- accesso al Tavolo ----------------------------------------------------------
Hooks.on("getSceneControlButtons", (controls) => {
  const group = controls.tokens ?? Object.values(controls)[0];
  if (!group) return;
  group.tools ??= {};
  group.tools.friendsForever = {
    name: "friendsForever",
    title: "Apri il Tavolo (Friends Forever)",
    icon: "fa-solid fa-circle",
    order: 99,
    button: true,
    visible: true,
    onChange: () => FFTavolo.open(),
  };
});

Hooks.on("renderChatLog", (app, html) => {
  const root = html instanceof HTMLElement ? html : html[0];
  if (!root || root.querySelector(".ff-open-table")) return;
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "ff-open-table";
  btn.innerHTML = '<i class="fa-solid fa-circle"></i> Apri il Tavolo di Friends Forever';
  btn.addEventListener("click", () => FFTavolo.open());
  root.insertAdjacentElement("afterbegin", btn);
});
