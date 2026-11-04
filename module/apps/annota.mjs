/**
 * Dialoghi per annotare/rimuovere Legami e Problematiche sulla Tabella dell'Amicizia.
 */

const { DialogV2 } = foundry.applications.api;
const { FormDataExtended } = foundry.applications.ux;

const esc = (s) => foundry.utils.escapeHTML?.(String(s ?? "")) ?? String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

const TIPI = {
  legame: { singolare: "Legame", articolo: "un", titolo: "Nuovo Legame" },
  problematica: { singolare: "Problematica", articolo: "una", titolo: "Nuova Problematica" },
};

/** Altri personaggi con cui si può stringere un Legame / avere una Problematica. */
export function altriPersonaggi(actor) {
  const st = game.ff?.state;
  if (st?.players?.length) {
    const fromPlayers = st.players.filter((p) => p.actorId !== actor.id).map((p) => ({ id: p.actorId, nome: p.name }));
    const npcs = (st.npcs ?? []).map((n) => ({ id: null, nome: n.name }));
    return [...fromPlayers, ...npcs];
  }
  return game.actors
    .filter((a) => a.type === "personaggio" && a.id !== actor.id)
    .map((a) => ({ id: a.id, nome: a.name }));
}

function faseCorrente() {
  return game.ff?.state?.phaseLabel ?? "";
}

/**
 * Annota una voce sul foglio di `actor`.
 * @param {object} o
 * @param {Actor} o.actor
 * @param {"legame"|"problematica"} o.tipo
 * @param {{id:string|null,nome:string}[]} [o.con] preselezionati
 * @param {boolean} [o.indistruttibile] imposta dalla regola
 * @param {boolean} [o.manuale] aggiunta libera dalla scheda
 */
export async function annotaDialog({ actor, tipo, con = [], indistruttibile = false, manuale = false, intro = "" }) {
  const info = TIPI[tipo];
  const altri = altriPersonaggi(actor);
  const sel = new Set(con.map((c) => c.id ?? c.nome));
  if (!sel.size && altri.length === 1) sel.add(altri[0].id ?? altri[0].nome); // un solo altro personaggio: già selezionato
  const checks = altri
    .map((a, i) => {
      const key = a.id ?? a.nome;
      return `<label class="ff-check"><input type="checkbox" name="con.${i}" ${sel.has(key) ? "checked" : ""}> ${esc(a.nome)}</label>`;
    })
    .join("");
  const indBox = manuale
    ? game.user.isGM
      ? `<label class="ff-check"><input type="checkbox" name="indistruttibile"> Indistruttibile</label>`
      : ""
    : indistruttibile
      ? `<p class="ff-hint"><i class="fa-solid fa-infinity"></i> ${info.singolare} <strong>Indistruttibile</strong>: sottolineata, vale doppio e non si può rimuovere.</p>`
      : "";
  const content = `
    <div class="ff-dialog">
      ${intro ? `<p class="ff-hint">${intro}</p>` : ""}
      <div class="form-group stacked"><label>Racconta in breve (dal punto di vista di ${esc(actor.name)})</label>
        <textarea name="testo" rows="4" autofocus placeholder="es. «Ho assistito alla partita di Chiara…»"></textarea></div>
      <div class="form-group stacked"><label>Con chi</label><div class="ff-checks">${checks || "<em>nessuno</em>"}</div>
        <input type="text" name="altri" placeholder="altri nomi (separati da virgola)"></div>
      ${indBox}
    </div>`;
  const data = await DialogV2.prompt({
    window: { title: `${info.titolo} · ${actor.name}`, icon: tipo === "legame" ? "fa-solid fa-link" : "fa-solid fa-heart-crack" },
    position: { width: 460 },
    content,
    modal: false,
    rejectClose: false,
    ok: {
      label: "Annota",
      callback: (event, button) => new FormDataExtended(button.form).object,
    },
  });
  if (!data || !String(data.testo ?? "").trim()) return null;
  const conSel = altri.filter((a, i) => data[`con.${i}`] === true || data.con?.[i] === true);
  const extra = String(data.altri ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((nome) => ({ id: null, nome }));
  const ind = manuale ? !!data.indistruttibile : indistruttibile;
  return creaVoce({ actor, tipo, testo: String(data.testo).trim(), con: [...conSel, ...extra], indistruttibile: ind });
}

export async function creaVoce({ actor, tipo, testo, con = [], indistruttibile = false, fase = null }) {
  const info = TIPI[tipo];
  const nome = testo.length > 48 ? `${testo.slice(0, 45)}…` : testo;
  const [item] = await actor.createEmbeddedDocuments("Item", [
    {
      name: nome,
      type: tipo,
      img: tipo === "legame" ? "icons/svg/aura.svg" : "icons/svg/skull.svg",
      system: {
        descrizione: `<p>${esc(testo)}</p>`,
        con: con.map((c) => ({ id: c.id ?? null, nome: c.nome })),
        fase: fase ?? faseCorrente(),
        indistruttibile,
      },
    },
  ]);
  const conTxt = con.length ? ` con ${con.map((c) => esc(c.nome)).join(", ")}` : "";
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content: `<div class="ff-chat ff-note ${tipo}${indistruttibile ? " ind" : ""}"><header><strong>${esc(actor.name)}</strong> annota ${info.articolo} ${info.singolare}${indistruttibile ? " <em>Indistruttibile</em>" : ""}${conTxt}</header><p>${esc(testo)}</p></div>`,
    flags: { "friends-forever": { nota: true } },
  });
  Hooks.callAll("ffVoceCreata", actor, item);
  return item;
}

/** Elimina una voce dal foglio, raccontando come. */
export async function rimuoviDialog({ actor, item }) {
  const tipo = item.type;
  const verbo = tipo === "legame" ? "è andato perduto" : "è stata risolta";
  const data = await DialogV2.prompt({
    window: { title: `Elimina: ${item.name}`, icon: "fa-solid fa-eraser" },
    position: { width: 440 },
    content: `<div class="ff-dialog"><div class="form-group stacked"><label>Racconta come ${verbo} (${esc(actor.name)})</label>
      <textarea name="racconto" rows="4" autofocus></textarea></div></div>`,
    modal: false,
    rejectClose: false,
    ok: { label: "Cancella dal foglio", callback: (e, b) => new FormDataExtended(b.form).object },
  });
  if (!data) return null;
  await item.update({ "system.rimosso": true, "system.rimossoRacconto": String(data.racconto ?? "").trim() });
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content: `<div class="ff-chat ff-note removed"><header><strong>${esc(actor.name)}</strong> cancella ${tipo === "legame" ? "un Legame" : "una Problematica"}</header><p>${esc(item.name)}</p>${data.racconto ? `<p><em>${esc(data.racconto)}</em></p>` : ""}</div>`,
    flags: { "friends-forever": { nota: true } },
  });
  Hooks.callAll("ffVoceRimossa", actor, item);
  return item;
}

/** Sceglie una voce attiva (non Indistruttibile) da eliminare e la elimina. */
export async function rimuoviScelta({ actor, tipo, preferiti = [] }) {
  const attive = actor.items.filter((i) => i.type === tipo && !i.system.rimosso && !i.system.indistruttibile);
  if (!attive.length) {
    ui.notifications.info(`${actor.name} non ha ${tipo === "legame" ? "Legami" : "Problematiche"} eliminabili.`);
    return null;
  }
  const pref = new Set(preferiti);
  attive.sort((a, b) => {
    const pa = a.system.con.some((c) => pref.has(c.id)) ? 0 : 1;
    const pb = b.system.con.some((c) => pref.has(c.id)) ? 0 : 1;
    return pa - pb;
  });
  const options = attive
    .map((i) => `<option value="${i.id}">${esc(i.name)}${i.system.con.length ? ` — con ${esc(i.system.con.map((c) => c.nome).join(", "))}` : ""}</option>`)
    .join("");
  const verbo = tipo === "legame" ? "è andato perduto" : "è stata risolta";
  const data = await DialogV2.prompt({
    window: { title: `${tipo === "legame" ? "Elimina un Legame" : "Risolvi una Problematica"} · ${actor.name}`, icon: "fa-solid fa-eraser" },
    position: { width: 460 },
    content: `<div class="ff-dialog"><div class="form-group stacked"><label>Quale?</label><select name="id">${options}</select></div>
      <div class="form-group stacked"><label>Racconta come ${verbo}</label><textarea name="racconto" rows="4"></textarea></div></div>`,
    modal: false,
    rejectClose: false,
    ok: { label: "Cancella dal foglio", callback: (e, b) => new FormDataExtended(b.form).object },
  });
  if (!data?.id) return null;
  const item = actor.items.get(data.id);
  await item.update({ "system.rimosso": true, "system.rimossoRacconto": String(data.racconto ?? "").trim() });
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content: `<div class="ff-chat ff-note removed"><header><strong>${esc(actor.name)}</strong> ${tipo === "legame" ? "elimina un Legame" : "risolve una Problematica"}</header><p>${esc(item.name)}</p>${data.racconto ? `<p><em>${esc(data.racconto)}</em></p>` : ""}</div>`,
    flags: { "friends-forever": { nota: true } },
  });
  Hooks.callAll("ffVoceRimossa", actor, item);
  return item;
}
