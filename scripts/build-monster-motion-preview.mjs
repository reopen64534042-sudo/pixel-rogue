import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";
import { drawMonsterEffect, monsterWarningCircle, monsterWarningLane } from "../src/game/rendering/MonsterFxRecipes.ts";
import { MONSTER_PREVIEW_CARDS as cards, renderMonsterPreview } from "./lib/monster-motion-preview.mjs";
import { loadPalette, REPO_ROOT } from "./lib/palette.mjs";

const colors = Object.fromEntries(loadPalette().map(c => [c.key, c.hex]));
const manifest = JSON.parse(readFileSync(join(REPO_ROOT, "public/assets/monsters/animation/manifest.json"), "utf8"));
const sources = Object.fromEntries(manifest.units.map(u => [u.key, { file: `public/assets/monsters/animation/${u.file}`, size: u.frame[0] }]));
const images = Object.fromEntries(Object.entries(sources).map(([key, data]) => [key, {
  ...data, src: `data:image/png;base64,${readFileSync(join(REPO_ROOT, data.file)).toString("base64")}`,
}]));
const out = join(REPO_ROOT, "docs/previews/monsters-v168"), temp = join(REPO_ROOT, "output/monsters-v168");
mkdirSync(out, { recursive: true }); mkdirSync(temp, { recursive: true });
const recipes = ts.transpileModule(readFileSync(join(REPO_ROOT, "src/game/rendering/MonsterFxRecipes.ts"), "utf8"),
  { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
const choreography = readFileSync(join(REPO_ROOT, "scripts/lib/monster-motion-preview.mjs"), "utf8");
const browser = `
const sources=${JSON.stringify(images)}, C=${JSON.stringify(colors)};
const bitmaps=Object.fromEntries(await Promise.all(Object.entries(sources).map(async([key,s])=>{const i=new Image();i.src=s.src;await i.decode();return [key,i]})));
class CanvasPainter {
 constructor(c){this.c=c;this.fillStyle='#fff';this.strokeStyle='#fff';this.globalAlpha=1}
 fillRect(x,y,w,h){this.c.fillStyle=this.fillStyle;this.c.globalAlpha=this.globalAlpha;this.c.fillRect(x,y,w,h);this.c.globalAlpha=1}
 beam(x,y,x2,y2,w,color,a){const c=this.c;c.globalAlpha=a;c.strokeStyle=color;c.lineWidth=w;c.beginPath();c.moveTo(x,y);c.lineTo(x2,y2);c.stroke();c.globalAlpha=1;c.lineWidth=1}
 polygon(p,color,a){const c=this.c;c.fillStyle=color;c.globalAlpha=a;c.beginPath();c.moveTo(p[0],p[1]);for(let i=2;i<p.length;i+=2)c.lineTo(p[i],p[i+1]);c.closePath();c.fill();c.globalAlpha=1}
 beginPath(){this.c.beginPath()} moveTo(x,y){this.c.moveTo(x,y)} lineTo(x,y){this.c.lineTo(x,y)} arc(x,y,r,a,b){this.c.arc(x,y,r,a,b)}
 stroke(){this.c.globalAlpha=this.globalAlpha;this.c.strokeStyle=this.strokeStyle;this.c.lineWidth=1;this.c.stroke();this.c.globalAlpha=1}
 body(key,frame,x,y,scale){const s=sources[key],i=bitmaps[key];if(!s)return;let r;if(s.frames)r=s.frames[frame].frame;else r={x:Number(frame)*s.size,y:0,w:s.size,h:s.size};this.c.imageSmoothingEnabled=false;this.c.drawImage(i,r.x,r.y,r.w,r.h,Math.round(x-r.w*scale/2),Math.round(y-r.h*scale/2),r.w*scale,r.h*scale)}
}
const gallery=document.querySelector('main'), views=[];
for(const card of MONSTER_PREVIEW_CARDS){const f=document.createElement('figure');f.dataset.group=card[3];const canvas=document.createElement('canvas');canvas.width=208;canvas.height=144;const caption=document.createElement('figcaption');caption.textContent=card[1];f.append(canvas,caption);gallery.append(f);views.push([canvas,new CanvasPainter(canvas.getContext('2d')),card])}
let time=0,run=true,last=performance.now();const seek=document.querySelector('#seek'),speed=document.querySelector('#speed'),toggle=document.querySelector('#toggle');
toggle.onclick=()=>{run=!run;toggle.textContent=run?'暂停':'播放'};seek.oninput=()=>{time=Number(seek.value);run=false;toggle.textContent='播放'};
document.querySelector('#filter').onchange=e=>document.querySelectorAll('figure').forEach(f=>f.hidden=e.target.value!=='all'&&f.dataset.group!==e.target.value);
function tick(now){if(run)time=(time+Math.min(.05,(now-last)/1000)*Number(speed.value))%2.8;last=now;seek.value=String(time);document.querySelector('#clock').textContent=time.toFixed(2)+' s';for(const [canvas,p,card] of views){if(canvas.parentElement.hidden)continue;const c=p.c;c.clearRect(0,0,208,144);c.fillStyle='#172030';c.fillRect(0,0,208,144);c.strokeStyle='#202b3c';c.beginPath();for(let x=0;x<208;x+=16){c.moveTo(x,0);c.lineTo(x,144)}for(let y=0;y<144;y+=16){c.moveTo(0,y);c.lineTo(208,y)}c.stroke();renderMonsterPreview(p,card,time,C,drawMonsterEffect,monsterWarningCircle,monsterWarningLane,undefined,document.querySelector('#warnings').checked)}requestAnimationFrame(tick)}requestAnimationFrame(tick);
`;
writeFileSync(join(out, "index.html"), `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>怪物攻击动画与特效 · v168</title><style>body{margin:24px;background:#101522;color:#e8e8f0;font:15px system-ui}h1{font-size:26px}header{position:sticky;top:0;background:#101522ee;padding:12px 0;z-index:1}button,select{padding:7px 12px;background:#27334a;color:#fff;border:1px solid #52607a;border-radius:5px}main{display:grid;grid-template-columns:repeat(auto-fit,minmax(250px,1fr));gap:14px}figure{margin:0;background:#172030;border:1px solid #36445d;border-radius:8px;overflow:hidden}figure[hidden]{display:none}canvas{width:100%;image-rendering:pixelated}figcaption{padding:10px 14px;border-top:1px solid #36445d}small{color:#a0afc9}</style><h1>怪物攻击动画与特效 · v168</h1><p>17套本体动作（204帧）、普通怪/精英全部攻击、3种精英词缀；Boss保留原版。使用正式绘制配方；此页为等比素材编排，不代表实际伤害范围或自然对局验收。</p><header><button id="toggle">暂停</button> <select id="speed"><option value=".25">0.25×</option><option value=".5">0.5×</option><option value="1" selected>1×</option><option value="2">2×</option></select> <select id="filter"><option value="all">全部</option><option value="minion">小怪</option><option value="elite">精英与词缀</option></select> <label><input id="warnings" type="checkbox" checked>预警轮廓</label> <input id="seek" type="range" min="0" max="2.8" step=".01" value="0"> <span id="clock">0.00 s</span></header><main></main><script type="module">${recipes}\n${choreography}\n${browser}</script></html>`, "utf8");

class CommandPainter {
  fillStyle = "#fff"; strokeStyle = "#fff"; globalAlpha = 1; commands = []; path = [];
  push(command) { if (JSON.stringify(command).includes("null")) throw new Error("Non-finite VFX coordinates"); this.commands.push(command); }
  fillRect(x,y,w,h) { if(this.globalAlpha>0) this.push(["rect",x,y,w,h,this.fillStyle,this.globalAlpha]); }
  beam(x,y,x2,y2,w,color,a) { if(a>0) this.push(["line",[x,y,x2,y2],w,color,a]); }
  polygon(points,color,a) { if(a>0) this.push(["polygon",points,color,a]); }
  beginPath() { this.path=[]; } moveTo(x,y) { this.path.push(x,y); } lineTo(x,y) { this.path.push(x,y); }
  arc(x,y,r,a,b) { const steps=Math.max(8,Math.ceil(Math.abs(b-a)*r/3));for(let i=0;i<=steps;i++){const v=a+(b-a)*i/steps;this.path.push(x+Math.cos(v)*r,y+Math.sin(v)*r);} }
  stroke() { if(this.path.length>=4&&this.globalAlpha>0) this.push(["line",this.path,1,this.strokeStyle,this.globalAlpha]); }
  body(key,frame,x,y,scale) { this.push(["body",key,frame,x,y,scale]); }
}
const frames=[],cols=6,cell=[208,144];
for(let f=0;f<48;f++) {
  frames.push(cards.map(card => {
    const p=new CommandPainter();
    renderMonsterPreview(p,card,f/48*2.8,colors,drawMonsterEffect,monsterWarningCircle,monsterWarningLane,
      {x:0,y:22,w:cell[0],h:cell[1]-22});
    return p.commands;
  }));
}
writeFileSync(join(temp,"frames.json"),JSON.stringify({sources,cards,cols,cell,width:cols*cell[0],height:Math.ceil(cards.length/cols)*cell[1],frames}),"utf8");
console.log(`Wrote self-contained ${cards.length}-clip preview and 48 offline export frames.`);
