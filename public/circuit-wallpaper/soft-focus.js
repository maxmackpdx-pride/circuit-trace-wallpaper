/* Slow hunt between f/3.5 and f/6. It eases toward a stop, then gives up before it locks. */
window.createWallpaperFocus = function createWallpaperFocus(layer, readout) {
  const min = 3.5, max = 6;
  layer.dataset.focusMin = String(min);
  layer.dataset.focusMax = String(max);
  const plate = () => document.getElementById("focus-plate") || layer;
  let clock = 0, last = null, appliedAt = -Infinity;
  let aperture = 4.6, from = aperture, to = 5.4, start = 0, duration = 14;
  function miss() {
    from = aperture;
    const dir = to >= from ? -1 : 1;
    let next = from + dir * (0.7 + Math.random() * 1.4);
    if (next < min || next > max) next = from - dir * (0.7 + Math.random() * 1.2);
    to = Math.max(min, Math.min(max, next));
    start = clock;
    duration = 11 + Math.random() * 9;
  }
  return {
    update(now, active) {
      if (last !== null && active !== false) clock += Math.max(0, Math.min(0.1, (now - last) / 1000));
      last = now;
      const u = Math.max(0, Math.min(1, (clock - start) / duration));
      const eased = u * u * (3 - 2 * u);
      aperture = from + (to - from) * eased;
      if (u > 0.82) miss();
      if (now - appliedAt >= 80) {
        const coc = 9.5 / aperture;
        plate().style.filter = `blur(${coc.toFixed(3)}px) contrast(1.08) saturate(1.06)`;
        if (readout) readout.value = `f/${aperture.toFixed(2)}`;
        appliedAt = now;
      }
      return aperture;
    }
  };
};
