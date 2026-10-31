#!/usr/bin/env node
/**
 * 元素法师 VFX 源图后处理：纯色绿幕 → 透明 PNG。
 *
 * 只做三件事：绿幕抠图、去边缘绿溢色、按内容裁剪/切片；
 * 不做调色板量化与降采样，保留 AI 源图的像素笔触供美术复核。
 *
 * 用法：
 *   node scripts/chroma-key-mage-vfx.mjs <输入.png> <输出.png>
 *   node scripts/chroma-key-mage-vfx.mjs <输入.png> <输出.png> --slice-wordmarks
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { decodePng, encodePng } from "./lib/png.mjs";

const [input, output, ...flags] = process.argv.slice(2);
if (!input || !output) {
  console.error("用法: node scripts/chroma-key-mage-vfx.mjs <输入.png> <输出.png> [--slice-wordmarks]");
  process.exit(1);
}

/** 绿幕判定：绿色通道明显高于红/蓝；像素图边缘通常只有全绿或全不绿。 */
function isGreen(r, g, b) {
  return g > 110 && g > r * 1.55 && g > b * 1.55;
}

function keyedRgba(img) {
  const rgba = Buffer.from(img.rgba);
  for (let i = 0; i < rgba.length; i += 4) {
    const r = rgba[i];
    const g = rgba[i + 1];
    const b = rgba[i + 2];
    if (isGreen(r, g, b)) {
      rgba[i + 3] = 0;
      continue;
    }
    // 去绿溢色：像素主体仍略带绿幕反射时，把绿色压到红/蓝的较大值。
    if (rgba[i + 3] > 0 && g > r && g > b) {
      const cap = Math.max(r, b);
      if (g - cap > 18) rgba[i + 1] = cap;
    }
  }
  return rgba;
}

function contentBox(rgba, width, height) {
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (rgba[(y * width + x) * 4 + 3] > 0) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  return maxX < 0 ? null : { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
}

function crop(rgba, width, height, box, pad = 8) {
  const x0 = Math.max(0, box.x - pad);
  const y0 = Math.max(0, box.y - pad);
  const x1 = Math.min(width, box.x + box.w + pad);
  const y1 = Math.min(height, box.y + box.h + pad);
  const w = x1 - x0;
  const h = y1 - y0;
  const out = Buffer.alloc(w * h * 4);
  for (let y = 0; y < h; y++) {
    rgba.copy(out, y * w * 4, ((y0 + y) * width + x0) * 4, ((y0 + y) * width + x1) * 4);
  }
  return { width: w, height: h, rgba: out };
}

function stats(rgba, width, height) {
  let transparent = 0;
  let opaque = 0;
  let partial = 0;
  const colors = new Set();
  for (let i = 0; i < rgba.length; i += 4) {
    const a = rgba[i + 3];
    if (a === 0) transparent++;
    else if (a === 255) opaque++;
    else partial++;
    if (a > 0) colors.add((rgba[i] << 16) | (rgba[i + 1] << 8) | rgba[i + 2]);
  }
  return { width, height, transparent, opaque, partial, colors: colors.size };
}

const inputImg = decodePng(readFileSync(input));
const rgba = keyedRgba(inputImg);
mkdirSync(dirname(output), { recursive: true });

// 整张源图保留原始画布尺寸，只把绿幕变为透明，便于按格子切帧。
writeFileSync(output, encodePng(inputImg.width, inputImg.height, rgba));
const whole = stats(rgba, inputImg.width, inputImg.height);

const report = {
  source: input.split(/[\\/]/).pop(),
  output: output.split(/[\\/]/).pop(),
  ...whole,
};

if (flags.includes("--slice-wordmarks")) {
  // 六宫格 3 列 × 2 行：急淬/融化/超载 / 裂焰/超导/霜缚。
  const names = ["quench", "melt", "overload", "blaze", "superconduct", "frostbind"];
  const cellW = Math.floor(inputImg.width / 3);
  const cellH = Math.floor(inputImg.height / 2);
  const outDir = join(dirname(output), "wordmarks");
  mkdirSync(outDir, { recursive: true });
  const slices = [];
  let idx = 0;
  for (let row = 0; row < 2; row++) {
    for (let col = 0; col < 3; col++) {
      const x0 = col * cellW;
      const y0 = row * cellH;
      const cell = Buffer.alloc(cellW * cellH * 4);
      for (let y = 0; y < cellH; y++) {
        rgba.copy(cell, y * cellW * 4, ((y0 + y) * inputImg.width + x0) * 4, ((y0 + y) * inputImg.width + x0 + cellW) * 4);
      }
      const box = contentBox(cell, cellW, cellH);
      if (!box) throw new Error(`第 ${idx + 1} 个文字格为空`);
      const sliced = crop(cell, cellW, cellH, box, 10);
      const file = join(outDir, `reaction-${names[idx]}.png`);
      writeFileSync(file, encodePng(sliced.width, sliced.height, sliced.rgba));
      slices.push({ name: names[idx], file: `wordmarks/reaction-${names[idx]}.png`, ...stats(sliced.rgba, sliced.width, sliced.height) });
      idx++;
    }
  }
  report.slices = slices;
}

const reportPath = output.replace(/\.png$/, ".json");
writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
