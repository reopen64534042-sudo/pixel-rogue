export const W = 480,
  H = 270;
export const VIEW = { w: W, h: H };
export const WORLD = { w: 1392, h: 1040 };
/** 满血拾取血包转化为最大生命的每波上限（加成本身永久保留，不设总上限） */
export const POTION_GROW_CAP = 10;
/** 宝箱拾取回血：普通与精英宝箱相同（v79 用户裁定） */
export const CHEST_HEAL = 10;
/** 每波普通怪宝箱掉落上限；精英宝箱不占此名额 */
export const BOX_DROP_CAP = 2;
/** 普通怪单只掉宝箱概率 */
export const BOX_DROP_RATE = 0.01;
/**
 * 精英（含 BOSS）宝箱掉落概率。
 * 2026-10-30 用户裁定：从「必掉」改回概率掉落，初值 50%。
 */
export const ELITE_BOX_DROP_RATE = 0.5;
/**
 * Issue #87（用户批准的平衡变更）：特殊宝箱单箱可换取的强化点数。
 * 原为 2，后期叠加多精英导致天赋成长过快、数值膨胀，下调为 1。
 */
export const ELITE_BOX_GAIN = 1;
/**
 * 每波**精英**宝箱可贡献的强化点数上限；超出部分转为经验 + 血包。
 * 只约束精英宝箱，普通宝箱（1% 掉率、每波 BOX_DROP_CAP 个）独立计算、互不挤占。
 */
export const ELITE_BOX_POINT_CAP = 2;
/** 精英经验 = 25 + (波次-1) × 该系数，随难度同步成长 */
export const ELITE_XP_STEP = 4;
/** 射手职业被动：每第 N 次普通射击发射一枚强化弹 */
export const SPECIAL_SHOT_EVERY = 3;
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
