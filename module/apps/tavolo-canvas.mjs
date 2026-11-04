/**
 * Disegno del Tavolo (canvas 2D) — versione "grafica del manuale":
 * tavolo di legno scuro con grana e penombra, due fogli A4 uniti col nastro adesivo (la Mappa A3),
 * linee a pennarello nero, Temi in stampatello a mano, residui di gomma e grafite,
 * biglie di vetro, oggetti sul tavolo (bicchiere, ciotola, cellulare...), matita, gomma e dado.
 * Gestisce anche il lancio "a fionda" e l'animazione dei tiri.
 */
import { polygonCentroid } from "../core/geometry.mjs";
import { PHYS, TABLE, PAPER, launchFromDrag } from "../core/physics.mjs";

const HAND = "'Patrick Hand SC','Caveat','Segoe Script','Comic Sans MS',cursive";
const MARKER = "'Permanent Marker','Segoe Script',cursive";
const CYAN = "#29b6f6";
const ENDING_TINT = {
  lieto: "rgba(96,176,104,.30)",
  dolceamaro: "rgba(236,176,64,.30)",
  drammatico: "rgba(200,70,70,.30)",
};

function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967296;
}

function rgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [n >> 16, (n >> 8) & 255, n & 255];
}

function shade(hex, amt, a = 1) {
  const [r, g, b] = rgb(hex);
  const f = (v) => Math.max(0, Math.min(255, Math.round(v + amt * 255)));
  return `rgba(${f(r)},${f(g)},${f(b)},${a})`;
}

function mix(hex, other, t) {
  const a = rgb(hex);
  const b = rgb(other);
  return `rgb(${Math.round(a[0] + (b[0] - a[0]) * t)},${Math.round(a[1] + (b[1] - a[1]) * t)},${Math.round(a[2] + (b[2] - a[2]) * t)})`;
}

function offscreen(w, h) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c;
}

export class TavoloCanvas {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {{onLaunch:(launch:object)=>void, canAim:()=>{ok:boolean,color?:string}, volume:()=>number, art?:(name:string)=>HTMLImageElement|null}} hooks
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
    this.cache = {};
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
  #startAnim(last) {
    const tracks = last.tracks.map((tr) => ({ ...tr, n: tr.pts.length / 2 }));
    const total = Math.max(...tracks.map((t) => t.t0 + t.n)) / 30;
    this.anim = { tracks, start: performance.now(), total, marble: last.marble, hits: [...(last.hits ?? [])], hitIdx: 0 };
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
    while (a.hitIdx < a.hits.length && a.hits[a.hitIdx][0] <= t) {
      this.#tok(a.hits[a.hitIdx][1]);
      a.hitIdx++;
    }
    return { pos, done: t >= a.total + 0.05, t };
  }

  /** "Toc" del vetro: due toni brevi, più forti con la velocità dell'urto. */
  #tok(v) {
    const vol = this.hooks.volume?.() ?? 0;
    if (!vol) return;
    try {
      this.audio ??= new AudioContext();
      const ctx = this.audio;
      const strength = Math.min(1, v / 700);
      const t0 = ctx.currentTime;
      for (const [f0, f1, gain] of [[2300 + Math.random() * 500, 700, 0.5], [3900 + Math.random() * 600, 1500, 0.2]]) {
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.type = "sine";
        o.frequency.setValueAtTime(f0, t0);
        o.frequency.exponentialRampToValueAtTime(f1, t0 + 0.05);
        g.gain.setValueAtTime(vol * gain * (0.25 + 0.75 * strength), t0);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.11);
        o.connect(g).connect(ctx.destination);
        o.start(t0);
        o.stop(t0 + 0.12);
      }
    } catch (e) {
      /* audio non disponibile */
    }
  }

  // ------------------------------------------------------------------ input
  #bind() {
    this._down = (e) => this.#pointerDown(e);
    this._move = (e) => this.#pointerMove(e);
    this._up = (e) => this.#pointerUp(e);
    this._ctx = (e) => {
      if (this.aim) {
        e.preventDefault();
        this.aim = null;
        this.requestDraw();
      }
    };
    this._key = (e) => {
      if (e.key === "Escape" && this.aim) {
        this.aim = null;
        this.requestDraw();
      }
    };
    this.canvas.addEventListener("pointerdown", this._down);
    this.canvas.addEventListener("pointermove", this._move);
    this.canvas.addEventListener("contextmenu", this._ctx);
    window.addEventListener("pointerup", this._up);
    window.addEventListener("keydown", this._key);
  }

  #unbind() {
    this.canvas.removeEventListener("pointerdown", this._down);
    this.canvas.removeEventListener("pointermove", this._move);
    this.canvas.removeEventListener("contextmenu", this._ctx);
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
    const paper = (this.state?.torn ? this.state.half : this.state?.paper) ?? PAPER;
    const inPaper = p.x > paper.x && p.x < paper.x + paper.w && p.y > paper.y && p.y < paper.y + paper.h;
    if (inPaper) {
      globalThis.ui?.notifications?.info("Si lancia dal bordo del tavolo, fuori dal foglio.");
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
    if (Math.hypot(launch.vx, launch.vy) < 120) {
      this.requestDraw();
      return;
    }
    this.hooks.onLaunch(launch);
    this.requestDraw();
  }

  // ---------------------------------------------------------------- disegno
  #frame(now) {
    const ctx = this.ctx;
    const st = this.state;
    ctx.clearRect(0, 0, TABLE.w, TABLE.h);
    ctx.drawImage(this.#tableLayer(), 0, 0);
    this.#drawDecor(ctx);
    if (!st) {
      this.#drawPaperBase(ctx, PAPER);
      this.#drawIdle(ctx);
      this.#drawObstaclesStatic(ctx);
      return;
    }
    this.#drawPaperBase(ctx, st.paper);
    this.#drawResidue(ctx, st);
    this.#drawTorn(ctx, st);
    this.#drawSections(ctx, st);
    this.#drawObstacles(ctx, st);

    let overrides = null;
    let animating = false;
    if (this.anim) {
      const r = this.#animPositions(now);
      overrides = r.pos;
      animating = true;
      if (r.done) {
        this.snap = { from: new Map(r.pos), start: now };
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

    const drawn = new Set();
    for (const m of st.marbles) {
      const o = overrides?.get(m.id) ?? snapPos?.get(m.id);
      this.#drawMarble(ctx, o?.x ?? m.x, o?.y ?? m.y, PHYS.radius, m.color, m.id);
      drawn.add(m.id);
    }
    if (this.anim?.marble && !drawn.has(this.anim.marble.id) && overrides?.get(this.anim.marble.id)) {
      const o = overrides.get(this.anim.marble.id);
      this.#drawMarble(ctx, o.x, o.y, PHYS.radius, this.anim.marble.color, this.anim.marble.id);
    }
    if (!this.anim && st.pending) this.#drawMarble(ctx, st.pending.final.x, st.pending.final.y, PHYS.radius, st.pending.marble.color, st.pending.marble.id);

    this.#drawAim(ctx);
    this.#drawBanner(ctx, st);
    if (animating || this.snap || this.aim) this.requestDraw();
  }

  // ------------------------------------------------------------- tavolo
  #tableLayer() {
    if (this.cache.table) return this.cache.table;
    const c = offscreen(TABLE.w, TABLE.h);
    const g = c.getContext("2d");
    // assi di noce scuro, orizzontali
    const plankH = 150;
    for (let y = 0, i = 0; y < TABLE.h; y += plankH, i++) {
      const tone = 0.5 + hash(`pl${i}`) * 0.5;
      const base = `rgb(${Math.round(52 + 22 * tone)},${Math.round(34 + 14 * tone)},${Math.round(24 + 9 * tone)})`;
      const grad = g.createLinearGradient(0, y, 0, y + plankH);
      grad.addColorStop(0, shade("#2b1a10", 0.03 + 0.04 * tone));
      grad.addColorStop(0.5, base);
      grad.addColorStop(1, shade("#2b1a10", 0.0));
      g.fillStyle = grad;
      g.fillRect(0, y, TABLE.w, plankH);
      // venature
      for (let k = 0; k < 26; k++) {
        const yy = y + hash(`v${i}-${k}`) * plankH;
        const bend = (hash(`b${i}-${k}`) - 0.5) * 14;
        g.strokeStyle = `rgba(${hash(`c${i}-${k}`) > 0.55 ? "12,6,3" : "150,100,64"},${0.05 + hash(`a${i}-${k}`) * 0.08})`;
        g.lineWidth = 0.6 + hash(`w${i}-${k}`) * 2.2;
        g.beginPath();
        g.moveTo(0, yy);
        g.bezierCurveTo(TABLE.w * 0.3, yy + bend, TABLE.w * 0.65, yy - bend, TABLE.w, yy + bend * 0.4);
        g.stroke();
      }
      // nodo
      if (hash(`n${i}`) > 0.35) {
        const nx = 120 + hash(`nx${i}`) * (TABLE.w - 240);
        const ny = y + 30 + hash(`ny${i}`) * (plankH - 60);
        for (let r = 3; r < 26; r += 4) {
          g.strokeStyle = `rgba(20,10,5,${0.12 - r * 0.003})`;
          g.lineWidth = 1.4;
          g.beginPath();
          g.ellipse(nx, ny, r * 2.2, r * 0.7, 0, 0, Math.PI * 2);
          g.stroke();
        }
      }
      // fessura tra le assi
      g.fillStyle = "rgba(0,0,0,.65)";
      g.fillRect(0, y, TABLE.w, 2);
      g.fillStyle = "rgba(255,200,150,.06)";
      g.fillRect(0, y + 2, TABLE.w, 1);
    }
    // grana sporca del manuale (se presente) a velo
    const grunge = this.hooks.art?.("grunge");
    if (grunge) {
      g.save();
      g.globalAlpha = 0.34;
      g.globalCompositeOperation = "overlay";
      g.drawImage(grunge, 0, 0, TABLE.w, TABLE.h);
      g.restore();
    }
    // pozza di luce + penombra
    const light = g.createRadialGradient(TABLE.w * 0.5, TABLE.h * 0.42, 80, TABLE.w * 0.5, TABLE.h * 0.5, TABLE.w * 0.72);
    light.addColorStop(0, "rgba(255,214,160,.16)");
    light.addColorStop(0.55, "rgba(0,0,0,0)");
    light.addColorStop(1, "rgba(0,0,0,.62)");
    g.fillStyle = light;
    g.fillRect(0, 0, TABLE.w, TABLE.h);
    this.cache.table = c;
    return c;
  }

  /** Matita, gomma e dado sul tavolo: puro decoro (non fanno da ostacolo). */
  #drawDecor(ctx) {
    ctx.save();
    // matita
    ctx.translate(318, 866);
    ctx.rotate(-0.06);
    ctx.shadowColor = "rgba(0,0,0,.5)";
    ctx.shadowBlur = 8;
    ctx.shadowOffsetY = 4;
    const body = ctx.createLinearGradient(0, -7, 0, 7);
    body.addColorStop(0, "#f2c21b");
    body.addColorStop(0.5, "#ffd84a");
    body.addColorStop(1, "#b58a0a");
    ctx.fillStyle = body;
    ctx.fillRect(-110, -7, 190, 14);
    ctx.shadowColor = "transparent";
    ctx.fillStyle = "#e9c69a";
    ctx.beginPath();
    ctx.moveTo(80, -7);
    ctx.lineTo(112, 0);
    ctx.lineTo(80, 7);
    ctx.fill();
    ctx.fillStyle = "#262626";
    ctx.beginPath();
    ctx.moveTo(104, -2);
    ctx.lineTo(112, 0);
    ctx.lineTo(104, 2);
    ctx.fill();
    ctx.fillStyle = "#c9c9c9";
    ctx.fillRect(-122, -7, 14, 14);
    ctx.fillStyle = "#d9534f";
    ctx.beginPath();
    ctx.roundRect(-136, -7, 16, 14, 4);
    ctx.fill();
    ctx.restore();
    // gomma
    ctx.save();
    ctx.translate(460, 862);
    ctx.rotate(0.12);
    ctx.shadowColor = "rgba(0,0,0,.5)";
    ctx.shadowBlur = 7;
    ctx.shadowOffsetY = 3;
    ctx.fillStyle = "#f4f1ea";
    ctx.beginPath();
    ctx.roundRect(-32, -15, 64, 30, 6);
    ctx.fill();
    ctx.shadowColor = "transparent";
    ctx.fillStyle = "#3d7fc4";
    ctx.fillRect(-32, -15, 22, 30);
    ctx.fillStyle = "rgba(0,0,0,.12)";
    ctx.fillRect(18, -12, 10, 24);
    ctx.restore();
    // dado
    ctx.save();
    ctx.translate(1128, 866);
    ctx.rotate(0.35);
    ctx.shadowColor = "rgba(0,0,0,.55)";
    ctx.shadowBlur = 9;
    ctx.shadowOffsetY = 4;
    const dg = ctx.createLinearGradient(-20, -20, 20, 20);
    dg.addColorStop(0, "#fbfbf6");
    dg.addColorStop(1, "#cfcabc");
    ctx.fillStyle = dg;
    ctx.beginPath();
    ctx.roundRect(-20, -20, 40, 40, 7);
    ctx.fill();
    ctx.shadowColor = "transparent";
    ctx.fillStyle = "#1a1a1a";
    for (const [dx, dy] of [[-10, -10], [10, -10], [0, 0], [-10, 10], [10, 10]]) {
      ctx.beginPath();
      ctx.arc(dx, dy, 3.6, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  // -------------------------------------------------------------- il foglio
  /** Due fogli A4 (550×760) affiancati e uniti col nastro adesivo: la Mappa A3. */
  #drawPaperBase(ctx, p) {
    if (!this.cache.paper) {
      const c = offscreen(p.w, p.h);
      const g = c.getContext("2d");
      g.fillStyle = "#efe9db";
      g.fillRect(0, 0, p.w, p.h);
      // grana
      for (let i = 0; i < 9000; i++) {
        const x = hash(`px${i}`) * p.w;
        const y = hash(`py${i}`) * p.h;
        g.fillStyle = `rgba(${hash(`pc${i}`) > 0.5 ? "120,100,70" : "255,255,255"},${0.03 + hash(`pa${i}`) * 0.07})`;
        g.fillRect(x, y, 1 + hash(`pw${i}`) * 2.6, 1 + hash(`ph${i}`) * 0.8);
      }
      // pieghe di carta stropicciata, leggere
      for (let i = 0; i < 11; i++) {
        const x0 = hash(`cx${i}`) * p.w;
        const y0 = hash(`cy${i}`) * p.h;
        const a = hash(`ca${i}`) * Math.PI;
        const len = 90 + hash(`cl${i}`) * 220;
        const x1 = x0 + Math.cos(a) * len;
        const y1 = y0 + Math.sin(a) * len;
        g.lineCap = "round";
        g.strokeStyle = "rgba(255,255,255,.15)";
        g.lineWidth = 3.2;
        g.beginPath();
        g.moveTo(x0, y0 - 1);
        g.lineTo(x1, y1 - 1);
        g.stroke();
        g.strokeStyle = "rgba(90,70,40,.055)";
        g.lineWidth = 2.4;
        g.beginPath();
        g.moveTo(x0, y0 + 1);
        g.lineTo(x1, y1 + 1);
        g.stroke();
      }
      // ombreggiatura ai margini
      const vg = g.createRadialGradient(p.w / 2, p.h / 2, p.h * 0.32, p.w / 2, p.h / 2, p.w * 0.64);
      vg.addColorStop(0, "rgba(255,250,235,0)");
      vg.addColorStop(1, "rgba(140,110,60,.20)");
      g.fillStyle = vg;
      g.fillRect(0, 0, p.w, p.h);
      // giunzione dei due A4: lieve ombra a gradino e linea sottile
      const sx = p.w / 2;
      const sg = g.createLinearGradient(sx - 10, 0, sx + 10, 0);
      sg.addColorStop(0, "rgba(0,0,0,0)");
      sg.addColorStop(0.5, "rgba(0,0,0,.12)");
      sg.addColorStop(1, "rgba(0,0,0,0)");
      g.fillStyle = sg;
      g.fillRect(sx - 10, 0, 20, p.h);
      g.fillStyle = "rgba(255,255,255,.55)";
      g.fillRect(sx + 1, 0, 1, p.h);
      this.cache.paper = c;
    }
    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,.6)";
    ctx.shadowBlur = 26;
    ctx.shadowOffsetX = 4;
    ctx.shadowOffsetY = 10;
    ctx.fillStyle = "#efe9db";
    ctx.fillRect(p.x, p.y, p.w, p.h);
    ctx.restore();
    ctx.drawImage(this.cache.paper, p.x, p.y);
    // nastro adesivo
    for (const [ty, rot] of [[p.y + 38, 0.05], [p.y + p.h / 2, -0.04], [p.y + p.h - 38, 0.06]]) this.#tape(ctx, p.x + p.w / 2, ty, rot);
  }

  #tape(ctx, x, y, rot) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rot + Math.PI / 2);
    const w = 118;
    const h = 40;
    ctx.shadowColor = "rgba(0,0,0,.25)";
    ctx.shadowBlur = 5;
    ctx.shadowOffsetY = 2;
    const g = ctx.createLinearGradient(-w / 2, 0, w / 2, 0);
    g.addColorStop(0, "rgba(228,214,170,.62)");
    g.addColorStop(0.5, "rgba(244,234,200,.72)");
    g.addColorStop(1, "rgba(222,208,160,.6)");
    ctx.fillStyle = g;
    ctx.beginPath();
    // bordi seghettati ai lati corti
    ctx.moveTo(-w / 2, -h / 2);
    for (let i = 0; i <= 8; i++) ctx.lineTo(-w / 2 + (i % 2 ? 4 : 0), -h / 2 + (h * i) / 8);
    ctx.lineTo(w / 2, h / 2);
    for (let i = 8; i >= 0; i--) ctx.lineTo(w / 2 - (i % 2 ? 4 : 0), -h / 2 + (h * i) / 8);
    ctx.closePath();
    ctx.fill();
    ctx.shadowColor = "transparent";
    ctx.fillStyle = "rgba(255,255,255,.35)";
    ctx.fillRect(-w / 2 + 6, -h / 2 + 5, w - 12, 5);
    ctx.restore();
  }

  /** Macchie di grafite, striature e briciole di gomma: i residui delle cancellature. */
  #drawResidue(ctx, st) {
    const key = JSON.stringify([st.residue.smudges.length, st.residue.creases.length, st.residue.smudges[0]?.x, st.residue.crumples?.length ?? 0, st.residue.crumples?.[0]?.x]);
    if (this.cache.residueKey !== key) {
      const c = offscreen(st.paper.w, st.paper.h);
      const g = c.getContext("2d");
      g.translate(-st.paper.x, -st.paper.y);
      st.residue.smudges.forEach((s, i) => {
        // striature di grafite sfumate
        for (let k = 0; k < 46; k++) {
          const a = hash(`sa${i}-${k}`) * Math.PI * 2;
          const d = Math.sqrt(hash(`sd${i}-${k}`)) * s.r;
          const x = s.x + Math.cos(a) * d;
          const y = s.y + Math.sin(a) * d;
          const ang = -0.5 + (hash(`sg${i}-${k}`) - 0.5) * 0.7;
          g.save();
          g.translate(x, y);
          g.rotate(ang);
          const len = 18 + hash(`sl${i}-${k}`) * 34;
          const gr = g.createLinearGradient(-len / 2, 0, len / 2, 0);
          gr.addColorStop(0, "rgba(70,66,62,0)");
          gr.addColorStop(0.5, `rgba(70,66,62,${(0.07 + hash(`sh${i}-${k}`) * 0.08) * s.k})`);
          gr.addColorStop(1, "rgba(70,66,62,0)");
          g.fillStyle = gr;
          g.fillRect(-len / 2, -2.5 - hash(`sw${i}-${k}`) * 3, len, 5 + hash(`sw${i}-${k}`) * 6);
          g.restore();
        }
        // briciole di gomma
        for (let k = 0; k < 9; k++) {
          const a = hash(`ba${i}-${k}`) * Math.PI * 2;
          const d = Math.sqrt(hash(`bd${i}-${k}`)) * s.r * 1.1;
          g.save();
          g.translate(s.x + Math.cos(a) * d, s.y + Math.sin(a) * d);
          g.rotate(hash(`br${i}-${k}`) * Math.PI);
          g.fillStyle = "rgba(120,114,108,.55)";
          g.beginPath();
          g.roundRect(-3.2, -1.3, 6.4, 2.6, 1.3);
          g.fill();
          g.fillStyle = "rgba(255,255,255,.4)";
          g.fillRect(-2.4, -1.1, 2.2, 0.9);
          g.restore();
        }
      });
      this.cache.residueCanvas = c;
      this.cache.residueKey = key;
    }
    ctx.drawImage(this.cache.residueCanvas, st.paper.x, st.paper.y);
    // carta accartocciata: rughe a raggiera e ombre
    for (const [i, c] of (st.residue.crumples ?? []).entries()) {
      const g = ctx.createRadialGradient(c.x, c.y, 0, c.x, c.y, c.r);
      g.addColorStop(0, "rgba(90,70,40,.10)");
      g.addColorStop(1, "rgba(90,70,40,0)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(c.x, c.y, c.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.lineCap = "round";
      for (let k = 0; k < 16; k++) {
        const a = hash(`cr${i}-${k}`) * Math.PI * 2;
        const r0 = c.r * (0.1 + hash(`cs${i}-${k}`) * 0.35);
        const r1 = c.r * (0.55 + hash(`ce${i}-${k}`) * 0.45);
        const bend = (hash(`cb${i}-${k}`) - 0.5) * 0.5;
        const x0 = c.x + Math.cos(a) * r0;
        const y0 = c.y + Math.sin(a) * r0;
        const x1 = c.x + Math.cos(a + bend) * r1;
        const y1 = c.y + Math.sin(a + bend) * r1;
        ctx.strokeStyle = "rgba(60,45,25,.18)";
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(x0, y0 + 1.4);
        ctx.lineTo(x1, y1 + 1.4);
        ctx.stroke();
        ctx.strokeStyle = "rgba(255,255,255,.55)";
        ctx.lineWidth = 1.8;
        ctx.beginPath();
        ctx.moveTo(x0, y0 - 0.8);
        ctx.lineTo(x1, y1 - 0.8);
        ctx.stroke();
      }
    }
    // pieghe
    for (const cr of st.residue.creases) {
      ctx.save();
      ctx.lineCap = "round";
      ctx.strokeStyle = "rgba(60,45,25,.14)";
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(cr.x1, cr.y1 + 1.8);
      ctx.lineTo(cr.x2, cr.y2 + 1.8);
      ctx.stroke();
      ctx.strokeStyle = "rgba(255,255,255,.42)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(cr.x1, cr.y1 - 1);
      ctx.lineTo(cr.x2, cr.y2 - 1);
      ctx.stroke();
      ctx.restore();
    }
  }

  #drawTorn(ctx, st) {
    if (!st.torn || !st.half) return;
    const p = st.paper;
    const h = st.half;
    ctx.save();
    // la metà strappata sparisce: si vede il tavolo
    ctx.beginPath();
    ctx.moveTo(p.x - 48, p.y - 48);
    ctx.lineTo(h.x, p.y - 48);
    for (let y = p.y; y <= p.y + p.h; y += 12) ctx.lineTo(h.x + (hash(`t${y}`) - 0.5) * 11, y);
    ctx.lineTo(h.x, p.y + p.h + 48);
    ctx.lineTo(p.x - 48, p.y + p.h + 48);
    ctx.closePath();
    ctx.clip();
    ctx.drawImage(this.#tableLayer(), 0, 0);
    ctx.restore();
    // bordo strappato: fibre chiare
    ctx.save();
    ctx.strokeStyle = "#f6f0e1";
    ctx.lineWidth = 4;
    ctx.shadowColor = "rgba(0,0,0,.45)";
    ctx.shadowBlur = 6;
    ctx.beginPath();
    for (let y = p.y; y <= p.y + p.h; y += 12) {
      const x = h.x + (hash(`t${y}`) - 0.5) * 11;
      if (y === p.y) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.restore();
  }

  // --------------------------------------------------------------- Sezioni
  #marker(ctx, poly, seed, amp = 2.2) {
    ctx.beginPath();
    poly.forEach(([x, y], i) => {
      const [nx, ny] = poly[(i + 1) % poly.length];
      if (i === 0) ctx.moveTo(x, y);
      const len = Math.hypot(nx - x, ny - y);
      const n = Math.max(1, Math.round(len / 55));
      const nxn = -(ny - y) / (len || 1);
      const nyn = (nx - x) / (len || 1);
      for (let k = 1; k <= n; k++) {
        const u = k / n;
        const j = k === n ? 0 : (hash(`${seed}:${i}:${k}`) - 0.5) * 2 * amp;
        ctx.lineTo(x + (nx - x) * u + nxn * j, y + (ny - y) * u + nyn * j);
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
      const kind = st.epilogue?.endings?.[s.id];
      if (kind && ENDING_TINT[kind]) {
        this.#marker(ctx, s.poly, s.id, 0);
        ctx.fillStyle = ENDING_TINT[kind];
        ctx.fill();
      }
    }
    // pennarello nero: due passate leggermente sfalsate
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    for (const s of st.sections) {
      this.#marker(ctx, s.poly, s.id, 2.4);
      ctx.strokeStyle = "rgba(10,10,10,.92)";
      ctx.lineWidth = 4.6;
      ctx.stroke();
      ctx.save();
      ctx.translate(0.7, 0.5);
      ctx.strokeStyle = "rgba(10,10,10,.35)";
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.restore();
    }
    ctx.restore();

    for (const s of st.sections) {
      const [cx, cy] = polygonCentroid(s.poly);
      const text = (s.theme || "").toUpperCase();
      const rot = (hash(`r${s.id}`) - 0.5) * 0.1;
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(rot);
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      const size = text.length > 22 ? 21 : text.length > 14 ? 25 : 30;
      ctx.font = `${size}px ${HAND}`;
      const lines = this.#wrap(ctx, text, 200);
      ctx.fillStyle = "rgba(14,14,14,.94)";
      lines.forEach((ln, i) => ctx.fillText(ln, 0, (i - (lines.length - 1) / 2) * (size + 3)));
      if (!text && st.status === "temi") {
        ctx.fillStyle = "rgba(90,84,76,.5)";
        ctx.font = `22px ${HAND}`;
        ctx.fillText("TEMA…", 0, 0);
      }
      ctx.restore();
      // numero della Sezione, discreto
      const ny = cy - 36 - (lines.length - 1) * 13;
      ctx.save();
      ctx.font = "bold 12px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.strokeStyle = "rgba(40,36,32,.45)";
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.arc(cx, ny, 10, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = "rgba(40,36,32,.7)";
      ctx.fillText(String(s.num), cx, ny + 0.5);
      ctx.restore();
    }
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

  #drawIdle(ctx) {
    const p = PAPER;
    ctx.save();
    ctx.textAlign = "center";
    ctx.fillStyle = "rgba(20,20,20,.9)";
    ctx.font = `64px ${MARKER}`;
    ctx.fillText("FRIENDS FOREVER", p.x + p.w / 2, p.y + p.h / 2 - 10);
    ctx.fillStyle = "rgba(41,182,246,.95)";
    ctx.fillRect(p.x + p.w / 2 - 250, p.y + p.h / 2 + 4, 500, 5);
    ctx.fillStyle = "rgba(40,36,32,.7)";
    ctx.font = `26px ${HAND}`;
    ctx.fillText("IL GM PUÒ INIZIARE UNA NUOVA PARTITA DAL PANNELLO A DESTRA", p.x + p.w / 2, p.y + p.h / 2 + 52);
    ctx.restore();
  }

  // ------------------------------------------------------- oggetti del tavolo
  #drawObstacles(ctx, st) {
    for (const o of st.obstacles) this.#obstacle(ctx, o);
  }

  #drawObstaclesStatic() {
    /* senza partita non ci sono ostacoli */
  }

  #obstacle(ctx, o) {
    ctx.save();
    ctx.translate(o.x, o.y);
    ctx.shadowColor = "rgba(0,0,0,.55)";
    ctx.shadowBlur = 14;
    ctx.shadowOffsetX = 3;
    ctx.shadowOffsetY = 7;
    const r = o.r;
    const circle = (rad, fill) => {
      ctx.fillStyle = fill;
      ctx.beginPath();
      ctx.arc(0, 0, rad, 0, Math.PI * 2);
      ctx.fill();
    };
    switch (o.kind) {
      case "bicchiere": {
        circle(r, "rgba(190,215,225,.38)");
        ctx.shadowColor = "transparent";
        circle(r * 0.86, "rgba(210,150,60,.40)");
        circle(r * 0.62, "rgba(235,185,90,.35)");
        ctx.strokeStyle = "rgba(255,255,255,.75)";
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.arc(0, 0, r - 1.5, Math.PI * 1.05, Math.PI * 1.55);
        ctx.stroke();
        ctx.strokeStyle = "rgba(255,255,255,.35)";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(0, 0, r * 0.62, Math.PI * 0.1, Math.PI * 0.5);
        ctx.stroke();
        break;
      }
      case "ciotola": {
        circle(r, "#d9d2c3");
        ctx.shadowColor = "transparent";
        circle(r * 0.82, "#b9b0a0");
        circle(r * 0.7, "#e4dccc");
        for (let i = 0; i < 12; i++) {
          const a = hash(`sn${o.x}${i}`) * Math.PI * 2;
          const d = Math.sqrt(hash(`sd${o.y}${i}`)) * r * 0.58;
          ctx.fillStyle = i % 3 ? "#d8a84a" : "#c0792d";
          ctx.beginPath();
          ctx.arc(Math.cos(a) * d, Math.sin(a) * d, 4.5, 0, Math.PI * 2);
          ctx.fill();
        }
        break;
      }
      case "bottiglia": {
        circle(r, "rgba(34,94,56,.88)");
        ctx.shadowColor = "transparent";
        circle(r * 0.66, "rgba(60,140,86,.8)");
        circle(r * 0.34, "#c9a94b");
        ctx.fillStyle = "rgba(255,255,255,.45)";
        ctx.beginPath();
        ctx.ellipse(-r * 0.3, -r * 0.34, r * 0.22, r * 0.12, -0.7, 0, Math.PI * 2);
        ctx.fill();
        break;
      }
      case "posacenere": {
        circle(r, "rgba(200,210,215,.55)");
        ctx.shadowColor = "transparent";
        circle(r * 0.78, "rgba(130,138,142,.55)");
        for (let i = 0; i < 4; i++) {
          const a = i * 1.7 + 0.5;
          ctx.save();
          ctx.rotate(a);
          ctx.fillStyle = "#e8e2d2";
          ctx.fillRect(r * 0.18, -3, r * 0.5, 6);
          ctx.fillStyle = "#c98a4b";
          ctx.fillRect(r * 0.5, -3, r * 0.18, 6);
          ctx.restore();
        }
        break;
      }
      case "cellulare": {
        circle(r, "rgba(0,0,0,0)");
        ctx.rotate(hash(`ph${o.x}`) * 1.2 - 0.6);
        const w = r * 1.05;
        const h = r * 1.8;
        ctx.fillStyle = "#16181c";
        ctx.beginPath();
        ctx.roundRect(-w / 2, -h / 2, w, h, 9);
        ctx.fill();
        ctx.shadowColor = "transparent";
        const sg = ctx.createLinearGradient(0, -h / 2, 0, h / 2);
        sg.addColorStop(0, "#3a6e9a");
        sg.addColorStop(1, "#12213a");
        ctx.fillStyle = sg;
        ctx.beginPath();
        ctx.roundRect(-w / 2 + 3, -h / 2 + 5, w - 6, h - 10, 6);
        ctx.fill();
        ctx.fillStyle = "rgba(255,255,255,.14)";
        ctx.beginPath();
        ctx.moveTo(-w / 2 + 3, -h / 2 + 5);
        ctx.lineTo(w / 2 - 3, -h / 2 + 5);
        ctx.lineTo(-w / 2 + 3, 0);
        ctx.fill();
        break;
      }
      case "accendino": {
        circle(r, "rgba(0,0,0,0)");
        ctx.rotate(hash(`ac${o.y}`) * 2 - 1);
        const w = r * 0.9;
        const h = r * 1.75;
        const g2 = ctx.createLinearGradient(-w / 2, 0, w / 2, 0);
        g2.addColorStop(0, "#9c1f1f");
        g2.addColorStop(0.5, "#e04a4a");
        g2.addColorStop(1, "#8a1a1a");
        ctx.fillStyle = g2;
        ctx.beginPath();
        ctx.roundRect(-w / 2, -h / 2, w, h, 6);
        ctx.fill();
        ctx.shadowColor = "transparent";
        ctx.fillStyle = "#b9bcc2";
        ctx.fillRect(-w / 2, -h / 2, w, h * 0.22);
        ctx.fillStyle = "#6f7480";
        ctx.beginPath();
        ctx.arc(0, -h / 2 + 4, 3, 0, Math.PI * 2);
        ctx.fill();
        break;
      }
      default:
        circle(r, "rgba(120,140,150,.5)");
    }
    ctx.restore();
  }

  // ---------------------------------------------------------------- biglie
  /** Biglia di vetro: corpo colorato, vortice interno, riflesso e caustica. */
  #drawMarble(ctx, x, y, r, color, id = "") {
    ctx.save();
    // ombra morbida sulla carta
    const sh = ctx.createRadialGradient(x + 5, y + 8, 1, x + 5, y + 8, r * 1.35);
    sh.addColorStop(0, "rgba(0,0,0,.38)");
    sh.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = sh;
    ctx.beginPath();
    ctx.ellipse(x + 5, y + 8, r * 1.3, r * 0.85, 0, 0, Math.PI * 2);
    ctx.fill();
    // corpo
    const body = ctx.createRadialGradient(x - r * 0.25, y - r * 0.3, r * 0.1, x, y, r);
    body.addColorStop(0, mix(color, "#ffffff", 0.55));
    body.addColorStop(0.4, color);
    body.addColorStop(0.85, mix(color, "#000000", 0.38));
    body.addColorStop(1, mix(color, "#000000", 0.6));
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    // vortice interno
    ctx.save();
    ctx.beginPath();
    ctx.arc(x, y, r - 0.5, 0, Math.PI * 2);
    ctx.clip();
    ctx.translate(x, y);
    ctx.rotate(hash(`mv${id}`) * Math.PI * 2);
    ctx.strokeStyle = "rgba(255,255,255,.34)";
    ctx.lineWidth = r * 0.34;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.52, 0.3, 2.2);
    ctx.stroke();
    ctx.strokeStyle = "rgba(0,0,0,.18)";
    ctx.lineWidth = r * 0.2;
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.4, 3.4, 5.4);
    ctx.stroke();
    ctx.restore();
    // bordo
    ctx.strokeStyle = "rgba(0,0,0,.4)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.stroke();
    // caustica in basso a destra
    const ca = ctx.createRadialGradient(x + r * 0.42, y + r * 0.46, 0, x + r * 0.42, y + r * 0.46, r * 0.5);
    ca.addColorStop(0, "rgba(255,255,255,.38)");
    ca.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = ca;
    ctx.beginPath();
    ctx.arc(x + r * 0.42, y + r * 0.46, r * 0.5, 0, Math.PI * 2);
    ctx.fill();
    // riflesso principale
    ctx.fillStyle = "rgba(255,255,255,.88)";
    ctx.beginPath();
    ctx.ellipse(x - r * 0.4, y - r * 0.44, r * 0.26, r * 0.15, -0.65, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,.55)";
    ctx.beginPath();
    ctx.arc(x - r * 0.12, y - r * 0.62, r * 0.07, 0, Math.PI * 2);
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
    ctx.strokeStyle = "rgba(255,240,210,.5)";
    ctx.lineWidth = 3;
    ctx.setLineDash([2, 7]);
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
    ctx.stroke();
    const dir = sp > 1 ? [l.vx / sp, l.vy / sp] : [0, 0];
    const len = 150; // solo la direzione: il tiro non è mirato, la distanza dipende dalla forza
    ctx.shadowColor = CYAN;
    ctx.shadowBlur = 12;
    ctx.strokeStyle = `rgba(255,255,255,${0.4 + 0.5 * pct})`;
    ctx.lineWidth = 4;
    ctx.setLineDash([10, 10]);
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(from.x + dir[0] * len, from.y + dir[1] * len);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
    this.#drawMarble(ctx, from.x, from.y, PHYS.radius, color ?? "#ffffff", "aim");
    ctx.save();
    ctx.fillStyle = "rgba(0,0,0,.6)";
    ctx.fillRect(from.x - 36, from.y + 28, 72, 8);
    const pg = ctx.createLinearGradient(from.x - 36, 0, from.x + 36, 0);
    pg.addColorStop(0, CYAN);
    pg.addColorStop(1, "#ff5d8f");
    ctx.fillStyle = pg;
    ctx.fillRect(from.x - 36, from.y + 28, 72 * pct, 8);
    ctx.font = `18px ${HAND}`;
    ctx.textAlign = "center";
    ctx.fillStyle = "#fff";
    ctx.fillText(`FORZA ${Math.round(pct * 100)}%`, from.x, from.y + 56);
    ctx.restore();
  }


  #drawBanner(ctx, st) {
    if (!["lanci", "epilogo-lanci"].includes(st.status)) return;
    const p = st.players[st.turnIdx];
    if (!p) return;
    ctx.save();
    ctx.font = `22px ${HAND}`;
    const text = (
      st.awaiting
        ? `${p.name}: racconta e poi passa il turno`
        : st.pending
          ? `${p.name}: scegli la Sezione sul solco`
          : `Tocca a ${p.name}`
    ).toUpperCase();
    const w = ctx.measureText(text).width + 70;
    const x0 = TABLE.w / 2 - w / 2;
    ctx.shadowColor = "rgba(0,0,0,.6)";
    ctx.shadowBlur = 10;
    ctx.fillStyle = "#0b0b0c";
    ctx.beginPath();
    ctx.roundRect(x0, 12, w, 38, 4);
    ctx.fill();
    ctx.shadowColor = "transparent";
    ctx.fillStyle = CYAN;
    ctx.fillRect(x0 + 8, 46, w - 16, 2.5);
    ctx.fillStyle = "#f4f4f2";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, TABLE.w / 2 + 16, 31);
    this.#drawMarble(ctx, x0 + 26, 31, 10, p.color, "banner");
    ctx.restore();
  }
}
