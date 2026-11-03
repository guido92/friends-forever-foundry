// Stato di esempio dell'Epilogo per l'anteprima grafica.
import { writeFileSync } from "node:fs";
import * as E from "../../module/game/engine.mjs";

let { state } = E.newGame({
  players: [
    { userId: "u1", actorId: "a1", name: "Emma" },
    { userId: "u2", actorId: "a2", name: "Alessio" },
    { userId: "u3", actorId: "a3", name: "Chiara" },
  ],
  demo: true,
  seed: 21,
  disordine: true,
});
const ctx = { getTally: (id) => ({ legami: id === "a1" ? 5 : 2, problemi: id === "a1" ? 2 : 3, score: id === "a1" ? 3 : -1 }) };
const run = (a) => {
  state = E.apply(state, a, ctx).state;
};
let guard = 0;
let k = 0;
while (state.status !== "epilogo-lanci" && guard++ < 200) {
  if (state.status === "temi") {
    run({ type: "randomThemes" });
    run({ type: "beginThrows" });
  } else if (state.status === "lanci") {
    if (state.pending) run({ type: "chooseGroove", sectionId: state.pending.options[0] });
    else if (state.awaiting) run({ type: "advance" });
    else {
      k++;
      const p = E.currentPlayer(state);
      const tx = state.paper.x + state.paper.w * (0.15 + 0.7 * ((k * 0.37) % 1));
      const ty = state.paper.y + state.paper.h * (0.15 + 0.7 * ((k * 0.53) % 1));
      const sx = 40;
      const sy = 200 + ((k * 97) % 500);
      const d = Math.hypot(tx - sx, ty - sy);
      const v = Math.sqrt(2 * 420 * d) * 1.05;
      run({ type: "throw", userId: p.userId, force: true, launch: { x: sx, y: sy, vx: ((tx - sx) / d) * v, vy: ((ty - sy) / d) * v } });
    }
  } else if (state.status === "fine-fase") run({ type: "nextPhase" });
}
for (let i = 0; i < 2; i++) {
  const p = E.currentPlayer(state);
  const h = state.half;
  const tx = h.x + h.w * (0.25 + 0.5 * i);
  const ty = h.y + h.h * (0.3 + 0.2 * i);
  const sx = 40;
  const sy = 450;
  const d = Math.hypot(tx - sx, ty - sy);
  const v = Math.sqrt(2 * 420 * d) * 1.1;
  run({ type: "throw", userId: p.userId, force: true, launch: { x: sx, y: sy, vx: ((tx - sx) / d) * v, vy: ((ty - sy) / d) * v } });
  run({ type: "advance" });
}
writeFileSync(new URL("./epilogo.json", import.meta.url), JSON.stringify(state));
console.log(state.status, state.marbles.length, "biglie");
