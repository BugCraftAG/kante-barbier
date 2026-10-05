// @ts-check
/**
 * Das Signet der Seite: ein "Fade" als Halbton-Raster.
 * Links stehen die Punkte dicht (lange Haare), nach rechts werden sie kleiner,
 * bis nichts mehr übrig ist – wie ein Übergang von 12 mm auf null.
 *
 * Gezeichnet auf <canvas>, damit es auf jedem Bildschirm (auch Retina) scharf ist
 * und sich bei jeder Breite neu berechnet. Kein Bild muss geladen werden.
 */

import { mulberry32 } from "./schedule.js";

const smoothstep = (/** @type {number} */ a, /** @type {number} */ b, /** @type {number} */ x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** @param {HTMLCanvasElement} canvas */
export function initFade(canvas) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  let progress = reduced ? 1 : 0;
  let raf = 0;

  function draw() {
    if (!ctx) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const { width, height } = canvas.getBoundingClientRect();
    if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) {
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);

    const color = getComputedStyle(canvas).color;
    const accent = getComputedStyle(canvas).getPropertyValue("--fade-accent").trim() || color;
    const gap = width < 600 ? 7 : 9;
    const cols = Math.ceil(width / gap);
    const rows = Math.ceil(height / gap);
    const rand = mulberry32(7);
    const cut = progress * 1.15; // Position der "Maschine"

    for (let r = 0; r < rows; r++) {
      // Versatz jeder zweiten Reihe ergibt ein Dreiecksraster – wirkt ruhiger
      const offset = r % 2 ? gap / 2 : 0;
      for (let c = 0; c < cols; c++) {
        const x = c * gap + offset;
        const y = r * gap + gap / 2;
        const u = x / width;
        const jitter = (rand() - 0.5) * 0.18;
        // Länge des "Haars" an dieser Stelle: voll links, null rechts
        let len = 1 - smoothstep(0.06, 0.94, u + jitter * 0.4);
        // noch nicht geschnittener Bereich bleibt voll
        if (u > cut) len = Math.max(len, 0.92 + jitter);
        const radius = (gap / 2) * Math.pow(Math.max(0, len), 0.85) * 0.92;
        if (radius < 0.35) continue;
        ctx.beginPath();
        ctx.fillStyle = Math.abs(u - cut) < 0.012 ? accent : color;
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  function animate(/** @type {number} */ t0) {
    const step = (/** @type {number} */ t) => {
      progress = Math.min(1, (t - t0) / 1600);
      draw();
      if (progress < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
  }

  new ResizeObserver(() => { if (progress >= 1 || reduced) draw(); }).observe(canvas);
  draw();
  if (!reduced) {
    // erst animieren, wenn das Raster sichtbar ist
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        io.disconnect();
        cancelAnimationFrame(raf);
        animate(performance.now());
      }
    });
    io.observe(canvas);
  }
}
