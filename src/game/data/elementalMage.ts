import type { Talent } from "../core/types";
import type { MageElement } from "./mageBalance";
export type { MageElement };

/**
 * 元素法师 v2（docs/elemental-mage-rework.md）的规则数据。
 *
 * 这里只放**可被 UI 与 Core 共同读取的规则与系数**；伤害公式仍在
 * DamageMath / DamageSystem，系统文件只引用本表的键。
 *
 * 批次 1 范围：法杖等级、每 4 次施法轮盘、Lv1/3/6 元素、A/B 套装、
 * 六反应、普通池。稀有/史诗/终极池与棱镜/分影在后续批次接入。
 */

export type MageSuit = "A" | "B";

export type MageReactionId =
  | "quench"
  | "melt"
  | "overload"
  | "blaze"
  | "superconduct"
  | "frostbind";

export type MageNormalUpgradeId = "elementFocus" | "circleWidth";
export type MageRareUpgradeId = "echoCircle" | "tempo" | "prismRare";
export type MageEpicUpgradeId =
  | "missingReaction"
  | "prismEpic"
  | "reactionMastery";
export type MageUltimateUpgradeId =
  | "prismUltimate"
  | "splitShadow"
  | "reactionFinale";
export type MageUpgradeId =
  | MageNormalUpgradeId
  | MageRareUpgradeId
  | MageEpicUpgradeId
  | MageUltimateUpgradeId;

export interface MageElementDef {
  readonly id: MageElement;
  readonly name: string;
  readonly ico: string;
  readonly color: string;
  /** 相对「元素伤害基准」的直伤倍率。 */
  readonly damageMul: number;
  readonly statusName: string;
  readonly desc: string;
}

export const MAGE_ELEMENTS: Record<MageElement, MageElementDef> = {
  fire: {
    id: "fire",
    name: "火",
    ico: "🔥",
    color: "#ff6a2b",
    damageMul: 0.6,
    statusName: "灼烧",
    desc: "法阵造成 60% 元素伤害；命中施加灼烧，最多 3 层，每 0.5 秒按层数 × 20% 元素伤害结算，每层独立持续 3 秒",
  },
  frost: {
    id: "frost",
    name: "冰",
    ico: "❄️",
    color: "#9fe1ff",
    damageMul: 1,
    statusName: "凝冰",
    desc: "法阵造成 100% 元素伤害；命中施加凝冰，最多 3 层，每层减速 5%；满 3 层冻结 1.5 秒",
  },
  lightning: {
    id: "lightning",
    name: "雷",
    ico: "⚡",
    color: "#c07bff",
    damageMul: 0.8,
    statusName: "雷印",
    desc: "法阵造成 80% 元素伤害；命中施加麻痹与雷印；30% 概率触发闪电链，最多 3 个目标、各 40% 元素伤害",
  },
};

export const MAGE_ELEMENT_ORDER: readonly MageElement[] = [
  "fire",
  "frost",
  "lightning",
];

export interface MageReactionDef {
  readonly id: MageReactionId;
  readonly name: string;
  readonly from: MageElement;
  readonly to: MageElement;
  readonly suit: MageSuit;
  readonly color: string;
  readonly desc: string;
}

export const MAGE_REACTIONS: Record<MageReactionId, MageReactionDef> = {
  quench: {
    id: "quench",
    name: "急淬",
    from: "fire",
    to: "frost",
    suit: "A",
    color: "#9fe1ff",
    desc: "冰击命中带灼烧的目标：消耗灼烧、挂脆化，按灼烧层数 × 80% 结算，并留 1 层凝冰",
  },
  melt: {
    id: "melt",
    name: "融化",
    from: "frost",
    to: "fire",
    suit: "B",
    color: "#e8f7ff",
    desc: "火击命中带凝冰的目标：退出冻结/霜牢、清空凝冰，按凝冰层数 × 95% 结算，并留 1 层灼烧",
  },
  overload: {
    id: "overload",
    name: "超载",
    from: "fire",
    to: "lightning",
    suit: "B",
    color: "#ff9a3d",
    desc: "直接雷击命中带灼烧目标：消耗灼烧，按层数 × 125% 结算；链上目标不触发",
  },
  blaze: {
    id: "blaze",
    name: "裂焰",
    from: "lightning",
    to: "fire",
    suit: "A",
    color: "#ff6a2b",
    desc: "火击命中带雷印目标：消耗雷印，主目标爆炸 + 附近 3 个小爆炸，并留 1 层灼烧",
  },
  superconduct: {
    id: "superconduct",
    name: "超导",
    from: "frost",
    to: "lightning",
    suit: "A",
    color: "#d9a6ff",
    desc: "雷击命中带凝冰的目标：退出冻结、清空凝冰，按凝冰层数 × 45% 结算，必定触发闪电链并 +1 跳，链上目标获得雷印",
  },
  frostbind: {
    id: "frostbind",
    name: "霜缚",
    from: "lightning",
    to: "frost",
    suit: "B",
    color: "#57e6ff",
    desc: "冰击命中带雷印目标：清空雷印，造成 40% 反应伤害，施加霜牢；霜牢优先于冻结",
  },
};

const PAIR_REACTIONS: Record<string, MageReactionId> = {
  "fire>frost": "quench",
  "frost>fire": "melt",
  "fire>lightning": "overload",
  "lightning>fire": "blaze",
  "frost>lightning": "superconduct",
  "lightning>frost": "frostbind",
};

/** 按元素方向查反应；未定义方向返回 null。 */
export function reactionForPair(
  from: MageElement,
  to: MageElement,
): MageReactionId | null {
  return PAIR_REACTIONS[`${from}>${to}`] ?? null;
}

/** 反应统一显示「名称（元素→元素）」。 */
export function reactionLabel(id: MageReactionId): string {
  const r = MAGE_REACTIONS[id];
  return `${r.name}（${MAGE_ELEMENTS[r.from].name}→${MAGE_ELEMENTS[r.to].name}）`;
}

/** 元素显示名。 */
export function elementName(el: MageElement): string {
  return MAGE_ELEMENTS[el].name;
}

/** 元素轮盘顺序文本，例如「火 → 冰 → 雷」。 */
export function elementOrderLabel(elements: readonly MageElement[]): string {
  return elements.map(elementName).join(" → ");
}

/**
 * 法杖等级表。索引 = 等级 - 1；`xpToNext` 为升级所需经验，满级为 null。
 *
 * 批次 1 只有 Lv2 普通池与 Lv3/6 元素选择真正发放；Lv4–5、Lv7–9、
 * Lv10–12 的稀有/史诗/终极池留给批次 2/3，仍保留等级与经验节奏。
 * 经验来源：每次本体法阵实际命中至少 1 个敌人 +1。
 *
 * 试玩反馈「第 2 波就有新元素、第 5 波就有三元素」：Lv1–6 的阈值约翻倍，
 * 让第二元素落在第 4 波左右、第三元素落在第 8–10 波；后续等级沿用占位曲线。
 */
export interface StaffLevelDef {
  readonly xpToNext: number | null;
  readonly note: string;
}

export const STAFF_LEVELS: readonly StaffLevelDef[] = [
  { xpToNext: 12, note: "选择第一元素" },
  { xpToNext: 24, note: "普通池随机 1 项" },
  { xpToNext: 32, note: "选择第二元素，领悟 A+B 反应" },
  { xpToNext: 40, note: "稀有池：棱镜必得 + 回响/调律随机" },
  { xpToNext: 48, note: "稀有池：补齐回响/调律" },
  { xpToNext: 56, note: "选择第三元素，随机领悟一条新反应" },
  { xpToNext: 64, note: "史诗池随机 1 项" },
  { xpToNext: 72, note: "史诗池随机 1 项" },
  { xpToNext: 80, note: "史诗池：补齐三项（三环共鸣保底）" },
  { xpToNext: 88, note: "终极池随机 1 项" },
  { xpToNext: 96, note: "终极池随机 1 项" },
  { xpToNext: null, note: "终极池：补齐三项" },
];

/** 每次成功施法获得的法杖经验。 */
export const STAFF_XP_PER_CAST = 1;

/** 每 4 次成功施法切换元素；反应触发条件不变。 */
export const MAGE_CASTS_PER_ELEMENT = 4;

export interface MageNormalUpgradeDef {
  readonly id: MageNormalUpgradeId;
  readonly name: string;
  readonly ico: string;
  readonly desc: string;
}

export interface MageRareUpgradeDef {
  readonly id: MageRareUpgradeId;
  readonly name: string;
  readonly ico: string;
  readonly desc: string;
}

export interface MageEpicUpgradeDef {
  readonly id: MageEpicUpgradeId;
  readonly name: string;
  readonly ico: string;
  readonly desc: string;
}

export interface MageUltimateUpgradeDef {
  readonly id: MageUltimateUpgradeId;
  readonly name: string;
  readonly ico: string;
  readonly desc: string;
}

export const MAGE_NORMAL_UPGRADES: readonly MageNormalUpgradeDef[] = [
  {
    id: "elementFocus",
    name: "元素凝聚",
    ico: "✹",
    desc: "已拥有元素的状态持续时间 +1 秒",
  },
  {
    id: "circleWidth",
    name: "法阵扩幅",
    ico: "◉",
    desc: "法阵半径 +8%",
  },
];

export const MAGE_RARE_UPGRADES: readonly MageRareUpgradeDef[] = [
  {
    id: "echoCircle",
    name: "回响法阵",
    ico: "🔔",
    desc: "每次法阵延迟 0.3 秒再响一次，造成 37.5% 伤害；不施加元素状态、不触发反应、不给武器经验",
  },
  {
    id: "tempo",
    name: "咏唱调律",
    ico: "🎼",
    desc: "施法速度 +4%；法阵直伤 +10%",
  },
  {
    id: "prismRare",
    name: "元素棱镜",
    ico: "💠",
    desc: "每第 4 次成功施法留下棱镜 4 秒；下一次法阵从棱镜折射 50% 当前元素伤害。A 套装：分裂到棱镜周围两个分开的目标点，各 25%；B 套装：50% 集中折射到主落点",
  },
];

export const MAGE_EPIC_UPGRADES: readonly MageEpicUpgradeDef[] = [
  {
    id: "missingReaction",
    name: "三环共鸣",
    ico: "✴️",
    desc: "补全所选三元素之间最后一条配对反应，使元素轮盘上的三条反应全部点亮",
  },
  {
    id: "prismEpic",
    name: "元素棱镜·史诗",
    ico: "🔷",
    desc: "折射预算 50% → 80%，棱镜可存 2 发再碎裂；A 套装两个落点各 40%，B 套装集中 80% 到主落点",
  },
  {
    id: "reactionMastery",
    name: "反应精通",
    ico: "☯️",
    desc: "元素反应伤害 +15%，反应 ICD −0.1 秒（基础 0.5 → 0.4 秒）",
  },
];

export const MAGE_ULTIMATE_UPGRADES: readonly MageUltimateUpgradeDef[] = [
  {
    id: "prismUltimate",
    name: "元素棱镜·终极",
    ico: "🔮",
    desc: "保留 80%/2 发；棱镜碎裂时追加 120% 范围冲击，并按记录元素与当前元素触发元素震爆",
  },
  {
    id: "splitShadow",
    name: "分影齐射",
    ico: "👥",
    desc: "本体法阵触发元素反应后，召唤左右两个残影各释放一次 55% 法阵；6 秒冷却。残影只施加 60% 持续时间的元素状态，不触发反应、不给武器经验/吸血",
  },
  {
    id: "reactionFinale",
    name: "反应终章",
    ico: "☯️",
    desc: "元素反应伤害 +25%；A 套装向附近 1 个敌人传播低伤害回响，B 套装对冻结/霜牢目标额外 +30%",
  },
];

/** 法杖强化最多可得项：普通 1 + 稀有 2 + 史诗 3 + 终极 3。 */
export const MAGE_UPGRADE_SLOTS = 9;

/** 强化定义查询：C 面板展示名称与描述。 */
export function mageUpgradeInfo(
  id: MageUpgradeId,
): { name: string; desc: string } | null {
  const all = [
    ...MAGE_NORMAL_UPGRADES,
    ...MAGE_RARE_UPGRADES,
    ...MAGE_EPIC_UPGRADES,
    ...MAGE_ULTIMATE_UPGRADES,
  ];
  const def = all.find((u) => u.id === id);
  return def ? { name: def.name, desc: def.desc } : null;
}

/** 所有法杖强化 id → 显示名；UI 与提示共用。 */
export function mageUpgradeName(id: MageUpgradeId): string {
  const all = [
    ...MAGE_NORMAL_UPGRADES,
    ...MAGE_RARE_UPGRADES,
    ...MAGE_EPIC_UPGRADES,
    ...MAGE_ULTIMATE_UPGRADES,
  ];
  return all.find((u) => u.id === id)?.name ?? id;
}

export const ELEMENTAL_MAGE = {
  burn: {
    stackCap: 3,
    duration: 3,
    tick: 0.5,
    damagePerLayer: 0.2,
  },
  frost: {
    stackCap: 3,
    slowPerStack: 0.05,
    duration1: 3,
    duration2: 6,
    freezeDuration: 1.5,
  },
  paralyze: {
    duration: 3,
    attackSlow: 0.3,
    moveSlow: 0.1,
  },
  shock: {
    duration: 4,
  },
  brittle: {
    duration: 4,
    reactionBonus: 0.15,
  },
  frostLock: {
    duration: 2,
    extend: 0.4,
    maxDuration: 4.5,
    extendIcd: 0.2,
  },
  chain: {
    chance: 0.3,
    jumps: 3,
    damageMul: 0.4,
    range: 90,
    superconductJumps: 4,
  },
  reaction: {
    /** 每只敌人两次反应之间的基础间隔；低于基础施法周期，避免前期误伤；精通再降低。 */
    icdBase: 0.5,
    /** 反应后留下的触发元素附着层数；急淬不再额外挂 2 层。 */
    carryOverStacks: 1,
    quenchPerBurn: 0.8,
    meltPerFrost: 0.95,
    overloadPerBurn: 1.25,
    blazeMain: 1.2,
    blazeSplash: 0.6,
    blazeSplashCount: 3,
    blazeSplashRadius: 80,
    /** 超导：按凝冰层数结算的低倍率反应伤害（同时保留闪电链）。 */
    superconductPerFrost: 0.45,
    /** 霜缚：固定低倍率反应伤害（雷印为单层标记）。 */
    frostbindPerShock: 0.4,
  },
  death: {
    /** 死亡传播：带附着的敌人死亡时，向附近最多 2 个敌人传播 1 层最近附着。 */
    spreadRadius: 90,
    spreadTargets: 2,
    spreadStacks: 1,
  },
  normal: {
    elementFocusBonus: 1,
    circleWidthMul: 1.08,
  },
  prism: {
    life: 4,
    rareBudget: 0.5,
    rareCharges: 1,
    epicBudget: 0.8,
    epicCharges: 2,
    /** A 套装在棱镜周围寻找两个怪群的范围。 */
    searchRange: 140,
    /** 两个折射落点之间的最小距离。 */
    minSep: 50,
    /** 终极碎裂：120% 范围冲击半径。 */
    ultimateShatterMul: 1.2,
    ultimateShatterRadius: 90,
  },
  echo: {
    delay: 0.3,
    damageMul: 0.375,
  },
  tempo: {
    castSpeed: 0.04,
    /** 法阵直伤（含回响/分影/折射等派生直伤）倍率。 */
    directDamage: 0.1,
  },
  mastery: {
    reactionDamage: 0.15,
    icdReduction: 0.1,
  },
  finale: {
    reactionDamage: 0.25,
    /** A 套装反应回响：向附近 1 个敌人传播的伤害比例。 */
    echoMul: 0.4,
    echoRadius: 80,
    /** B 套装：对冻结/霜牢目标的额外反应伤害。 */
    controlledBonus: 0.3,
  },
  shadow: {
    damageMul: 0.55,
    /** 残影施加的元素状态持续时间倍率。 */
    statusDurationMul: 0.6,
    cooldown: 6,
    lifetime: 0.35,
    /** 两个残影与主角的横向间距。 */
    offset: 12,
    /** A 套装寻找两个不同目标点的搜索范围与最小间距。 */
    searchRange: 150,
    minSep: 50,
  },
} as const;

/** v177 元素使玩家三选一构筑卡的规则与初始占位数值。 */
export const MAGE_BUILD = {
  chainResonance: {
    name: "霜雷共振",
    extraJumps: 1,
    damageBonus: 0.15,
  },
  blazeSpread: {
    name: "焰尾扩散",
    radiusMul: 1.2,
    extraTargets: 1,
    burnStacks: 1,
  },
  rotation: {
    name: "轮转",
    reactionBonus: 0.2,
  },
  frostShatter: {
    name: "霜牢碎裂",
    radius: 80,
    targets: 2,
    frostStacks: 2,
  },
  charge: {
    name: "满印成势",
    layers: 3,
    reactionBonus: 0.2,
  },
} as const;

/**
 * 元素选择面板的伪卡。它们**不进 UPGRADES**，只在法杖 Lv1/3/6 的
 * 强制选择里作为 `slots` 展示；选择结果写入 GameCore.mageElements，
 * 不写 upCounts/picks。
 */
export const MAGE_ELEMENT_CHOICES: readonly Talent[] = MAGE_ELEMENT_ORDER.map(
  (el) => {
    const def = MAGE_ELEMENTS[el];
    return {
      n: `元素·${def.name}`,
      ico: def.ico,
      t: 0,
      cat: "元素",
      slot: "元素",
      layer: 1,
      prof: "mage",
      d: def.desc,
      max: 1,
      pv: () => `${Math.round(def.damageMul * 100)}% 元素伤害`,
      f: () => {},
      cur: () => def.name,
    };
  },
);

/** 伪卡名 → 元素。 */
export function elementOfChoice(cardName: string): MageElement | null {
  for (const el of MAGE_ELEMENT_ORDER) {
    if (`元素·${MAGE_ELEMENTS[el].name}` === cardName) return el;
  }
  return null;
}
