import type { Talent } from "../core/types";
import {
  frostFreezeDuration,
  burnStackDps,
  critMultiplier,
} from "../core/DamageMath";
import { COMBAT_BALANCE } from "./combatBalance";

/** 击杀狂热叠层上限：随天赋等级提高（Lv1→4 层，Lv2→5 层，Lv3→6 层） */
export function hasteCap(hasteLv: number) {
  return 3 + hasteLv;
}

/** 磐石预览用：护甲对应的物理减伤百分比（K/(K+DEF) 公式与 DamageSystem 一致） */
function physMitPct(def: number) {
  const k = COMBAT_BALANCE.armorK;
  return Math.round((1 - k / (k + Math.max(0, def))) * 100);
}

export const UPGRADES: Talent[] = [
  {
    n: "强化弹丸",
    ico: "🔥",
    t: 0,
    cat: "攻击",
    d: "魔弹伤害 +25%（仅魔弹）",
    max: 30,
    pv: (p) =>
      `魔弹伤害 ${(p.damage * p.boltDmgMul).toFixed(1)} → ${(p.damage * p.boltDmgMul * 1.25).toFixed(1)}`,
    f: (p) => (p.boltDmgMul *= 1.25),
    cur: (p) =>
      `魔弹伤害 ${(p.damage * p.boltDmgMul).toFixed(1)}（仅魔弹，全局伤害 ${p.damage.toFixed(1)}）`,
  },
  {
    n: "疾速扳机",
    ico: "⚡",
    t: 0,
    cat: "攻击",
    d: "攻速 +18%",
    max: 8,
    pv: (p) =>
      `攻速 ${p.fireRate.toFixed(2)} → ${(p.fireRate * 1.18).toFixed(2)}/秒`,
    f: (p) => (p.fireRate *= 1.18),
    cur: (p) => `当前攻速 ${p.fireRate.toFixed(2)}/秒`,
  },
  {
    n: "疾风之靴",
    ico: "👟",
    t: 0,
    cat: "增幅",
    d: "移动速度 +10%",
    max: 6,
    pv: (p) => `移速 ${Math.round(p.speed)} → ${Math.round(p.speed * 1.1)}`,
    f: (p) => (p.speed *= 1.1),
    cur: (p) => `当前移速 ${Math.round(p.speed)}`,
  },
  {
    n: "生命之泉",
    ico: "❤️",
    t: 0,
    cat: "增幅",
    d: "生命上限 +20 并回满",
    max: 99,
    pv: (p) => `上限 ${p.maxhp} → ${p.maxhp + 20}，并回满`,
    f: (p) => {
      p.maxhp += 20;
      p.hp = p.maxhp;
    },
    cur: (p) => `当前生命上限 ${p.maxhp}`,
  },
  {
    n: "分裂射击",
    ico: "🔱",
    t: 1,
    cat: "技能",
    d: "+1 条弹道",
    max: 4,
    pv: (p) => `弹道 ${p.multishot} → ${p.multishot + 1}`,
    f: (p) => p.multishot++,
    cur: (p) => `当前弹道数 ${p.multishot}`,
  },
  {
    n: "穿透之矢",
    ico: "🏹",
    t: 1,
    cat: "技能",
    d: "子弹穿透 +1 个敌人",
    max: 4,
    pv: (p) => `穿透 ${p.pierce} → ${p.pierce + 1}`,
    f: (p) => p.pierce++,
    cur: (p) => `当前穿透次数 ${p.pierce}`,
  },
  {
    n: "磁力护符",
    ico: "🧲",
    t: 0,
    cat: "增幅",
    d: "拾取范围 +40%",
    max: 5,
    pv: (p) => `拾取 ${Math.round(p.magnet)} → ${Math.round(p.magnet * 1.4)}`,
    f: (p) => (p.magnet *= 1.4),
    cur: (p) => `当前拾取范围 ${Math.round(p.magnet)}`,
  },
  {
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
    n: "广域法印",
    ico: "🌐",
    t: 1,
    cat: "技能",
    d: "施法范围 +20%（子弹 / 陨星 / 爆炸 / 飞刃）",
    max: 4,
    mech: 1,
    pv: (p) => `范围 ×${p.area.toFixed(2)} → ×${(p.area * 1.2).toFixed(2)}`,
    f: (p) => (p.area *= 1.2),
    cur: (p) => `施法范围加成 ×${p.area.toFixed(2)}`,
  },
  {
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
    n: "能量护盾",
    ico: "🛡️",
    t: 2,
    cat: "防御",
    d: "+1 层护盾；破碎时反震 80px 内敌人（200% 伤害 + 击退）",
    max: 3,
    mech: 1,
    pv: (p) => `护盾 ${p.shieldMax} → ${p.shieldMax + 1} 层 · 破碎反震`,
    f: (p) => {
      p.shieldMax++;
      p.shield++;
    },
    cur: (p) => `护盾 ${p.shield}/${p.shieldMax} 层 · 破碎反震 200%`,
  },
  {
    n: "疾影步",
    ico: "💨",
    t: 1,
    cat: "防御",
    d: "解锁冲刺 (空格)，冷却 -0.4s",
    max: 3,
    mech: 1,
    pv: (p) =>
      `冲刺冷却 ${p.dashLv ? p.dashMax.toFixed(1) + "s" : "未解锁"} → ${(p.dashLv === 0 ? 2.0 : p.dashMax - 0.4).toFixed(1)}s`,
    f: (p) => {
      if (p.dashLv === 0) {
        p.dashLv = 1;
        p.dashMax = 2.0;
      } else {
        p.dashLv++;
        p.dashMax -= 0.4;
      }
    },
    cur: (p) =>
      `冲刺冷却 ${p.dashMax.toFixed(1)}s · 充能上限 ${1 + p.dashChargeLv} 次`,
  },
  {
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
    n: "击杀狂热",
    ico: "🩸",
    t: 3,
    cat: "攻击",
    d: "击杀叠加攻速(每层+10%，上限随等级提升)，受伤时扣除 2 层",
    max: 3,
    mech: 1,
    pv: (p) =>
      `上限 ${hasteCap(p.hasteLv)}→${hasteCap(p.hasteLv + 1)} 层 · 持续 ${(2 + p.hasteLv).toFixed(0)}→${(3 + p.hasteLv).toFixed(0)}s`,
    f: (p) => {
      p.hasteLv++;
      if (p.hasteLv === 1) {
        p.haste = 1;
        p.hasteT = 3;
      }
    },
    cur: (p) => `上限 3 层(+30% 攻速) · 持续 ${(2 + p.hasteLv).toFixed(0)}s`,
  },
  {
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
    n: "磨刃",
    ico: "🔪",
    t: 0,
    cat: "攻击",
    d: "伤害 +10%",
    max: 99,
    pv: (p) => `伤害 ${p.damage.toFixed(1)} → ${(p.damage * 1.1).toFixed(1)}`,
    f: (p) => (p.damage *= 1.1),
    cur: (p) => `当前伤害 ${p.damage.toFixed(1)}`,
  },
  {
    n: "狂怒",
    ico: "😤",
    t: 1,
    cat: "攻击",
    d: "伤害 +20%",
    max: 5,
    pv: (p) => `伤害 ${p.damage.toFixed(1)} → ${(p.damage * 1.2).toFixed(1)}`,
    f: (p) => (p.damage *= 1.2),
    cur: (p) => `当前伤害 ${p.damage.toFixed(1)}`,
  },
  {
    n: "毁灭本能",
    ico: "☠️",
    t: 2,
    cat: "攻击",
    d: "伤害 +30%",
    max: 3,
    pv: (p) => `伤害 ${p.damage.toFixed(1)} → ${(p.damage * 1.3).toFixed(1)}`,
    f: (p) => (p.damage *= 1.3),
    cur: (p) => `当前伤害 ${p.damage.toFixed(1)}`,
  },
  // ---- 防御/生存扩展 ----
  {
    n: "闪避本能",
    ico: "🌀",
    t: 0,
    cat: "防御",
    d: "被击中时 8% 概率完全闪避",
    max: 4,
    mech: 1,
    pv: (p) =>
      `闪避 ${(p.dodge * 100).toFixed(0)}% → ${((p.dodge + 0.08) * 100).toFixed(0)}%`,
    f: (p) => (p.dodge += 0.08),
    cur: (p) => `闪避率 ${(p.dodge * 100).toFixed(0)}%`,
  },
  {
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
    n: "巨人血脉",
    ico: "💪",
    t: 0,
    cat: "增幅",
    d: "生命上限 +30",
    max: 99,
    pv: (p) => `上限 ${p.maxhp} → ${p.maxhp + 30}`,
    f: (p) => {
      p.maxhp += 30;
      p.hp += 30;
    },
    cur: (p) => `当前生命上限 ${p.maxhp}`,
  },
  {
    n: "战意沸腾",
    ico: "😡",
    t: 1,
    cat: "攻击",
    d: "受伤后 3 秒内攻速 +20%",
    max: 2,
    mech: 1,
    pv: (p) => `攻速加成 ${p.rageLv * 20}% → ${(p.rageLv + 1) * 20}%`,
    f: (p) => p.rageLv++,
    cur: (p) => `受伤后攻速 +${p.rageLv * 20}% (持续 3 秒)`,
  },
  {
    n: "壁垒",
    ico: "🧱",
    t: 2,
    cat: "防御",
    d: "每波开始获得 1 层临时护盾",
    max: 2,
    mech: 1,
    pv: (p) => `每波护盾 ${p.barrierLv} → ${p.barrierLv + 1} 层`,
    f: (p) => p.barrierLv++,
    cur: (p) => `每波临时护盾 ${p.barrierLv} 层`,
  },
  {
    n: "二段冲刺",
    ico: "🚀",
    t: 2,
    cat: "防御",
    d: "冲刺充能 +1 段（需先学疾影步）",
    max: 1,
    mech: 1,
    req: (p) => p.dashLv > 0,
    pv: (p) => `充能 ${1 + p.dashChargeLv} → ${2 + p.dashChargeLv} 段`,
    f: (p) => p.dashChargeLv++,
    cur: (p) => `冲刺充能上限 ${1 + p.dashChargeLv} 段`,
  },
  {
    n: "不屈",
    ico: "🏅",
    t: 3,
    cat: "防御",
    d: "受到致命伤害时以 1 点 HP 存活（每波一次）",
    max: 1,
    mech: 1,
    hidden: 1,
    pv: (p) => (p.nd ? "已解锁" : "解锁: 每波一次免死"),
    f: (p) => (p.nd = 1),
    cur: (p) => `每波一次致命免死 · ${p.ndUsed ? "本波已触发" : "本波可用"}`,
  },
  {
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
export const TIERS = ["普通", "稀有", "史诗", "传奇"];
export const TIER_VAL = [1, 2, 4, 8];
export const TIER_COLOR = ["#e8e8f0", "#4dff88", "#c07bff", "#ffd24a"];
export const RAMP = [
  { min: 1, w: [70, 25, 5, 0] },
  { min: 5, w: [45, 35, 15, 5] },
  { min: 10, w: [25, 35, 25, 15] },
  { min: 16, w: [10, 30, 35, 25] },
];
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
export const CAT_COLOR: Record<string, string> = {
  攻击: "#ff6b9d",
  增幅: "#4dff88",
  技能: "#57e6ff",
  防御: "#ffd24a",
};
export const CAT_ICO: Record<string, string> = {
  攻击: "⚔",
  增幅: "📈",
  技能: "✨",
  防御: "🛡",
};
