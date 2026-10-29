/**
 * 伤害属性注册表（Combat Foundation v1 · S1）。
 * 设计规范：docs/pixel-rogue-combat-foundation-v1.md §2。
 *
 * 注册表是带类型约束的静态 TypeScript 配置：新增属性（如冰霜、毒素）
 * 只需增配一条 { 减伤策略, 展示名 } 并补充校验与回归测试，DamageSystem
 * 自身不写任何具体属性分支。注册表只保存策略与展示元信息，不执行
 * 扣血、随机判定或技能副作用。
 */

/** 减伤策略：由伤害属性决定，玩家/敌人共用同一套公式 */
export type MitigationStrategy = "armor" | "resistance" | "none";

export interface DamageTypeInfo {
  /**
   * armor：物理护甲 K/(K+max(0,DEF))，受通用减伤影响
   * resistance：元素抗性 1-clamp(res,0,上限)，受通用减伤影响
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
 * **无需任何分支**——`DamageSystem.typeMitigationFactor` 只按策略分派，
 * 不认识具体属性名。新增属性时只改这一行。
 */
export const DAMAGE_TYPES = {
  physical: { mitigation: "armor", label: "物理" },
  fire: { mitigation: "resistance", label: "火焰" },
  frost: { mitigation: "resistance", label: "冰霜" },
  lightning: { mitigation: "resistance", label: "雷电" },
  true: { mitigation: "none", label: "真实" },
} as const satisfies DamageTypeRegistry;

export type DamageTypeId = keyof typeof DAMAGE_TYPES;
