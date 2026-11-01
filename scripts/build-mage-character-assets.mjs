/** Normalize the witch seed and whole action sheets; same pixel policy as the ronin. */
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { decodePng, encodePng } from "./lib/png.mjs";
import { loadPalette, hexToRgb } from "./lib/palette.mjs";
const root = new URL("../", import.meta.url);
const art = "assets/characters/mage/", output = "public/assets/characters/";
const size = 64, sourceTileSize = 256 / 6, contentScale = 1;
const sourceAlphaMinimum = 240;
const anchor = { x: 32, y: 59 };
const keys = ["ink0", "ink1", "pBlueDk", "psiViolet", "psiPurple", "iceCyan", "iceDeep", "bone", "steelMid", "sand", "gold", "pBrown", "white"];
const palette = loadPalette().filter((p) => keys.includes(p.key));
if (palette.length !== keys.length) throw new Error("Mage palette keys are missing");
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const write = (path, value) => writeFileSync(new URL(path, root), value);
const json = (path, value) => write(path, JSON.stringify(value, null, 2) + "\n");
mkdirSync(new URL(output, root), { recursive: true });
function lab(rgb) {
  const [r, g, b] = rgb.map((v) => {
    const c = v / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  const f = (t) => t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116;
  const x = f((r * 0.4124564 + g * 0.3575761 + b * 0.1804375) / 0.95047);
  const y = f(r * 0.2126729 + g * 0.7151522 + b * 0.072175);
  const z = f((r * 0.0193339 + g * 0.119192 + b * 0.9503041) / 1.08883);
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
}
const colors = palette.map((entry) => ({ ...entry, rgb: hexToRgb(entry.hex), lab: lab(hexToRgb(entry.hex)) }));
const cache = new Map();
function nearest(rgb) {
  const key = rgb.join(",");
  if (cache.has(key)) return cache.get(key);
  const value = lab(rgb);
  let best = colors[0], distance = Infinity;
  for (const color of colors) {
    const d = value.reduce((sum, channel, i) => sum + (channel - color.lab[i]) ** 2, 0);
    if (d < distance) { best = color; distance = d; }
  }
  cache.set(key, best.rgb);
  return best.rgb;
}

function bands(source, horizontal, within, expected) {
  const span = horizontal ? source.width : source.height;
  const across = horizontal ? source.height : source.width;
  const runs = [];
  let start = -1;
  for (let at = 0; at <= span; at++) {
    let count = 0;
    if (at < span) for (let other = 0; other < across; other++) {
      if (within && (other < within.start || other > within.end)) continue;
      const x = horizontal ? at : other, y = horizontal ? other : at;
      if (source.rgba[(y * source.width + x) * 4 + 3] >= sourceAlphaMinimum) count++;
    }
    if (count >= 3) { if (start < 0) start = at; }
    else if (start >= 0) { runs.push({ start, end: at - 1 }); start = -1; }
  }
  if (runs.length < expected) throw new Error(`Expected ${expected} separated content bands, found ${runs.length}`);
  const gaps = runs.slice(1).map((run, i) => ({ after: i, size: run.start - runs[i].end - 1 }));
  const cuts = new Set(gaps.sort((a, b) => b.size - a.size).slice(0, expected - 1).map((gap) => gap.after));
  const merged = [];
  for (let i = 0; i < runs.length; i++) {
    if (i === 0 || cuts.has(i - 1)) merged.push({ ...runs[i] });
    else merged.at(-1).end = runs[i].end;
  }
  if (merged.length !== expected) throw new Error(`Expected ${expected} content bands, found ${merged.length}`);
  return merged;
}

function faceLandmark(rgba) {
  const skin = hexToRgb(palette.find((p) => p.key === "sand").hex);
  let top = size, bottom = -1;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++)
    if (rgba[(y * size + x) * 4 + 3]) { top = Math.min(top, y); bottom = Math.max(bottom, y); }
  const mask = new Uint8Array(size * size);
  for (let y = top; y < top + (bottom - top) * 0.65; y++) for (let x = 0; x < size; x++) {
    const p = (y * size + x) * 4;
    if (rgba[p + 3] && skin.every((v, c) => rgba[p + c] === v)) mask[y * size + x] = 1;
  }
  let face = { count: 0, sumX: 0, sumY: 0 };
  for (let at = 0; at < mask.length; at++) {
    if (!mask[at]) continue;
    const queue = [at], component = { count: 0, sumX: 0, sumY: 0 };
    mask[at] = 0;
    for (let i = 0; i < queue.length; i++) {
      const x = queue[i] % size, y = Math.floor(queue[i] / size);
      component.count++; component.sumX += x; component.sumY += y;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= size || ny >= size || !mask[ny * size + nx]) continue;
        mask[ny * size + nx] = 0; queue.push(ny * size + nx);
      }
    }
    if (component.count > face.count) face = component;
  }
  if (!face.count) throw new Error("Cannot locate witch face for walk registration");
  return { x: face.sumX / face.count, y: face.sumY / face.count, headSpan: face.sumY / face.count - top };
}

function normalize(source, column, row, columns, rows, region, tileSize = sourceTileSize, faceX) {
  const cellWidth = source.width / columns, cellHeight = source.height / rows;
  const cx = region ? (region.left + region.right + 1) / 2 : (column + 0.5) * cellWidth;
  const cy = region ? (region.top + region.bottom + 1) / 2 : (row + 0.5) * cellHeight;
  const sampled = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const x0 = cx + (x - size / 2) * cellWidth / tileSize / contentScale;
    const y0 = cy + (y - size / 2) * cellHeight / tileSize / contentScale;
    const x1 = x0 + cellWidth / tileSize / contentScale;
    const y1 = y0 + cellHeight / tileSize / contentScale;
    let weight = 0, alpha = 0, red = 0, green = 0, blue = 0;
    for (let sy = Math.floor(y0); sy < Math.ceil(y1); sy++) for (let sx = Math.floor(x0); sx < Math.ceil(x1); sx++) {
      const w = (Math.min(sx + 1, x1) - Math.max(sx, x0)) * (Math.min(sy + 1, y1) - Math.max(sy, y0));
      weight += w;
      if (sx < 0 || sy < 0 || sx >= source.width || sy >= source.height ||
          region && (sx < region.left || sx > region.right || sy < region.top || sy > region.bottom)) continue;
      const si = (sy * source.width + sx) * 4;
      const a = source.rgba[si + 3] >= sourceAlphaMinimum ? 1 : 0;
      alpha += a * w;
      red += source.rgba[si] * a * w; green += source.rgba[si + 1] * a * w; blue += source.rgba[si + 2] * a * w;
    }
    if (alpha / weight < 0.5) continue;
    sampled.set([...nearest([red / alpha, green / alpha, blue / alpha]), 255], (y * size + x) * 4);
  }
  // Boots define the foot anchor; sword/scarf changes cannot recenter the body.
  const brown = hexToRgb(palette.find((entry) => entry.key === "pBrown").hex);
  const boots = [];
  for (let y = 18; y < size; y++) for (let x = 0; x < size; x++) {
    const i = (y * size + x) * 4;
    if (sampled[i + 3] && brown.every((v, c) => sampled[i + c] === v)) boots.push({ x, y });
  }
  if (boots.length === 0) throw new Error(`Missing boot anchor in ${column},${row}`);
  const bottom = Math.max(...boots.map((p) => p.y));
  const feet = boots.filter((p) => p.y >= bottom - 3);
  const left = Math.min(...feet.map((p) => p.x));
  const right = Math.max(...feet.map((p) => p.x));
  // Walking must not recenter the torso on whichever foot happens to be planted.
  const dx = faceX === undefined ? anchor.x - Math.round((left + right) / 2) : Math.round(faceX - faceLandmark(sampled).x);
  let soleBottom = bottom;
  for (let y = bottom; y <= Math.min(size - 1, bottom + 3); y++)
    for (let x = Math.max(0, left - 1); x <= Math.min(size - 1, right + 1); x++)
      if (sampled[(y * size + x) * 4 + 3]) soleBottom = Math.max(soleBottom, y);
  const dy = anchor.y - 1 - soleBottom;
  const rgba = Buffer.alloc(size * size * 4);
  let opaque = 0, minX = size, minY = size, maxX = 0, maxY = 0;
  const usedColors = new Set();
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const si = (y * size + x) * 4;
    if (sampled[si + 3] === 0) continue;
    const tx = x + dx, ty = y + dy;
    if (tx < 1 || tx >= size - 1 || ty < 1 || ty >= size - 1)
      throw new Error(`Frame ${column},${row} would clip after foot alignment (${tx},${ty})`);
    sampled.copy(rgba, (ty * size + tx) * 4, si, si + 4);
    minX = Math.min(minX, tx); minY = Math.min(minY, ty);
    maxX = Math.max(maxX, tx); maxY = Math.max(maxY, ty);
    usedColors.add(sampled.subarray(si, si + 3).toString("hex"));
    opaque++;
  }
  if (opaque < 80) throw new Error(`Frame ${column},${row} is too sparse`);
  if (maxY !== anchor.y - 1) throw new Error(`Frame ${column},${row} has pixels below the shared sole plane`);
  return { rgba, stats: { opaque, colors: usedColors.size, bounds: { minX, minY, maxX, maxY }, shift: { x: dx, y: dy }, bootBaseline: soleBottom + dy + 1 } };
}

function enlarged(rgba, width, height, scale) {
  const result = Buffer.alloc(width * height * scale * scale * 4);
  for (let y = 0; y < height * scale; y++) for (let x = 0; x < width * scale; x++) {
    const si = (Math.floor(y / scale) * width + Math.floor(x / scale)) * 4;
    rgba.copy(result, (y * width * scale + x) * 4, si, si + 4);
  }
  return encodePng(width * scale, height * scale, result);
}


const seedPath = art + "mage-witch-seed-source.png";
const seedBytes = readFileSync(new URL(seedPath, root));
const seed = normalize(decodePng(seedBytes), 0, 0, 1, 1, null, 64);
write(art + "mage-witch-seed-64x64.png", encodePng(size, size, seed.rgba));
write(art + "mage-witch-seed-8x.png", enlarged(seed.rgba, size, size, 8));
if (process.argv.includes("--seed-only")) {
  const width = 1024, height = 1536, canvas = Buffer.alloc(width * height * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const p = (y * size + x) * 4;
    if (!seed.rgba[p + 3]) continue;
    for (let dy = 0; dy < 6; dy++) for (let dx = 0; dx < 6; dx++) {
      const tx = 128 + (x - anchor.x) * 6 + dx, ty = 236 + (y - anchor.y) * 6 + dy;
      if (tx < 0 || ty < 0 || tx >= 256 || ty >= 256) throw new Error("Seed does not fit animation canvas");
      seed.rgba.copy(canvas, (ty * width + tx) * 4, p, p + 4);
    }
  }
  write(art + "mage-witch-edit-canvas.png", encodePng(width, height, canvas));
  console.log(JSON.stringify({ seed: seed.stats, sha256: hash(seedBytes) }));
} else {
  const width = 256, height = 768, sheet = Buffer.alloc(width * height * 4);
  const frames = [], sources = [];
  const rowActions = ["idle", "run", "run", "chant", "release", "dash"];
  for (const [directionIndex, direction] of ["right", "left"].entries()) {
    const path = art + "mage-witch-" + direction + "-source.png";
    const bytes = readFileSync(new URL(path, root)), source = decodePng(bytes);
    const vertical = bands(source, false, null, 6);
    const regions = vertical.map((v) => bands(source, true, v, 4).map((h) => ({ left: h.start, right: h.end, top: v.start, bottom: v.end })));
    sources.push({ path, width: source.width, height: source.height, sha256: hash(bytes) });
    const walkPath = art + "mage-witch-walk-" + direction + "-source.png";
    const walkBytes = readFileSync(new URL(walkPath, root)), walkSource = decodePng(walkBytes);
    const walkBands = bands(walkSource, false, null, 2);
    const walkRegions = walkBands.map((v) => bands(walkSource, true, v, 4).map((h) => ({ left: h.start, right: h.end, top: v.start, bottom: v.end })));
    const referenceFrame = normalize(source, 0, 0, 4, 6, regions[0][0]);
    const probeFrame = normalize(walkSource, 0, 0, 4, 2, walkRegions[0][0], 48);
    const reference = faceLandmark(referenceFrame.rgba);
    const probe = faceLandmark(probeFrame.rgba);
    // Different generated canvas resolutions still share the approved body height.
    // This is one scale per whole eight-frame strip, never a per-pose resize.
    const referenceHeight = referenceFrame.stats.bounds.maxY - referenceFrame.stats.bounds.minY + 1;
    const probeHeight = probeFrame.stats.bounds.maxY - probeFrame.stats.bounds.minY + 1;
    const walkTileSize = 48 * referenceHeight / probeHeight;
    if (walkTileSize < 24 || walkTileSize > 72) throw new Error("Walk reference scale is invalid");
    sources.push({ path: walkPath, width: walkSource.width, height: walkSource.height, sha256: hash(walkBytes), walkTileSize, referenceHeight, probeHeight, referenceFace: reference, probeFace: probe });
    for (let row = 0; row < 6; row++) for (let column = 0; column < 4; column++) {
      const walking = row === 1 || row === 2;
      const frame = walking ? normalize(walkSource, column, row - 1, 4, 2, walkRegions[row - 1][column], walkTileSize, reference.x)
        : normalize(source, column, row, 4, 6, regions[row][column]);
      if (directionIndex === 0 && row === 0 && column === 0) {
        write(art + "mage-witch-runtime-seed-64x64.png", encodePng(size, size, frame.rgba));
        write(art + "mage-witch-runtime-seed-8x.png", enlarged(frame.rgba, size, size, 8));
      }
      const x = column * size, y = (directionIndex * 6 + row) * size;
      for (let line = 0; line < size; line++) frame.rgba.copy(sheet, ((y + line) * width + x) * 4, line * size * 4, (line + 1) * size * 4);
      frames.push({ name: direction + "-" + rowActions[row] + "-" + ((row === 2 ? 4 : 0) + column), index: frames.length, x, y,
        region: walking ? walkRegions[row - 1][column] : regions[row][column], source: walking ? walkPath : path, ...frame.stats });
    }
  }
  const png = encodePng(width, height, sheet);
  write(output + "mage-witch-64x64.png", png);
  const previewWidth = size * 8, previewHeight = size * 6, contact = Buffer.alloc(previewWidth * previewHeight * 4);
  for (const frame of frames) for (let y = 0; y < size; y++) {
    const dx = (frame.index % 4 + Math.floor(frame.index / 24) * 4) * size;
    const dy = Math.floor(frame.index % 24 / 4) * size + y;
    sheet.copy(contact, (dy * previewWidth + dx) * 4, ((frame.y + y) * width + frame.x) * 4, ((frame.y + y) * width + frame.x + size) * 4);
  }
  write(art + "mage-witch-contact-sheet-4x.png", enlarged(contact, previewWidth, previewHeight, 4));
  json(art + "asset-record.json", { schema: 1, date: "2026-11-01", tool: "built-in image_gen.imagegen", model: null, seed: null,
    image: output + "mage-witch-64x64.png", width, height, frameSize: size, anchor, frames,
    palette: palette.map(({ key, hex }) => ({ key, hex })), alphaValues: [0, 255],
    sources: [{ path: seedPath, sha256: hash(seedBytes) }, ...sources],
    prompts: ["mage-witch-seed-prompt.txt", "mage-witch-right-prompt.txt", "mage-witch-right-fix-prompt.txt", "mage-witch-left-prompt.txt", "mage-witch-walk-right-prompt.txt", "mage-witch-walk-left-prompt.txt"].map((p) => art + p),
    references: ["assets/characters/katana/katana-c-seed-16x.png", "assets/characters/shooter/shooter-c-seed-8x.png"],
    sourceHistory: [art + "mage-witch-right-source-v1.png", art + "mage-witch-before-walk.png"],
    processing: { script: "scripts/build-mage-character-assets.mjs", sampling: "transparent-gap segmentation; one shared scale per source-width unit; premultiplied area sampling; Lab palette; binary alpha",
      sourceTileSize, contentScale, sourceAlphaMinimum, anchor: "sole plane; walk torso registered to approved face landmark instead of moving support foot", mirroredFrames: false }, sha256: hash(png) });
  console.log(JSON.stringify({ width, height, frames: frames.length, sha256: hash(png) }));
}
