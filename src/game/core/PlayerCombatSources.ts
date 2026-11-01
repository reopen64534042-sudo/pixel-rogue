import { DAMAGE_TYPES, RESISTANCE_TYPES } from "../data/damageTypes";
import { KEYED_STAT_FAMILIES, type KeyedStatFamily, type StatModifier } from "./StatModel";
import { resolveKeyedMap } from "./StatKeyedMap";
import type { Player } from "./types";

/**
 * 映射来源必须声明稳定的键所有权；效果失效时仍传 ownedKeys，modifiers 为空。
 * 同一键可由多个来源贡献，合并后只解析一次；不维护累加缓存。
 */
export interface PlayerKeyedStatSource {
  readonly stat: KeyedStatFamily;
  readonly ownedKeys: readonly string[];
  readonly modifiers: readonly (StatModifier & { readonly key: string })[];
}

const MAP_FIELDS = {
  resistance: "resistances",
  typeDamageBonus: "typeDamageBonus",
  formDamageBonus: "formDamageBonus",
  skillDamageBonus: "skillDamageBonus",
} as const satisfies Record<KeyedStatFamily, keyof Player>;
type MapField = (typeof MAP_FIELDS)[KeyedStatFamily];

function validateKey(family: KeyedStatFamily, key: string): void {
  if (typeof key !== "string" || key.length === 0 || key === "__proto__")
    throw new TypeError(`非法战斗映射键：${family}.${String(key)}`);
  if ((family === "resistance" || family === "typeDamageBonus") && !Object.hasOwn(DAMAGE_TYPES, key))
    throw new TypeError(`未注册的伤害属性键：${key}`);
  if (family === "resistance" && !RESISTANCE_TYPES.some((type) => type === key))
    throw new TypeError(`该属性不使用独立抗性：${key}`);
  if (family === "formDamageBonus" && key !== "melee" && key !== "ranged" && key !== "other")
    throw new TypeError(`未注册的攻击形式键：${key}`);
}

/**
 * 来源→键控解析→Player 映射投影。只接管声明过的键，保留未接管的外部键。
 * 所有族计算成功后才写回；无来源不物化中性字段，失效来源移除其旧投影。
 */
export function applyPlayerCombatSources(p: Player, sources: readonly PlayerKeyedStatSource[]): void {
  for (const source of sources) {
    if (!KEYED_STAT_FAMILIES.includes(source.stat))
      throw new TypeError(`未知战斗映射族：${source.stat}`);
  }
  const updates: Partial<Record<MapField, Record<string, number> | undefined>> = {};
  for (const family of KEYED_STAT_FAMILIES) {
    const owned = new Set<string>();
    const modifiers: (StatModifier & { stat: typeof family; key: string })[] = [];
    for (const source of sources) {
      if (source.stat !== family) continue;
      const sourceKeys = new Set(source.ownedKeys);
      for (const key of sourceKeys) {
        validateKey(family, key);
        owned.add(key);
      }
      for (const modifier of source.modifiers) {
        if (modifier.stat !== family || !sourceKeys.has(modifier.key))
          throw new TypeError(`映射修饰符不在来源所有权内：${modifier.sourceId}`);
        modifiers.push({ ...modifier, stat: family });
      }
    }
    if (owned.size === 0) continue;
    const field = MAP_FIELDS[family];
    const resolved = resolveKeyedMap(family, {}, modifiers);
    const map: Record<string, number> = { ...p[field] };
    for (const key of owned) {
      if (Object.hasOwn(resolved, key)) map[key] = resolved[key];
      else delete map[key];
    }
    updates[field] = Object.keys(map).length > 0 ? map : undefined;
  }
  for (const field of Object.values(MAP_FIELDS)) {
    if (!Object.hasOwn(updates, field)) continue;
    const map = updates[field];
    if (map) p[field] = map;
    else delete p[field];
  }
}
