export const W = 480,
  H = 270;
export const VIEW = { w: W, h: H };
export const WORLD = { w: 1392, h: 1040 };
/**
 * 全局震屏上限（像素）。怪物受击/死亡、招式、精英等多来源会在同一帧叠加；
 * 后期必须让玩家看清画面，所有来源统一受此上限约束。
 */
export const SHAKE_MAX = 4;
/** 历史基线：满血血包转生命上限已移除；保留给旧测试编译，运行时不再消费。 */
export const POTION_GROW_CAP = 10;
/** 血瓶回复：1 级 10 点，每 4 波 +4，封顶 30。 */
export const POTION_HEAL_BASE = 10;
export const POTION_HEAL_STEP = 4;
export const POTION_HEAL_CAP = 30;
export function potionHealAmount(wave: number): number {
  const steps = Math.floor((Math.max(1, wave) - 1) / 4);
  return Math.min(
    POTION_HEAL_CAP,
    POTION_HEAL_BASE + steps * POTION_HEAL_STEP,
  );
}
/** 宝箱拾取回血：普通与精英宝箱相同（v79 用户裁定） */
export const CHEST_HEAL = 10;
/** 每波普通怪成长徽记掉落上限；精英普通宝箱不占此名额 */
export const BOX_DROP_CAP = 2;
/** 普通怪单只掉成长徽记概率 */
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
/** 射手职业被动：强化弹的基础触发间隔（开火次数）；核心链 L1/L2 各 −1 */
export const SPECIAL_SHOT_EVERY = 4;
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

/**
 * 生命值文本：上限为整数时保持旧的向上取整当前值；
 * 等级成长会产生 0.5 上限，此时两侧统一保留一位小数，
 * 避免当前 21.5 被 ceil 成 22、显示成 22/21.5。
 */
export function fmtHp(hp: number, maxhp: number) {
  if (Number.isInteger(maxhp)) return `${Math.ceil(hp)}/${maxhp}`;
  return `${hp.toFixed(1)}/${maxhp.toFixed(1)}`;
}
