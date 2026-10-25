/**
 * Combat Foundation S4-C（C1）：五张纯 flat 天赋的属性权威来源表。
 *
 * 职责（任务书 §4-S4-C「全链路权威来源唯一」）：
 * - 「磐石/铁布衫/致命一击/会心深渊/元素亲和」的属性贡献在此**声明一次**，
 *   由 StatModel 从 picks 序列解析；data/talents.ts 中这五张卡的 `f` 不再
 *   写入属性字段（无获得时即时效果，f 为空操作）。旧 `Talent.f` 累加与
 *   新 Modifier 不并行生效——learnTalent/recompute/melt 统一收敛到
 *   applyTalentStatProjection 写出的投影值。
 * - Player 上的 `defense/tough/crit/critMul/typeDamageBonus` 是兼容投影：
 *   字段保留（消费点 CombatStats/UI/pv·cur 不变），但唯一来源是本表解析。
 * - 「致命一击」觉醒（upCounts ≥ critMaxLevel → 有效暴伤 +0.4）是**条件
 *   来源**：判定时机保持读时进行（DamageMath.critMultiplier 按 upCounts
 *   现值叠加），不烘焙进 p.critMul 字段——与旧语义逐位一致，置换移除层级
 *   后觉醒自动失效。
 *
 * flat 语义：resolveStats 的 flat 区为 base 起始、按修饰符顺序（即 picks
 * 顺序）逐次累加，与旧 recompute 重放的 IEEE-754 运算序列逐位一致
 * （S4-B 定论）。负区因子政策未批准，本表全部来源为正 flat，不涉及。
 *
 * 纯函数：不引用 talent.f / GameCore / DOM / Phaser、不掷随机数、无持久
 * 缓存。值与 data/talents.ts 的历史 f 语义逐字一致；漂移由基线钉子测试
 * （磐石 45 / tough 0.4 / 暴击 0.8499999999999999 / 火雷 0.30000000000000004）
 * 与 S4-B shadow 独立重述（playerShadowFromPicks）双重暴露。
 */
import { statBase } from "../data/stats";
import { resolveStats, type StatModifier } from "./StatModel";
import {
  resolveKeyedMap,
  type TypeDamageBonusModifier,
} from "./StatSheets";
import type { Player } from "./types";

/** 五张已迁移卡的来源贡献：标量区 + 类型化火雷增伤区 */
export interface TalentStatContribution {
  scalars: StatModifier[];
  typeDamageBonus: TypeDamageBonusModifier[];
}

/**
 * 「元素亲和」贡献的 typeDamageBonus 键 = C1 投影对类型化映射的**全部所有权
 * 范围**（第一轮评审 P2 定界）：投影只写/删这两个键；physical 等其余键属
 * 未知外部来源，不在所有权内，学习无关天赋时保持不动（见投影函数说明）。
 */
const ELEMENT_TDB_KEYS = ["fire", "lightning"] as const;

/**
 * 把 picks 序列翻译为修饰符（C1 批次范围外的 pick 忽略）。
 * 顺序即 picks 顺序——同一张卡重复学习按次数展开，与旧重放逐位一致。
 */
export function talentStatModifiers(
  picks: readonly string[],
): TalentStatContribution {
  const scalars: StatModifier[] = [];
  const typeDamageBonus: TypeDamageBonusModifier[] = [];
  for (const name of picks) {
    switch (name) {
      case "磐石": // data/talents.ts：defense +15/级
        scalars.push({
          sourceId: "天赋:磐石",
          stat: "defense",
          stage: "flat",
          value: 15,
        });
        break;
      case "铁布衫": // data/talents.ts：tough +0.1/级（0.6 上限在消费点）
        scalars.push({
          sourceId: "天赋:铁布衫",
          stat: "tough",
          stage: "flat",
          value: 0.1,
        });
        break;
      case "致命一击": // data/talents.ts：crit +0.1/级（max 8）
        scalars.push({
          sourceId: "天赋:致命一击",
          stat: "critChance",
          stage: "flat",
          value: 0.1,
        });
        break;
      case "会心深渊": // data/talents.ts：critMul +0.5/级（0.5 可精确表示）
        scalars.push({
          sourceId: "天赋:会心深渊",
          stat: "critMultiplier",
          stage: "flat",
          value: 0.5,
        });
        break;
      case "元素亲和": // data/talents.ts：火/雷 typeDamageBonus 各 +0.1/级
        for (const key of ELEMENT_TDB_KEYS)
          typeDamageBonus.push({
            sourceId: "天赋:元素亲和",
            stat: "typeDamageBonus",
            stage: "flat",
            value: 0.1,
            key,
          });
        break;
      default: // C1 范围外的天赋不进属性表（其余 36 张仍由 talent.f 重放）
        break;
    }
  }
  return { scalars, typeDamageBonus };
}

/**
 * 把五张已迁移卡的权威解析结果写回 Player 兼容投影。幂等：可重复调用，
 * 结果只取决于 picks 当前内容。写入点 = 旧 f 的全部生效点
 * （learnTalent / recompute / melt 经 learnTalent），不存在第二套累积来源。
 *
 * 可选字段存在性沿用旧语义：磐石来源存在才写 `defense` 键，无来源删键。
 * typeDamageBonus 为**键级所有权**（第一轮评审 P2）：投影只管理 fire/lightning
 * 两键（ELEMENT_TDB_KEYS，即本表声明的全部映射键）——有来源时以解析结果
 * **绝对覆写**（每次从 picks 全量解析，不与旧值相加，无重复叠加），无来源
 * 时删除这两键（映射因此为空则连映射一并删除）；其余键（physical 等）属
 * 未知外部来源，不在所有权内，学习任何天赋都保持不动。
 *
 * 兼容边界（明示，不猜测恢复）：
 * - 外部来源若也写 fire/lightning，与元素亲和贡献无法区分，投影覆写为
 *   权威值——当前无此类运行时写入者，外部写入者须避开这两键；
 * - recompute/melt 路径沿用历史行为：recompute 先整体删除 typeDamageBonus
 *   键再重放（S3-B 语义），外部键在该路径不保留——原有状态行为，本轮不动。
 */
export function applyTalentStatProjection(p: Player): void {
  const base = statBase();
  const { scalars, typeDamageBonus } = talentStatModifiers(p.picks);
  const resolved = resolveStats({
    base: {
      tough: base.tough,
      critChance: base.crit,
      critMultiplier: base.critMul,
    },
    modifiers: scalars,
  });
  p.tough = resolved.tough ?? 0;
  p.crit = resolved.critChance ?? base.crit;
  // 不含觉醒：DamageMath.critMultiplier 在读取时按 upCounts 现值叠加 0.4
  p.critMul = resolved.critMultiplier ?? base.critMul;
  // defense 无 base（键缺席 = 0），有来源才出现——与旧 f 的键存在性一致
  if (resolved.defense !== undefined) p.defense = resolved.defense;
  else delete p.defense;
  // typeDamageBonus 键级所有权（见函数说明与 ELEMENT_TDB_KEYS）
  const element = resolveKeyedMap("typeDamageBonus", {}, typeDamageBonus);
  if (typeDamageBonus.length > 0) {
    const map = p.typeDamageBonus ?? (p.typeDamageBonus = {});
    for (const key of ELEMENT_TDB_KEYS) {
      const v = element[key];
      if (v !== undefined) map[key] = v;
      else delete map[key];
    }
  } else if (p.typeDamageBonus) {
    for (const key of ELEMENT_TDB_KEYS) delete p.typeDamageBonus[key];
    if (Object.keys(p.typeDamageBonus).length === 0)
      delete p.typeDamageBonus;
  }
}
