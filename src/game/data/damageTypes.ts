/**
 * 伤害属性注册表（Combat Foundation v1 · S1）。
 * 设计规范：docs/pixel-rogue-combat-foundation-v1.md §2。
 *
 * 注册表保存减伤策略与展示元信息，DamageSystem 不写具体属性名分支。
 * 新属性还需接攻击、来源、防守映射及显示；不会自动获得技能或状态。
 * 完整步骤见 docs/combat-numerics-agent-guide.md；验证按当前 AGENTS.md。
 */

/** 减伤策略：由伤害属性决定，玩家/敌人共用同一套公式 */
export type MitigationStrategy = "armor" | "resistance" | "none";

export interface DamageTypeInfo {
  /**
   * armor：护甲 K/(K+max(0,DEF))，物理/引力使用，受通用减伤影响
   * resistance：元素抗性 1-clamp(res,弱点下限,抗性上限)，受通用减伤影响
   * none：真实伤害，绕过护甲、抗性与通用减伤
   */
  mitigation: MitigationStrategy;
  /** 展示元信息，仅用于 UI/文档，不参与计算 */
  label: string;
}

/** 任意静态注册表的约束形状；键即合法属性 ID */
export type DamageTypeRegistry = Readonly<Record<string, DamageTypeInfo>>;

/**
 * 正式注册表：keyof typeof DAMAGE_TYPES 即当前合法的 DamageTypeId
 *
 * S3 法师池新增 `frost`（冰霜/凝冰/冻结）：
 * 减伤策略与火/雷同为 `resistance`（吃敌人元素抗性），因此注册表之外
 * **无需计算器属性分支**——`DamageSystem.typeMitigationFactor` 只按策略分派，
 * 不认识具体属性名；来源与攻击的完整接线仍需同步。
 */
export const DAMAGE_TYPES = {
  physical: { mitigation: "armor", label: "物理" },
  gravity: { mitigation: "armor", label: "引力" },
  fire: { mitigation: "resistance", label: "火焰" },
  frost: { mitigation: "resistance", label: "冰霜" },
  lightning: { mitigation: "resistance", label: "雷电" },
  true: { mitigation: "none", label: "真实" },
} as const satisfies DamageTypeRegistry;

export type DamageTypeId = keyof typeof DAMAGE_TYPES;

/** 抗性显示/来源检查从正式注册表派生，新增元素不再维护第二份三元素清单。 */
export const RESISTANCE_TYPES: readonly DamageTypeId[] = (Object.keys(DAMAGE_TYPES) as DamageTypeId[])
  .filter((type) => DAMAGE_TYPES[type].mitigation === "resistance");
