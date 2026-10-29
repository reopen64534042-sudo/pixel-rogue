import type { Talent } from "../../core/types";
import { SPECIAL_SHOT_EVERY } from "../constants";

/**
 * 射手池（S2）。
 *
 * 设计约束（见 docs/talent-pool-design-rules.md）：
 * - **槽位由门控推导**：射手的是「距离门控」——被贴身即失效，所以槽位是
 *   核心（强化弹装填）/ 标记（强化弹穿排）/ 距离（远距收益）/ 生存（闪避装填）/
 *   脱离（接触装填）/ 机动（冲刺装填）。
 * - **一槽一条轴**：同槽位内的三层是递进关系（L1 开通 → L2 放大 → L3 转向）。
 * - **天赋一次性获得**：全部 `max: 1`，不提供伤害数值，伤害来自属性系统。
 *   因此所有 `f` 都是空操作——机制通过 `upCounts` 在消费点读取，
 *   属性通过 `core/TalentStatSources.ts` 的权威来源表声明。
 * - **L3 必须是「转向」而非「更强」**：贯穿轨迹把强化弹变成持续伤害区，
 *   齐射把单发强化弹变成多目标弹幕，赌命把闪避窗口变成高风险高回报。
 *

 */
export const SHOOTER_TALENTS: Talent[] = [
  // ================= 核心槽：强化弹 =================
  {
    n: "快速装填",
    ico: "🏹",
    t: 0,
    cat: "核心",
    slot: "核心",
    layer: 1,
    prof: "shooter",
    d: "强化弹每 4 发触发 → 每 3 发；强化弹穿透 +1，穿透伤害 50% → 80%",
    max: 1,
    pv: () => "每 4→3 发 · 穿透 +1 · 穿透伤害 80%",
    f: () => {},
    cur: (p) =>
      `当前每 ${Math.max(
        1,
        SPECIAL_SHOT_EVERY -
          ((p.upCounts["快速装填"] || 0) > 0 ? 1 : 0) -
          ((p.upCounts["超载装填"] || 0) > 0 ? 1 : 0),
      )} 发 · 穿透 ${p.pierce} 次 · 衰减 ${(p.pierceFalloff * 100).toFixed(0)}%`,
  },
  {
    n: "超载装填",
    ico: "➡️",
    t: 0,
    cat: "核心",
    slot: "核心",
    layer: 2,
    prof: "shooter",
    requires: "快速装填",
    d: "强化弹每 3 发触发 → 每 2 发；强化弹穿透再 +1，穿透后伤害不再衰减（100%）",
    max: 1,
    pv: () => "每 3→2 发 · 穿透 +1 · 不衰减",
    f: () => {},
    cur: (p) =>
      `当前每 ${Math.max(
        1,
        SPECIAL_SHOT_EVERY -
          ((p.upCounts["快速装填"] || 0) > 0 ? 1 : 0) -
          ((p.upCounts["超载装填"] || 0) > 0 ? 1 : 0),
      )} 发 · 穿透 ${p.pierce} 次 · 衰减 ${(p.pierceFalloff * 100).toFixed(0)}%`,
  },
  {
    n: "贯穿轨迹",
    ico: "〰️",
    t: 0,
    cat: "核心",
    slot: "核心",
    layer: 3,
    prof: "shooter",
    requires: "超载装填",
    excludes: ["齐射"],
    d: "强化弹路径留下 0.6 秒能量线，穿过其间的敌人各受一次 15% 伤害",
    max: 1,
    pv: () => "强化弹能量线 0.6 秒 · 15% 伤害",
    f: () => {},
    cur: () => "强化弹弹道留下能量线",
  },
  {
    n: "齐射",
    ico: "🔱",
    t: 0,
    cat: "核心",
    slot: "核心",
    layer: 3,
    prof: "shooter",
    requires: "超载装填",
    excludes: ["贯穿轨迹"],
    d: "强化弹一次发射 3 发，每发造成 50% 伤害；普通射击不变",
    max: 1,
    pv: () => "强化弹 3 发 × 50% 伤害",
    f: () => {},
    cur: () => "强化弹一次 3 发",
  },

  // ================= 标记槽：强化弹穿排 =================
  {
    n: "贯穿标记",
    ico: "🎯",
    t: 0,
    cat: "标记",
    slot: "标记",
    layer: 1,
    prof: "shooter",
    d: "强化弹命中时给目标上 1 层标记：受到强化弹伤害 +15%；普通命中不叠",
    max: 1,
    pv: () => "强化弹上标记 · +15% 受伤",
    f: () => {},
    cur: () => "标记 1 层 · 强化弹 +15%",
  },
  {
    n: "深痕",
    ico: "🩸",
    t: 0,
    cat: "标记",
    slot: "标记",
    layer: 2,
    prof: "shooter",
    requires: "贯穿标记",
    d: "标记可叠 2 层，每层 +15%（共 +30%）；标记常驻，不因换目标清空",
    max: 1,
    pv: () => "标记 2 层 · 共 +30%",
    f: () => {},
    cur: () => "标记 2 层 · 强化弹 +30%",
  },
  {
    n: "处决",
    ico: "⚔️",
    t: 0,
    cat: "标记",
    slot: "标记",
    layer: 3,
    prof: "shooter",
    requires: "深痕",
    d: "对生命低于 20% 的标记目标，强化弹必暴且暴击伤害 +40%",
    max: 1,
    pv: () => "处决线 20% · 强化弹必暴 +40% 暴伤",
    f: () => {},
    cur: () => "处决：低血标记目标强化弹必暴",
  },

  // ================= 距离槽：远距收益 =================
  {
    n: "长弓",
    ico: "🏹",
    t: 0,
    cat: "距离",
    slot: "距离",
    layer: 1,
    prof: "shooter",
    variant: "shooter-distance",
    d: "射程 +15%",
    max: 1,
    pv: (p) => `射程 ${Math.round(p.attackRange)} → ${Math.round(p.attackRange * 1.15)}`,
    f: () => {},
    cur: (p) => `当前射程 ${Math.round(p.attackRange)}`,
  },
  {
    n: "短弓",
    ico: "🎻",
    t: 0,
    cat: "距离",
    slot: "距离",
    layer: 1,
    prof: "shooter",
    variant: "shooter-distance",
    d: "射程 −10%，攻速 +20%",
    max: 1,
    pv: (p) =>
      `射程 ${Math.round(p.attackRange)} → ${Math.round(p.attackRange * 0.9)}，攻速 ${p.fireRate.toFixed(2)} → ${(p.fireRate * 1.2).toFixed(2)}`,
    f: () => {},
    cur: (p) =>
      `射程 ${Math.round(p.attackRange)} · 攻速 ${p.fireRate.toFixed(2)}/秒`,
  },
  {
    n: "距离即收益",
    ico: "📏",
    t: 0,
    cat: "距离",
    slot: "距离",
    layer: 1,
    prof: "shooter",
    d: "距离达射程的 50% / 75% / 92% 时伤害 +5% / +15% / +25%；满档额外 +10% 暴击率与强化弹 +1 穿透",
    max: 1,
    pv: (p) =>
      `${Math.round(p.attackRange * 0.5)}px +5% · ${Math.round(p.attackRange * 0.75)}px +15% · ${Math.round(p.attackRange * 0.92)}px +25% 且 +10% 暴击、强化弹 +1 穿透`,
    f: () => {},
    cur: (p) => `当前档位按射程 ${Math.round(p.attackRange)}px 换算`,
  },

  // ================= 生存槽：闪避装填 =================
  {
    n: "冷读",
    ico: "🧊",
    t: 0,
    cat: "生存",
    slot: "生存",
    layer: 1,
    prof: "shooter",
    variant: "shooter-dodge",
    d: "闪避成功后，下一发为强化弹且必定暴击",
    max: 1,
    pv: () => "闪避 → 下一发强化弹必暴",
    f: () => {},
    cur: () => "闪避后下一发强化弹必暴",
  },
  {
    n: "滞空",
    ico: "🪂",
    t: 0,
    cat: "生存",
    slot: "生存",
    layer: 1,
    prof: "shooter",
    variant: "shooter-dodge",
    d: "闪避成功后 0.5 秒无敌、移速 +20%，并装填一发强化弹",
    max: 1,
    pv: () => "闪避 → 0.5 秒无敌 + 20% 移速 + 装填强化弹",
    f: () => {},
    cur: () => "闪避后 0.5 秒无敌并装填强化弹",
  },
  {
    n: "余韵",
    ico: "🌙",
    t: 0,
    cat: "生存",
    slot: "生存",
    layer: 2,
    prof: "shooter",
    req: (p) =>
      (p.upCounts["冷读"] || 0) > 0 || (p.upCounts["滞空"] || 0) > 0,
    d: "闪避成功后 1.5 秒内，下一发强化弹伤害 +30%",
    max: 1,
    pv: () => "闪避 → 1.5 秒内下一发强化弹 +30%",
    f: () => {},
    cur: () => "闪避后下一发强化弹 +30%",
  },
  {
    n: "赌命",
    ico: "🎲",
    t: 0,
    cat: "生存",
    slot: "生存",
    layer: 3,
    prof: "shooter",
    requires: "余韵",
    d: "闪避后 2 秒内所有射击变为强化弹且必定暴击，但受到伤害 +25%；生命低于 30% 时窗口延长至 4 秒",
    max: 1,
    pv: () => "2 秒全强化弹必暴（低血 4 秒）· 受伤 +25%",
    f: () => {},
    cur: () => "闪避后全强化弹必暴窗口",
  },

  // ================= 脱离槽：被贴身自救 =================
  {
    n: "惊弓",
    ico: "💥",
    t: 0,
    cat: "脱离",
    slot: "脱离",
    layer: 1,
    prof: "shooter",
    variant: "shooter-escape",
    d: "被敌人接触时自动弹开 40px，并装填一发强化弹（3 秒冷却）",
    max: 1,
    pv: () => "接触弹开 40px + 装填强化弹 · 3 秒冷却",
    f: () => {},
    cur: () => "接触自动弹开并装填强化弹",
  },
  {
    n: "逆矢",
    ico: "↩️",
    t: 0,
    cat: "脱离",
    slot: "脱离",
    layer: 1,
    prof: "shooter",
    variant: "shooter-escape",
    d: "敌人进入近身距离时自动反击一发 150% 伤害的强化弹（3 秒冷却）",
    max: 1,
    pv: () => "近身反击 150% 强化弹 · 3 秒冷却",
    f: () => {},
    cur: () => "近身自动反击强化弹",
  },

  // ================= 机动槽：冲刺装填 =================
  {
    n: "双段疾冲",
    ico: "🚀",
    t: 0,
    cat: "机动",
    slot: "机动",
    layer: 1,
    prof: "shooter",
    variant: "shooter-dash",
    d: "冲刺充能 +1 段；每次冲刺使强化弹装填计数 +1",
    max: 1,
    pv: (p) => `冲刺充能 ${1 + p.dashChargeLv} → ${2 + p.dashChargeLv} 段 · 冲刺推进装填`,
    f: () => {},
    cur: (p) => `冲刺充能上限 ${1 + p.dashChargeLv} 段`,
  },
  {
    n: "疾行",
    ico: "💨",
    t: 0,
    cat: "机动",
    slot: "机动",
    layer: 1,
    prof: "shooter",
    variant: "shooter-dash",
    d: "冲刺距离 +25%，冲刺结束 0.5 秒内射速 +20%；冲刺结束后的下一发为强化弹",
    max: 1,
    pv: () => "冲刺距离 +25% · 结束后 0.5 秒 +20% 射速 · 下一发强化弹",
    f: () => {},
    cur: (p) =>
      `冲刺距离 ×${p.dashDistMul.toFixed(2)} · 射速窗口 +20% · 下一发强化弹`,
  },
];
