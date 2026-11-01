/** Normalize the upstream mage concepts without repainting or changing source files. */
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { decodePng, encodePng } from "./lib/png.mjs";
import { loadPalette, hexToRgb } from "./lib/palette.mjs";

const root = new URL("../", import.meta.url);
const size = 48, columns = 6, rows = 5;
const width = size * columns, height = size * rows;
const sheet = Buffer.alloc(width * height * 4);
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const families = [
  ...["fire", "frost", "lightning"].map((element) => ({ id: `circle-${element}`, element, source: "circle", count: 4, y: 500, top: 320, bottom: 680, scale: 0.140625 })),
  { id: "burn", source: "burn", count: 3, y: 512, top: 240, bottom: 760, scale: 0.08 },
  { id: "chill", source: "frost", count: 3, y: 266, top: 48, bottom: 460, scale: 0.08 },
  { id: "freeze", source: "frost", count: 4, y: 704, top: 500, bottom: 910, scale: 0.10 },
  { id: "shock", source: "shock", count: 4, y: 528, top: 340, bottom: 720, scale: 0.10 },
  ...["fire", "frost", "lightning"].map((element) => ({ id: `prism-${element}`, element, source: "frost", count: 1, sourceColumns: 3, left: 140, right: 210, y: 333, top: 195, bottom: 342, scale: 0.10 })),
];

// Same premultiplied area sampling / Lab nearest-color policy as pixelize.mjs.
function lab(rgb) {
  const [r, g, b] = rgb.map((v) => {
    const c = v / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  const f = (v) => v > 0.008856 ? Math.cbrt(v) : 7.787 * v + 16 / 116;
  const x = f((r * 0.4124564 + g * 0.3575761 + b * 0.1804375) / 0.95047);
  const y = f(r * 0.2126729 + g * 0.7151522 + b * 0.072175);
  const z = f((r * 0.0193339 + g * 0.119192 + b * 0.9503041) / 1.08883);
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
}
const allowedKeys = new Set(["ink0", "ink1", "white", "bone", "gold", "fireYellow", "fireOrange", "fireDeep", "danger", "iceCyan", "iceDeep", "psiViolet", "psiPurple"]);
const palette = loadPalette().filter((p) => allowedKeys.has(p.key)).map((p) => ({ ...p, rgb: hexToRgb(p.hex), lab: lab(hexToRgb(p.hex)) }));
const byKey = new Map(palette.map((p) => [p.key, p]));
const elementColors = {
  fire: { psiViolet: "fireDeep", psiPurple: "fireOrange", iceDeep: "fireDeep", iceCyan: "fireYellow" },
  frost: { psiViolet: "iceDeep", psiPurple: "iceCyan", gold: "bone", fireOrange: "iceDeep", fireYellow: "white", fireDeep: "iceDeep", danger: "iceDeep" },
  lightning: { iceDeep: "psiViolet", iceCyan: "psiPurple" },
};
const cache = new Map();
function quantize(rgb) {
  const key = rgb.join(",");
  if (cache.has(key)) return cache.get(key);
  const color = lab(rgb);
  let best, distance = Infinity;
  for (const p of palette) {
    const d = p.lab.reduce((sum, v, i) => sum + (v - color[i]) ** 2, 0);
    if (d < distance) { distance = d; best = p; }
  }
  cache.set(key, best);
  return best;
}

const sources = new Map();
const frames = [];
for (const family of families) {
  const path = `assets/vfx/mage/mage-${family.source}-source.png`;
  if (!sources.has(path)) {
    const bytes = readFileSync(new URL(path, root));
    sources.set(path, { ...decodePng(bytes), path, sha256: hash(bytes) });
  }
  const src = sources.get(path);
  const cellWidth = src.width / (family.sourceColumns ?? family.count);
  for (let frame = 0; frame < family.count; frame++) {
    const index = frames.length;
    let opaque = 0;
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const x0 = cellWidth * (frame + 0.5) + (x - size / 2) / family.scale;
      const y0 = family.y + (y - size / 2) / family.scale;
      const x1 = x0 + 1 / family.scale, y1 = y0 + 1 / family.scale;
      let alpha = 0, r = 0, g = 0, b = 0;
      for (let sy = Math.max(family.top, Math.floor(y0)); sy < Math.min(family.bottom, Math.ceil(y1)); sy++) {
        for (let sx = Math.max(family.left ?? Math.ceil(frame * cellWidth), Math.floor(x0)); sx < Math.min(family.right ?? Math.floor((frame + 1) * cellWidth), Math.ceil(x1)); sx++) {
          const weight = Math.max(0, Math.min(x1, sx + 1) - Math.max(x0, sx)) * Math.max(0, Math.min(y1, sy + 1) - Math.max(y0, sy));
          const p = (sy * src.width + sx) * 4;
          const a = weight * src.rgba[p + 3] / 255;
          alpha += a;
          r += a * src.rgba[p]; g += a * src.rgba[p + 1]; b += a * src.rgba[p + 2];
        }
      }
      // Keep thin rune strokes; transparent RGB never enters the color average.
      if (alpha * family.scale ** 2 < 0.25) continue;
      if (x === 0 || y === 0 || x === size - 1 || y === size - 1) throw new Error(`${family.id}-${frame}: clipped edge`);
      const canonical = quantize([r, g, b].map((v) => Math.round(v / alpha)));
      const color = family.element ? byKey.get(elementColors[family.element][canonical.key] ?? canonical.key).rgb : canonical.rgb;
      sheet.set([...color, 255], ((Math.floor(index / columns) * size + y) * width + index % columns * size + x) * 4);
      opaque++;
    }
    if (opaque === 0) throw new Error(`${family.id}-${frame}: empty frame`);
    frames.push({ id: `${family.id}-${frame}`, index, x: index % columns * size, y: Math.floor(index / columns) * size,
      w: size, h: size, opaque, source: path, sourceAnchor: { x: cellWidth * (frame + 0.5), y: family.y }, scale: family.scale,
      element: family.element ?? null });
  }
}
if (frames.length !== 29 || frames.length > columns * rows) throw new Error("Mage sheet layout mismatch");
const output = "public/assets/vfx/mage-elemental-48x48.png";
const png = encodePng(width, height, sheet);
mkdirSync(new URL("public/assets/vfx/", root), { recursive: true });
writeFileSync(new URL(output, root), png);
writeFileSync(new URL("assets/vfx/mage/asset-record.json", root), JSON.stringify({
  output, width, height, frameSize: size, frameCount: frames.length, columns, rows, anchorPx: { x: 24, y: 24 },
  circleReferenceRadius: 18, alphaValues: [0, 255], palette: palette.map(({ key, hex }) => ({ key, hex })),
  processing: "shared scale and anchor per family; premultiplied area sampling; alpha threshold 0.25; Lab palette; no per-frame recentering",
  elementColors,
  sources: [...sources.values()].map(({ path, width, height, sha256 }) => ({ path, width, height, sha256 })),
  frames, sha256: hash(png),
}, null, 2) + "\n");

// A deterministic contact sheet, with 1x artwork and 4x nearest-neighbor cells.
const previewWidth = width * 4, previewHeight = height * 4;
const preview = Buffer.alloc(previewWidth * previewHeight * 4);
for (let y = 0; y < previewHeight; y++) for (let x = 0; x < previewWidth; x++) {
  const p = (Math.floor(y / 4) * width + Math.floor(x / 4)) * 4;
  const dst = (y * previewWidth + x) * 4;
  const bg = Math.floor(x / 32) % 2 === Math.floor(y / 32) % 2 ? [16, 20, 35] : [25, 30, 48];
  preview.set(sheet[p + 3] ? sheet.subarray(p, p + 4) : [...bg, 255], dst);
}
writeFileSync(new URL("assets/vfx/mage/mage-vfx-contact-sheet-4x.png", root), encodePng(previewWidth, previewHeight, preview));
console.log(JSON.stringify({ output, width, height, frames: frames.length, opaque: frames.map((f) => f.opaque), sha256: hash(png) }));
