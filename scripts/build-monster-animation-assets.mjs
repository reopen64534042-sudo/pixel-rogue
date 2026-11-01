import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { MONSTER_ART, monsterArtRows } from "../src/game/data/monsterArt.ts";
import { MONSTER_POSES, monsterAnimationRows } from "../src/game/rendering/MonsterAnimationArt.ts";
import { encodePng, decodePng } from "./lib/png.mjs";
import { loadPalette, hexToRgb, REPO_ROOT } from "./lib/palette.mjs";

const palette = Object.fromEntries(loadPalette().map(p => [p.key, hexToRgb(p.hex)]));
const out = join(REPO_ROOT, "public", "assets", "monsters", "animation");
mkdirSync(out, { recursive: true });
const manifest = { schema: 1, note: "Approved static sprites remain unchanged. 12 poses with a shared center anchor, frame zero locked.", poses: MONSTER_POSES, units: [] };
for (const [key, art] of Object.entries(MONSTER_ART)) {
  const rows = monsterArtRows(key), cell = art.size + 8, width = cell * MONSTER_POSES.length;
  const rgba = Buffer.alloc(width * cell * 4);
  for (let f = 0; f < MONSTER_POSES.length; f++) {
    const frame = monsterAnimationRows(rows, art.size, key, MONSTER_POSES[f]);
    frame.forEach((row, y) => [...row].forEach((symbol, x) => {
      if (symbol !== ".") rgba.set([...palette[art.colors[symbol]], 255], (y * width + f * cell + x) * 4);
    }));
  }
  const seed = decodePng(readFileSync(join(REPO_ROOT, "public", "assets", "sprites", `${key}.png`)));
  for (let y = 0; y < art.size; y++) for (let x = 0; x < art.size; x++) {
    const at = ((y + 4) * width + x + 4) * 4, source = (y * art.size + x) * 4;
    if (!rgba.subarray(at, at + 4).equals(seed.rgba.subarray(source, source + 4))) throw new Error(`Seed changed: ${key}`);
  }
  const png = encodePng(width, cell, rgba);
  writeFileSync(join(out, `${key}.png`), png);
  manifest.units.push({ key, file: `${key}.png`, frame: [cell, cell], anchor: [cell / 2, cell / 2], frames: MONSTER_POSES.length,
    sha256: createHash("sha256").update(png).digest("hex"), lockedSeedSha256: createHash("sha256").update(encodePng(seed.width, seed.height, seed.rgba)).digest("hex") });
}
writeFileSync(join(out, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
console.log(`Exported ${manifest.units.length} monsters / ${manifest.units.length * MONSTER_POSES.length} native frames; all approved seeds match.`);
