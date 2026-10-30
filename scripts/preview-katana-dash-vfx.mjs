// Offline art preview of the production drawing function; not a gameplay test.
import { readFileSync, writeFileSync } from "node:fs";
import ts from "typescript";
import { decodePng, encodePng } from "./lib/png.mjs";
const root = new URL("../", import.meta.url);
// Use the project's existing compiler so this optional art tool also works on Node 22.12.
const source = readFileSync(new URL("src/game/rendering/vfx/katanaDash.ts", root), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
}).outputText;
const { drawKatanaDash, KATANA_DASH } = await import("data:text/javascript;base64," + Buffer.from(compiled).toString("base64"));
const sheet = decodePng(readFileSync(new URL("public/" + KATANA_DASH.image, root)));
const width = 192, height = 112, scale = 4;
const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const background = rgb("#0e1322");
const frames = [];
const playerMap = ["  hhhh  ", " hhhhhh ", " heffeh ", " hhhhhh ", "  aaaa  ", " aaaaaa ", " aaaaaa ", "   aa   ", "  a  a  ", "  b  b  "];
const playerColors = { h: "#f4a940", e: "#22223a", f: "#ffd9a0", a: "#3d6de0", b: "#5a3a20" };
let canvas;
function pixel(x, y, color, alpha = 1) {
  x = Math.round(x); y = Math.round(y);
  if (x < 0 || y < 0 || x >= width || y >= height) return;
  const at = (y * width + x) * 4;
  for (let c = 0; c < 3; c++) canvas[at + c] = Math.round(canvas[at + c] * (1 - alpha) + color[c] * alpha);
}
function line(x1, y1, x2, y2, color, alpha) {
  const steps = Math.max(Math.abs(x2 - x1), Math.abs(y2 - y1));
  for (let step = 0; step <= steps; step++) {
    const t = steps === 0 ? 0 : step / steps;
    pixel(x1 + (x2 - x1) * t, y1 + (y2 - y1) * t, color, alpha);
  }
}
const painter = {
  globalAlpha: 1, fillStyle: "#ffffff",
  hasTexture: () => true,
  fillRect(x, y, w, h) {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) pixel(x + i, y + j, rgb(this.fillStyle), this.globalAlpha);
  },
  polyline3(points, color, alpha) {
    const channels = rgb(color);
    for (let i = 0; i < points.length; i += 6) {
      line(points[i], points[i + 1], points[i + 2], points[i + 3], channels, alpha);
      line(points[i + 2], points[i + 3], points[i + 4], points[i + 5], channels, alpha);
    }
  },
  spriteRot(key, cx, cy, angle) {
    const frame = Number(key.slice(KATANA_DASH.texturePrefix.length));
    const c = Math.cos(angle), s = Math.sin(angle), half = 16;
    for (let y = Math.floor(cy - 24); y <= cy + 24; y++) for (let x = Math.floor(cx - 24); x <= cx + 24; x++) {
      const sx = Math.floor((x + 0.5 - cx) * c + (y + 0.5 - cy) * s + half);
      const sy = Math.floor(-(x + 0.5 - cx) * s + (y + 0.5 - cy) * c + half);
      if (sx < 0 || sy < 0 || sx >= 32 || sy >= 32) continue;
      const at = ((Math.floor(frame / 5) * 32 + sy) * sheet.width + frame % 5 * 32 + sx) * 4;
      if (sheet.rgba[at + 3]) pixel(x, y, sheet.rgba.subarray(at, at + 3), this.globalAlpha);
    }
  },
};
function player(x, y, alpha) {
  for (let j = 0; j < 10; j++) for (let i = 0; i < 8; i++) {
    const color = playerColors[playerMap[j][i]];
    if (color) pixel(x - 4 + i, y - 5 + j, rgb(color), alpha);
  }
}
// Move first, then release at the fixed destination. Both directions use the same renderer.
const states = [
  ...Array.from({ length: 10 }, (_, i) => ({ phase: "rush", progress: i / 10, fraction: (i + 1) / 10, delay: 5 })),
  ...Array.from({ length: 21 }, (_, i) => ({ phase: "release", progress: i / 21, fraction: 1, delay: 5 })),
  { phase: "idle", progress: 0, fraction: 1, delay: 35 },
];
for (const state of states) {
  canvas = Buffer.alloc(width * height * 4);
  for (let i = 0; i < width * height; i++) canvas.set([...background, 255], i * 4);
  for (let x = 8; x < width; x += 8) for (let y = 8; y < height; y += 8) pixel(x, y, rgb("#24344b"), 0.5);
  line(8, 53, 184, 53, rgb("#24344b"), 1);
  for (const [x1, y1, dx, dy] of [[34, 27, 104, 0], [142, 94, -88, -24]]) {
    const x2 = x1 + dx * state.fraction, y2 = y1 + dy * state.fraction;
    const length = Math.hypot(x2 - x1, y2 - y1);
    if (state.phase === "rush") for (let i = 3; i >= 1; i--) {
      if (length > i * 11) player(x2 - dx / Math.hypot(dx, dy) * i * 11, y2 - dy / Math.hypot(dx, dy) * i * 11, (4 - i) * 0.08);
    }
    if (state.phase !== "idle") drawKatanaDash(painter, { x1, y1, x2, y2, phase: state.phase, progress: state.progress });
    player(x2, y2, state.phase === "rush" ? 0.6 : 1);
  }
  const enlarged = Buffer.alloc(width * height * scale * scale * 4);
  for (let y = 0; y < height * scale; y++) for (let x = 0; x < width * scale; x++) {
    const at = (Math.floor(y / scale) * width + Math.floor(x / scale)) * 4;
    canvas.copy(enlarged, (y * width * scale + x) * 4, at, at + 4);
  }
  frames.push({ rgba: enlarged, delay: state.delay });
}
writeFileSync(new URL("assets/vfx/katana-dash-preview-still.png", root), encodePng(width * scale, height * scale, frames[8].rgba));

// Indexed GIF with an alpha-ramp palette and LZW, using only Node built-ins.
const palette = [background];
for (const color of ["#1a5f9e", "#57e6ff", "#d8f7ff", "#ffffff", "#24344b", ...Object.values(playerColors)]) {
  const channels = rgb(color);
  for (let step = 1; step <= 12; step++) palette.push(channels.map((v, c) => Math.round(background[c] + (v - background[c]) * step / 12)));
}
while (palette.length < 128) palette.push(background);
if (palette.length > 128) throw new Error("Preview palette overflow");
const cache = new Map();
function paletteIndex(r, g, b) {
  const key = r * 65536 + g * 256 + b;
  if (cache.has(key)) return cache.get(key);
  let best = 0, distance = Infinity;
  for (let i = 0; i < palette.length; i++) {
    const d = (r - palette[i][0]) ** 2 + (g - palette[i][1]) ** 2 + (b - palette[i][2]) ** 2;
    if (d < distance) { best = i; distance = d; }
  }
  cache.set(key, best); return best;
}
function lzw(indices) {
  const bytes = []; let data = 0, held = 0, bits = 8, next = 130;
  let dictionary = new Map();
  const emit = (code) => {
    data |= code << held; held += bits;
    while (held >= 8) { bytes.push(data & 255); data >>>= 8; held -= 8; }
  };
  emit(128);
  let prefix = indices[0];
  for (let i = 1; i < indices.length; i++) {
    const suffix = indices[i], key = prefix * 128 + suffix;
    if (dictionary.has(key)) { prefix = dictionary.get(key); continue; }
    emit(prefix);
    if (next < 4096) {
      dictionary.set(key, next++);
      if (next > 1 << bits) bits++;
    } else { emit(128); dictionary = new Map(); bits = 8; next = 130; }
    prefix = suffix;
  }
  emit(prefix);
  if (next === 1 << bits && bits < 12) bits++;
  emit(129);
  if (held) bytes.push(data & 255);
  const parts = [Buffer.from([7])];
  for (let i = 0; i < bytes.length; i += 255) parts.push(Buffer.from([Math.min(255, bytes.length - i)]), Buffer.from(bytes.slice(i, i + 255)));
  parts.push(Buffer.from([0])); return Buffer.concat(parts);
}
const header = Buffer.alloc(13);
header.write("GIF89a"); header.writeUInt16LE(width * scale, 6); header.writeUInt16LE(height * scale, 8); header[10] = 0xf6;
const parts = [header, Buffer.from(palette.flat()), Buffer.from([0x21, 0xff, 11]), Buffer.from("NETSCAPE2.0"), Buffer.from([3, 1, 0, 0, 0])];
for (const frame of frames) {
  const indices = new Uint8Array(frame.rgba.length / 4);
  for (let i = 0; i < indices.length; i++) indices[i] = paletteIndex(frame.rgba[i * 4], frame.rgba[i * 4 + 1], frame.rgba[i * 4 + 2]);
  const descriptor = Buffer.alloc(10); descriptor[0] = 0x2c;
  descriptor.writeUInt16LE(width * scale, 5); descriptor.writeUInt16LE(height * scale, 7);
  parts.push(Buffer.from([0x21, 0xf9, 4, 4, frame.delay, 0, 0, 0]), descriptor, lzw(indices));
}
parts.push(Buffer.from([0x3b]));
const gif = Buffer.concat(parts);
writeFileSync(new URL("assets/vfx/katana-dash-preview.gif", root), gif);
console.log(JSON.stringify({ frames: frames.length, width: width * scale, height: height * scale, bytes: gif.length }));
