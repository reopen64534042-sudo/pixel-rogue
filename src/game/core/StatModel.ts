/**
 * Combat Foundation S4-A：纯属性模型（StatModel）。
 *
 * 把「基础值 + 修正符列表」解析为有效属性，通式：
 *   effective = (base + Σflat) × (1 + Σpercent) × Πfinal
 * flat 区运算语义（S4-B shadow 定论，取代初版 Σ-先求和分组）：**base 起始、
 * 按修饰符顺序逐次累加**——与既有 recompute 重放逐位一致，先求和分组在
 * 浮点上会产生 1 ulp 级偏差（0.05+0.1×8：0.8499999999999999 vs 0.85）。
 * 同 percent 区加算（Σ 先求和再乘一次）；final 连乘（按修饰符数组顺序、
 * IEEE754 左结合，逐位确定）。历史卡的多级逐次乘算（如 p.damage *= 1.1
 * 两级 = ×1.1²）必须映射为两条 final，不得折叠成 percent +0.2。
 *
 * 契约（冻结，后续阶段不得静默更改）：
 * - 全部数值必须有限（NaN/±Infinity 抛 TypeError），禁止 NaN 传播。
 * - 溢出守卫（PR #77 评审 P2）：合法输入聚合后仍可能溢出——flat/percent
 *   求和、base+flat、各阶段乘积都可能在输入全部有限时产生 ±Infinity 或
 *   NaN（如 Inf-Inf）。聚合中间值与每个阶段的计算结果必须有限，否则抛
 *   RangeError（无法表示），不静默返回非有限数。
 * - base 必须 ≥ 0，缺省视为 0；flat 允许任意有限值（负增益合法，有效值
 *   可能为负——在哪里夹紧属接入点决策，模型不做裁剪）。
 * - percent 每项必须 > -1（单一来源不可削减 ≥100%）；区因子 (1+Σpercent)
 *   允许为 0（全免）。多项合法负 percent 的合计可以 < -1，负区因子当前
 *   **允许**（模型不裁剪）——该政策须在 S4-B 正式读取前明确，此处钉住
 *   现状防静默更改（见测试「负区因子」）。
 * - final 的 value 是倍率本身（如 1.1）而不是「+10%」，必须 > 0。
 * - sourceId 必须为非空字符串；同一来源可贡献多条修饰符，不要求唯一；
 *   来源即追溯单位（见 modifierSources）。
 * - 结果只包含出现过 base 或修饰符的属性（Partial 语义）；纯函数：不改写
 *   任何输入、不读时钟/随机数、不依赖 GameCore/DOM/Phaser/实体运行时。
 *
 * 与伤害管线的分工（S3 已冻结）：本模块解析「角色属性」；解析得到的
 * globalDamageBonus/typeDamageBonus/formDamageBonus/skillDamageBonus 数值
 * 由 DamageSystem 的乘区只乘一次。DamageType/AttackForm 是正交维度，
 * 不进入本模型。
 */
import type { CombatStatsSnapshot } from "./types";

/** S4-A 固定白名单：只覆盖现有实体已存在的标量属性，S4-B/C 按需扩展 */
export const STAT_IDS = [
  "attack",
  "defense",
  "maxHp",
  "moveSpeed",
  "fireRate",
  "critChance",
  "critMultiplier",
  "tough",
  // S4-C C2-B：五张乘法天赋中尚缺的三个标量槽位（fireRate/moveSpeed 已有）。
  // boltDmgMul 是技能特化倍率（仅魔弹伤害消费），magnet/area 是拾取/施法范围
  // 倍率——均为「base×倍率」语义，与 attack 同构进入 final 区，不占用
  // typeDamageBonus 等键控族。
  "boltDmgMul",
  "magnet",
  "area",
] as const;

/**
 * S4-B：结构化映射的通用属性族。类型化映射（typeDamageBonus/resistances
 * 等 Partial<Record<键, 数值>>）按「族 + 键」解析：族是这里的通用槽位，
 * 类型/形态名永远是 key，不把火/雷/冰等组合硬编码成独立 StatId（评审
 * 定基线）。逐 key 解析在适配层完成（见 core/StatSheets.ts）：
 * 每个 key 构造一张以该族为槽位的子属性表走 resolveStats，映射本身
 * 在适配层保持类型化结构。已有 8 个标量槽位与解析语义不变（契约加性扩展）。
 */
export const KEYED_STAT_FAMILIES = ["typeDamageBonus", "resistance"] as const;
export type KeyedStatFamily = (typeof KEYED_STAT_FAMILIES)[number];
export type StatId = (typeof STAT_IDS)[number] | KeyedStatFamily;

/** 修正阶段：固定加成 → 百分比（同区加算）→ 最终倍率（连乘） */
export type ModifierStage = "flat" | "percent" | "final";

/** 单条属性修正：sourceId 是追溯单位（天赋名/血包成长/波次缩放等） */
export interface StatModifier {
  readonly sourceId: string;
  readonly stat: StatId;
  readonly stage: ModifierStage;
  readonly value: number;
}

/** 属性表：基础值 + 有序修正符列表；两者都被 resolveStats 视为只读 */
export interface StatSheet {
  readonly base: Readonly<Partial<Record<StatId, number>>>;
  readonly modifiers: readonly StatModifier[];
}

const STAT_ID_SET: ReadonlySet<string> = new Set([
  ...STAT_IDS,
  ...KEYED_STAT_FAMILIES,
]);

function requireFinite(value: number, what: string): number {
  if (!Number.isFinite(value))
    throw new TypeError(`${what} 必须为有限数值，收到 ${value}`);
  return value;
}

/** 聚合/计算阶段结果溢出（输入全合法但无法表示）→ RangeError */
function requireFiniteResult(value: number, what: string): number {
  if (!Number.isFinite(value))
    throw new RangeError(`${what} 溢出为 ${value}（各输入均合法有限）`);
  return value;
}

function requireKnownStat(stat: string, where: string): void {
  if (!STAT_ID_SET.has(stat))
    throw new TypeError(`${where} 引用了白名单之外的属性: ${stat}`);
}

/**
 * 解析有效属性。对每个出现过的属性独立计算：
 *   (base ?? 0 + Σflat) × (1 + Σpercent) × Πfinal（修饰符数组顺序）
 * percent 区先整体求和再乘一次（加算契约）；final 按数组顺序逐个左乘。
 */
export function resolveStats(
  sheet: StatSheet,
): Readonly<Partial<Record<StatId, number>>> {
  const touched = new Set<StatId>();
  for (const [stat, value] of Object.entries(sheet.base)) {
    requireKnownStat(stat, "base");
    requireFinite(value as number, `base.${stat}`);
    if ((value as number) < 0)
      throw new RangeError(`base.${stat} 不能为负，收到 ${value}`);
    touched.add(stat as StatId);
  }

  const flats = new Map<StatId, number[]>();
  const percentSum = new Map<StatId, number>();
  const finals = new Map<StatId, number[]>();

  for (const m of sheet.modifiers) {
    if (typeof m.sourceId !== "string" || m.sourceId.length === 0)
      throw new TypeError(
        `sourceId 必须为非空字符串（stat=${String(m.stat)}）`,
      );
    requireKnownStat(m.stat, `修饰符 ${m.sourceId}`);
    requireFinite(m.value, `修饰符 ${m.sourceId} → ${m.stat}`);
    touched.add(m.stat);
    switch (m.stage) {
      case "flat": {
        const list = flats.get(m.stat);
        if (list) list.push(m.value);
        else flats.set(m.stat, [m.value]);
        break;
      }
      case "percent":
        if (m.value <= -1)
          throw new RangeError(
            `percent 修饰符必须 > -1（${m.sourceId} → ${m.stat} = ${m.value}）`,
          );
        percentSum.set(m.stat, (percentSum.get(m.stat) ?? 0) + m.value);
        break;
      case "final": {
        if (m.value <= 0)
          throw new RangeError(
            `final 倍率必须 > 0（${m.sourceId} → ${m.stat} = ${m.value}）`,
          );
        const list = finals.get(m.stat);
        if (list) list.push(m.value);
        else finals.set(m.stat, [m.value]);
        break;
      }
      default:
        throw new TypeError(
          `未知乘区: ${String((m as { stage?: unknown }).stage)}（${m.sourceId} → ${m.stat}）`,
        );
    }
  }

  const result: Partial<Record<StatId, number>> = {};
  for (const stat of touched) {
    // flat 区：base 起始、按修饰符顺序逐次累加（S4-B shadow 定论——与既有
    // recompute 重放逐位一致；(base + Σflat) 的先求和分组在浮点上会产生
    // 1 ulp 级偏差，如 0.05+0.1×8：0.8499999999999999 vs 0.85）
    let v = sheet.base[stat] ?? 0;
    const flatList = flats.get(stat);
    if (flatList) {
      for (const f of flatList) {
        v = v + f;
        requireFiniteResult(v, `flat 阶段 ${stat}`);
      }
    }
    const percent = percentSum.get(stat);
    if (percent !== undefined) {
      requireFiniteResult(percent, `percent 聚合 ${stat}`);
      v = v * (1 + percent);
      requireFiniteResult(v, `percent 阶段 ${stat}`);
    }
    const list = finals.get(stat);
    if (list) {
      for (const k of list) {
        v = v * k;
        requireFiniteResult(v, `final 阶段 ${stat}`);
      }
    }
    result[stat] = v;
  }
  return result;
}

/** 按来源追溯：返回某属性全部修饰符的去重 sourceId（首次出现顺序） */
export function modifierSources(sheet: StatSheet, stat: StatId): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const m of sheet.modifiers) {
    if (m.stat === stat && !seen.has(m.sourceId)) {
      seen.add(m.sourceId);
      out.push(m.sourceId);
    }
  }
  return out;
}

/**
 * S4-B 桥接设计（本阶段只交付纯投影，不替换 CombatStats.ts 的任何调用）：
 * 把 StatSheet 解析结果投影为 CombatStatsSnapshot 的标量子集。
 * resistances 与三类增伤映射不在 S4-A 白名单内，由 S4-B 决策接入方式；
 * 投影对缺失属性省略键（Partial 语义）——调用方（S4-B shadow 对照）负责补默认值。
 */
export type CombatScalarStats = Partial<
  Pick<
    CombatStatsSnapshot<"physical">,
    "attack" | "defense" | "critChance" | "critMultiplier" | "tough"
  >
>;
export function resolveCombatStats(sheet: StatSheet): CombatScalarStats {
  const resolved = resolveStats(sheet);
  const out: CombatScalarStats = {};
  for (const stat of [
    "attack",
    "defense",
    "critChance",
    "critMultiplier",
    "tough",
  ] as const) {
    const v = resolved[stat];
    if (v !== undefined) out[stat] = v;
  }
  return out;
}
