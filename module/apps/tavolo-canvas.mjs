/**
 * Disegno del Tavolo (canvas 2D): legno, foglio di carta, macchie/pieghe delle cancellature,
 * Sezioni con i Temi scritti a mano, biglie con riflessi e ombra, ostacoli del tavolo.
 * Gestisce anche il lancio "a fionda" e l'animazione dei tiri.
 */
import { polygonCentroid } from "../core/geometry.mjs";
import { PHYS, TABLE, PAPER, launchFromDrag } from "../core/physics.mjs";

const HAND = "'Segoe Script','Bradley Hand','Ink Free','Comic Sans MS',cursive";
const ENDING_TINT = {
  lieto: "rgba(104,178,110,.28)",
  dolceamaro: "rgba(233,178,76,.28)",
  drammatico: "rgba(196,78,78,.28)",
};
const OBSTACLE_EMOJI = { bicchiere: "🥃", ciotola: "🍜", accendino: "🔥", cellulare: "📱", bottiglia: "🍾", posacenere: "🚬" };

function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967296;
}

function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  const f = (v) => Math.max(0, Math.min(255, Math.round(v + amt * 255)));
  return `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`;
}

export class TavoloCanvas {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {{onLaunch:(launch:object)=>void, canAim:()=>{ok:boolean,color?:string}, volume:()=>number}} hooks
   */
  constructor(canvas, hooks) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.hooks = hooks;
    this.state = null;
    this.seenSeq = null;
    this.anim = null;
    this.snap = null;
    this.aim = null;
    this.cache = { key: null, canvas: null };
    this.raf = null;
    this.audio = null;
    this.#bind();
    this.requestDraw();
  }

  destroy() {
    cancelAnimationFrame(this.raf);
    this.#unbind();
    this.audio?.close?.();
  }

  setState(state) {
    const prev = this.state;
    this.state = state;
    if (!state) {
      this.seenSeq = null;
      this.anim = null;
      this.requestDraw();
      return;
    }
    const last = state.last;
    if (last && last.seq !== this.seenSeq) {
      if (this.seenSeq !== null && last.tracks?.length) this.#startAnim(last, prev);
      this.seenSeq = last.seq;
    } else if (!last) {
      this.seenSeq = state.seq;
    }
    this.requestDraw();
  }

  requestDraw() {
    if (this.raf) return;
    this.raf = requestAnimationFrame((t) => {
      this.raf = null;
      this.#frame(t);
    });
  }

  // -------------------------------------------------------------- animazione
  #startAnim(last, prev) {
    const tracks = last.tracks.map((tr) => ({ ...tr, n: tr.pts.length / 2 }));
    const total = Math.max(...tracks.map((t) => t.t0 + t.n)) / 30;
    this.anim = {
      tracks,
      start: performance.now(),
      total,
      marble: last.marble,
      hits: [...(last.hits ?? [])],
      hitIdx: 0,
    };
    this.snap = null;
  }

  #animPositions(now) {
    const a = this.anim;
    const t = (now - a.start) / 1000;
    const pos = new Map();
    for (const tr of a.tracks) {
      const f = t * 30 - tr.t0;
      if (f <= 0) {
        pos.set(tr.id, { x: tr.pts[0], y: tr.pts[1] });
      } else if (f >= tr.n - 1) {
        pos.set(tr.id, { x: tr.pts[(tr.n - 1) * 2], y: tr.pts[(tr.n - 1) * 2 + 1] });
      } else {
        const i = Math.floor(f);
        const u = f - i;
        pos.set(tr.id, {
          x: tr.pts[i * 2] * (1 - u) + tr.pts[(i + 1) * 2] * u,
          y: tr.pts[i * 2 + 1] * (1 - u) + tr.pts[(i + 1) * 2 + 1] * u,
        });
      }
    }
    // suoni degli urti
    while (a.hitIdx < a.hits.length && a.hits[a.hitIdx][0] <= t) {
      this.#tok(a.hits[a.hitIdx][1]);
      a.hitIdx++;
    }
    return { pos, done: t >= a.total + 0.05, t };
  }

  #tok(v) {
    const vol = this.hooks.volume?.() ?? 0;
    if (!vol) return;
    try {
      this.audio ??= new AudioContext();
      const ctx = this.audio;
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      const strength = Math.min(1, v / 700);
      o.type = "triangle";
      o.frequency.setValueAtTime(1700 + Math.random() * 500, ctx.currentTime);
      o.frequency.exponentialRampToValueAtTime(420, ctx.currentTime + 0.06);
      g.gain.setValueAtTime(vol * (0.15 + 0.45 * strength), ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.09);
      o.connect(g).connect(ctx.destination);
      o.start();
      o.stop(ctx.currentTime + 0.1);
    } catch (e) {
      /* audio non disponibile */
    }
  }

  // ------------------------------------------------------------------ input
  #bind() {
    this._down = (e) => this.#pointerDown(e);
    this._move = (e) => this.#pointerMove(e);
    this._up = (e) => this.#pointerUp(e);
    this._key = (e) => {
      if (e.key === "Escape" && this.aim) {
        this.aim = null;
        this.requestDraw();
      }
    };
    this.canvas.addEventListener("pointerdown", this._down);
    this.canvas.addEventListener("pointermove", this._move);
    window.addEventListener("pointerup", this._up);
    window.addEventListener("keydown", this._key);
  }

  #unbind() {
    this.canvas.removeEventListener("pointerdown", this._down);
    this.canvas.removeEventListener("pointermove", this._move);
    window.removeEventListener("pointerup", this._up);
    window.removeEventListener("keydown", this._key);
  }

  #toTable(e) {
    const r = this.canvas.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * TABLE.w, y: ((e.clientY - r.top) / r.height) * TABLE.h };
  }

  #pointerDown(e) {
    if (e.button !== 0 || this.anim) return;
    const info = this.hooks.canAim();
    if (!info.ok) return;
    const p = this.#toTable(e);
    const paper = this.state?.paper ?? PAPER;
    const inPaper = p.x > paper.x && p.x < paper.x + paper.w && p.y > paper.y && p.y < paper.y + paper.h;
    if (inPaper) {
      ui.notifications.info("Si lancia dal bordo del tavolo, fuori dal foglio.");
      return;
    }
    this.aim = { from: p, to: p, color: info.color };
    this.canvas.setPointerCapture?.(e.pointerId);
    this.requestDraw();
  }

  #pointerMove(e) {
    if (!this.aim) return;
    this.aim.to = this.#toTable(e);
    this.requestDraw();
  }

  #pointerUp(e) {
    if (!this.aim) return;
    const aim = this.aim;
    this.aim = null;
    const launch = launchFromDrag(aim.from, this.#toTable(e));
    const power = Math.hypot(launch.vx, launch.vy);
    if (power < 120) {
      this.requestDraw();
      return; // trascinamento troppo corto: annullato
    }
    this.hooks.onLaunch(launch);
    this.requestDraw();
  }

  // ---------------------------------------------------------------- disegno
  #frame(now) {
    const ctx = this.ctx;
    const st = this.state;
    ctx.clearRect(0, 0, TABLE.w, TABLE.h);
    this.#drawTable(ctx);
    if (!st) {
      this.#drawIdle(ctx);
      return;
    }
    this.#drawPaper(ctx, st);
    this.#drawSections(ctx, st);
    this.#drawObstacles(ctx, st);

    let overrides = null;
    let animating = false;
    if (this.anim) {
      const r = this.#animPositions(now);
      overrides = r.pos;
      animating = true;
      if (r.done) {
        // calcola la transizione verso le posizioni finali stabilite dalle regole
        const from = new Map(r.pos);
        this.snap = { from, start: now };
        this.anim = null;
        animating = false;
        overrides = null;
      }
    }
    let snapPos = null;
    if (this.snap) {
      const u = Math.min(1, (now - this.snap.start) / 450);
      const k = u * u * (3 - 2 * u);
      snapPos = new Map();
      for (const m of st.marbles) {
        const f = this.snap.from.get(m.id);
        if (f) snapPos.set(m.id, { x: f.x + (m.x - f.x) * k, y: f.y + (m.y - f.y) * k });
      }
      if (u >= 1) this.snap = null;
    }

    const draw = (m, x, y) => this.#drawMarble(ctx, x, y, PHYS.radius, m.color);
    const drawn = new Set();
    for (const m of st.marbles) {
      const o = overrides?.get(m.id) ?? snapPos?.get(m.id);
      draw(m, o?.x ?? m.x, o?.y ?? m.y);
      drawn.add(m.id);
    }
    // la biglia lanciata che non resta sul foglio (es. rilancio) o in attesa di scelta
    if (this.anim && this.anim.marble && !drawn.has(this.anim.marble.id) && overrides?.get(this.anim.marble.id)) {
      const o = overrides.get(this.anim.marble.id);
      draw(this.anim.marble, o.x, o.y);
    }
    if (!this.anim && st.pending) draw(st.pending.marble, st.pending.final.x, st.pending.final.y);

    this.#drawAim(ctx);
    this.#drawBanner(ctx, st);
    if (animating || this.snap || this.aim) this.requestDraw();
  }

  #drawIdle(ctx) {
    const p = PAPER;
    this.#paperRect(ctx, p);
    ctx.fillStyle = "rgba(60,50,40,.55)";
    ctx.font = `42px ${HAND}`;
    ctx.textAlign = "center";
    ctx.fillText("Friends Forever", p.x + p.w / 2, p.y + p.h / 2 - 10);
    ctx.font = `22px ${HAND}`;
    ctx.fillText("Il GM può iniziare una nuova partita dal pannello a destra.", p.x + p.w / 2, p.y + p.h / 2 + 34);
  }

  #drawTable(ctx) {
    if (!this.cache.table) {
      const c = document.createElement("canvas");
      c.width = TABLE.w;
      c.height = TABLE.h;
      const g = c.getContext("2d");
      const grad = g.createLinearGradient(0, 0, TABLE.w, TABLE.h);
      grad.addColorStop(0, "#5b3b24");
      grad.addColorStop(1, "#46291a");
      g.fillStyle = grad;
      g.fillRect(0, 0, TABLE.w, TABLE.h);
      for (let i = 0; i < 160; i++) {
        const y = hash(`g${i}`) * TABLE.h;
        g.strokeStyle = `rgba(${hash(`a${i}`) > 0.5 ? "20,10,5" : "120,80,50"},${0.05 + hash(`b${i}`) * 0.08})`;
        g.lineWidth = 1 + hash(`c${i}`) * 3;
        g.beginPath();
        g.moveTo(0, y);
        g.bezierCurveTo(TABLE.w * 0.3, y + (hash(`d${i}`) - 0.5) * 18, TABLE.w * 0.7, y + (hash(`e${i}`) - 0.5) * 18, TABLE.w, y + (hash(`f${i}`) - 0.5) * 10);
        g.stroke();
      }
      const vg = g.createRadialGradient(TABLE.w / 2, TABLE.h / 2, TABLE.h * 0.3, TABLE.w / 2, TABLE.h / 2, TABLE.w * 0.65);
      vg.addColorStop(0, "rgba(0,0,0,0)");
      vg.addColorStop(1, "rgba(0,0,0,.45)");
      g.fillStyle = vg;
      g.fillRect(0, 0, TABLE.w, TABLE.h);
      this.cache.table = c;
    }
    ctx.drawImage(this.cache.table, 0, 0);
  }

  #paperRect(ctx, p) {
    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,.5)";
    ctx.shadowBlur = 24;
    ctx.shadowOffsetY = 8;
    ctx.fillStyle = "#f4edda";
    ctx.fillRect(p.x, p.y, p.w, p.h);
    ctx.restore();
    if (!this.cache.paper) {
      const c = document.createElement("canvas");
      c.width = p.w;
      c.height = p.h;
      const g = c.getContext("2d");
      for (let i = 0; i < 5200; i++) {
        const x = hash(`px${i}`) * p.w;
        const y = hash(`py${i}`) * p.h;
        g.fillStyle = `rgba(${hash(`pc${i}`) > 0.5 ? "140,120,90" : "255,255,255"},${0.03 + hash(`pa${i}`) * 0.06})`;
        g.fillRect(x, y, 1 + hash(`pw${i}`) * 2, 1);
      }
      const vg = g.createRadialGradient(p.w / 2, p.h / 2, p.h * 0.3, p.w / 2, p.h / 2, p.w * 0.62);
      vg.addColorStop(0, "rgba(255,250,235,0)");
      vg.addColorStop(1, "rgba(150,120,70,.16)");
      g.fillStyle = vg;
      g.fillRect(0, 0, p.w, p.h);
      this.cache.paper = c;
    }
    ctx.drawImage(this.cache.paper, p.x, p.y);
  }

  #drawPaper(ctx, st) {
    const p = st.paper;
    this.#paperRect(ctx, p);
    // macchie delle cancellature
    for (const s of st.residue.smudges) {
      const g = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, s.r);
      g.addColorStop(0, `rgba(110,100,92,${0.2 * s.k})`);
      g.addColorStop(0.6, `rgba(120,110,100,${0.1 * s.k})`);
      g.addColorStop(1, "rgba(120,110,100,0)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.fill();
    }
    // pieghe
    for (const c of st.residue.creases) {
      ctx.save();
      ctx.lineCap = "round";
      ctx.strokeStyle = "rgba(0,0,0,.22)";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(c.x1, c.y1 + 1.5);
      ctx.lineTo(c.x2, c.y2 + 1.5);
      ctx.stroke();
      ctx.strokeStyle = "rgba(255,255,255,.65)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(c.x1, c.y1 - 1);
      ctx.lineTo(c.x2, c.y2 - 1);
      ctx.stroke();
      ctx.restore();
    }
    if (st.torn && st.half) {
      // metà strappata
      const h = st.half;
      ctx.save();
      ctx.beginPath();
      ctx.rect(p.x - 4, p.y - 4, h.x - p.x + 4, p.h + 8);
      ctx.fillStyle = "#46291a";
      ctx.fill();
      ctx.strokeStyle = "#f4edda";
      ctx.lineWidth = 5;
      ctx.beginPath();
      for (let y = p.y; y <= p.y + p.h; y += 14) {
        const x = h.x + (hash(`t${y}`) - 0.5) * 12;
        if (y === p.y) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
      ctx.restore();
    }
  }

  #wobblePath(ctx, poly, seed, amp = 1.6) {
    ctx.beginPath();
    poly.forEach(([x, y], i) => {
      const [nx, ny] = poly[(i + 1) % poly.length];
      if (i === 0) ctx.moveTo(x, y);
      const len = Math.hypot(nx - x, ny - y);
      const n = Math.max(1, Math.round(len / 42));
      for (let k = 1; k <= n; k++) {
        const u = k / n;
        const j = k === n ? 0 : (hash(`${seed}:${i}:${k}`) - 0.5) * 2 * amp;
        const px = x + (nx - x) * u;
        const py = y + (ny - y) * u;
        const nxn = -(ny - y) / (len || 1);
        const nyn = (nx - x) / (len || 1);
        ctx.lineTo(px + nxn * j, py + nyn * j);
      }
    });
    ctx.closePath();
  }

  #drawSections(ctx, st) {
    const bounds = st.torn ? st.half : st.paper;
    ctx.save();
    ctx.beginPath();
    ctx.rect(bounds.x, bounds.y, bounds.w, bounds.h);
    ctx.clip();
    for (const s of st.sections) {
      if (st.status === "epilogo-lanci" || st.status === "epilogo-scelta" || st.epilogue) {
        const kind = st.epilogue?.endings?.[s.id];
        if (kind && ENDING_TINT[kind]) {
          this.#wobblePath(ctx, s.poly, s.id, 0);
          ctx.fillStyle = ENDING_TINT[kind];
          ctx.fill();
        }
      }
      // solco: linea chiara sotto una a matita
      this.#wobblePath(ctx, s.poly, s.id);
      ctx.lineJoin = "round";
      ctx.strokeStyle = "rgba(255,255,255,.7)";
      ctx.lineWidth = 7;
      ctx.stroke();
      ctx.strokeStyle = "rgba(48,44,40,.85)";
      ctx.lineWidth = 2.4;
      ctx.stroke();
    }
    ctx.restore();
    // Temi
    for (const s of st.sections) {
      const [cx, cy] = polygonCentroid(s.poly);
      const text = (s.theme || "").toLowerCase();
      const rot = (hash(`r${s.id}`) - 0.5) * 0.12;
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(rot);
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = "rgba(38,36,34,.88)";
      const size = text.length > 22 ? 20 : text.length > 14 ? 24 : 28;
      ctx.font = `${size}px ${HAND}`;
      const lines = this.#wrap(ctx, text, 190);
      lines.forEach((ln, i) => ctx.fillText(ln, 0, (i - (lines.length - 1) / 2) * (size + 4)));
      if (!text && st.status === "temi") {
        ctx.fillStyle = "rgba(120,110,100,.5)";
        ctx.font = `20px ${HAND}`;
        ctx.fillText("Tema…", 0, 0);
      }
      ctx.restore();
      // numero (utile per il solitario e per parlare di "Sezione 5")
      ctx.save();
      ctx.font = "bold 13px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      const nx = cx;
      const ny = cy - 34 - (this.#wrapCount(ctx, text) - 1) * 14;
      ctx.fillStyle = "rgba(60,54,48,.12)";
      ctx.beginPath();
      ctx.arc(nx, ny, 11, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "rgba(60,54,48,.7)";
      ctx.fillText(String(s.num), nx, ny + 0.5);
      ctx.restore();
    }
  }

  #wrapCount(ctx, text) {
    return Math.max(1, this.#wrap(ctx, text, 190).length);
  }

  #wrap(ctx, text, maxW) {
    if (!text) return [""];
    const words = text.split(/\s+/);
    const lines = [];
    let cur = "";
    for (const w of words) {
      const t = cur ? `${cur} ${w}` : w;
      if (ctx.measureText(t).width > maxW && cur) {
        lines.push(cur);
        cur = w;
      } else cur = t;
    }
    if (cur) lines.push(cur);
    return lines;
  }

  #drawObstacles(ctx, st) {
    for (const o of st.obstacles) {
      ctx.save();
      ctx.shadowColor = "rgba(0,0,0,.45)";
      ctx.shadowBlur = 12;
      ctx.shadowOffsetY = 5;
      const g = ctx.createRadialGradient(o.x - o.r * 0.3, o.y - o.r * 0.3, o.r * 0.1, o.x, o.y, o.r);
      g.addColorStop(0, "rgba(255,255,255,.35)");
      g.addColorStop(0.75, "rgba(120,140,150,.25)");
      g.addColorStop(1, "rgba(30,40,50,.55)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(o.x, o.y, o.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowColor = "transparent";
      ctx.strokeStyle = "rgba(255,255,255,.4)";
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.font = `${Math.round(o.r * 1.1)}px sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(OBSTACLE_EMOJI[o.kind] ?? "🥃", o.x, o.y + 2);
      ctx.restore();
    }
  }

  #drawMarble(ctx, x, y, r, color) {
    ctx.save();
    ctx.fillStyle = "rgba(0,0,0,.28)";
    ctx.beginPath();
    ctx.ellipse(x + 3, y + r * 0.85, r * 0.95, r * 0.45, 0, 0, Math.PI * 2);
    ctx.fill();
    const g = ctx.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.1, x, y, r);
    g.addColorStop(0, shade(color, 0.42));
    g.addColorStop(0.45, color);
    g.addColorStop(1, shade(color, -0.32));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(0,0,0,.35)";
    ctx.lineWidth = 1;
    ctx.stroke();
    // riflesso
    ctx.fillStyle = "rgba(255,255,255,.75)";
    ctx.beginPath();
    ctx.ellipse(x - r * 0.38, y - r * 0.42, r * 0.22, r * 0.14, -0.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  #drawAim(ctx) {
    if (!this.aim) return;
    const { from, to, color } = this.aim;
    const l = launchFromDrag(from, to);
    const sp = Math.hypot(l.vx, l.vy);
    const pct = Math.min(1, sp / PHYS.maxLaunch);
    ctx.save();
    // elastico
    ctx.strokeStyle = "rgba(255,240,200,.55)";
    ctx.lineWidth = 3;
    ctx.setLineDash([2, 7]);
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
    ctx.stroke();
    // direzione di lancio
    const dir = sp > 1 ? [l.vx / sp, l.vy / sp] : [0, 0];
    const len = 80 + 260 * pct;
    ctx.strokeStyle = `rgba(255,255,255,${0.35 + 0.5 * pct})`;
    ctx.lineWidth = 4;
    ctx.setLineDash([10, 10]);
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(from.x + dir[0] * len, from.y + dir[1] * len);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
    this.#drawMarble(ctx, from.x, from.y, PHYS.radius, color ?? "#ffffff");
    // forza
    ctx.save();
    ctx.fillStyle = "rgba(0,0,0,.55)";
    ctx.fillRect(from.x - 34, from.y + 26, 68, 8);
    ctx.fillStyle = `hsl(${120 - 120 * pct},75%,55%)`;
    ctx.fillRect(from.x - 34, from.y + 26, 68 * pct, 8);
    ctx.restore();
  }

  #drawBanner(ctx, st) {
    if (!["lanci", "epilogo-lanci"].includes(st.status)) return;
    const p = st.players[st.turnIdx];
    if (!p) return;
    ctx.save();
    ctx.font = "bold 18px sans-serif";
    const text = st.awaiting
      ? `${p.name}: racconta e poi passa il turno`
      : st.pending
        ? `${p.name}: scegli la Sezione sul solco`
        : `Tocca a ${p.name}`;
    const w = ctx.measureText(text).width + 56;
    ctx.fillStyle = "rgba(20,14,10,.78)";
    ctx.beginPath();
    ctx.roundRect(TABLE.w / 2 - w / 2, 10, w, 34, 17);
    ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, TABLE.w / 2 + 14, 28);
    this.#drawMarble(ctx, TABLE.w / 2 - w / 2 + 22, 27, 9, p.color);
    ctx.restore();
  }
}
