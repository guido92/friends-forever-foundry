// Genera uno stato di esempio (fase avanzata, biglie sparse) per l'anteprima grafica del Tavolo.
import { writeFileSync } from "node:fs";
import * as E from "../../module/game/engine.mjs";
import { erasureResidue } from "../../module/core/physics.mjs";
import { mulberry32 } from "../../module/core/geometry.mjs";

const phaseIdx = Number(process.argv[2] ?? 4);
let { state } = E.newGame({
  players: ["Emma", "Alessio", "Chiara", "Marco", "Sara"].slice(0, Number(process.argv[3] ?? 3)).map((name, i) => ({ userId: `u${i + 1}`, actorId: `a${i + 1}`, name })),
  seed: 11,
  disordine: true,
});
const ctx = { getTally: () => ({ legami: 2, problemi: 1, score: 1 }) };
const run = (a) => {
  state = E.apply(state, a, ctx).state;
};
run({ type: "randomThemes" });
run({ type: "beginThrows" });
state.phaseIdx = phaseIdx;
state.phaseLabel = state.phases[phaseIdx].label;
state.residue = erasureResidue(phaseIdx, state.paper, mulberry32(5));
for (let n = 1; n <= 5; n++) {
  const p = E.currentPlayer(state);
  const tx = state.paper.x + state.paper.w * (0.2 + 0.6 * ((n * 0.37) % 1));
  const ty = state.paper.y + state.paper.h * (0.2 + 0.6 * ((n * 0.53) % 1));
  const sx = 40;
  const sy = 300 + n * 60;
  const dx = tx - sx;
  const dy = ty - sy;
  const d = Math.hypot(dx, dy);
  const v = Math.sqrt(2 * 420 * d) * 1.05;
  run({ type: "throw", userId: p.userId, force: true, launch: { x: sx, y: sy, vx: (dx / d) * v, vy: (dy / d) * v } });
  if (state.pending) run({ type: "chooseGroove", sectionId: state.pending.options[0] });
  if (state.awaiting) run({ type: "advance" });
}
writeFileSync(new URL("./state.json", import.meta.url), JSON.stringify(state));
console.log(state.marbles.length, "biglie;", state.sections.map((s) => s.theme).join(" | "));
