/**
 * 从 src/game/data/palette.ts 读取调色板 —— 保持"单一真源"。
 *
 * 为什么不复制一份 JSON：一旦两份文件并存，迟早会各自演进。
 * 这里用严格正则解析固定格式的对象字面量，解析结果数量与文件声明不符即报错，
 * 避免静默读到半份调色板。
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = join(HERE, "..", "..");
const PALETTE_TS = join(REPO_ROOT, "src", "game", "data", "palette.ts");

const ENTRY_RE =
  /\{\s*key:\s*"([^"]+)",\s*hex:\s*"(#[0-9a-fA-F]{6})",\s*group:\s*"([^"]+)",\s*note:\s*"([^"]+)"\s*\}/g;

export function loadPalette() {
  const source = readFileSync(PALETTE_TS, "utf8");
  const entries = [];
  for (const m of source.matchAll(ENTRY_RE)) {
    entries.push({ key: m[1], hex: m[2].toLowerCase(), group: m[3], note: m[4] });
  }
  if (entries.length === 0) {
    throw new Error(`未从 ${PALETTE_TS} 解析到任何颜色，检查文件格式是否被改动`);
  }
  const seen = new Set();
  for (const entry of entries) {
    if (seen.has(entry.key)) throw new Error(`调色板键名重复: ${entry.key}`);
    seen.add(entry.key);
  }
  return entries;
}

/** hex → [r,g,b] */
export function hexToRgb(hex) {
  const n = Number.parseInt(hex.slice(1), 16);
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
}
