# Contratto pubblico del motore (per chi scrive test senza leggere l'implementazione)

Tutto è JavaScript ES module, senza dipendenze, eseguibile con Node (`node --test`).
Percorsi relativi alla radice del repo `friends-forever/`.

## `module/core/rules.mjs`

| Export | Cosa fa |
|---|---|
| `PHASES` | 11 Fasi del gioco completo: `{id,label,age,sections,death}`; `death` = valore minimo del d6 per l'Epilogo (`null` se non c'è Dado della Morte). |
| `DEMO_PHASES` | 3 Fasi della sessione dimostrativa. |
| `marblesPerPlayer(n)` | biglie a testa per `n` giocatori. |
| `deathTriggers(phase, roll)` | `true` se il tiro `roll` (1–6) fa iniziare l'Epilogo in quella Fase. |
| `endingMix(legami, problemi)` | `{key:"A"|"B"|"C"|"D", lieto, dolceamaro, drammatico}`: quanti dei 8 finali di ogni tipo. |
| `tally(voci)` | `voci = [{tipo:"legame"\|"problematica", indistruttibile?, rimosso?}]` → `{legami, problemi, score}` (pesati). |
| `pickDead(scores, tieRolls?)` | `scores = {id:punteggio}` → `{dead, tied, needsRoll}`; con pareggio servono `tieRolls = {id:tiroD6}`. |
| `assignEndings(mix, rng)` | array di 8 tipi di finale mescolati; `rng()` ∈ [0,1). |
| `epilogueSections(paper)` | `{half, sections}`: la metà di foglio rimasta e le 8 Sezioni `{id, poly}`. |
| `pickEnding(sections, marbles, endingBySection)` | `{ending, sectionIds, tie, counts}`; `ending` ∈ `lieto|dolceamaro|drammatico|tragico|null` (null = pareggio tra finali diversi). `marbles=[{x,y}]`. |
| `sectionAt(sections, x, y, bounds?)` | id della Sezione che contiene il punto, o `null` (anche se fuori da `bounds`). |
| `groovesAt(sections, x, y, tol=7)` | id delle Sezioni il cui bordo dista meno di `tol` px dal punto (solco). |
| `resolveThrow(ctx)` | esito del Movimento (vedi sotto). |
| `soloPositions(rolls, n)` | modalità solitario: posizioni (1..n) delle biglie dei PNG dati i tiri di d6 a catena. |
| `soloTheme(cells, x, y)` | tema dalla griglia 6×6 della Fase (cells = 36 voci, riga 1 per prima). |

### `resolveThrow(ctx)`

```
ctx = {
  sections:[{id, poly:[[x,y],...]}],
  bounds:{x,y,w,h},                      // zona valida della Mappa
  start:[{id, ownerId, x, y}],           // biglie già sulla Mappa PRIMA del tiro (senza quella lanciata)
  thrower:{id, ownerId},
  sim:{ final:{[id]:{x,y}}, contact:null|{with:id}, tracks:[] },  // risultato fisico: posizioni finali di TUTTE le biglie (anche la lanciata) e primo contatto della lanciata
  bondedThisPhase:[ownerId...],          // chi ha già un Legame con il lanciatore creato in questa Fase
  chosenSection?: id,                    // scelta sul solco
  rng?: ()=>number
}
→ { case, rethrow, sectionId, involved:[ownerId], pending, options?, encounter, placements:[{id,x,y}] }
```

`case` ∈ `fuori | racconto | incontro | propri | scontro | problematica-indistruttibile | legame-indistruttibile | solco`.
`placements` = posizione finale di tutte le biglie dopo l'applicazione delle regole (restituzione al posto, biglie riportate nella
Sezione dello scontro, ecc.). Con `case:"solco"` l'esito è `pending:true` con `options:[idSezione...]`.

## `module/game/engine.mjs`

- `newGame(cfg)` → `{state, effects}`. `cfg = {players:[{userId,actorId,name,color?}], demo?, solo?, disordine?, npcNames?, seed?}`.
  Da 1 a 5 giocatori (il solitario esattamente 1). Lancia `EngineError` se non valido.
- `apply(state, action, ctx)` → `{state, effects}` (lo stato in ingresso NON viene mutato). `ctx.getTally(actorId)` → `{legami,problemi,score}`.
- `currentPlayer(state)`, `marblesLeft(state, player)`, `phaseOf(state)`, `ownerName(state, ownerId)`, `EngineError`.

Stato (`state`, JSON serializzabile): `status` (`temi|lanci|fine-fase|epilogo-lanci|epilogo-scelta|concluso`), `solo`, `demo`, `phases[]`,
`phaseIdx`, `players[{userId,actorId,name,color,marbles}]`, `firstIdx`, `turnIdx`, `queue[]` (indici di giocatore dei lanci rimasti),
`thrown{actorId:n}`, `sections[{id,num,theme,poly}]`, `marbles[{id,ownerId,color,x,y}]` (biglie sulla Mappa), `paper{x,y,w,h}`, `table{w,h}`,
`encounters`, `bonds[]`, `awaiting`, `pending`, `last`, `epilogue`, `npcs[]`.
Le coordinate sono in pixel del tavolo (1280×900); il foglio è `paper` (1100×760 a (90,70)).

Azioni (`action.type`):

| type | parametri | note |
|---|---|---|
| `setTheme` | `sectionId, text` | solo in `temi` |
| `randomThemes` | – | riempie i Temi vuoti (nel solitario tira i d6 sulla tabella) |
| `rerollSections` | – | ridisegna le Sezioni (stesso numero) |
| `beginThrows` | – | richiede un Tema per ogni Sezione; costruisce la coda dei lanci in senso orario partendo da `firstIdx` |
| `throw` | `userId, launch:{x,y,vx,vy}, force?` | lancio dal bordo del tavolo (fuori dal foglio); solo il giocatore di turno (o `force`) |
| `chooseGroove` | `sectionId` | risolve un esito in sospeso (`state.pending`) |
| `advance` | – | chiude la narrazione e passa al prossimo lancio (o rilancia se `awaiting.rethrow`); a fine coda → `fine-fase` |
| `registerBond` | `a, b` (ownerId) | registra un Legame creato in questa Fase tra due personaggi |
| `nextPhase` | – | solo in `fine-fase`: Dado della Morte (se previsto), nuova Fase, o Epilogo |
| `chooseEnding` | `kind` | solo in `epilogo-scelta` |
| `swapEndings` | `a, b` (id Sezioni) | prima dei lanci d'Epilogo |
| `reset` | – | |

Effetti (`effects[]`): `phase, outcome, solco, phaseEnd, deathDie, npcPlaced, tieRolls, epilogue, epilogueThrow, endingTie, ending`.

## Scelte interpretative già prese (da verificare sul manuale)

- Rapporto Legami/Problematiche uguale (anche 0 e 0) → finali tipo C (2/3/3).
- «Legame Indistruttibile» si crea tra **tutti** i coinvolti se almeno uno dei presenti ha già un Legame con chi lancia in questa Fase.
- Una biglia lanciata che esce senza toccare nessuno non resta sulla Mappa e non conta come lanciata.
- Il primo contatto conta nella Sezione della biglia toccata.
