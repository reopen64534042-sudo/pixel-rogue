/** Rebuild the runtime sheet, atlas and enlarged contact sheet. No dependencies. */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { decodePng, encodePng } from "./lib/png.mjs";

const root = new URL("../", import.meta.url);
const sourcePath = "assets/vfx/katana-dash-source.png";
const sourceBytes = readFileSync(new URL(sourcePath, root));
const source = decodePng(sourceBytes);
const colors = ["#1a5f9e", "#57e6ff", "#d8f7ff", "#ffffff"];
const palette = colors.map((hex) => [1, 3, 5].map((at) => parseInt(hex.slice(at, at + 2), 16)));
const size = 32, columns = 5, rows = 2, count = 10;
const width = columns * size, height = rows * size;
const sheet = Buffer.alloc(width * height * 4);
const stats = [];
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const writeJson = (path, value) => writeFileSync(new URL(path, root), JSON.stringify(value, null, 2) + "\n");
for (let frame = 0; frame < count; frame++) {
  let opaque = 0, white = 0;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    // One fixed grid mapping across all frames, with no per-frame crop or recentering.
    const sx = Math.floor(((frame % columns) + (x + 0.5) / size) * source.width / columns);
    const sy = Math.floor((Math.floor(frame / columns) + (y + 0.5) / size) * source.height / rows);
    const si = (sy * source.width + sx) * 4;
    if (source.rgba[si + 3] < 128) continue;
    if (x === 0 || y === 0 || x === size - 1 || y === size - 1)
      throw new Error(`Katana dash frame ${frame} touches a cell border`);
    let best = palette[0], distance = Infinity;
    for (const color of palette) {
      const d = color.reduce((sum, channel, i) => sum + (channel - source.rgba[si + i]) ** 2, 0);
      if (d < distance) { best = color; distance = d; }
    }
    const di = ((Math.floor(frame / columns) * size + y) * width + frame % columns * size + x) * 4;
    sheet.set([...best, 255], di);
    opaque++;
    if (best[0] === 255 && best[1] === 255) white++;
  }
  if (opaque === 0) throw new Error(`Katana dash frame ${frame} is empty`);
  stats.push({ frame, opaque, white });
}
const stem = "katana-dash-32x32-10f";
const png = encodePng(width, height, sheet);
writeFileSync(new URL(`public/assets/vfx/${stem}.png`, root), png);
const rectangles = Array.from({ length: count }, (_, i) => ({
  x: i % columns * size, y: Math.floor(i / columns) * size, w: size, h: size,
}));
writeJson(`public/assets/vfx/${stem}.json`, {
  key: "katana-dash", image: `${stem}.png`, columns, rows, frameWidth: size, frameHeight: size, frameCount: count,
  origin: { x: 0.5, y: 0.5 }, anchorPx: { x: 16, y: 16 }, baseAngle: 0,
  timing: { rushSeconds: 0.16, pathSeconds: 0.42, rushFrames: [0, 1, 2, 3, 4], releaseFrames: [5, 6, 7, 8, 9] },
  palette: colors, alphaValues: [0, 255], frames: rectangles, stats,
  source: { tool: "built-in image_gen", model: null, seed: null, path: sourcePath,
    width: source.width, height: source.height, sha256: hash(sourceBytes),
    prompt: "assets/vfx/katana-dash-prompt.txt" },
  processing: { script: "scripts/build-katana-dash-vfx.mjs", sampling: "nearest-neighbor on a shared cell grid",
    alphaThreshold: 128, quantization: "RGB squared distance; no dithering", perFrameCrop: false },
  sha256: hash(png),
});
writeJson(`public/assets/vfx/${stem}.atlas.json`, {
  frames: Object.fromEntries(rectangles.map((frame, i) => [`katana-dash-${i}`, {
    frame, rotated: false, trimmed: false,
    spriteSourceSize: { x: 0, y: 0, w: size, h: size }, sourceSize: { w: size, h: size },
  }])),
  meta: { app: "Pixel Rogue", image: `${stem}.png`, format: "RGBA8888", size: { w: width, h: height }, scale: "1" },
});
const scale = 5;
const enlarged = Buffer.alloc(width * height * scale * scale * 4);
for (let y = 0; y < height * scale; y++) for (let x = 0; x < width * scale; x++) {
  const si = (Math.floor(y / scale) * width + Math.floor(x / scale)) * 4;
  sheet.copy(enlarged, (y * width * scale + x) * 4, si, si + 4);
}
writeFileSync(new URL("assets/vfx/katana-dash-contact-sheet.png", root), encodePng(width * scale, height * scale, enlarged));
console.log(JSON.stringify({ width, height, palette: colors, stats, sha256: hash(png) }, null, 2));
