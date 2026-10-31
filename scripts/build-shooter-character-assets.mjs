/** Rebuild the scout body and three independently aimed weapon rigs. No dependencies. */
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { decodePng, encodePng } from "./lib/png.mjs";
import { loadPalette, hexToRgb } from "./lib/palette.mjs";

const root = new URL("../", import.meta.url);
const art = "assets/characters/shooter/";
const output = "public/assets/characters/";
const size = 64, sourceTileSize = 32, contentScale = 1;
const weaponScale = 0.6;
const anchor = { x: 32, y: 59 };
const actions = ["idle", "run", "brace", "dash"], directions = ["right", "left"];
const actionCounts = { idle: 4, run: 8, brace: 4, dash: 4 };
const actionStarts = { idle: 0, run: 4, brace: 12, dash: 16 };
const directionFrames = 20, runSourceScale = 1;
const weapons = ["charged", "laser", "missile"];
const keys = ["ink0", "ink1", "pBrown", "sand", "steelLight", "steelMid", "steelDark", "bone", "pGold", "pBlue", "pBlueDk", "iceDeep", "iceCyan"];
const palette = loadPalette().filter((entry) => keys.includes(entry.key));
if (palette.length !== keys.length) throw new Error("Shooter palette keys are missing");
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

function weaponFrame(source, region, mask) {
  const width = 32, height = 24, rgba = Buffer.alloc(width * height * 4);
  const pixel = Math.max(source.width / 4 / 32, source.height / 3 / 24) / weaponScale;
  const cx = (region.left + region.right + 1) / 2, cy = (region.top + region.bottom + 1) / 2;
  const samples = [];
  let maxX = -1;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const x0 = cx + (x - width / 2) * pixel, y0 = cy + (y - height / 2) * pixel;
    const x1 = x0 + pixel, y1 = y0 + pixel;
    let a = 0, weight = 0, red = 0, green = 0, blue = 0;
    for (let sy = Math.floor(y0); sy < Math.ceil(y1); sy++) for (let sx = Math.floor(x0); sx < Math.ceil(x1); sx++) {
      const w = (Math.min(sx + 1, x1) - Math.max(sx, x0)) * (Math.min(sy + 1, y1) - Math.max(sy, y0));
      weight += w;
      if (sx < region.left || sx > region.right || sy < region.top || sy > region.bottom ||
          mask.labels[(sy - mask.top) * source.width + sx] !== region.componentId) continue;
      const i = (sy * source.width + sx) * 4, alpha = source.rgba[i + 3] / 255;
      a += alpha * w; red += source.rgba[i] * alpha * w; green += source.rgba[i + 1] * alpha * w; blue += source.rgba[i + 2] * alpha * w;
    }
    if (a / weight < 0.5) continue;
    samples.push({ x, y, color: nearest([red / a, green / a, blue / a]) });
    maxX = Math.max(maxX, x);
  }
  if (samples.length < 12) throw new Error("Weapon frame is empty or too sparse");
  const tip = samples.filter((p) => p.x >= maxX - 1);
  const axisY = Math.round((Math.min(...tip.map(p => p.y)) + Math.max(...tip.map(p => p.y))) / 2);
  const dx = 24 - maxX, dy = 12 - axisY;
  for (const p of samples) {
    const x = p.x + dx, y = p.y + dy;
    if (x < 1 || x >= width - 1 || y < 1 || y >= height - 1) throw new Error("Weapon clips after muzzle alignment");
    rgba.set([...p.color, 255], (y * width + x) * 4);
  }
  return { rgba, stats: { opaque: samples.length, shift: { x: dx, y: dy }, muzzle: { x: 24, y: 12 } } };
}

const seedPath = art + "shooter-c-seed-source.png";
const seedBytes = readFileSync(new URL(seedPath, root));
const seed = normalize(decodePng(seedBytes), 0, 0, 1, 1);
write(art + "shooter-c-seed-64x64.png", encodePng(size, size, seed.rgba));
write(art + "shooter-c-seed-8x.png", enlarged(seed.rgba, size, size, 8));
if (process.argv.includes("--seed-only")) {
  console.log(JSON.stringify({ seed: seed.stats, sha256: hash(seedBytes) }, null, 2));
} else {
  const width = 256, height = 640, sheet = Buffer.alloc(width * height * 4);
  const frames = [], sources = [];
  for (let direction = 0; direction < directions.length; direction++) {
    const path = art + `shooter-c-${directions[direction]}-source.png`;
    const bytes = readFileSync(new URL(path, root)), source = decodePng(bytes);
    const rows = bands(source, false, null, 4).map(vertical => characterRegions(source, vertical));
    sources.push({ path, width: source.width, height: source.height, sha256: hash(bytes) });
    const runPath = art + `shooter-c-run-${directions[direction]}-source.png`;
    const runBytes = readFileSync(new URL(runPath, root)), runSource = decodePng(runBytes);
    const runRows = bands(runSource, false, null, 2).map(vertical => characterRegions(runSource, vertical));
    sources.push({ path: runPath, width: runSource.width, height: runSource.height, sha256: hash(runBytes) });
    for (let action = 0; action < 4; action++) for (let frame = 0; frame < actionCounts[actions[action]]; frame++) {
      const running = actions[action] === "run", column = frame % 4;
      const sourceRow = running ? Math.floor(frame / 4) : action;
      const selectedRows = running ? runRows : rows;
      const region = selectedRows[sourceRow].regions[column];
      const normalized = normalize(running ? runSource : source, column, sourceRow, 4, running ? 2 : 4,
        region, sourceTileSize, running ? runSourceScale : contentScale, selectedRows[sourceRow].mask);
      if (direction === 0 && action === 0 && frame === 0) {
        write(art + "shooter-c-seed-64x64.png", encodePng(size, size, normalized.rgba));
        write(art + "shooter-c-seed-8x.png", enlarged(normalized.rgba, size, size, 8));
      }
      const index = direction * directionFrames + actionStarts[actions[action]] + frame;
      const x = index % 4 * size, y = Math.floor(index / 4) * size;
      for (let row = 0; row < size; row++) normalized.rgba.copy(sheet, ((y + row) * width + x) * 4, row * size * 4, (row + 1) * size * 4);
      frames.push({ name: `${directions[direction]}-${actions[action]}-${frame}`, index: frames.length, x, y, region, ...normalized.stats });
    }
  }
  const bodyPng = encodePng(width, height, sheet);
  write(output + "shooter-scout-body-64x64.png", bodyPng);
  const weaponPath = art + "shooter-c-weapons-source.png";
  const weaponBytes = readFileSync(new URL(weaponPath, root)), weaponSource = decodePng(weaponBytes);
  const weaponRows = bands(weaponSource, false, null, 3).map(vertical => characterRegions(weaponSource, vertical));
  const weaponSheet = Buffer.alloc(128 * 72 * 4), weaponFrames = [];
  for (let row = 0; row < 3; row++) for (let frame = 0; frame < 4; frame++) {
    const region = weaponRows[row].regions[frame], normalized = weaponFrame(weaponSource, region, weaponRows[row].mask);
    const x = frame * 32, y = row * 24;
    for (let line = 0; line < 24; line++) normalized.rgba.copy(weaponSheet, ((y + line) * 128 + x) * 4, line * 32 * 4, (line + 1) * 32 * 4);
    weaponFrames.push({ name: `${weapons[row]}-${frame}`, index: weaponFrames.length, x, y, region, ...normalized.stats });
  }
  const weaponPng = encodePng(128, 72, weaponSheet);
  write(output + "shooter-scout-weapons-32x24.png", weaponPng);
  write(art + "shooter-c-weapons-contact-sheet-8x.png", enlarged(weaponSheet, 128, 72, 8));
  const minX = Math.min(...frames.map(f => f.bounds.minX)) - 2, minY = Math.min(...frames.map(f => f.bounds.minY)) - 2;
  const cw = Math.max(...frames.map(f => f.bounds.maxX)) - minX + 3, ch = Math.max(...frames.map(f => f.bounds.maxY)) - minY + 3;
  const pw = cw * 4, ph = ch * (height / size), preview = Buffer.alloc(pw * ph * 4);
  for (const f of frames) for (let y = 0; y < ch; y++) {
    const si = ((f.y + minY + y) * width + f.x + minX) * 4;
    const di = ((f.y / size * ch + y) * pw + f.x / size * cw) * 4;
    sheet.copy(preview, di, si, si + cw * 4);
  }
  write(art + "shooter-c-body-contact-sheet-6x.png", enlarged(preview, pw, ph, 6));
  json(art + "asset-record.json", {
    schema: 1, date: "2026-11-01", selectedConcept: "C", tool: "built-in image_gen.imagegen", model: null, seed: null,
    body: { image: output + "shooter-scout-body-64x64.png", width, height, frameSize: size, anchor, frames,
      directionFrames, actionStarts, actionCounts,
      run: { stride: 28, distancePerFrame: 3.5, lift: [0, 0, 1, 1, 0, 0, 1, 1], previousImage: art + "shooter-c-body-before-run.png" },
      sha256: hash(bodyPng) },
    weapons: { image: output + "shooter-scout-weapons-32x24.png", width: 128, height: 72, frameWidth: 32, frameHeight: 24,
      grip: { x: 17, y: 12 }, muzzle: { x: 24, y: 12 }, frames: weaponFrames, sha256: hash(weaponPng) },
    palette: palette.map(({ key, hex }) => ({ key, hex })), alphaValues: [0, 255],
    sources: [{ path: seedPath, sha256: hash(seedBytes) }, ...sources, { path: weaponPath, width: weaponSource.width, height: weaponSource.height, sha256: hash(weaponBytes) }],
    processing: { script: "scripts/build-shooter-character-assets.mjs", sampling: "row-gap / connected silhouettes; shared scale; premultiplied-alpha area sampling",
      sourceTileSize, contentScale, runSourceScale, weaponScale, quantization: "nearest Lab palette color", alphaThreshold: 128, seedFrame: "right-idle-0", mirroredBodyFrames: false },
  });
  console.log(JSON.stringify({ body: [width, height, frames.length], weapons: [128, 72, weaponFrames.length], sha256: hash(bodyPng) }));
}
