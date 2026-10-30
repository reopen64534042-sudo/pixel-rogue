/** Rebuild the shipped greatsword sheets from the preserved generated sources. */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { decodePng, encodePng } from "./lib/png.mjs";

const root = new URL("../", import.meta.url);
const colors = ["#9b4b16", "#f4a940", "#ffd24a", "#ffe8a3", "#ffffff"];
const palette = colors.map((hex) => [1, 3, 5].map((start) => parseInt(hex.slice(start, start + 2), 16)));
const columns = 5;
const rows = 2;
const count = 10;
const grid = 64;
const playerClearance = 4;
const hash = (data) => createHash("sha256").update(data).digest("hex");
const writeJson = (path, value) => writeFileSync(new URL(path, root), JSON.stringify(value, null, 2) + "\n");

for (const [variant, size, radius] of [["sweep", 96, 45], ["heavy", 144, 67.5]]) {
  const sourcePath = `assets/vfx/greatsword-${variant}-source.png`;
  const sourceBytes = readFileSync(new URL(sourcePath, root));
  const source = decodePng(sourceBytes);
  const frames = [];
  let envelope = 0;
  // One common logical canvas and envelope across all ten frames. Never crop
  // individual silhouettes: lead-in, arc and fragments retain their positions.
  for (let frame = 0; frame < count; frame++) {
    const data = Buffer.alloc(grid * grid * 4);
    for (let y = 0; y < grid; y++) for (let x = 0; x < grid; x++) {
      // Remove generated spark noise at the fixed player pivot in every frame.
      if (Math.hypot(x + 0.5 - grid / 2, y + 0.5 - grid / 2) < playerClearance) continue;
      const sx = Math.floor(((frame % columns) + (x + 0.5) / grid) * source.width / columns);
      const sy = Math.floor((Math.floor(frame / columns) + (y + 0.5) / grid) * source.height / rows);
      const si = (sy * source.width + sx) * 4;
      if (source.rgba[si + 3] < 128) continue;
      let best = palette[0];
      let distance = Infinity;
      for (const color of palette) {
        const d = color.reduce((sum, channel, i) => sum + (channel - source.rgba[si + i]) ** 2, 0);
        if (d < distance) { best = color; distance = d; }
      }
      data.set([...best, 255], (y * grid + x) * 4);
      envelope = Math.max(envelope, Math.hypot(x + 0.5 - grid / 2, y + 0.5 - grid / 2));
    }
    frames.push(data);
  }
  // Account for source pixel corners and destination pixel centers at the edge.
  const scale = (radius - Math.SQRT1_2) / (envelope + Math.SQRT1_2);
  for (const mirrored of [false, true]) {
    const key = `greatsword-${variant}${mirrored ? "-ccw" : ""}`;
    const stem = `${key}-${size}x${size}-10f`;
    const width = size * columns;
    const height = size * rows;
    const sheet = Buffer.alloc(width * height * 4);
    const stats = [];
    for (let frame = 0; frame < count; frame++) {
      let opaque = 0, white = 0, maxRadius = 0;
      for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
        const sx = Math.floor(((mirrored ? size - x - 0.5 : x + 0.5) - size / 2) / scale + grid / 2);
        const sy = Math.floor((y + 0.5 - size / 2) / scale + grid / 2);
        if (sx < 0 || sy < 0 || sx >= grid || sy >= grid) continue;
        const si = (sy * grid + sx) * 4;
        if (frames[frame][si + 3] === 0) continue;
        if (x === 0 || y === 0 || x === size - 1 || y === size - 1) throw new Error(`${key}: frame touches edge`);
        const di = ((Math.floor(frame / columns) * size + y) * width + (frame % columns) * size + x) * 4;
        sheet.set(frames[frame].subarray(si, si + 4), di);
        opaque++;
        if (frames[frame][si] === 255 && frames[frame][si + 1] === 255) white++;
        maxRadius = Math.max(maxRadius, Math.hypot(x + 0.5 - size / 2, y + 0.5 - size / 2));
      }
      stats.push({ frame, opaque, white, maxRadius });
    }
    const png = encodePng(width, height, sheet);
    writeFileSync(new URL(`public/assets/vfx/${stem}.png`, root), png);
    const rectangles = Array.from({ length: count }, (_, i) => ({
      x: (i % columns) * size, y: Math.floor(i / columns) * size, w: size, h: size,
    }));
    writeJson(`public/assets/vfx/${stem}.json`, {
      key, image: `${stem}.png`, columns, rows, frameWidth: size, frameHeight: size, frameCount: count,
      origin: { x: 0.5, y: 0.5 }, anchorPx: { x: size / 2, y: size / 2 },
      referenceRadius: radius, baseAngle: mirrored ? Math.PI : 0, mirrored,
      durationSeconds: 0.16, repeat: 0, timing: "simulation-owned slash life / max; no independent animation clock",
      palette: colors, alphaValues: [0, 255], frames: rectangles, stats,
      source: { tool: "built-in image_gen", model: null, seed: null, path: sourcePath,
        width: source.width, height: source.height, sha256: hash(sourceBytes),
        prompt: `assets/vfx/greatsword-${variant}-prompt.txt` },
      processing: { script: "scripts/build-greatsword-vfx.mjs", logicalFrameSize: grid, alphaThreshold: 128,
        transparentCenterLogicalRadius: playerClearance,
        sampling: "nearest-neighbor; RGB squared distance palette mapping; no dithering",
        sharedSourceRadius: envelope, sharedScale: scale, perFrameCrop: false },
      sha256: hash(png),
    });
    writeJson(`public/assets/vfx/${stem}.atlas.json`, {
      frames: Object.fromEntries(rectangles.map((rect, i) => [`${key}-${i}`, {
        frame: rect, rotated: false, trimmed: false,
        spriteSourceSize: { x: 0, y: 0, w: size, h: size }, sourceSize: { w: size, h: size },
      }])),
      meta: { app: "Pixel Rogue", image: `${stem}.png`, format: "RGBA8888", size: { w: width, h: height }, scale: "1" },
    });
    console.log(JSON.stringify({ key, path: fileURLToPath(new URL(`public/assets/vfx/${stem}.png`, root)), width, height, stats }));
  }
}
