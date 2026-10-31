import type { Talent } from "../../core/types";
import {
  frostFreezeDuration,
  burnStackDps,
  critMultiplier,
} from "../../core/DamageMath";
import { hasteCap, physMitPct } from "./common";

/**
 * 旧版通用天赋表（v40 及以前）。
 *
 * S2 起本表整体退役：`UPGRADES` 的条目全部标记 `hidden`，不再进入抽取池。
 * 卡名同时是图鉴 id（`codex.syncTalents`），因此除用户明确要求彻底删除的卡外
 * 仍在表内保留实现。v138 已按用户要求移除「能量护盾」与旧「不屈」；
 * `tests/parity.test.ts` 的 41 张逐字段对照基线因此过期，留待授权测试批次统一处理。
 */
export const LEGACY_UPGRADES: Talent[] = [
  {
    retired: 1,
    n: "强化弹丸",
    ico: "🔥",
    t: 0,
    cat: "攻击",
    d: "魔弹伤害 +25%（仅魔弹）",
    max: 30,
    pv: (p) =>
      `魔弹伤害 ${(p.damage * p.boltDmgMul).toFixed(1)} → ${(p.damage * p.boltDmgMul * 1.25).toFixed(1)}`,
    // S4-C C2-B：boltDmgMul ×1.25/级 由权威来源表声明（core/TalentStatSources.ts，
    // boltDmgMul final 逐次连乘），learnTalent/recompute/melt 统一经投影写入；
    // 本卡无获得时即时效果。
    f: () => {},
    cur: (p) =>
      `魔弹伤害 ${(p.damage * p.boltDmgMul).toFixed(1)}（仅魔弹，全局伤害 ${p.damage.toFixed(1)}）`,
  },
  {
    retired: 1,
    n: "疾速扳机",
    ico: "⚡",
    t: 0,
    cat: "攻击",
    d: "攻速 +18%",
    max: 8,
    pv: (p) =>
      `攻速 ${p.fireRate.toFixed(2)} → ${(p.fireRate * 1.18).toFixed(2)}/秒`,
    // S4-C C2-B：fireRate ×1.18/级 由权威来源表声明（core/TalentStatSources.ts）。
    // 击杀狂热/战意沸腾的动态攻速仍在消费点（AttackSystem 开火公式）实时乘算。
    f: () => {},
    cur: (p) => `当前攻速 ${p.fireRate.toFixed(2)}/秒`,
  },
  {
    retired: 1,
    n: "疾风之靴",
    ico: "👟",
    t: 0,
    cat: "增幅",
    d: "移动速度 +10%",
    max: 6,
    pv: (p) => `移速 ${Math.round(p.speed)} → ${Math.round(p.speed * 1.1)}`,
    // S4-C C2-B：speed ×1.1/级 由权威来源表声明（core/TalentStatSources.ts，
    // moveSpeed StatId）；冲刺的固定 280 px/s 运动不读 speed，不受影响。
    f: () => {},
    cur: (p) => `当前移速 ${Math.round(p.speed)}`,
  },
  {
    retired: 1,
    n: "生命之泉",
    ico: "❤️",
    t: 0,
    cat: "增幅",
    d: "生命上限 +20 并回满",
    max: 99,
    pv: (p) => `上限 ${p.maxhp} → ${p.maxhp + 20}，并回满`,
    // S4-C C3-A：maxhp +20/级 由权威来源表声明（core/TalentStatSources.ts，
    // maxHp flat）；「回满」为获得时效果（core/OnAcquireEffects.ts），仅在
    // learnTalent 成功获得时执行一次，recompute 绝不重放（D-C3-01/契约 §5.2）。
    f: () => {},
    cur: (p) => `当前生命上限 ${p.maxhp}`,
  },
  {
    retired: 1,
    n: "磁力护符",
    ico: "🧲",
    t: 0,
    cat: "增幅",
    d: "拾取范围 +40%",
    max: 5,
    pv: (p) => `拾取 ${Math.round(p.magnet)} → ${Math.round(p.magnet * 1.4)}`,
    // S4-C C2-B：magnet ×1.4/级 由权威来源表声明（core/TalentStatSources.ts）；
    // 血瓶吸附半径 magnet×0.4 在消费点（ProgressionSystem）实时读取。
    f: () => {},
    cur: (p) => `当前拾取范围 ${Math.round(p.magnet)}`,
  },
  {
    retired: 1,
    n: "致命一击",
    ico: "💥",
    t: 1,
    cat: "攻击",
    d: "暴击率 +10%（叠满 8 层觉醒：暴击伤害 +40%）",
    max: 8,
    pv: (p) =>
      `暴击 ${(p.crit * 100).toFixed(0)}% → ${((p.crit + 0.1) * 100).toFixed(0)}%${p.crit + 0.1 >= 0.8 ? "（觉醒!）" : ""}`,
    // S4-C C1：crit +0.1/级 由权威来源表声明（core/TalentStatSources.ts），
    // learnTalent/recompute/melt 统一经投影写入；本卡无获得时即时效果。
    // 觉醒暴伤 +0.4 保持读时判定（DamageMath.critMultiplier）。
    f: () => {},
    cur: (p) =>
      `当前暴击率 ${(p.crit * 100).toFixed(0)}% · 爆伤 ×${critMultiplier(p).toFixed(1)}${
        (p.upCounts["致命一击"] || 0) >= 8 ? "（觉醒）" : ""
      }`,
  },
  {
    retired: 1,
    n: "守护之刃",
    ico: "🗡️",
    t: 1,
    cat: "技能",
    d: "+1 把环绕飞刃",
    max: 4,
    pv: (p) => `飞刃 ${p.orbit} → ${p.orbit + 1}`,
    f: (p) => p.orbit++,
    cur: (p) => `当前飞刃 ${p.orbit} 把`,
  },
  {
    retired: 1,
    n: "修复微光",
    ico: "✨",
    t: 0,
    cat: "增幅",
    d: "每秒回复 0.6 生命",
    max: 4,
    pv: (p) => `回复 ${p.regen.toFixed(1)} → ${(p.regen + 0.6).toFixed(1)}/秒`,
    f: (p) => (p.regen += 0.6),
    cur: (p) => `每秒生命回复 ${p.regen.toFixed(1)}`,
  },
  // ---- 机制型天赋 ----
  {
    retired: 1,
    n: "广域法印",
    ico: "🌐",
    t: 1,
    cat: "技能",
    d: "施法范围 +20%（子弹 / 陨星 / 爆炸 / 飞刃）",
    max: 4,
    mech: 1,
    pv: (p) => `范围 ×${p.area.toFixed(2)} → ×${(p.area * 1.2).toFixed(2)}`,
    // S4-C C2-B：area ×1.2/级 由权威来源表声明（core/TalentStatSources.ts）。
    // 弹丸尺寸/陨星半径生成时固化，飞刃位置/半径与爆炸半径实时读取——
    // 既有读写时机不变。
    f: () => {},
    cur: (p) => `施法范围加成 ×${p.area.toFixed(2)}`,
  },
  {
    retired: 1,
    n: "会心深渊",
    ico: "🌑",
    t: 2,
    cat: "攻击",
    d: "暴击伤害 +50%",
    max: 4,
    mech: 1,
    pv: (p) =>
      `暴伤 ×${p.critMul.toFixed(1)} → ×${(p.critMul + 0.5).toFixed(1)}`,
    // S4-C C1：critMul +0.5/级 由权威来源表声明（core/TalentStatSources.ts），
    // learnTalent/recompute/melt 统一经投影写入；本卡无获得时即时效果。
    f: () => {},
    cur: (p) => `暴击伤害倍率 ×${p.critMul.toFixed(1)}`,
  },
  {
    retired: 1,
    n: "弹射魔符",
    ico: "🪃",
    t: 2,
    cat: "技能",
    d: "子弹命中后弹向未命中的敌人（每跳 ×0.85）",
    max: 3,
    mech: 1,
    pv: (p) => `弹射 ${p.ricochet} → ${p.ricochet + 1} 次`,
    f: (p) => p.ricochet++,
    cur: (p) => `当前弹射次数 ${p.ricochet} 次`,
  },
  {
    retired: 1,
    n: "烈焰印记",
    ico: "♨️",
    t: 1,
    cat: "技能",
    d: "命中叠加灼烧，最多 4 层，每层 10% 伤害/秒",
    max: 1,
    mech: 1,
    pv: (p) => `每层 DPS ${Math.round(burnStackDps(p, 1))}（上限 4 层）`,
    f: (p) => p.burn++,
    cur: (p) =>
      `灼烧叠层制 · 每层 ${Math.round(burnStackDps(p, 1))} DPS（上限 4 层）`,
  },
  {
    retired: 1,
    n: "冰霜之力",
    ico: "❄️",
    t: 1,
    cat: "技能",
    d: "命中叠加冰霜，3 层触发冰冻（定身）",
    max: 3,
    mech: 1,
    pv: (p) =>
      `冰冻 ${frostFreezeDuration(p).toFixed(1)}s → ${frostFreezeDuration({ ...p, frostLv: p.frostLv + 1 }).toFixed(1)}s`,
    f: (p) => p.frostLv++,
    cur: (p) => `冰冻时长 ${frostFreezeDuration(p).toFixed(1)}s（3 层触发）`,
  },
  {
    retired: 1,
    n: "雷霆连锁",
    ico: "🌩️",
    t: 2,
    cat: "技能",
    d: "概率闪电，跳跃命中更多敌人",
    max: 3,
    mech: 1,
    pv: (p) => `跳跃 ${p.chain} → ${p.chain + 1} ｜ 闪电伤害 +15%`,
    f: (p) => {
      p.chain++;
      p.chainDmg += 0.15;
    },
    cur: (p) =>
      `闪电跳跃 ${p.chain} 次 · 伤害加成 +${Math.round(p.chainDmg * 100)}%`,
  },
  {
    retired: 1,
    n: "星辰坠落",
    ico: "☄️",
    t: 3,
    cat: "技能",
    d: "周期性召唤陨星轰炸（伤害 ×3 全局伤害）",
    max: 3,
    mech: 1,
    pv: (p) =>
      `间隔 ${Math.max(2.2, 4.6 - p.meteor * 0.4).toFixed(1)}s → ${Math.max(2.2, 4.6 - (p.meteor + 1) * 0.4).toFixed(1)}s`,
    f: (p) => p.meteor++,
    cur: (p) => `轰炸间隔 ${Math.max(2.2, 4.6 - p.meteor * 0.4).toFixed(1)}s`,
  },
  {
    retired: 1,
    n: "吸血獠牙",
    ico: "🦷",
    t: 1,
    cat: "增幅",
    d: "造成伤害的 0.8% 转为生命",
    max: 4,
    mech: 1,
    pv: (p) =>
      `吸血 ${(p.lifesteal * 100).toFixed(1)}% → ${((p.lifesteal + 0.008) * 100).toFixed(1)}%`,
    f: (p) => (p.lifesteal += 0.008),
    cur: (p) => `伤害吸血 ${(p.lifesteal * 100).toFixed(1)}%`,
  },
  {
    retired: 1,
    n: "荆棘护甲",
    ico: "🌵",
    t: 0,
    cat: "防御",
    d: "被撞时反伤 6 点",
    max: 4,
    mech: 1,
    pv: (p) => `反伤 ${p.thorns} → ${p.thorns + 6}`,
    f: (p) => (p.thorns += 6),
    cur: (p) => `反伤 ${p.thorns} 点`,
  },
  {
    retired: 1,
    n: "疾影步",
    ico: "💨",
    t: 1,
    cat: "防御",
    d: "解锁冲刺 (空格)，冷却 -0.4s",
    max: 3,
    mech: 1,
    pv: (p) =>
      `冲刺冷却 ${p.dashLv ? p.dashMax.toFixed(1) + "s" : "未解锁"} → ${(p.dashLv === 0 ? 2.0 : p.dashMax - 0.4).toFixed(1)}s`,
    // S4-C C3-C：dashLv +1/级 与 dashMax 有序 flat −0.4/级 由权威来源表声明
    //（core/TalentStatSources.ts，base 2.4 逐次累加逐位复现旧 f 序列，禁止
    // 折叠式）；dashT/dashCharges/dashRe 属运行状态，recompute 由
    // RuntimeStateProtection 快照保留（D-C3-06）。
    f: () => {},
    cur: (p) =>
      `冲刺冷却 ${p.dashMax.toFixed(1)}s · 充能上限 ${1 + p.dashChargeLv} 次`,
  },
  {
    retired: 1,
    n: "屠戮之欲",
    ico: "💣",
    t: 2,
    cat: "技能",
    d: "击杀时敌人爆炸，波及周围",
    max: 3,
    mech: 1,
    pv: (p) =>
      `半径 ${Math.round(26 + p.explode * 6)} → ${Math.round(26 + (p.explode + 1) * 6)} ｜ 爆炸伤害 +50%`,
    f: (p) => {
      p.explode++;
      p.explodeDmg += 0.5;
    },
    cur: (p) =>
      `爆炸半径 ${Math.round(26 + p.explode * 6)} · 伤害加成 +${Math.round(p.explodeDmg * 100)}%`,
  },
  {
    retired: 1,
    n: "击杀狂热",
    ico: "🩸",
    t: 3,
    cat: "攻击",
    d: "击杀叠加攻速(每层+10%，上限随等级提升)，受伤时扣除 2 层",
    max: 3,
    mech: 1,
    pv: (p) =>
      `上限 ${hasteCap(p.hasteLv)}→${hasteCap(p.hasteLv + 1)} 层 · 持续 ${(2 + p.hasteLv).toFixed(0)}→${(3 + p.hasteLv).toFixed(0)}s`,
    // S4-C C3-C：hasteLv +1/级 由权威来源表声明（core/TalentStatSources.ts，
    // hasteLv flat）；「首级 Buff（haste=1/hasteT=3）」为获得时效果
    //（core/OnAcquireEffects.ts，lvBefore===0 判定），仅在 learnTalent 成功
    // 获得时执行一次，recompute 绝不重放（D-C3-03：重算不触发、降级夹紧、
    // 末级移除清除——RuntimeStateProtection.reconcileRuntimeToCaps）。
    f: () => {},
    cur: (p) => `上限 3 层(+30% 攻速) · 持续 ${(2 + p.hasteLv).toFixed(0)}s`,
  },
  {
    retired: 1,
    n: "幸运之星",
    ico: "🍀",
    t: 0,
    cat: "增幅",
    d: "药水掉落率与双倍宝石概率提升",
    max: 3,
    mech: 1,
    pv: (p) =>
      `药水掉率 ${(2 + p.luck).toFixed(0)}% → ${(3 + p.luck).toFixed(0)}%`,
    f: (p) => p.luck++,
    cur: (p) =>
      `药水掉率 ${(2 + p.luck).toFixed(0)}% · 双倍宝石 ${(p.luck * 7).toFixed(0)}%`,
  },
  // ---- 伤害成长线 (拓宽加伤渠道) ----
  {
    retired: 1,
    n: "磨刃",
    ico: "🔪",
    t: 0,
    cat: "攻击",
    d: "伤害 +10%",
    max: 99,
    pv: (p) => `伤害 ${p.damage.toFixed(1)} → ${(p.damage * 1.1).toFixed(1)}`,
    // S4-C C2-A：damage ×1.1/级 由权威来源表声明（core/TalentStatSources.ts，
    // attack final 逐次连乘），learnTalent/recompute/melt 统一经投影写入；
    // 本卡无获得时即时效果。
    f: () => {},
    cur: (p) => `当前伤害 ${p.damage.toFixed(1)}`,
  },
  {
    retired: 1,
    n: "狂怒",
    ico: "😤",
    t: 1,
    cat: "攻击",
    d: "伤害 +20%",
    max: 5,
    pv: (p) => `伤害 ${p.damage.toFixed(1)} → ${(p.damage * 1.2).toFixed(1)}`,
    // S4-C C2-A：damage ×1.2/级 由权威来源表声明（core/TalentStatSources.ts），
    // 本卡无获得时即时效果。
    f: () => {},
    cur: (p) => `当前伤害 ${p.damage.toFixed(1)}`,
  },
  {
    retired: 1,
    n: "毁灭本能",
    ico: "☠️",
    t: 2,
    cat: "攻击",
    d: "伤害 +30%",
    max: 3,
    pv: (p) => `伤害 ${p.damage.toFixed(1)} → ${(p.damage * 1.3).toFixed(1)}`,
    // S4-C C2-A：damage ×1.3/级 由权威来源表声明（core/TalentStatSources.ts），
    // 本卡无获得时即时效果。
    f: () => {},
    cur: (p) => `当前伤害 ${p.damage.toFixed(1)}`,
  },
  // ---- 防御/生存扩展 ----
  {
    retired: 1,
    n: "闪避本能",
    ico: "🌀",
    t: 0,
    cat: "防御",
    d: "被击中时 8% 概率完全闪避",
    max: 4,
    mech: 1,
    pv: (p) =>
      `闪避 ${(p.dodge * 100).toFixed(0)}% → ${((p.dodge + 0.08) * 100).toFixed(0)}%`,
    // S5：闪避已迁入 TalentStatSources 的 flat 来源（0.08/级），f 只保留空操作
    f: () => {},
    cur: (p) => `闪避率 ${(p.dodge * 100).toFixed(0)}%`,
  },
  {
    retired: 1,
    n: "铁布衫",
    ico: "🥋",
    t: 0,
    cat: "防御",
    d: "受到的伤害 -10%",
    max: 4,
    mech: 1,
    pv: (p) =>
      `减伤 ${(p.tough * 100).toFixed(0)}% → ${((p.tough + 0.1) * 100).toFixed(0)}%`,
    // S4-C C1：tough +0.1/级 由权威来源表声明（core/TalentStatSources.ts），
    // learnTalent/recompute/melt 统一经投影写入；本卡无获得时即时效果。
    f: () => {},
    cur: (p) =>
      `减伤 ${(Math.min(0.6, p.tough) * 100).toFixed(0)}%${p.tough >= 0.6 ? " (已达上限)" : ""}`,
  },
  {
    retired: 1,
    n: "巨人血脉",
    ico: "💪",
    t: 0,
    cat: "增幅",
    d: "生命上限 +30",
    max: 99,
    pv: (p) => `上限 ${p.maxhp} → ${p.maxhp + 30}`,
    // S4-C C3-A：maxhp +30/级 由权威来源表声明（core/TalentStatSources.ts，
    // maxHp flat）；「当前 HP +30」为获得时效果（core/OnAcquireEffects.ts），
    // 保持旧实现不主动夹紧 HP 的行为，仅在 learnTalent 成功获得时执行一次。
    f: () => {},
    cur: (p) => `当前生命上限 ${p.maxhp}`,
  },
  {
    retired: 1,
    n: "战意沸腾",
    ico: "😡",
    t: 1,
    cat: "攻击",
    d: "受伤后 3 秒内攻速 +20%",
    max: 2,
    mech: 1,
    pv: (p) => `攻速加成 ${p.rageLv * 20}% → ${(p.rageLv + 1) * 20}%`,
    // S4-C C3-C：rageLv +1/级 由权威来源表声明（core/TalentStatSources.ts，
    // rageLv flat）；rageT 属运行状态（受击触发/独立衰减），recompute 由
    // RuntimeStateProtection 快照保留（D-C3-04）。
    f: () => {},
    cur: (p) => `受伤后攻速 +${p.rageLv * 20}% (持续 3 秒)`,
  },
  {
    retired: 1,
    n: "壁垒",
    ico: "🧱",
    t: 2,
    cat: "防御",
    d: "每波开始获得 1 层临时护盾",
    max: 2,
    mech: 1,
    pv: (p) => `每波护盾 ${p.barrierLv} → ${p.barrierLv + 1} 层`,
    // S4-C C3-C：barrierLv +1/级 由权威来源表声明（core/TalentStatSources.ts，
    // barrierLv flat）；tempShield 每波按 barrierLv 重建属换波显式语义
    //（WaveSystem，D-C3-04 例外面），recompute 由 RuntimeStateProtection
    // 快照保留现值。
    f: () => {},
    cur: (p) => `每波临时护盾 ${p.barrierLv} 层`,
  },
  {
    retired: 1,
    n: "灼热易伤",
    ico: "🌡️",
    t: 2,
    cat: "技能",
    d: "灼烧中的敌人受到的所有伤害 +10%/级",
    max: 2,
    mech: 1,
    req: (p) => (p.upCounts["烈焰印记"] || 0) > 0,
    pv: (p) =>
      `易伤 +${(p.scorchVuln * 100).toFixed(0)}% → +${((p.scorchVuln + 0.1) * 100).toFixed(0)}%`,
    f: (p) => (p.scorchVuln += 0.1),
    cur: (p) => `灼烧目标易伤 +${(p.scorchVuln * 100).toFixed(0)}%`,
  },
  {
    retired: 1,
    n: "烈焰蔓延",
    ico: "🌋",
    t: 3,
    cat: "技能",
    d: "灼烧中的敌人死亡时，向附近敌人蔓延剩余灼烧层数",
    max: 2,
    mech: 1,
    req: (p) => (p.upCounts["灼热易伤"] || 0) > 0,
    pv: (p) => `蔓延 ${1 + p.burnSpread} → ${2 + p.burnSpread} 个目标`,
    f: (p) => p.burnSpread++,
    cur: (p) => `死亡蔓延至 ${1 + p.burnSpread} 个目标`,
  },
  {
    retired: 1,
    n: "天眼制导",
    ico: "👁️",
    t: 2,
    cat: "技能",
    d: "陨星砸向敌人最密集处",
    max: 1,
    mech: 1,
    req: (p) => (p.upCounts["星辰坠落"] || 0) > 0,
    pv: (p) => (p.meteorGuided ? "已解锁" : "落点: 随机 → 敌方密集处"),
    f: (p) => (p.meteorGuided = 1),
    cur: (p) => (p.meteorGuided ? "智能落点已解锁" : "未解锁"),
  },
  {
    retired: 1,
    n: "焦土燃烧",
    ico: "🏜️",
    t: 3,
    cat: "技能",
    d: "陨星落点留下燃烧地带 5 秒",
    max: 1,
    mech: 1,
    req: (p) => (p.upCounts["天眼制导"] || 0) > 0,
    pv: (p) => (p.burnGround ? "已解锁" : "解锁: 燃烧地带"),
    f: (p) => (p.burnGround = 1),
    cur: (p) => (p.burnGround ? "燃烧地带已解锁" : "未解锁"),
  },
  {
    retired: 1,
    n: "魔刃回旋",
    ico: "🪞",
    t: 1,
    cat: "防御",
    d: "环绕飞刃可反弹敌方弹幕，沿原轨迹飞回伤害敌人（伤害不衰减）",
    max: 1,
    mech: 1,
    req: (p) => (p.upCounts["守护之刃"] || 0) > 0,
    pv: (p) => (p.bladeReflect ? "已解锁" : "解锁: 弹幕反弹"),
    f: (p) => (p.bladeReflect = 1),
    cur: (p) => (p.bladeReflect ? "弹幕反弹已解锁" : "未解锁"),
  },
  // —— Combat Foundation S3-B 方案甲（用户已批准）——
  {
    retired: 1,
    n: "磐石",
    ico: "🪨",
    t: 1,
    cat: "防御",
    d: "护甲 +15/级（物理减伤，与通用减伤乘算）",
    max: 3,
    mech: 1,
    pv: (p) => {
      const cur = p.defense ?? 0;
      return `物理减伤 ${physMitPct(cur)}% → ${physMitPct(cur + 15)}%`;
    },
    // S4-C C1：defense +15/级 由权威来源表声明（core/TalentStatSources.ts），
    // learnTalent/recompute/melt 统一经投影写入；本卡无获得时即时效果。
    f: () => {},
    cur: (p) => {
      const def = p.defense ?? 0;
      return `护甲 ${def}（物理 -${physMitPct(def)}%，与减伤乘算）`;
    },
  },
  {
    retired: 1,
    n: "元素亲和",
    ico: "🔮",
    t: 2,
    cat: "技能",
    d: "火焰与雷电伤害 +10%/级",
    max: 3,
    pv: (p) => {
      const cur = ((p.typeDamageBonus?.fire ?? 0) * 100).toFixed(0);
      return `火/雷增伤 +${cur}% → +${Number(cur) + 10}%`;
    },
    // S4-C C1：火/雷 typeDamageBonus 各 +0.1/级 由权威来源表声明
    //（core/TalentStatSources.ts），learnTalent/recompute/melt 统一经投影
    // 写入；本卡无获得时即时效果。
    f: () => {},
    cur: (p) =>
      `火焰/雷电伤害 +${((p.typeDamageBonus?.fire ?? 0) * 100).toFixed(0)}%`,
  },
];

/**
 * 「三选一里至少有一张伤害系」的硬保底名单。
 *
 * S2 起必须删除：新体系的天赋不提供伤害（伤害来自属性成长与职业基础形态），
 * 这条保底会把清场类机制卡强行塞进每一次三选一，破坏取舍。
 * 删除动作与 `rollPicks` 的改写在同一次提交内完成。
 */
export const DMG_POOL = [
  "强化弹丸",
  "致命一击",
  "会心深渊",
  "屠戮之欲",
  "雷霆连锁",
  "星辰坠落",
  "烈焰印记",
  "磨刃",
  "狂怒",
  "毁灭本能",
];
