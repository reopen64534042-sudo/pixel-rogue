import { resolveKeyedMap } from "./StatKeyedMap";
import { resolveStats, type StatId, type StatSheet } from "./StatModel";
import type { EnemyConfig } from "./types";

/** 生成时一次性解析的防御属性；仅输出配置声明过的字段。 */
export interface EnemyDefenseStats {
  readonly defense?: number;
  readonly resistances?: Readonly<Record<string, number>>;
  readonly tough?: number;
}

/** 将配置声明的标量防御值放入 StatModel 的基础区，不物化缺省字段。 */
export function enemyDefenseSheet(cfg: EnemyConfig): StatSheet {
  const base: Partial<Record<StatId, number>> = {};
  if (cfg.defense !== undefined) base.defense = cfg.defense;
  if (cfg.tough !== undefined) base.tough = cfg.tough;
  return { base, modifiers: [] };
}

function requireNonNegative(value: number, field: string): void {
  if (value < 0) {
    throw new RangeError(`${field} 不能为负，收到 ${value}`);
  }
}

function requireFiniteResistanceMap(
  value: unknown,
): asserts value is NonNullable<EnemyConfig["resistances"]> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError("EnemyConfig.resistances 必须是数值映射");
  }
  for (const [key, resistance] of Object.entries(
    value as Readonly<Record<string, unknown>>,
  )) {
    if (typeof resistance !== "number" || !Number.isFinite(resistance)) {
      throw new TypeError(
        `EnemyConfig.resistances[${JSON.stringify(key)}] 必须为有限数字，收到 ${String(resistance)}`,
      );
    }
  }
}

/**
 * EnemyConfig → StatModel 的唯一防御侧权威出口。
 * 映射按通用 resistance 族逐 key 解析；数值只验证非负，不做上限裁剪。
 */
export function resolveEnemyDefense(
  cfg: EnemyConfig,
): EnemyDefenseStats {
  const resolved = resolveStats(enemyDefenseSheet(cfg));
  const out: {
    defense?: number;
    resistances?: Readonly<Record<string, number>>;
    tough?: number;
  } = {};

  if (cfg.defense !== undefined) {
    const defense = resolved.defense;
    if (defense === undefined) {
      throw new TypeError("EnemyStatSources: defense 声明后未得到解析值");
    }
    requireNonNegative(defense, "EnemyConfig.defense");
    out.defense = defense;
  }

  if (cfg.resistances !== undefined) {
    const resistanceSource: unknown = cfg.resistances;
    // 通用映射解析器会把缺省 key 置为 0；先校验显式值，避免非法值被中性化。
    requireFiniteResistanceMap(resistanceSource);
    const resistances = resolveKeyedMap("resistance", resistanceSource, []);
    for (const [key, value] of Object.entries(resistances)) {
      requireNonNegative(value, `EnemyConfig.resistances.${key}`);
    }
    out.resistances = resistances;
  }

  if (cfg.tough !== undefined) {
    const tough = resolved.tough;
    if (tough === undefined) {
      throw new TypeError("EnemyStatSources: tough 声明后未得到解析值");
    }
    requireNonNegative(tough, "EnemyConfig.tough");
    out.tough = tough;
  }

  return out;
}
