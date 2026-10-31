/** Fixed-grid export. Never crops, rescales or recenters individual animation frames. */
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { decodePng, encodePng } from "./lib/png.mjs";
import { loadPalette, hexToRgb } from "./lib/palette.mjs";

const root = new URL("../", import.meta.url);
const sourcePath = "assets/vfx/laser/source-master.png";
const sourceBytes = readFileSync(new URL(sourcePath, root));
const source = decodePng(sourceBytes);
const hash = bytes => createHash("sha256").update(bytes).digest("hex");
const palette = Object.fromEntries(loadPalette().map(p => [p.key, p.hex]));
const cool = ["iceDeep", "iceCyan", "bone", "white"].map(k => hexToRgb(palette[k]));
const warm = ["gold", "bone", "white"].map(k => hexToRgb(palette[k]));
const out = "public/assets/vfx/laser/";
mkdirSync(new URL(out, root), { recursive: true });
const json = (path, value) => writeFileSync(new URL(path, root), JSON.stringify(value, null, 2) + "\n");
const pixel = (data, w, x, y, color) => data.set([...color, 255], (y * w + x) * 4);

function sample(row, column, x, y, gold = false) {
  const sx = Math.min(source.width - 1, Math.floor((column + (x + 0.5) / 32) * source.width / 8));
  const sy = Math.min(source.height - 1, Math.floor((row + (y + 0.5) / 32) * source.height / 8));
  const at = (sy * source.width + sx) * 4;
  if (source.rgba[at + 3] < 160) return null;
  let best = null, distance = Infinity;
  for (const color of gold ? warm : cool) {
    const d = color.reduce((v, c, i) => v + (c - source.rgba[at + i]) ** 2, 0);
    if (d < distance) { distance = d; best = color; }
  }
  return best;
}

const releaseTimes = [0.0225, 0.0225, 0.025, 0.03, 0.035, 0.035, 0.035, 0.035];
const specs = [
  { key: "emitter-ignite", row: 0, w: 32, h: 32, anchor: [16, 16], clock: "u/0.08", times: null },
  { key: "emitter-loop", row: 1, w: 32, h: 32, anchor: [16, 16], clock: "simulation seconds", loop: true, times: Array(8).fill(0.05) },
  { key: "emitter-compress", row: 2, w: 32, h: 32, anchor: [16, 16], clock: "u=0.65..0.85 first half; 0.85..1 second half", times: null },
  { key: "beam-flow", row: 3, w: 32, h: 16, anchor: [0, 8], clock: "static periodic slice; frame 0; sourceX=-floor(simulationTime*80) mod 32", loop: true, tile: true, times: null },
  { key: "beam-tip", row: 4, w: 32, h: 32, anchor: [16, 16], clock: "simulation seconds", loop: true, times: Array(8).fill(0.05) },
  { key: "hit-sparks", row: 5, w: 32, h: 32, anchor: [16, 16], clock: "simulation seconds", loop: true, times: Array(8).fill(0.04) },
  { key: "collapse", row: 6, w: 64, h: 32, anchor: [32, 16], clock: "seconds since authoritative release", times: releaseTimes },
  { key: "meltdown", row: 7, w: 64, h: 32, anchor: [32, 16], clock: "seconds since authoritative release", times: releaseTimes },
  { key: "dissolve", row: 2, w: 32, h: 32, anchor: [16, 16], clock: "seconds since ordinary end", times: Array(8).fill(0.02) },
];

const clips = {}, allFrames = [], frameStats = [];
const atlasW = 8 * 68, atlasH = specs.length * 36;
const atlasPixels = Buffer.alloc(atlasW * atlasH * 4);
const atlasFrames = {};
for (const [rowIndex, spec] of specs.entries()) {
  const strip = Buffer.alloc(spec.w * 8 * spec.h * 4), buffers = [];
  for (let frame = 0; frame < 8; frame++) {
    const data = Buffer.alloc(spec.w * spec.h * 4);
    for (let y = 0; y < spec.h; y++) for (let x = 0; x < spec.w; x++) {
      let lx = x - (spec.w - 32) / 2, ly = y + (32 - spec.h) / 2;
      const dx = lx - 16, dy = ly - 16;
      if (lx < 0 || lx >= 32) continue;
      // Shared fixed envelopes remove source haze, without moving any frame.
      if (spec.key.startsWith("emitter") && (Math.abs(dx) > 12 || Math.abs(dy) > 9)) continue;
      if (spec.key === "beam-tip" && (Math.abs(dx) > 12 || Math.abs(dy) > 7)) continue;
      if (spec.key === "hit-sparks" && (Math.abs(dx) > 9 || Math.abs(dy) > 9)) continue;
      if (spec.tile && Math.abs(dy) > 5) continue;
      // Keep one fixed periodic source; playback scrolls source regions at simulation rate.
      const sourceX = lx;
      const sourceFrame = spec.tile ? 3 : spec.key === "dissolve" ? 7 : frame;
      const color = sample(spec.row, sourceFrame, sourceX, ly, spec.key === "meltdown");
      if (!color) continue;
      if (spec.key === "dissolve" && ((x * 3 + y * 5) % 8 < frame || Math.abs(dy) > 5 - frame / 2)) continue;
      pixel(data, spec.w, x, y, spec.tile ? hexToRgb(palette[
        color[0] > 200 || color[1] > 220 ? "iceCyan" : "iceDeep"]) : color);
    }
    if (spec.tile) {
      // The boundary is an ordinary interior material column, without a bright end cap.
      // Both edges repeat that quiet profile; the continuous white core is procedural.
      for (let y = 0; y < spec.h; y++) {
        const at = (y * spec.w + 16) * 4;
        for (const x of [0, 31]) data.copy(data, (y * spec.w + x) * 4, at, at + 4);
      }
    }
    buffers.push(data);
    let count = 0, minX = spec.w, minY = spec.h, maxX = -1, maxY = -1;
    for (let y = 0; y < spec.h; y++) for (let x = 0; x < spec.w; x++) {
      const from = (y * spec.w + x) * 4;
      const to = (y * spec.w * 8 + frame * spec.w + x) * 4;
      data.copy(strip, to, from, from + 4);
      data.copy(atlasPixels, ((rowIndex * 36 + 2 + y) * atlasW + frame * 68 + 2 + x) * 4, from, from + 4);
      if (!data[from + 3]) continue;
      count++; minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
    }
    if (!count && !(spec.key === "dissolve" && frame >= 6)) throw new Error(`Empty ${spec.key} frame ${frame}`);
    const name = `${spec.key}-${frame}`;
    const rect = { x: frame * 68 + 2, y: rowIndex * 36 + 2, w: spec.w, h: spec.h };
    atlasFrames[name] = { frame: rect, rotated: false, trimmed: false,
      spriteSourceSize: { x: 0, y: 0, w: spec.w, h: spec.h }, sourceSize: { w: spec.w, h: spec.h },
      pivot: { x: spec.anchor[0] / spec.w, y: spec.anchor[1] / spec.h } };
    const bounds = count ? { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 } : null;
    frameStats.push({ name, opaquePixels: count, visibleBounds: bounds });
    allFrames.push({ name, ...rect, anchor: spec.anchor, visibleBounds: bounds });
  }
  const bytes = encodePng(spec.w * 8, spec.h, strip);
  writeFileSync(new URL(`${out}${spec.key}.png`, root), bytes);
  clips[spec.key] = { width: spec.w, height: spec.h, anchor: spec.anchor,
    frames: Array.from({ length: 8 }, (_, i) => `${spec.key}-${i}`), loop: !!spec.loop,
    frameDurations: spec.times, clock: spec.clock, duration: spec.times?.reduce((a, b) => a + b, 0) ?? null,
    image: `${spec.key}.png`, sha256: hash(bytes), tileableX: !!spec.tile,
    normalizedFrameStarts: spec.key === "emitter-ignite" ? Array.from({ length: 8 }, (_, i) => i * 0.01) :
      spec.key === "emitter-compress" ? [0.65, 0.7, 0.75, 0.8, 0.85, 0.8875, 0.925, 0.9625] : null,
    normalizedFrameDurations: spec.key === "emitter-ignite" ? Array(8).fill(0.01) :
      spec.key === "emitter-compress" ? [...Array(4).fill(0.05), ...Array(4).fill(0.0375)] : null };
}
const atlasBytes = encodePng(atlasW, atlasH, atlasPixels);
const allowedRgb = new Set([...cool, ...warm].map(rgb => rgb.join(",")));
let transparent = 0, opaque = 0;
for (let i = 0; i < atlasPixels.length; i += 4) {
  const alpha = atlasPixels[i + 3];
  if (alpha === 0) { transparent++; continue; }
  if (alpha !== 255 || !allowedRgb.has([...atlasPixels.subarray(i, i + 3)].join(","))) throw new Error("Atlas violates binary alpha or palette contract");
  opaque++;
}
if (!transparent || !opaque) throw new Error("Atlas must contain both opaque art and genuinely transparent space");
writeFileSync(new URL(`${out}laser.atlas.png`, root), atlasBytes);
json(`${out}laser.atlas.json`, { frames: atlasFrames, meta: { app: "Pixel Rogue laser VFX pipeline", version: "1",
  image: "laser.atlas.png", format: "RGBA8888", size: { w: atlasW, h: atlasH }, scale: "1" } });
const metadata = {
  version: 2, referenceBeamWidth: 4, axis: "+X; local y is beam normal", alphaValues: [0, 255],
  pixelsPerWorldUnit: 1, palette: { iceDeep: palette.iceDeep, iceCyan: palette.iceCyan, bone: palette.bone, white: palette.white, gold: palette.gold },
  timing: { progress: "u=elapsed/T, T comes from actual channel snapshot", channelStages: [0, 0.08, 0.65, 0.85, 1],
    pulseSeconds: 0.24, pulseExpansionSeconds: 0.045, ordinaryDissolveSeconds: 0.16, attackDelaySeconds: 0 },
  clips, frames: allFrames, atlas: { image: "laser.atlas.png", json: "laser.atlas.json", sha256: hash(atlasBytes) },
  source: { path: sourcePath, width: source.width, height: source.height, sha256: hash(sourceBytes),
    tool: "built-in image_gen", model: null, seed: null, prompt: "assets/vfx/laser/generation-prompt.txt" },
  processing: { script: "scripts/build-laser-vfx-assets.mjs", sourceGrid: [8, 8], logicalSourceCell: [32, 32],
    sampling: "one shared nearest-neighbor grid; alpha threshold 160; nearest palette RGB", perFrameCrop: false,
    perFrameRescale: false, perFrameRecenter: false, pulseCanvas: "32px art centered in padded 64x32 canvas, not stretched",
    materialLoop: "one low-contrast slice, runtime frame 0, shared -floor(simulationTime*80) mod 32 source phase; ordinary interior-column edges, no bright caps",
    cropping: "integer floor/clamp source cropX and cropWidth; round material length once; cropped left starts at command x/y; Phaser compensates rotated cropX*scaleX",
    dissolve: "deterministic ordered pixel erosion of compressed source, no RNG" },
};
json(`${out}laser.metadata.json`, metadata);
json("assets/vfx/laser/source-record.json", { ...metadata.source, promptSha256: hash(readFileSync(new URL(metadata.source.prompt, root))), processing: metadata.processing });
json("assets/vfx/laser/asset-checks.json", { sourceHasTransparency: source.rgba.some((v, i) => i % 4 === 3 && v === 0),
  atlasSize: [atlasW, atlasH], frameCount: allFrames.length, transparentPixels: transparent, opaquePixels: opaque, frameStats, pngSha256: hash(atlasBytes),
  checks: ["fixed untrimmed frames", "binary transparent alpha", "palette-only RGB", "ordinary interior tile edge profile matched", "static periodic material scrolled at 80px/s in the player"],
  scope: "asset export inspection, not gameplay acceptance" });
const runtimeClips = Object.fromEntries(Object.entries(clips).map(([key, c]) => [key, { width: c.width, height: c.height, anchor: c.anchor, frames: c.frames, frameDurations: c.frameDurations, loop: c.loop }]));
mkdirSync(new URL("src/game/rendering/vfx/laser/", root), { recursive: true });
writeFileSync(new URL("src/game/rendering/vfx/laser/laserAssets.ts", root),
  "// Generated by scripts/build-laser-vfx-assets.mjs; source of truth: laser.metadata.json.\n" +
  `export const LASER_CLIPS = ${JSON.stringify(runtimeClips, null, 2)} as const;\n` +
  'export type LaserClip = keyof typeof LASER_CLIPS;\nexport const LASER_ATLAS_KEY = "laser-vfx-atlas";\n' +
  'export function laserSpriteCrop(clip: LaserClip, cropX = 0, cropWidth?: number) {\n' +
  '  const width = LASER_CLIPS[clip].width;\n' +
  '  const x = Math.max(0, Math.min(width, Math.floor(cropX)));\n' +
  '  return { x, width: Math.max(0, Math.min(width - x, Math.floor(cropWidth ?? width - x))) };\n}\n');
// Actual normalized atlas enlarged exactly 3x for pixel / anchor inspection.
const zoom = 3, check = Buffer.alloc(atlasW * atlasH * zoom * zoom * 4);
for (let y = 0; y < atlasH * zoom; y++) for (let x = 0; x < atlasW * zoom; x++) {
  const si = (Math.floor(y / zoom) * atlasW + Math.floor(x / zoom)) * 4;
  atlasPixels.copy(check, (y * atlasW * zoom + x) * 4, si, si + 4);
}
writeFileSync(new URL("assets/vfx/laser/contact-sheet-3x.png", root), encodePng(atlasW * zoom, atlasH * zoom, check));
const hashedFiles = [...specs.map(s => `${out}${s.key}.png`), `${out}laser.atlas.png`, `${out}laser.atlas.json`, `${out}laser.metadata.json`, sourcePath, "assets/vfx/laser/generation-prompt.txt"];
writeFileSync(new URL("assets/vfx/laser/SHA256SUMS.txt", root), hashedFiles.map(path => `${hash(readFileSync(new URL(path, root)))}  ${path}`).join("\n") + "\n");
console.log(JSON.stringify({ source: [source.width, source.height], atlas: [atlasW, atlasH], clips: specs.length, frames: allFrames.length, sha256: hash(atlasBytes) }));
