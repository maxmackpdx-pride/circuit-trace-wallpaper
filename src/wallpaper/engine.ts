import { circuit } from "./circuit";
import { previewPathPrefix } from "@/lib/preview-path-prefix";

export type WallpaperLive = {
  duty: number;
  pace: number;
  glow: number;
  paused: boolean;
};

type Pt = { x: number; y: number };

const BG_VS = `#version 300 es
precision highp float;
layout(location=0) in vec2 aNdc;
uniform vec4 uView;
uniform vec2 uTilt;
uniform vec2 uWorld;
out vec2 vUv;
out vec2 vNdc;
void main() {
  vec2 halfv = uView.zw * 0.5;
  vec2 world = vec2(
    uView.x + aNdc.x * (halfv.x + 8.0),
    uView.y - aNdc.y * (halfv.y + 8.0)
  );
  float ang = uTilt.x * 0.02;
  float ca = cos(ang), sa = sin(ang);
  vec2 shifted = world + uTilt * 0.7;
  vec2 d = shifted - uView.xy;
  d = vec2(ca * d.x - sa * d.y, sa * d.x + ca * d.y);
  gl_Position = vec4(d.x / halfv.x, -d.y / halfv.y, 0.0, 1.0);
  vUv = vec2(world.x / uWorld.x, world.y / uWorld.y);
  vNdc = aNdc;
}`;

const BG_FS = `#version 300 es
precision highp float;
uniform sampler2D uBg;
in vec2 vUv;
in vec2 vNdc;
out vec4 frag;
void main() {
  vec2 uv = clamp(vUv, 0.002, 0.998);
  vec3 tex = texture(uBg, uv).rgb;
  float vig = smoothstep(1.25, 0.28, length(vNdc));
  tex *= mix(0.62, 1.0, vig);
  float g = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
  tex += (g - 0.5) * 0.012;
  frag = vec4(tex, 1.0);
}`;

const TRACE_VS = `#version 300 es
precision highp float;
layout(location=0) in vec2 aPos;
layout(location=1) in float aSide;
layout(location=2) in float aAlong;
layout(location=3) in vec2 aCenter;
layout(location=4) in float aPhase;
layout(location=5) in float aSpeed;
layout(location=6) in float aSparks;
layout(location=7) in float aReverse;
layout(location=8) in float aHue0;
layout(location=9) in float aHueDelta;
layout(location=10) in vec2 aDir;
uniform vec4 uView;
uniform vec2 uTilt;
out vec4 vA;
out vec4 vB;
out vec4 vC;
void main() {
  vec2 halfv = uView.zw * 0.5;
  float ang = uTilt.x * 0.02;
  float ca = cos(ang), sa = sin(ang);
  vec2 shifted = aPos + uTilt * 1.9;
  vec2 d = shifted - uView.xy;
  d = vec2(ca * d.x - sa * d.y, sa * d.x + ca * d.y);
  gl_Position = vec4(d.x / halfv.x, -d.y / halfv.y, 0.0, 1.0);
  vA = vec4(aSide, aAlong, aPhase, aSpeed);
  vB = vec4(aSparks, aReverse, aHue0, aHueDelta);
  vC = vec4(aCenter, aDir);
}`;

const TRACE_FS = `#version 300 es
precision highp float;
in vec4 vA;
in vec4 vB;
in vec4 vC;
uniform float uTime;
uniform float uDuty;
uniform float uGlow;
uniform vec2 uTilt;
uniform vec4 uView;
out vec4 frag;

vec3 hsv2rgb(vec3 c) {
  vec3 p = abs(fract(c.xxx + vec3(0.0, 0.6666667, 0.3333333)) * 6.0 - 3.0);
  return c.z * mix(vec3(1.0), clamp(p - 1.0, 0.0, 1.0), c.y);
}

void main() {
  float vSide = vA.x;
  float vAlong = vA.y;
  float vPhase = vA.z;
  float vSpeed = vA.w;
  float vSparks = vB.x;
  float vReverse = vB.y;
  float vHue0 = vB.z;
  float vHueDelta = vB.w;
  vec2 vCenter = vC.xy;
  vec2 vDir = vC.zw;
  float along = vReverse > 0.5 ? 1.0 - vAlong : vAlong;
  float align = dot(vDir, uTilt);
  float spd = abs(vSpeed) * max(0.35, 1.0 + align);
  float head = fract(uTime * spd + vPhase + align * 0.06);
  float delta = fract(head - along * vSparks);
  float duty = clamp(uDuty, 0.08, 0.45);
  float window = delta < duty ? pow(clamp(1.0 - delta / duty, 0.0, 1.0), 1.2) : 0.0;
  float hot = exp(-delta * delta / max(duty * duty * 0.01, 1e-4));
  float light = window * 0.82 + hot * 1.15;
  float ghost = 0.16 * uGlow;
  float sd = abs(vSide);
  float core = smoothstep(0.18, 0.0, sd);
  float glow = exp(-sd * sd * 2.45);
  float beam = core * 1.25 + glow * 0.7;
  float hue = fract(vHue0 + vHueDelta * vAlong);
  vec3 rgb = hsv2rgb(vec3(hue, 0.9, 1.0));
  vec3 col = mix(rgb, vec3(0.82, 0.95, 1.0), clamp(hot * core, 0.0, 0.8));
  vec2 rel = (vCenter - uView.xy) / uView.zw;
  float down = dot(rel, uTilt);
  float intensity = beam * (light * (1.0 + down * 0.75) + ghost) * uGlow;
  if (intensity < 0.003) discard;
  frag = vec4(col * intensity, 1.0);
}`;

const NODE_VS = `#version 300 es
precision highp float;
layout(location=0) in vec2 aCorner;
layout(location=1) in vec2 iPos;
layout(location=2) in vec4 iLook;
layout(location=3) in vec4 iRun;
layout(location=4) in vec4 iRun2;
layout(location=5) in float iReverse2;
uniform vec4 uView;
uniform vec2 uTilt;
out vec4 vP;
out vec4 vQ;
out vec4 vR;
out vec3 vS;
void main() {
  vec2 halfv = uView.zw * 0.5;
  float ang = uTilt.x * 0.02;
  float ca = cos(ang), sa = sin(ang);
  float rad = max(iLook.x, 0.42) * 1.35;
  vec2 world = iPos + aCorner * rad + uTilt * 1.9;
  vec2 d = world - uView.xy;
  d = vec2(ca * d.x - sa * d.y, sa * d.x + ca * d.y);
  gl_Position = vec4(d.x / halfv.x, -d.y / halfv.y, 0.0, 1.0);
  vec2 rel = (iPos - uView.xy) / uView.zw;
  vP = vec4(aCorner, iLook.y, iLook.z);
  vQ = vec4(iLook.w, iRun.x, iRun.y, iRun.z);
  vR = vec4(iRun.w, iRun2.xyz);
  vS = vec3(iRun2.w, iReverse2, dot(rel, uTilt));
}`;

const NODE_FS = `#version 300 es
precision highp float;
in vec4 vP;
in vec4 vQ;
in vec4 vR;
in vec3 vS;
uniform float uTime;
uniform float uGlow;
out vec4 frag;

vec3 hsv2rgb(vec3 c) {
  vec3 p = abs(fract(c.xxx + vec3(0.0, 0.6666667, 0.3333333)) * 6.0 - 3.0);
  return c.z * mix(vec3(1.0), clamp(p - 1.0, 0.0, 1.0), c.y);
}

float hit(float phase, float speed, float along, float sparks, float reverse) {
  if (sparks < 0.5) return 0.0;
  float a = reverse > 0.5 ? 1.0 - along : along;
  float head = fract(uTime * abs(speed) + phase);
  float delta = fract(head - a * sparks);
  return smoothstep(0.14, 0.0, delta);
}

void main() {
  vec2 vUv = vP.xy;
  float vHue = vP.z;
  float vRing = vP.w;
  float vPhase = vQ.x;
  float vSpeed = vQ.y;
  float vAlong = vQ.z;
  float vSparks = vQ.w;
  float vReverse = vR.x;
  float vPhase2 = vR.y;
  float vSpeed2 = vR.z;
  float vAlong2 = vR.w;
  float vSparks2 = vS.x;
  float vReverse2 = vS.y;
  float vDown = vS.z;
  float r = length(vUv);
  if (r > 1.0) discard;
  float core = smoothstep(0.15, 0.0, r);
  float ring = smoothstep(0.055, 0.0, abs(r - 0.36));
  float ring2 = smoothstep(0.035, 0.0, abs(r - 0.62));
  float glow = exp(-r * r * 3.4);
  vec3 body = hsv2rgb(vec3(vHue, 0.88, 1.0));
  vec3 rim = hsv2rgb(vec3(vRing, 0.95, 1.0));
  vec3 col = body * (core * 1.35 + glow * 0.42) + rim * (ring * 1.05 + ring2 * 0.62);
  float flare = max(
    hit(vPhase, vSpeed, vAlong, vSparks, vReverse),
    hit(vPhase2, vSpeed2, vAlong2, vSparks2, vReverse2)
  );
  float inten = (0.34 + flare * 1.25) * (1.0 + vDown * 0.45) * uGlow;
  frag = vec4(col * inten, 1.0);
}`;

function hash(i: number) {
  let n = Math.imul(i ^ 0x9e3779b9, 0x85ebca6b);
  n = Math.imul(n ^ (n >>> 13), 0xc2b2ae35);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}

function dist(a: Pt, b: Pt) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function roundPoly(pts: Pt[], radius: number): Pt[] {
  if (pts.length < 3) return pts;
  const out: Pt[] = [pts[0]];
  for (let i = 1; i < pts.length - 1; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    const c = pts[i + 1];
    const abx = a.x - b.x;
    const aby = a.y - b.y;
    const cbx = c.x - b.x;
    const cby = c.y - b.y;
    const lab = Math.hypot(abx, aby) || 1;
    const lcb = Math.hypot(cbx, cby) || 1;
    const r = Math.min(radius, lab * 0.42, lcb * 0.42);
    if (r < 0.25) {
      out.push(b);
      continue;
    }
    const p1 = { x: b.x + (abx / lab) * r, y: b.y + (aby / lab) * r };
    const p2 = { x: b.x + (cbx / lcb) * r, y: b.y + (cby / lcb) * r };
    out.push(p1);
    const segs = 3;
    for (let s = 1; s < segs; s++) {
      const t = s / segs;
      const u = 1 - t;
      out.push({
        x: u * u * p1.x + 2 * u * t * b.x + t * t * p2.x,
        y: u * u * p1.y + 2 * u * t * b.y + t * t * p2.y,
      });
    }
    out.push(p2);
  }
  out.push(pts[pts.length - 1]);
  return out;
}

function compile(gl: WebGL2RenderingContext, type: number, src: string, name: string) {
  const shader = gl.createShader(type);
  if (!shader) throw new Error(`${name} shader`);
  gl.shaderSource(shader, src);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader) || "empty log";
    gl.deleteShader(shader);
    throw new Error(`${name}: ${log}`);
  }
  return shader;
}

function program(gl: WebGL2RenderingContext, vs: string, fs: string, name: string) {
  const p = gl.createProgram();
  if (!p) throw new Error(name);
  const v = compile(gl, gl.VERTEX_SHADER, vs, `${name} vertex`);
  const f = compile(gl, gl.FRAGMENT_SHADER, fs, `${name} fragment`);
  gl.attachShader(p, v);
  gl.attachShader(p, f);
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
    throw new Error(`${name} link: ${gl.getProgramInfoLog(p) || "empty log"}`);
  }
  return p;
}

type Built = {
  traceVerts: Float32Array;
  traceIdx: Uint32Array;
  traceCount: number;
  nodeData: Float32Array;
  nodeCount: number;
};

function buildGeometry(): Built {
  const STRIDE = 14;
  const verts: number[] = [];
  const indices: number[] = [];
  const halfW = 0.58;

  type Conn = {
    phase: number;
    speed: number;
    along: number;
    sparks: number;
    reverse: number;
  };
  const traceMeta: Conn[] = [];
  const traceEnds: { a: Pt; b: Pt }[] = [];

  circuit.traces.forEach((trace, ti) => {
    let pts: Pt[] = trace.pts.map(([x, y]) => ({ x, y }));
    const cleaned: Pt[] = [];
    for (const p of pts) {
      const last = cleaned[cleaned.length - 1];
      if (!last || dist(last, p) > 0.12) cleaned.push(p);
    }
    pts = roundPoly(cleaned, 0.7);
    if (pts.length < 2) return;
    let total = 0;
    const seg: number[] = [];
    for (let i = 0; i < pts.length - 1; i++) {
      const L = dist(pts[i], pts[i + 1]);
      seg.push(L);
      total += L;
    }
    if (total < 0.8) return;

    const h = hash(ti + 3);
    const reverse = h > 0.5 ? 1 : 0;
    const speed = 0.045 * (0.72 + hash(ti + 11) * 0.7);
    const phase = hash(ti + 19);
    const sparks = total > 95 ? 3 : total > 48 ? 2 : 1;
    const dirx = pts[pts.length - 1].x - pts[0].x;
    const diry = pts[pts.length - 1].y - pts[0].y;
    const dl = Math.hypot(dirx, diry) || 1;
    const travelX = (reverse ? -dirx : dirx) / dl;
    const travelY = (reverse ? -diry : diry) / dl;
    traceMeta.push({ phase, speed, along: 0, sparks, reverse });
    traceEnds.push({ a: pts[0], b: pts[pts.length - 1] });

    let acc = 0;
    let prevNx = 0;
    let prevNy = 0;
    let hasPrev = false;
    for (let i = 0; i < pts.length; i++) {
      const curr = pts[i];
      const prev = pts[Math.max(0, i - 1)];
      const next = pts[Math.min(pts.length - 1, i + 1)];
      let tx: number;
      let ty: number;
      if (i === 0) {
        tx = next.x - curr.x;
        ty = next.y - curr.y;
      } else if (i === pts.length - 1) {
        tx = curr.x - prev.x;
        ty = curr.y - prev.y;
      } else {
        const dx1 = curr.x - prev.x;
        const dy1 = curr.y - prev.y;
        const dx2 = next.x - curr.x;
        const dy2 = next.y - curr.y;
        const l1 = Math.hypot(dx1, dy1) || 1;
        const l2 = Math.hypot(dx2, dy2) || 1;
        tx = dx1 / l1 + dx2 / l2;
        ty = dy1 / l1 + dy2 / l2;
      }
      const tl = Math.hypot(tx, ty) || 1;
      tx /= tl;
      ty /= tl;
      let nx = -ty;
      let ny = tx;
      if (hasPrev && nx * prevNx + ny * prevNy < 0) {
        nx = -nx;
        ny = -ny;
      }
      let scale = 1;
      if (i > 0 && i < pts.length - 1) {
        const dx1 = curr.x - prev.x;
        const dy1 = curr.y - prev.y;
        const l1 = Math.hypot(dx1, dy1) || 1;
        let n1x = -dy1 / l1;
        let n1y = dx1 / l1;
        if (n1x * nx + n1y * ny < 0) {
          n1x = -n1x;
          n1y = -n1y;
        }
        const d = nx * n1x + ny * n1y;
        scale = Math.min(2.15, 1 / Math.max(0.42, d));
      }
      prevNx = nx;
      prevNy = ny;
      hasPrev = true;
      const along = total > 0 ? acc / total : 0;
      if (i < seg.length) acc += seg[i];
      const ox = nx * halfW * scale;
      const oy = ny * halfW * scale;
      const push = (side: number, x: number, y: number) => {
        verts.push(
          x,
          y,
          side,
          along,
          curr.x,
          curr.y,
          phase,
          speed,
          sparks,
          reverse,
          trace.h0,
          trace.hd,
          travelX,
          travelY,
        );
      };
      // one vertex
      push(1, curr.x + ox, curr.y + oy);
      push(-1, curr.x - ox, curr.y - oy);
    }
    const vertCount = pts.length * 2;
    const start = verts.length / STRIDE - vertCount;
    for (let i = 0; i < pts.length - 1; i++) {
      const a = start + i * 2;
      indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  });

  if (verts.length % 14 !== 0) {
    throw new Error("trace vertex stride mismatch");
  }

  const nodeFloats: number[] = [];
  const links: Conn[][] = circuit.nodes.map(() => []);
  traceEnds.forEach((ends, ti) => {
    const meta = traceMeta[ti];
    ([
      [ends.a, 0],
      [ends.b, 1],
    ] as const).forEach(([pt, along]) => {
      let best = -1;
      let bd = 3.1;
      circuit.nodes.forEach((n, ni) => {
        const d = Math.hypot(n.x - pt.x, n.y - pt.y);
        if (d < bd) {
          bd = d;
          best = ni;
        }
      });
      if (best >= 0 && links[best].length < 2) {
        links[best].push({ ...meta, along });
      }
    });
  });

  const empty: Conn = { phase: 0, speed: 0, along: 0, sparks: 0, reverse: 0 };
  circuit.nodes.forEach((n, i) => {
    const a = links[i][0] ?? empty;
    const b = links[i][1] ?? a;
    nodeFloats.push(
      n.x,
      n.y,
      n.r,
      n.hue,
      n.ring,
      a.phase,
      a.speed,
      a.along,
      a.sparks,
      a.reverse,
      b.phase,
      b.speed,
      b.along,
      b.sparks,
      b.reverse,
    );
  });

  return {
    traceVerts: new Float32Array(verts),
    traceIdx: new Uint32Array(indices),
    traceCount: indices.length,
    nodeData: new Float32Array(nodeFloats),
    nodeCount: circuit.nodes.length,
  };
}

function assetUrl(file: string) {
  if (typeof window === "undefined") return `/${file}`;
  const prefix = previewPathPrefix(window.location.hostname, window.location.pathname);
  return `${prefix ?? ""}/${file}`;
}

export class TraceEngine {
  private gl: WebGL2RenderingContext;
  private raf = 0;
  private time = 0;
  private last = 0;
  private reduced = false;
  private built!: Built;
  tilt = { x: 0, y: 0 };
  target = { x: 0, y: 0 };
  /** When true, target orbits so the downhill light is visible without a gyro. */
  demo = true;
  private demoT = 0;
  didPaint = false;
  failMessage: string | null = null;
  onReady: (() => void) | null = null;
  onLost: ((message: string) => void) | null = null;
  live: WallpaperLive = { duty: 0.22, pace: 1, glow: 1, paused: false };
  private texturesReady = false;

  private bgProg!: WebGLProgram;
  private traceProg!: WebGLProgram;
  private nodeProg!: WebGLProgram;
  private bgVao!: WebGLVertexArrayObject;
  private traceVao!: WebGLVertexArrayObject;
  private nodeVao!: WebGLVertexArrayObject;
  private uBg: Record<string, WebGLUniformLocation | null> = {};
  private uTrace: Record<string, WebGLUniformLocation | null> = {};
  private uNode: Record<string, WebGLUniformLocation | null> = {};

  constructor(private canvas: HTMLCanvasElement) {
    this.resize();
    const base: WebGLContextAttributes = {
      alpha: true,
      antialias: false,
      depth: false,
      stencil: false,
      premultipliedAlpha: false,
    };
    let gl = canvas.getContext("webgl2", { ...base, powerPreference: "high-performance" });
    if (!gl) gl = canvas.getContext("webgl2", base);
    if (!gl || gl.isContextLost()) throw new Error("WebGL2 unavailable");
    this.gl = gl;
    this.reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    if (this.reduced) this.live.pace = 0.28;
    this.built = buildGeometry();
    this.bgProg = program(gl, BG_VS, BG_FS, "background");
    this.traceProg = program(gl, TRACE_VS, TRACE_FS, "trace");
    this.nodeProg = program(gl, NODE_VS, NODE_FS, "node");
    this.uBg = {
      view: gl.getUniformLocation(this.bgProg, "uView"),
      tilt: gl.getUniformLocation(this.bgProg, "uTilt"),
      world: gl.getUniformLocation(this.bgProg, "uWorld"),
      bg: gl.getUniformLocation(this.bgProg, "uBg"),
    };
    this.uTrace = {
      view: gl.getUniformLocation(this.traceProg, "uView"),
      tilt: gl.getUniformLocation(this.traceProg, "uTilt"),
      time: gl.getUniformLocation(this.traceProg, "uTime"),
      duty: gl.getUniformLocation(this.traceProg, "uDuty"),
      glow: gl.getUniformLocation(this.traceProg, "uGlow"),
    };
    this.uNode = {
      view: gl.getUniformLocation(this.nodeProg, "uView"),
      tilt: gl.getUniformLocation(this.nodeProg, "uTilt"),
      time: gl.getUniformLocation(this.nodeProg, "uTime"),
      glow: gl.getUniformLocation(this.nodeProg, "uGlow"),
    };
    this.bgVao = this.makeBg();
    this.traceVao = this.makeTraces();
    this.nodeVao = this.makeNodes();
    this.loadTexture();
    this.last = performance.now();
    try {
      this.draw();
      this.didPaint = true;
    } catch (err) {
      this.failMessage = err instanceof Error ? err.message : "Wallpaper failed to draw";
    }
    this.raf = requestAnimationFrame(this.frame);
  }

  private makeBg() {
    const gl = this.gl;
    const vao = gl.createVertexArray();
    if (!vao) throw new Error("vao");
    gl.bindVertexArray(vao);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
      gl.STATIC_DRAW,
    );
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);
    return vao;
  }

  private makeTraces() {
    const gl = this.gl;
    const vao = gl.createVertexArray();
    if (!vao) throw new Error("vao");
    gl.bindVertexArray(vao);
    const vbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, this.built.traceVerts, gl.STATIC_DRAW);
    const stride = 14 * 4;
    const layout: [number, number, number][] = [
      [0, 2, 0],
      [1, 1, 2],
      [2, 1, 3],
      [3, 2, 4],
      [4, 1, 6],
      [5, 1, 7],
      [6, 1, 8],
      [7, 1, 9],
      [8, 1, 10],
      [9, 1, 11],
      [10, 2, 12],
    ];
    for (const [loc, size, offset] of layout) {
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, size, gl.FLOAT, false, stride, offset * 4);
    }
    const ibo = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, this.built.traceIdx, gl.STATIC_DRAW);
    gl.bindVertexArray(null);
    return vao;
  }

  private makeNodes() {
    const gl = this.gl;
    const vao = gl.createVertexArray();
    if (!vao) throw new Error("vao");
    gl.bindVertexArray(vao);
    const quad = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, quad);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
      gl.STATIC_DRAW,
    );
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

    const inst = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, inst);
    gl.bufferData(gl.ARRAY_BUFFER, this.built.nodeData, gl.STATIC_DRAW);
    const stride = 15 * 4;
    const fields: [number, number, number][] = [
      [1, 2, 0],
      [2, 4, 2],
      [3, 4, 6],
      [4, 4, 10],
      [5, 1, 14],
    ];
    for (const [loc, size, offset] of fields) {
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, size, gl.FLOAT, false, stride, offset * 4);
      gl.vertexAttribDivisor(loc, 1);
    }
    gl.bindVertexArray(null);
    return vao;
  }

  private loadTexture() {
    const gl = this.gl;
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      1,
      1,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      new Uint8Array([8, 9, 12, 255]),
    );
    const img = new Image();
    img.decoding = "async";
    img.onload = () => {
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      this.texturesReady = true;
    };
    img.src = assetUrl("circuit-bg.jpg");
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

  private view() {
    const aspect = this.canvas.width / Math.max(1, this.canvas.height);
    const worldW = circuit.worldW;
    const worldH = circuit.worldH;
    const worldAspect = worldW / worldH;
    let viewW: number;
    let viewH: number;
    if (aspect > worldAspect) {
      viewW = worldW;
      viewH = worldW / aspect;
    } else {
      viewH = worldH;
      viewW = worldH * aspect;
    }
    return [worldW / 2, worldH / 2, viewW, viewH] as const;
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
    if (!this.live.paused && document.visibilityState !== "hidden") {
      this.time += dt * pace;
    }
    if (this.gl.isContextLost()) {
      if (!this.failMessage) {
        this.failMessage = "Graphics context was lost. Reload to try again.";
        this.onLost?.(this.failMessage);
      }
      this.raf = requestAnimationFrame(this.frame);
      return;
    }
    try {
      this.draw();
      if (!this.didPaint) {
        this.didPaint = true;
        this.onReady?.();
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Wallpaper failed to draw";
      if (!this.failMessage) {
        this.failMessage = message;
        this.onLost?.(message);
      }
      return;
    }
    this.raf = requestAnimationFrame(this.frame);
  };

  private draw() {
    const gl = this.gl;
    this.resize();
    const [cx, cy, vw, vh] = this.view();
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.disable(gl.BLEND);
    gl.clearColor(0.02, 0.022, 0.03, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);

    gl.useProgram(this.bgProg);
    gl.uniform4f(this.uBg.view, cx, cy, vw, vh);
    gl.uniform2f(this.uBg.tilt, this.tilt.x, this.tilt.y);
    gl.uniform2f(this.uBg.world, circuit.worldW, circuit.worldH);
    gl.uniform1i(this.uBg.bg, 0);
    gl.bindVertexArray(this.bgVao);
    gl.drawArrays(gl.TRIANGLES, 0, 6);

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE);

    gl.useProgram(this.traceProg);
    gl.uniform4f(this.uTrace.view, cx, cy, vw, vh);
    gl.uniform2f(this.uTrace.tilt, this.tilt.x, this.tilt.y);
    gl.uniform1f(this.uTrace.time, this.time);
    gl.uniform1f(this.uTrace.duty, this.live.duty);
    gl.uniform1f(this.uTrace.glow, this.live.glow);
    gl.bindVertexArray(this.traceVao);
    gl.drawElements(gl.TRIANGLES, this.built.traceCount, gl.UNSIGNED_INT, 0);

    gl.useProgram(this.nodeProg);
    gl.uniform4f(this.uNode.view, cx, cy, vw, vh);
    gl.uniform2f(this.uNode.tilt, this.tilt.x, this.tilt.y);
    gl.uniform1f(this.uNode.time, this.time);
    gl.uniform1f(this.uNode.glow, this.live.glow);
    gl.bindVertexArray(this.nodeVao);
    gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, this.built.nodeCount);

    gl.bindVertexArray(null);
    void this.texturesReady;
  }

  dispose() {
    cancelAnimationFrame(this.raf);
    const gl = this.gl;
    gl.deleteProgram(this.bgProg);
    gl.deleteProgram(this.traceProg);
    gl.deleteProgram(this.nodeProg);
  }
}
