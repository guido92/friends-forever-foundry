/**
 * Illustrazioni del manuale usate dall'interfaccia (schermate di Fase, pannello, scheda).
 * Le immagini NON fanno parte del repository né dello zip: sono dei loro autori. Si estraggono
 * dal PDF che hai (vedi tools/extract-art.py) in `assets/ff-art/`; se mancano, l'interfaccia
 * resta in versione solo tipografica.
 */
const BASE = "systems/friends-forever/assets/ff-art";

export const ARTE_FASE = {
  "3-5": "infanzia",
  "6-7": "famiglia",
  "8-10": "ombra",
  "11-15": "bullismo",
  "16-18": "solitudine",
  "19-23": "occhi",
  "24-29": "culla",
  "30-39": "porta",
  "40-49": "crisi",
  "50-55": "folla",
  "56-60": "nonna",
  "demo-1": "famiglia",
  "demo-2": "solitudine",
  "demo-3": "occhi",
};

export const ARTE = {
  copertina: "cover",
  scheda: "mani",
  epilogo: "ospedale",
  finale: "lutto",
  grunge: "grunge",
};

const NOMI = [...new Set([...Object.values(ARTE_FASE), ...Object.values(ARTE)])];
const presenti = new Set();
let rilevate = false;

/** Controlla (una volta) quali illustrazioni esistono davvero sul disco. */
export async function rilevaArte() {
  if (rilevate) return presenti;
  rilevate = true;
  await Promise.all(
    NOMI.map(async (n) => {
      try {
        if (await foundry.utils.srcExists(`${BASE}/${n}.jpg`)) presenti.add(n);
      } catch (e) {
        /* assente */
      }
    }),
  );
  return presenti;
}

export function haArte(nome) {
  return presenti.has(nome);
}

/** Almeno un'illustrazione è installata (attiva il tema grafico completo). */
export function arteDisponibile() {
  return presenti.size > 0;
}

/** URL di un'illustrazione, o null se non è stata installata. */
export function urlArte(nome) {
  return presenti.has(nome) ? `${BASE}/${nome}.jpg` : null;
}

/** Illustrazione della Fase (id della fase come in PHASES / DEMO_PHASES). */
export function arteDiFase(phaseId) {
  return urlArte(ARTE_FASE[phaseId]);
}

/** Carica un'immagine per il canvas (null se assente). */
export function caricaImmagine(nome) {
  const url = urlArte(nome);
  if (!url) return Promise.resolve(null);
  return new Promise((res) => {
    const i = new Image();
    i.onload = () => res(i);
    i.onerror = () => res(null);
    i.src = url;
  });
}
