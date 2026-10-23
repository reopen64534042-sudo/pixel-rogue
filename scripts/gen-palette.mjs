#!/usr/bin/env node
/**
 * 从 src/game/data/palette.ts 导出 assets/palette.gpl（GIMP / Aseprite 通用）。
 *
 * 目的：让美术侧与模型侧导入同一份色板，避免"代码一份、美术一份"逐渐漂移。
 * 用法：node scripts/gen-palette.mjs
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { loadPalette, hexToRgb, REPO_ROOT } from "./lib/palette.mjs";

const OUT = join(REPO_ROOT, "assets", "palette.gpl");
const palette = loadPalette();

const lines = ["GIMP Palette", "Name: Pixel Rogue", "Columns: 8", "#"];
for (const entry of palette) {
  const [r, g, b] = hexToRgb(entry.hex);
  const pad = (v) => String(v).padStart(3, " ");
  lines.push(`${pad(r)} ${pad(g)} ${pad(b)}\t${entry.key} ${entry.note}`);
}

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, `${lines.join("\n")}\n`);

const groups = new Map();
for (const entry of palette) groups.set(entry.group, (groups.get(entry.group) ?? 0) + 1);
console.log(`✓ 已导出 ${palette.length} 色 → assets/palette.gpl`);
console.log(`  分组：${[...groups].map(([g, n]) => `${g} ${n}`).join(" / ")}`);
