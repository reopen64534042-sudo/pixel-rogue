/** Rebuild the selected heavy mercenary, using the established character normalization pipeline. */
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { decodePng, encodePng } from "./lib/png.mjs";
import { loadPalette, hexToRgb } from "./lib/palette.mjs";

const root = new URL("../", import.meta.url);
const art = "assets/characters/greatsword/";
const output = "public/assets/characters/";
const size = 96;
const sourceTileSize = 48;
const contentScale = 0.8;
const anchor = { x: 48, y: 83 };
const actions = ["idle", "run", "attack", "dash", "heavy", "takeoff", "air", "land"];
const directions = ["right", "left"];
const groups = ["base", "skills"];
const keys = ["ink0", "ink1", "pBrown", "sand", "steelLight", "steelMid", "steelDark", "bone", "stoneRed", "stoneDark", "pGold"];
const palette = loadPalette().filter((entry) => keys.includes(entry.key));
if (palette.length !== keys.length) throw new Error("Greatsword character palette keys are missing");
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const write = (path, bytes) => writeFileSync(new URL(path, root), bytes);
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
      if (source.rgba[(y * source.width + x) * 4 + 3] >= 128) count++;
    }
    if (count >= 3) { if (start < 0) start = at; }
    else if (start >= 0) { runs.push({ start, end: at - 1 }); start = -1; }
  }
  if (runs.length < expected) throw new Error(`Expected ${expected} separated ${horizontal ? "column" : "row"} bands, found ${runs.length}; within=${JSON.stringify(within)}; runs=${JSON.stringify(runs)}`);
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

function characterRegions(source, vertical) {
  const width = source.width, height = vertical.end - vertical.start + 1;
  const labels = new Int32Array(width * height), queue = new Int32Array(labels.length);
  const components = [];
  let nextId = 0;
  for (let at = 0; at < labels.length; at++) {
    if (labels[at] || source.rgba[((vertical.start * width) + at) * 4 + 3] < 128) continue;
    const component = { componentId: ++nextId, left: width, right: 0, top: source.height, bottom: 0, pixels: 0 };
    let head = 0, tail = 1;
    queue[0] = at;
    labels[at] = nextId;
    while (head < tail) {
      const current = queue[head++], x = current % width, localY = Math.floor(current / width), y = localY + vertical.start;
      component.left = Math.min(component.left, x); component.right = Math.max(component.right, x);
      component.top = Math.min(component.top, y); component.bottom = Math.max(component.bottom, y);
      component.pixels++;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx, ny = localY + dy;
        if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
        const neighbor = ny * width + nx;
        if (labels[neighbor] || source.rgba[((ny + vertical.start) * width + nx) * 4 + 3] < 128) continue;
        labels[neighbor] = nextId;
        queue[tail++] = neighbor;
      }
    }
    components.push(component);
  }
  components.sort((a, b) => b.pixels - a.pixels);
  if (components.length < 4) throw new Error("Cannot isolate four character silhouettes");
  if (components[4] && components[4].pixels > components[3].pixels * 0.15)
    throw new Error("A substantial disconnected character part needs source-art repair");
  const regions = components.slice(0, 4).sort((a, b) => a.left + a.right - b.left - b.right);
  return { regions, mask: { labels, top: vertical.start } };
}

function normalize(source, column, row, columns, rows, region, tileSize = sourceTileSize, scale = contentScale, mask) {
  const cellWidth = source.width / columns, cellHeight = source.height / rows;
  const cx = region ? (region.left + region.right + 1) / 2 : (column + 0.5) * cellWidth;
  const cy = region ? (region.top + region.bottom + 1) / 2 : (row + 0.5) * cellHeight;
  const sampled = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const x0 = cx + (x - size / 2) * cellWidth / tileSize / scale;
    const y0 = cy + (y - size / 2) * cellHeight / tileSize / scale;
    const x1 = x0 + cellWidth / tileSize / scale;
    const y1 = y0 + cellHeight / tileSize / scale;
    let weight = 0, alpha = 0, red = 0, green = 0, blue = 0;
    for (let sy = Math.floor(y0); sy < Math.ceil(y1); sy++) for (let sx = Math.floor(x0); sx < Math.ceil(x1); sx++) {
      const w = (Math.min(sx + 1, x1) - Math.max(sx, x0)) * (Math.min(sy + 1, y1) - Math.max(sy, y0));
      weight += w;
      if (sx < 0 || sy < 0 || sx >= source.width || sy >= source.height ||
          region && (sx < region.left || sx > region.right || sy < region.top || sy > region.bottom)) continue;
      if (mask && mask.labels[(sy - mask.top) * source.width + sx] !== region.componentId) continue;
      const si = (sy * source.width + sx) * 4;
      const a = source.rgba[si + 3] / 255;
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
  const dx = anchor.x - Math.round((left + right) / 2);
  // Include the steel toe and outline just below the brown sole; the blade is excluded.
  let bootBottom = bottom;
  for (let y = bottom; y <= Math.min(size - 1, bottom + 3); y++)
    for (let x = Math.max(0, left - 1); x <= Math.min(size - 1, right + 1); x++)
      if (sampled[(y * size + x) * 4 + 3]) bootBottom = Math.max(bootBottom, y);
  const dy = anchor.y - 1 - bootBottom;
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
  return { rgba, stats: { opaque, colors: usedColors.size, bounds: { minX, minY, maxX, maxY },
    shift: { x: dx, y: dy }, bootBaseline: bootBottom + dy + 1 } };
}

function enlarged(rgba, width, height, scale) {
  const result = Buffer.alloc(width * height * scale * scale * 4);
  for (let y = 0; y < height * scale; y++) for (let x = 0; x < width * scale; x++) {
    const si = (Math.floor(y / scale) * width + Math.floor(x / scale)) * 4;
    rgba.copy(result, (y * width * scale + x) * 4, si, si + 4);
  }
  return encodePng(width * scale, height * scale, result);
}

const seedPath = art + "greatsword-c-seed-source-v2.png";
const seedBytes = readFileSync(new URL(seedPath, root));
const seed = normalize(decodePng(seedBytes), 0, 0, 1, 1, undefined, 80, 1);
write(art + "greatsword-c-seed-96x96.png", encodePng(size, size, seed.rgba));
write(art + "greatsword-c-seed-8x.png", enlarged(seed.rgba, size, size, 8));
if (process.argv.includes("--seed-only")) {
  console.log(JSON.stringify({ seed: seed.stats, sha256: hash(seedBytes) }, null, 2));
} else {
  const width = size * 4, height = size * actions.length * directions.length;
  const sheet = Buffer.alloc(width * height * 4);
  const frames = [], sources = [];
  for (let direction = 0; direction < directions.length; direction++) for (let group = 0; group < groups.length; group++) {
    const path = art + `greatsword-c-${directions[direction]}-${groups[group]}-source.png`;
    const bytes = readFileSync(new URL(path, root));
    const source = decodePng(bytes);
    const rowBands = bands(source, false, null, 4);
    const rows = rowBands.map((vertical) => characterRegions(source, vertical));
    sources.push({ path, width: source.width, height: source.height, sha256: hash(bytes) });
    for (let action = 0; action < 4; action++) for (let frame = 0; frame < 4; frame++) {
      const region = rows[action].regions[frame];
      const normalized = normalize(source, frame, action, 4, 4, region, sourceTileSize, contentScale, rows[action].mask);
      if (direction === 0 && group === 0 && action === 0 && frame === 0) {
        write(art + "greatsword-c-seed-96x96.png", encodePng(size, size, normalized.rgba));
        write(art + "greatsword-c-seed-8x.png", enlarged(normalized.rgba, size, size, 8));
      }
      const clip = group * 4 + action;
      const x = frame * size, y = (direction * actions.length + clip) * size;
      for (let row = 0; row < size; row++)
        normalized.rgba.copy(sheet, ((y + row) * width + x) * 4, row * size * 4, (row + 1) * size * 4);
      frames.push({ name: `${directions[direction]}-${actions[clip]}-${frame}`, index: frames.length,
        x, y, region, ...normalized.stats });
    }
  }
  const png = encodePng(width, height, sheet);
  write(output + "greatsword-mercenary-96x96.png", png);
  const crop = {
    left: Math.max(0, Math.min(...frames.map((f) => f.bounds.minX)) - 2),
    top: Math.max(0, Math.min(...frames.map((f) => f.bounds.minY)) - 2),
    right: Math.min(size - 1, Math.max(...frames.map((f) => f.bounds.maxX)) + 2),
    bottom: Math.min(size - 1, Math.max(...frames.map((f) => f.bounds.maxY)) + 2),
  };
  const cw = crop.right - crop.left + 1, ch = crop.bottom - crop.top + 1;
  for (let group = 0; group < groups.length; group++) {
    const pw = cw * 4, ph = ch * 8, preview = Buffer.alloc(pw * ph * 4);
    for (const f of frames) {
      const sourceRow = f.y / size, clip = sourceRow % actions.length;
      if (Math.floor(clip / 4) !== group) continue;
      const destinationRow = Math.floor(sourceRow / actions.length) * 4 + clip % 4;
      for (let y = 0; y < ch; y++) {
        const si = ((f.y + crop.top + y) * width + f.x + crop.left) * 4;
        const di = ((destinationRow * ch + y) * pw + f.x / size * cw) * 4;
        sheet.copy(preview, di, si, si + cw * 4);
      }
    }
    write(art + `greatsword-c-${groups[group]}-contact-sheet-4x.png`, enlarged(preview, pw, ph, 4));
  }
  json(art + "asset-record.json", {
    schema: 1, selectedConcept: "C", date: "2026-11-01", tool: "built-in image_gen.imagegen", model: null, seed: null,
    image: output + "greatsword-mercenary-96x96.png", width, height, frameSize: size, anchor, actions, directions, frames,
    palette: palette.map(({ key, hex }) => ({ key, hex })), alphaValues: [0, 255],
    sources: [{ path: seedPath, sha256: hash(seedBytes) }, ...sources],
    processing: { script: "scripts/build-greatsword-character-assets.mjs",
      sampling: "row-gap and connected-silhouette segmentation; premultiplied-alpha area sampling at one shared scale; no per-frame resize",
      sourceTileSize, seedTileSize: 80, seedScale: 1, contentScale, alphaThreshold: 128, quantization: "nearest Lab palette color",
      anchor: "brown boot sole plus adjacent steel toe/outline, independent of sword bounds", seedFrame: "right-idle-0 from the same normalized sheet", mirroredFrames: false },
    sha256: hash(png),
  });
  console.log(JSON.stringify({ width, height, frames: frames.length, sha256: hash(png) }));
}
