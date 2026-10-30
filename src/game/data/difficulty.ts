import type { Profession } from "../core/types";

/**
 * 动态难度档案（2026-10-30 用户确认）。
 *
 * 只对射手启用；法师 / 战士先保持 neutral（所有乘区 1、无额外护甲/攻击/DR），
 * 等各自参考 build 标定后再填。射手档案分两层：
 * - 20 波后的固定曲线：DR 到 25 波拉满，HP / 护甲 / 攻击到 30 波拉满；
 * - 永久品质威胁：每次属性选择高于同级期望品质的偏离累计，映射为额外 DR，
 *   上限 5%。低于期望不产生反向减免。
 *
 * DR 在伤害管线最后统一乘一次，连 true / 百分比生命伤害也一起压；
 * 它不是抗性，而是独立的难度层。
 */
export interface DifficultyProfile {
  readonly enabled: boolean;
  /** 开始生效的波次（含） */
  readonly lateFrom: number;
  /** DR 拉满的波次 */
  readonly drFullWave: number;
  /** HP / 护甲 / 攻击拉满的波次 */
  readonly statFullWave: number;
  readonly drMax: number;
  readonly hpMax: number;
  readonly armorMax: number;
  readonly attackMax: number;
  /** 品质威胁的 DR 上限 */
  readonly qualityDrMax: number;
  /** 每 1 点品质偏离（稀有度倍率差值）对应的 DR */
  readonly qualityDrPerPoint: number;
  /** 经验补偿上限（相对击杀经验） */
  readonly xpMax: number;
}

const NEUTRAL: DifficultyProfile = {
  enabled: false,
  lateFrom: 20,
  drFullWave: 25,
  statFullWave: 30,
  drMax: 0,
  hpMax: 0,
  armorMax: 0,
  attackMax: 0,
  qualityDrMax: 0,
  qualityDrPerPoint: 0,
  xpMax: 0,
};

/** 射手 B 方案：W25 DR 32%，W30 HP +35% / 护甲 +14 / 攻击 +50%。 */
const SHOOTER: DifficultyProfile = {
  enabled: true,
  lateFrom: 20,
  drFullWave: 25,
  statFullWave: 30,
  drMax: 0.32,
  hpMax: 0.35,
  armorMax: 14,
  attackMax: 0.5,
  qualityDrMax: 0.05,
  qualityDrPerPoint: 0.00725,
  xpMax: 0.15,
};

export interface DifficultyState {
  /** 敌人生命最终倍率 */
  readonly hpMul: number;
  /** 敌人攻击最终倍率 */
  readonly attackMul: number;
  /** 敌人护甲 flat 追加 */
  readonly armorAdd: number;
  /** 固定曲线 DR（不含品质） */
  readonly baseDr: number;
  /** 品质威胁 DR */
  readonly qualityDr: number;
  /** 两者乘法叠加后的总 DR */
  readonly totalDr: number;
  /** 最终伤害乘区：1 - totalDr */
  readonly damageTakenMul: number;
  /** 击杀经验倍率 */
  readonly xpMul: number;
}

const NEUTRAL_STATE: DifficultyState = {
  hpMul: 1,
  attackMul: 1,
  armorAdd: 0,
  baseDr: 0,
  qualityDr: 0,
  totalDr: 0,
  damageTakenMul: 1,
  xpMul: 1,
};

function ramp(value: number, from: number, full: number) {
  if (full <= from) return value >= full ? 1 : 0;
  return Math.max(0, Math.min(1, (value - from) / (full - from)));
}

export function difficultyProfile(prof: Profession): DifficultyProfile {
  return prof === "shooter" ? SHOOTER : NEUTRAL;
}

/**
 * 解析当前波次的难度。`qualityScore` 是本局累计的品质偏离（可负）；
 * 只有正偏离会转化为 DR。
 */
export function resolveDifficulty(
  prof: Profession,
  wave: number,
  qualityScore: number,
): DifficultyState {
  const p = difficultyProfile(prof);
  if (!p.enabled) return NEUTRAL_STATE;
  const drRamp = ramp(wave, p.lateFrom, p.drFullWave);
  const statRamp = ramp(wave, p.lateFrom, p.statFullWave);
  const baseDr = p.drMax * drRamp;
  const qualityDr = Math.min(
    p.qualityDrMax,
    Math.max(0, qualityScore) * p.qualityDrPerPoint,
  );
  const totalDr = 1 - (1 - baseDr) * (1 - qualityDr);
  return {
    hpMul: 1 + p.hpMax * statRamp,
    attackMul: 1 + p.attackMax * statRamp,
    armorAdd: p.armorMax * statRamp,
    baseDr,
    qualityDr,
    totalDr,
    damageTakenMul: 1 - totalDr,
    xpMul: 1 + p.xpMax * statRamp,
  };
}
