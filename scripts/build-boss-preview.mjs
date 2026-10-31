/** Actual BossVfx + actual pose atlas; offline art choreography, no combat execution. */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { decodePng, encodePng } from "./lib/png.mjs";
import { loadPalette, hexToRgb } from "./lib/palette.mjs";

const root = fileURLToPath(new URL("../", import.meta.url)), out = resolve(root, "assets/boss-three/preview");
mkdirSync(out, { recursive: true });
const cache = new Map();
function moduleUrl(path) {
  path = resolve(root, path);
  if (cache.has(path)) return cache.get(path);
  let code = ts.transpileModule(readFileSync(path, "utf8"), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
  code = code.replace(/from\s+(["'])(\.\.?\/[^"']+)\1/g, (_, quote, relative) => "from " + JSON.stringify(moduleUrl(resolve(dirname(path), relative + ".ts"))));
  const url = "data:text/javascript;base64," + Buffer.from(code).toString("base64");
  cache.set(path, url); return url;
}
const vfxUrl = moduleUrl("src/game/rendering/BossVfx.ts"), dataUrl = moduleUrl("src/game/data/boss.ts");
const { drawBossWorld, drawAnimatedBoss } = await import(vfxUrl);
const { BOSS, BOSS_ATTACKS, BOSS_STOMP_RADIUS } = await import(dataUrl);
const pngBytes = readFileSync(resolve(root, "public/assets/boss-three/boss.atlas.png"));
const atlas = decodePng(pngBytes), frameData = JSON.parse(readFileSync(resolve(root, "public/assets/boss-three/boss.atlas.json"), "utf8")).frames;
const fxBytes = readFileSync(resolve(root, "public/assets/boss-three/boss-fx.atlas.png"));
const fxAtlas = decodePng(fxBytes), fxFrameData = JSON.parse(readFileSync(resolve(root, "public/assets/boss-three/boss-fx.atlas.json"), "utf8")).frames;
const textures = { "boss-three-poses": { image: atlas, frames: frameData }, "boss-three-generated-fx": { image: fxAtlas, frames: fxFrameData } };
const W = 480, H = 270, BG = [19, 23, 30], GRID = [27, 32, 41];

function visualFrame(id, t) {
  const phase = ["nova", "spikes"].includes(id) ? 2 : ["marks", "chain"].includes(id) ? 3 : 1;
  const enemy = { x: id === "nova" || id === "stomp" ? 220 : 105, y: 151, r: 24, hp: 100, maxhp: 100, flash: 0, dead: false };
  const player = { x: 328, y: 150, r: 5 };
  const s = { enemy, phase, action: "windup", actionT: BOSS_ATTACKS[id]?.windup ?? 1.2, attack: id, angle: 0 };
  const view = { bossState: s, bossHazards: [], bossStrikes: [], bossImpacts: [], time: t, state: "play", player, enemies: [] };
  const warn = BOSS_ATTACKS[id]?.windup ?? 1.2, release = t - warn;
  s.actionT = Math.max(0, warn - t);
  const impact = (attack, age, at = enemy, r = 0, innerR = 0) => {
    const max = attack === "spikes" ? 0.85 : attack === "breath" ? 0.38 : 0.55;
    if (age >= 0 && age < max) view.bossImpacts.push({ ...at, attack, phase, angle: 0, r, innerR, t: max - age, max, points: [] });
  };
  const strike = (attack, at, elapsed, windup, r, innerR = 0) => {
    if (elapsed >= 0 && elapsed < windup) view.bossStrikes.push({ ...at, attack, type: attack === "marks" ? "lightning" : "frost", windup, t: windup - elapsed, r, innerR });
  };
  if (release >= 0) { s.action = "recover"; s.actionT = Math.max(0, BOSS.recover - release); }
  if (id === "intro") { s.action = t < 1.2 ? "intro" : "chase"; s.actionT = Math.max(0, 1.2 - t); s.attack = null; }
  if (id === "stomp") impact(id, release, enemy, BOSS_STOMP_RADIUS);
  if (id === "charge" && release >= 0) {
    enemy.x += Math.min(BOSS.charge.duration, release) * BOSS.charge.speed;
    s.action = release < BOSS.charge.duration ? "dash" : "stagger";
    s.actionT = release < BOSS.charge.duration ? BOSS.charge.duration - release : Math.max(0, 1 - release + BOSS.charge.duration);
    impact(id, release - BOSS.charge.duration, enemy, 55);
  }
  if (id === "breath" && release >= 0) {
    if (release < BOSS.breath.duration) { s.action = "cast"; s.actionT = BOSS.breath.duration - release; }
    for (const d of BOSS.breath.groundDistances) view.bossHazards.push({ kind: "fire", x: enemy.x + d, y: enemy.y, r: BOSS.hazard.radius, t: 4 - release });
    for (let i = 0; i <= BOSS.breath.repeats; i++) impact(id, release - i * BOSS.breath.tick, enemy, BOSS.breath.radius);
  }
  if (id === "nova") {
    impact(id, release, enemy, BOSS.nova.radius, BOSS.nova.innerRadius);
    strike(id, enemy, release, BOSS.nova.repeatDelay, BOSS.nova.secondRadius, BOSS.nova.secondInnerRadius);
    impact(id, release - BOSS.nova.repeatDelay, enemy, BOSS.nova.secondRadius, BOSS.nova.secondInnerRadius);
    if (release >= 0 && release < BOSS.nova.repeatDelay) { s.action = "cast"; s.actionT = BOSS.nova.repeatDelay - release; }
  }
  if (id === "spikes") for (let i = 0; i < 3; i++) {
    const at = { x: enemy.x + (i + 1) * BOSS.spikes.spacing, y: enemy.y };
    strike(id, at, t, warn + i * BOSS.spikes.stagger, BOSS.spikes.radius);
    impact(id, release - i * BOSS.spikes.stagger, at, BOSS.spikes.radius);
    if (release > i * BOSS.spikes.stagger) view.bossHazards.push({ ...at, kind: "frost", r: BOSS.spikes.radius, t: 4 - release });
  }
  if (id === "marks") for (let salvo = 0; salvo < 3; salvo++) {
    const start = salvo * (warn + BOSS.marks.salvoGap), center = { x: 284 + salvo * 18, y: 142 + salvo * 12 };
    for (let i = -1; i <= 1; i++) {
      const at = { x: center.x, y: center.y + i * BOSS.marks.offset };
      strike(id, at, t - start, warn, BOSS.marks.radius);
      impact(id, t - start - warn, at, BOSS.marks.radius);
    }
    if (release >= 0 && t < 3 * (warn + BOSS.marks.salvoGap)) { s.action = "cast"; s.actionT = 0.7; }
  }
  if (id === "chain") impact(id, release, enemy, BOSS.chain.length);
  return view;
}

class RasterPainter {
  fillStyle = "#ffffff"; strokeStyle = "#ffffff"; globalAlpha = 1; font = "8px monospace"; textAlign = "left";
  constructor() {
    this.data = Buffer.alloc(W * H * 4);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) this.data.set([...(x % 24 === 0 || y % 24 === 0 ? GRID : BG), 255], (y * W + x) * 4);
  }
  pixel(x, y, color, alpha = this.globalAlpha) {
    x = Math.round(x); y = Math.round(y);
    if (x < 0 || y < 0 || x >= W || y >= H || alpha <= 0) return;
    const at = (y * W + x) * 4, rgb = typeof color === "string" ? hexToRgb(color) : color;
    for (let i = 0; i < 3; i++) this.data[at + i] = Math.round(this.data[at + i] * (1 - alpha) + rgb[i] * alpha);
  }
  fillRect(x, y, w, h) { for (let iy = Math.floor(y); iy < y + h; iy++) for (let ix = Math.floor(x); ix < x + w; ix++) this.pixel(ix, iy, this.fillStyle); }
  beam(x, y, x2, y2, width, color, alpha) {
    const count = Math.max(1, Math.ceil(Math.hypot(x2 - x, y2 - y))), painted = new Set(), r = Math.max(0, Math.floor(width / 2));
    for (let i = 0; i <= count; i++) for (let oy = -r; oy <= r; oy++) for (let ox = -r; ox <= r; ox++) {
      const px = Math.round(x + (x2 - x) * i / count) + ox, py = Math.round(y + (y2 - y) * i / count) + oy, key = py * W + px;
      if (!painted.has(key)) { painted.add(key); this.pixel(px, py, color, alpha); }
    }
  }
  beginPath() { this.points = []; }
  moveTo(x, y) { this.points.push([x, y, true]); }
  lineTo(x, y) { this.points.push([x, y, false]); }
  arc(x, y, r, start, end) {
    const count = Math.max(8, Math.ceil((end - start) * r));
    for (let i = 0; i <= count; i++) this.points.push([x + Math.cos(start + (end - start) * i / count) * r,
      y + Math.sin(start + (end - start) * i / count) * r, i === 0 && this.points.length === 0]);
  }
  stroke() { for (let i = 1; i < this.points.length; i++) if (!this.points[i][2]) this.beam(...this.points[i - 1].slice(0, 2), ...this.points[i].slice(0, 2), 1, this.strokeStyle, this.globalAlpha); }
  polygon(points, color, alpha) {
    const ys = points.filter((_, i) => i % 2), count = points.length / 2;
    for (let y = Math.max(0, Math.floor(Math.min(...ys))); y <= Math.min(H - 1, Math.ceil(Math.max(...ys))); y++) {
      const xs = [];
      for (let i = 0, j = count - 1; i < count; j = i++) {
        const x1 = points[i * 2], y1 = points[i * 2 + 1], x2 = points[j * 2], y2 = points[j * 2 + 1];
        if ((y1 <= y && y2 > y) || (y2 <= y && y1 > y)) xs.push(x1 + (y - y1) * (x2 - x1) / (y2 - y1));
      }
      xs.sort((a, b) => a - b);
      for (let i = 0; i + 1 < xs.length; i += 2) for (let x = Math.ceil(xs[i]); x <= xs[i + 1]; x++) this.pixel(x, y, color, alpha);
    }
  }
  hasTexture() { return true; }
  spriteFrame(key, name, pose) {
    const { image, frames } = textures[key], r = frames[name].frame;
    const co=Math.cos(pose.angle), si=Math.sin(pose.angle), ax=r.w*pose.originX, ay=r.h*pose.originY;
    const corners=[[0,0],[r.w,0],[0,r.h],[r.w,r.h]].map(([x,y])=>({x:pose.x+co*(x-ax)*pose.scaleX-si*(y-ay)*pose.scaleY,y:pose.y+si*(x-ax)*pose.scaleX+co*(y-ay)*pose.scaleY}));
    const x0=Math.max(0,Math.floor(Math.min(...corners.map(p=>p.x)))),x1=Math.min(W,Math.ceil(Math.max(...corners.map(p=>p.x))));
    const y0=Math.max(0,Math.floor(Math.min(...corners.map(p=>p.y)))),y1=Math.min(H,Math.ceil(Math.max(...corners.map(p=>p.y))));
    for(let y=y0;y<y1;y++)for(let x=x0;x<x1;x++){
      const dx=x+.5-pose.x,dy=y+.5-pose.y;
      const sx=Math.floor((dx*co+dy*si)/pose.scaleX+ax),sy=Math.floor((-dx*si+dy*co)/pose.scaleY+ay);
      if(sx<0||sy<0||sx>=r.w||sy>=r.h)continue;
      const at=((r.y+sy)*image.width+r.x+sx)*4;
      if(image.rgba[at+3])this.pixel(x,y,image.rgba.subarray(at,at+3),this.globalAlpha*image.rgba[at+3]/255);
    }
  }
  fillText() {} // Raster plates omit labels; HTML uses native text and the real renderer labels.
}
function render(id, time) {
  const painter = new RasterPainter(), view = visualFrame(id, time);
  drawBossWorld(view, painter); drawAnimatedBoss(view, painter);
  painter.fillStyle = "#3d6de0"; painter.fillRect(view.player.x - 3, view.player.y - 1, 6, 7);
  painter.fillStyle = "#f4a940"; painter.fillRect(view.player.x - 3, view.player.y - 5, 6, 4);
  return painter.data;
}
const cases = ["intro", "stomp", "charge", "breath", "nova", "spikes", "marks", "chain"];
const plateW = W * 2, plateH = H * 4, plate = Buffer.alloc(plateW * plateH * 4);
for (let i = 0; i < cases.length; i++) {
  const time = [0.9, 0.74, 1.02, 1.04, 1.07, 1.05, 0.73, 0.68][i], data = render(cases[i], time);
  for (let y = 0; y < H; y++) data.copy(plate, ((Math.floor(i / 2) * H + y) * plateW + i % 2 * W) * 4, y * W * 4, (y + 1) * W * 4);
}
writeFileSync(resolve(out, "boss-effects.png"), encodePng(plateW, plateH, plate));
const palette = [BG, GRID, ...loadPalette().map(c => hexToRgb(c.hex))];
for (const color of [...palette].slice(2)) for (const a of [0.2, 0.4, 0.6, 0.8]) palette.push(color.map((c, k) => Math.round(BG[k] * (1 - a) + c * a)));
while (palette.length < 256) palette.push(BG);
const nearest = new Map();
function index(rgb) {
  const key = rgb[0] << 16 | rgb[1] << 8 | rgb[2];
  if (nearest.has(key)) return nearest.get(key);
  let best = 0, distance = Infinity;
  for (let i = 0; i < 256; i++) {
    const d = palette[i].reduce((sum, v, k) => sum + (v - rgb[k]) ** 2, 0);
    if (d < distance) { best = i; distance = d; }
  }
  nearest.set(key, best); return best;
}
function lzw(indices) {
  const bytes = []; let data = 0, held = 0, bits = 9, next = 258, dict = new Map();
  const emit = code => { data |= code << held; held += bits; while (held >= 8) { bytes.push(data & 255); data >>>= 8; held -= 8; } };
  emit(256); let prefix = indices[0];
  for (let i = 1; i < indices.length; i++) {
    const key = prefix * 256 + indices[i];
    if (dict.has(key)) { prefix = dict.get(key); continue; }
    emit(prefix);
    if (next < 4096) { dict.set(key, next++); if (next > 1 << bits) bits++; }
    else { emit(256); dict = new Map(); bits = 9; next = 258; }
    prefix = indices[i];
  }
  emit(prefix); if (next === 1 << bits && bits < 12) bits++; emit(257); if (held) bytes.push(data & 255);
  const parts = [Buffer.from([8])];
  for (let i = 0; i < bytes.length; i += 255) parts.push(Buffer.from([Math.min(255, bytes.length - i)]), Buffer.from(bytes.slice(i, i + 255)));
  return Buffer.concat([...parts, Buffer.from([0])]);
}
const header = Buffer.alloc(13); header.write("GIF89a"); header.writeUInt16LE(W, 6); header.writeUInt16LE(H, 8); header[10] = 0xf7;
const parts = [header, Buffer.from(palette.flat()), Buffer.from([0x21, 0xff, 11]), Buffer.from("NETSCAPE2.0"), Buffer.from([3, 1, 0, 0, 0])];
const fps = 16, selected = ["breath", "spikes", "marks", "charge", "nova", "chain"];
for (const id of selected) for (let i = 0; i < 40; i++) {
  const rgba = render(id, i / fps), indices = new Uint8Array(W * H);
  for (let k = 0; k < indices.length; k++) indices[k] = index(rgba.subarray(k * 4, k * 4 + 3));
  const descriptor = Buffer.alloc(10); descriptor[0] = 0x2c; descriptor.writeUInt16LE(W, 5); descriptor.writeUInt16LE(H, 7);
  parts.push(Buffer.from([0x21, 0xf9, 4, 4, i % 4 === 0 ? 7 : 6, 0, 0, 0]), descriptor, lzw(indices));
}
writeFileSync(resolve(out, "boss-redraw.gif"), Buffer.concat([...parts, Buffer.from([0x3b])]));
const html = `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>三首巨兽 · 重绘素材预览</title>
<style>body{background:#10141e;color:#d9e2eb;font:16px system-ui;margin:24px}canvas{width:min(960px,100%);image-rendering:pixelated;border:1px solid #394150}button,select,input{margin:8px;padding:8px;background:#252c3d;color:#fff;border:1px solid #52617a}p{max-width:900px;line-height:1.7}</style>
<h1>三首巨兽 · 动作与特效重绘</h1><p>正式 BossVfx 绘制代码 + 生图 Boss 八姿态和六套技能图集（参照 PR #220 太刀人物）。离线素材编排，可查看动作、预警和爆发；不执行战斗伤害或代表实机难度验收。</p>
<select id="scene">${cases.map(x => '<option>' + x + '</option>').join('')}</select><button id="pause">暂停</button><select id="speed"><option value="1">原速</option><option value="0.25">0.25 倍速</option></select><input id="seek" type="range" min="0" max="2.5" step="0.01" value="0"><br><canvas id="canvas" width="480" height="270"></canvas>
<script type="module">import{drawBossWorld,drawAnimatedBoss}from ${JSON.stringify(vfxUrl)};import{BOSS,BOSS_ATTACKS,BOSS_STOMP_RADIUS}from ${JSON.stringify(dataUrl)};
const visualFrame=${visualFrame.toString()};const frames=${JSON.stringify(frameData)},fxFrames=${JSON.stringify(fxFrameData)};const image=new Image();image.src=${JSON.stringify("data:image/png;base64," + pngBytes.toString("base64"))};const fxImage=new Image();fxImage.src=${JSON.stringify("data:image/png;base64," + fxBytes.toString("base64"))};await Promise.all([image.decode(),fxImage.decode()]);const textures={"boss-three-poses":{image,frames},"boss-three-generated-fx":{image:fxImage,frames:fxFrames}};
const canvas=document.querySelector('canvas'),c=canvas.getContext('2d'),scene=document.querySelector('#scene'),seek=document.querySelector('#seek'),speed=document.querySelector('#speed');let time=0,playing=true,last=0;
const painter={fillStyle:'#fff',strokeStyle:'#fff',globalAlpha:1,font:'8px monospace',textAlign:'left',fillRect(x,y,w,h){c.fillStyle=this.fillStyle;c.globalAlpha=this.globalAlpha;c.fillRect(x,y,w,h)},beam(x,y,x2,y2,w,color,a){c.globalAlpha=a;c.strokeStyle=color;c.lineWidth=w;c.beginPath();c.moveTo(x,y);c.lineTo(x2,y2);c.stroke()},polygon(p,color,a){c.globalAlpha=a;c.fillStyle=color;c.beginPath();c.moveTo(p[0],p[1]);for(let i=2;i<p.length;i+=2)c.lineTo(p[i],p[i+1]);c.closePath();c.fill()},beginPath(){c.globalAlpha=this.globalAlpha;c.strokeStyle=this.strokeStyle;c.lineWidth=1;c.beginPath()},moveTo(x,y){c.moveTo(x,y)},lineTo(x,y){c.lineTo(x,y)},arc(x,y,r,a,b){c.arc(x,y,r,a,b)},stroke(){c.stroke()},hasTexture(){return true},spriteFrame(key,name,p){const t=textures[key],r=t.frames[name].frame;c.save();c.globalAlpha=this.globalAlpha;c.translate(p.x,p.y);c.rotate(p.angle);c.scale(p.scaleX,p.scaleY);c.drawImage(t.image,r.x,r.y,r.w,r.h,-r.w*p.originX,-r.h*p.originY,r.w,r.h);c.restore()},fillText(s,x,y){c.globalAlpha=this.globalAlpha;c.fillStyle=this.fillStyle;c.font=this.font;c.textAlign=this.textAlign;c.fillText(s,x,y)}};
document.querySelector('#pause').onclick=()=>{playing=!playing;document.querySelector('#pause').textContent=playing?'暂停':'播放'};seek.oninput=()=>{time=Number(seek.value);playing=false};scene.onchange=()=>time=0;
function tick(now){if(playing)time=(time+Math.min(.05,(now-last)/1000)*Number(speed.value))%2.5;last=now;seek.value=time;c.globalAlpha=1;c.fillStyle='#13171e';c.fillRect(0,0,480,270);c.imageSmoothingEnabled=false;const view=visualFrame(scene.value,time);drawBossWorld(view,painter);drawAnimatedBoss(view,painter);c.globalAlpha=1;c.fillStyle='#3d6de0';c.fillRect(view.player.x-3,view.player.y-1,6,7);c.fillStyle='#f4a940';c.fillRect(view.player.x-3,view.player.y-5,6,4);requestAnimationFrame(tick)}requestAnimationFrame(tick);</script></html>`;
writeFileSync(resolve(out, "index.html"), html);
mkdirSync(resolve(root, "public/boss-preview"), { recursive: true });
writeFileSync(resolve(root, "public/boss-preview/index.html"), html);
writeFileSync(resolve(out, "preview-record.json"), JSON.stringify({ renderer: "src/game/rendering/BossVfx.ts", atlas: "public/assets/boss-three/boss.atlas.png",
  effectAtlas: "public/assets/boss-three/boss-fx.atlas.png", effectFrames: Object.keys(fxFrameData).length,
  fps, gifFrames: 240, cases, scope: "offline visual choreography; not GameCore, browser test or gameplay acceptance" }, null, 2) + "\n");
console.log(JSON.stringify({ html: "public/boss-preview/index.html", poster: "assets/boss-three/preview/boss-effects.png", gif: "assets/boss-three/preview/boss-redraw.gif", frames: 240 }));
