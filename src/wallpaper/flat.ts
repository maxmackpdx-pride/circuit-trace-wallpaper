import { previewPathPrefix } from "@/lib/preview-path-prefix";
import { circuit } from "./circuit";
import type { WallpaperLive } from "./engine";

type Pt = { x: number; y: number };

type Run = {
  pts: Pt[];
  cum: number[];
  total: number;
  h0: number;
  hd: number;
  phase: number;
  speed: number;
  sparks: number;
  reverse: number;
};

function hash(i: number) {
  let n = Math.imul(i ^ 0x9e3779b9, 0x85ebca6b);
  n = Math.imul(n ^ (n >>> 13), 0xc2b2ae35);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}

function fract(n: number) {
  return n - Math.floor(n);
}

function rgb(h: number) {
  const s = 0.9;
  const v = 1;
  const f = (n: number) => {
    const k = (n + h * 6) % 6;
    return Math.round((v - v * s * Math.max(0, Math.min(k, 4 - k, 1))) * 255);
  };
  return [f(5), f(3), f(1)] as const;
}

function assetUrl(file: string) {
  if (typeof window === "undefined") return `/${file}`;
  const prefix = previewPathPrefix(window.location.hostname, window.location.pathname);
  return `${prefix ?? ""}/${file}`;
}

export class FlatEngine {
  live: WallpaperLive = { duty: 0.22, pace: 1, glow: 1, paused: false };
  demo = true;
  target = { x: 0, y: 0 };
  didPaint = false;
  failMessage: string | null = null;
  onReady: (() => void) | null = null;
  onLost: ((message: string) => void) | null = null;
  private tilt = { x: 0, y: 0 };
  private ctx: CanvasRenderingContext2D;
  private raf = 0;
  private last = 0;
  private time = 0;
  private demoT = 0;
  private reduced = false;
  private runs: Run[] = [];
  private bg: HTMLImageElement;

  constructor(private canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) throw new Error("Canvas unavailable");
    this.ctx = ctx;
    this.reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    if (this.reduced) this.live.pace = 0.28;
    this.runs = circuit.traces.flatMap((trace, ti) => {
      const pts = trace.pts.map(([x, y]) => ({ x, y }));
      if (pts.length < 2) return [];
      const cum = [0];
      for (let i = 1; i < pts.length; i++) {
        cum.push(cum[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y));
      }
      const total = cum[cum.length - 1];
      if (total < 0.8) return [];
      return [
        {
          pts,
          cum,
          total,
          h0: trace.h0,
          hd: trace.hd,
          phase: hash(ti + 19),
          speed: 0.045 * (0.72 + hash(ti + 11) * 0.7),
          sparks: total > 95 ? 3 : total > 48 ? 2 : 1,
          reverse: hash(ti + 3) > 0.5 ? 1 : 0,
        },
      ];
    });
    this.bg = new Image();
    this.bg.src = assetUrl("circuit-bg.jpg");
    this.last = performance.now();
    this.resize();
    this.draw();
    this.didPaint = true;
    this.raf = requestAnimationFrame(this.frame);
  }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let cssW = this.canvas.clientWidth;
    let cssH = this.canvas.clientHeight;
    if (cssW < 2 || cssH < 2) {
      cssW = window.innerWidth;
      cssH = window.innerHeight;
    }
    const w = Math.max(1, Math.floor(cssW * dpr));
    const h = Math.max(1, Math.floor(cssH * dpr));
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
  }

  dispose() {
    cancelAnimationFrame(this.raf);
  }

  private frame = (now: number) => {
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    if (this.demo && !this.live.paused && document.visibilityState !== "hidden") {
      this.demoT += dt * (this.reduced ? 0.16 : 0.38);
      const a = this.demoT;
      this.target.x = Math.sin(a) * 0.92;
      this.target.y = Math.sin(a * 0.71 + 0.55) * 0.82;
    }
    const k = 1 - Math.exp(-dt * (this.reduced ? 3 : 8));
    this.tilt.x += (this.target.x - this.tilt.x) * k;
    this.tilt.y += (this.target.y - this.tilt.y) * k;
    const pace = this.reduced ? Math.min(this.live.pace, 0.35) : this.live.pace;
    if (!this.live.paused && document.visibilityState !== "hidden") this.time += dt * pace;
    this.draw();
    this.raf = requestAnimationFrame(this.frame);
  };

  private project(x: number, y: number, cssW: number, cssH: number) {
    const aspect = cssW / Math.max(1, cssH);
    const worldW = circuit.worldW;
    const worldH = circuit.worldH;
    const worldAspect = worldW / worldH;
    const viewW = aspect > worldAspect ? worldW : worldH * aspect;
    const viewH = aspect > worldAspect ? worldW / aspect : worldH;
    const ang = this.tilt.x * 0.02;
    const ca = Math.cos(ang);
    const sa = Math.sin(ang);
    let dx = x + this.tilt.x * 1.9 - worldW / 2;
    let dy = y + this.tilt.y * 1.9 - worldH / 2;
    const rx = ca * dx - sa * dy;
    const ry = sa * dx + ca * dy;
    return {
      x: (rx / viewW + 0.5) * cssW,
      y: (ry / viewH + 0.5) * cssH,
    };
  }

  private draw() {
    this.resize();
    const ctx = this.ctx;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const cssW = this.canvas.width / dpr;
    const cssH = this.canvas.height / dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = "#05060a";
    ctx.fillRect(0, 0, cssW, cssH);
    if (this.bg.complete && this.bg.naturalWidth) {
      const tl = this.project(0, 0, cssW, cssH);
      const br = this.project(circuit.worldW, circuit.worldH, cssW, cssH);
      ctx.drawImage(this.bg, tl.x, tl.y, br.x - tl.x, br.y - tl.y);
    }
    const scale = cssW / circuit.worldW;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    const duty = Math.min(0.45, Math.max(0.08, this.live.duty));
    const glow = this.live.glow;
    for (const run of this.runs) {
      const [r, g, b] = rgb(run.h0);
      ctx.beginPath();
      run.pts.forEach((p, i) => {
        const s = this.project(p.x, p.y, cssW, cssH);
        if (i === 0) ctx.moveTo(s.x, s.y);
        else ctx.lineTo(s.x, s.y);
      });
      ctx.strokeStyle = `rgba(${r},${g},${b},${0.22 * glow})`;
      ctx.lineWidth = Math.max(1.1, scale * 0.7);
      ctx.stroke();

      const head = fract(this.time * run.speed + run.phase);
      ctx.beginPath();
      const steps = Math.max(6, Math.ceil(run.total * 1.4));
      let down = false;
      for (let s = 0; s <= steps; s++) {
        const along = s / steps;
        const a = run.reverse ? 1 - along : along;
        const delta = fract(head - a * run.sparks);
        const on = delta < duty;
        const d = along * run.total;
        let i = 0;
        while (i < run.cum.length - 2 && run.cum[i + 1] < d) i++;
        const span = run.cum[i + 1] - run.cum[i] || 1;
        const t = (d - run.cum[i]) / span;
        const p0 = run.pts[i];
        const p1 = run.pts[Math.min(run.pts.length - 1, i + 1)];
        const q = this.project(p0.x + (p1.x - p0.x) * t, p0.y + (p1.y - p0.y) * t, cssW, cssH);
        if (!on) {
          down = false;
          continue;
        }
        if (!down) ctx.moveTo(q.x, q.y);
        else ctx.lineTo(q.x, q.y);
        down = true;
      }
      ctx.strokeStyle = `rgba(${r},${g},${b},${0.95 * glow})`;
      ctx.lineWidth = Math.max(1.6, scale * 1.15);
      ctx.stroke();
    }
    for (const n of circuit.nodes) {
      const s = this.project(n.x, n.y, cssW, cssH);
      const rad = Math.max(2.2, n.r * 1.35 * scale);
      const [r, g, b] = rgb(n.hue);
      ctx.beginPath();
      ctx.arc(s.x, s.y, rad, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(${r},${g},${b},${0.85 * glow})`;
      ctx.lineWidth = Math.max(1, rad * 0.18);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(s.x, s.y, rad * 0.28, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${r},${g},${b},${0.95 * glow})`;
      ctx.fill();
    }
  }
}
