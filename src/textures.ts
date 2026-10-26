import * as THREE from "three";
import { drawRuneRing, drawSigil } from "./glyphs";

const CYAN = "rgba(125, 245, 255, 0.92)";
const VIOLET = "rgba(179, 140, 255, 0.62)";
const WHITE = "rgba(242, 250, 255, 0.95)";

function canvas2d(width: number, height: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2D canvas is unavailable");
  return [canvas, ctx];
}

function canvasTexture(canvas: HTMLCanvasElement, srgb = true): THREE.CanvasTexture {
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  return texture;
}

/** The opaque ritual-chamber wall. Opaque on purpose: it feeds the glass
 * transmission buffer, which is what makes the die feel genuinely refractive. */
export function createWallTexture(): THREE.CanvasTexture {
  const W = 2048;
  const H = 1152;
  const [canvas, ctx] = canvas2d(W, H);

  const base = ctx.createRadialGradient(W * 0.5, H * 0.48, 40, W * 0.5, H * 0.5, W * 0.72);
  base.addColorStop(0, "#100b26");
  base.addColorStop(0.32, "#0a0718");
  base.addColorStop(0.7, "#04030c");
  base.addColorStop(1, "#010104");
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, W, H);

  // Diffuse nebula stains.
  const stains: Array<[string, number, number, number, number, number]> = [
    ["rgba(72, 208, 255, 0.09)", 0.30, 0.30, 0.34, 0.3, 0.18],
    ["rgba(154, 92, 255, 0.10)", 0.68, 0.36, 0.40, 0.34, 0.2],
    ["rgba(255, 96, 210, 0.06)", 0.78, 0.62, 0.3, 0.26, 0.14],
    ["rgba(72, 208, 255, 0.05)", 0.16, 0.73, 0.26, 0.22, 0.12],
  ];
  for (const [color, x, y, rx, ry, alpha] of stains) {
    ctx.save();
    ctx.globalAlpha = alpha;
    const g = ctx.createRadialGradient(x * W, y * H, 0, x * W, y * H, Math.max(rx, ry) * W * 0.5);
    g.addColorStop(0, color);
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(x * W, y * H, rx * W * 0.6, ry * H, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // Luminous well directly behind the die, so its body refracts real detail.
  const well = ctx.createRadialGradient(W * 0.5, H * 0.485, 20, W * 0.5, H * 0.485, W * 0.22);
  well.addColorStop(0, "rgba(185,252,255,0.42)");
  well.addColorStop(0.28, "rgba(62,198,255,0.24)");
  well.addColorStop(0.62, "rgba(108,70,255,0.11)");
  well.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = well;
  ctx.fillRect(0, 0, W, H);

  // Faint star dust.
  let seed = 1337;
  const rnd = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  for (let i = 0; i < 260; i++) {
    const x = rnd() * W;
    const y = rnd() * H;
    const r = rnd() * 1.5 + 0.3;
    ctx.globalAlpha = 0.12 + rnd() * 0.4;
    ctx.fillStyle = rnd() > 0.72 ? "rgba(255,190,245,0.8)" : "rgba(190,225,255,0.8)";
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  // Chamber ribs: vertical light columns frame the reliquary.
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  const ribXs = [W * 0.085, W * 0.915];
  for (let i = 0; i < ribXs.length; i++) {
    const x = ribXs[i];
    const rib = ctx.createLinearGradient(x - 24, 0, x + 24, 0);
    rib.addColorStop(0, "rgba(60,200,255,0)");
    rib.addColorStop(0.5, "rgba(90,220,255,0.18)");
    rib.addColorStop(1, "rgba(60,200,255,0)");
    ctx.fillStyle = rib;
    ctx.fillRect(x - 24, H * 0.06, 48, H * 0.72);
    ctx.strokeStyle = "rgba(140,235,255,0.35)";
    ctx.shadowColor = "rgba(125,245,255,0.7)";
    ctx.shadowBlur = 12;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(x, H * 0.08);
    ctx.lineTo(x, H * 0.78);
    ctx.stroke();
    for (let k = 0; k < 12; k++) {
      const y = H * 0.1 + k * (H * 0.62) / 12;
      const long = k % 3 === 0;
      ctx.beginPath();
      ctx.moveTo(x - (long ? 13 : 6), y);
      ctx.lineTo(x + (long ? 13 : 6), y);
      ctx.stroke();
    }
  }
  ctx.restore();

  const cx = W * 0.5;
  const cy = H * 0.485;
  const R = Math.min(H * 0.16, W * 0.091);

  ctx.save();
  ctx.translate(cx, cy);
  ctx.lineCap = "round";
  ctx.shadowColor = "rgba(125,245,255,0.75)";
  ctx.shadowBlur = 26;

  // Outer ward.
  const rings = [
    { r: R * 1.02, a: 0.5, w: 3 },
    { r: R * 0.94, a: 0.22, w: 1.4 },
    { r: R * 0.78, a: 0.8, w: 2.2 },
    { r: R * 0.6, a: 0.34, w: 1.2 },
    { r: R * 0.2, a: 0.55, w: 1.2 },
  ];
  for (const ring of rings) {
    ctx.globalAlpha = ring.a;
    ctx.lineWidth = ring.w;
    ctx.strokeStyle = CYAN;
    ctx.beginPath();
    ctx.arc(0, 0, ring.r, 0, Math.PI * 2);
    ctx.stroke();
  }

  // Dashed bands with tick marks.
  ctx.strokeStyle = VIOLET;
  ctx.lineWidth = 1.4;
  ctx.setLineDash([3, 13]);
  ctx.globalAlpha = 0.65;
  ctx.beginPath();
  ctx.arc(0, 0, R * 0.87, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.globalAlpha = 0.95;
  ctx.strokeStyle = CYAN;
  for (let i = 0; i < 72; i++) {
    const a = (i / 72) * Math.PI * 2;
    const long = i % 6 === 0;
    const inner = R * (long ? 0.84 : 0.875);
    const outer = R * 0.9;
    ctx.lineWidth = long ? 2.6 : 1.2;
    ctx.globalAlpha = long ? 0.9 : 0.45;
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * inner, Math.sin(a) * inner);
    ctx.lineTo(Math.cos(a) * outer, Math.sin(a) * outer);
    ctx.stroke();
  }

  // Hexagram lattice.
  ctx.globalAlpha = 0.5;
  ctx.lineWidth = 1.6;
  ctx.strokeStyle = WHITE;
  ctx.shadowColor = "rgba(179,140,255,0.8)";
  for (const offset of [0, Math.PI / 3]) {
    ctx.beginPath();
    for (let i = 0; i < 3; i++) {
      const a = offset + (i / 3) * Math.PI * 2 - Math.PI / 2;
      const x = Math.cos(a) * R * 0.86;
      const y = Math.sin(a) * R * 0.86;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.stroke();
  }

  // Inner arcs and rays.
  ctx.globalAlpha = 0.4;
  ctx.strokeStyle = VIOLET;
  ctx.lineWidth = 1.2;
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2 + 0.12;
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * R * 0.22, Math.sin(a) * R * 0.22);
    ctx.lineTo(Math.cos(a) * R * 0.58, Math.sin(a) * R * 0.58);
    ctx.stroke();
  }
  ctx.restore();

  // Ring of engraved runes.
  ctx.save();
  ctx.shadowColor = "rgba(125,245,255,0.45)";
  ctx.shadowBlur = 14;
  ctx.globalAlpha = 0.75;
  drawRuneRing(ctx, cx, cy, R * 0.83, 30, "rgba(205,244,255,0.9)", 3, 0.02);
  ctx.restore();

  // Central oracle seal.
  ctx.save();
  ctx.globalAlpha = 0.8;
  drawSigil(ctx, cx, cy, R * 0.31, 42, {
    color: "rgba(225,250,255,0.92)",
    glyph: "✶",
    glow: 24,
    glyphScale: 0.52,
  });
  ctx.restore();

  // Inner reliquary seal, nested directly behind the glass.
  ctx.save();
  ctx.translate(cx, cy);
  ctx.globalAlpha = 0.85;
  ctx.strokeStyle = "rgba(210,250,255,0.9)";
  ctx.shadowColor = "rgba(125,245,255,0.9)";
  ctx.shadowBlur = 18;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(0, 0, R * 0.36, 0, Math.PI * 2);
  ctx.stroke();
  ctx.globalAlpha = 0.5;
  ctx.strokeStyle = "rgba(255,122,217,0.7)";
  ctx.setLineDash([4, 9]);
  ctx.beginPath();
  ctx.arc(0, 0, R * 0.29, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();

  // Corner sigils, echoing the die facets.
  const corners: Array<[number, number, number]> = [
    [W * 0.16, H * 0.2, 0.05],
    [W * 0.84, H * 0.22, 0.06],
    [W * 0.12, H * 0.8, 0.045],
    [W * 0.88, H * 0.78, 0.05],
  ];
  for (let i = 0; i < corners.length; i++) {
    const [x, y, scale] = corners[i];
    ctx.save();
    ctx.globalAlpha = 0.34;
    drawSigil(ctx, x, y, R * scale * 1.6, 120 + i, {
      color: i % 2 ? "rgba(255,122,217,0.8)" : "rgba(125,245,255,0.8)",
      glyph: i % 2 ? "♄" : "☿",
      glow: 12,
      glyphScale: 0.6,
    });
    ctx.restore();
  }

  // Subtle horizontal scanning texture in the chamber air.
  ctx.globalAlpha = 0.028;
  ctx.fillStyle = "#9fefff";
  for (let y = 0; y < H; y += 6) {
    ctx.fillRect(0, y, W, 1);
  }
  ctx.globalAlpha = 1;

  // Haze where the floor meets the chamber wall.
  const horizonHaze = ctx.createLinearGradient(0, H * 0.58, 0, H * 0.74);
  horizonHaze.addColorStop(0, "rgba(40,130,200,0)");
  horizonHaze.addColorStop(0.55, "rgba(62,168,230,0.16)");
  horizonHaze.addColorStop(1, "rgba(22,30,82,0)");
  ctx.fillStyle = horizonHaze;
  ctx.fillRect(0, H * 0.58, W, H * 0.16);

  // Floor contact shadows at the edges.
  const foot = ctx.createLinearGradient(0, H * 0.75, 0, H);
  foot.addColorStop(0, "rgba(0,0,0,0)");
  foot.addColorStop(1, "rgba(0,0,0,0.7)");
  ctx.fillStyle = foot;
  ctx.fillRect(0, H * 0.75, W, H * 0.25);

  return canvasTexture(canvas);
}

export function createFloorTexture(): THREE.CanvasTexture {
  const S = 1024;
  const [canvas, ctx] = canvas2d(S, S);

  const base = ctx.createRadialGradient(S / 2, S / 2, 20, S / 2, S / 2, S * 0.6);
  base.addColorStop(0, "#0b0a18");
  base.addColorStop(0.5, "#05040d");
  base.addColorStop(1, "#020106");
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, S, S);

  // Grid.
  ctx.strokeStyle = "rgba(125,245,255,0.10)";
  ctx.lineWidth = 1;
  for (let i = 0; i <= S; i += 32) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i, S);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, i);
    ctx.lineTo(S, i);
    ctx.stroke();
  }
  ctx.strokeStyle = "rgba(179,140,255,0.12)";
  for (let i = 0; i <= S; i += 128) {
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i, S);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, i);
    ctx.lineTo(S, i);
    ctx.stroke();
  }

  // Glowing ritual pool under the die.
  const pool = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S * 0.42);
  pool.addColorStop(0, "rgba(88,225,255,0.34)");
  pool.addColorStop(0.35, "rgba(73,120,255,0.15)");
  pool.addColorStop(0.7, "rgba(130,60,220,0.03)");
  pool.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = pool;
  ctx.fillRect(0, 0, S, S);

  ctx.save();
  ctx.translate(S / 2, S / 2);
  ctx.shadowColor = "rgba(125,245,255,0.65)";
  ctx.shadowBlur = 16;
  ctx.strokeStyle = "rgba(125,245,255,0.22)";
  for (const r of [70, 150, 262, 380]) {
    ctx.lineWidth = r === 262 ? 2 : 1.1;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.strokeStyle = "rgba(255,122,217,0.16)";
  ctx.lineWidth = 1;
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * 70, Math.sin(a) * 70);
    ctx.lineTo(Math.cos(a) * 380, Math.sin(a) * 380);
    ctx.stroke();
  }
  ctx.restore();

  // Sparse floor runes.
  ctx.save();
  ctx.globalAlpha = 0.22;
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2 + 0.2;
    const r = S * (0.26 + (i % 3) * 0.09);
    drawSigil(ctx, S / 2 + Math.cos(a) * r, S / 2 + Math.sin(a) * r, 20 + (i % 4) * 4, 200 + i, {
      color: i % 3 === 0 ? "rgba(255,122,217,0.8)" : "rgba(125,245,255,0.8)",
      glyph: i % 2 ? "◇" : "✶",
      glow: 8,
      glyphScale: 0.55,
    });
  }
  ctx.restore();

  return canvasTexture(canvas);
}

/** Procedural photo studio for reflections and specular highlights. */
export function createEnvironmentTexture(): THREE.CanvasTexture {
  const W = 1024;
  const H = 512;
  const [canvas, ctx] = canvas2d(W, H);

  const sky = ctx.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, "#05040d");
  sky.addColorStop(0.45, "#120c2a");
  sky.addColorStop(0.7, "#07060f");
  sky.addColorStop(1, "#010103");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, H);

  const glows: Array<[string, number, number, number, number, number]> = [
    ["rgba(60,220,255,0.95)", 0.16, 0.36, 0.13, 0.18, 0.95],
    ["rgba(190,120,255,0.85)", 0.78, 0.42, 0.16, 0.2, 0.8],
    ["rgba(255,110,210,0.55)", 0.58, 0.7, 0.1, 0.12, 0.4],
    ["rgba(255,214,160,0.45)", 0.42, 0.18, 0.09, 0.1, 0.35],
  ];
  ctx.globalCompositeOperation = "lighter";
  for (const [color, x, y, rx, ry, alpha] of glows) {
    ctx.save();
    ctx.globalAlpha = alpha;
    const g = ctx.createRadialGradient(x * W, y * H, 0, x * W, y * H, rx * W);
    g.addColorStop(0, color);
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(x * W, y * H, rx * W, ry * H, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // Large soft panels give the glass broad, readable reflections.
  const panels: Array<[string, number, number, number, number, number]> = [
    ["rgba(255,255,255,0.9)", 0.12, 0.42, 0.18, 0.2, 0.5],
    ["rgba(210,245,255,0.85)", 0.68, 0.2, 0.22, 0.14, 0.38],
    ["rgba(150,210,255,0.8)", 0.9, 0.62, 0.12, 0.18, 0.3],
  ];
  for (const [color, x, y, rx, ry, alpha] of panels) {
    ctx.save();
    ctx.globalAlpha = alpha;
    const g = ctx.createRadialGradient(x * W, y * H, 0, x * W, y * H, rx * W);
    g.addColorStop(0, color);
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(x * W, y * H, rx * W, ry * H, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // Hard, narrow softboxes => crisp glass highlights.
  const boxes: Array<[number, number, number, number, number]> = [
    [0.25, 0.24, 0.045, 0.14, 1],
    [0.72, 0.3, 0.036, 0.1, 0.95],
    [0.86, 0.56, 0.02, 0.06, 0.8],
    [0.38, 0.78, 0.022, 0.05, 0.65],
    [0.06, 0.62, 0.018, 0.07, 0.55],
  ];
  for (const [x, y, rx, ry, intensity] of boxes) {
    ctx.save();
    ctx.globalAlpha = intensity;
    ctx.shadowColor = "white";
    ctx.shadowBlur = 30;
    const g = ctx.createRadialGradient(x * W, y * H, 0, x * W, y * H, rx * W);
    g.addColorStop(0, "rgba(255,255,255,1)");
    g.addColorStop(0.45, "rgba(220,245,255,0.85)");
    g.addColorStop(1, "rgba(160,210,255,0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(x * W, y * H, rx * W, ry * H, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // A faint luminous horizon band.
  const horizon = ctx.createLinearGradient(0, H * 0.55, 0, H * 0.72);
  horizon.addColorStop(0, "rgba(90,190,255,0)");
  horizon.addColorStop(0.5, "rgba(120,215,255,0.24)");
  horizon.addColorStop(1, "rgba(90,190,255,0)");
  ctx.fillStyle = horizon;
  ctx.fillRect(0, H * 0.55, W, H * 0.17);

  const texture = canvasTexture(canvas);
  texture.mapping = THREE.EquirectangularReflectionMapping;
  return texture;
}

export function createGlowTexture(): THREE.CanvasTexture {
  const S = 128;
  const [canvas, ctx] = canvas2d(S, S);
  const g = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.25, "rgba(200,245,255,0.75)");
  g.addColorStop(0.6, "rgba(120,180,255,0.18)");
  g.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, S, S);
  return canvasTexture(canvas);
}
