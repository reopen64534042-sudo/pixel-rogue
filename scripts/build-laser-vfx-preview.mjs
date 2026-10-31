/** Self-contained runnable HTML plus a command recording for the optional Pillow GIF export. */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import ts from "typescript";

const root = new URL("../", import.meta.url);
const read = p => readFileSync(new URL(p, root), "utf8");
function moduleUrl(path, imports = {}) {
  let code = ts.transpileModule(read(path), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
  for (const [key, value] of Object.entries(imports)) code = code.replaceAll(JSON.stringify(key), JSON.stringify(value));
  return "data:text/javascript;base64," + Buffer.from(code).toString("base64");
}
const palette = moduleUrl("src/game/data/palette.ts");
const assets = moduleUrl("src/game/rendering/vfx/laser/laserAssets.ts");
const player = moduleUrl("src/game/rendering/vfx/laser/LaserVfxPlayer.ts", { "../../../data/palette": palette, "./laserAssets": assets });
const canvas = moduleUrl("src/game/rendering/vfx/laser/LaserVfxCanvas.ts", { "./laserAssets": assets });
const demo = moduleUrl("src/game/rendering/vfx/laser/LaserVfxDemo.ts");
const { LaserVfxPlayer, laserChannelLook } = await import(player);
const { LASER_DEMO_CASES, sampleLaserDemo, LASER_FOCUS_DEMO_CASES, sampleLaserFocusDemo } = await import(demo);
const metadata = JSON.parse(read("public/assets/vfx/laser/laser.metadata.json"));
const atlas = JSON.parse(read("public/assets/vfx/laser/laser.atlas.json"));
const png = readFileSync(new URL("public/assets/vfx/laser/laser.atlas.png", root)).toString("base64");
let html = read("assets/vfx/laser/preview-template.html");
for (const [key, value] of Object.entries({ PLAYER_MODULE: JSON.stringify(player), CANVAS_MODULE: JSON.stringify(canvas),
  DEMO_MODULE: JSON.stringify(demo), PALETTE_MODULE: JSON.stringify(palette), ATLAS_JSON: JSON.stringify(atlas), ATLAS_PNG: JSON.stringify("data:image/png;base64," + png) })) {
  html = html.replaceAll(`__${key}__`, value);
}
writeFileSync(new URL("assets/vfx/laser/preview.html", root), html);
mkdirSync(new URL("public/laser-vfx-preview/", root), { recursive: true });
writeFileSync(new URL("public/laser-vfx-preview/index.html", root), html);

const sample = (c, time, sampler = sampleLaserDemo) => {
  const p = sampler(c, time);
  const commands = new LaserVfxPlayer().update(p.frame, p.releases);
  return { title: c.title, time, duration: c.duration, recharge: c.recharge, phase: p.frame.phase,
    u: laserChannelLook(p.frame.elapsed, p.frame.duration).u, focus: p.frame.lanes.map(l => l.focus), commands, player: p.player, targets: p.targets };
};
const heroCases = [0, 1, 2, 4].map(i => LASER_DEMO_CASES[i]);
const frames = Array.from({ length: 96 }, (_, frame) => heroCases.map(c => sample(c, frame / 30)));
// Dense boundary inspection: last channel, exact hit/release, expansion, peak, tail/new cycle.
const boundaryTimes = [0.65, 0.85, 0.96, 0.995, 1, 1.025, 1.05, 1.075, 1.12, 1.18, 1.239, 1.26];
const contact = boundaryTimes.map(t => sample(LASER_DEMO_CASES[1], t));
const gold = boundaryTimes.map(t => sample(LASER_DEMO_CASES[2], t + 0.3));
const slowFrames = Array.from({ length: 64 }, (_, i) => {
  const offset = -0.25 + i / 120;
  return [sample(LASER_DEMO_CASES[1], 1 + offset), sample(LASER_DEMO_CASES[2], 1.3 + offset)];
});
const coverage = LASER_DEMO_CASES.map(c => [sample(c, c.duration * 0.76), sample(c, c.duration + 0.075)]);
const focusComparison = LASER_FOCUS_DEMO_CASES.map(c => sample(c, 0.52, sampleLaserFocusDemo));
const focusFrames = Array.from({ length: 96 }, (_, frame) => [0, 1, 2, 7, 6, 8].map(i => sample(LASER_FOCUS_DEMO_CASES[i], frame / 30, sampleLaserFocusDemo)));
const overlapTimes = [0.95, 0.995, 1, 1.025, 1.045, 1.049, 1.05, 1.051, 1.066, 1.1, 1.13, 1.2];
const overlap = overlapTimes.map(t => sample(LASER_DEMO_CASES[4], t));
mkdirSync(new URL("output/", root), { recursive: true });
writeFileSync(new URL("output/laser-vfx-recording.json", root), JSON.stringify({ fps: 30, frames, focusFrames, focusComparison, overlap, slowFrames, contact, gold, coverage, atlas, clips: metadata.clips, palette: metadata.palette }));
console.log(JSON.stringify({ html: "assets/vfx/laser/preview.html", served: "/laser-vfx-preview/", frames: frames.length, seconds: 3.2,
  cases: LASER_DEMO_CASES.length, focusCases: LASER_FOCUS_DEMO_CASES.length, bytes: Buffer.byteLength(html), scope: "actual VFX player + PNGs, independent art demo; no gameplay acceptance" }));
