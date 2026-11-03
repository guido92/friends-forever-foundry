/**
 * Spunti per i Temi delle Sezioni, per Fase. Una parola vaga lascia più spazio all'improvvisazione.
 * (Tratti dal manuale: pagina "Introdurre i Temi".)
 */
export const SPUNTI = {
  "3-5": ["famiglia", "abitazione", "attività preferita", "aspetto fisico", "scuola materna", "paura"],
  "6-7": ["scuola", "genitore", "animali", "parco", "bicicletta", "scherzi", "nonni", "pupazzo"],
  "8-10": ["compleanno", "incidente", "sport", "mare", "cotta", "diario", "talento", "maestri"],
  "11-15": ["cambiamento", "mezzi pubblici", "babysitter", "piscina", "gita", "bullismo", "segreto", "rabbia"],
  "16-18": ["relazione", "studio", "alcol", "droga", "look", "patente", "discoteca", "hobby"],
  "19-23": ["fidanzamento", "amicizie", "casa", "lavoro", "studio", "vizi", "soldi", "reato", "bar", "genitori", "tradimento", "vacanza"],
  "24-29": ["matrimonio", "affitto", "colleghi", "depressione", "animale domestico", "musica", "errore", "weekend", "figlio", "litigio", "ospedale"],
  "30-39": ["fallimento", "rimpianto", "aperitivo", "lutto", "hobby", "amicizie", "famiglia", "viaggio", "amante", "cerimonia", "religione", "farmaci"],
  "40-49": ["nostalgia", "crisi", "psicologo", "aperitivo", "vacanza", "problemi economici", "funerale", "corpo", "problemi legali", "sogni", "vendetta", "fortuna", "incidente", "palestra", "ristorante", "socialità"],
  "50-55": ["parenti", "amore", "salute", "crisi", "volontariato", "parco", "novità", "arte", "festa", "amicizie", "evasione", "hobby", "sfortuna", "furto", "recupero", "scuse"],
  "56-60": ["pausa", "città", "religione", "follia", "memoria", "paura", "aiuto", "notizia", "tristezza", "natura", "ospedale", "debiti", "progetto"],
};

/** Spunti per una Fase (le Fasi della sessione dimostrativa uniscono più fasce d'età). */
export function spuntiPerFase(phase) {
  const ids = phase.spunti ?? [phase.id];
  return [...new Set(ids.flatMap((id) => SPUNTI[id] ?? []))];
}
