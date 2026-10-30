/** Offline frame inspection, not a recording or a proposal for gameplay timing. */
import { readFileSync, writeFileSync } from "node:fs";
import ts from "typescript";
import { decodePng, encodePng } from "./lib/png.mjs";

const root = new URL("../", import.meta.url);
const compile = (path) => ts.transpileModule(readFileSync(new URL(path, root), "utf8"), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
}).outputText;
const asModule = (code) => "data:text/javascript;base64," + Buffer.from(code).toString("base64");
const balanceCode = compile("src/game/data/warriorBalance.ts");
const balanceModule = asModule(balanceCode);
const energyCode = compile("src/game/rendering/vfx/greatswordEnergy.ts")
  .replace('from "../../data/warriorBalance"', `from "${balanceModule}"`);
if (/\bfrom\s+["']\./.test(energyCode)) throw new Error("Unresolved preview module dependency");
const { GREATSWORD_ENERGY, GREATSWORD_ENERGY_SHEETS, GREATSWORD_ENERGY_FRAME_STARTS,
  drawGreatswordWave, drawGreatswordDashSlash } = await import(asModule(energyCode));
const { WARRIOR_BALANCE } = await import(balanceModule);
const width = 480, height = 270, zoom = 2;
const rgb = (hex) => [1, 3, 5].map((at) => parseInt(hex.slice(at, at + 2), 16));
const background = rgb("#1a1c2c"), gridColor = rgb("#20243a");
const ink = rgb("#858ba8"), textColor = rgb("#e8e8f0");
const colors = ["#9b4b16", "#f4a940", "#ffd24a", "#ffe8a3", "#ffffff"];
const palette = [background, gridColor, ink, textColor, ...colors.map(rgb)];
const glyphs = {
  A: ["010", "101", "111", "101", "101"], B: ["110", "101", "110", "101", "110"],
  C: ["011", "100", "100", "100", "011"], D: ["110", "101", "101", "101", "110"],
  E: ["111", "100", "110", "100", "111"], F: ["111", "100", "110", "100", "100"],
  G: ["011", "100", "101", "101", "011"], H: ["101", "101", "111", "101", "101"],
  I: ["111", "010", "010", "010", "111"], L: ["100", "100", "100", "100", "111"],
  M: ["101", "111", "111", "101", "101"], N: ["101", "111", "111", "111", "101"],
  O: ["010", "101", "101", "101", "010"], P: ["110", "101", "110", "100", "100"],
  Q: ["010", "101", "101", "111", "011"], R: ["110", "101", "110", "101", "101"],
  S: ["011", "100", "010", "001", "110"], T: ["111", "010", "010", "010", "010"],
  U: ["101", "101", "101", "101", "111"], V: ["101", "101", "101", "101", "010"],
  W: ["101", "101", "111", "111", "101"], X: ["101", "101", "010", "101", "101"],
  Y: ["101", "101", "010", "010", "010"], "4": ["101", "101", "111", "001", "001"],
  "-": ["000", "000", "111", "000", "000"], " ": ["000", "000", "000", "000", "000"],
};
const textures = new Map();
for (const sheet of GREATSWORD_ENERGY_SHEETS) {
  const meta = JSON.parse(readFileSync(new URL("public/" + sheet.image.replace(/\.png$/, ".json"), root), "utf8"));
  if (meta.frameWidth !== sheet.size || meta.referenceRadius !== sheet.radius ||
    meta.key + "-" !== sheet.prefix ||
    JSON.stringify(meta.frameStarts) !== JSON.stringify(GREATSWORD_ENERGY_FRAME_STARTS))
    throw new Error(`Runtime/asset description mismatch: ${sheet.prefix}`);
  const png = decodePng(readFileSync(new URL("public/" + sheet.image, root)));
  for (let frame = 0; frame < meta.frameCount; frame++)
    textures.set(`${sheet.prefix}${frame}`, { png, frameWidth: sheet.size, frame });
}
let canvas;
function pixel(x, y, color) {
  if (x >= 0 && y >= 0 && x < width && y < height) canvas.set([...color, 255], (y * width + x) * 4);
}
function label(value, x, y, scale = 1) {
  for (const letter of value) {
    const glyph = glyphs[letter];
    if (!glyph) throw new Error(`Missing preview glyph: ${letter}`);
    for (let gy = 0; gy < 5; gy++) for (let gx = 0; gx < 3; gx++) if (glyph[gy][gx] === "1") {
      for (let dy = 0; dy < scale; dy++) for (let dx = 0; dx < scale; dx++)
        pixel(x + gx * scale + dx, y + gy * scale + dy, textColor);
    }
    x += 4 * scale;
  }
}
function anchor(cx, cy) {
  for (let d = -3; d <= 3; d++) { pixel(cx + d, cy, ink); pixel(cx, cy + d, ink); }
}
function sprite(key, cx, cy, angle = 0, scale = 1) {
  const { png, frameWidth: size, frame } = textures.get(key);
  const half = size / 2, bound = Math.ceil(half * scale * Math.SQRT2);
  const cos = Math.cos(angle), sin = Math.sin(angle);
  for (let y = Math.floor(cy - bound); y <= cy + bound; y++) {
    for (let x = Math.floor(cx - bound); x <= cx + bound; x++) {
      const dx = x + 0.5 - cx, dy = y + 0.5 - cy;
      const sx = Math.floor((dx * cos + dy * sin) / scale + half);
      const sy = Math.floor((-dx * sin + dy * cos) / scale + half);
      if (sx < 0 || sy < 0 || sx >= size || sy >= size) continue;
      const si = ((Math.floor(frame / 5) * size + sy) * png.width + frame % 5 * size + sx) * 4;
      if (png.rgba[si + 3]) pixel(x, y, png.rgba.subarray(si, si + 3));
    }
  }
}
// An offline PixelPainter surface: production adapters choose frames, direction,
// scale and anchor. Rasterization uses the same centered nearest-neighbor model.
const painter = { globalAlpha: 1, hasTexture: (key) => textures.has(key), spriteRot: sprite };
function enlarge(rgba) {
  const enlarged = Buffer.alloc(width * height * zoom * zoom * 4);
  for (let y = 0; y < height * zoom; y++) for (let x = 0; x < width * zoom; x++) {
    const si = (Math.floor(y / zoom) * width + Math.floor(x / zoom)) * 4;
    rgba.copy(enlarged, (y * width * zoom + x) * 4, si, si + 4);
  }
  return enlarged;
}
const frames = [];
for (let frame = 0; frame < 10; frame++) {
  canvas = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++)
    pixel(x, y, x % 16 === 0 || y % 16 === 0 ? gridColor : background);
  label("SWORD QI", 14, 12, 2); label("FISSURE", 184, 12, 2); label("DASH CUT", 346, 12, 2);
  label("RIGHT", 14, 39); label("LEFT", 14, 148);
  label("RIGHT", 346, 39); label("LEFT", 346, 148);
  label("4-WAY ROTATION", 212, 232);
  label("OFFLINE ASSET PREVIEW - NO GAMEPLAY", 14, 254);
  for (const y of [90, 193]) {
    anchor(72, y); anchor(394, y);
    const angle = y === 90 ? 0 : Math.PI;
    const progress = GREATSWORD_ENERGY_FRAME_STARTS[frame] + 1e-8;
    if (!drawGreatswordWave(painter, { kind: "qi", x: 72, y, angle, progress }) ||
      !drawGreatswordDashSlash(painter, { x: 394, y, a: angle,
        weapon: "greatsword", arc: WARRIOR_BALANCE.styles.greatsword.spread,
        r: GREATSWORD_ENERGY.dash.radius, life: 1 - progress, max: 1 }))
      throw new Error(`Cannot draw production view for frame ${frame}`);
  }
  anchor(240, 132);
  // Four fixed sample anchors deliberately show the rotation without claiming
  // a projectile speed, spawn offset, damage range or runtime implementation.
  for (const degrees of [45, 135, 225, 315]) {
    const angle = degrees * Math.PI / 180;
    const cx = Math.round(240 + Math.cos(angle) * 38), cy = Math.round(132 + Math.sin(angle) * 38);
    if (!drawGreatswordWave(painter, { kind: "fissure", x: cx, y: cy, angle,
      progress: GREATSWORD_ENERGY_FRAME_STARTS[frame] + 1e-8 }))
      throw new Error(`Cannot draw fissure frame ${frame}`);
  }
  const enlarged = enlarge(canvas);
  frames.push({ rgba: enlarged, delay: frame === 9 ? 50 : 10 });
  if (frame === 3) {
    writeFileSync(new URL("assets/vfx/greatsword-energy-preview-1x.png", root), encodePng(width, height, canvas));
    writeFileSync(new URL("assets/vfx/greatsword-energy-preview-2x.png", root), encodePng(width * zoom, height * zoom, enlarged));
  }
}

// Same 7-bit palette/LZW convention as preview-greatsword-leap-vfx.mjs.
while (palette.length < 128) palette.push(background);
const byColor = new Map(palette.map((color, index) => [color.join(","), index]));
function lzw(indices) {
  const bytes = []; let data = 0, held = 0, bits = 8, next = 130;
  let dictionary = new Map();
  const emit = (code) => {
    data |= code << held; held += bits;
    while (held >= 8) { bytes.push(data & 255); data >>>= 8; held -= 8; }
  };
  emit(128);
  let prefix = indices[0];
  for (let i = 1; i < indices.length; i++) {
    const suffix = indices[i], key = prefix * 128 + suffix;
    if (dictionary.has(key)) { prefix = dictionary.get(key); continue; }
    emit(prefix);
    if (next < 4096) {
      dictionary.set(key, next++);
      if (next > 1 << bits) bits++;
    } else { emit(128); dictionary = new Map(); bits = 8; next = 130; }
    prefix = suffix;
  }
  emit(prefix);
  if (next === 1 << bits && bits < 12) bits++;
  emit(129);
  if (held) bytes.push(data & 255);
  const parts = [Buffer.from([7])];
  for (let i = 0; i < bytes.length; i += 255)
    parts.push(Buffer.from([Math.min(255, bytes.length - i)]), Buffer.from(bytes.slice(i, i + 255)));
  parts.push(Buffer.from([0])); return Buffer.concat(parts);
}
const header = Buffer.alloc(13);
header.write("GIF89a"); header.writeUInt16LE(width * zoom, 6); header.writeUInt16LE(height * zoom, 8); header[10] = 0xf6;
const parts = [header, Buffer.from(palette.flat()), Buffer.from([0x21, 0xff, 11]), Buffer.from("NETSCAPE2.0"), Buffer.from([3, 1, 0, 0, 0])];
for (const frame of frames) {
  const indices = new Uint8Array(frame.rgba.length / 4);
  for (let i = 0; i < indices.length; i++) {
    const index = byColor.get(frame.rgba.subarray(i * 4, i * 4 + 3).join(","));
    if (index === undefined) throw new Error("Unmapped GIF preview color");
    indices[i] = index;
  }
  const descriptor = Buffer.alloc(10); descriptor[0] = 0x2c;
  descriptor.writeUInt16LE(width * zoom, 5); descriptor.writeUInt16LE(height * zoom, 7);
  parts.push(Buffer.from([0x21, 0xf9, 4, 4, frame.delay, 0, 0, 0]), descriptor, lzw(indices));
}
parts.push(Buffer.from([0x3b]));
const gif = Buffer.concat(parts);
writeFileSync(new URL("assets/vfx/greatsword-energy-preview.gif", root), gif);
console.log(JSON.stringify({ frames: frames.length, width: width * zoom, height: height * zoom,
  bytes: gif.length, playback: "100ms per numbered frame, 500ms terminal hold; offline inspection only" }));
