import type { Player } from "./types";

/**
 * Combat Foundation S4-C C3-B：运行状态保护（RuntimeStateProtection）。
 *
 * 契约 docs/pixel-rogue-S4C-C3-contract-v1.md §5.3 与 D-C3-02/D-C3-04：
 * recompute 的 `Object.assign(statBase())` 会把混入 statBase 的运行状态
 * 一并重置（R-2/R-4 缺陷根源）。本模块提供「保存 → 重建属性 → 原样回写 →
 * 上限协调」的最小机制，白名单按批次扩充（D-C3-04 分阶段）：
 *   C3-A：[]（生命由 recompute 末尾 hp 夹紧承接，骨架未引入）
 *   C3-B：["shield", "shieldCd"]（本批——R-2 修复的载体）
 *   C3-C：["haste", "hasteT", "rageT", "dashT", "dashCharges", "dashRe",
 *          "meteorT", "tempShield", "ndUsed", "orbA", "hurtCd", "dx", "dy"]
 * hp 永不入白名单（由 recompute 的 `max(1, min(hpBefore, maxhp))` 统一处理，
 * D-C3-05）；fireCd 现状即不在 statBase、天然幸存，不进白名单也无害。
 *
 * C3-B 刻意只纳入本批真正生效的协调字段：EffectiveCaps 仅含 shieldMax
 * （C3-B 起为权威属性）。契约 §5.3 草案的 dashChargeMax/hasteCap 属 C3-C
 * 批次——狂热/冲刺等级尚未迁移，提前纳入会被误读为已完成的权威属性，
 * 不预实现（本批不构造更大的 RuntimeState 容器）。
 *
 * 调用时机（recompute 编排，任务书 §五）：捕获与快照在 `Object.assign`
 * **之前**；回写与协调在权威投影**之后**（夹紧需要重建后的新 shieldMax）。
 * learnTalent 路径不经过本模块——学习方向上限只增不减，协调恒为无操作。
 *
 * 纯函数约束：不依赖 GameCore/DOM/Phaser、不持有全局运行状态、不掷随机数、
 * 不新增 Player 可枚举字段（快照是局部对象，不挂到实体上）。
 */

/**
 * C3-B 白名单（D-C3-04 首批两字段；C3-C 按契约扩充）：
 * - shield：当前护盾层数——消耗（CombatSystem）、恢复（PlayerSystem）、
 *   获得时赠层（OnAcquireEffects）写入；重算保留现值，绝不重放赠层。
 * - shieldCd：恢复倒计时——破盾置 10（CombatSystem）、恢复成功重置 10、
 *   满盾冻结（PlayerSystem）写入；重算保留剩余值，绝不提前清零。
 */
export const RUNTIME_STATE_KEYS = ["shield", "shieldCd"] as const;

export type RuntimeStateKey = (typeof RUNTIME_STATE_KEYS)[number];

/** 只读快照：白名单字段值的字面量记录（非 Player 引用，重建期间不受污染） */
export interface RuntimeSnapshot {
  readonly values: Partial<Record<RuntimeStateKey, number>>;
}

/** 重建前保存白名单字段现值（在 Object.assign(statBase()) 之前调用） */
export function captureRuntimeState(p: Player): RuntimeSnapshot {
  const values: Partial<Record<RuntimeStateKey, number>> = {};
  for (const key of RUNTIME_STATE_KEYS) values[key] = p[key];
  return { values };
}

/** 属性重建后原样回写快照值（只回写白名单字段，不触碰 hp/tempShield 等） */
export function restoreRuntimeState(p: Player, s: RuntimeSnapshot): void {
  for (const key of RUNTIME_STATE_KEYS) {
    const v = s.values[key];
    if (v !== undefined) p[key] = v;
  }
}

/**
 * 有效上限协调面（C3-B）：仅含护盾容量。hp 不在此（recompute 夹紧，D-C3-05）；
 * dashChargeMax/hasteCap 待 C3-C 迁移后按契约 §5.3 扩充。
 */
export interface EffectiveCaps {
  readonly shieldMax: number;
}

export function effectiveCaps(p: Player): EffectiveCaps {
  return { shieldMax: p.shieldMax };
}

/**
 * 上限协调：只做「上限降低」方向的向下夹紧，绝不恢复资源、绝不刷新计时
 * （D-C3-02）。上限升高或不变时为无操作（learnTalent 方向结构性无操作；
 * recompute 在置换移除层级后 shieldMax 下降 → shield = min(shield, 新上限)）。
 */
export function reconcileRuntimeToCaps(
  p: Player,
  before: EffectiveCaps,
  after: EffectiveCaps,
): void {
  if (after.shieldMax < before.shieldMax && p.shield > after.shieldMax)
    p.shield = after.shieldMax;
}
