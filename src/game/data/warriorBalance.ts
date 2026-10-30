import type { WarriorStyle } from "../core/types";

/**
 * 战士基础形态与核心链系数。
 *
 * 数值口径（2026-10-30 用户确认的提案）：
 * - 80 HP / 60 移速 / 10 护甲 / 4% 吸血；
 * - 太刀 9 伤害 ×2.0/s、34px、100° 扇形、击退 4px；
 * - 大剑 17 伤害 ×1.2/s、36px、130° 扇形、击退 10px。
 *
 * 战士的强度靠「贴住」换覆盖：挥砍本身是扇形，k 天然 ≥2，
 * 所以单体伤害低于射手、但不依赖排线。当前批次含核心/入场/共享 13 张卡。
 */
export interface WarriorStyleStats {
  readonly label: string;
  readonly short: string;
  readonly damage: number;
  readonly fireRate: number;
  readonly range: number;
  /** 扇形张角（弧度）。 */
  readonly spread: number;
  /** 击退位移 px；MeleeSystem 内部 ×KNOCK_DAMP 换算成初速。 */
  readonly knock: number;
  readonly color: string;
  /** 命中粒子色 */
  readonly particle: string;
  /** 冲刺残影色 */
  readonly trail: string;
}

export const WARRIOR_BALANCE = {
  maxhp: 80,
  speed: 68,
  defense: 10,
  lifesteal: 0.04,
  heavyEvery: 3,
  heavyDamageMul: 2.5,
  heavyKnockMul: 1.2,
  heavyRangeMul: 1.5,
  heavyIntervalMul: 1.2,
  heavyArmorBreakPct: 0.4,
  dashDistMul: 1.3,
  /**
   * 冲刺特化（#180）：战士基础冲刺距离 ×1.5（45px → 约 67px）。
   *
   * 起因：第 4 波的 `shooter` 在 90–150px 环带横向游走，太刀射程 42px
   * 结构上够不到，实测把伤害提到 12、射程提到 42、移速提到 70/80 都清不完这波。
   * 近战对远程必须有「接近手段」，因此把冲刺做成战士的职业优势——
   * 一次冲刺能跨进环带内，与「疾冲」卡的 1.3 独立相乘。
   */
  baseDashMul: 1.5,
  /** 冲刺冷却（秒）：战士 1.6（原 2.4），近战靠短 CD 反复接近。 */
  dashMax: 1.6,
  /**
   * 冲刺后移速爆发（战士基础机制，不占卡位）。
   * 冲刺结束瞬间 +45%，在 dashBoostWindow 秒内线性衰减到 0。
   * 目的：让「冲刺」在位移之外还提供一小段追击/脱离窗口，
   * 与短 CD 配合形成「贴—打—拉开—再贴」的节奏。
   */
  dashBoostWindow: 2,
  dashBoostMul: 0.45,
  // 疾冲路径伤害 80% → 100%（机动链全面升级）。
  dashDamageMul: 1.0,
  leapRange: 80,
  leapRangeMul: 1.3,
  // 跃击落地 120% → 140%（机动链全面升级）。
  leapDamageMul: 1.4,
  leapRechargeExtra: 0.8,
  // 残心（太刀入场 L2）：冲刺后窗口内下一刀增伤。
  // 原 1 秒 +40% ≈ 仅 +8% DPS（冲刺冷却 2.4s、太刀 2 刀/秒 → 每周期 4.8 刀只吃到 0.4 刀）。
  // 作为 L2 明显偏弱，且 1 秒窗口太窄容易白白浪费。改为 2 秒 +100% ≈ +21%。
  resolveWindow: 2,
  resolveDamageMul: 1.0,
  // 强袭（大剑入场 L2）：跃击落地后短时攻速。
  // 原 1 秒 +25% ≈ +10% DPS（大剑 1.2 刀/秒），L2 同样偏弱。改为 2 秒 +40% ≈ +33%。
  leapHasteWindow: 2,
  leapHasteMul: 0.4,
  lianZhanChance: 0.3,
  lianZhanHeal: 0.03,
  /**
   * #179：单次链式最多连续触发几次。
   * 用户裁决「最多连 3 次」——原来 30% 独立掷骰会让短时间内连出 3、4 次，
   * 观感像「一刀多段伤害」且节奏不可预期。加上限后节奏可读，
   * 代价是削弱太刀清场，故与 #180（伤害 9→12、射程 34→42）同批配平。
   */
  lianZhanMaxChain: 3,
  breakoutCount: 3,
  // 破围（共享·补救）：被围时的强化。原 +15% / 击退 ×2 太轻，
  // 「3 敌以上」本身就是危险处境，收益应更明显。改为 +35% / ×3。
  breakoutDamageMul: 1.35,
  breakoutKnockMul: 3,
  heavyArmorBreakT: 4,
  swordQiRange: 200,
  swordQiWidth: 10,
  swordQiDamageMul: 0.8,
  // 剑气击退不在此表：已统一到 data/knockback.ts 的 KNOCK.warrior.qi（14px），
  // 避免「伤害数值」与「击退数值」两套口径各自漂移。
  flow: {
    cap1: 5,
    cap2: 10,
    cap3: 15,
    // 用户反馈（2026-10-30）：「流」的数值给得太保守。
    // 诊断出两层原因，本批同时处理：
    // ①数值低：原 2%/层 → L1 满层只有 +10% 伤害，而射手 L1「破甲箭」把
    //   穿透提到 2 目标、衰减 0.8，对双目标就是 +80%，量级差一档；
    // ②容错差：原来 3 秒未命中直接清空，实战躲弹/追风筝很容易断流归零，
    //   叠加 v109 把「连斩」限制成 3 连之后更难维持。
    dmgPerStack: 0.03,
    atkSpeedPerStack: 0.025,
    // 维持窗口 3/4 → 4/6 秒（流·极 也用 duration2）。
    duration1: 4,
    duration2: 6,
    burstT: 3,
    burstKeep: 5,
  },
  styles: {
    katana: {
      label: "太刀流",
      short: "太 刀",
      // #180：9 → 12。太刀原本 DPS 18（射手 24.2 / 大剑 20.4）且射程与扇形都是最小，
      // 加上护甲对低基数伤害的相对削减更狠（9 经 25 护甲只剩 6），
      // 前期清场明显跟不上。提伤害把「贴身」的代价换回来。
      damage: 12,
      // #180：攻速 2.0 → 2.5、射程 42 → 52（用户要求「增加攻击距离与基础攻速」）。
      // 太刀是三方里唯一必须贴身的近战，射程与攻速同时补，才追得上射手 24.2 的基线 DPS。
      fireRate: 2.5,
      // 射程 34 → 42（#180）→ 52（本次）。刀光素材中心同步 22 → 26（见 draw.ts）。
      range: 52,
      spread: (100 * Math.PI) / 180,
      knock: 4,
      color: "#5ef2c8",
      particle: "#bfffea",
      trail: "#8ff5e0",
    },
    greatsword: {
      label: "大剑流",
      short: "大 剑",
      damage: 17,
      // 攻速 1.2 → 1.55、射程 36 → 45（与太刀同批加强）。
      fireRate: 1.55,
      range: 45,
      spread: (130 * Math.PI) / 180,
      knock: 10,
      color: "#ffd24a",
      particle: "#ffe8a3",
      trail: "#ffd24a",
    },
  } satisfies Record<WarriorStyle, WarriorStyleStats>,
} as const;

export const WARRIOR_STYLE_ORDER: readonly WarriorStyle[] = [
  "katana",
  "greatsword",
];
