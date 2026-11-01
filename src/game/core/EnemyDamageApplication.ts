import { DAMAGE_TYPES } from "../data/damageTypes";
import type { DamageTypeId } from "../data/damageTypes";
import { bossDamageTakenMultiplier, bossInvulnerable, syncBossPhase } from "./BossSystem";
import { getEnemyCombatStats, getPlayerCombatStats } from "./CombatStats";
import { enemyDotTakenDamage, enemyHitTakenDamage } from "./DamageMath";
import { calculateDamage } from "./DamageSystem";
import type { GameCore } from "./GameCore";
import type { AttackForm, CombatStatsSnapshot, DamageResult, DamageSource, Enemy } from "./types";

/** HP 只在这里扣除；调用方在原有副作用时点同步 Boss 阶段、处理死亡。 */
export function applyEnemyHpDamage(enemy: Enemy, damage: number): number {
  const hpBefore = enemy.hp;
  enemy.hp -= damage;
  return hpBefore;
}

/** 主命中（含多分量/连续武器）的最终承伤层，不触发副作用或扣血。 */
export function resolveEnemyHitDamage(
  core: GameCore,
  enemy: Enemy,
  damage: number,
  trueDamage: number,
  continuous: boolean,
): { settledDamage: number; trueDamage: number } {
  return enemyHitTakenDamage(damage, trueDamage, enemy.damageTakenMul ?? 1,
    bossDamageTakenMultiplier(core, enemy), continuous);
}

export interface EnemyDotOptions {
  readonly type: DamageTypeId;
  readonly form: AttackForm;
  readonly src: DamageSource;
  readonly skillId?: string;
  readonly attackerStats?: Readonly<CombatStatsSnapshot>;
}

/**
 * 无命中触发的 DoT 公共入口：纯计算→无敌/最终倍率→HP→Boss同步→记账。
 * 不暴击、不取整、不吸血、不制造飘字；死亡留在原调用侧，killed 恒为 false。
 * 保留旧路径“先校验计算，再将转阶段伤害归零”的次序。
 */
export function applyEnemyDotDamage(
  core: GameCore,
  enemy: Enemy,
  rawAmount: number,
  opts: EnemyDotOptions,
): DamageResult {
  const calc = calculateDamage(DAMAGE_TYPES, {
    rawAmount,
    type: opts.type,
    form: opts.form,
    origin: opts.src,
    skillId: opts.skillId,
    kind: "dot",
    precision: "preserve-float",
    isCritical: false,
    attackerStats: opts.attackerStats ?? getPlayerCombatStats(core.player),
    defenderStats: getEnemyCombatStats(enemy),
  });
  const taken = bossInvulnerable(core, enemy) ? 0 : enemyDotTakenDamage(
    calc.settledDamage, enemy.damageTakenMul ?? 1, bossDamageTakenMultiplier(core, enemy),
  );
  const hpBefore = applyEnemyHpDamage(enemy, taken);
  syncBossPhase(core, enemy);
  core.dmgBy[opts.src] = (core.dmgBy[opts.src] ?? 0) + taken;
  return {
    ...calc,
    settledDamage: taken,
    effectiveHpLoss: Math.min(hpBefore, taken),
    dodged: false,
    shieldUsed: "none",
    lethal: enemy.hp <= 0,
    killed: false,
    preventedDeath: false,
  };
}
