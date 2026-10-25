/* Optical softness at f/3.5. A wide gaussian reads as frosted glass; this is a small circle of confusion. */
window.createWallpaperFocus = function createWallpaperFocus(layer, readout) {
  const aperture = 3.5;
  layer.dataset.focusMin = "3.5";
  layer.dataset.focusMax = "3.5";
  const target = () => document.getElementById("focus-plate") || layer;
  let appliedAt = -Infinity;
  return {
    update(now) {
      if (now - appliedAt < 250) return aperture;
      const coc = 9.5 / aperture;
      target().style.filter = `blur(${coc.toFixed(3)}px) contrast(1.08) saturate(1.06)`;
      if (readout) readout.value = "f/3.50";
      appliedAt = now;
      return aperture;
    }
  };
};
