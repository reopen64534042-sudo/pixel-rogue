/** Node 24 native TS stripping; exports editable matrices through the existing pixelize pipeline. */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { MONSTER_ART, monsterArtRows } from "../src/game/data/monsterArt.ts";
import { encodePng, decodePng } from "./lib/png.mjs";
import { REPO_ROOT, loadPalette, hexToRgb } from "./lib/palette.mjs";

const palette = Object.fromEntries(loadPalette().map(p => [p.key, hexToRgb(p.hex)]));
const originals = join(REPO_ROOT, "assets", "monsters", "native");
const previewDir = join(REPO_ROOT, "docs", "previews", "monsters-v167");
mkdirSync(originals, { recursive: true });
mkdirSync(previewDir, { recursive: true });
const tiles = [];
const plan = JSON.parse(readFileSync(join(REPO_ROOT, "assets", "plan.json"), "utf8"));
for (const [key, art] of Object.entries(MONSTER_ART)) {
  const rows = monsterArtRows(key), size = art.size;
  const rgba = Buffer.alloc(size * size * 4);
  rows.forEach((row, y) => [...row].forEach((p, x) => {
    if (p === ".") return;
    const color = palette[art.colors[p]];
    if (!color) throw new Error(`Unknown palette color ${key}/${p}`);
    rgba.set([...color, 255], (y * size + x) * 4);
  }));
  const source = join(originals, `${key}.png`);
  writeFileSync(source, encodePng(size, size, rgba));
  const result = spawnSync(process.execPath, ["scripts/pixelize.mjs", source, "--key", key,
    "--model", "native-pixel-matrix", "--prompt", `Editable source: src/game/data/monsterArt.ts#${key}`],
    { cwd: REPO_ROOT, encoding: "utf8" });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout);
  process.stdout.write(result.stdout);
  const png = readFileSync(join(REPO_ROOT, "public", "assets", "sprites", `${key}.png`));
  const decoded = decodePng(png);
  if (!decoded.rgba.equals(rgba)) throw new Error(`Export differs from runtime fallback: ${key}`);
  const name = plan.assets.find(a => a.key === key)?.name ?? key;
  tiles.push({ key, name, png, ...decoded });
}
// Keep the latest provenance for this batch when rebuilding; preserve unrelated asset records.
const manifestPath = join(REPO_ROOT, "assets", "manifest.json");
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
manifest.entries = manifest.entries.filter((entry, i, entries) =>
  !Object.hasOwn(MONSTER_ART, entry.key) || entries.findLastIndex(e => e.key === entry.key) === i);
writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
// Deterministic contact sheet at 4x; individual sprite PNGs retain their transparent backgrounds.
const cell = 112, cols = 6, width = cell * cols, height = Math.ceil(tiles.length / cols) * cell;
const sheet = Buffer.alloc(width * height * 4);
for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
  sheet.set((Math.floor(x / 8) + Math.floor(y / 8)) % 2 ? [25, 30, 43, 255] : [30, 36, 51, 255], (y * width + x) * 4);
}
tiles.forEach((tile, i) => {
  const scale = 4, left = (i % cols) * cell + Math.floor((cell - tile.width * scale) / 2);
  const top = Math.floor(i / cols) * cell + Math.floor((cell - tile.height * scale) / 2);
  for (let y = 0; y < tile.height * scale; y++) for (let x = 0; x < tile.width * scale; x++) {
    const at = (Math.floor(y / scale) * tile.width + Math.floor(x / scale)) * 4;
    if (tile.rgba[at + 3]) sheet.set(tile.rgba.subarray(at, at + 4), ((top + y) * width + left + x) * 4);
  }
});
writeFileSync(join(previewDir, "contact-sheet.png"), encodePng(width, height, sheet));
writeFileSync(join(previewDir, "index.html"), `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>怪物素材 · v167</title><style>body{background:#101522;color:#e8e8f0;font:16px system-ui;margin:32px}main{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:16px;max-width:1200px}figure{margin:0;padding:16px;background:#1c2535;border:1px solid #39435a;border-radius:8px;text-align:center}img{image-rendering:pixelated;object-fit:contain;width:96px;height:96px}figcaption{margin-top:12px}small{color:#9baac5}button{margin:0 8px 24px 0;padding:8px 16px}</style><h1>怪物素材 · v167</h1><p>17张正式贴图；普通16×16，精英24×24。既有Boss素材保持原样。原始尺寸和4倍预览可切换。</p><button onclick="document.querySelectorAll('img').forEach(i=>{i.style.width=i.dataset.w+'px';i.style.height=i.dataset.w+'px'})">原始尺寸</button><button onclick="document.querySelectorAll('img').forEach(i=>{i.style.width=Number(i.dataset.w)*4+'px';i.style.height=Number(i.dataset.w)*4+'px'})">4倍预览</button><main>${tiles.map(t => `<figure><img data-w="${t.width}" style="width:${t.width * 4}px;height:${t.height * 4}px" src="data:image/png;base64,${t.png.toString("base64")}" alt="${t.name}"><figcaption>${t.name}<br><small>${t.key} · ${t.width}×${t.height}</small></figcaption></figure>`).join("")}</main></html>`, "utf8");
