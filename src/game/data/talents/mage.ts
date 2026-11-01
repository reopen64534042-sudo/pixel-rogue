import type { Talent } from "../../core/types";
import { MAGE_BALANCE as MB } from "../mageBalance";

/**
 * 元素法师保留的旧卡。
 *
 * 元素法师 v2 的元素、反应与池子改由法杖等级发放（见
 * `data/elementalMage.ts` / `core/MageProgressionSystem.ts`）。这里只保留
 * 文档 §16.3 明确「暂保留」的旧卡，等法师池重排时统一处理：
 *
 * - 速咏 / 连咏（节律）
 * - 广域符印（范围）
 * - 护咒壁（原「咏唱护壁」改名；仍消费充能条）
 * - 相位 / 镜像（脱离）
 *
 * 已删除：炽焰印记、霜寒之力、闪电连锁、元素共振、双修、三修、
 * 星陨、多重陨星、元素残域、三连聚爆、元素蓄能、过载、回响。
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

  // ================= 范围槽：法阵大小 =================
  {
    n: "广域符印",
    ico: "🌐",
    t: 0,
    cat: "范围",
    slot: "范围",
    layer: 1,
    prof: "mage",
    d: "法阵作用范围 +20%",
    max: 1,
    pv: (p) =>
      `法阵半径 ${Math.round(MB.circleRadius * p.area)}px → ${Math.round(MB.circleRadius * p.area * MB.wideSealAreaMul)}px`,
    f: () => {},
    cur: (p) =>
      `法阵半径 ${Math.round(MB.circleRadius * p.area * MB.wideSealAreaMul)}px`,
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
    d: `每 ${MB.chargeFull} 次成功施法获得护盾（最大生命 ${Math.round(MB.wardShieldPct * 100)}%，持续 ${MB.wardShieldDuration} 秒，不可叠层）`,
    max: 1,
    pv: () =>
      `护盾 ${Math.round(MB.wardShieldPct * 100)}% 最大生命 · 持续 ${MB.wardShieldDuration} 秒`,
    f: () => {},
    cur: () => "每 3 次成功施法获得护盾",
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
    d: "受击时传送到 80px 内没有敌人的位置；找不到落点时改为 0.5 秒无敌（10 秒冷却）",
    max: 1,
    pv: () => `传送 ${MB.phaseRange}px · 冷却 ${MB.phaseCooldown} 秒`,
    f: () => {},
    cur: () => "受击时相位传送",
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
    d: "受击时留下残影吸引仇恨，自身进入 1 秒虚影（不可受击、无视碰撞、不能施法）（12 秒冷却）",
    max: 1,
    pv: () => `虚影 ${MB.mirrorDuration} 秒 · 冷却 ${MB.mirrorCooldown} 秒`,
    f: () => {},
    cur: () => "受击时留下残影",
  },

  // v165：旧元素 / 反应 / 星陨 / 蓄能等 14 张退役卡已按用户要求删除，
  // 不再进入图鉴或任何抽取池；旧图鉴键由 CodexStore 原样保留。
];
