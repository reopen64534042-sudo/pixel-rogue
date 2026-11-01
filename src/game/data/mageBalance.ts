/**
 * 法师节奏与保留旧卡的系数。
 *
 * 元素法师 v2 的元素、状态、反应与法杖成长数值已迁到
 * `data/elementalMage.ts`；本文件只保留**施法节奏、法阵几何、
 * 充能护盾与脱离卡**等仍被运行时消费的键。
 *
 * 纪律（沿用 AGENTS.md）：
 * - 伤害公式的**计算**放 core/DamageMath.ts 的纯函数，系数从这里读；
 * - 任何系统文件不得内联新公式，只能引用本表的键。
 */

/** 法师的三种元素。取值与 DamageTypeId 对齐（fire / frost / lightning）。 */
export type MageElement = "fire" | "frost" | "lightning";

export interface MageBalance {
  // —— 施法节奏（时间门控）——
  /**
   * 施法速率归一化系数（不是周期本身）：stats.ts 用它反推法师基础 fireRate = 1 / 本值。
   * 实际周期 = castWindup + castInterval；v161 从 0.75 拉到 0.80 秒（约 −6% 频率）。
   */
  castCycle: number;
  /** 前摇总时长（秒）：抬手（可打断） + 法阵收束（不可打断）。 */
  castWindup: number;
  /** 前摇中的「抬手」段（秒）：这段时间可被受击打断。 */
  castWindupInterruptible: number;
  /** 施法间隔（秒）：一次爆裂结束到下一次起手。 */
  castInterval: number;
  /** 施法距离（px）：落点法阵的最远施法距离。 */
  castRange: number;
  /** 法阵半径（px，base）：随 area 乘区缩放。 */
  circleRadius: number;
  /**
   * 元素伤害基准（× 玩家 damage），用于状态 DoT、闪电链与反应伤害。
   *
   * 文档里的火 60% / 冰 100% / 雷 80% 都相对这个基准；基准本身是
   * 占位配平值。法阵直伤另乘 `directDamageMul`，避免纯法阵压过元素效果。
   * v161 移除站定：原站定 1.5× 折入基准（0.9 → 1.35），
   * 移动施法不再掉伤害。
   */
  elementBaseMul: number;
  /**
   * 法阵直伤相对元素基准的倍率。
   *
   * 试玩反馈：纯法阵直伤过高，前期只看到法阵数字、体会不到灼烧/凝冰/反应。
   * 直伤降低后，状态 DoT、闪电链与反应仍按 `elementBaseMul` 结算。
   */
  directDamageMul: number;
  /** 无目标时的重试间隔（秒）：避免每帧空转找目标。 */
  castIdleRetry: number;
  // —— 充能护盾（保留旧卡「护咒壁」）——
  /** 满充能所需的成功施法次数。 */
  chargeFull: number;
  /** 满充能触发后三格全亮的持续时间（秒）。 */
  chargeFlash: number;
  /** 护咒壁：最大生命百分比。 */
  wardShieldPct: number;
  /** 护咒壁持续时间（秒）。 */
  wardShieldDuration: number;

  // —— 节律（保留旧卡）——
  /** 速咏：前摇倍率（0.7 = 前摇 −30%）。 */
  quickCastWindupMul: number;
  /** 连咏：施法间隔倍率（0.8 = 间隔 −20%）。 */
  continuousCastIntervalMul: number;

  // —— 范围（保留旧卡）——
  /** 广域符印：作用范围倍率（1.2 = +20%）。 */
  wideSealAreaMul: number;

  // —— 脱离（保留旧卡）——
  /** 相位：传送搜索半径（px）。 */
  phaseRange: number;
  /** 相位：冷却（秒）。 */
  phaseCooldown: number;
  /** 相位：找不到落点时给予的无敌时间（秒）。 */
  phaseInvuln: number;
  /** 镜像：冷却（秒）。 */
  mirrorCooldown: number;
  /** 镜像：虚影持续时间（秒）。 */
  mirrorDuration: number;
  /** 镜像：残影存在时间（秒）。 */
  mirrorDecoyDuration: number;
}

export const MAGE_BALANCE: MageBalance = {
  castCycle: 0.75,
  castWindup: 0.48,
  castWindupInterruptible: 0.15,
  castInterval: 0.32,
  castRange: 150,
  circleRadius: 34,
  elementBaseMul: 1.35,
  directDamageMul: 0.65,
  castIdleRetry: 0.1,

  chargeFull: 3,
  chargeFlash: 0.35,

  wardShieldPct: 0.12,
  wardShieldDuration: 1.2,

  quickCastWindupMul: 0.7,
  continuousCastIntervalMul: 0.8,

  wideSealAreaMul: 1.2,

  phaseRange: 80,
  phaseCooldown: 10,
  phaseInvuln: 0.5,
  mirrorCooldown: 12,
  mirrorDuration: 1,
  mirrorDecoyDuration: 3,
};
