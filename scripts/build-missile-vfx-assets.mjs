/** Fixed shared grids and anchors; no per-frame crop, rescale or recenter. */
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { decodePng, encodePng } from "./lib/png.mjs";
import { loadPalette, hexToRgb } from "./lib/palette.mjs";

const root = new URL("../", import.meta.url);
const out = "public/assets/vfx/missile/";
const art = "assets/vfx/missile/";
const hash = bytes => createHash("sha256").update(bytes).digest("hex");
const json = (path, value) => writeFileSync(new URL(path, root), JSON.stringify(value, null, 2) + "\n");
const colors = Object.fromEntries(loadPalette().map(c => [c.key, hexToRgb(c.hex)]));
const metal = ["ink0", "ink1", "steelDark", "steelMid", "steelLight", "bone", "gold", "pGold"];
const fire = ["fireDeep", "fireOrange", "pGold", "gold", "fireYellow", "white"];
const smoke = ["ink1", "steelDark", "steelMid"];
const ion = ["iceDeep", "iceCyan", "bone", "white", "gold"];
const sources = ["source-master.png", "source-companion.png"].map((file, index) => {
  const path = art + file, bytes = readFileSync(new URL(path, root));
  return { path, ...decodePng(bytes), columns: 8, rows: index ? 4 : 8, sha256: hash(bytes) };
});
mkdirSync(new URL(out, root), { recursive: true });
mkdirSync(new URL("src/game/rendering/vfx/missile/", root), { recursive: true });

function sourcePixel(source, row, frame, u, v) {
  if (u < 0 || v < 0 || u >= 1 || v >= 1) return null;
  const x = Math.min(source.width - 1, Math.floor((frame + u) * source.width / source.columns));
  const y = Math.min(source.height - 1, Math.floor((row + v) * source.height / source.rows));
  const at = (y * source.width + x) * 4;
  return source.rgba[at + 3] >= 208 ? [...source.rgba.subarray(at, at + 3)] : null;
}
function nearest(rgb, keys) {
  let best, distance = Infinity;
  for (const key of keys) {
    if (!colors[key]) throw new Error(`Unknown palette key ${key}`);
    const color = colors[key], d = color.reduce((sum, c, i) => sum + (rgb[i] - c) ** 2, 0);
    if (d < distance) { best = color; distance = d; }
  }
  return best;
}
// A union in a common 64x64 sampling grid, not a separate crop for each frame.
function unionBounds(source, row, frames) {
  let x0 = 64, y0 = 64, x1 = -1, y1 = -1;
  for (const f of frames) for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
    if (!sourcePixel(source, row, f, (x + 0.5) / 64, (y + 0.5) / 64)) continue;
    x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
  }
  if (x1 < x0) throw new Error(`Empty source row ${row}`);
  return { x0, y0, x1, y1, cx: (x0 + x1 + 1) / 2, cy: (y0 + y1 + 1) / 2 };
}
const all = Array.from({ length: 8 }, (_, i) => i);
const loop = [0, 1, 2, 3, 4, 3, 2, 1];
const specs = [
  { key: "body", row: 0, w: 32, h: 16, anchor: [16, 8], palette: metal, rigid: true, fit: [18, 9], times: Array(8).fill(0.05), loop: true },
  { key: "eject", row: 1, w: 32, h: 32, anchor: [16, 16], palette: smoke, fit: [19, 18], times: [0.02, 0.025, 0.03, 0.035, 0.04, 0.045, 0.05, 0.055] },
  { key: "ignite", row: 2, w: 32, h: 16, anchor: [28, 8], palette: fire, jet: true, reveal: true, fit: [12, 7], times: [0.015, 0.015, 0.02, 0.02, 0.025, 0.025, 0.03, 0.03] },
  { key: "exhaust", row: 3, w: 32, h: 16, anchor: [28, 8], palette: fire, jet: true, fit: [12, 7], times: Array(8).fill(0.04), loop: true },
  { key: "blast", row: 4, w: 64, h: 64, anchor: [32, 32], palette: fire, fit: [56, 56], radius: 28, times: [0.015, 0.025, 0.04, 0.055, 0.065, 0.075, 0.08, 0.09] },
  { key: "smoke", row: 5, w: 64, h: 64, anchor: [32, 32], palette: smoke, fit: [58, 58], radius: 29, times: [0.04, 0.05, 0.06, 0.07, 0.075, 0.08, 0.085, 0.09] },
  { key: "debris", row: 6, w: 32, h: 32, anchor: [16, 16], palette: fire, fit: [27, 27], times: [0.025, 0.03, 0.035, 0.04, 0.05, 0.055, 0.065, 0.08] },
  { key: "ion-blast", row: 7, w: 64, h: 64, anchor: [32, 32], palette: ion, fit: [56, 56], radius: 28, times: [0.015, 0.025, 0.04, 0.055, 0.065, 0.075, 0.08, 0.09] },
  { key: "micro-body", source: 1, row: 0, w: 16, h: 12, anchor: [8, 6], palette: metal, rigid: true, fit: [11, 5], times: Array(8).fill(0.05), loop: true },
  { key: "micro-blast", source: 1, row: 1, w: 32, h: 32, anchor: [16, 16], palette: fire, fit: [24, 24], radius: 12, times: [0.015, 0.025, 0.03, 0.04, 0.045, 0.05, 0.06, 0.07] },
  { key: "arc", source: 1, row: 2, w: 32, h: 16, anchor: [0, 8], palette: ion, link: true, times: [0.012, 0.014, 0.016, 0.018, 0.02, 0.02, 0.025, 0.025] },
  { key: "ion-exhaust", source: 1, row: 3, w: 32, h: 16, anchor: [28, 8], palette: ion, jet: true, fit: [12, 7], times: Array(8).fill(0.04), loop: true },
];
const atlasW = 544, atlasH = specs.length * 68;
const atlasData = Buffer.alloc(atlasW * atlasH * 4), atlasFrames = {}, clips = {}, frames = [], frameStats = [];
const normalized = [];
for (const [rowIndex, spec] of specs.entries()) {
  const source = sources[spec.source ?? 0];
  // Ignition reveals one anchored late-ignition source; the generator's early sparks drift.
  const sourceFrames = spec.rigid ? Array(8).fill(0) : spec.reveal ? Array(8).fill(7) : spec.loop ? loop : all;
  const bounds = unionBounds(source, spec.row, [...new Set(sourceFrames)]);
  const scale = spec.link ? 1 : Math.min(spec.fit[0] / (bounds.x1 - bounds.x0 + 1), spec.fit[1] / (bounds.y1 - bounds.y0 + 1));
  normalized.push({ key: spec.key, bounds, sharedScale: scale, sourceFrames });
  const strip = Buffer.alloc(spec.w * 8 * spec.h * 4);
  for (let f = 0; f < 8; f++) {
    let count = 0, x0 = spec.w, y0 = spec.h, x1 = -1, y1 = -1;
    for (let y = 0; y < spec.h; y++) for (let x = 0; x < spec.w; x++) {
      const dx = x + 0.5 - spec.anchor[0], dy = y + 0.5 - spec.anchor[1];
      if (spec.radius && Math.hypot(dx, dy) > spec.radius) continue;
      if (spec.jet && (dx > 0 || dx < -12 || Math.abs(dy) > 4)) continue;
      if (spec.reveal && -dx > (f + 1) / 8 * 12) continue;
      let u, v;
      if (spec.link) { u = (x + 0.5) / spec.w; v = (y + 0.5 - 8) / 32 + bounds.cy / 64; }
      else {
        u = ((spec.jet ? bounds.x1 + 1 : bounds.cx) + dx / scale) / 64;
        v = (bounds.cy + dy / scale) / 64;
      }
      const sample = sourcePixel(source, spec.row, sourceFrames[f], u, v);
      if (!sample) continue;
      const color = nearest(sample, spec.palette);
      const pixel = [...color, 255];
      const at = ((y * spec.w * 8) + f * spec.w + x) * 4;
      strip.set(pixel, at);
      atlasData.set(pixel, ((rowIndex * 68 + 2 + y) * atlasW + f * 68 + 2 + x) * 4);
      count++; x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
    }
    if (!count) throw new Error(`Empty exported frame: ${spec.key}-${f}`);
    const name = `${spec.key}-${f}`, rect = { x: f * 68 + 2, y: rowIndex * 68 + 2, w: spec.w, h: spec.h };
    const visibleBounds = { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
    atlasFrames[name] = { frame: rect, rotated: false, trimmed: false, sourceSize: { w: spec.w, h: spec.h },
      spriteSourceSize: { x: 0, y: 0, w: spec.w, h: spec.h }, pivot: { x: spec.anchor[0] / spec.w, y: spec.anchor[1] / spec.h } };
    frames.push({ name, ...rect, anchor: spec.anchor, visibleBounds });
    frameStats.push({ name, opaquePixels: count, visibleBounds });
  }
  const bytes = encodePng(spec.w * 8, spec.h, strip);
  writeFileSync(new URL(out + spec.key + ".png", root), bytes);
  clips[spec.key] = { width: spec.w, height: spec.h, anchor: spec.anchor, frames: all.map(f => `${spec.key}-${f}`),
    frameDurations: spec.times, duration: spec.times.reduce((a, b) => a + b, 0), loop: !!spec.loop,
    image: spec.key + ".png", sha256: hash(bytes) };
}
const atlasBytes = encodePng(atlasW, atlasH, atlasData);
const usedColors = new Set(), allowed = new Set(Object.values(colors).map(c => c.join(",")));
let transparent = 0;
for (let at = 0; at < atlasData.length; at += 4) {
  if (!atlasData[at + 3]) { transparent++; continue; }
  const rgb = [...atlasData.subarray(at, at + 3)].join(",");
  if (atlasData[at + 3] !== 255 || !allowed.has(rgb)) throw new Error("Invalid palette or alpha");
  usedColors.add(rgb);
}
if (!transparent) throw new Error("Atlas has no transparency");
writeFileSync(new URL(out + "missile.atlas.png", root), atlasBytes);
json(out + "missile.atlas.json", { frames: atlasFrames, meta: { app: "Pixel Rogue missile VFX", version: "1", image: "missile.atlas.png", format: "RGBA8888", size: { w: atlasW, h: atlasH }, scale: "1" } });
const processing = { script: "scripts/build-missile-vfx-assets.mjs", alphaThreshold: 208,
  sampling: "shared 64x64 nearest-neighbor grid and one union transform per clip; palette from palette.ts",
  perFrameCrop: false, perFrameRescale: false, perFrameRecenter: false,
  rigidHardware: "source frame 0 reused for all frames; never morph metal or stretch with engine",
  ignition: "leftward reveal of fixed final ignition frame; no per-frame attachment drift",
  loops: "ping-pong source frames 0,1,2,3,4,3,2,1", transforms: normalized };
const sourceRecords = sources.map((s, i) => ({ path: s.path, width: s.width, height: s.height, grid: [s.columns, s.rows], sha256: s.sha256,
  tool: "built-in image_gen", model: null, seed: null, prompt: art + (i ? "companion-prompt.txt" : "generation-prompt.txt") }));
const geometry = { referenceBlastRadius: 28, referenceMicroRadius: 12,
  nozzleOffset: frameStats.find(f => f.name === "body-0").visibleBounds.x - clips.body.anchor[0] + 1,
  microNozzleOffset: frameStats.find(f => f.name === "micro-body-0").visibleBounds.x - clips["micro-body"].anchor[0] + 1 };
const nose = key => { const bounds = frameStats.find(f => f.name === key + "-0").visibleBounds;
  return bounds.x + bounds.w - clips[key].anchor[0] - 0.5; };
writeFileSync(new URL("src/game/data/missileGeometry.ts", root),
  "// Generated from the approved atlas visible bounds by build-missile-vfx-assets.mjs.\n" +
  `export const MISSILE_NOSE = ${JSON.stringify({ main: nose("body"), micro: nose("micro-body") }, null, 2)} as const;\n`);
json(out + "missile.metadata.json", { version: 1, axis: "+X; jet trails -X", pixelsPerWorldUnit: 1,
  ...geometry,
  alphaValues: [0, 255], clips, frames, sources: sourceRecords, processing,
  scope: "complete animation asset pack and read-only playback; not gameplay implementation" });
json(art + "source-record.json", { date: "2026-10-31", approvedSeed: art + "missile-seed-v2.png",
  seedApproval: "User approved second, heavier military-style seed and requested complete animation", sources: sourceRecords, processing });
json(art + "asset-checks.json", { atlasSize: [atlasW, atlasH], clips: specs.length, frameCount: frames.length,
  paletteColors: usedColors.size, transparentPixels: transparent, frameStats, atlasSha256: hash(atlasBytes),
  checks: ["fixed shared clip transforms", "rigid body lock", "palette-only RGB", "binary transparent alpha", "nonempty frames", "untrimmed anchors"],
  scope: "asset integrity checks; not gameplay acceptance" });
const runtime = Object.fromEntries(Object.entries(clips).map(([key, c]) => [key, { width: c.width, height: c.height, anchor: c.anchor,
  frames: c.frames, frameDurations: c.frameDurations, duration: c.duration, loop: c.loop }]));
writeFileSync(new URL("src/game/rendering/vfx/missile/missileAssets.ts", root),
  "// Generated by scripts/build-missile-vfx-assets.mjs.\n" + `export const MISSILE_CLIPS = ${JSON.stringify(runtime, null, 2)} as const;\n` +
  `export const MISSILE_GEOMETRY = ${JSON.stringify(geometry, null, 2)} as const;\n` +
  'export type MissileClip = keyof typeof MISSILE_CLIPS;\nexport const MISSILE_ATLAS_KEY = "missile-vfx-atlas";\n');
const zoom = 2, contact = Buffer.alloc(atlasW * atlasH * zoom * zoom * 4);
for (let y = 0; y < atlasH * zoom; y++) for (let x = 0; x < atlasW * zoom; x++) {
  const from = (Math.floor(y / zoom) * atlasW + Math.floor(x / zoom)) * 4;
  atlasData.copy(contact, (y * atlasW * zoom + x) * 4, from, from + 4);
}
writeFileSync(new URL(art + "contact-sheet-2x.png", root), encodePng(atlasW * zoom, atlasH * zoom, contact));
const files = [...specs.map(s => out + s.key + ".png"), out + "missile.atlas.png", out + "missile.atlas.json", out + "missile.metadata.json",
  ...sourceRecords.flatMap(s => [s.path, s.prompt]), art + "missile-seed-v2.png", art + "missile-seed-v2-prompt.txt"];
writeFileSync(new URL(art + "SHA256SUMS.txt", root), files.map(p => `${hash(readFileSync(new URL(p, root)))}  ${p}`).join("\n") + "\n");
console.log(JSON.stringify({ clips: specs.length, frames: frames.length, atlas: [atlasW, atlasH], colors: usedColors.size, sha256: hash(atlasBytes) }));
