import { BOSS } from "../data/boss";
import { BOSS_DAMAGE } from "../data/combatBalance";
import { ELITE_XP_STEP } from "../data/constants";
import type { DamageTypeId } from "../data/damageTypes";
import type { LaserLane } from "../data/laser";
import type { Player } from "./types";
import { LASER_DAMAGE as LD, MISSILE_DAMAGE as MD } from "../data/combatBalance";
import { COMBAT_BALANCE as CB } from "../data/combatBalance";

/**
 * DamageMath —— 伤害数值的纯函数计算层（S1 DamageSystem 的前身适配层）。
 *
 * 对齐 docs/pixel-rogue-combat-foundation-v1.md 设计原则 5：
 * - 纯函数：不引用 GameCore / Phaser / DOM，不产生随机数，不修改 HP（副作用归 CombatSystem 编排）。
 * - 系数全部来自 data/combatBalance.ts；S1 的 DamageSystem 落地时，
 *   本文件的函数将被 DamageSystem 的 DamageRequest 管线逐一吸收，调用点保持稳定。
 * - 天赋卡 pv/cur 与本文件共享公式，避免展示与结算漂移。
 *
 * 由 Issue #38-#45 平衡批次引入（用户已批准）。
 */

/** 魔弹：基础伤害 × 魔弹特化倍率（Issue #25；规范 §3.1 保留现有嵌入） */
export function boltDamage(p: Pick<Player, "damage" | "boltDmgMul">) {
  return p.damage * p.boltDmgMul;
}

/** 射手强化弹：基础魔弹伤害 × 当前等级倍率 */
export function chargedShotDamage(base: number, mul: number) {
  return base * mul;
}

/** 暴击倍率：含致命一击满层觉醒（Issue #41） */
export function critMultiplier(p: Pick<Player, "critMul" | "upCounts">) {
  return (
    p.critMul +
    ((p.upCounts["致命一击"] || 0) >= CB.critMaxLevel
      ? CB.critAwakeningCritMulBonus
      : 0)
  );
}

/** 陨星单发伤害（Issue #45 重做：×3 基础系数） */
export function meteorDamage(p: Pick<Player, "damage" | "meteor">) {
  return p.damage * CB.meteorBase + p.meteor * CB.meteorPerLevel;
}

/** 护盾破碎反震（Issue #43）；碎盾反震传入自己的 250% 系数。 */
export function shieldShockDamage(
  p: Pick<Player, "damage">,
  mul = CB.shieldShock,
) {
  return p.damage * mul;
}

/** 灼烧：每层 DPS = 全局伤害 × 10%（Issue #42 叠层制） */
export function burnStackDps(p: Pick<Player, "damage">, stacks: number) {
  return stacks * p.damage * CB.burnDpsPerStack;
}

/** 灼热易伤：灼烧目标受伤倍率（Issue #42，用户授权的规范扩展） */
export function scorchVulnMultiplier(p: Pick<Player, "scorchVuln">) {
  return 1 + p.scorchVuln;
}

/** 焦土燃烧：燃烧地带每秒伤害（Issue #45） */
export function burnGroundDps(p: Pick<Player, "damage">) {
  return p.damage * CB.burnGroundDps;
}

/** 冰冻时长：0.4 + 0.2 × 冰霜等级（Issue #38 重做） */
export function frostFreezeDuration(p: Pick<Player, "frostLv">) {
  return CB.frostFreezeBase + CB.frostFreezePerLevel * p.frostLv;
}

/** 多弹道动态散布：near = 目标检测半径内敌人数（Issue #36） */
export function multishotSpread(near: number) {
  return (
    CB.spreadMin +
    (CB.spreadMax - CB.spreadMin) *
      Math.min(1, (near - 1) / CB.spreadRampTargets)
  );
}

/** 激光输出速率：战斗与属性面板共用，临时狂热 / 战意在这里计入。 */
export function laserOutputRate(p: Pick<Player, "fireRate" | "haste" | "rageT" | "rageLv">) {
  return p.fireRate * (1 + p.haste * 0.1 + (p.rageT > 0 ? 0.2 * p.rageLv : 0));
}

/** 激光攻速只缩放 DPS；不缩放结算/暴击/命中特效的时间窗。 */
export function laserDps(p: Pick<Player, "damage" | "boltDmgMul" | "fireRate" | "haste" | "rageT" | "rageLv">, level: number) {
  const rate = laserOutputRate(p);
  return boltDamage(p) * rate * LD.dpsPerAttack * (1 + (level - 1) * LD.dpsPerLevel);
}

export function laserFocusMultiplier(focus: number) {
  return 1 + Math.max(0, Math.min(1, focus)) * LD.focusBonus;
}

export function laserPierceRetention(lens: boolean, polar: boolean) {
  return Math.min(LD.maxPierce, (lens ? LD.lensPierce : LD.pierce) + (polar ? LD.polarBonus : 0));
}

export function laserPierceMultiplier(retention: number, targetIndex: number) {
  return retention ** Math.max(0, targetIndex);
}

export function laserExposureDamage(dps: number, seconds: number, falloff = 1, focus = 1) {
  return dps * seconds * falloff * focus;
}

export function laserLaneDamage(damage: number, lane: LaserLane) {
  return lane === 0 ? damage : damage * LD.tripleSideMul;
}

export function laserAuxDps(dps: number, kind: "afterglow" | "echo") {
  return dps * (kind === "afterglow" ? LD.afterglowDps : LD.echoDps);
}

export function laserPulseDamage(p: Pick<Player, "damage" | "boltDmgMul">, meltdown: boolean, collapse: boolean) {
  return boltDamage(p) * ((meltdown ? LD.meltdown : 0) + (collapse ? LD.collapse : 0));
}

export function laserEscapeDamage(p: Pick<Player, "damage" | "boltDmgMul">) {
  return boltDamage(p) * LD.escape;
}

export function laserIncomingDamage(damage: number) {
  return damage * LD.rechargeDefense;
}

export function missileBaseDamage(p: Pick<Player, "damage" | "boltDmgMul">, level: number, liner: boolean) {
  return boltDamage(p) * MD.base * (1 + (level - 1) * MD.perLevel) * (liner ? MD.liner : 1);
}
export function missileBlastDamage(base: number, fraction: number, distance: number, radius: number,
  pressure: boolean, beacon: boolean, direct = false) {
  const falloff = direct ? 1 : 1 - MD.edgeLoss * Math.max(0, Math.min(1, distance / radius));
  return base * fraction * (pressure ? MD.pressure : 1) * (beacon ? MD.beacon : 1) * falloff;
}
export const missileDecodeDamage = (base: number) => base * MD.decode;
export const missileArcDamage = (base: number, relay: boolean) => base * MD.arc * (relay ? MD.relay : 1);
export const missileResonanceDamage = (base: number) => base * MD.resonance;
export const missileBurnDps = (base: number) => base * MD.burn;
export const missileDotAmount = (dps: number, seconds: number) => dps * seconds;
export const missileHealing = (loss: number, lifesteal: number) => loss * lifesteal * MD.lifesteal;
export const missileIncomingDamage = (damage: number) => damage * MD.armor;

/**
 * 第二元素的进攻增伤倍率。
 *
 * 反应伤害仍以触发元素走统一受击管线（抗性/克制方向由触发元素决定）；
 * 该倍率把配对的另一元素的 typeDamageBonus 也计入，避免“双元素反应只吃
 * 单一元素加成”。globalDamageBonus 仍由 hurtEnemy 只乘一次。
 */
export function typeBonusMultiplier(
  bonus: Partial<Record<DamageTypeId, number>> | undefined,
  type: DamageTypeId,
): number {
  return 1 + (bonus?.[type] ?? 0);
}
/** All overlapping grounds have the same defender/fire mitigation; compare offensive power only. */
export function missileGroundPower(dps: number, stats: import("./types").CombatStatsSnapshot) {
  const fire = Object.hasOwn(stats.typeDamageBonus, "fire") ? stats.typeDamageBonus.fire ?? 0 : 0;
  const ranged = Object.hasOwn(stats.formDamageBonus, "ranged") ? stats.formDamageBonus.ranged ?? 0 : 0;
  return dps * (1 + stats.globalDamageBonus) * (1 + fire) * (1 + ranged);
}

/** Boss 技能只在纯计算层形成 rawAmount；调用方仍走统一受击管线。 */
export function bossAttackDamage(attack: number, move: keyof typeof BOSS_DAMAGE): number {
  return attack * BOSS_DAMAGE[move];
}
export function bossRewardXp(wave: number, xpMul: number): number {
  return Math.round((25 + (wave - 1) * ELITE_XP_STEP) * BOSS.reward.xpMul * xpMul);
}

/** 地面伤害按固定 tick 积分；冰面首版只减速。 */
export function bossGroundTickDamage(attack: number, kind: "fire" | "frost"): number {
  return bossAttackDamage(attack, kind === "fire" ? "fireGround" : "frostGround") * BOSS.hazard.tick;
}
