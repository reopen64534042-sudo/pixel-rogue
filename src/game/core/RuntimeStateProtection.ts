import { hasteCap } from "../data/talents";
import type { Player } from "./types";

/**
 * Combat Foundation S4-C C3-C：运行状态保护（RuntimeStateProtection，全量白名单）。
 *
 * 契约 docs/pixel-rogue-S4C-C3-contract-v1.md §5.3 与 D-C3-02/D-C3-03/
 * D-C3-04/D-C3-06：recompute 的 `Object.assign(statBase())` 会把混入
 * statBase 的运行状态一并重置（R-2/R-3/R-4 缺陷根源）。本模块提供
 * 「保存 → 重建属性 → 原样回写 → 上限协调」机制，白名单按批次扩充完成：
 *   C3-A：[]（生命由 recompute 末尾 hp 夹紧承接）
 *   C3-B：["shield", "shieldCd"]
 *   C3-C：["haste", "hasteT", "rageT", "dashT", "dashCharges", "dashRe",
 *          "meteorT", "tempShield", "ndUsed", "orbA", "hurtCd", "dx", "dy"]
 * 最终 15 个受保护字段（快照接口逐字段声明，保留各字段真实类型——ndUsed
 * 为 boolean，其余为 number，不用 any 或统一数值强转）。hp 永不入白名单
 * （由 recompute 的 `max(1, min(hpBefore, maxhp))` 统一处理，D-C3-05）；
 * fireCd 现状即不在 statBase、天然幸存，不进白名单也无害。
 *
 * C3-A/B 批次演进说明：C3-B 版快照为 Partial<Record<键, number>> 循环实现；
 * C3-C 白名单引入 boolean 键（ndUsed）后改为**逐字段显式快照**——联合键的
 * 循环写入在混合类型下无法通过类型检查（写入目标类型为各属性类型交集），
 * 显式枚举既保住真实类型又消除 Partial 分支，且新增字段的漂移由 typecheck
 * 直接咬住（接口/捕获/回写任一遗漏即编译错误）。
 *
 * 调用时机（recompute 编排）：捕获在 `Object.assign` **之前**；回写与协调
 * 在权威投影**之后**（夹紧需要重建后的新上限）。learnTalent 路径不经过
 * 本模块——学习方向上限只增不减，协调恒为无操作。
 *
 * 纯函数约束：不依赖 GameCore/DOM/Phaser、不持有全局运行状态、不掷随机数、
 * 不新增 Player 可枚举字段（快照是局部对象，不挂到实体上）。
 */

/**
 * 只读快照：15 个白名单字段的字面量记录（逐字段真实类型；快照期间
 * Player 会被 statBase 重置，快照不受污染）。
 */
export interface RuntimeSnapshot {
  /** C3-B：护盾现值 / 恢复倒计时（D-C3-02） */
  readonly shield: number;
  readonly shieldCd: number;
  /** C3-C 狂热：当前 Buff 层数 / 剩余时间（D-C3-03） */
  readonly haste: number;
  readonly hasteT: number;
  /** C3-C 战意沸腾剩余时间（独立运行状态，任何协调都不清除，D-C3-04） */
  readonly rageT: number;
  /** C3-C 冲刺：进行中剩余时间 / 现有充能 / 恢复倒计时（D-C3-06） */
  readonly dashT: number;
  readonly dashCharges: number;
  readonly dashRe: number;
  /** C3-C 其余运行状态：陨星计时 / 壁垒临时盾 / 不屈本波已触发（D-C3-04） */
  readonly meteorT: number;
  readonly tempShield: number;
  readonly ndUsed: boolean;
  /** C3-C 其余运行状态：飞刃相位 / 受击无敌帧 / 冲刺方向记忆（D-C3-04） */
  readonly orbA: number;
  readonly hurtCd: number;
  readonly dx: number;
  readonly dy: number;
}

/** 重建前保存全部白名单字段现值（在 Object.assign(statBase()) 之前调用） */
export function captureRuntimeState(p: Player): RuntimeSnapshot {
  return {
    shield: p.shield,
    shieldCd: p.shieldCd,
    haste: p.haste,
    hasteT: p.hasteT,
    rageT: p.rageT,
    dashT: p.dashT,
    dashCharges: p.dashCharges,
    dashRe: p.dashRe,
    meteorT: p.meteorT,
    tempShield: p.tempShield,
    ndUsed: p.ndUsed,
    orbA: p.orbA,
    hurtCd: p.hurtCd,
    dx: p.dx,
    dy: p.dy,
  };
}

/** 属性重建后原样回写快照值（不触碰 hp；不做任何清零/刷新/补发） */
export function restoreRuntimeState(p: Player, s: RuntimeSnapshot): void {
  p.shield = s.shield;
  p.shieldCd = s.shieldCd;
  p.haste = s.haste;
  p.hasteT = s.hasteT;
  p.rageT = s.rageT;
  p.dashT = s.dashT;
  p.dashCharges = s.dashCharges;
  p.dashRe = s.dashRe;
  p.meteorT = s.meteorT;
  p.tempShield = s.tempShield;
  p.ndUsed = s.ndUsed;
  p.orbA = s.orbA;
  p.hurtCd = s.hurtCd;
  p.dx = s.dx;
  p.dy = s.dy;
}

/**
 * 有效上限协调面（D-C3-02/03/06）：
 * - shieldMax：护盾容量（C3-B 起为权威属性）。
 * - dashChargeMax：冲刺充能上限 `1 + dashChargeLv`（与 PlayerSystem 消费点
 *   同式）。
 * - hasteCap：狂热叠层上限，**零级哨兵**——hasteLv > 0 时为 `3 + hasteLv`
 *   （复用 data/talents.ts 既有 hasteCap 导出），hasteLv = 0 时为 0（未学）。
 *   不得直接用 hasteCap(0) = 3 当作「未学习」的有效上限：哨兵 0 使
 *   reconcile 两分支判定互斥完备——部分降级（after 仍 > 0）走夹紧、
 *   末级移除（after === 0）走清除（契约 v1.2 §5.3/v1.2 修订记录）。
 */
export interface EffectiveCaps {
  readonly shieldMax: number;
  readonly dashChargeMax: number;
  readonly hasteCap: number;
}

export function effectiveCaps(p: Player): EffectiveCaps {
  return {
    shieldMax: p.shieldMax,
    dashChargeMax: 1 + p.dashChargeLv,
    hasteCap: p.hasteLv > 0 ? hasteCap(p.hasteLv) : 0,
  };
}

/**
 * 上限协调：只做「上限降低」方向的向下夹紧与末级清除，绝不恢复资源、
 * 绝不刷新计时、绝不在上限升高时赠层或延长 Buff（D-C3-02/03/06）。
 */
export function reconcileRuntimeToCaps(
  p: Player,
  before: EffectiveCaps,
  after: EffectiveCaps,
): void {
  // 护盾：容量下降 → shield = min(shield, 新容量)；升高或不变时不动
  if (after.shieldMax < before.shieldMax && p.shield > after.shieldMax)
    p.shield = after.shieldMax;
  // 狂热（零级哨兵使两分支互斥完备，示例见契约 §5.3）：
  // 部分降级（after 仍 > 0）→ 层数夹紧至新 cap，hasteT 不刷新（持续时长
  // 与层数正交）；末级移除（after === 0 且 before > 0）→ 清空 Buff；
  // 等级不变或升高 → 原样保持（含已过期 Buff）
  if (after.hasteCap < before.hasteCap) {
    if (after.hasteCap > 0) {
      if (p.haste > after.hasteCap) p.haste = after.hasteCap;
    } else {
      p.haste = 0;
      p.hasteT = 0;
    }
  }
  // 冲刺：充能上限下降 → dashCharges = min(dashCharges, 新上限)；不补回
  // 已消耗充能；dashRe 剩余时间不按 dashMax 缩放、dashT 不中断（恢复侧
  // 已原样回写，此处只处理「上限降低」方向）
  if (
    after.dashChargeMax < before.dashChargeMax &&
    p.dashCharges > after.dashChargeMax
  )
    p.dashCharges = after.dashChargeMax;
}
