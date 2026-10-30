import type { WarriorStyle } from "../core/types";

/**
 * 战士基础形态与核心链系数。
 *
 * 数值口径（2026-10-30 用户确认的提案）：
 * - 80 HP / 68 移速 / 10 护甲 / 4% 吸血；
 * - 太刀 15 伤害 ×2.5/s、52px、100° 扇形、击退 4px；
 * - 大剑 20 伤害 ×1.55/s、45px、130° 扇形、击退 10px；
 * - 职业底座：近战无视 30% 护甲（与大剑「破甲」叠乘，不改怪物数值）。
 *
 * 战士的强度靠「贴住」换覆盖：挥砍本身是扇形、不依赖排线，
 * 代价是必须贴身吃伤害。当前含流/居合/重斩三链、入场 4 张与共享 4 张，
 * 共 17 张（单流派可见：太刀 12、大剑 9）。
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
  /**
   * 战士职业底座：近战无视 30% 护甲。
   * 精英固定为 60 防蛮牛；射手强化弹有无视护甲升级、法师元素绕开护甲，
   * 战士纯物理没有穿透会被护甲税压死。只影响战士近战，不改怪物数值。
   * 与大剑「破甲」-40% 叠乘：60 甲目标剩 60×0.7×0.6 = 25.2。
   */
  armorPen: 0.3,
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
   * 「连闪」共享机动天赋（t1）：
   * 充能 +1、冷却 -0.4s；冲刺穿过敌人减速并返还冷却；
   * 冲刺后 2 秒暴击率/暴击伤害 +30%。
   */
  lianShan: {
    cdReduction: 0.4,
    slowT: 1.5,
    slowF: 0.3,
    refundPerHit: 0.1,
    refundCap: 0.3,
    critWindow: 2,
    critBonus: 0.3,
  },
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
  /**
   * 「居合」链（太刀专属）：走路积势、满层自动爆发。
   *
   * 为什么资源是「移动距离」而不是「停手时长」：实测（自动贴脸 + 锁血）
   * 战士每波移动 1322–2852px、平均 2243px，但两次挥砍之间只隔 0.4 秒、
   * 最多移动 27px。若做成「挥砍时倾泻」，势会永远停在 0–1 层、上限形同虚设。
   * 因此改为**只增不减、满层才触发**——零碎积累不会被浪费。
   *
   * 与「流」的分工：流奖励「打」（命中叠层、断档清零），势奖励「走」。
   * 贴脸连打时流在涨、势不动；走位追怪时势在涨、流会掉。两者不会互相抵消。
   */
  iai: {
    /** 每层所需移动距离（px）。L2 更短 → 攒得更快。 */
    distPerStack1: 100,
    // L2 满 8 层所需：8 × 50 = 400px，**明显快于** L1 的 500px。
    // 初版 70px（560px）被实测打回：L2 反而比 L1 触发更少（每波 18 次 vs 22 次），
    // 与 L2「放大」的定位相反；60px 只是持平。用户要求「势再加强一点」→ 50px。
    distPerStack2: 50,
    cap1: 5,
    cap2: 8,
    /** 每层增伤：满 5 层 = ×3.0，满 8 层 = ×4.2。 */
    perStack: 0.4,
    /** 居合斩的扇形与击退倍率。 */
    spreadMul: 1.5,
    knockMul: 2,
    /** 命中后补的「流」层数——让「走位 → 居合 → 连打」形成循环，停手不再纯亏。 */
    flowGain: 2,
    /** L2：命中后攻速加成与窗口。 */
    hasteMul: 0.5,
    hasteWindow: 1.5,
    /** L3：旋斩的击退倍率（覆盖已是全向，击退再加强）。 */
    spinKnockMul: 3,
  },
  styles: {
    katana: {
      label: "太刀流",
      short: "太 刀",
      // #180：9 → 12；本次 12 → 15（用户 2026-10-30 裁定基础近战伤害加强）。
      // 太刀射程与扇形都是最小，护甲对低基数伤害的相对削减更狠
      // （12 经 25 护甲只剩 8），再补 3 点把「贴身」的代价换回来。
      damage: 15,
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
      // 17 → 20（用户 2026-10-30 裁定）；攻速 1.2 → 1.55、射程 36 → 45（#180 同批）。
      damage: 20,
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
