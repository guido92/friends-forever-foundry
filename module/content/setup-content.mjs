/**
 * Contenuti del mondo creati al primo avvio dal GM: riepilogo delle regole, strumenti di sicurezza,
 * tabelle (spunti per i Temi e Tabelle del Solitario) e macro d'accesso. Idempotente.
 */
import { SYSTEM_ID } from "../game/ff-game.mjs";
import { PHASES } from "../core/rules.mjs";
import { SPUNTI } from "../data/spunti.mjs";
import { SOLITARIO } from "../data/solitario.mjs";

export const CONTENT_VERSION = 1;

const RIEPILOGO = `
<h2>Cos'è</h2>
<p><strong>Friends Forever</strong> è un gioco di ruolo masterless per 1–5 giocatori. Ognuno interpreta un Personaggio e insieme raccontate la vita di un gruppo di amici, dai 3 anni fino all'inevitabile fine di uno di loro. Si gioca in una sessione autoconclusiva di poche ore, senza preparazione.</p>
<h2>Il Tavolo</h2>
<p>Apri il Tavolo con il bottone in chat, dal controllo scena (cerchio) o con <kbd>Alt</kbd>+<kbd>T</kbd>. Il GM avvia una <em>Nuova partita</em> scegliendo giocatori e Personaggi. La <strong>Mappa</strong> è un foglio di carta sul tavolo; le <strong>biglie</strong> si lanciano a fionda dal bordo (tieni premuto, trascina all'indietro, rilascia).</p>
<h2>Come si gioca</h2>
<ol>
  <li><strong>Fase.</strong> Ogni Fase è una fascia d'età e ha un numero fisso di <em>Sezioni</em> sulla Mappa. Ogni giocatore scrive una parola (il <em>Tema</em>) in una Sezione.</li>
  <li><strong>Lanci.</strong> A turno, in senso orario, ognuno lancia le sue biglie (2 ciascuno fino a 3 giocatori, 3 se siete di più). Racconta in prima persona qualcosa del suo Personaggio legato al Tema della Sezione dove la biglia si ferma, poi annota i dettagli sul proprio foglio.</li>
  <li><strong>Movimento delle biglie.</strong> L'esito del lancio decide Legami e Problematiche (vedi sotto).</li>
  <li><strong>Fine Fase.</strong> Si cancella la Mappa: restano macchie e pieghe, quindi dirigere le biglie diventa sempre più difficile. Il primo giocatore passa a chi siede alla sua sinistra.</li>
  <li><strong>Dado della Morte.</strong> Dalla Fase 30–39 anni, prima di ogni Fase, il primo giocatore tira un d6: 6 (30–39), 5+ (40–49), 4+ (50–55), 3+ (56–60) fa iniziare l'Epilogo.</li>
</ol>
<h2>Esiti del Movimento</h2>
<ul>
  <li><strong>Esce senza toccare nessuno:</strong> nessun effetto, rilancia.</li>
  <li><strong>Si ferma con biglie di altri giocatori:</strong> ognuno crea un <em>Legame</em> con gli altri oppure elimina una <em>Problematica</em> che aveva con chi ha lanciato.</li>
  <li><strong>Si ferma con sole biglie del tuo colore:</strong> elimini un Legame o crei una Problematica (anche su te stesso).</li>
  <li><strong>Spinge fuori dalla Sezione una o più biglie:</strong> tutti i coinvolti eliminano un Legame o creano una Problematica; le biglie tornano nella Sezione dello scontro.</li>
  <li><strong>Spinge fuori una tua biglia</strong> (nell'area solo biglie tue): <em>Problematica Indistruttibile</em>.</li>
  <li><strong>Si ferma con chi ti lega già in questa Fase:</strong> <em>Legame Indistruttibile</em> tra tutti i coinvolti.</li>
  <li><strong>Sul solco tra due Sezioni:</strong> scegli tu quale Tema trattare.</li>
  <li>Conta solo la <em>prima</em> Sezione in cui avviene un contatto; le biglie sbalzate fuori da altre Sezioni tornano al loro posto senza effetti.</li>
  <li>Se in una Fase le biglie non si sono mai incontrate, tutti eliminano un Legame.</li>
</ul>
<p>Le voci <strong>Indistruttibili</strong> non si possono rimuovere né contraddire e valgono doppio nel punteggio finale.</p>
<h2>Epilogo</h2>
<p>La Mappa viene strappata: se ne usa una metà. Ogni giocatore calcola <em>Legami − Problematiche</em>; chi ottiene il valore maggiore interpreta il Personaggio che muore (pareggio: d6). Sulla metà restano 8 Sezioni con i tipi di finale, in base al rapporto tra Legami e Problematiche del defunto. Ogni giocatore lancia una sola biglia: la Sezione più popolata decide il finale (lieto, dolceamaro, drammatico; se nessuna biglia resta sulla Mappa il finale è tragico). Il defunto racconta il proprio Epitaffio, gli altri raccontano come hanno reagito.</p>
<h2>Varianti</h2>
<ul>
  <li><strong>Sessione dimostrativa:</strong> tre Fasi (6–10, 11–18, 19–23 anni), poi l'Epilogo senza Dado della Morte.</li>
  <li><strong>Solitario:</strong> 3 biglie per Personaggio, un protagonista e 3 PNG; i Temi si tirano con due d6 sulla tabella della Fase e i PNG vengono posizionati col dado.</li>
</ul>
<p class="ff-hint">Questo è un riepilogo non ufficiale a uso del sistema Foundry. Per le regole complete leggi il manuale di Friends Forever.</p>
`;

const SICUREZZA = `
<p>Friends Forever tocca temi delicati (lutto, dipendenze, violenza, salute mentale). Prima di giocare accertatevi che tutti sappiano cosa li aspetta e vogliano affrontarlo: non è un gioco per tutti.</p>
<h2>«Io non ti abbandonerò»</h2>
<p>Più che interrompere il racconto, questo strumento chiede di <strong>sostenervi a vicenda</strong>: accettate la presenza di temi difficili e vi impegnate a orientare i Personaggi a risolvere insieme le difficoltà che emergono, nello spirito della comunicazione nonviolenta.</p>
<h2>Consenso</h2>
<p>Racconta solo le azioni del <em>tuo</em> Personaggio e lascia agli altri descrivere le reazioni di chi viene coinvolto. Concordate un segno (per esempio la mano alzata) per dire «non sono d'accordo»: chi sta parlando conclude la frase e ascolta la reazione prima di riprendere.</p>
<h2>Regole di narrazione</h2>
<ul>
  <li>Ogni cosa che un Personaggio racconta è vera dal suo punto di vista e non può essere contraddetta.</li>
  <li>Il tono è drammatico: inserite elementi tragici o spaventosi fin dalle prime Fasi.</li>
  <li>Favorite Legami con gli altri Personaggi accettando il rischio che nascano Problematiche.</li>
  <li>Descrivete il presente del Personaggio (cosa vede e sente), evitando flashback e monologhi interiori.</li>
</ul>
`;

async function cartella() {
  const nome = "Friends Forever";
  const esiste = game.folders.find((f) => f.type === "JournalEntry" && f.name === nome);
  return esiste ?? Folder.create({ name: nome, type: "JournalEntry" });
}

async function cartellaTabelle() {
  const nome = "Friends Forever";
  const esiste = game.folders.find((f) => f.type === "RollTable" && f.name === nome);
  return esiste ?? Folder.create({ name: nome, type: "RollTable" });
}

function tabella(name, righe, folder, descr) {
  return RollTable.create({
    name,
    folder: folder.id,
    formula: `1d${righe.length}`,
    description: descr ?? "",
    replacement: true,
    displayRoll: true,
    flags: { [SYSTEM_ID]: { contenuto: true } },
    results: righe.map((r, i) => ({ type: "text", name: r.name, description: r.description ?? "", range: [i + 1, i + 1], weight: 1 })),
  });
}

export async function preparaContenuti() {
  const ver = game.settings.get(SYSTEM_ID, "contenuti") ?? 0;
  if (ver >= CONTENT_VERSION) return;
  const jf = await cartella();
  const tf = await cartellaTabelle();

  await JournalEntry.create({
    name: "Friends Forever — Riepilogo",
    folder: jf.id,
    pages: [{ name: "Riepilogo delle regole", type: "text", text: { content: RIEPILOGO, format: 1 } }],
    flags: { [SYSTEM_ID]: { contenuto: true } },
  });
  await JournalEntry.create({
    name: "Friends Forever — Sicurezza e consenso",
    folder: jf.id,
    pages: [{ name: "Sicurezza e consenso", type: "text", text: { content: SICUREZZA, format: 1 } }],
    flags: { [SYSTEM_ID]: { contenuto: true } },
  });

  for (const phase of PHASES) {
    const spunti = SPUNTI[phase.id];
    if (spunti) await tabella(`Spunti · ${phase.label}`, spunti.map((name) => ({ name })), tf, `Spunti per i Temi delle ${phase.sections} Sezioni.`);
    const grid = SOLITARIO[phase.id];
    if (grid) {
      const righe = grid.map((name, i) => ({ name, description: `Colonna X=${(i % 6) + 1} · riga Y=${Math.floor(i / 6) + 1}` }));
      await tabella(`Solitario · ${phase.label}`, righe, tf, "Tabella del Solitario (36 caselle: d6 per X e d6 per Y). Nel Tavolo il tiro è automatico.");
    }
  }

  if (!game.macros.find((m) => m.getFlag(SYSTEM_ID, "apriTavolo"))) {
    await Macro.create({
      name: "Apri il Tavolo (Friends Forever)",
      type: "script",
      img: "icons/svg/d6-grey.svg",
      command: "game.ff.openTable();",
      flags: { [SYSTEM_ID]: { apriTavolo: true } },
    });
  }
  await game.settings.set(SYSTEM_ID, "contenuti", CONTENT_VERSION);
  ui.notifications.info("Friends Forever: creati riepilogo, tabelle e macro nel mondo.");
}
