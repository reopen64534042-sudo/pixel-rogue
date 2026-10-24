#!/usr/bin/env node
/**
 * 像素贴图后处理：模型原图 → 可直接入库的游戏贴图。
 *
 * 用法：
 *   node scripts/pixelize.mjs <input.png> --key enemy_slime
 *   node scripts/pixelize.mjs <input.png> --key player --outline
 *   node scripts/pixelize.mjs <input.png> --size 16x16 --out output/art-out
 *
 * 流程（顺序不可交换）：
 *   1 解码 → 2 取内容包围盒 → 3 预乘 alpha 区域平均缩放 → 4 居中进目标画布
 *   → 5 alpha 二值化 → 6 Lab 空间色板量化 → 7 可选统一描边 → 8 校验（失败即退出，不写半成品）
 *
 * 设计约束：
 * - 零新增依赖（PNG 编解码见 scripts/lib/png.mjs）。
 * - 确定性：同样输入 + 同样参数必得同样字节，便于 manifest 溯源与 diff。
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join, resolve, basename } from "node:path";
import { decodePng, encodePng } from "./lib/png.mjs";
import { loadPalette, hexToRgb, REPO_ROOT } from "./lib/palette.mjs";

const PLAN_PATH = join(REPO_ROOT, "assets", "plan.json");
const MANIFEST_PATH = join(REPO_ROOT, "assets", "manifest.json");
const DEFAULT_OUT = join(REPO_ROOT, "public", "assets", "sprites");
/** 游戏运行时读取的贴图清单：决定哪些逻辑贴图名用位图覆盖程序化贴图。 */
const SPRITE_MANIFEST_PATH = join(REPO_ROOT, "public", "assets", "sprites", "manifest.json");

const ALPHA_ON = 255;
const ALPHA_OFF = 0;

function parseArgs(argv) {
  const opts = { input: null, key: null, size: null, out: DEFAULT_OUT, outline: false, model: null, seed: null, prompt: null };
  const rest = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--key") opts.key = argv[++i];
    else if (arg === "--size") opts.size = argv[++i];
    else if (arg === "--out") opts.out = resolve(argv[++i]);
    else if (arg === "--outline") opts.outline = true;
    else if (arg === "--model") opts.model = argv[++i];
    else if (arg === "--seed") opts.seed = argv[++i];
    else if (arg === "--prompt") opts.prompt = argv[++i];
    else if (arg.startsWith("--")) throw new Error(`未知参数 ${arg}`);
    else rest.push(arg);
  }
  opts.input = rest[0] ?? null;
  return opts;
}

function parseSize(text) {
  const m = /^(\d+)x(\d+)$/.exec(text ?? "");
  if (!m) return null;
  return [Number(m[1]), Number(m[2])];
}

function loadPlan() {
  if (!existsSync(PLAN_PATH)) return null;
  return JSON.parse(readFileSync(PLAN_PATH, "utf8"));
}

/** 可见像素的包围盒；全透明返回 null。 */
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
  if (maxX < 0) return null;
  return { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
}

/**
 * 预乘 alpha 的区域平均缩放。
 * 必须预乘：否则边缘半透明像素按直通 RGB 平均会把暗色吸进轮廓，产生脏边。
 */
function resampleArea(src, sw, sh, dw, dh) {
  const out = Buffer.alloc(dw * dh * 4);
  const scaleX = sw / dw;
  const scaleY = sh / dh;
  for (let dy = 0; dy < dh; dy++) {
    const y0 = dy * scaleY;
    const y1 = (dy + 1) * scaleY;
    const sy0 = Math.floor(y0);
    const sy1 = Math.min(sh, Math.ceil(y1));
    for (let dx = 0; dx < dw; dx++) {
      const x0 = dx * scaleX;
      const x1 = (dx + 1) * scaleX;
      const sx0 = Math.floor(x0);
      const sx1 = Math.min(sw, Math.ceil(x1));
      let pr = 0;
      let pg = 0;
      let pb = 0;
      let pa = 0;
      let acc = 0;
      for (let sy = sy0; sy < sy1; sy++) {
        const wy = Math.min(y1, sy + 1) - Math.max(y0, sy);
        if (wy <= 0) continue;
        for (let sx = sx0; sx < sx1; sx++) {
          const wx = Math.min(x1, sx + 1) - Math.max(x0, sx);
          if (wx <= 0) continue;
          const weight = wx * wy;
          const p = (sy * sw + sx) * 4;
          const a = src[p + 3] / 255;
          pr += src[p] * a * weight;
          pg += src[p + 1] * a * weight;
          pb += src[p + 2] * a * weight;
          pa += src[p + 3] * weight;
          acc += weight;
        }
      }
      const o = (dy * dw + dx) * 4;
      if (acc === 0 || pa === 0) {
        out[o] = 0;
        out[o + 1] = 0;
        out[o + 2] = 0;
        out[o + 3] = 0;
        continue;
      }
      const alpha = pa / acc;
      const unpremultiply = 255 / pa;
      out[o] = Math.min(255, Math.round(pr * unpremultiply));
      out[o + 1] = Math.min(255, Math.round(pg * unpremultiply));
      out[o + 2] = Math.min(255, Math.round(pb * unpremultiply));
      out[o + 3] = Math.round(alpha);
    }
  }
  return out;
}

/** 把 src 贴进 target 的画布中心。 */
function pasteCentered(target, tw, th, src, sw, sh) {
  const ox = Math.floor((tw - sw) / 2);
  const oy = Math.floor((th - sh) / 2);
  for (let y = 0; y < sh; y++) {
    const ty = oy + y;
    if (ty < 0 || ty >= th) continue;
    for (let x = 0; x < sw; x++) {
      const tx = ox + x;
      if (tx < 0 || tx >= tw) continue;
      const s = (y * sw + x) * 4;
      const t = (ty * tw + tx) * 4;
      target[t] = src[s];
      target[t + 1] = src[s + 1];
      target[t + 2] = src[s + 2];
      target[t + 3] = src[s + 3];
    }
  }
}

function cropRegion(src, sw, box) {
  const out = Buffer.alloc(box.w * box.h * 4);
  for (let y = 0; y < box.h; y++) {
    const from = ((box.y + y) * sw + box.x) * 4;
    src.copy(out, y * box.w * 4, from, from + box.w * 4);
  }
  return out;
}

/** alpha 二值化：消除抗锯齿杂边。这一步是像素画干净与否的决定项。 */
function thresholdAlpha(rgba) {
  for (let i = 3; i < rgba.length; i += 4) {
    rgba[i] = rgba[i] >= 128 ? ALPHA_ON : ALPHA_OFF;
  }
}

function srgbToLinear(v) {
  const c = v / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function rgbToLab(r, g, b) {
  const lr = srgbToLinear(r);
  const lg = srgbToLinear(g);
  const lb = srgbToLinear(b);
  const x = (lr * 0.4124564 + lg * 0.3575761 + lb * 0.1804375) / 0.95047;
  const y = lr * 0.2126729 + lg * 0.7151522 + lb * 0.072175;
  const z = (lr * 0.0193339 + lg * 0.119192 + lb * 0.9503041) / 1.08883;
  const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const fx = f(x);
  const fy = f(y);
  const fz = f(z);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

/** Lab 空间最近色量化：RGB 距离会在暗部偏色，Lab 更接近人眼。 */
function quantizeToPalette(rgba, palette) {
  const labPalette = palette.map((entry) => {
    const [r, g, b] = hexToRgb(entry.hex);
    return { rgb: [r, g, b], lab: rgbToLab(r, g, b), key: entry.key, hex: entry.hex };
  });
  const cache = new Map();
  for (let i = 0; i < rgba.length; i += 4) {
    if (rgba[i + 3] === 0) continue;
    const cacheKey = (rgba[i] << 16) | (rgba[i + 1] << 8) | rgba[i + 2];
    let hit = cache.get(cacheKey);
    if (!hit) {
      const lab = rgbToLab(rgba[i], rgba[i + 1], rgba[i + 2]);
      let best = null;
      let bestDist = Infinity;
      for (const candidate of labPalette) {
        const d0 = lab[0] - candidate.lab[0];
        const d1 = lab[1] - candidate.lab[1];
        const d2 = lab[2] - candidate.lab[2];
        const dist = d0 * d0 + d1 * d1 + d2 * d2;
        if (dist < bestDist) {
          bestDist = dist;
          best = candidate;
        }
      }
      cache.set(cacheKey, best);
      hit = best;
    }
    rgba[i] = hit.rgb[0];
    rgba[i + 1] = hit.rgb[1];
    rgba[i + 2] = hit.rgb[2];
  }
  return cache.size;
}

/** 沿不透明区域四邻域外扩 1px 描边，用于抹平模型之间的轮廓粗细差异。 */
function addOutline(rgba, width, height, rgb) {
  const snapshot = Buffer.from(rgba);
  const opaque = (x, y) => snapshot[(y * width + x) * 4 + 3] === ALPHA_ON;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      if (snapshot[i + 3] === ALPHA_ON) continue;
      const near =
        (x > 0 && opaque(x - 1, y)) ||
        (x < width - 1 && opaque(x + 1, y)) ||
        (y > 0 && opaque(x, y - 1)) ||
        (y < height - 1 && opaque(x, y + 1));
      if (!near) continue;
      rgba[i] = rgb[0];
      rgba[i + 1] = rgb[1];
      rgba[i + 2] = rgb[2];
      rgba[i + 3] = ALPHA_ON;
    }
  }
}

function validate(rgba, width, height, target, paletteSize) {
  const problems = [];
  if (width !== target[0] || height !== target[1]) {
    problems.push(`尺寸 ${width}x${height} ≠ 规格 ${target[0]}x${target[1]}`);
  }
  const colors = new Set();
  let semiTransparent = 0;
  for (let i = 0; i < rgba.length; i += 4) {
    const a = rgba[i + 3];
    if (a !== ALPHA_ON && a !== ALPHA_OFF) semiTransparent++;
    if (a === ALPHA_ON) colors.add(`${rgba[i]},${rgba[i + 1]},${rgba[i + 2]}`);
  }
  if (semiTransparent > 0) problems.push(`存在 ${semiTransparent} 个半透明像素`);
  if (colors.size > paletteSize) problems.push(`色数 ${colors.size} > 调色板 ${paletteSize}`);
  if (colors.size === 0) problems.push("输出全透明");
  return { problems, colors: colors.size };
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (!opts.input) {
    console.error("用法: node scripts/pixelize.mjs <input.png> --key <assetKey> [--outline]");
    process.exit(2);
  }
  const palette = loadPalette();

  let target = parseSize(opts.size);
  let planEntry = null;
  if (opts.key) {
    const plan = loadPlan();
    if (!plan) throw new Error("找不到 assets/plan.json，无法按 key 取规格");
    planEntry = plan.assets?.find((a) => a.key === opts.key);
    if (!planEntry) throw new Error(`assets/plan.json 中没有 key: ${opts.key}`);
    const fromPlan = parseSize(`${planEntry.size[0]}x${planEntry.size[1]}`);
    if (target && (target[0] !== fromPlan[0] || target[1] !== fromPlan[1])) {
      throw new Error(`--size ${opts.size} 与计划规格 ${planEntry.size[0]}x${planEntry.size[1]} 冲突`);
    }
    target = fromPlan;
  }
  if (!target) throw new Error("必须提供 --key 或 --size");

  const source = decodePng(readFileSync(opts.input));
  const box = contentBox(source.rgba, source.width, source.height);
  if (!box) throw new Error("输入图全透明，无可处理内容");

  const crop = cropRegion(source.rgba, source.width, box);
  const scale = Math.min(target[0] / box.w, target[1] / box.h, 1);
  const scaledW = Math.max(1, Math.round(box.w * scale));
  const scaledH = Math.max(1, Math.round(box.h * scale));
  const scaled =
    scaledW === box.w && scaledH === box.h ? crop : resampleArea(crop, box.w, box.h, scaledW, scaledH);

  const canvas = Buffer.alloc(target[0] * target[1] * 4);
  pasteCentered(canvas, target[0], target[1], scaled, scaledW, scaledH);
  thresholdAlpha(canvas);
  const distinctBefore = quantizeToPalette(canvas, palette);
  if (opts.outline) {
    const ink = hexToRgb(palette.find((e) => e.key === "ink0").hex);
    addOutline(canvas, target[0], target[1], ink);
  }

  const check = validate(canvas, target[0], target[1], target, palette.length);
  const key = opts.key ?? basename(opts.input, ".png");
  if (check.problems.length > 0) {
    console.error(`✗ ${key} 校验未通过：`);
    for (const problem of check.problems) console.error(`  - ${problem}`);
    process.exit(1);
  }

  const outPath = join(opts.out, `${key}.png`);
  mkdirSync(dirname(outPath), { recursive: true });
  const png = encodePng(target[0], target[1], canvas);
  writeFileSync(outPath, png);

  const sha256 = createHash("sha256").update(png).digest("hex");
  const manifest = existsSync(MANIFEST_PATH) ? JSON.parse(readFileSync(MANIFEST_PATH, "utf8")) : { entries: [] };
  manifest.entries.push({
    key,
    at: new Date().toISOString(),
    source: { file: basename(opts.input), size: [source.width, source.height] },
    output: { file: `public/assets/sprites/${key}.png`, size: target, colors: check.colors, sha256 },
    params: { outline: opts.outline, alphaThreshold: 128, quantize: "lab-nearest" },
    provenance: { model: opts.model, seed: opts.seed, prompt: opts.prompt },
  });
  writeFileSync(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`);

  // 同步游戏运行时的贴图清单，否则产出的 PNG 不会被加载
  if (resolve(opts.out) === resolve(DEFAULT_OUT)) {
    const spriteManifest = existsSync(SPRITE_MANIFEST_PATH)
      ? JSON.parse(readFileSync(SPRITE_MANIFEST_PATH, "utf8"))
      : { sprites: {} };
    spriteManifest.sprites = { ...(spriteManifest.sprites ?? {}), [key]: `${key}.png` };
    mkdirSync(dirname(SPRITE_MANIFEST_PATH), { recursive: true });
    writeFileSync(SPRITE_MANIFEST_PATH, `${JSON.stringify(spriteManifest, null, 2)}\n`);
  }

  console.log(
    `✓ ${key}  ${source.width}x${source.height} → ${target[0]}x${target[1]}  ` +
      `色数 ${check.colors}（量化前 ${distinctBefore}）  ${basename(outPath)}`,
  );
}

try {
  main();
} catch (error) {
  console.error(`✗ ${error.message}`);
  process.exit(1);
}
