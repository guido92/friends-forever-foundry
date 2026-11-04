/**
 * Collante con Foundry: stato condiviso (impostazione di mondo), socket verso il GM,
 * esecuzione degli effetti (chat) e hook di sincronizzazione.
 */
import { apply, newGame, EngineError } from "./engine.mjs";
import { chatForEffect } from "./chat.mjs";
import { tally } from "../core/rules.mjs";

export const SYSTEM_ID = "friends-forever";
const CHANNEL = `system.${SYSTEM_ID}`;

/** Chi può fare cosa. `me` = chi ha mandato l'azione. */
function allowed(action, state, user) {
  if (user.isGM) return true;
  const cur = state?.players?.[state.turnIdx];
  const mine = (p) => p?.userId === user.id;
  const seated = !!state?.players?.some(mine);
  const ownsActor = (id) => !!id && !!game.actors.get(id)?.testUserPermission(user, "OWNER");
  switch (action.type) {
    case "newGame":
    case "reset":
      return false;
    case "setTheme":
    case "randomThemes":
    case "rerollSections":
    case "beginThrows":
    case "nextPhase":
      return seated;
    case "registerBond":
      return !!state && (ownsActor(action.a) || ownsActor(action.b));
    case "throw":
    case "advance":
    case "chooseGroove":
      return mine(cur);
    case "chooseEnding":
    case "swapEndings": {
      const dead = state?.epilogue?.dead;
      return mine(state?.players?.find((p) => p.actorId === dead));
    }
    default:
      return false;
  }
}

export class FFGame {
  /** Stato corrente della partita (oggetto) o null. */
  static get state() {
    return game.settings.get(SYSTEM_ID, "partita") ?? null;
  }

  static register() {
    game.settings.register(SYSTEM_ID, "partita", {
      scope: "world",
      config: false,
      type: new foundry.data.fields.ObjectField({ nullable: true, initial: null }),
      onChange: () => Hooks.callAll("ffStateChanged", FFGame.state),
    });
    game.settings.register(SYSTEM_ID, "apriTavolo", {
      name: "Apri il Tavolo all'ingresso",
      hint: "Apre da solo la finestra del Tavolo quando entri nel mondo.",
      scope: "client",
      config: true,
      type: new foundry.data.fields.BooleanField({ initial: true }),
    });
    game.settings.register(SYSTEM_ID, "guidaVista", {
      scope: "client",
      config: false,
      type: new foundry.data.fields.BooleanField({ initial: false }),
    });
    game.settings.register(SYSTEM_ID, "contenuti", {
      scope: "world",
      config: false,
      type: new foundry.data.fields.NumberField({ integer: true, initial: 0, nullable: false }),
    });
    game.settings.register(SYSTEM_ID, "volume", {
      name: "FF.Settings.Volume.Name",
      hint: "FF.Settings.Volume.Hint",
      scope: "client",
      config: true,
      type: new foundry.data.fields.NumberField({ min: 0, max: 1, step: 0.1, initial: 0.6, nullable: false }),
    });
  }

  static activateSocket() {
    game.socket.on(CHANNEL, (msg) => {
      if (msg.type === "action") {
        if (game.users.activeGM?.isSelf) FFGame.#run(msg.action, msg.userId);
      } else if (msg.type === "error" && msg.to === game.user.id) {
        ui.notifications.warn(msg.message);
      }
    });
  }

  /** Invia un'azione al GM attivo (o la esegue se sei tu). */
  static async dispatch(action) {
    if (!game.users.activeGM) {
      ui.notifications.error("Serve un GM connesso per far funzionare il Tavolo.");
      return;
    }
    if (game.users.activeGM.isSelf) return FFGame.#run(action, game.user.id);
    game.socket.emit(CHANNEL, { type: "action", userId: game.user.id, action });
  }

  static async #run(action, userId) {
    const user = game.users.get(userId);
    const state = FFGame.state;
    try {
      if (!user) return;
      if (!allowed(action, state, user)) {
        const seduto = !!state?.players?.some((p) => p.userId === user.id);
        throw new EngineError(
          !state
            ? "Nessuna partita in corso."
            : action.type === "newGame" || action.type === "reset"
              ? "Solo il GM può iniziare o chiudere la partita."
              : !seduto
                ? "Non siedi a questo Tavolo: il GM ti deve assegnare un Personaggio nella Nuova partita."
                : "Non è il tuo turno.",
        );
      }
      let result;
      if (action.type === "newGame") {
        result = newGame(action.config);
      } else if (action.type === "reset") {
        await game.settings.set(SYSTEM_ID, "partita", null);
        return;
      } else {
        if (!state) throw new EngineError("Nessuna partita in corso.");
        result = apply(state, { ...action, userId, force: user.isGM && action.force }, { getTally: FFGame.tallyFor });
      }
      await game.settings.set(SYSTEM_ID, "partita", result.state);
      await FFGame.#effects(result.effects, result.state);
    } catch (e) {
      if (e instanceof EngineError) {
        if (userId === game.user.id) ui.notifications.warn(e.message);
        else game.socket.emit(CHANNEL, { type: "error", to: userId, message: e.message });
      } else {
        console.error("Friends Forever |", e);
        ui.notifications.error(`Friends Forever: ${e.message}`);
      }
    }
  }

  /** Legami/Problematiche (pesati) di un personaggio. */
  static tallyFor(actorId) {
    const actor = game.actors.get(actorId);
    if (!actor) return { legami: 0, problemi: 0, score: 0 };
    return tally(actor.items.filter((i) => i.type === "legame" || i.type === "problematica").map((i) => ({ tipo: i.type, ...i.system.toObject() })));
  }

  static async #effects(effects, state) {
    for (const e of effects) {
      const msg = chatForEffect(e, state);
      if (!msg) continue;
      await ChatMessage.create({
        content: msg.content,
        speaker: { alias: "Friends Forever" },
        flags: { [SYSTEM_ID]: { effect: e.type, ...msg.flags } },
      });
    }
  }
}
