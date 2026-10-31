/** Uses the actual TS sampler and PNGs. No browser, GameCore or combat execution. */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import ts from "typescript";
import { decodePng, encodePng } from "./lib/png.mjs";
import { loadPalette, hexToRgb } from "./lib/palette.mjs";

const root = new URL("../", import.meta.url), art = "assets/vfx/missile/";
const read = p => readFileSync(new URL(p, root), "utf8");
const moduleUrl = (path, imports = {}) => {
  let code = ts.transpileModule(read(path), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
  for (const [key, value] of Object.entries(imports)) code = code.replaceAll(JSON.stringify(key), JSON.stringify(value));
  if (/\bfrom\s+["']\./.test(code)) throw new Error(`Unresolved dependency in ${path}`);
  return "data:text/javascript;base64," + Buffer.from(code).toString("base64");
};
const paletteModule = moduleUrl("src/game/data/palette.ts");
const assetsModule = moduleUrl("src/game/rendering/vfx/missile/missileAssets.ts");
const timingModule = moduleUrl("src/game/data/missileVfx.ts");
const ionModule = moduleUrl("src/game/rendering/vfx/missile/IonVfx.ts", { "../../../data/palette": paletteModule, "../../../data/missileVfx": timingModule });
const playerModule = moduleUrl("src/game/rendering/vfx/missile/MissileVfxPlayer.ts", {
  "../../../data/palette": paletteModule, "./missileAssets": assetsModule, "../../../data/missileVfx": timingModule, "./IonVfx": ionModule });
const canvasModule = moduleUrl("src/game/rendering/vfx/missile/MissileVfxCanvas.ts", { "./missileAssets": assetsModule });
const demoModule = moduleUrl("src/game/rendering/vfx/missile/MissileVfxDemo.ts", { "../../../data/missileVfx": timingModule });
const { missileVfxCommands } = await import(playerModule);
const { sampleMissileDemo, MISSILE_DEMO_CASES, MISSILE_DEMO_SECONDS } = await import(demoModule);
const { MISSILE_CLIPS } = await import(assetsModule);
const atlas = JSON.parse(read("public/assets/vfx/missile/missile.atlas.json"));
const bytes = readFileSync(new URL("public/assets/vfx/missile/missile.atlas.png", root)), png = decodePng(bytes);
let html = read(art + "preview-template.html");
for (const [key, value] of Object.entries({ PLAYER_MODULE: JSON.stringify(playerModule), CANVAS_MODULE: JSON.stringify(canvasModule),
  DEMO_MODULE: JSON.stringify(demoModule), ASSETS_MODULE: JSON.stringify(assetsModule), ATLAS_JSON: JSON.stringify(atlas), ATLAS_PNG: JSON.stringify("data:image/png;base64," + bytes.toString("base64")) })) html = html.replaceAll(`__${key}__`, value);
if (/__[A-Z_]+__/.test(html)) throw new Error("Unresolved HTML template token");
const inlineScript = html.match(/<script type="module">([\s\S]*?)<\/script>/)?.[1];
if (!inlineScript) throw new Error("Missing preview module");
const parsed = ts.createSourceFile("missile-preview.mjs", inlineScript, ts.ScriptTarget.ES2022, true, ts.ScriptKind.JS);
if (parsed.parseDiagnostics.length) throw new Error(parsed.parseDiagnostics.map(d => ts.flattenDiagnosticMessageText(d.messageText, "\n")).join("\n"));
writeFileSync(new URL(art + "preview.html", root), html);
mkdirSync(new URL("public/missile-vfx-preview/", root), { recursive: true });
writeFileSync(new URL("public/missile-vfx-preview/index.html", root), html);

const W = 480, H = 270, bg = [16, 22, 32], grid = [25, 34, 47], text = [197, 199, 207];
const gameColors = Object.fromEntries(loadPalette().map(c => [c.key, hexToRgb(c.hex)]));
let pixels;
function pixel(x, y, rgb, alpha = 1) {
  x = Math.round(x); y = Math.round(y);
  if (x < 0 || y < 0 || x >= W || y >= H || alpha <= 0) return;
  const at = (y * W + x) * 4;
  for (let c = 0; c < 3; c++) pixels[at + c] = Math.round(pixels[at + c] * (1 - alpha) + rgb[c] * alpha);
  pixels[at + 3] = 255;
}
function line(x, y, x2, y2, rgb, alpha = 1, width = 1) {
  const steps = Math.max(1, Math.ceil(Math.hypot(x2 - x, y2 - y)));
  if (width <= 1) {
    for (let i = 0; i <= steps; i++) pixel(x + (x2 - x) * i / steps, y + (y2 - y) * i / steps, rgb, alpha);
    return;
  }
  const size = Math.max(1, Math.round(width)), start = -Math.floor(size / 2), covered = new Set();
  for (let i = 0; i <= steps; i++) {
    const px = Math.round(x + (x2 - x) * i / steps), py = Math.round(y + (y2 - y) * i / steps);
    for (let oy = start; oy < start + size; oy++) for (let ox = start; ox < start + size; ox++) {
      const dx = px + ox, dy = py + oy;
      if (dx < 0 || dy < 0 || dx >= W || dy >= H) continue;
      const key = dy * W + dx;
      if (covered.has(key)) continue;
      covered.add(key); pixel(dx, dy, rgb, alpha);
    }
  }
}
function sprite(cmd) {
  const c = MISSILE_CLIPS[cmd.clip], r = atlas.frames[c.frames[cmd.frame]].frame;
  const co = Math.cos(cmd.angle), si = Math.sin(cmd.angle);
  const corners = [[0, 0], [c.width, 0], [0, c.height], [c.width, c.height]].map(([x, y]) => ({
    x: cmd.x + co * (x - c.anchor[0]) * cmd.scaleX - si * (y - c.anchor[1]) * cmd.scaleY,
    y: cmd.y + si * (x - c.anchor[0]) * cmd.scaleX + co * (y - c.anchor[1]) * cmd.scaleY }));
  const x0 = Math.max(0, Math.floor(Math.min(...corners.map(p => p.x)))), x1 = Math.min(W, Math.ceil(Math.max(...corners.map(p => p.x))));
  const y0 = Math.max(0, Math.floor(Math.min(...corners.map(p => p.y)))), y1 = Math.min(H, Math.ceil(Math.max(...corners.map(p => p.y))));
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
    const dx = x + 0.5 - cmd.x, dy = y + 0.5 - cmd.y;
    const sx = Math.floor((dx * co + dy * si) / cmd.scaleX + c.anchor[0]);
    const sy = Math.floor((-dx * si + dy * co) / cmd.scaleY + c.anchor[1]);
    if (sx < 0 || sy < 0 || sx >= c.width || sy >= c.height) continue;
    const at = ((r.y + sy) * png.width + r.x + sx) * 4;
    if (png.rgba[at + 3]) pixel(x, y, png.rgba.subarray(at, at + 3), cmd.alpha);
  }
}
const glyphs = {
  A:["010","101","111","101","101"],B:["110","101","110","101","110"],C:["011","100","100","100","011"],D:["110","101","101","101","110"],
  E:["111","100","110","100","111"],F:["111","100","110","100","100"],G:["011","100","101","101","011"],H:["101","101","111","101","101"],
  I:["111","010","010","010","111"],L:["100","100","100","100","111"],M:["101","111","111","101","101"],N:["101","111","111","111","101"],
  O:["010","101","101","101","010"],P:["110","101","110","100","100"],R:["110","101","110","101","101"],S:["011","100","010","001","110"],
  T:["111","010","010","010","010"],U:["101","101","101","101","111"],V:["101","101","101","101","010"],W:["101","101","111","111","101"],
  X:["101","101","010","101","101"],Y:["101","101","010","010","010"],"1":["010","110","010","010","111"],"2":["110","001","010","100","111"],
  " ":["000","000","000","000","000"],"-":["000","000","111","000","000"] };
function label(value, x, y) {
  for (const letter of value) {
    const g = glyphs[letter]; if (!g) throw new Error(`Missing preview glyph ${letter}`);
    for (let iy = 0; iy < 5; iy++) for (let ix = 0; ix < 3; ix++) if (g[iy][ix] === "1") pixel(x + ix, y + iy, text);
    x += 4;
  }
}
const titles = { heavy: "HEAVY - FULL CYCLE", turn: "GUIDANCE - TURN", twin: "TWIN LAUNCH", swarm: "SWARM - MICRO MISSILES", ion: "ION - ARCS AND RESONANCE", combined: "COMBINED - VISUAL DENSITY" };
function render(id, time) {
  pixels = Buffer.alloc(W * H * 4);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) pixels.set([...(x % 16 === 0 || y % 16 === 0 ? grid : bg), 255], (y * W + x) * 4);
  const demo = sampleMissileDemo(id, time);
  const rows = ["  hhhh  "," hhhhhh "," heffeh "," hhhhhh ","  aaaa  "," aaaaaa "," aaaaaa ","   aa   ","  a  a  ","  b  b  "];
  const pc = { h: gameColors.pGold, e: gameColors.ink1, f: gameColors.sand, a: gameColors.pBlue, b: gameColors.pBrown };
  for (let y = 0; y < rows.length; y++) for (let x = 0; x < rows[y].length; x++) if (pc[rows[y][x]]) pixel(demo.player.x + x - 4, demo.player.y + y - 5, pc[rows[y][x]]);
  for (const target of demo.targets) {
    for (let y = -3; y < 3; y++) for (let x = -4; x < 4; x++) pixel(target.x + x, target.y + y, gameColors.slimeMid);
    pixel(target.x - 2, target.y - 1, gameColors.slimeDark); pixel(target.x + 2, target.y - 1, gameColors.slimeDark);
  }
  const commands = missileVfxCommands(demo.snapshot);
  for (const cmd of commands) {
    if (cmd.kind === "sprite") sprite(cmd);
    else line(cmd.x, cmd.y, cmd.x2, cmd.y2, hexToRgb(cmd.color), cmd.alpha, cmd.width);
  }
  label(titles[id], 16, 16); label("OFFLINE ART PREVIEW - NO GAMEPLAY", 16, 250);
  return { pixels, commands };
}
function enlarge(data, scale) {
  if (scale === 1) return data;
  const result = Buffer.alloc(W * H * scale * scale * 4);
  for (let y = 0; y < H * scale; y++) for (let x = 0; x < W * scale; x++) {
    const at = (Math.floor(y / scale) * W + Math.floor(x / scale)) * 4;
    data.copy(result, (y * W * scale + x) * 4, at, at + 4);
  }
  return result;
}
// 256-color palette with shared fade ramps; no dependencies and no per-frame quantizer drift.
const palette = [bg, grid, text, ...Object.values(gameColors)];
for (const color of Object.values(gameColors)) for (const alpha of [0.15, 0.3, 0.45, 0.6, 0.75, 0.9]) palette.push(color.map((v, i) => Math.round(bg[i] * (1 - alpha) + v * alpha)));
while (palette.length < 256) palette.push(bg);
const colorCache = new Map();
function paletteIndex(rgb) {
  const key = (rgb[0] << 16) | (rgb[1] << 8) | rgb[2];
  if (colorCache.has(key)) return colorCache.get(key);
  let best = 0, dist = Infinity;
  for (let i = 0; i < 256; i++) {
    const d = palette[i].reduce((sum, c, n) => sum + (rgb[n] - c) ** 2, 0);
    if (d < dist) { dist = d; best = i; }
  }
  colorCache.set(key, best); return best;
}
function lzw(indices) {
  const bytes = []; let data = 0, held = 0, bits = 9, next = 258, dictionary = new Map();
  const emit = code => { data |= code << held; held += bits; while (held >= 8) { bytes.push(data & 255); data >>>= 8; held -= 8; } };
  emit(256); let prefix = indices[0];
  for (let i = 1; i < indices.length; i++) {
    const suffix = indices[i], key = prefix * 256 + suffix;
    if (dictionary.has(key)) { prefix = dictionary.get(key); continue; }
    emit(prefix);
    if (next < 4096) { dictionary.set(key, next++); if (next > 1 << bits) bits++; }
    else { emit(256); dictionary = new Map(); bits = 9; next = 258; }
    prefix = suffix;
  }
  emit(prefix); if (next === 1 << bits && bits < 12) bits++; emit(257);
  if (held) bytes.push(data & 255);
  const parts = [Buffer.from([8])];
  for (let i = 0; i < bytes.length; i += 255) parts.push(Buffer.from([Math.min(255, bytes.length - i)]), Buffer.from(bytes.slice(i, i + 255)));
  return Buffer.concat([...parts, Buffer.from([0])]);
}
function gif(path, frames, scale = 1, fps = 30) {
  const w = W * scale, h = H * scale, header = Buffer.alloc(13);
  header.write("GIF89a"); header.writeUInt16LE(w, 6); header.writeUInt16LE(h, 8); header[10] = 0xf7;
  const parts = [header, Buffer.from(palette.flat()), Buffer.from([0x21,0xff,11]), Buffer.from("NETSCAPE2.0"), Buffer.from([3,1,0,0,0])];
  for (const [index, frame] of frames.entries()) {
    const data = enlarge(frame, scale), indices = new Uint8Array(w * h);
    for (let i = 0; i < indices.length; i++) indices[i] = paletteIndex(data.subarray(i * 4, i * 4 + 3));
    const delay = Math.round((index + 1) * 100 / fps) - Math.round(index * 100 / fps);
    const descriptor = Buffer.alloc(10); descriptor[0] = 0x2c; descriptor.writeUInt16LE(w, 5); descriptor.writeUInt16LE(h, 7);
    parts.push(Buffer.from([0x21,0xf9,4,4,delay,0,0,0]), descriptor, lzw(indices));
  }
  writeFileSync(new URL(art + path, root), Buffer.concat([...parts, Buffer.from([0x3b])]));
}
const fps = 30, count = Math.round(MISSILE_DEMO_SECONDS * fps);
const heavy = Array.from({ length: count }, (_, i) => render("heavy", i / fps).pixels);
gif("full-cycle-1x.gif", heavy); gif("full-cycle-2x.gif", heavy, 2);
gif("combined-1x.gif", Array.from({ length: count }, (_, i) => render("combined", i / fps).pixels));
gif("impact-025x.gif", Array.from({ length: 84 }, (_, i) => render("heavy", 1.14 + i / 120).pixels));
const ionFrames = Array.from({ length: count }, (_, i) => render("ion", i / fps).pixels);
gif("ion-cycle-1x.gif", ionFrames); gif("ion-cycle-2x.gif", ionFrames, 2);
gif("ion-impact-025x.gif", Array.from({ length: 84 }, (_, i) => render("ion", 1.16 + i / 120).pixels));
const posterW = W * 2, posterH = H * 3, poster = Buffer.alloc(posterW * posterH * 4);
for (const [i, c] of MISSILE_DEMO_CASES.entries()) {
  const frame = render(c.id, [1.28, 1.0, 0.96, 1.03, 1.32, 1.48][i]).pixels;
  for (let y = 0; y < H; y++) frame.copy(poster, ((Math.floor(i / 2) * H + y) * posterW + i % 2 * W) * 4, y * W * 4, (y + 1) * W * 4);
}
writeFileSync(new URL(art + "scenario-poster.png", root), encodePng(posterW, posterH, poster));
const detail = render("heavy", 0.86).pixels;
writeFileSync(new URL(art + "flight-2x.png", root), encodePng(W * 2, H * 2, enlarge(detail, 2)));
const ionDetail = render("ion", 1.32).pixels, crop = { x: 290, y: 57, w: 112, h: 142, zoom: 4 };
const cropPixels = Buffer.alloc(crop.w * crop.h * crop.zoom * crop.zoom * 4);
for (let y = 0; y < crop.h * crop.zoom; y++) for (let x = 0; x < crop.w * crop.zoom; x++) {
  const at = ((crop.y + Math.floor(y / crop.zoom)) * W + crop.x + Math.floor(x / crop.zoom)) * 4;
  ionDetail.copy(cropPixels, (y * crop.w * crop.zoom + x) * 4, at, at + 4);
}
writeFileSync(new URL(art + "ion-impact-detail-4x.png", root), encodePng(crop.w * crop.zoom, crop.h * crop.zoom, cropPixels));
const inspection = [1.2, 1.22, 1.245, 1.285, 1.34, 1.43, 1.55, 1.72, 1.89].map(t => ({ time: t, commands: render("heavy", t).commands }));
writeFileSync(new URL(art + "preview-record.json", root), JSON.stringify({ fps, seconds: MISSILE_DEMO_SECONDS, cases: MISSILE_DEMO_CASES,
  exports: ["full-cycle-1x.gif", "full-cycle-2x.gif", "combined-1x.gif", "impact-025x.gif", "scenario-poster.png", "flight-2x.png", "preview.html",
    "ion-cycle-1x.gif", "ion-cycle-2x.gif", "ion-impact-025x.gif", "ion-impact-detail-4x.png"],
  inspection, ionInspection: [0.85, 1.2, 1.24, 1.28, 1.36, 1.48, 1.58].map(t => {
    const commands = render("ion", t).commands;
    return { time: t, sprites: commands.filter(c => c.kind === "sprite").length, lines: commands.filter(c => c.kind === "line").length };
  }),
  source: "actual MissileVfxPlayer + atlas; deterministic offline choreography with preset charges, not gameplay" }, null, 2) + "\n");
console.log(JSON.stringify({ html: art + "preview.html", clips: Object.keys(MISSILE_CLIPS).length, gifFrames: count,
  seconds: MISSILE_DEMO_SECONDS, cases: MISSILE_DEMO_CASES.length, scope: "offline asset preview; no gameplay acceptance" }));
