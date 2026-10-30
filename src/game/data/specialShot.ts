/**
 * 射手职业被动「强化弹」的等级与升级表。
 *
 * 设计口径（2026-10-29 用户确认，2026-10-30 扩展为 12 级）：
 * - L1-L2 无额外穿透，L3 起每 3 级 +1：L3=1、L6=2、L9=3，L9-L12 保持 3；
 * - L3 起强化弹无限飞行；穿透耗尽或飞出世界边界时消失；
 * - L4-L12 每级随机获得 1 条升级，最多 9 条，已获得的升级保留并共存；
 * - 获取顺序为「固定档位 + 档内加权随机」：第 1 抽只出基础形态（连发/导弹/附带真实伤害），
 *   第 2 抽起解锁激光、两系生命伤害与裂变，第 3 抽起解锁完全追踪与完全真实伤害；
 * - 升级形态是附加效果，不替换主弹道；
 * - 普通弹默认不继承升级，后续用「同化」升级单独开启。
 */

export type SpecialUpgradeId =
  | "doubleShot"
  | "trueDamage"
  | "currentHpDamage"
  | "homing"
  | "fission"
  | "missile"
  | "partialTrue"
  | "maxHpDamage"
  | "laser";

export interface SpecialLevelStats {
  /** 升到下一级所需经验；满级为 null */
  readonly xpToNext: number | null;
  /** 强化弹伤害倍率（相对普通魔弹） */
  readonly mul: number;
  /** 当前等级的额外穿透目标数（L1-L2 为 0，L9 起为 3） */
  readonly pierceBonus: number;
  /** 本级起强化弹是否无限飞行（不因射程寿命消失） */
  readonly infiniteFlight: boolean;
  /** 升到本级时是否随机获得一条升级 */
  readonly grantsUpgrade: boolean;
}

export const SPECIAL_LEVELS: readonly SpecialLevelStats[] = [
  { xpToNext: 8, mul: 1.5, pierceBonus: 0, infiniteFlight: false, grantsUpgrade: false },
  { xpToNext: 20, mul: 1.7, pierceBonus: 0, infiniteFlight: false, grantsUpgrade: false },
  { xpToNext: 36, mul: 1.9, pierceBonus: 1, infiniteFlight: true, grantsUpgrade: false },
  { xpToNext: 56, mul: 2.0, pierceBonus: 1, infiniteFlight: true, grantsUpgrade: true },
  { xpToNext: 80, mul: 2.1, pierceBonus: 1, infiniteFlight: true, grantsUpgrade: true },
  { xpToNext: 100, mul: 2.25, pierceBonus: 2, infiniteFlight: true, grantsUpgrade: true },
  { xpToNext: 125, mul: 2.3, pierceBonus: 2, infiniteFlight: true, grantsUpgrade: true },
  { xpToNext: 155, mul: 2.35, pierceBonus: 2, infiniteFlight: true, grantsUpgrade: true },
  { xpToNext: 190, mul: 2.4, pierceBonus: 3, infiniteFlight: true, grantsUpgrade: true },
  { xpToNext: 230, mul: 2.45, pierceBonus: 3, infiniteFlight: true, grantsUpgrade: true },
  { xpToNext: 275, mul: 2.5, pierceBonus: 3, infiniteFlight: true, grantsUpgrade: true },
  { xpToNext: null, mul: 2.6, pierceBonus: 3, infiniteFlight: true, grantsUpgrade: true },
];

export function getSpecialLevelStats(level: number): SpecialLevelStats {
  const index = Math.min(Math.max(1, level), SPECIAL_LEVELS.length) - 1;
  return SPECIAL_LEVELS[index];
}

export interface SpecialUpgrade {
  readonly id: SpecialUpgradeId;
  readonly name: string;
  readonly desc: string;
  /** 档内抽取权重（同档内越大越容易抽到） */
  readonly weight: number;
  /** 从第几次强化弹升级开始可被抽到（1 = L4 首抽） */
  readonly minPick: number;
}

/** 连发两颗升级：每颗弹丸的伤害倍率 */
export const DOUBLE_SHOT_DAMAGE_MUL = 0.8;
/** 强化弹直击与轨迹的吸血效率（普通弹为 100%） */
export const SPECIAL_LIFESTEAL_MUL = 0.3;
/** 附带真实伤害：额外真实伤害占强化弹原始伤害的比例 */
export const PARTIAL_TRUE_FRACTION = 0.3;
/** 当前生命伤害：目标当前生命的比例 */
export const CURRENT_HP_DAMAGE_FRACTION = 0.05;
/** 最大生命伤害：目标最大生命的比例 */
export const MAX_HP_DAMAGE_FRACTION = 0.02;
/** 当前/最大生命附加伤害的上限：强化弹当前伤害的倍数 */
export const HP_DAMAGE_CAP_MUL = 2;
/** 完全追踪：转向速率（弧度/秒）与索敌半径 */
export const HOMING_TURN_RATE = 6;
export const HOMING_RANGE = 280;
/** 裂变：强化弹击杀时碎片数量、伤害倍率、索敌半径、速度与寿命 */
export const FISSION_FRAGMENTS = 2;
export const FISSION_DAMAGE_MUL = 0.5;
export const FISSION_RANGE = 160;
export const FISSION_SPEED = 260;
export const FISSION_LIFE = 0.6;
/** 导弹升级：爆炸半径、伤害倍率、燃烧持续时间与 DPS 倍率 */
export const MISSILE_RADIUS = 34;
export const MISSILE_DAMAGE_MUL = 0.6;
export const MISSILE_BURN_DURATION = 3;
export const MISSILE_BURN_DPS_MUL = 0.15;
/** 导弹弹道：转向速率与出膛侧向初速，形成可见弧线 */
export const MISSILE_TURN_RATE = 6;
export const MISSILE_LATERAL_KICK = 70;
/** 导弹/激光从玩家另一侧肩位出射的横向偏移 */
export const OFFHAND_OFFSET = 10;
/** 激光升级：伤害倍率、射程倍率与判定宽度 */
export const LASER_DAMAGE_MUL = 0.5;
export const LASER_RANGE_MUL = 1.4;
export const LASER_WIDTH = 6;

export const SPECIAL_UPGRADES: readonly SpecialUpgrade[] = [
  // 第 1 抽（L4）：基础形态，改变手感但不直接决定整局强度
  {
    id: "doubleShot",
    name: "连发两颗",
    desc: "强化弹每次发射两颗，每颗造成 80% 伤害",
    weight: 3,
    minPick: 1,
  },
  {
    id: "missile",
    name: "导弹",
    desc: "强化弹首次命中时爆炸，造成范围物理伤害并留下燃烧地带",
    weight: 3,
    minPick: 1,
  },
  {
    id: "partialTrue",
    name: "附带真实伤害",
    desc: "强化弹额外造成 30% 真实伤害",
    weight: 2,
    minPick: 1,
  },

  // 第 2 抽（L5）起：独立伤害来源与两系生命伤害
  {
    id: "laser",
    name: "激光",
    desc: "强化弹发射时额外发射一道激光，命中路径上的敌人",
    weight: 2,
    minPick: 2,
  },
  {
    id: "currentHpDamage",
    name: "当前生命伤害",
    desc: "强化弹额外造成目标当前生命 5% 的物理伤害，最多不超过强化弹伤害的 2 倍",
    weight: 2,
    minPick: 2,
  },
  {
    id: "maxHpDamage",
    name: "最大生命伤害",
    desc: "强化弹额外造成目标最大生命 2% 的物理伤害，最多不超过强化弹伤害的 2 倍",
    weight: 2,
    minPick: 2,
  },
  {
    id: "fission",
    name: "裂变",
    desc: "强化弹击杀敌人时，向附近最多 2 个敌人发射 50% 伤害的碎片",
    weight: 2,
    minPick: 2,
  },

  // 第 3 抽（L6）起：质变件，权重压低，通常落在 L7-L9
  {
    id: "homing",
    name: "完全追踪",
    desc: "强化弹会转向最近的敌人",
    weight: 1,
    minPick: 3,
  },
  {
    id: "trueDamage",
    name: "完全真实伤害",
    desc: "强化弹无视护甲、抗性与韧性",
    weight: 1,
    minPick: 3,
  },
];
