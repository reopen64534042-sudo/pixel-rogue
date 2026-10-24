import type { Player } from "./types";
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

/** 护盾破碎反震（Issue #43） */
export function shieldShockDamage(p: Pick<Player, "damage">) {
  return p.damage * CB.shieldShock;
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
