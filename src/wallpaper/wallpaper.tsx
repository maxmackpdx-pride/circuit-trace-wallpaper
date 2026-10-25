import { useEffect, useRef, useState } from "react";
import { TraceEngine } from "./engine";
import { FlatEngine } from "./flat";

type Settings = { duty: number; pace: number; glow: number };

const KEY = "trace-settings";

function clamp(n: number, a: number, b: number) {
  return Math.min(b, Math.max(a, n));
}

function loadSettings(): Settings {
  const fallback = { duty: 0.22, pace: 1, glow: 1 };
  if (typeof window === "undefined") return fallback;
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || "");
    return {
      duty: clamp(Number(raw.duty) || fallback.duty, 0.15, 0.3),
      pace: clamp(Number(raw.pace) || fallback.pace, 0.35, 1.8),
      glow: clamp(Number(raw.glow) || fallback.glow, 0.55, 1.55),
    };
  } catch {
    return fallback;
  }
}

function mapAxes(beta: number, gamma: number) {
  const angle = window.screen?.orientation?.angle ?? 0;
  if (angle === 90) return { x: beta, y: -gamma };
  if (angle === 270 || angle === -90) return { x: -beta, y: gamma };
  if (angle === 180) return { x: -gamma, y: -beta };
  return { x: gamma, y: beta };
}

export function Wallpaper() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const flatRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<TraceEngine | FlatEngine | null>(null);
  const [settings, setSettings] = useState<Settings>({ duty: 0.22, pace: 1, glow: 1 });
  const [open, setOpen] = useState(false);
  const [hint, setHint] = useState(true);
  const [failed, setFailed] = useState<string | null>(null);
  const [shown, setShown] = useState(false);
  const [flat, setFlat] = useState(false);
  const [tiltOn, setTiltOn] = useState(false);
  const [demo, setDemo] = useState(true);
  const gyroAt = useRef(0);
  const base = useRef<{ b: number; g: number } | null>(null);
  const listening = useRef(false);
  const tiltNoted = useRef(false);

  useEffect(() => {
    const stored = loadSettings();
    setSettings(stored);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let engine: TraceEngine | FlatEngine | null = null;
    let bootRaf = 0;
    let dead = false;

    const onOri = (e: DeviceOrientationEvent) => {
      if (!engine || e.beta == null || e.gamma == null) return;
      if (!base.current) base.current = { b: e.beta, g: e.gamma };
      const mapped = mapAxes(e.beta - base.current.b, e.gamma - base.current.g);
      engine.target.x = clamp(mapped.x / 28, -1, 1);
      engine.target.y = clamp(mapped.y / 28, -1, 1);
      if (engine.demo && Math.hypot(engine.target.x, engine.target.y) > 0.22) {
        engine.demo = false;
        setDemo(false);
      }
      gyroAt.current = performance.now();
      if (!tiltNoted.current) {
        tiltNoted.current = true;
        setTiltOn(true);
      }
    };

    const onMove = (e: PointerEvent) => {
      if (!engine || e.pointerType !== "mouse" || engine.demo) return;
      if (performance.now() - gyroAt.current < 600) return;
      const r = canvas.getBoundingClientRect();
      engine.target.x = clamp(((e.clientX - r.left) / r.width - 0.5) * 1.5, -1, 1);
      engine.target.y = clamp(((e.clientY - r.top) / r.height - 0.5) * 1.5, -1, 1);
    };

    const onResize = () => engine?.resize();

    const start = () => {
      if (dead) return;
      const canvas = canvasRef.current;
      const flatCanvas = flatRef.current;
      if (!canvas || !flatCanvas) return;
      const w = canvas.clientWidth || window.innerWidth;
      const h = canvas.clientHeight || window.innerHeight;
      if (w < 2 || h < 2) {
        bootRaf = requestAnimationFrame(start);
        return;
      }
      let next: TraceEngine | FlatEngine | null = null;
      try {
        const gl = new TraceEngine(canvas);
        if (gl.failMessage || !gl.didPaint) {
          gl.dispose();
          throw new Error(gl.failMessage || "WebGL drew nothing");
        }
        gl.onLost = () => {
          const live = { ...gl.live };
          const demoOn = gl.demo;
          gl.dispose();
          const board = flatRef.current;
          if (!board || dead) return;
          const flatEngine = new FlatEngine(board);
          flatEngine.live = live;
          flatEngine.demo = demoOn;
          engine = flatEngine;
          engineRef.current = flatEngine;
          setFlat(true);
          setShown(true);
        };
        next = gl;
      } catch {
        try {
          next = new FlatEngine(flatCanvas);
          setFlat(true);
        } catch (err) {
          setFailed(err instanceof Error ? err.message : "This wallpaper could not start.");
          return;
        }
      }
      engine = next;
      engine.onReady = () => setShown(true);
      if (engine.failMessage) setFailed(engine.failMessage);
      else setShown(true);
      engine.live = { ...engine.live, ...settings };
      engineRef.current = engine;
    };

    if (!listening.current) {
      listening.current = true;
      window.addEventListener("deviceorientation", onOri);
    }
    window.addEventListener("pointermove", onMove);
    window.addEventListener("resize", onResize);
    const hintTimer = window.setTimeout(() => setHint(false), 4200);
    start();

    return () => {
      dead = true;
      cancelAnimationFrame(bootRaf);
      window.clearTimeout(hintTimer);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("deviceorientation", onOri);
      listening.current = false;
      engine?.dispose();
      engineRef.current = null;
    };
    // settings applied by the effect below; engine is created once
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const skipSave = useRef(true);
  useEffect(() => {
    const engine = engineRef.current;
    if (engine) {
      engine.live.duty = settings.duty;
      engine.live.pace = settings.pace;
      engine.live.glow = settings.glow;
    }
    if (skipSave.current) {
      skipSave.current = false;
      return;
    }
    localStorage.setItem(KEY, JSON.stringify(settings));
  }, [settings]);

  useEffect(() => {
    const engine = engineRef.current;
    if (engine) engine.demo = demo;
  }, [demo]);

  function takeOver() {
    const engine = engineRef.current;
    if (!engine?.demo) return;
    engine.demo = false;
    setDemo(false);
  }

  async function enableTilt() {
    const DOE = DeviceOrientationEvent as unknown as {
      requestPermission?: () => Promise<string>;
    };
    if (typeof DOE.requestPermission === "function") {
      try {
        const result = await DOE.requestPermission();
        if (result !== "granted") return;
      } catch {
        return;
      }
    }
    base.current = null;
    setTiltOn(true);
  }

  const drag = useRef<{ x: number; y: number; moved: boolean } | null>(null);

  return (
    <main className="wall">
      <img className="under" src="/circuit-bg.jpg" alt="" />
      <canvas ref={flatRef} className={flat && !failed ? "is-live" : "is-booting"} aria-hidden="true" />
      <canvas
        ref={canvasRef}
        className={!flat && shown && !failed ? "is-live" : "is-booting"}
        aria-hidden="true"
        onPointerDown={(e) => {
          if ((e.target as HTMLElement).closest(".panel, .mark")) return;
          drag.current = { x: e.clientX, y: e.clientY, moved: false };
        }}
        onPointerMove={(e) => {
          const d = drag.current;
          if (!d || performance.now() - gyroAt.current < 600) return;
          const dx = e.clientX - d.x;
          const dy = e.clientY - d.y;
          if (Math.hypot(dx, dy) > 8) {
            d.moved = true;
            takeOver();
          }
          const engine = engineRef.current;
          if (!engine) return;
          engine.target.x = clamp(dx / 100, -1, 1);
          engine.target.y = clamp(dy / 120, -1, 1);
        }}
        onPointerUp={() => {
          const d = drag.current;
          drag.current = null;
          if (!d) return;
          if (!d.moved) {
            setOpen((v) => !v);
            setHint(false);
          } else if (performance.now() - gyroAt.current >= 600) {
            const engine = engineRef.current;
            if (engine) {
              engine.target.x = 0;
              engine.target.y = 0;
            }
          }
        }}
        onPointerCancel={() => {
          drag.current = null;
        }}
      />
      {failed ? <p className="hint">{failed}</p> : null}
      <div className="hud">
        <button type="button" className="mark" onClick={() => setOpen((v) => !v)}>
          TRACE
        </button>
        <p className={hint && !open ? "hint" : "hint is-gone"}>
          {demo
            ? "Demo is running. Drag the board, or tilt the phone, to take the light."
            : "Tilt the phone. The light runs downhill along the traces."}
        </p>
        {open ? (
          <section className="panel" aria-label="Wallpaper controls">
            <div className="panel-head">
              <h2>TRACE</h2>
              <div className="lit-readout">{Math.round(settings.duty * 100)}% lit</div>
            </div>
            <label className="row">
              <span>Lit</span>
              <input
                className="trace-slider"
                type="range"
                min={15}
                max={30}
                step={1}
                value={Math.round(settings.duty * 100)}
                aria-valuetext={`${Math.round(settings.duty * 100)} percent of each line`}
                onChange={(e) =>
                  setSettings((s) => ({ ...s, duty: Number(e.target.value) / 100 }))
                }
              />
            </label>
            <label className="row">
              <span>Pace</span>
              <input
                className="trace-slider"
                type="range"
                min={35}
                max={180}
                step={1}
                value={Math.round(settings.pace * 100)}
                onChange={(e) => setSettings((s) => ({ ...s, pace: Number(e.target.value) / 100 }))}
              />
            </label>
            <label className="row">
              <span>Glow</span>
              <input
                className="trace-slider"
                type="range"
                min={55}
                max={155}
                step={1}
                value={Math.round(settings.glow * 100)}
                onChange={(e) => setSettings((s) => ({ ...s, glow: Number(e.target.value) / 100 }))}
              />
            </label>
            <div className="actions">
              <button
                type="button"
                className={demo ? "is-on" : ""}
                onClick={() => setDemo((v) => !v)}
              >
                {demo ? "Demo on" : "Play demo"}
              </button>
              <button type="button" className={tiltOn ? "is-on" : ""} onClick={() => void enableTilt()}>
                {tiltOn ? "Tilt on · relevel" : "Use phone tilt"}
              </button>
              <button type="button" onClick={() => setOpen(false)}>
                Hide
              </button>
            </div>
          </section>
        ) : null}
      </div>
    </main>
  );
}
