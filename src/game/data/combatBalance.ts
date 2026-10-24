/**
 * combatBalance.ts —— 战斗数值常量（Issue #38-#45 平衡批次）。
 *
 * 按 docs/pixel-rogue-combat-foundation-v1.md §8 的文件规划落地（S1 交付物的前置）。
 * 所有平衡系数集中于此；DamageMath.ts 的纯函数消费本表，
 * 未来 DamageSystem 重构时同样只改这里，调用点保持稳定。
 *
 * 每个系数标注来源 Issue，未经平衡批准不得修改。
 */
export const COMBAT_BALANCE = {
  /** #25 魔弹特化：每级魔弹倍率 */
  boltMulPerLevel: 1.25,

  /** #41 致命一击：满层觉醒 */
  critMaxLevel: 8,
  critPerLevel: 0.1,
  critAwakeningCritMulBonus: 0.4,

  /** #45 陨星：伤害系数（重做后） */
  meteorBase: 3,
  meteorPerLevel: 8,

  /** #43 护盾破碎反震 */
  shieldShock: 2,
  shieldShockRadius: 80,

  /** #42 灼烧叠层 */
  burnDpsPerStack: 0.1,
  burnStackCap: 4,
  burnDuration: 2,
  burnSpreadRadius: 80,

  /** #45 焦土燃烧 */
  burnGroundDps: 0.2,
  burnGroundDuration: 5,

  /** #38 冰霜叠层 → 冰冻 */
  frostStacksToFreeze: 3,
  frostFreezeBase: 0.4,
  frostFreezePerLevel: 0.2,
  frostImmunityWindow: 2.5,

  /** #36 多弹道动态散布 */
  spreadMin: 0.04,
  spreadMax: 0.16,
  spreadRampTargets: 4,
  spreadDetectRadius: 110,

  /** #42 灼热易伤 */
  scorchVulnPerLevel: 0.1,
} as const;
