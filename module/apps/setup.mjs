import { FFGame } from "../game/ff-game.mjs";
import { MARBLE_COLORS } from "../game/engine.mjs";

const { DialogV2 } = foundry.applications.api;
const { FormDataExtended } = foundry.applications.ux;
const esc = (s) => foundry.utils.escapeHTML?.(String(s ?? "")) ?? String(s ?? "");

function personaggiPer(user) {
  const all = game.actors.filter((a) => a.type === "personaggio");
  const owned = all.filter((a) => a.testUserPermission(user, "OWNER") && !user.isGM);
  return owned.length ? owned : all;
}

/** Dialogo del GM per iniziare una nuova partita. */
export async function setupDialog() {
  const users = game.users.filter((u) => u.active);
  if (!users.length) return;
  const rows = users
    .map((u, i) => {
      const actors = personaggiPer(u);
      const opts = [
        ...actors.map((a) => `<option value="${a.id}">${esc(a.name)}</option>`),
        `<option value="__new__">— crea un nuovo Personaggio —</option>`,
      ].join("");
      return `<div class="ff-setup-row">
        <label class="ff-check"><input type="checkbox" name="u.${i}" ${u.isGM && users.length > 1 ? "" : "checked"}> <strong>${esc(u.name)}</strong>${u.isGM ? " (GM)" : ""}</label>
        <select name="a.${i}">${opts}</select>
      </div>`;
    })
    .join("");
  const content = `<div class="ff-dialog ff-setup">
    <p class="ff-hint">Scegli chi siede al Tavolo (l'ordine è quello del senso orario). Da 1 a 5 giocatori.</p>
    ${rows}
    <fieldset><legend>Modalità</legend>
      <label class="ff-check"><input type="radio" name="mode" value="gruppo" checked> In gruppo (masterless)</label>
      <label class="ff-check"><input type="radio" name="mode" value="solo"> In solitario (un giocatore + 3 PNG)</label>
      <div class="ff-solo-names"><input type="text" name="npc0" placeholder="PNG 1" value="Amico 1"><input type="text" name="npc1" placeholder="PNG 2" value="Amico 2"><input type="text" name="npc2" placeholder="PNG 3" value="Amico 3"></div>
    </fieldset>
    <fieldset><legend>Opzioni</legend>
      <label class="ff-check"><input type="checkbox" name="demo"> Sessione dimostrativa (3 Fasi, ~2 ore)</label>
      <label class="ff-check"><input type="checkbox" name="azzera" checked> Azzera i fogli dei Personaggi (cancella Legami e Problematiche della partita precedente)</label>
      <label class="ff-check"><input type="checkbox" name="disordine" checked> Disordine sul tavolo (le biglie rimbalzano su bicchieri e ciotole)</label>
    </fieldset>
  </div>`;
  const data = await DialogV2.prompt({
    window: { title: "Nuova partita · Friends Forever", icon: "fa-solid fa-circle-play" },
    position: { width: 520 },
    content,
    modal: true,
    rejectClose: false,
    ok: { label: "Inizia", callback: (e, b) => new FormDataExtended(b.form).object },
  });
  if (!data) return;
  const solo = data.mode === "solo";
  const demo = !!data.demo;
  const players = [];
  for (let i = 0; i < users.length; i++) {
    const v = data[`u.${i}`] ?? data.u?.[i];
    if (!v) continue;
    const user = users[i];
    let actorId = data[`a.${i}`] ?? data.a?.[i];
    let actor;
    if (actorId === "__new__" || !actorId) {
      actor = await Actor.create({
        name: `Personaggio di ${user.name}`,
        type: "personaggio",
        ownership: { default: 0, [user.id]: CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER },
        system: { colore: MARBLE_COLORS[players.length % MARBLE_COLORS.length] },
      });
    } else {
      actor = game.actors.get(actorId);
    }
    if (!actor) continue;
    players.push({
      userId: user.id,
      actorId: actor.id,
      name: actor.name,
      color: MARBLE_COLORS[players.length % MARBLE_COLORS.length],
    });
  }
  if (!players.length) {
    ui.notifications.warn("Seleziona almeno un giocatore.");
    return;
  }
  if (solo && players.length !== 1) {
    ui.notifications.warn("Il solitario si gioca con un solo giocatore.");
    return;
  }
  // allinea il colore delle biglie del foglio a quello assegnato
  for (const p of players) {
    const a = game.actors.get(p.actorId);
    if (a && String(a.system.colore).toLowerCase() !== p.color.toLowerCase()) await a.update({ "system.colore": p.color });
  }
  if (data.azzera) {
    for (const p of players) {
      const a = game.actors.get(p.actorId);
      const ids = a?.items.filter((i) => i.type === "legame" || i.type === "problematica").map((i) => i.id) ?? [];
      // le voci Indistruttibili le cancella solo il GM: in una nuova partita è lui a decidere
      if (ids.length) await a.deleteEmbeddedDocuments("Item", ids);
    }
  }
  await FFGame.dispatch({
    type: "newGame",
    config: {
      players,
      solo,
      demo,
      disordine: !!data.disordine,
      npcNames: [data.npc0 || "Amico 1", data.npc1 || "Amico 2", data.npc2 || "Amico 3"],
    },
  });
}
