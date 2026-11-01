import { BOSS_HP_GROWTH } from "../data/boss";
import { resolveKeyedMap } from "./StatKeyedMap";
import { resolveStats, type KeyedStatFamily, type StatId, type StatModifier, type StatSheet } from "./StatModel";
import type { DamageTypeId } from "../data/damageTypes";
import type { AttackForm, EnemyConfig } from "./types";

export interface EnemyAttackBonusStats {
  readonly globalDamageBonus?: number;
  readonly typeDamageBonus?: Readonly<Partial<Record<DamageTypeId, number>>>;
  readonly formDamageBonus?: Readonly<Partial<Record<AttackForm, number>>>;
  readonly skillDamageBonus?: Readonly<Record<string, number>>;
}

function bonusValue(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new TypeError(`${field} 必须为有限数字`);
  }
  return value;
}

function bonusSheet(stat: StatId, value: number): StatSheet {
  return value < 0
    ? { base: { [stat]: 0 }, modifiers: [{ sourceId: "enemy-config", stat, stage: "flat", value }] }
    : { base: { [stat]: value }, modifiers: [] };
}

function resolveBonusMap(family: KeyedStatFamily, source: unknown): Record<string, number> {
  if (source === null || typeof source !== "object" || Array.isArray(source)) {
    throw new TypeError(`EnemyConfig.${family} 必须是数值映射`);
  }
  const base: Record<string, number> = {};
  const mods: (StatModifier & { stat: KeyedStatFamily; key: string })[] = [];
  const symbols: [symbol, number][] = [];
  for (const key of Reflect.ownKeys(source)) {
    if (!Object.prototype.propertyIsEnumerable.call(source, key)) continue;
    if (key === "__proto__") throw new TypeError('类型化映射不允许危险原型键 "__proto__"');
    const value = bonusValue(Reflect.get(source, key), `EnemyConfig.${family}[${String(key)}]`);
    if (typeof key === "symbol") {
      symbols.push([key, value]);
    } else if (value < 0) {
      Object.defineProperty(base, key, { value: 0, enumerable: true, configurable: true, writable: true });
      mods.push({ sourceId: "enemy-config", stat: family, key, stage: "flat", value });
    } else {
      Object.defineProperty(base, key, { value, enumerable: true, configurable: true, writable: true });
    }
  }
  const result = resolveKeyedMap(family, base, mods);
  for (const [key, value] of symbols) {
    const resolved = resolveStats(bonusSheet(family, value))[family];
    if (resolved === undefined) throw new TypeError(`EnemyConfig.${family} 解析不完整`);
    Object.defineProperty(result, key, { value: resolved, enumerable: true, configurable: true, writable: true });
  }
  return result;
}

/** 在生成时依次解析四个独立攻击乘区；不执行消费点的范围检查。 */
export function resolveEnemyAttackBonuses(cfg: EnemyConfig): EnemyAttackBonusStats {
  const out: {
    globalDamageBonus?: number;
    typeDamageBonus?: Readonly<Partial<Record<DamageTypeId, number>>>;
    formDamageBonus?: Readonly<Partial<Record<AttackForm, number>>>;
    skillDamageBonus?: Readonly<Record<string, number>>;
  } = {};
  const global = cfg.globalDamageBonus;
  if (global !== undefined) {
    const value = bonusValue(global, "EnemyConfig.globalDamageBonus");
    const resolved = resolveStats(bonusSheet("globalDamageBonus", value)).globalDamageBonus;
    if (resolved === undefined) throw new TypeError("EnemyConfig.globalDamageBonus 解析不完整");
    out.globalDamageBonus = resolved;
  }
  const type = cfg.typeDamageBonus;
  if (type !== undefined) out.typeDamageBonus = resolveBonusMap("typeDamageBonus", type);
  const form = cfg.formDamageBonus;
  if (form !== undefined) out.formDamageBonus = resolveBonusMap("formDamageBonus", form);
  const skill = cfg.skillDamageBonus;
  if (skill !== undefined) out.skillDamageBonus = resolveBonusMap("skillDamageBonus", skill);
  return out;
}

export interface EnemySpawnContext {
  readonly wave: number;
  readonly elite: boolean;
  readonly speedJitter: number;
  /** 首领后期生命使用独立成长，普通敌人不传此标记。 */
  readonly boss?: boolean;
  /** 动态难度：生命最终倍率（省略 = 1） */
  readonly hpMul?: number;
  /** 动态难度：攻击最终倍率（省略 = 1） */
  readonly attackMul?: number;
}

export interface EnemySpawnStats {
  readonly maxHp: number;
  readonly attack: number;
  readonly moveSpeed: number;
}

/**
 * 生成时解析一次；倍率顺序与旧表达式的左结合顺序一致。
 *
 * v46：移除 `lvlPow`（`docs/damage-rework-coordination-v1.md` §4-A 已定）。
 * 等级不再参与怪物生命成长，避免「拾取效率反向决定难度」；怪物成长由 `hpScale` 独占。
 * 等级仍影响属性稀有度（`AttributeSystem.rarityChances`）与 HUD。
 */
export function resolveEnemySpawnStats(
  cfg: EnemyConfig,
  ctx: EnemySpawnContext,
): EnemySpawnStats {
  const over = Math.max(0, ctx.wave - 15);
  const hpScale = 1 + (ctx.wave - 1) * 0.18 + over * over * 0.06;
  const dmgScale = 1 + (ctx.wave - 1) * 0.055 + over * over * 0.012;
  const bossHpStep = ctx.boss && ctx.wave >= BOSS_HP_GROWTH.fromWave
    ? Math.floor((ctx.wave - BOSS_HP_GROWTH.fromWave) / BOSS_HP_GROWTH.everyWaves)
    : null;
  const result = resolveStats({
    base: { maxHp: bossHpStep === null ? cfg.hp : BOSS_HP_GROWTH.baseHp, attack: cfg.dmg, moveSpeed: cfg.speed },
    modifiers: [
      { sourceId: "wave", stat: "maxHp", stage: "final", value: bossHpStep === null ? hpScale : BOSS_HP_GROWTH.multiplier ** bossHpStep },
      // 2026-10-30 平衡回调：精英生命倍率 ×5，攻击保持 ×1.6。
      { sourceId: "elite", stat: "maxHp", stage: "final", value: ctx.elite ? 5 : 1 },
      { sourceId: "wave", stat: "attack", stage: "final", value: dmgScale },
      { sourceId: "elite", stat: "attack", stage: "final", value: ctx.elite ? 1.6 : 1 },
      // W20+ Boss 实际 HP 必须逐次翻倍，不能再叠加射手额外生命倍率。
      { sourceId: "difficulty", stat: "maxHp", stage: "final", value: bossHpStep === null ? ctx.hpMul ?? 1 : 1 },
      { sourceId: "difficulty", stat: "attack", stage: "final", value: ctx.attackMul ?? 1 },
      { sourceId: "elite", stat: "moveSpeed", stage: "final", value: ctx.elite ? 0.8 : 1 },
      { sourceId: "jitter", stat: "moveSpeed", stage: "final", value: ctx.speedJitter },
    ],
  });
  const { maxHp, attack, moveSpeed } = result;
  if (maxHp === undefined || attack === undefined || moveSpeed === undefined) {
    throw new TypeError("EnemyStatSources: 生成属性解析不完整");
  }
  return { maxHp, attack, moveSpeed };
}

/** 生成时一次性解析的防御属性；仅输出配置声明过的字段。 */
export interface EnemyDefenseStats {
  readonly defense?: number;
  readonly resistances?: Readonly<Record<string, number>>;
  readonly tough?: number;
}

/** 将配置声明的标量防御值放入 StatModel 的基础区，不物化缺省字段。 */
export function enemyDefenseSheet(cfg: EnemyConfig, wave = 1, extraDefense = 0): StatSheet {
  const base: Partial<Record<StatId, number>> = {};
  if (cfg.defense !== undefined) base.defense = cfg.defense;
  else if (extraDefense > 0) base.defense = 0;
  if (cfg.tough !== undefined) base.tough = cfg.tough;
  const modifiers: StatModifier[] = [];
  if (cfg.defense !== undefined) {
    modifiers.push({
      sourceId: "wave-defense",
      stat: "defense",
      stage: "flat",
      value: Math.min(24, Math.max(0, wave - 8) * 1.2),
    });
  }
  if (extraDefense > 0) {
    modifiers.push({
      sourceId: "difficulty",
      stat: "defense",
      stage: "flat",
      value: extraDefense,
    });
  }
  return { base, modifiers };
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
 * 映射按通用 resistance 族逐 key 解析；负值作为弱点，用 flat 负修饰符表达
 * （StatModel 契约要求 base ≥ 0，负增益走 flat）。
 */
export function resolveEnemyDefense(
  cfg: EnemyConfig,
  wave = 1,
  extraDefense = 0,
): EnemyDefenseStats {
  const resolved = resolveStats(enemyDefenseSheet(cfg, wave, extraDefense));
  const out: {
    defense?: number;
    resistances?: Readonly<Record<string, number>>;
    tough?: number;
  } = {};

  if (cfg.defense !== undefined || extraDefense > 0) {
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
    const base: Record<string, number> = {};
    const mods: (StatModifier & { stat: "resistance"; key: string })[] = [];
    for (const [key, value] of Object.entries(resistanceSource)) {
      // StatModel 的 base 必须 ≥ 0；负抗性（弱点）用 flat 负修饰符表达。
      if (value < 0) {
        base[key] = 0;
        mods.push({
          sourceId: "enemy-config",
          stat: "resistance",
          key,
          stage: "flat",
          value,
        });
      } else {
        base[key] = value;
      }
    }
    out.resistances = resolveKeyedMap("resistance", base, mods);
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
