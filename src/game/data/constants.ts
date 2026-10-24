export const W = 480,
  H = 270;
export const VIEW = { w: W, h: H };
export const WORLD = { w: 1392, h: 1040 };
/** 满血拾取血包转化为最大生命的每波上限（加成本身永久保留，不设总上限） */
export const POTION_GROW_CAP = 10;
/** 每波普通怪宝箱掉落上限；精英必掉的那一个不占此名额 */
export const BOX_DROP_CAP = 2;
/** 普通怪单只掉宝箱概率 */
export const BOX_DROP_RATE = 0.01;
/** 精英经验 = 25 + (波次-1) × 该系数，随难度同步成长 */
export const ELITE_XP_STEP = 4;
/**
 * 确定性伪随机（0~1）。
 * 用于掉落等判定时必须替代 Math.random —— 后者会推进随机序列，
 * 让 parity 的确定性模拟在后续所有随机点分叉。
 */
export function hash01(a: number, b = 0) {
  const h = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
  return h - Math.floor(h);
}
export const clamp = (v: number, a: number, b: number) =>
  Math.max(a, Math.min(b, v));
export function fmtTime(t: number) {
  const m = Math.floor(t / 60),
    s = Math.floor(t % 60);
  return m + ":" + String(s).padStart(2, "0");
}
