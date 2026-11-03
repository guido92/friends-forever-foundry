/**
 * Messaggi in chat per gli eventi della partita (effetti prodotti dal motore).
 */
const esc = (s) => foundry.utils.escapeHTML?.(String(s ?? "")) ?? String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

const DIE = ["", "⚀", "⚁", "⚂", "⚃", "⚄", "⚅"];

const CASES = {
  fuori: {
    title: "La biglia esce dalla Mappa",
    text: "Nessun effetto: rilancia e… sii più delicato la prossima volta!",
  },
  racconto: {
    title: "Racconto",
    text: "Racconta in prima persona qualcosa del tuo Personaggio legato al Tema, poi annota i dettagli importanti sul Foglio Personaggio.",
  },
  incontro: {
    title: "Incontro",
    text: "Ogni Personaggio presente nella Sezione crea un <strong>Legame</strong> con gli altri <em>oppure</em> elimina una <strong>Problematica</strong> creata in precedenza con quello del giocatore di turno (narrando come si è risolta). Se il Legame esiste già, racconta come si consolida.",
  },
  propri: {
    title: "Solo biglie del tuo colore",
    text: "Solo il giocatore di turno <strong>elimina un Legame</strong> o <strong>crea una Problematica</strong>, in relazione al Tema. La Problematica può riguardare anche il Personaggio stesso.",
  },
  scontro: {
    title: "Scontro",
    text: "Le biglie sbalzate fuori tornano nella Sezione dello scontro insieme alla tua. Ogni giocatore coinvolto <strong>elimina un Legame</strong> o <strong>crea una Problematica</strong> (se tra loro c'è già un Legame può cancellarlo al posto di segnare la Problematica).",
  },
  "problematica-indistruttibile": {
    title: "Problematica Indistruttibile",
    text: "Hai spinto fuori una tua biglia: racconta il conflitto che sta vivendo il tuo Personaggio. È una <strong>Problematica Indistruttibile</strong>: sottolineata, vale doppio e non potrà essere rimossa in alcun modo.",
  },
  "legame-indistruttibile": {
    title: "Legame Indistruttibile",
    text: "Vi siete già legati in questa Fase: nasce un <strong>ricordo indelebile</strong>. Ogni coinvolto racconta e annota un <strong>Legame Indistruttibile</strong> dal proprio punto di vista (vale doppio e non potrà essere rimosso).",
  },
};

export function chatForEffect(e, state) {
  switch (e.type) {
    case "phase":
      return phaseCard(e);
    case "outcome":
      return outcomeCard(e, state);
    case "solco":
      return card("solco", "Sul solco!", `La biglia di <strong>${esc(e.player)}</strong> si è fermata tra due Sezioni (${e.options.map((n) => `n. ${n}`).join(" e ")}): scegli il Tema che preferisci trattare.`);
    case "phaseEnd":
      return phaseEndCard(e, state);
    case "deathDie":
      return deathCard(e);
    case "npcPlaced":
      return card(
        "npc",
        "Posizionamento dei PNG",
        e.placed.map((p) => `<div>${esc(p.npc)}: d6 = <strong>${p.roll}</strong> → Sezione ${p.section} <em>(${esc(p.theme)})</em></div>`).join(""),
      );
    case "tieRolls":
      return card("dice", "Spareggio", e.rolls.map((r) => `${esc(r.name)}: <span class="ff-die">${DIE[r.roll]}</span> ${r.roll}`).join("<br>"));
    case "epilogue":
      return epilogueCard(e);
    case "epilogueThrow":
      return card(
        "epilogue",
        `${e.player} lancia`,
        e.section ? `La biglia si ferma nella Sezione ${e.section}.` : "La biglia è fuori dalla Mappa: non si rilancia.",
      );
    case "endingTie":
      return card("epilogue", "Pareggio tra i finali", `Le Sezioni più popolate hanno finali diversi. Sceglie <strong>${esc(e.chooser)}</strong>, che interpreta il defunto.`);
    case "ending":
      return endingCard(e);
    default:
      return null;
  }
}

function card(cls, title, body) {
  return {
    content: `<div class="ff-chat ff-${cls}"><header>${title}</header><div class="ff-body">${body}</div></div>`,
    flags: {},
  };
}

function phaseCard(e) {
  return card(
    "phase",
    `Fase ${e.index + 1}/${e.total} · ${esc(e.phase)}`,
    `Tracciate le Sezioni e scrivete un Tema in ciascuna. Apre il racconto <strong>${esc(e.first)}</strong>.`,
  );
}

function deathCard(e) {
  return card(
    e.triggered ? "death hit" : "death",
    "Dado della Morte",
    `${esc(e.by)} tira il d6 prima della Fase ${esc(e.phase)}: <span class="ff-die">${DIE[e.roll]}</span> <strong>${e.roll}</strong> (l'Epilogo inizia con ${e.needed}+).<br>${
      e.triggered ? "<strong>È arrivato il momento. Inizia l'Epilogo.</strong>" : "Ancora tempo: la storia continua."
    }`,
  );
}

function phaseEndCard(e, state) {
  const base = `Tutte le biglie sono state lanciate: la Fase <strong>${esc(e.label)}</strong> è finita.`;
  if (!e.penalty) return card("phase", "Fine della Fase", base);
  const buttons = state.players
    .map(
      (p) =>
        `<button type="button" data-ff="rimuovi" data-actor="${p.actorId}" data-tipo="legame"><i class="fa-solid fa-eraser"></i> ${esc(p.name)}: elimina un Legame</button>`,
    )
    .join("");
  return card(
    "phase",
    "Fine della Fase",
    `${base}<br>Le vostre biglie non si sono <strong>mai incontrate</strong> in una Sezione: ognuno elimina un Legame (se ne ha almeno uno).<div class="ff-buttons">${buttons}</div>`,
  );
}

function outcomeCard(e, state) {
  const info = CASES[e.case];
  const names = e.involvedNames.map(esc).join(", ");
  const where = e.sectionNum ? `Sezione <strong>${e.sectionNum}</strong> · Tema <em>«${esc(e.theme)}»</em>` : "";
  const buttons = outcomeButtons(e, state);
  const who = e.involved.length > 1 ? `<div class="ff-who">Coinvolti: ${names}</div>` : "";
  return {
    content: `<div class="ff-chat ff-outcome ff-case-${e.case}"><header>${esc(e.throwerName)} · ${info.title}</header>
      <div class="ff-body">${where ? `<div class="ff-where">${where}</div>` : ""}${who}<p>${info.text}</p>${buttons}</div></div>`,
    flags: { outcome: e },
  };
}

function conList(e, state, actorId) {
  return e.involved
    .filter((o) => o !== actorId)
    .map((o) => ({ id: o.startsWith("npc:") ? null : o, name: ownerNameFrom(state, o) }));
}

function ownerNameFrom(state, o) {
  const p = state.players.find((x) => x.actorId === o);
  if (p) return p.name;
  const m = /^npc:(\d)$/.exec(o);
  return m ? (state.npcs[+m[1]]?.name ?? "PNG") : o;
}

function btn(actor, label, attrs, icon) {
  const a = Object.entries(attrs)
    .map(([k, v]) => `data-${k}="${esc(v)}"`)
    .join(" ");
  return `<button type="button" data-ff="${attrs.ff}" data-actor="${actor}" ${a}><i class="fa-solid ${icon}"></i> ${esc(label)}</button>`;
}

function outcomeButtons(e, state) {
  const parts = [];
  const humans = e.involved.filter((o) => !o.startsWith("npc:"));
  for (const actorId of humans) {
    const name = ownerNameFrom(state, actorId);
    const con = JSON.stringify(conList(e, state, actorId));
    const pref = e.involved.filter((o) => o !== actorId && !o.startsWith("npc:")).join(",");
    const row = [];
    switch (e.case) {
      case "incontro":
        row.push(btn(actorId, "Nuovo Legame", { ff: "annota", tipo: "legame", con, ind: "0" }, "fa-link"));
        row.push(btn(actorId, "Risolvi una Problematica", { ff: "rimuovi", tipo: "problematica", pref }, "fa-eraser"));
        break;
      case "propri":
      case "scontro":
        row.push(btn(actorId, "Elimina un Legame", { ff: "rimuovi", tipo: "legame", pref }, "fa-eraser"));
        row.push(btn(actorId, "Nuova Problematica", { ff: "annota", tipo: "problematica", con, ind: "0" }, "fa-heart-crack"));
        break;
      case "problematica-indistruttibile":
        row.push(btn(actorId, "Annota la Problematica Indistruttibile", { ff: "annota", tipo: "problematica", con: "[]", ind: "1" }, "fa-infinity"));
        break;
      case "legame-indistruttibile":
        row.push(btn(actorId, "Annota il Legame Indistruttibile", { ff: "annota", tipo: "legame", con, ind: "1" }, "fa-infinity"));
        break;
      default:
        break;
    }
    if (row.length) parts.push(`<div class="ff-row"><span class="ff-rowname">${esc(name)}</span>${row.join("")}</div>`);
  }
  return parts.length ? `<div class="ff-buttons">${parts.join("")}</div>` : "";
}

function epilogueCard(e) {
  const rows = e.scores
    .map((s) => `<tr><td>${esc(s.name)}</td><td>${s.legami}</td><td>${s.problemi}</td><td><strong>${s.score}</strong></td></tr>`)
    .join("");
  return card(
    "epilogue",
    e.reason === "dado" ? "Epilogo · il Dado della Morte ha parlato" : "Epilogo · l'ultima Fase è finita",
    `<p>Legami − Problematiche (gli Indistruttibili valgono doppio). Muore il punteggio più alto: <strong>${esc(e.dead)}</strong>.</p>
     <table class="ff-table"><thead><tr><th></th><th>Legami</th><th>Problemi</th><th>Saldo</th></tr></thead><tbody>${rows}</tbody></table>
     <p>Finali sulla Mappa: ${e.mix.lieto} lieti, ${e.mix.dolceamaro} dolceamari, ${e.mix.drammatico} drammatici. Ognuno lancia <strong>una sola biglia</strong>.</p>`,
  );
}

function endingCard(e) {
  return card(
    `ending ${e.kind}`,
    `${esc(e.label)} ${esc(e.sign)}`,
    `Racconta l'<strong>Epitaffio</strong>: ${esc(e.dead)} narra il proprio finale; gli altri, a turno in senso orario, raccontano come hanno reagito alla notizia, se hanno partecipato al saluto, se hanno sofferto e come è cambiata la loro vita.`,
  );
}
