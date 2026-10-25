/**
 * 贴图解析表：把「逻辑贴图名」映射到「实际纹理 + 尺寸」。
 *
 * 存在的理由：游戏原本只有程序化 Canvas 贴图（sprites.ts）。引入外部 PNG 后，
 * 同一逻辑名可能对应两种纹理源，绘制代码不应关心是哪一种——统一从这里取。
 *
 * 约定：
 * - 默认值全部来自 sprites.ts 的 Canvas，尺寸即其像素尺寸；
 * - 外部 PNG 加载成功后由 registerSprite 覆盖，纹理键为 `ovr:<key>`；
 * - 没有任何覆盖资源时，行为与改造前完全一致（这条是回归底线）。
 *
 * 本模块不依赖 Phaser，保持可被纯逻辑测试引用。
 */
import { SPR } from "./sprites";

export interface SpriteEntry {
  /** Phaser 纹理键 */
  tex: string;
  /** 贴图原始像素宽（用于居中与缩放计算） */
  w: number;
  /** 贴图原始像素高 */
  h: number;
  /** 外部覆盖 PNG 的地址；未覆盖时为空（此时 DOM 面板回退到程序化 Canvas） */
  src?: string;
}

const entries = new Map<string, SpriteEntry>();
/** DOM 面板用的图片源缓存（canvas.toDataURL 结果）；覆盖资源变化时整体失效。 */
let imageCache: Map<string, string> | null = null;

function seedDefaults() {
  for (const [key, canvas] of Object.entries(SPR))
    entries.set(key, { tex: key, w: canvas.width, h: canvas.height });
}
seedDefaults();

/** 外部 PNG 覆盖：以 `ovr:` 前缀区分，避免与 Canvas 纹理键冲突。 */
export function registerSprite(key: string, image: HTMLImageElement) {
  const tex = `ovr:${key}`;
  entries.set(key, { tex, w: image.width, h: image.height, src: image.src });
  imageCache = null;
  return tex;
}

/** 取贴图条目；未注册返回 undefined（调用方需自行兜底）。 */
export function spriteEntry(key: string): SpriteEntry | undefined {
  return entries.get(key);
}

export function hasSprite(key: string): boolean {
  return entries.has(key);
}

/**
 * 供 DOM 面板（图鉴等）直接显示的图片源。
 *
 * 优先返回外部覆盖 PNG 的地址，否则把程序化 Canvas 导出为 dataURL。
 * 因此**换贴图时（改 manifest 或改 sprites.ts 的像素矩阵）调用方零改动**。
 */
export function spriteImageSrc(key: string): string | undefined {
  const entry = entries.get(key);
  if (!entry) return undefined;
  if (entry.src) return entry.src;
  imageCache ??= new Map();
  const cached = imageCache.get(key);
  if (cached) return cached;
  const canvas = SPR[key];
  if (!canvas) return undefined;
  const src = canvas.toDataURL();
  imageCache.set(key, src);
  return src;
}

/** 仅供测试与调试：回退全部覆盖，恢复程序化贴图。 */
export function resetSprites() {
  entries.clear();
  seedDefaults();
  imageCache = null;
}
