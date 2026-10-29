/**
 * 法师池系数（S3）—— **全部为占位值**。
 *
 * 设计来源：docs/talent-pool-design-rules.md 附录 B（法师池定稿）。
 * 该文档明确标注「数值全部为占位，只表达机制方向，未配平」，因此本文件
 * 只负责把设计文档里的数字**落成可被代码消费的常量**，不承担平衡结论。
 *
 * 为什么独立成文件而不是并入 data/combatBalance.ts：
 * - combatBalance 是**全职业共享**的战斗数值底座（护甲 K、抗性上限、陨星系数），
 *   它的任何一个系数都同时影响射手与（未来的）战士；
 * - 法师的施法节奏、元素层数、反应系数目前只在法师路径上被消费，
 *   放进共享底座会让「哪些数值是三职业共同底线」变得不可读；
 * - 配平批次应把这里的关键项并入 combatBalance 或按职业分表重排——
 *   到那时再改文件归属，而不是现在就提前合并。
 *
 * 纪律（沿用 AGENTS.md）：
 * - 伤害公式的**计算**放 core/DamageMath.ts 的纯函数，系数从这里读；
 * - 任何系统文件不得内联新公式，只能引用本表的键。
 */

/** 法师的三种元素。取值与 DamageTypeId 对齐（fire / frost / lightning）。 */
export type MageElement = "fire" | "frost" | "lightning";

export interface MageBalance {
  // —— 施法节奏（时间门控）——
  /** 施法周期（秒）。与「攻速 1.82/s」互为倒数：1 / 1.82 ≈ 0.55。 */
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
  /** 前摇期间的移速惩罚系数：移动速度 ÷ 该值（1.6 ≈ 慢 60%）。 */
  windupMovePenalty: number;
  /** 法阵单次伤害系数（× 玩家 damage）。 */
  castDamageMul: number;
  /** 无目标时的重试间隔（秒）：避免每帧空转找目标。 */
  castIdleRetry: number;

  // —— 元素印记 ——
  /** 灼烧层数上限。 */
  burnStackCap: number;
  /** 灼烧每层每秒伤害（× 玩家 damage）。 */
  burnDpsPerStack: number;
  /** 灼烧每层独立持续时间（秒）。 */
  burnDuration: number;
  /** 凝冰层数上限。 */
  frostStackCap: number;
  /** 凝冰每层减速比例（0.06 = 6%）。 */
  frostSlowPerStack: number;
  /** 凝冰每层独立持续时间（秒）。 */
  frostDuration: number;
  /** 对携带凝冰的目标，元素伤害加成。 */
  frostElementBonus: number;
  /** 凝冰满层时的冻结时长（秒）。 */
  frostFreezeDuration: number;
  /** 冻结目标受到的任意伤害加成。 */
  frozenVuln: number;
  /** 麻痹持续时间（秒），可刷新。 */
  paraDuration: number;
  /** 麻痹造成的攻击间隔增加比例。 */
  paraAttackSlow: number;
  /** 麻痹造成的移速降低比例。 */
  paraMoveSlow: number;
  /** 麻痹目标受到闪电链伤害的加成。 */
  paraChainVuln: number;
  /** 闪电链触发概率（0-1）。 */
  chainChance: number;
  /** 闪电链最大跳跃目标数。 */
  chainJumps: number;
  /** 闪电链每个目标的伤害比例（× 本次命中伤害）。 */
  chainDamageMul: number;
  /** 闪电链跳跃距离（px）。 */
  chainRange: number;

  // —— 元素共振 —
  /** 共振影响半径（px）：印记触发时周围的敌人。 */
  resonanceRadius: number;

  // —— 双修反应 —
  /** 超载：引燃全部灼烧层数的即时伤害折算秒数。 */
  overloadSeconds: number;
  /** 融化：对冻结目标施加灼烧时的即时元素伤害倍数。 */
  meltDamageMul: number;
  /** 超导：闪电链额外跳跃目标数。 */
  superChainBonusJumps: number;
  /** 超导状态下敌人受到的雷电伤害加成。 */
  superChainVuln: number;

  // —— 充能条（循环轴共用）——
  /** 满充能所需的成功施法次数。 */
  chargeFull: number;

  // —— 护盾（值型 + 限时，与既有层数制护盾是两套模型）——
  /** 咏唱护壁：最大生命百分比。 */
  wardShieldPct: number;
  /** 咏唱护壁持续时间（秒）。 */
  wardShieldDuration: number;
  /** 回响：最大生命百分比。 */
  echoShieldPct: number;
  /** 回响持续时间（秒）。 */
  echoShieldDuration: number;
  /** 回响护盾的总上限（最大生命百分比）——防止高频施法把护盾堆成无敌。 */
  echoShieldCapPct: number;

  // —— 路线B：星陨 / 多重陨星 / 元素残域 ——
  /** 陨星落下周期（秒）。 */
  meteorInterval: number;
  /** 陨星从预警到落地的时长（秒）：落点提前量按这段时间计算。 */
  meteorFall: number;
  /** 陨星半径（px）。 */
  meteorRadius: number;
  /** 陨星伤害系数（× 玩家 damage）。 */
  meteorDamageMul: number;
  /** 多重陨星同时落下的颗数。 */
  meteorCount: number;
  /** 元素残域持续时间（秒）。 */
  domainDuration: number;
  /** 元素残域半径（px）。 */
  domainRadius: number;
  /** 元素残域每秒伤害系数（× 玩家 damage）。 */
  domainDpsMul: number;

  // —— 节律 —
  /** 速咏：前摇倍率（0.7 = 前摇 −30%）。 */
  quickCastWindupMul: number;
  /** 连咏：施法间隔倍率（0.8 = 间隔 −20%）。 */
  continuousCastIntervalMul: number;

  // —— 范围 —
  /** 广域符印：作用范围倍率（1.2 = +20%）。 */
  wideSealAreaMul: number;
  /** 三连聚爆：满充能发的伤害倍率。 */
  burstDamageMul: number;
  /** 三连聚爆：满充能发的法阵半径倍率。 */
  burstRadiusMul: number;

  // —— 循环 —
  /** 元素蓄能：满充能发的伤害倍率。 */
  chargeDamageMul: number;

  // —— 脱离 —
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
  /** 镜像：残影可承受的接触伤害次数。 */
  mirrorDecoyHp: number;
}

export const MAGE_BALANCE: MageBalance = {
  castCycle: 0.55,
  castWindup: 0.35,
  castWindupInterruptible: 0.15,
  castInterval: 0.2,
  castRange: 260,
  circleRadius: 34,
  windupMovePenalty: 1.6,
  castDamageMul: 1.2,
  castIdleRetry: 0.1,

  burnStackCap: 4,
  burnDpsPerStack: 0.15,
  burnDuration: 5,
  frostStackCap: 3,
  frostSlowPerStack: 0.06,
  frostDuration: 5,
  frostElementBonus: 0.08,
  frostFreezeDuration: 1,
  frozenVuln: 0.1,
  paraDuration: 3,
  paraAttackSlow: 0.3,
  paraMoveSlow: 0.1,
  paraChainVuln: 0.1,
  chainChance: 0.3,
  chainJumps: 3,
  chainDamageMul: 0.4,
  chainRange: 90,

  resonanceRadius: 60,

  overloadSeconds: 3,
  meltDamageMul: 2.5,
  superChainBonusJumps: 2,
  superChainVuln: 0.15,

  chargeFull: 3,

  wardShieldPct: 0.12,
  wardShieldDuration: 1.2,
  echoShieldPct: 0.04,
  echoShieldDuration: 3,
  echoShieldCapPct: 0.25,

  meteorInterval: 3,
  meteorFall: 0.8,
  meteorRadius: 42,
  meteorDamageMul: 2.5,
  meteorCount: 2,
  domainDuration: 4,
  domainRadius: 46,
  domainDpsMul: 0.4,

  quickCastWindupMul: 0.7,
  continuousCastIntervalMul: 0.8,

  wideSealAreaMul: 1.2,
  burstDamageMul: 1.15,
  burstRadiusMul: 1.5,

  chargeDamageMul: 1.4,

  phaseRange: 80,
  phaseCooldown: 10,
  phaseInvuln: 0.5,
  mirrorCooldown: 12,
  mirrorDuration: 1,
  mirrorDecoyDuration: 3,
  mirrorDecoyHp: 1,
};
