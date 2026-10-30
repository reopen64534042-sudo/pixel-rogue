/** Offline asset comparison: sweep / heavy / landing, 3x slower than simulation. */
import { readFileSync, writeFileSync } from "node:fs";
import ts from "typescript";
import { decodePng, encodePng } from "./lib/png.mjs";

const root = new URL("../", import.meta.url);
const source = readFileSync(new URL("src/game/rendering/vfx/greatswordLeapImpact.ts", root), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
}).outputText;
const { drawGreatswordLeapImpact, GREATSWORD_LEAP_IMPACT } = await import("data:text/javascript;base64," + Buffer.from(compiled).toString("base64"));
const sheets = [
  { prefix: "greatsword-sweep-", size: 96, image: "assets/vfx/greatsword-sweep-96x96-10f.png" },
  { prefix: "greatsword-heavy-", size: 144, image: "assets/vfx/greatsword-heavy-144x144-10f.png" },
  GREATSWORD_LEAP_IMPACT,
].map((sheet) => ({ ...sheet, png: decodePng(readFileSync(new URL("public/" + sheet.image, root))) }));
const width = 480, height = 160, zoom = 2;
const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const background = rgb("#1a1c2c"), tile = rgb("#1d2033");
const playerMap = ["  hhhh  ", " hhhhhh ", " heffeh ", " hhhhhh ", "  aaaa  ", " aaaaaa ", " aaaaaa ", "   aa   ", "  a  a  ", "  b  b  "];
const playerColors = { h: "#f4a940", e: "#22223a", f: "#ffd9a0", a: "#3d6de0", b: "#5a3a20" };
let canvas;
function pixel(x, y, color) {
  if (x >= 0 && x < width && y >= 0 && y < height) canvas.set([...color, 255], (y * width + x) * 4);
}
const painter = {
  globalAlpha: 1,
  hasTexture: (key) => sheets.some((sheet) => key.startsWith(sheet.prefix)),
  spriteRot(key, cx, cy, angle, scale = 1) {
    if (angle !== 0) throw new Error("Landing preview must not rotate ground geometry");
    const sheet = sheets.find((entry) => key.startsWith(entry.prefix));
    if (!sheet) throw new Error(`Unknown preview texture ${key}`);
    const frame = Number(key.slice(sheet.prefix.length)), half = sheet.size / 2;
    for (let y = Math.floor(cy - half * scale); y < cy + half * scale; y++) {
      for (let x = Math.floor(cx - half * scale); x < cx + half * scale; x++) {
        const sx = Math.floor((x + 0.5 - cx) / scale + half);
        const sy = Math.floor((y + 0.5 - cy) / scale + half);
        if (sx < 0 || sy < 0 || sx >= sheet.size || sy >= sheet.size) continue;
        const at = ((Math.floor(frame / 5) * sheet.size + sy) * sheet.png.width + frame % 5 * sheet.size + sx) * 4;
        if (sheet.png.rgba[at + 3]) pixel(x, y, sheet.png.rgba.subarray(at, at + 3));
      }
    }
  },
};
const frames = [];
for (let tick = 0; tick <= 20; tick++) {
  canvas = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    pixel(x, y, (Math.floor(x / 16) + Math.floor(y / 16)) % 2 ? tile : background);
  }
  const time = tick / 60;
  if (time < 0.16) {
    const frame = Math.floor(time / 0.16 * 10);
    painter.spriteRot(`greatsword-sweep-${frame}`, 80, 80, 0);
    painter.spriteRot(`greatsword-heavy-${frame}`, 240, 80, 0);
  }
  if (time < 0.32) drawGreatswordLeapImpact(painter, {
    x: 400, y: 80, a: 0, arc: Math.PI * 2, r: 54, life: 0.32 - time, max: 0.32,
    c: "#ffd24a", weapon: "greatsword", impact: true,
  });
  // Original procedural player marker, after the ground layer, as in draw.ts.
  for (const cx of [80, 240, 400]) for (let y = 0; y < 10; y++) for (let x = 0; x < 8; x++) {
    const color = playerColors[playerMap[y][x]];
    if (color) pixel(cx - 4 + x, 75 + y, rgb(color));
  }
  const enlarged = Buffer.alloc(width * height * zoom * zoom * 4);
  for (let y = 0; y < height * zoom; y++) for (let x = 0; x < width * zoom; x++) {
    const at = (Math.floor(y / zoom) * width + Math.floor(x / zoom)) * 4;
    canvas.copy(enlarged, (y * width * zoom + x) * 4, at, at + 4);
  }
  frames.push({ rgba: enlarged, delay: tick === 20 ? 60 : 5 });
  if (tick === 5) {
    writeFileSync(new URL("assets/vfx/greatsword-leap-impact-preview-1x.png", root), encodePng(width, height, canvas));
    writeFileSync(new URL("assets/vfx/greatsword-leap-impact-preview-2x.png", root), encodePng(width * zoom, height * zoom, enlarged));
  }
}

// All preview colors are exact: game palette, procedural player and floor tiles.
const palette = [background, tile, ...["#9b4b16", "#f4a940", "#ffd24a", "#ffe8a3", "#ffffff", ...Object.values(playerColors)].map(rgb)];
while (palette.length < 128) palette.push(background);
const indicesByColor = new Map(palette.map((color, i) => [color.join(","), i]));
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
  for (let i = 0; i < bytes.length; i += 255) parts.push(Buffer.from([Math.min(255, bytes.length - i)]), Buffer.from(bytes.slice(i, i + 255)));
  parts.push(Buffer.from([0])); return Buffer.concat(parts);
}
const header = Buffer.alloc(13);
header.write("GIF89a"); header.writeUInt16LE(width * zoom, 6); header.writeUInt16LE(height * zoom, 8); header[10] = 0xf6;
const parts = [header, Buffer.from(palette.flat()), Buffer.from([0x21, 0xff, 11]), Buffer.from("NETSCAPE2.0"), Buffer.from([3, 1, 0, 0, 0])];
for (const frame of frames) {
  const indices = new Uint8Array(frame.rgba.length / 4);
  for (let i = 0; i < indices.length; i++) {
    const key = frame.rgba.subarray(i * 4, i * 4 + 3).join(",");
    const index = indicesByColor.get(key);
    if (index === undefined) throw new Error(`Unmapped preview color ${key}`);
    indices[i] = index;
  }
  const descriptor = Buffer.alloc(10); descriptor[0] = 0x2c;
  descriptor.writeUInt16LE(width * zoom, 5); descriptor.writeUInt16LE(height * zoom, 7);
  parts.push(Buffer.from([0x21, 0xf9, 4, 4, frame.delay, 0, 0, 0]), descriptor, lzw(indices));
}
parts.push(Buffer.from([0x3b]));
const gif = Buffer.concat(parts);
writeFileSync(new URL("assets/vfx/greatsword-leap-impact-preview.gif", root), gif);
console.log(JSON.stringify({ frames: frames.length, width: width * zoom, height: height * zoom, bytes: gif.length, playback: "3x slow motion; offline art preview" }));
