/**
 * combatBalance.ts —— 战斗数值常量。
 *
 * 两部分来源：
 * - Combat Foundation v1 试验基准（S1）：armorK=50 与元素抗性 75% 上限是
 *   v1 试验基准，不是平衡验证后的最终定值；S3 启用真实数值前须复核
 *   （docs/pixel-rogue-combat-foundation-v1.md §3.2）。
 * - Issue #38-#45 平衡批次系数：DamageMath.ts 的纯函数消费本表，
 *   DamageSystem 管线同样只读这里，调用点保持稳定。
 *
 * 每个系数标注来源，未经平衡批准不得修改。
 */
export interface CombatBalance {
  /** —— Combat Foundation S1（§3.2 减伤公式） —— */
  /** 物理护甲系数：减伤系数 = K / (K + max(0, DEF)) */
  armorK: number;
  /** 元素抗性减伤上限（比例） */
  resistanceCap: number;
  /** 元素抗性下限（负值 = 弱点，对应元素伤害按 1 - res 放大；-0.5 即最多 +50%） */
  resistanceFloor: number;
  /** 通用减伤（韧性 tough）上限，兼容既有「铁布衫」60% */
  toughCap: number;

  /** —— Issue #38-#45 平衡批次 —— */
  /** #25 魔弹特化：每级魔弹倍率 */
  boltMulPerLevel: number;
  /** #41 致命一击：满层觉醒 */
  critMaxLevel: number;
  critPerLevel: number;
  critAwakeningCritMulBonus: number;
  /** #45 陨星：伤害系数（重做后） */
  meteorBase: number;
  meteorPerLevel: number;
  /** #43 护盾破碎反震 */
  shieldShock: number;
  shieldShockRadius: number;
  /** #42 灼烧叠层 */
  burnDpsPerStack: number;
  burnStackCap: number;
  burnDuration: number;
  burnSpreadRadius: number;
  /** #45 焦土燃烧 */
  burnGroundDps: number;
  burnGroundDuration: number;
  /** #38 冰霜叠层 → 冰冻 */
  frostStacksToFreeze: number;
  frostFreezeBase: number;
  frostFreezePerLevel: number;
  frostImmunityWindow: number;
  /** #36 多弹道动态散布 */
  spreadMin: number;
  spreadMax: number;
  spreadRampTargets: number;
  spreadDetectRadius: number;
  /** #42 灼热易伤 */
  scorchVulnPerLevel: number;
}
export const COMBAT_BALANCE: CombatBalance = {
  armorK: 50,
  resistanceCap: 0.75,
  resistanceFloor: -0.5,
  toughCap: 0.6,

  boltMulPerLevel: 1.25,
  critMaxLevel: 8,
  critPerLevel: 0.1,
  critAwakeningCritMulBonus: 0.4,
  meteorBase: 3,
  meteorPerLevel: 8,
  shieldShock: 2,
  shieldShockRadius: 80,
  burnDpsPerStack: 0.1,
  burnStackCap: 4,
  burnDuration: 2,
  burnSpreadRadius: 80,
  burnGroundDps: 0.2,
  burnGroundDuration: 5,
  frostStacksToFreeze: 3,
  frostFreezeBase: 0.4,
  frostFreezePerLevel: 0.2,
  frostImmunityWindow: 2.5,
  spreadMin: 0.04,
  spreadMax: 0.16,
  spreadRampTargets: 4,
  spreadDetectRadius: 110,
  scorchVulnPerLevel: 0.1,
};

/** v132 激光首版系数，集中留待自然试玩校准。 */
export const LASER_DAMAGE = {
  // v137：先提升单束基本盘，三联与聚焦在此基础上成长。
  dpsPerAttack: 1.8,
  dpsPerLevel: 0.08,
  focusBonus: 0.5,
  pierce: 0.8,
  lensPierce: 0.9,
  polarBonus: 0.05,
  maxPierce: 0.95,
  // v134 三联激光：两侧均为完整主束，与中央同伤害。
  tripleSideMul: 1,
  afterglowDps: 0.2,
  echoDps: 0.35,
  meltdown: 1.8,
  collapse: 0.8,
  escape: 0.8,
  rechargeDefense: 0.85,
  focusRelay: 0.6,
  farFocusSpeed: 1.4,
  highFocus: 0.75,
} as const;

/** v141: approved missile design; damage factors stay out of system orchestration. */
export const MISSILE_DAMAGE = {
  base: 3.6, perLevel: 0.06, liner: 1.12, twin: 0.65, pressure: 1.35,
  pressureRadius: 1.15, radiusUpgrade: 1.2, rangeUpgrade: 1.2, vector: 1.35,
  motor: 1.25, reload: 0.85, fastEject: 0.08,
  beacon: 1.2, edgeLoss: 0.4, decode: 0.3, pursuit: 0.5, pursuitRadius: 0.7,
  swarm: 0.35, recovered: 0.25, arc: 0.35, relay: 0.6, resonance: 0.4,
  burn: 0.12, lifesteal: 0.3, armor: 0.75,
} as const;

/** 三首巨兽：招式倍率、地面每 tick 伤害、冲锋硬直易伤。 */
export const BOSS_DAMAGE = {
  stomp: 0.95, charge: 1.35, breath: 0.85, nova: 1.05, spikes: 0.85,
  marks: 1, chain: 1.15, chainJump: 0.6,
  fireGround: 0.4, frostGround: 0,
  vulnerability: 1.15,
} as const;
