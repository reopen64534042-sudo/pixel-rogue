/** Offline motion preview, not a gameplay test. Uses the shipped motion/draw
 * functions and the existing Python/Pillow installation only for GIF export. */
import { readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { decodePng, encodePng } from "./lib/png.mjs";

const root = new URL("../", import.meta.url);
function moduleUrl(path, replacements = {}) {
  let code = ts.transpileModule(readFileSync(new URL(path, root), "utf8"), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
  }).outputText;
  for (const [from, to] of Object.entries(replacements)) code = code.replaceAll(`"${from}"`, JSON.stringify(to));
  return "data:text/javascript;base64," + Buffer.from(code).toString("base64");
}
const balanceUrl = moduleUrl("src/game/data/warriorBalance.ts");
const { WARRIOR_BALANCE: WB } = await import(balanceUrl);
const { updateWarriorLeapMotion } = await import(moduleUrl("src/game/core/WarriorSystem.ts", {
  "../data/warriorBalance": balanceUrl,
  "../data/constants": moduleUrl("src/game/data/constants.ts"),
  "../data/knockback": moduleUrl("src/game/data/knockback.ts"),
}));
const { greatswordLeapPose, drawGreatswordLeapTelegraph, drawGreatswordLeapDescent } = await import(moduleUrl(
  "src/game/rendering/vfx/greatswordLeapMotion.ts", { "../../data/warriorBalance": balanceUrl },
));
const { drawGreatswordLeapImpact, GREATSWORD_LEAP_IMPACT } = await import(moduleUrl("src/game/rendering/vfx/greatswordLeapImpact.ts"));
const sheet = decodePng(readFileSync(new URL("public/" + GREATSWORD_LEAP_IMPACT.image, root)));
const width = 480, height = 180;
const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const playerMap = ["  hhhh  ", " hhhhhh ", " heffeh ", " hhhhhh ", "  aaaa  ", " aaaaaa ", " aaaaaa ", "   aa   ", "  a  a  ", "  b  b  "];
const playerColors = { h: "#f4a940", e: "#22223a", f: "#ffd9a0", a: "#3d6de0", b: "#5a3a20" };
let canvas, arc;
function pixel(x, y, color, alpha = 1) {
  x = Math.round(x); y = Math.round(y);
  if (x < 0 || y < 0 || x >= width || y >= height) return;
  const at = (y * width + x) * 4;
  for (let c = 0; c < 3; c++) canvas[at + c] = Math.round(canvas[at + c] * (1 - alpha) + color[c] * alpha);
  canvas[at + 3] = 255;
}
const painter = {
  globalAlpha: 1, fillStyle: "#ffffff", strokeStyle: "#ffffff",
  beginPath() {},
  arc(x, y, radius, start, end) { arc = { x, y, radius, start, end }; },
  stroke() {
    const steps = Math.ceil((arc.end - arc.start) * arc.radius * 2);
    for (let i = 0; i <= steps; i++) {
      const a = arc.start + (arc.end - arc.start) * i / Math.max(1, steps);
      pixel(arc.x + Math.cos(a) * arc.radius, arc.y + Math.sin(a) * arc.radius, rgb(this.strokeStyle), this.globalAlpha);
    }
  },
  fillRect(x, y, w, h) {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) pixel(x + i, y + j, rgb(this.fillStyle), this.globalAlpha);
  },
  hasTexture: () => true,
  spriteRot(key, cx, cy, angle, scale) {
    const frame = Number(key.slice(GREATSWORD_LEAP_IMPACT.prefix.length));
    const size = GREATSWORD_LEAP_IMPACT.size, half = size / 2;
    for (let y = Math.floor(cy - half * scale); y < cy + half * scale; y++) for (let x = Math.floor(cx - half * scale); x < cx + half * scale; x++) {
      const sx = Math.floor((x + 0.5 - cx) / scale + half), sy = Math.floor((y + 0.5 - cy) / scale + half);
      if (sx < 0 || sy < 0 || sx >= size || sy >= size) continue;
      const at = ((Math.floor(frame / 5) * size + sy) * sheet.width + frame % 5 * size + sx) * 4;
      if (sheet.rgba[at + 3]) pixel(x, y, sheet.rgba.subarray(at, at + 3), this.globalAlpha);
    }
  },
};
// Left: active leap over 105px. Right: the third hit jumps to a nearby target.
const lanes = [[55, 160, 54], [325, 355, 67.5]].map(([fromX, x, radius]) => ({
  player: { x: fromX, y: 95 },
  warriorLeapState: {
    kind: "leap", impact: { radius, dmg: 0 },
    phase: "windup", elapsed: 0, fromX, fromY: 95, x, y: 95, radius,
  },
  landing: { x, y: 95, radius },
  impactTick: null,
}));
const frames = [], steps = [];
for (let tick = 0; tick <= 43; tick++) {
  canvas = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    canvas.set([...rgb((Math.floor(x / 16) + Math.floor(y / 16)) % 2 ? "#1d2033" : "#1a1c2c"), 255], (y * width + x) * 4);
  }
  for (const lane of lanes) {
    if (tick > 0 && lane.warriorLeapState) updateWarriorLeapMotion.call(lane, 1 / 60);
    const leap = lane.warriorLeapState;
    if (leap && leap.elapsed >= WB.leapWindup + WB.leapFall) {
      // The live combat system creates this snapshot at landing; this art tool
      // only shows the transition and does not run hit or talent settlement.
      lane.impactTick = tick;
      lane.warriorLeapState = null;
    }
    if (lane.warriorLeapState) drawGreatswordLeapTelegraph(painter, lane.warriorLeapState);
    if (lane.impactTick !== null) {
      const age = (tick - lane.impactTick) / 60;
      if (age < WB.leapImpactLife) drawGreatswordLeapImpact(painter, {
        x: lane.landing.x, y: lane.landing.y, r: lane.landing.radius,
        a: 0, arc: Math.PI * 2, c: "#ffd24a", weapon: "greatsword", impact: true,
        life: WB.leapImpactLife - age, max: WB.leapImpactLife,
      });
    }
    const pose = greatswordLeapPose(lane.warriorLeapState);
    if (lane.warriorLeapState) drawGreatswordLeapDescent(painter, lane.warriorLeapState, lane.player.x, lane.player.y);
    for (let y = 0; y < 10; y++) for (let x = 0; x < 8; x++) {
      const color = playerColors[playerMap[y][x]];
      if (color) pixel(lane.player.x - 4 + x, lane.player.y - pose.height - 5 + y, rgb(color), pose.alpha);
    }
  }
  const png = encodePng(width, height, canvas);
  frames.push(png.toString("base64"));
  if ([8, 17, 28].includes(tick)) steps.push(Buffer.from(canvas));
}
const contact = Buffer.alloc(width * height * steps.length * 4);
steps.forEach((frame, i) => frame.copy(contact, i * width * height * 4));
writeFileSync(new URL("assets/vfx/greatsword-leap-sequence-steps.png", root), encodePng(width, height * steps.length, contact));
const output = fileURLToPath(new URL("assets/vfx/greatsword-leap-sequence-preview.gif", root));
const exporter = spawnSync(process.env.PYTHON || "python", ["-c", [
  "import sys,json,base64,io",
  "from PIL import Image",
  "data=json.load(sys.stdin)",
  "frames=[Image.open(io.BytesIO(base64.b64decode(p))).convert('RGB').resize((960,360),Image.Resampling.NEAREST) for p in data['frames']]",
  "frames[0].save(data['output'],save_all=True,append_images=frames[1:],duration=[50]*(len(frames)-1)+[600],loop=0,disposal=2)",
].join("\n")], { input: JSON.stringify({ frames, output }), encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });
if (exporter.error) throw exporter.error;
if (exporter.status !== 0) throw new Error(exporter.stderr || "GIF export failed; Python with Pillow is required");
console.log(JSON.stringify({ output, frames: frames.length, size: [960, 360], playback: "3x slow motion; offline motion preview" }));
