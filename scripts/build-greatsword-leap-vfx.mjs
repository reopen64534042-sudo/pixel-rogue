/** Normalize the generated landing sheet with one shared anchor and envelope. */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { decodePng, encodePng } from "./lib/png.mjs";

const root = new URL("../", import.meta.url);
const sourcePath = "assets/vfx/greatsword-leap-impact-source.png";
const sourceBytes = readFileSync(new URL(sourcePath, root));
const source = decodePng(sourceBytes);
const colors = ["#9b4b16", "#f4a940", "#ffd24a", "#ffe8a3", "#ffffff"];
const palette = colors.map((hex) => [1, 3, 5].map((at) => parseInt(hex.slice(at, at + 2), 16)));
const size = 144, grid = 144, columns = 5, rows = 2, count = 10;
const radius = 67.5, clearance = 4;
const width = size * columns, height = size * rows;
const key = "greatsword-leap-impact", stem = `${key}-${size}x${size}-10f`;
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const writeJson = (path, value) => writeFileSync(new URL(path, root), JSON.stringify(value, null, 2) + "\n");
const frames = [];
let envelope = 0;
for (let frame = 0; frame < count; frame++) {
  const data = Buffer.alloc(grid * grid * 4);
  for (let y = 0; y < grid; y++) for (let x = 0; x < grid; x++) {
    const sx = Math.floor(((frame % columns) + (x + 0.5) / grid) * source.width / columns);
    const sy = Math.floor((Math.floor(frame / columns) + (y + 0.5) / grid) * source.height / rows);
    const si = (sy * source.width + sx) * 4;
    if (source.rgba[si + 3] < 128) continue;
    let best = palette[0], distance = Infinity;
    for (const color of palette) {
      const d = color.reduce((sum, channel, i) => sum + (channel - source.rgba[si + i]) ** 2, 0);
      if (d < distance) { best = color; distance = d; }
    }
    data.set([...best, 255], (y * grid + x) * 4);
    envelope = Math.max(envelope, Math.hypot(x + 0.5 - grid / 2, y + 0.5 - grid / 2));
  }
  frames.push(data);
}
if (envelope === 0) throw new Error("Empty greatsword landing source");
const scale = (radius - Math.SQRT1_2) / (envelope + Math.SQRT1_2);
const sheet = Buffer.alloc(width * height * 4);
const stats = [];
for (let frame = 0; frame < count; frame++) {
  let opaque = 0, white = 0, maxRadius = 0;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const r = Math.hypot(x + 0.5 - size / 2, y + 0.5 - size / 2);
    if (r < clearance) continue;
    const sx = Math.floor((x + 0.5 - size / 2) / scale + grid / 2);
    const sy = Math.floor((y + 0.5 - size / 2) / scale + grid / 2);
    if (sx < 0 || sy < 0 || sx >= grid || sy >= grid) continue;
    const si = (sy * grid + sx) * 4;
    if (frames[frame][si + 3] === 0) continue;
    if (x === 0 || y === 0 || x === size - 1 || y === size - 1 || r > radius)
      throw new Error(`Greatsword landing frame ${frame} exceeds envelope`);
    const di = ((Math.floor(frame / columns) * size + y) * width + frame % columns * size + x) * 4;
    sheet.set(frames[frame].subarray(si, si + 4), di);
    opaque++;
    if (frames[frame][si] === 255 && frames[frame][si + 1] === 255) white++;
    maxRadius = Math.max(maxRadius, r);
  }
  if (opaque === 0) throw new Error(`Empty greatsword landing frame ${frame}`);
  stats.push({ frame, opaque, white, maxRadius });
}
const png = encodePng(width, height, sheet);
writeFileSync(new URL(`public/assets/vfx/${stem}.png`, root), png);
const rectangles = Array.from({ length: count }, (_, i) => ({
  x: i % columns * size, y: Math.floor(i / columns) * size, w: size, h: size,
}));
writeJson(`public/assets/vfx/${stem}.json`, {
  key, image: `${stem}.png`, columns, rows, frameWidth: size, frameHeight: size, frameCount: count,
  origin: { x: 0.5, y: 0.5 }, anchorPx: { x: 72, y: 72 }, referenceRadius: radius,
  omnidirectional: true, rotation: 0, repeat: 0,
  durationSeconds: 0.32, frameStarts: [0, 0.06, 0.12, 0.18, 0.27, 0.37, 0.49, 0.62, 0.76, 0.9],
  timing: "simulation-owned slash life / max; fast contact, ground expansion, slower decay",
  palette: colors, alphaValues: [0, 255], frames: rectangles, stats,
  source: { tool: "built-in image_gen", model: null, seed: null, path: sourcePath,
    width: source.width, height: source.height, sha256: hash(sourceBytes),
    prompt: "assets/vfx/greatsword-leap-impact-prompt.txt" },
  processing: { script: "scripts/build-greatsword-leap-vfx.mjs", logicalFrameSize: grid,
    alphaThreshold: 128, transparentCenterRadius: clearance,
    sampling: "nearest-neighbor; RGB squared distance palette mapping; no dithering",
    sharedSourceRadius: envelope, sharedScale: scale, perFrameCrop: false },
  sha256: hash(png),
});
writeJson(`public/assets/vfx/${stem}.atlas.json`, {
  frames: Object.fromEntries(rectangles.map((frame, i) => [`${key}-${i}`, {
    frame, rotated: false, trimmed: false,
    spriteSourceSize: { x: 0, y: 0, w: size, h: size }, sourceSize: { w: size, h: size },
  }])),
  meta: { app: "Pixel Rogue", image: `${stem}.png`, format: "RGBA8888", size: { w: width, h: height }, scale: "1" },
});
// Twofold nearest-neighbor inspection sheet, preserving transparent pixels.
const zoom = 2, enlarged = Buffer.alloc(width * height * zoom * zoom * 4);
for (let y = 0; y < height * zoom; y++) for (let x = 0; x < width * zoom; x++) {
  const si = (Math.floor(y / zoom) * width + Math.floor(x / zoom)) * 4;
  sheet.copy(enlarged, (y * width * zoom + x) * 4, si, si + 4);
}
writeFileSync(new URL("assets/vfx/greatsword-leap-impact-contact-sheet.png", root), encodePng(width * zoom, height * zoom, enlarged));
console.log(JSON.stringify({ width, height, palette: colors, stats, sha256: hash(png) }, null, 2));
