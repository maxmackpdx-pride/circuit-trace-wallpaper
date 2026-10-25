/* Soft focus sits on the 2D plate, never on the WebGL canvas. iOS paints WebGL black under a CSS filter. */
window.createWallpaperFocus = function createWallpaperFocus(layer, readout) {
  const min = 1.0, max = 1.6;
  let clock = 0, last = null, start = 0, duration = 18;
  let from = 1.3, to = min + Math.random() * (max - min), aperture = from;
  let appliedAt = -Infinity;
  layer.dataset.focusMin = String(min);
  layer.dataset.focusMax = String(max);
  const target = () => document.getElementById("focus-plate") || layer;
  return {
    update(now, active) {
      if (last !== null && active) clock += Math.max(0, Math.min(0.1, (now - last) / 1000));
      last = now;
      if (!active) return aperture;
      const u = Math.max(0, Math.min(1, (clock - start) / duration));
      const eased = u * u * u * (u * (u * 6 - 15) + 10);
      aperture = from + (to - from) * eased;
      if (u >= 1) {
        from = to;
        to = min + Math.random() * (max - min);
        if (Math.abs(to - from) < 0.17) {
          to = from > 1.3 ? min + Math.random() * 0.15 : 1.45 + Math.random() * 0.15;
        }
        start = clock + 1 + Math.random() * 2;
        duration = 16 + Math.random() * 12;
      }
      if (now - appliedAt >= 100) {
        const blur = (9.5 - ((aperture - min) / (max - min)) * 3.0) * 0.7225;
        target().style.filter = `blur(${blur.toFixed(3)}px)`;
        if (readout) readout.value = `f/${aperture.toFixed(2)}`;
        appliedAt = now;
      }
      return aperture;
    }
  };
};
