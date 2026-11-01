import type { Talent } from "../../core/types";
import { MAGE_BALANCE as MB } from "../mageBalance";
import { MAGE_BUILD } from "../elementalMage";

/**
 * 元素法师保留的旧卡 + v177 玩家三选一构筑卡。
 *
 * 元素/反应/法杖成长由法杖等级发放（见 `data/elementalMage.ts` /
 * `core/MageProgressionSystem.ts`）。旧卡是 §16.3 暂保留的 6 张通用卡；
 * v177 新增 5 张构筑卡：霜雷共振、焰尾扩散、轮转、霜牢碎裂、满印成势。
 *
 * 旧卡：
 * - 速咏 / 连咏（节律）
 * - 护咒壁（原「咏唱护壁」改名；仍消费充能条）
 * - 相位 / 镜像（脱离）
 *
 * v178 重做生存/机动：护咒壁护盾提高到 20% 最大生命/3 秒；相位与镜像
 * 均规避触发本次伤害；删除广域符印，新增机动卡「踏影」。
 *
 * 已删除：炽焰印记、霜寒之力、闪电连锁、元素共振、双修、三修、
 * 星陨、多重陨星、元素残域、三连聚爆、元素蓄能、过载、回响、广域符印。
 */

/** 脱离槽的变体组 id：相位 / 镜像二选一。 */
export const MAGE_VARIANT_ESCAPE = "mage-escape";

export const MAGE_TALENTS: Talent[] = [
  // ================= 节律槽：缩短前摇与间隔 =================
  {
    n: "速咏",
    ico: "⏩",
    t: 0,
    cat: "节律",
    slot: "节律",
    layer: 1,
    prof: "mage",
    d: `施法前摇 −30%（${MB.castWindup.toFixed(2)} → ${(MB.castWindup * MB.quickCastWindupMul).toFixed(3)} 秒）`,
    max: 1,
    pv: () =>
      `前摇 ${MB.castWindup.toFixed(2)}s → ${(MB.castWindup * MB.quickCastWindupMul).toFixed(3)}s`,
    f: () => {},
    cur: () => "前摇缩短 30%",
  },
  {
    n: "连咏",
    ico: "🎼",
    t: 0,
    cat: "节律",
    slot: "节律",
    layer: 2,
    prof: "mage",
    requires: "速咏",
    d: `施法间隔 −20%（${MB.castInterval.toFixed(2)} → ${(MB.castInterval * MB.continuousCastIntervalMul).toFixed(2)} 秒）`,
    max: 1,
    pv: () =>
      `间隔 ${MB.castInterval.toFixed(2)}s → ${(MB.castInterval * MB.continuousCastIntervalMul).toFixed(2)}s`,
    f: () => {},
    cur: () => "施法间隔缩短 20%",
  },

  // ================= 循环槽：每 3 次成功施法给盾 =================
  {
    n: "护咒壁",
    ico: "🛡",
    t: 0,
    cat: "循环",
    slot: "循环",
    layer: 1,
    prof: "mage",
    d: `每 ${MB.chargeFull} 次成功施法获得护盾（最大生命 ${Math.round(MB.wardShieldPct * 100)}%，持续 ${MB.wardShieldDuration} 秒；不可叠层，重复触发刷新）`,
    max: 1,
    pv: () =>
      `护盾 ${Math.round(MB.wardShieldPct * 100)}% 最大生命 · 持续 ${MB.wardShieldDuration} 秒`,
    f: () => {},
    cur: () => `每 ${MB.chargeFull} 次施法获得 ${Math.round(MB.wardShieldPct * 100)}% 护盾`,
  },

  // ================= 机动槽：冲刺留下仇恨残影 =================
  {
    n: "踏影",
    ico: "👣",
    t: 0,
    cat: "机动",
    slot: "机动",
    layer: 1,
    prof: "mage",
    d: `冲刺时在起点留下持续 ${MB.shadowStepDecoyDuration} 秒的残影，敌人会转向攻击残影；不增加冲刺距离或充能`,
    max: 1,
    pv: () => `残影 ${MB.shadowStepDecoyDuration} 秒 · 冲刺起手`,
    f: () => {},
    cur: () => "冲刺留下仇恨残影",
  },

  // ================= 脱离槽：前摇被打断时的保险 =================
  {
    n: "相位",
    ico: "🌀",
    t: 0,
    cat: "脱离",
    slot: "脱离",
    layer: 1,
    prof: "mage",
    variant: MAGE_VARIANT_ESCAPE,
    d: `受击时传送到 ${MB.phaseRange}px 内没有敌人的位置；找不到落点时原地 ${MB.phaseInvuln} 秒无敌。两种结果都规避本次伤害，当前施法仍会被打断（${MB.phaseCooldown} 秒冷却）`,
    max: 1,
    pv: () => `传送 ${MB.phaseRange}px · 冷却 ${MB.phaseCooldown} 秒`,
    f: () => {},
    cur: () => "受击时传送并规避伤害",
  },
  {
    n: "镜像",
    ico: "👥",
    t: 0,
    cat: "脱离",
    slot: "脱离",
    layer: 1,
    prof: "mage",
    variant: MAGE_VARIANT_ESCAPE,
    d: `受击时规避本次伤害并留下残影吸引仇恨，自身进入 ${MB.mirrorDuration} 秒虚影（不可受击、无视碰撞、不能施法）（${MB.mirrorCooldown} 秒冷却）`,
    max: 1,
    pv: () => `虚影 ${MB.mirrorDuration} 秒 · 冷却 ${MB.mirrorCooldown} 秒`,
    f: () => {},
    cur: () => "受击时残影规避伤害",
  },

  // ================= v177 玩家构筑卡（三选一池） =================
  {
    n: MAGE_BUILD.chainResonance.name,
    ico: "❄⚡",
    t: 0,
    cat: "元素",
    slot: "共鸣",
    layer: 1,
    prof: "mage",
    mageRequiresReaction: "superconduct",
    d: `超导的闪电链额外 +${MAGE_BUILD.chainResonance.extraJumps} 跳、链伤害 +${Math.round(MAGE_BUILD.chainResonance.damageBonus * 100)}%。`,
    max: 1,
    pv: () => "超导链 +1 跳 · 链伤 +15%",
    f: () => {},
    cur: () => "超导链共振",
  },
  {
    n: MAGE_BUILD.blazeSpread.name,
    ico: "🔥",
    t: 0,
    cat: "范围",
    slot: "扩散",
    layer: 1,
    prof: "mage",
    mageRequiresReaction: "blaze",
    d: `裂焰小爆炸范围 +${Math.round((MAGE_BUILD.blazeSpread.radiusMul - 1) * 100)}%、目标 +${MAGE_BUILD.blazeSpread.extraTargets}；被小爆炸命中的目标获得 ${MAGE_BUILD.blazeSpread.burnStacks} 层灼烧。`,
    max: 1,
    pv: () => "裂焰溅射 +1 目标 · 灼烧",
    f: () => {},
    cur: () => "裂焰扩散",
  },
  {
    n: MAGE_BUILD.rotation.name,
    ico: "🔄",
    t: 0,
    cat: "节律",
    slot: "轮转",
    layer: 1,
    prof: "mage",
    mageMinElements: 2,
    d: `每个元素阶段的第一发反应伤害 +${Math.round(MAGE_BUILD.rotation.reactionBonus * 100)}%。`,
    max: 1,
    pv: () => "换元素首反应 +20%",
    f: () => {},
    cur: () => "阶段首反应强化",
  },
  {
    n: MAGE_BUILD.frostShatter.name,
    ico: "🧊",
    t: 0,
    cat: "控制",
    slot: "碎裂",
    layer: 1,
    prof: "mage",
    mageRequiresReaction: "frostbind",
    d: `霜牢自然结束或被融化时，向目标及附近 ${MAGE_BUILD.frostShatter.targets} 个敌人传播 ${MAGE_BUILD.frostShatter.frostStacks} 层凝冰。`,
    max: 1,
    pv: () => "霜牢结束 → 传播凝冰",
    f: () => {},
    cur: () => "霜牢碎裂控场",
  },
  {
    n: MAGE_BUILD.charge.name,
    ico: "⚡",
    t: 0,
    cat: "元素",
    slot: "满印",
    layer: 1,
    prof: "mage",
    mageMinElements: 2,
    d: `反应消耗 ${MAGE_BUILD.charge.layers} 层附着时，反应伤害 +${Math.round(MAGE_BUILD.charge.reactionBonus * 100)}%。`,
    max: 1,
    pv: () => "3 层反应 +20%",
    f: () => {},
    cur: () => "满层反应强化",
  },

  // v165：旧元素 / 反应 / 星陨 / 蓄能等 14 张退役卡已按用户要求删除，
  // 不再进入图鉴或任何抽取池；旧图鉴键由 CodexStore 原样保留。
];
