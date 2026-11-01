/** Offline composition through the unwired MageVfx handoff sampler, not a gameplay recording. */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { decodePng, encodePng } from "./lib/png.mjs";

const root = new URL("../", import.meta.url);
const source = (path) => readFileSync(new URL(path, root), "utf8");
const compile = (text) => ts.transpileModule(text, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
const moduleUrl = (code) => "data:text/javascript;base64," + Buffer.from(code).toString("base64");
const balance = moduleUrl(compile(source("src/game/data/mageBalance.ts")));
const rules = moduleUrl(compile(source("src/game/data/elementalMage.ts")));
const elements = moduleUrl(compile(source("src/game/core/ElementMath.ts")).replace('from "../data/elementalMage"', `from "${rules}"`));
const code = compile(source("src/game/rendering/vfx/MageVfx.ts"))
  .replace('from "../../core/ElementMath"', `from "${elements}"`)
  .replace('from "../../data/elementalMage"', `from "${rules}"`);
if (/\bfrom\s+["']\./.test(code)) throw new Error("Unresolved mage preview import");
const { MageVfx, MAGE_VFX } = await import(moduleUrl(code));
const { MAGE_BALANCE: MB } = await import(balance);
const sheet = decodePng(readFileSync(new URL("public/" + MAGE_VFX.image, root)));
const output = new URL("output/mage-vfx-preview/", root);
mkdirSync(output, { recursive: true });
const width = 480, height = 270;
let pixels;
const put = (x, y, color, alpha = 1) => {
  if (x < 0 || y < 0 || x >= width || y >= height) return;
  const p = (y * width + x) * 4;
  for (let c = 0; c < 3; c++) pixels[p + c] = Math.round(color[c] * alpha + pixels[p + c] * (1 - alpha));
  pixels[p + 3] = 255;
};
const painter = {
  globalAlpha: 1, hasTexture: (key) => key === MAGE_VFX.key,
  spriteFrame(_key, frame, pose) {
    const index = Number(frame), size = MAGE_VFX.size;
    for (let y = 0; y < size * pose.scaleY; y++) for (let x = 0; x < size * pose.scaleX; x++) {
      const sx = index % 6 * size + Math.floor(x / pose.scaleX);
      const sy = Math.floor(index / 6) * size + Math.floor(y / pose.scaleY);
      const p = (sy * sheet.width + sx) * 4;
      if (sheet.rgba[p + 3]) put(Math.round(pose.x - size * pose.scaleX / 2 + x), Math.round(pose.y - size * pose.scaleY / 2 + y), sheet.rgba.subarray(p, p + 3), this.globalAlpha);
    }
  },
  beam(x0, y0, x1, y1, _width, color, alpha) {
    const rgb = [1, 3, 5].map((i) => parseInt(color.slice(i, i + 2), 16));
    const steps = Math.ceil(Math.hypot(x1 - x0, y1 - y0));
    for (let i = 0; i <= steps; i++) put(Math.round(x0 + (x1 - x0) * i / steps), Math.round(y0 + (y1 - y0) * i / steps), rgb, alpha);
  },
};
function body(x, y) {
  for (let dy = -5; dy <= 5; dy++) for (let dx = -6; dx <= 6; dx++)
    if (dx * dx / 36 + dy * dy / 25 <= 1) put(x + dx, y + dy, dy < 0 ? [77, 124, 88] : [39, 73, 59]);
  put(x - 2, y - 1, [232, 232, 240]); put(x + 2, y - 1, [232, 232, 240]);
}
function ring(x, y, r) {
  for (let a = 0; a < Math.PI * 2; a += 1 / (r * 2)) put(Math.round(x + Math.cos(a) * r), Math.round(y + Math.sin(a) * r), [90, 82, 143], 0.5);
}
const player = { area: 1, upCounts: {} };
const enemies = [
  ...Array.from({ length: 3 }, (_, i) => ({ x: 40 + i * 54, y: 155, seed: i, elemFire: Array(i + 1).fill(3) })),
  ...Array.from({ length: 3 }, (_, i) => ({ x: 40 + i * 54, y: 223, seed: i, elemFrost: Array(i + 1).fill(3) })),
  { x: 240, y: 155, seed: 1, elemFrozenT: 0 },
  { x: 315, y: 155, seed: 1, elemFrostLockT: 0 },
  { x: 405, y: 155, seed: 2, elemShockT: 4 },
];
const core = { prof: "mage", state: "play", player, time: 0, enemies, mageShadows: [], mageVisualEvents: [] };
const view = new MageVfx();
const pictures = [], files = [];
const fps = 30, duration = 3, count = Math.round(fps * duration);
const elementNames = ["fire", "frost", "lightning"];
let casting = true;
for (let i = 0; i < count; i++) {
  const time = i / fps, cycle = time % MB.castCycle;
  core.time = time;
  const active = cycle < MB.castWindup;
  core.mageVisualEvents = casting && !active ? elementNames.map((element, index) => ({ kind: "body", at: time, element, x: 80 + index * 160, y: 62, radius: MB.circleRadius })) : [];
  casting = active;
  enemies[6].elemFrozenT = time < 0.2 ? 0 : Math.max(0, 1.7 - time);
  enemies[7].elemFrostLockT = time < 0.2 ? 0 : Math.max(0, 2.2 - time);
  enemies[8].elemShockT = Math.max(0, 2.8 - time);
  view.capture(core);
  pixels = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) put(x, y, x % 16 === 0 || y % 16 === 0 ? [26, 31, 47] : [16, 20, 33]);
  if (active) {
    const progress = Math.min(1, cycle / MB.castWindup);
    const radius = Math.round(MB.circleRadius * (1 - (1 - progress) ** 2));
    for (const [index, element] of elementNames.entries()) {
      ring(80 + index * 160, 62, radius);
      view.drawCast(painter, 80 + index * 160, 62, radius, progress, element);
    }
  }
  view.drawImpacts(painter);
  for (const e of enemies) { body(e.x, e.y); view.drawEnemy(painter, e, 14, 12); }
  // The heavier anchor frame is procedural in draw.ts; here indicate the same boundary.
  if (enemies[7].elemFrostLockT > 0)
    for (let d = -10; d <= 10; d++) { put(315 + d, 145, [26, 159, 212]); put(315 + d, 165, [26, 159, 212]); put(305, 155 + d, [26, 159, 212]); put(325, 155 + d, [26, 159, 212]); }
  for (const [index, element] of elementNames.entries()) view.drawPrism(painter, { element, x: 240 + index * 80, y: 227 });
  const png = encodePng(width, height, pixels);
  const file = new URL(`frame-${String(i).padStart(3, "0")}.png`, output);
  writeFileSync(file, png); files.push(fileURLToPath(file));
  pictures.push("data:image/png;base64," + png.toString("base64"));
  if (i === 34) writeFileSync(new URL("assets/vfx/mage/mage-vfx-preview-1x.png", root), png);
}
const labels = '<div class="labels"><span style="left:12%;top:5%">火法阵</span><span style="left:45%;top:5%">冰法阵</span><span style="left:79%;top:5%">雷法阵</span><span style="left:3%;top:45%">灼烧 1 / 2 / 3 层</span><span style="left:3%;top:73%">凝冰 1 / 2 / 3 层</span><span style="left:47%;top:43%">冻结</span><span style="left:62%;top:43%">霜牢</span><span style="left:81%;top:43%">雷印</span><span style="left:48%;top:73%">三元素棱镜</span></div>';
const html = `<!doctype html><meta charset="utf-8"><title>元素法师 VFX 离线预览</title><style>body{background:#0b101e;color:#e8e8f0;font:16px system-ui;margin:30px auto;max-width:1000px}h1{font-size:24px}button,select{font:inherit;padding:6px;margin-right:12px}canvas{width:100%;image-rendering:pixelated}.stage{position:relative}.labels{position:absolute;inset:0;pointer-events:none}.labels span{position:absolute;font-size:13px;color:#c3c9e0}p{line-height:1.6}</style><h1>元素法师 VFX · 技能素材交接预览（未接入）</h1><p>使用未启用的 MageVfx 交接取帧器与图集，480×270 逻辑分辨率。下方为示意敌人和编排状态，不是实战录像。</p><button id="play">暂停</button><label>速度 <select id="speed"><option value="1">原速</option><option value="0.25">1/4 慢放</option></select></label><button id="restart">从头播放</button><div class="stage"><canvas width="480" height="270"></canvas>${labels}</div><p>保持精确范围圈、普通 alpha、整数缩放；冻结维持时不播放碎裂。暂停、重开、完整玩法与性能仍需实机检查。</p><script>const urls=${JSON.stringify(pictures)},fps=${fps};Promise.all(urls.map(src=>new Promise(resolve=>{const img=new Image;img.onload=()=>resolve(img);img.src=src}))).then(frames=>{const ctx=document.querySelector('canvas').getContext('2d');ctx.imageSmoothingEnabled=false;let playing=true,t=0,last=performance.now();document.querySelector('#play').onclick=()=>{playing=!playing;document.querySelector('#play').textContent=playing?'暂停':'播放'};document.querySelector('#restart').onclick=()=>t=0;function tick(now){if(playing)t+=(now-last)/1000*Number(document.querySelector('#speed').value);last=now;ctx.drawImage(frames[Math.floor(t*fps)%frames.length],0,0);requestAnimationFrame(tick)}requestAnimationFrame(tick)});</script>`;
writeFileSync(new URL("assets/vfx/mage/mage-vfx-preview.html", root), html);
const manifest = new URL("frames.json", output);
writeFileSync(manifest, JSON.stringify({ fps, count, files, output: fileURLToPath(new URL("assets/vfx/mage/mage-vfx-preview.gif", root)) }));
execFileSync("python", [fileURLToPath(new URL("scripts/export-mage-vfx-preview.py", root)), fileURLToPath(manifest)], { stdio: "inherit" });
console.log(JSON.stringify({ frames: count, fps, width, height, preview: "assets/vfx/mage/mage-vfx-preview.html", source: "unwired handoff sampler; illustrative snapshots only" }));
