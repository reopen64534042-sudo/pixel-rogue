import type { Profession } from "../core/types";

/**
 * 属性强化的硬上限（2026-10-30 用户确认）。
 *
 * - 吸血：射手 10%，其他职业维持 30%：防止满配强化弹靠高频命中站桩回满；
 * - 生命回复 10/秒：防止后期单次选择把续航堆到无伤；
 * - 攻速 / 移速按**本职业基础值**的相对倍率封顶，而不是固定绝对值，
 *   这样法师施法速度、战士太刀/大剑的差异不会被上限抹平；
 * - 暴击率 100% / 闪避 60% 的上限仍在 core/AttributeSystem.ts 的候选过滤里，
 *   本次不变。
 *
 * 临时 Buff（狂热、战意、流、冲刺等）在消费点实时乘算，不进属性投影，
 * 因此不受这里的硬顶限制。
 */
export const ATTRIBUTE_CAPS = {
  /** 非射手吸血总上限（比例） */
  lifesteal: 0.3,
  /** 射手吸血总上限（比例） */
  shooterLifesteal: 0.1,
  /** 生命回复总上限（HP/秒） */
  regen: 10,
  /** 攻速总上限 = 职业基础攻速 × 该倍率（2.5 = +150%） */
  fireRateMul: 2.5,
  /** 移速总上限 = 职业基础移速 × 该倍率（2 = +100%） */
  moveSpeedMul: 2,
} as const;

export function lifestealCap(prof: Profession): number {
  return prof === "shooter"
    ? ATTRIBUTE_CAPS.shooterLifesteal
    : ATTRIBUTE_CAPS.lifesteal;
}
