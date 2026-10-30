import type { WarriorStyle } from "../core/types";

/**
 * 战士基础形态与核心链系数。
 *
 * 数值口径（2026-10-30 用户确认的提案）：
 * - 80 HP / 60 移速 / 10 护甲 / 4% 吸血；
 * - 太刀 9 伤害 ×2.0/s、34px、100° 扇形、击退 4px；
 * - 大剑 17 伤害 ×1.2/s、36px、130° 扇形、击退 10px。
 *
 * 战士的强度靠「贴住」换覆盖：挥砍本身是扇形，k 天然 ≥2，
 * 所以单体伤害低于射手、但不依赖排线。当前批次含核心/入场/共享 13 张卡。
 */
export interface WarriorStyleStats {
  readonly label: string;
  readonly short: string;
  readonly damage: number;
  readonly fireRate: number;
  readonly range: number;
  /** 扇形张角（弧度）。 */
  readonly spread: number;
  /** 击退位移 px；MeleeSystem 内部 ×KNOCK_DAMP 换算成初速。 */
  readonly knock: number;
  readonly color: string;
  /** 命中粒子色 */
  readonly particle: string;
  /** 冲刺残影色 */
  readonly trail: string;
}

export const WARRIOR_BALANCE = {
  maxhp: 80,
  speed: 60,
  defense: 10,
  lifesteal: 0.04,
  heavyEvery: 3,
  heavyDamageMul: 2.5,
  heavyKnockMul: 1.2,
  heavyRangeMul: 1.5,
  heavyIntervalMul: 1.2,
  heavyArmorBreakPct: 0.4,
  dashDistMul: 1.3,
  dashDamageMul: 0.8,
  leapRange: 80,
  leapRangeMul: 1.3,
  leapDamageMul: 1.2,
  leapRechargeExtra: 0.8,
  resolveWindow: 1,
  resolveDamageMul: 0.4,
  leapHasteWindow: 1,
  leapHasteMul: 0.25,
  lianZhanChance: 0.3,
  lianZhanHeal: 0.03,
  breakoutCount: 3,
  breakoutDamageMul: 1.15,
  breakoutKnockMul: 2,
  heavyArmorBreakT: 4,
  swordQiRange: 200,
  swordQiWidth: 10,
  swordQiDamageMul: 0.8,
  // 剑气击退不在此表：已统一到 data/knockback.ts 的 KNOCK.warrior.qi（14px），
  // 避免「伤害数值」与「击退数值」两套口径各自漂移。
  flow: {
    cap1: 5,
    cap2: 10,
    cap3: 15,
    dmgPerStack: 0.02,
    atkSpeedPerStack: 0.015,
    duration1: 3,
    duration2: 4,
    burstT: 3,
    burstKeep: 5,
  },
  styles: {
    katana: {
      label: "太刀流",
      short: "太 刀",
      damage: 9,
      fireRate: 2.0,
      range: 34,
      spread: (100 * Math.PI) / 180,
      knock: 4,
      color: "#5ef2c8",
      particle: "#bfffea",
      trail: "#8ff5e0",
    },
    greatsword: {
      label: "大剑流",
      short: "大 剑",
      damage: 17,
      fireRate: 1.2,
      range: 36,
      spread: (130 * Math.PI) / 180,
      knock: 10,
      color: "#ffd24a",
      particle: "#ffe8a3",
      trail: "#ffd24a",
    },
  } satisfies Record<WarriorStyle, WarriorStyleStats>,
} as const;

export const WARRIOR_STYLE_ORDER: readonly WarriorStyle[] = [
  "katana",
  "greatsword",
];
