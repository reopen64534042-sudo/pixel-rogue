import type { Profession } from "./types";
import type { ModifierStage, StatId, StatModifier } from "./StatModel";

/**
 * 伤害重做 S1：属性强化的**权威来源**（Attribute Sources）。
 *
 * 定位与 `TalentStatSources` 并列：天赋来源表声明「卡 → 属性」的贡献，
 * 本模块声明「玩家已选的属性点 → 属性」的贡献。两者在同一次
 * `resolveStats` 里合并解析，**不是两次独立写入**——否则后写的一方会
 * 覆盖前一方（recompute 里 `Object.assign(player, statBase())` 之后，
 * 属性若单独投影会把天赋算出来的值抹掉）。
 *
 * 契约：
 * - 纯函数，不读时钟/随机数/GameCore/DOM；输入只读，不改写。
 * - 修饰符数量与顺序**由属性点数组逐步推出**，不维护任何累加缓存——
 *   recompute 可能被反复调用，缓存会让同一次加点被重放两次（R-1 同类事故）。
 * - `value` 必须有限；`resolveStats` 负责拒绝 NaN/±Infinity。
 * - `stage` 由调用方决定：线性成长用 `flat`，百分比成长用 `percent`
 *   （同区加算），成倍放大才用 `final`（连乘）。属性系统的设计意图是
 *   「线性、可预期」，所以绝大多数条目应该是 `flat`。
 */
export interface AttributePoint {
  /** 目标属性（必须是 StatModel 白名单里的 StatId） */
  readonly stat: StatId;
  /** 进入哪个区：flat 加算 / percent 同区加算 / final 连乘 */
  readonly stage: ModifierStage;
  /** 数值：flat 为绝对值，percent 为小数（0.12 = +12%），final 为倍率（1.12） */
  readonly value: number;
}

/**
 * 属性点 → 修饰符列表。
 *
 * `sourceId` 带序号：同一属性可以被多次加点（10 次 +2 攻击 = 10 条 flat），
 * 序号保证来源可追溯，也避免同一来源多条的歧义。
 */
export function attributeModifiers(
  points: readonly AttributePoint[],
): StatModifier[] {
  return points.map((point, index) => ({
    sourceId: `attr:${index}:${point.stat}`,
    stat: point.stat,
    // 兼容本局已选的旧全局增伤记录：旧卡错误标成 percent，数值仍是增伤百分点。
    stage: point.stat === "globalDamageBonus" && point.stage === "percent"
      ? "flat"
      : point.stage,
    value: point.value,
  }));
}

/**
 * 职业基础形态的**派生值**（S2）。
 *
 * 为什么是派生函数而不是写进 Player 或属性投影：
 * - 写进 Player 会被 `recompute` 的 `Object.assign(player, statBase())` 抹掉；
 * - 写进属性投影会覆盖旧卡 `f` 对同一字段的写入（旧表的同名卡曾是
 *   `p.pierce++`），导致 parity 的全天赋场景对不上。
 *
 * 所以职业基础只在**消费点**叠加：`pierce` 在发射时加 1，`pierceFalloff`
 * 由 `statBase()` 提供 0.5（S3 引入三职业后再改为按职业的 base 参数）。
 */
export function professionPierce(prof: Profession): number {
  return prof === "shooter" ? 1 : 0;
}

