import * as THREE from "three";

/**
 * Procedural arcane sigils rendered into one 8x8 texture atlas.
 * Every cell is drawn from a seeded generator, so the set is stable across
 * reloads while still looking hand-inscribed.
 */

export const RUNE_NAMES = [
  "FEHU",
  "URUZ",
  "THURISAZ",
  "ANSUZ",
  "RAIDHO",
  "KENAZ",
  "GEBO",
  "WUNJO",
  "HAGALAZ",
  "NAUTHIZ",
  "ISA",
  "JERA",
  "EIHWAZ",
  "PERTHRO",
  "ALGIZ",
  "SOWILO",
  "TIWAZ",
  "BERKANO",
  "EHWAZ",
  "MANNAZ",
  "LAGUZ",
  "INGWAZ",
  "DAGAZ",
  "OTHALA",
  "ARIES",
  "TAURUS",
  "GEMINI",
  "CANCER",
  "LEO",
  "VIRGO",
  "LIBRA",
  "SCORPIO",
  "SAGITTARIUS",
  "CAPRICORN",
  "AQUARIUS",
  "PISCES",
  "SUN",
  "MOON",
  "MERCURY",
  "VENUS",
  "EARTH",
  "MARS",
  "JUPITER",
  "SATURN",
  "URANUS",
  "NEPTUNE",
  "ASTER",
  "SEAL",
  "NODE",
  "ECLIPSE",
  "VEIL",
  "CHOIR",
  "ORACLE",
  "HEX",
  "PRISM",
  "ECHO",
  "FLUX",
  "AETHER",
  "UMBRA",
  "PULSE",
  "CROWN",
  "ABYSS",
  "SPARK",
  "HALO",
];

export const GLYPH_SYMBOLS = [
  "ᚠ", "ᚢ", "ᚦ", "ᚨ", "ᚱ", "ᚲ", "ᚷ", "ᚹ",
  "ᚺ", "ᚾ", "ᛁ", "ᛃ", "ᛈ", "ᛉ", "ᛊ", "ᛏ",
  "ᛒ", "ᛖ", "ᛗ", "ᛚ", "ᛜ", "ᛞ", "ᛟ", "ᛥ",
  "♈", "♉", "♊", "♋", "♌", "♍", "♎", "♏",
  "♐", "♑", "♒", "♓", "☉", "☽", "☿", "♀",
  "♁", "♂", "♃", "♄", "♅", "♆", "✶", "✷",
  "✸", "✹", "✺", "✻", "✼", "✽", "✾", "❂",
  "❉", "❊", "❋", "✜", "✛", "✙", "✚", "⍟",
];

export const GLYPH_CELLS = 8;
export const GLYPH_COUNT = GLYPH_CELLS * GLYPH_CELLS;
const CELL_PX = 256;

const SYMBOL_FONT =
  '"Noto Sans", "Segoe UI Symbol", "Apple Symbols", "DejaVu Sans", "Symbola", serif';

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface SigilOptions {
  color: string;
  glyph?: string;
  glow?: number;
  alpha?: number;
  glyphScale?: number;
}

/** Draw a single circular sigil with a stable, seeded composition. */
export function drawSigil(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  radius: number,
  seed: number,
  options: SigilOptions,
): void {
  const rng = mulberry32(seed * 9301 + 49297);
  const { color, glyph, glow = radius * 0.14, alpha = 1, glyphScale = 0.62 } = options;

  ctx.save();
  ctx.translate(cx, cy);

  // Respect any opacity the caller already established on the context.
  const inheritedAlpha = ctx.globalAlpha;
  const effectiveAlpha = alpha * inheritedAlpha;

  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.globalAlpha = effectiveAlpha;
  ctx.shadowColor = color;
  ctx.shadowBlur = glow;

  const lw = Math.max(1.1, radius * 0.035);
  const frameAlpha = effectiveAlpha * 0.56;

  // Broken outer ward rings.
  ctx.globalAlpha = frameAlpha;
  const ringCount = 1 + Math.floor(rng() * 2);
  for (let i = 0; i < ringCount; i++) {
    const rr = radius * (0.94 - i * 0.075);
    const start = rng() * Math.PI * 2;
    const sweep = Math.PI * (0.62 + rng() * 1.05);
    ctx.lineWidth = lw * (i === 0 ? 1.15 : 0.8);
    ctx.beginPath();
    ctx.arc(0, 0, rr, start, start + sweep);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, 0, rr, start + sweep + 0.16, start + Math.PI * 2 - 0.1);
    ctx.stroke();
  }

  // Cardinal ticks.
  const ticks = 4 + Math.floor(rng() * 8);
  ctx.lineWidth = lw * 0.7;
  ctx.globalAlpha = frameAlpha * 0.8;
  for (let i = 0; i < ticks; i++) {
    const a = (i / ticks) * Math.PI * 2 + rng() * 0.06;
    const inner = radius * (0.77 + rng() * 0.05);
    const outer = radius * (0.86 + rng() * 0.04);
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * inner, Math.sin(a) * inner);
    ctx.lineTo(Math.cos(a) * outer, Math.sin(a) * outer);
    ctx.stroke();
  }

  // Inner polygon.
  const sides = 3 + Math.floor(rng() * 5);
  const polyR = radius * (0.47 + rng() * 0.11);
  const rot = rng() * Math.PI * 2;
  const points: Array<[number, number]> = [];
  ctx.globalAlpha = frameAlpha;
  for (let i = 0; i < sides; i++) {
    const a = rot + (i / sides) * Math.PI * 2;
    points.push([Math.cos(a) * polyR, Math.sin(a) * polyR]);
  }
  ctx.lineWidth = lw * 0.85;
  ctx.beginPath();
  points.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
  ctx.closePath();
  ctx.stroke();

  // Chords and spokes.
  const chords = 1 + Math.floor(rng() * 3);
  for (let i = 0; i < chords; i++) {
    const a = points[Math.floor(rng() * points.length)];
    const b = points[Math.floor(rng() * points.length)];
    if (a === b) continue;
    ctx.globalAlpha = effectiveAlpha * (0.35 + rng() * 0.4);
    ctx.beginPath();
    ctx.moveTo(a[0], a[1]);
    ctx.lineTo(b[0], b[1]);
    ctx.stroke();
  }
  ctx.globalAlpha = effectiveAlpha;

  // A few free strokes around the core.
  const strokes = 2 + Math.floor(rng() * 3);
  for (let i = 0; i < strokes; i++) {
    const a0 = rng() * Math.PI * 2;
    const len = radius * (0.1 + rng() * 0.2);
    const r0 = radius * (0.5 + rng() * 0.18);
    ctx.globalAlpha = effectiveAlpha * 0.55;
    ctx.lineWidth = lw * 0.65;
    ctx.beginPath();
    ctx.moveTo(Math.cos(a0) * r0, Math.sin(a0) * r0);
    ctx.lineTo(Math.cos(a0) * (r0 - len), Math.sin(a0) * (r0 - len));
    ctx.stroke();
  }
  ctx.globalAlpha = effectiveAlpha;

  // Orbital dots.
  const dots = 2 + Math.floor(rng() * 4);
  for (let i = 0; i < dots; i++) {
    const a = rng() * Math.PI * 2;
    const r = radius * (0.58 + rng() * 0.3);
    ctx.beginPath();
    ctx.arc(Math.cos(a) * r, Math.sin(a) * r, lw * 0.9, 0, Math.PI * 2);
    ctx.fill();
  }

  // Central sign.
  if (glyph) {
    ctx.font = `600 ${Math.round(radius * glyphScale)}px ${SYMBOL_FONT}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.globalAlpha = effectiveAlpha;
    ctx.shadowBlur = glow * 2.0;
    ctx.fillText(glyph, 0, radius * 0.025);
    ctx.shadowBlur = glow * 0.6;
    ctx.lineWidth = lw * 0.45;
    ctx.strokeText(glyph, 0, radius * 0.025);
  } else {
    // Pure geometry fallback: a vertical axis and crossbar.
    ctx.lineWidth = lw;
    ctx.beginPath();
    ctx.moveTo(0, -polyR * 0.6);
    ctx.lineTo(0, polyR * 0.6);
    ctx.moveTo(-polyR * 0.35, 0);
    ctx.lineTo(polyR * 0.35, 0);
    ctx.stroke();
  }

  ctx.restore();
}

export function createGlyphAtlas(): THREE.CanvasTexture {
  const size = CELL_PX * GLYPH_CELLS;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2D canvas is unavailable");

  ctx.clearRect(0, 0, size, size);

  for (let i = 0; i < GLYPH_COUNT; i++) {
    const col = i % GLYPH_CELLS;
    const row = Math.floor(i / GLYPH_CELLS);
    const cx = col * CELL_PX + CELL_PX / 2;
    const cy = row * CELL_PX + CELL_PX / 2;
    const radius = CELL_PX * 0.395;

    const tint = i % 7 === 0 ? "rgba(255,255,255,0.86)" : "#ffffff";
    drawSigil(ctx, cx, cy, radius, i + 11, {
      color: tint,
      glyph: GLYPH_SYMBOLS[i],
      glow: radius * 0.18,
      glyphScale: 1.0,
    });
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.NoColorSpace;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  return texture;
}

/** Draw a ring of runes used by the backdrop sigil. */
export function drawRuneRing(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  radius: number,
  count: number,
  color: string,
  seed = 1,
  rotation = 0,
): void {
  for (let i = 0; i < count; i++) {
    const a = rotation + (i / count) * Math.PI * 2;
    const x = cx + Math.cos(a) * radius;
    const y = cy + Math.sin(a) * radius;
    const symbol = GLYPH_SYMBOLS[(i + seed * 7) % GLYPH_SYMBOLS.length];
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(a + Math.PI / 2);
    drawSigil(ctx, 0, 0, Math.min(42, (radius * Math.PI * 2) / count / 2.1), seed + i, {
      color,
      glyph: symbol,
      glow: 9,
      glyphScale: 0.72,
    });
    ctx.restore();
  }
}
