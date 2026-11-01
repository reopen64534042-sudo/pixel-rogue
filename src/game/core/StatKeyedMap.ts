import {
  resolveStats,
  type KeyedStatFamily,
  type StatModifier,
  type StatSheet,
} from "./StatModel";
import type { DamageTypeId } from "../data/damageTypes";

export type KeyedModifier<F extends KeyedStatFamily> = StatModifier & {
  stat: F;
  key: string;
};
export type TypeDamageBonusModifier = KeyedModifier<"typeDamageBonus"> & { key: DamageTypeId };
export type ResistanceModifier = KeyedModifier<"resistance"> & { key: DamageTypeId };

/**
 * 类型化映射解析：每个 key 一张子属性表（槽位 = 族，修饰符 = 该 key 的
 * 全部来源）走 resolveStats，再装配回平面映射。base 的键也参与（空映射
 * + 无修饰符的 key 不会出现在结果里，与 resolveStats 的 Partial 语义一致）。
 * 纯函数：不改写 base/mods，返回新对象。
 */
export function resolveKeyedMap<F extends KeyedStatFamily>(
  family: F,
  base: Readonly<Partial<Record<string, number>>>,
  mods: readonly (StatModifier & { stat: F; key: string })[],
): Record<string, number> {
  const keys = new Set<string>([
    ...Object.keys(base),
    ...mods.map((m) => m.key),
  ]);
  const out: Record<string, number> = {};
  for (const key of keys) {
    // 危险原型键显式拒绝（PR #89 评审 P3）：普通对象上 out.__proto__ = v
    // 会触发原型 setter 而非自有属性——键被静默丢弃且可能污染原型链；
    // 且下游 { ...map } 展开会再次丢失。游戏数据无合法 __proto__ 键，
    // 拒绝优于安全容器（其他自有键如 constructor 无 setter 魔法，不受限）。
    if (key === "__proto__")
      throw new TypeError('类型化映射不允许危险原型键 "__proto__"');
    const ownValue = Object.hasOwn(base, key) ? base[key] : undefined;
    const sheet: StatSheet = {
      base: { [family]: ownValue ?? 0 },
      modifiers: mods.filter((m) => m.key === key),
    };
    const v = resolveStats(sheet)[family];
    if (v !== undefined) out[key] = v;
  }
  return out;
}
