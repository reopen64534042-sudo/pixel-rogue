/**
 * Combat Foundation S4-B：只读 shadow 属性构建器（未接入运行时）。
 *
 * 目的（任务书 §4-S4-B）：在不替换任何权威读取路径的前提下，证明
 * StatModel 解析结果与现有 CombatStats 快照逐位一致。旧快照
 * （getPlayerCombatStats/getEnemyCombatStats）始终是唯一权威出口，
 * 本模块只构建、只比较、不结算。
 *
 * 两种独立输入来源（评审定基线，防止「同一值包装两次」的假对照）：
 * - 来源 A（实体值构造）：从 Player/Enemy 当前字段打包，确认解析管线
 *   对既有值的接口兼容（空修饰符恒等穿过）。
 * - 来源 B（独立推导）：玩家侧从 picks 序列按来源表翻译修饰符，敌人侧
 *   从 EnemyConfig 复刻 spawnEnemy 的条件展开规则——与 talent.f、
 *   实体字段、spawner 无引用关系，漂移由对照测试暴露。
 *
 * 类型化映射（typeDamageBonus/resistances）保持类型化结构（评审定基线）：
 * 逐 key 构造以通用族为槽位的子属性表走 resolveStats（StatModel S4-B
 * 加性扩展 KEYED_STAT_FAMILIES），类型名永远只作为 key 存在。
 *
 * 纯函数：不改写任何输入、无持久缓存、无副作用。通用解析与键控类型由
 * StatKeyedMap 独立拥有，本模块保留历史重导出兼容；运行时不再从 shadow
 * 模块导入。本模块的 shadow 构建器仍是独立重述的对照侧，不参与结算。
 */
import { COMBAT_BALANCE } from "../data/combatBalance";
import type { DamageTypeId } from "../data/damageTypes";
import { statBase } from "../data/stats";
import { critMultiplier } from "./DamageMath";
import { resolveKeyedMap } from "./StatKeyedMap";
import {
  resolveStats,
  type StatModifier,
} from "./StatModel";
import type { TypeDamageBonusModifier } from "./StatKeyedMap";
import type { Enemy, EnemyConfig, Player } from "./types";

export { resolveKeyedMap } from "./StatKeyedMap";

/** 保留历史导出兼容；运行时通用类型由 StatKeyedMap 拥有。 */
export type { KeyedModifier, TypeDamageBonusModifier, ResistanceModifier } from "./StatKeyedMap";

/** shadow 首批字段（评审定基线：DEF/tough/暴击率暴伤/火雷增伤；不含 attack/maxHp） */
export interface PlayerShadowStats {
  defense: number;
  tough: number;
  critChance: number;
  critMultiplier: number;
  typeDamageBonus: Partial<Record<DamageTypeId, number>>;
}

interface ScalarShadowBase {
  defense?: number;
  tough?: number;
  critChance?: number;
  critMultiplier?: number;
}

/** 共同解析路径：标量走 resolveStats（flat/percent/final 全语义），映射逐 key */
function resolvePlayerShadow(
  scalarBase: ScalarShadowBase,
  scalarMods: readonly StatModifier[],
  tdbBase: Readonly<Partial<Record<DamageTypeId, number>>>,
  tdbMods: readonly TypeDamageBonusModifier[],
): PlayerShadowStats {
  const scalars = resolveStats({ base: scalarBase, modifiers: scalarMods });
  return {
    defense: scalars.defense ?? 0,
    tough: scalars.tough ?? 0,
    critChance: scalars.critChance ?? 0,
    critMultiplier: scalars.critMultiplier ?? 0,
    typeDamageBonus: resolveKeyedMap("typeDamageBonus", tdbBase, tdbMods),
  };
}

/** 来源 A（玩家）：实体当前值打包，空修饰符恒等穿过解析管线 */
export function playerShadowFromEntity(p: Player): PlayerShadowStats {
  return resolvePlayerShadow(
    {
      defense: p.defense ?? 0,
      tough: p.tough,
      critChance: p.crit,
      critMultiplier: critMultiplier(p),
    },
    [],
    { ...p.typeDamageBonus },
    [],
  );
}

/**
 * 来源 B（玩家）来源表——值逐字对照 data/talents.ts 与 data/stats.ts，
 * **不引用** talent.f：权威实现的漂移由 shadow 对照测试暴露，这里故意
 * 独立声明（对照的成立本身就是对两侧一致性的验证）。
 * 范围：磐石/铁布衫/致命一击（含觉醒）/元素亲和；范围外的 pick 忽略。
 */
export function playerShadowFromPicks(
  picks: readonly string[],
): PlayerShadowStats {
  const base = statBase();
  const scalars: StatModifier[] = [];
  const tdb: TypeDamageBonusModifier[] = [];
  let critPicks = 0;
  for (const name of picks) {
    switch (name) {
      case "磐石": // data/talents.ts：defense +15/级（增量 f）
        scalars.push({
          sourceId: "天赋:磐石",
          stat: "defense",
          stage: "flat",
          value: 15,
        });
        break;
      case "铁布衫": // data/talents.ts：tough +0.1/级（max 4；0.6 上限在消费点）
        scalars.push({
          sourceId: "天赋:铁布衫",
          stat: "tough",
          stage: "flat",
          value: 0.1,
        });
        break;
      case "致命一击": // data/talents.ts：crit +0.1/级（max 8）
        critPicks += 1;
        scalars.push({
          sourceId: "天赋:致命一击",
          stat: "critChance",
          stage: "flat",
          value: 0.1,
        });
        break;
      case "会心深渊": // data/talents.ts：critMul +0.5/级（max 4；0.5 可精确表示）
        scalars.push({
          sourceId: "天赋:会心深渊",
          stat: "critMultiplier",
          stage: "flat",
          value: 0.5,
        });
        break;
      case "元素亲和": // data/talents.ts：火/雷 typeDamageBonus +0.1/级（增量 f）
        tdb.push(
          {
            sourceId: "天赋:元素亲和",
            stat: "typeDamageBonus",
            stage: "flat",
            value: 0.1,
            key: "fire",
          },
          {
            sourceId: "天赋:元素亲和",
            stat: "typeDamageBonus",
            stage: "flat",
            value: 0.1,
            key: "lightning",
          },
        );
        break;
      default: // shadow 范围外的天赋不进属性表
        break;
    }
  }
  // 觉醒（combatBalance.critMaxLevel=8）：暴伤 +critAwakeningCritMulBonus（一次性）
  if (critPicks >= COMBAT_BALANCE.critMaxLevel) {
    scalars.push({
      sourceId: "天赋:致命一击·觉醒",
      stat: "critMultiplier",
      stage: "flat",
      value: COMBAT_BALANCE.critAwakeningCritMulBonus,
    });
  }
  return resolvePlayerShadow(
    { critChance: base.crit, critMultiplier: base.critMul },
    scalars,
    {},
    tdb,
  );
}

/** 敌人 shadow 首批字段：护甲、抗性映射与 tough（均不随波次/精英缩放） */
export interface EnemyShadowStats {
  defense: number;
  resistances: Partial<Record<DamageTypeId, number>>;
  tough: number;
}

/**
 * 键控抗性影子的负值处理：StatModel 的 base 必须 ≥ 0，负抗性（弱点）
 * 用 flat 负修饰符表达，与权威解析路径一致。
 */
function resistanceShadow(
  source: Readonly<Record<string, number>> | undefined,
): Record<string, number> {
  const base: Record<string, number> = {};
  const mods: (StatModifier & { stat: "resistance"; key: string })[] = [];
  for (const [key, value] of Object.entries(source ?? {})) {
    if (value < 0) {
      base[key] = 0;
      mods.push({
        sourceId: "enemy-shadow",
        stat: "resistance",
        key,
        stage: "flat",
        value,
      });
    } else {
      base[key] = value;
    }
  }
  return resolveKeyedMap("resistance", base, mods);
}

/** 来源 A（敌人）：实体当前值打包 */
export function enemyShadowFromEntity(
  e: Pick<Enemy, "defense" | "resistances" | "tough">,
): EnemyShadowStats {
  return {
    defense:
      resolveStats({ base: { defense: e.defense ?? 0 }, modifiers: [] })
        .defense ?? 0,
    resistances: resistanceShadow(e.resistances),
    tough:
      resolveStats({ base: { tough: e.tough ?? 0 }, modifiers: [] }).tough ?? 0,
  };
}

/**
 * 来源 B（敌人）：从 EnemyConfig 复刻 spawnEnemy 的条件展开规则
 * （core/EnemySystem.ts：仅当配置声明 defense/resistances 时写入实体）。
 * 与 spawner 无引用关系；精英倍率只作用 hp/dmg，本影子范围不含。
 */
export function enemyShadowFromConfig(cfg: EnemyConfig): EnemyShadowStats {
  return {
    defense:
      resolveStats({ base: { defense: cfg.defense ?? 0 }, modifiers: [] })
        .defense ?? 0,
    resistances: resistanceShadow(cfg.resistances),
    tough:
      resolveStats({ base: { tough: cfg.tough ?? 0 }, modifiers: [] }).tough ??
      0,
  };
}
