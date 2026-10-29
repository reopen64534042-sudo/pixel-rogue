/**
 * 射手职业被动「强化箭」的等级与升级表。
 *
 * 设计口径（2026-10-29 用户确认，2026-10-30 扩展为 12 级）：
 * - 核心 3 级：L1 基础 → L2 强化 → L3 无限穿透；
 * - L4-L12 每级随机获得 1 条升级，最多 9 条，已获得的升级保留并共存；
 * - 升级形态是附加效果，无限穿透始终优先，不替换主弹道；
 * - 普通弹默认不继承升级，后续用「同化」升级单独开启。
 */

export type SpecialUpgradeId =
  | "doubleShot"
  | "trueDamage"
  | "currentHpDamage"
  | "homing"
  | "bounce"
  | "missile"
  | "partialTrue"
  | "maxHpDamage"
  | "laser";

export interface SpecialLevelStats {
  /** 升到下一级所需经验；满级为 null */
  readonly xpToNext: number | null;
  /** 强化箭伤害倍率（相对普通魔弹） */
  readonly mul: number;
  /** 额外穿透目标数；无限穿透时为 0 */
  readonly pierceBonus: number;
  readonly infinitePierce: boolean;
  /** 升到本级时是否随机获得一条升级 */
  readonly grantsUpgrade: boolean;
}

export const SPECIAL_LEVELS: readonly SpecialLevelStats[] = [
  { xpToNext: 8, mul: 1.5, pierceBonus: 1, infinitePierce: false, grantsUpgrade: false },
  { xpToNext: 20, mul: 1.7, pierceBonus: 2, infinitePierce: false, grantsUpgrade: false },
  { xpToNext: 36, mul: 1.9, pierceBonus: 0, infinitePierce: true, grantsUpgrade: false },
  { xpToNext: 56, mul: 2.0, pierceBonus: 0, infinitePierce: true, grantsUpgrade: true },
  { xpToNext: 80, mul: 2.1, pierceBonus: 0, infinitePierce: true, grantsUpgrade: true },
  { xpToNext: 100, mul: 2.25, pierceBonus: 0, infinitePierce: true, grantsUpgrade: true },
  { xpToNext: 125, mul: 2.3, pierceBonus: 0, infinitePierce: true, grantsUpgrade: true },
  { xpToNext: 155, mul: 2.35, pierceBonus: 0, infinitePierce: true, grantsUpgrade: true },
  { xpToNext: 190, mul: 2.4, pierceBonus: 0, infinitePierce: true, grantsUpgrade: true },
  { xpToNext: 230, mul: 2.45, pierceBonus: 0, infinitePierce: true, grantsUpgrade: true },
  { xpToNext: 275, mul: 2.5, pierceBonus: 0, infinitePierce: true, grantsUpgrade: true },
  { xpToNext: null, mul: 2.6, pierceBonus: 0, infinitePierce: true, grantsUpgrade: true },
];

export function getSpecialLevelStats(level: number): SpecialLevelStats {
  const index = Math.min(Math.max(1, level), SPECIAL_LEVELS.length) - 1;
  return SPECIAL_LEVELS[index];
}

export interface SpecialUpgrade {
  readonly id: SpecialUpgradeId;
  readonly name: string;
  readonly desc: string;
}

/** 连发两颗升级：每颗弹丸的伤害倍率 */
export const DOUBLE_SHOT_DAMAGE_MUL = 0.8;
/** 强化箭直击与轨迹的吸血效率（普通弹为 100%） */
export const SPECIAL_LIFESTEAL_MUL = 0.3;
/** 附带真实伤害：额外真实伤害占强化箭原始伤害的比例 */
export const PARTIAL_TRUE_FRACTION = 0.3;
/** 当前生命伤害：目标当前生命的比例 */
export const CURRENT_HP_DAMAGE_FRACTION = 0.05;
/** 最大生命伤害：目标最大生命的比例 */
export const MAX_HP_DAMAGE_FRACTION = 0.02;
/** 当前/最大生命附加伤害的上限：强化箭当前伤害的倍数 */
export const HP_DAMAGE_CAP_MUL = 2;
/** 完全追踪：转向速率（弧度/秒）与索敌半径 */
export const HOMING_TURN_RATE = 6;
export const HOMING_RANGE = 280;
/** 反弹升级：最大边界反弹次数与每次反弹后的伤害倍率 */
export const BOUNCE_COUNT = 3;
export const BOUNCE_DAMAGE_MUL = 0.9;
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
  {
    id: "doubleShot",
    name: "连发两颗",
    desc: "强化箭每次发射两颗，每颗造成 80% 伤害",
  },
  {
    id: "trueDamage",
    name: "完全真实伤害",
    desc: "强化箭无视护甲、抗性与韧性",
  },
  {
    id: "currentHpDamage",
    name: "当前生命伤害",
    desc: "强化箭额外造成目标当前生命 5% 的物理伤害，最多不超过强化箭伤害的 2 倍",
  },
  {
    id: "homing",
    name: "完全追踪",
    desc: "强化箭会转向最近的敌人",
  },
  {
    id: "bounce",
    name: "反弹",
    desc: "强化箭碰到世界边界反弹，最多 3 次，第 3 次后消失；可与追踪共存",
  },
  {
    id: "missile",
    name: "导弹",
    desc: "强化箭首次命中时爆炸，造成范围物理伤害并留下燃烧地带",
  },
  {
    id: "partialTrue",
    name: "附带真实伤害",
    desc: "强化箭额外造成 30% 真实伤害",
  },
  {
    id: "maxHpDamage",
    name: "最大生命伤害",
    desc: "强化箭额外造成目标最大生命 2% 的物理伤害，最多不超过强化箭伤害的 2 倍",
  },
  {
    id: "laser",
    name: "激光",
    desc: "强化箭发射时额外发射一道激光，命中路径上的敌人",
  },
];
