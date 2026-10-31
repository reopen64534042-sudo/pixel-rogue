/** Offline art preview of the production renderer. Does not run gameplay,
 * browser automation, damage checks or acceptance tests. Existing Pillow only. */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const root = new URL("../", import.meta.url);
function moduleUrl(path, replacements = {}) {
  let code = ts.transpileModule(readFileSync(new URL(path, root), "utf8"), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
  }).outputText;
  for (const [from, to] of Object.entries(replacements)) code = code.replaceAll(`"${from}"`, JSON.stringify(to));
  return "data:text/javascript;base64," + Buffer.from(code).toString("base64");
}
const laserUrl = moduleUrl("src/game/data/laser.ts");
const paletteUrl = moduleUrl("src/game/data/palette.ts");
const { createLaserState, LASER } = await import(laserUrl);
const dependencies = { "../data/laser": laserUrl, "../data/palette": paletteUrl };
const after = await import(moduleUrl("src/game/rendering/LaserRenderer.ts", dependencies));
const beforeArg = process.argv.indexOf("--before");
const before = beforeArg >= 0
  ? await import(moduleUrl(process.argv[beforeArg + 1], dependencies)) : null;
const styles = before ? [before, after] : [after];
const names = ["基础连续束", "锁相聚焦", "三联激光", "移动余辉", "冲刺残像", "坍缩脉冲", "熔断重脉冲", "紧急散射"];
const identity = { attack: 13, defense: 0, tough: 0, critChance: 0.05, critMultiplier: 1.5,
  resistances: {}, globalDamageBonus: 0, typeDamageBonus: {}, formDamageBonus: {} };
const beam = (x, y, x2, y2, kind = "main", width = 4, extra = {}) =>
  ({ x, y, x2, y2, kind, width, lane: 0, t: 0, max: 0, dps: 1, stats: identity, ...extra });

function pose(index, time, legacy = false) {
  const phase = time % 1.3, channel = phase < 1;
  const triple = [2, 4, 5, 6].includes(index);
  const moving = index === 3 || index === 4;
  const sway = moving ? Math.sin(time * 2.2) * 7 : 0;
  const player = { x: triple ? (index === 4 ? 138 : 120) : 34,
    y: triple ? 77 + sway : 72 + sway, upCounts: { "锁相": 1 } };
  const target = { x: index === 7 ? 52 : triple ? 205 : 154,
    y: index === 7 ? 72 : triple ? 75 : 64, r: 5, dead: false };
  const sideTargets = [
    { x: 62 + Math.sin(time * 2) * 4, y: 36 + Math.cos(time * 1.8) * 2, r: 5, dead: false },
    { x: 48 + Math.cos(time * 1.4) * 3, y: 110 + Math.sin(time * 1.6) * 2, r: 5, dead: false },
  ];
  const angle = Math.atan2(target.y - (player.y - 3), target.x - player.x);
  const length = triple ? 90 : 166;
  const lanes = triple ? [0, -1, 1] : [0];
  const aimTargets = { 0: target, [-1]: sideTargets[0], [1]: sideTargets[1] };
  const aimAngles = Object.fromEntries(lanes.map(lane => [lane,
    legacy ? angle + lane * Math.PI / 15 :
      Math.atan2(aimTargets[lane].y - (player.y - 3), aimTargets[lane].x - player.x)]));
  const muzzle = a => ({ x: player.x + Math.cos(a) * 7, y: player.y - 3 + Math.sin(a) * 7 });
  const rays = lanes.map(lane => {
    const a = aimAngles[lane], start = muzzle(legacy ? angle : a);
    return beam(start.x, start.y, start.x + Math.cos(a) * length, start.y + Math.sin(a) * length,
      "main", index === 2 ? 6 : 4, { lane });
  });
  const laser = { ...createLaserState(), phase: channel ? "channel" : "recharge", angle, aimReady: true,
    remaining: channel ? 1 - phase : 1.3 - phase, total: channel ? 1 : 0.3,
    focus: index === 0 ? 0.25 : index >= 5 ? 1 : Math.max(0.4, Math.min(1, phase / 0.8)), target,
    contacts: [{ x: target.x, y: target.y, target: true, lane: 0 }],
    lines: channel ? rays : [], aux: [] };
  if (triple) for (const lane of [-1, 1]) {
    Object.assign(laser.sideAims[lane], { target: aimTargets[lane], angle: aimAngles[lane],
      aimReady: true, focus: index === 6 && lane === -1 ? 0.6 : laser.focus });
    if (!legacy) laser.contacts.push({ x: aimTargets[lane].x, y: aimTargets[lane].y, target: true, lane });
  }
  const core = { prof: "shooter", shooterWeapon: "laser", state: "play", time,
    player, laser, laserUpgrades: triple ? ["triple"] : [], laserLevel: 12, laserXp: 0,
    previewTargets: triple ? [target, ...sideTargets] : [target] };
  if (index === 2) core.laserUpgrades.push("wide");
  if (index === 3) for (let i = 1; i <= 2; i++) {
    const y = player.y - i * 4;
    laser.aux.push(beam(41, y - 3, 207, y - 7, "afterglow", 4, { t: 0.25 - i * 0.07, max: 0.25 }));
  }
  if (index === 4) for (const lane of lanes) {
    const oldX = 120, oldY = 80;
    const oldAngle = legacy ? Math.atan2(75 - (oldY - 3), 205 - oldX) + lane * Math.PI / 15 :
      Math.atan2(aimTargets[lane].y - (oldY - 3), aimTargets[lane].x - oldX);
    const rootAngle = legacy ? Math.atan2(75 - (oldY - 3), 205 - oldX) : oldAngle;
    const x = oldX + Math.cos(rootAngle) * 7, y = oldY - 3 + Math.sin(rootAngle) * 7;
    laser.aux.push(beam(x, y, x + Math.cos(oldAngle) * length, y + Math.sin(oldAngle) * length,
      "echo", 4, { t: 0.3 * (1 - (time % 0.3) / 0.3), max: 0.3, lane }));
  }
  if (index === 5 || index === 6) {
    core.laserUpgrades.push("collapse");
    if (index === 6) player.upCounts["熔断"] = 1;
    if (!channel && phase - 1 < 0.12) for (const ray of rays) {
      const focus = ray.lane === 0 ? laser.focus : laser.sideAims[ray.lane].focus;
      laser.aux.push({ ...ray, kind: "pulse", dps: 0, t: 0.12 - (phase - 1), max: 0.12,
        pulse: index === 6 && (legacy || focus >= 1) ? "meltdown" : "collapse" });
    }
  }
  if (index === 7) {
    laser.lines = [];
    const age = time % 0.5;
    if (age < 0.12) for (const offset of [-LASER.escapeArc / 2, 0, LASER.escapeArc / 2]) {
      laser.aux.push(beam(player.x, player.y - 3, player.x + Math.cos(offset) * 25,
        player.y - 3 + Math.sin(offset) * 25, "pulse", 4,
        { t: 0.12 - age, max: 0.12, pulse: "scatter" }));
    }
  }
  return core;
}

let commands = [], path = [];
const painter = {
  globalAlpha: 1, fillStyle: "#ffffff", strokeStyle: "#ffffff",
  beam(x, y, x2, y2, width, color, alpha) { commands.push(["beam", x, y, x2, y2, width, color, alpha]); },
  polygon(points, color, alpha) { commands.push(["polygon", points, color, alpha]); },
  fillRect(x, y, w, h) { commands.push(["rect", x, y, w, h, this.fillStyle, this.globalAlpha]); },
  beginPath() { path = []; },
  moveTo(x, y) { path.push([x, y]); },
  lineTo(x, y) { path.push([x, y]); },
  arc(x, y, r, start, end) {
    for (let i = 0; i <= 32; i++) {
      const angle = start + (end - start) * i / 32;
      path.push([x + Math.cos(angle) * r, y + Math.sin(angle) * r]);
    }
  },
  stroke() { commands.push(["path", path, this.strokeStyle, this.globalAlpha]); },
};
function panel(index, time, renderer, title) {
  const core = pose(index, time, renderer === before);
  commands = [];
  painter.globalAlpha = 1;
  renderer.drawLaser(core, painter);
  renderer.drawLaserResources(core, painter);
  return { title, commands, player: core.player, target: core.laser.target, targets: core.previewTargets, index };
}
const still = [];
for (let i = 0; i < names.length; i++) for (let s = 0; s < styles.length; s++) {
  const time = i === 5 || i === 6 ? 1.035 : i === 7 ? 1.04 : i === 4 ? 0.65 : 0.85;
  const name = i === 2 ? (before && s === 0 ? "前方扇射（旧）" : "独立多向索敌") : names[i];
  still.push(panel(i, time, styles[s], (before ? (s ? "调整后 · " : "调整前 · ") : "") + name));
}
const animation = [];
for (let frame = 0; frame < 52; frame++) {
  const time = frame / 20;
  animation.push([0, 2, 4, 6].map(i => panel(i, time, after, names[i])));
}
mkdirSync(new URL("output/", root), { recursive: true });
const output = fileURLToPath(new URL("output/laser-vfx", root));
const python = String.raw`
import sys, json, math
from PIL import Image, ImageDraw, ImageFont
data=json.load(sys.stdin)
W,H=240,132
font=ImageFont.truetype('C:/Windows/Fonts/msyh.ttc',10)
player_map=['  hhhh  ',' hhhhhh ',' heffeh ',' hhhhhh ','  aaaa  ',' aaaaaa ',' aaaaaa ','   aa   ','  a  a  ','  b  b  ']
colors={'h':'#f4a940','e':'#22223a','f':'#ffd9a0','a':'#3d6de0','b':'#5a3a20'}
def rgba(color,alpha):
    return tuple(int(color[i:i+2],16) for i in (1,3,5))+(round(max(0,min(1,alpha))*255),)
def panel(p):
    image=Image.new('RGBA',(W,H),'#171d2c')
    draw=ImageDraw.Draw(image)
    for y in range(20,H,16):
        for x in range(0,W,16):
            if (x//16+y//16)%2: draw.rectangle((x,y,x+15,y+15),fill='#1a2232')
    draw.rectangle((0,0,W,18),fill='#0e1422')
    draw.text((8,2),p['title'],font=font,fill='#cce8f4')
    # Same small player and dummy silhouettes in both renderer views.
    px,py=p['player']['x'],p['player']['y']
    for y,row in enumerate(player_map):
        for x,key in enumerate(row):
            if key in colors: draw.point((round(px-4+x),round(py-5+y)),fill=colors[key])
    targets=[(t['x'],t['y']) for t in p['targets']]
    for x,y in targets:
        draw.rectangle((x-4,y-4,x+4,y+4),fill='#4dd44d')
        draw.point((x-2,y-1),fill='#0a3d0a');draw.point((x+2,y-1),fill='#0a3d0a')
    for cmd in p['commands']:
        layer=Image.new('RGBA',(W,H))
        d=ImageDraw.Draw(layer)
        if cmd[0]=='beam':
            _,x,y,x2,y2,width,c,a=cmd
            d.line((round(x),round(y),round(x2),round(y2)),fill=rgba(c,a),width=max(1,round(width)))
        elif cmd[0]=='polygon':
            _,pts,c,a=cmd
            d.polygon([(round(pts[i]),round(pts[i+1])) for i in range(0,len(pts),2)],fill=rgba(c,a))
        elif cmd[0]=='rect':
            _,x,y,w,h,c,a=cmd
            if w>0 and h>0: d.rectangle((round(x),round(y),round(x+w)-1,round(y+h)-1),fill=rgba(c,a))
        elif cmd[0]=='path':
            _,pts,c,a=cmd
            if len(pts)>1: d.line([(round(x),round(y)) for x,y in pts],fill=rgba(c,a),width=1)
        image=Image.alpha_composite(image,layer)
    return image.convert('RGB')
def sheet(panels,columns):
    rows=math.ceil(len(panels)/columns)
    image=Image.new('RGB',(W*columns,H*rows),'#0e1422')
    for i,p in enumerate(panels): image.paste(panel(p),(i%columns*W,i//columns*H))
    return image.resize((image.width*2,image.height*2),Image.Resampling.NEAREST)
still=sheet(data['still'],4)
still.save(data['output']+'-comparison.png')
frames=[sheet(p,2) for p in data['animation']]
frames[17].save(data['output']+'-preview.png')
frames[0].save(data['output']+'-preview.gif',save_all=True,append_images=frames[1:],duration=50,loop=0,disposal=2)
print(json.dumps({'comparison':data['output']+'-comparison.png','animation':data['output']+'-preview.gif','frames':len(frames),'playback':'1x speed; offline renderer preview'}))
`;
const result = spawnSync(process.env.PYTHON || "python", ["-c", python], {
  input: JSON.stringify({ still, animation, output }), encoding: "utf8", maxBuffer: 48 * 1024 * 1024,
});
if (result.error) throw result.error;
if (result.status !== 0) throw new Error(result.stderr || "Preview export failed");
writeFileSync(new URL("output/laser-vfx-preview-info.json", root), JSON.stringify({
  source: "src/game/rendering/LaserRenderer.ts", before: beforeArg >= 0 ? process.argv[beforeArg + 1] : null,
  kind: "offline art preview; no gameplay or browser validation", frames: 52, fps: 20,
}, null, 2));
console.log(result.stdout.trim());
