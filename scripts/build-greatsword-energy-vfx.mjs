/** Rebuild the asset-only PR #204 sheets; does not register runtime textures. */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { decodePng, encodePng } from "./lib/png.mjs";

const root = new URL("../", import.meta.url);
const colors = ["#9b4b16", "#f4a940", "#ffd24a", "#ffe8a3", "#ffffff"];
const palette = colors.map((hex) => [1, 3, 5].map((at) => parseInt(hex.slice(at, at + 2), 16)));
const columns = 5, rows = 2, count = 10, clearance = 4;
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const writeJson = (path, value) => writeFileSync(new URL(path, root), JSON.stringify(value, null, 2) + "\n");
const variants = [
  { name: "sword-qi", grid: 64, size: 64, radius: 27, maxHeight: 42, symmetric: true, mirror: true },
  { name: "fissure", grid: 96, size: 96, radius: 43, maxHeight: 64, symmetric: true, mirror: false },
  { name: "dash-slash", grid: 64, size: 96, radius: 26, maxHeight: 52, symmetric: false, mirror: true },
];

for (const variant of variants) {
  const { name, grid, size, radius, maxHeight, symmetric, mirror } = variant;
  const sourcePath = `assets/vfx/greatsword-${name}-source.png`;
  const sourceBytes = readFileSync(new URL(sourcePath, root));
  const source = decodePng(sourceBytes);
  // image_gen rounds the 5:2 requested canvas to 1983x793. Allow at most one
  // source pixel of aspect rounding; every output frame is exactly square.
  if (Math.abs(source.width / columns - source.height / rows) > 1)
    throw new Error(`${name}: source must contain a 5x2 grid of square cells`);
  const frames = [];
  let envelope = 0, minY = grid, maxY = -1;
  for (let frame = 0; frame < count; frame++) {
    const rgba = Buffer.alloc(grid * grid * 4);
    for (let y = 0; y < grid; y++) for (let x = 0; x < grid; x++) {
      // Remove stray generated chips behind the anchored dash-cut pivot.
      if (!symmetric && x < grid / 2) continue;
      // A shared horizontal reflection makes the moving blade walls safe to
      // rotate. Use the lower half to retain the generated dark crack tails.
      const sourceY = symmetric && y < grid / 2 ? grid - 1 - y : y;
      const sx = Math.floor((frame % columns + (x + 0.5) / grid) * source.width / columns);
      const sy = Math.floor((Math.floor(frame / columns) + (sourceY + 0.5) / grid) * source.height / rows);
      const si = (sy * source.width + sx) * 4;
      if (source.rgba[si + 3] < 128) continue;
      let best = palette[0], distance = Infinity;
      for (const color of palette) {
        const d = color.reduce((sum, channel, i) => sum + (channel - source.rgba[si + i]) ** 2, 0);
        if (d < distance) { best = color; distance = d; }
      }
      rgba.set([...best, 255], (y * grid + x) * 4);
      envelope = Math.max(envelope, Math.hypot(x + 0.5 - grid / 2, y + 0.5 - grid / 2));
      minY = Math.min(minY, y); maxY = Math.max(maxY, y);
    }
    frames.push(rgba);
  }
  if (envelope === 0) throw new Error(`${name}: empty source`);
  // ONE centered scale for all ten frames. The union's height cap keeps the
  // two projectile walls at the brief's nominal 42px / 64px sizes.
  const scale = Math.min(1, (radius - Math.SQRT1_2) / (envelope + Math.SQRT1_2), maxHeight / (maxY - minY + 1));
  const outputScale = size / grid;
  for (const mirrored of mirror ? [false, true] : [false]) {
    const key = `greatsword-${name}${mirrored ? "-left" : ""}`;
    const stem = `${key}-${size}x${size}-10f`;
    const width = size * columns, height = size * rows;
    const sheet = Buffer.alloc(width * height * 4), stats = [];
    for (let frame = 0; frame < count; frame++) {
      const frameBytes = Buffer.alloc(size * size * 4);
      let opaque = 0, white = 0, maxRadius = 0;
      let bounds = { left: size, top: size, right: -1, bottom: -1 };
      for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
        const dx = (x + 0.5 - size / 2) / outputScale;
        const dy = (y + 0.5 - size / 2) / outputScale;
        if (Math.hypot(dx, dy) < clearance) continue;
        const sx = Math.floor((mirrored ? -dx : dx) / scale + grid / 2);
        const sy = Math.floor(dy / scale + grid / 2);
        if (sx < 0 || sy < 0 || sx >= grid || sy >= grid) continue;
        const si = (sy * grid + sx) * 4;
        if (frames[frame][si + 3] === 0) continue;
        if (x < 4 * outputScale || y < 4 * outputScale ||
            x >= size - 4 * outputScale || y >= size - 4 * outputScale || Math.hypot(dx, dy) > radius)
          throw new Error(`${key}: frame ${frame} exceeds fixed envelope`);
        if (!symmetric && (mirrored ? dx > 0 : dx < 0))
          throw new Error(`${key}: frame ${frame} enters the player's opposite half`);
        const di = ((Math.floor(frame / columns) * size + y) * width + frame % columns * size + x) * 4;
        sheet.set(frames[frame].subarray(si, si + 4), di);
        frameBytes.set(frames[frame].subarray(si, si + 4), (y * size + x) * 4);
        opaque++;
        if (frames[frame][si] === 255 && frames[frame][si + 1] === 255) white++;
        bounds.left = Math.min(bounds.left, x); bounds.right = Math.max(bounds.right, x);
        bounds.top = Math.min(bounds.top, y); bounds.bottom = Math.max(bounds.bottom, y);
        maxRadius = Math.max(maxRadius, Math.hypot(dx, dy) * outputScale);
      }
      if (opaque === 0) throw new Error(`${key}: empty frame ${frame}`);
      stats.push({ frame, opaque, white, maxRadius, bounds, sha256: hash(frameBytes) });
    }
    if (new Set(stats.map((stat) => stat.sha256)).size !== count)
      throw new Error(`${key}: expected ten distinct frames`);
    const png = encodePng(width, height, sheet);
    const rectangles = Array.from({ length: count }, (_, i) => ({
      x: i % columns * size, y: Math.floor(i / columns) * size, w: size, h: size,
    }));
    const data = {
      key, image: `${stem}.png`, columns, rows, frameWidth: size, frameHeight: size, frameCount: count,
      origin: { x: 0.5, y: 0.5 }, anchorPx: { x: size / 2, y: size / 2 },
      referenceRadius: radius * outputScale, baseAngle: mirrored ? Math.PI : 0, mirrored,
      topBottomSymmetric: symmetric, repeat: 0, durationSeconds: null,
      frameStarts: [0, 0.06, 0.12, 0.19, 0.27, 0.38, 0.50, 0.64, 0.78, 0.91],
      timing: "normalized progress only; consumer owns movement/lifetime; no runtime integration in this asset batch",
      palette: colors, alphaValues: [0, 255], frames: rectangles, stats,
      source: { tool: "built-in image_gen", model: null, seed: null, path: sourcePath,
        width: source.width, height: source.height, sha256: hash(sourceBytes),
        prompt: `assets/vfx/greatsword-${name}-prompt.txt`, generationLog: "assets/vfx/greatsword-energy-generation.json" },
      processing: { script: "scripts/build-greatsword-energy-vfx.mjs", logicalFrameSize: grid,
        alphaThreshold: 128, transparentCenterLogicalRadius: clearance,
        sampling: "nearest-neighbor; RGB squared distance five-color mapping; no dithering",
        symmetry: symmetric ? "lower half reflected across fixed horizontal center" : null,
        sharedSourceRadius: envelope, sharedSourceHeight: maxY - minY + 1, sharedLogicalScale: scale,
        logicalToOutputScale: outputScale, perFrameCrop: false },
      sha256: hash(png),
    };
    const atlas = {
      frames: Object.fromEntries(rectangles.map((frame, i) => [`${key}-${i}`, {
        frame, rotated: false, trimmed: false,
        spriteSourceSize: { x: 0, y: 0, w: size, h: size }, sourceSize: { w: size, h: size },
      }])),
      meta: { app: "Pixel Rogue", image: `${stem}.png`, format: "RGBA8888", size: { w: width, h: height }, scale: "1" },
    };
    writeFileSync(new URL(`public/assets/vfx/${stem}.png`, root), png);
    writeJson(`public/assets/vfx/${stem}.json`, data);
    writeJson(`public/assets/vfx/${stem}.atlas.json`, atlas);
    const zoom = 2, enlarged = Buffer.alloc(width * height * zoom * zoom * 4);
    for (let y = 0; y < height * zoom; y++) for (let x = 0; x < width * zoom; x++) {
      const si = (Math.floor(y / zoom) * width + Math.floor(x / zoom)) * 4;
      sheet.copy(enlarged, (y * width * zoom + x) * 4, si, si + 4);
    }
    writeFileSync(new URL(`assets/vfx/${key}-contact-sheet.png`, root), encodePng(width * zoom, height * zoom, enlarged));
    console.log(JSON.stringify({ key, width, height, sha256: hash(png), opaque: stats.map((stat) => stat.opaque) }));
  }
}
