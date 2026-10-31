/** ImageGen source sheets -> common-scale body atlas and fixed-anchor effect atlas. */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { decodePng, encodePng } from "./lib/png.mjs";
import { loadPalette, hexToRgb } from "./lib/palette.mjs";

const root = new URL("../", import.meta.url), sourceDir = "assets/boss-three/upgrade/";
const publicDir = "public/assets/boss-three/", previewDir = "assets/boss-three/preview/";
mkdirSync(new URL(previewDir, root), { recursive: true });
const palette = Object.fromEntries(loadPalette().map(c => [c.key, hexToRgb(c.hex)]));
const record = { tool: "built-in image_gen.imagegen", model: null, seed: null,
  style: "refined cartoon fantasy pixel art; reference PR #220 C ronin",
  referenceCommit: "28d1779", referenceMerge: "80b6df4", sources: [], body: {}, effects: {} };
function source(name, cols, rows) {
  const path = sourceDir + name + ".png", bytes = readFileSync(new URL(path, root)), png = decodePng(bytes);
  if (png.width % cols || png.height % rows) throw new Error("Invalid source grid: " + name);
  record.sources.push({ path, width: png.width, height: png.height, sha256: createHash("sha256").update(bytes).digest("hex") });
  return { ...png, cols, rows, slotW: png.width / cols, slotH: png.height / rows };
}
function colorAt(rgb, keys) {
  let best = palette[keys[0]], distance = Infinity;
  for (const key of keys) {
    const color = palette[key], d = color.reduce((s, c, k) => s + (c - rgb[k]) ** 2, 0);
    if (d < distance) { best = color; distance = d; }
  }
  return best;
}
function frameMeta(x, y, w, h) {
  return { frame: { x, y, w, h }, rotated: false, trimmed: false,
    spriteSourceSize: { x: 0, y: 0, w, h }, sourceSize: { w, h } };
}
function bounds(png, frame, threshold = 128) {
  let left = png.slotW, top = png.slotH, right = -1, bottom = -1;
  for (let y = 0; y < png.slotH; y++) for (let x = 0; x < png.slotW; x++) {
    const at = ((Math.floor(frame / png.cols) * png.slotH + y) * png.width + frame % png.cols * png.slotW + x) * 4;
    if (png.rgba[at + 3] < threshold) continue;
    left = Math.min(left, x); right = Math.max(right, x); top = Math.min(top, y); bottom = Math.max(bottom, y);
  }
  if (right < left) throw new Error("Empty frame " + frame);
  return { left, top, right, bottom };
}
const body = source("boss-source-v2", 4, 2), w = 72, h = 56, poses = ["idle", "crouch", "roar", "walk-left", "walk-right", "lunge", "impact", "stagger"];
const bodyBounds = poses.map((_, i) => bounds(body, i));
const scale = Math.min((w - 4) / body.slotW, (h - 4) / Math.max(...bodyBounds.map(b => b.bottom - b.top + 1)));
const bodyKeys = ["ink0", "ink1", "stoneDark", "stoneRed", "fireOrange", "fireDeep", "gold", "iceCyan", "iceDeep", "bone", "sand", "steelDark"];
const bodyAtlas = Buffer.alloc(w * poses.length * h * 4), portrait = Buffer.alloc(w * h * 4), bodyFrames = {}, rendered = [];
for (let i = 0; i < poses.length; i++) {
  const pixels = Buffer.alloc(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const sx = Math.round((x - w / 2) / scale + body.slotW / 2), sy = Math.round((y - 54) / scale + bodyBounds[i].bottom);
    if (sx < 0 || sy < 0 || sx >= body.slotW || sy >= body.slotH) continue;
    const at = ((Math.floor(i / 4) * body.slotH + sy) * body.width + i % 4 * body.slotW + sx) * 4;
    if (body.rgba[at + 3] < 128) continue;
    const rgb = colorAt(body.rgba.subarray(at, at + 3), bodyKeys);
    pixels.set([...rgb, 255], (y * w + x) * 4);
    bodyAtlas.set([...rgb, 255], (y * w * poses.length + i * w + x) * 4);
  }
  bodyFrames[poses[i]] = frameMeta(i * w, 0, w, h);
  rendered.push(pixels); if (i === 0) pixels.copy(portrait);
}
writeFileSync(new URL(publicDir + "boss.atlas.png", root), encodePng(w * poses.length, h, bodyAtlas));
writeFileSync(new URL(publicDir + "boss.atlas.json", root), JSON.stringify({ frames: bodyFrames,
  meta: { image: "boss.atlas.png", size: { w: w * poses.length, h }, scale: "1" } }, null, 2) + "\n");
writeFileSync(new URL("public/assets/sprites/boss_three.png", root), encodePng(w, h, portrait));
record.body = { frameSize: [w, h], poses, sharedScale: scale, anchor: [36, 54], palette: bodyKeys, alphaThreshold: 128, bounds: bodyBounds };

const iceKeys = ["ink0", "ink1", "iceDeep", "iceCyan", "bone", "steelLight", "pBlueDk"];
const specs = [
  { id: "fire", keys: ["ink0", "stoneDark", "fireDeep", "fireOrange", "gold", "sand", "bone"], anchor: [12, 64], origins: [[15,70],[15,70],[15,70],[15,64],[15,64],[15,64]] },
  { id: "stomp", keys: ["ink0", "ink2", "pBrown", "sand", "gold", "steelMid", "steelLight", "steelDark"], anchor: [64,70], origins: Array(6).fill([64,70]) },
  { id: "nova", keys: iceKeys, anchor: [64,70], origins: Array(6).fill([64,70]) },
  { id: "spikes", keys: iceKeys, anchor: [64,112], origins: [[64,118],[64,118],[64,120],[64,110],[64,110],[64,110]] },
  { id: "marks", keys: [...iceKeys,"fireYellow","gold"], anchor: [64,116], origins: [[64,120],[64,120],[64,120],[64,116],[64,116],[64,116]] },
  { id: "chain", keys: [...iceKeys,"fireYellow","gold"], anchor: [12,64], origins: [[16,76],[16,76],[16,76],[16,50],[16,50],[16,50]] },
];
const size = 128, atlasW = size * 6, atlasH = size * specs.length, fxAtlas = Buffer.alloc(atlasW * atlasH * 4), fxFrames = {};
for (let row = 0; row < specs.length; row++) {
  const spec = specs[row], png = source(spec.id + "-source", 3, 2);
  for (let f = 0; f < 6; f++) {
    const shiftX = spec.anchor[0] - spec.origins[f][0], shiftY = spec.anchor[1] - spec.origins[f][1];
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const px = x - shiftX, py = y - shiftY;
      if (px < 0 || py < 0 || px >= size || py >= size) continue;
      const sx = Math.floor(px / size * png.slotW), sy = Math.floor(py / size * png.slotH);
      const from = ((Math.floor(f / 3) * png.slotH + sy) * png.width + f % 3 * png.slotW + sx) * 4;
      const alpha = png.rgba[from + 3];
      if (alpha < 72) continue; // Remove faint full-cell haze while retaining intentional pixel-edge alpha.
      const rgb = colorAt(png.rgba.subarray(from, from + 3), spec.keys);
      const edge = Math.min(1, x / 2, y / 2, (size - 1 - x) / 2, (size - 1 - y) / 2);
      fxAtlas.set([...rgb, Math.round(alpha * edge)], ((row * size + y) * atlasW + f * size + x) * 4);
    }
    fxFrames[spec.id + "-" + f] = frameMeta(f * size, row * size, size, size);
  }
  record.effects[spec.id] = { frames: 6, frameSize: [size,size], anchor: spec.anchor, sourceOrigins: spec.origins,
    alphaThreshold: 72, palette: spec.keys, processing: "whole-cell nearest sampling, translation only, preserved useful source alpha" };
}
writeFileSync(new URL(publicDir + "boss-fx.atlas.png", root), encodePng(atlasW, atlasH, fxAtlas));
writeFileSync(new URL(publicDir + "boss-fx.atlas.json", root), JSON.stringify({ frames: fxFrames,
  meta: { image: "boss-fx.atlas.png", size: { w: atlasW, h: atlasH }, scale: "1" } }, null, 2) + "\n");
writeFileSync(new URL("assets/boss-three/normalization.json", root), JSON.stringify(record, null, 2) + "\n");
writeFileSync(new URL(sourceDir + "asset-record.json", root), JSON.stringify(record, null, 2) + "\n");

// Show the actual merged ronin beside the generated boss at 1x and 4x.
const ronin = decodePng(readFileSync(new URL("assets/boss-three/reference/katana-ronin-64x64.png", root)));
const boardW = 640, boardH = 400, board = Buffer.alloc(boardW * boardH * 4);
for (let y = 0; y < boardH; y++) for (let x = 0; x < boardW; x++) board.set([...(x % 16 === 0 || y % 16 === 0 ? [29,34,45] : [18,22,31]),255], (y * boardW + x) * 4);
function blit(image, region, cx, base, zoom) {
  for (let y = 0; y < region.h * zoom; y++) for (let x = 0; x < region.w * zoom; x++) {
    const at = ((region.y + Math.floor(y / zoom)) * image.width + region.x + Math.floor(x / zoom)) * 4;
    if (image.rgba[at + 3]) image.rgba.copy(board, ((base - region.h * zoom + y) * boardW + Math.round(cx - region.w * zoom / 2) + x) * 4, at, at + 4);
  }
}
for (const [zoom, base] of [[1,100],[4,370]]) {
  blit(ronin, { x:25,y:35,w:20,h:24 }, 105, base, zoom);
  blit({ width:w,rgba:portrait }, { x:0,y:0,w,h }, 425, base, zoom);
}
writeFileSync(new URL(previewDir + "style-comparison.png", root), encodePng(boardW,boardH,board));
const sheetW = w * 8, sheetH = h * 4, sheet = Buffer.alloc(sheetW * sheetH * 4);
for (let i=0;i<poses.length;i++) for(let y=0;y<h*2;y++)for(let x=0;x<w*2;x++){
  const from=(Math.floor(y/2)*w+Math.floor(x/2))*4;
  rendered[i].copy(sheet,(((i>>2)*h*2+y)*sheetW+i%4*w*2+x)*4,from,from+4);
}
writeFileSync(new URL(previewDir + "pose-sheet.png", root), encodePng(sheetW,sheetH,sheet));
console.log(JSON.stringify({ bodyFrames:8, effectClips:6, effectFrames:36, reference:"28d1779 / PR #220", frameSize:[w,h] }));
