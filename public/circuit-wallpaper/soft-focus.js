/* Slow hunt between f/3.5 and f/6. One quadrant snaps sharp, 20% of the time. */
window.createWallpaperFocus = function createWallpaperFocus(layer, readout) {
  const min = 3.5, max = 6;
  const period = 9, duty = 0.2, span = period * duty, fade = 0.4;
  const quads = [
    { name: "NW", x: 0, y: 0, w: 0.62, h: 0.62 },
    { name: "NE", x: 0.38, y: 0, w: 0.62, h: 0.62 },
    { name: "SW", x: 0, y: 0.38, w: 0.62, h: 0.62 },
    { name: "SE", x: 0.38, y: 0.38, w: 0.62, h: 0.62 }
  ];
  layer.dataset.focusMin = String(min);
  layer.dataset.focusMax = String(max);
  let clock = 0, last = null;
  let aperture = 4.6, from = aperture, to = 5.4, start = 0, duration = 14;
  let sharp, sctx, order = [], qi = 0, windowId = -1, quad = quads[0], amount = 0;

  function miss() {
    from = aperture;
    const dir = to >= from ? -1 : 1;
    let next = from + dir * (0.7 + Math.random() * 1.4);
    if (next < min || next > max) next = from - dir * (0.7 + Math.random() * 1.2);
    to = Math.max(min, Math.min(max, next));
    start = clock;
    duration = 11 + Math.random() * 9;
  }

  function nextQuad() {
    if (qi >= order.length) {
      order = [0, 1, 2, 3];
      for (let i = order.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        const swap = order[i];
        order[i] = order[j];
        order[j] = swap;
      }
      if (order[0] === quads.indexOf(quad)) order.push(order.shift());
      qi = 0;
    }
    quad = quads[order[qi++]];
  }

  function sharpAmount() {
    const local = ((clock % period) + period) % period;
    const id = Math.floor(clock / period);
    if (local < span) {
      if (id !== windowId) {
        windowId = id;
        nextQuad();
      }
      if (local < fade) return local / fade;
      if (local > span - fade) return Math.max(0, (span - local) / fade);
      return 1;
    }
    return 0;
  }

  function plate() {
    return document.getElementById("focus-plate");
  }

  function ensure() {
    const wrap = plate();
    if (!wrap || sharp) return !!wrap;
    sharp = document.createElement("canvas");
    sharp.id = "focus-sharp";
    sharp.style.cssText = "position:fixed;inset:0;width:100%;height:100%;z-index:1;pointer-events:none";
    wrap.insertAdjacentElement("afterend", sharp);
    sctx = sharp.getContext("2d");
    return true;
  }

  return {
    update(now, active) {
      if (last !== null && active !== false) clock += Math.max(0, Math.min(0.1, (now - last) / 1000));
      last = now;
      const u = Math.max(0, Math.min(1, (clock - start) / duration));
      aperture = from + (to - from) * (u * u * (3 - 2 * u));
      if (u > 0.82) miss();
      amount = sharpAmount();
      const wrap = plate();
      if (wrap) {
        const coc = 9.5 / aperture;
        wrap.style.filter = `blur(${coc.toFixed(3)}px) contrast(1.08) saturate(1.06)`;
      }
      if (readout) readout.value = amount > 0.04 ? `f/${aperture.toFixed(2)} · ${quad.name}` : `f/${aperture.toFixed(2)}`;
      return aperture;
    },
    paint(source) {
      if (!source || !source.width || !ensure()) return;
      const w = source.width, h = source.height;
      if (sharp.width !== w || sharp.height !== h) {
        sharp.width = w;
        sharp.height = h;
      }
      sctx.setTransform(1, 0, 0, 1, 0, 0);
      sctx.clearRect(0, 0, w, h);
      if (amount < 0.02) return;
      sctx.drawImage(source, 0, 0);
      sctx.globalCompositeOperation = "destination-in";
      const cx = (quad.x + quad.w / 2) * w;
      const cy = (quad.y + quad.h / 2) * h;
      sctx.save();
      sctx.translate(cx, cy);
      sctx.scale(quad.w * w * 0.5, quad.h * h * 0.5);
      const g = sctx.createRadialGradient(0, 0, 0.2, 0, 0, 1);
      g.addColorStop(0, `rgba(0,0,0,${amount})`);
      g.addColorStop(0.62, `rgba(0,0,0,${amount})`);
      g.addColorStop(1, "rgba(0,0,0,0)");
      sctx.fillStyle = g;
      sctx.fillRect(-1.3, -1.3, 2.6, 2.6);
      sctx.restore();
      sctx.globalCompositeOperation = "source-over";
    }
  };
};
