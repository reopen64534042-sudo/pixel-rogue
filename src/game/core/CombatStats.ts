import { critMultiplier } from "./DamageMath";
import type { CombatStatsSnapshot, Enemy, Player } from "./types";

/**
 * Combat Foundation S3-A 实体战斗属性适配层（任务书 §3-A）。
 *
 * Player/Enemy → 只读 CombatStatsSnapshot 的唯一出入口；快照不是另一个
 * 可变实体对象，每次结算按需构造。数值来源是实体上的可选字段（命名与
 * CombatStatsSnapshot 一致），S3-A 只做接线、默认全中性——既有实体不带
 * 这些键，行为与 S2 逐位一致；正式平衡数值待 S3-B 批准后引入来源。
 *
 * 依赖方向（§4）：实体 → 本适配层 → DamageRequest → DamageSystem（纯计算）
 * → CombatSystem（应用）。本模块不依赖 GameCore/DOM/Phaser、不掷随机数。
 */
export function getPlayerCombatStats(p: Player): CombatStatsSnapshot {
  return {
    // p.damage 是攻击基线（已含天赋强化，随 rawAmount 进管线），不是增伤乘区
    attack: p.damage,
    defense: p.defense ?? 0,
    critChance: p.crit,
    // 经 DamageMath 取有效值：含 #41 致命一击满层觉醒
    critMultiplier: critMultiplier(p),
    tough: p.tough,
    resistances: p.resistances ?? {},
    globalDamageBonus: p.globalDamageBonus ?? 0,
    typeDamageBonus: p.typeDamageBonus ?? {},
    formDamageBonus: p.formDamageBonus ?? {},
    skillDamageBonus: p.skillDamageBonus,
  };
}

export function getEnemyCombatStats(e?: Enemy): CombatStatsSnapshot {
  return {
    attack: e ? e.dmg : 0,
    defense: e?.defense ?? 0,
    // 敌人不暴击；作为攻击方时三个增伤乘区随发射/引爆时快照固化
    critChance: 0,
    critMultiplier: 1,
    tough: e?.tough ?? 0,
    resistances: e?.resistances ?? {},
    globalDamageBonus: e?.globalDamageBonus ?? 0,
    typeDamageBonus: e?.typeDamageBonus ?? {},
    formDamageBonus: e?.formDamageBonus ?? {},
    skillDamageBonus: e?.skillDamageBonus,
  };
}
