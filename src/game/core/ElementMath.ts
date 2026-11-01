import { ELEMENTAL_MAGE } from "../data/elementalMage";
import type { Enemy } from "./types";

/**
 * 元素法师状态的**纯计算层**。
 *
 * 依赖方向：CombatSystem / EnemySystem / MeleeSystem → ElementMath ←
 * ElementSystem → CombatSystem。这里不写状态、不 import 战斗系统，
 * 只回答「目标身上现在有什么、倍率是多少」。
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
  return Math.min(1, frostLayers(e) * ELEMENTAL_MAGE.frost.slowPerStack);
}

/** 是否处于冻结（凝冰满 3 层）。 */
export function isFrozen(e: Enemy): boolean {
  return (e.elemFrozenT ?? 0) > 0;
}

/** 是否处于麻痹。 */
export function isParalyzed(e: Enemy): boolean {
  return (e.elemParaT ?? 0) > 0;
}

/** 是否带有雷印。 */
export function isShocked(e: Enemy): boolean {
  return (e.elemShockT ?? 0) > 0;
}

/** 是否处于脆化。 */
export function isBrittle(e: Enemy): boolean {
  return (e.elemBrittleT ?? 0) > 0;
}

/** 是否处于霜牢。 */
export function isFrostLocked(e: Enemy): boolean {
  return (e.elemFrostLockT ?? 0) > 0;
}

/** 脆化只提高**元素反应**伤害，不影响直伤/DoT。 */
export function reactionDamageMultiplier(e: Enemy): number {
  return isBrittle(e) ? 1 + ELEMENTAL_MAGE.brittle.reactionBonus : 1;
}

/**
 * 霜牢受击延长：直接伤害 +0.4 秒，总时长最多 4.5 秒，
 * 0.2 秒内最多延长一次。由 CombatSystem 在结算直接伤害后调用。
 */
export function extendFrostLock(e: Enemy, now: number): void {
  if (!isFrostLocked(e)) return;
  const total = e.elemFrostLockTotal ?? ELEMENTAL_MAGE.frostLock.duration;
  if (total >= ELEMENTAL_MAGE.frostLock.maxDuration) return;
  const last = e.elemFrostLockExtendAt;
  if (last !== undefined && now - last < ELEMENTAL_MAGE.frostLock.extendIcd)
    return;
  const add = Math.min(
    ELEMENTAL_MAGE.frostLock.extend,
    ELEMENTAL_MAGE.frostLock.maxDuration - total,
  );
  e.elemFrostLockT = (e.elemFrostLockT ?? 0) + add;
  e.elemFrostLockTotal = total + add;
  e.elemFrostLockExtendAt = now;
}
