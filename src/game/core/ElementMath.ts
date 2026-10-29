import { MAGE_BALANCE as MB } from "../data/mageBalance";
import type { DamageTypeId } from "../data/damageTypes";
import type { Enemy } from "./types";

/**
 * 法师元素印记的**纯计算层**。
 *
 * 为什么单独拆一个模块：`CombatSystem.hurtEnemy` 需要读「受击方身上的
 * 元素状态」来算增伤（对带凝冰目标的元素伤害 +8%、冻结目标 +10%、超导 +15%），
 * 而元素状态的**写入**在 ElementSystem 里，后者又依赖 CombatSystem 的
 * hurtEnemy —— 直接互相 import 会形成运行时循环。
 *
 * 拆法：把「读状态 + 算倍率」放进本模块（无副作用、不 import CombatSystem），
 * CombatSystem 只 import 本模块，ElementSystem 才 import CombatSystem。
 * 依赖方向是单向的：CombatSystem → ElementMath ← ElementSystem → CombatSystem。
 */

/** 灼烧层数。 */
export function fireLayers(e: Enemy): number {
  return e.elemFire?.length ?? 0;
}

/** 凝冰层数。 */
export function frostLayers(e: Enemy): number {
  return e.elemFrost?.length ?? 0;
}

/** 凝冰造成的减速比例（层数 × 每层系数，上限 100%）。 */
export function frostSlowFactor(e: Enemy): number {
  return Math.min(1, frostLayers(e) * MB.frostSlowPerStack);
}

/** 是否处于法师冻结（凝冰满层）。与旧表的 frozenT 是两套独立状态。 */
export function isFrozen(e: Enemy): boolean {
  return (e.elemFrozenT ?? 0) > 0;
}

/** 是否处于麻痹。 */
export function isParalyzed(e: Enemy): boolean {
  return (e.elemParaT ?? 0) > 0;
}

/** 是否处于超导（冰+雷反应）。 */
export function isSuperconducting(e: Enemy): boolean {
  return (e.elemSuperT ?? 0) > 0;
}

/** 元素伤害类型（火/冰/雷）。物理与真实伤害不吃元素加成。 */
function isElemental(type: DamageTypeId): boolean {
  return type === "fire" || type === "frost" || type === "lightning";
}

/**
 * 受击方条件加成（倍率）。
 *
 * 三条来源都挂在**受击方的元素状态**上，因此放在伤害结算的编排层
 * （hurtEnemy）乘进 rawAmount，与既有的「灼热易伤」「标记层数」同一位置。
 *
 * - 冻结目标受**任意**伤害 +10%（frozenVuln）
 * - 对携带凝冰的目标，**元素**伤害 +8%（frostElementBonus）
 * - 陷入超导的敌人受到**雷电**伤害 +15%（superChainVuln）
 */
export function elementDamageMultiplier(
  e: Enemy,
  type: DamageTypeId,
): number {
  let mul = 1;
  if (isFrozen(e)) mul *= 1 + MB.frozenVuln;
  if (frostLayers(e) > 0 && isElemental(type))
    mul *= 1 + MB.frostElementBonus;
  if (isSuperconducting(e) && type === "lightning")
    mul *= 1 + MB.superChainVuln;
  return mul;
}

/**
 * 闪电链伤害的额外倍率（麻痹目标受闪电链伤害 +10%）。
 *
 * 单独成函数而不是并进 elementDamageMultiplier：这一条按**攻击来源**判定
 * （只有闪电链伤害才算），而上面的三条按受击方状态判定。
 */
export function chainVsParalyzedMultiplier(e: Enemy): number {
  return isParalyzed(e) ? 1 + MB.paraChainVuln : 1;
}
