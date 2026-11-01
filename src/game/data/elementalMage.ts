import type { Talent } from "../core/types";
import type { MageElement } from "./mageBalance";
export type { MageElement };

/**
 * 元素法师 v2（docs/elemental-mage-rework.md）的规则数据。
 *
 * 这里只放**可被 UI 与 Core 共同读取的规则与系数**；伤害公式仍在
 * DamageMath / DamageSystem，系统文件只引用本表的键。
 *
 * v185 P1：法杖等级、每 4 次施法轮盘、Lv1/4/7 元素、A/B 套装、
 * 六反应与六专精、分影/双影协奏；回响/普通池/三环/反应终章/棱镜终极已移除。
 */

export type MageSuit = "A" | "B";

export type MageReactionId =
  | "quench"
  | "melt"
  | "overload"
  | "blaze"
  | "superconduct"
  | "frostbind";

export type MageUpgradeId =
  | "tempo"
  | "prismRare"
  | "prismEpic"
  | "specQuench"
  | "specMelt"
  | "specOverload"
  | "specBlaze"
  | "specSuperconduct"
  | "specFrostbind"
  | "splitShadow"
  | "splitShadowPlus"
  | "grandmasterPlaceholder";

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
 * v185 P1：元素在 Lv1/4/7；Lv2 固定咏唱调律，Lv3 基础棱镜，Lv5/8/9
 * 反应专精，Lv10/11 分影/双影协奏，Lv12 为大法师觉醒占位。
 * 经验来源：每次本体法阵实际命中至少 1 个敌人 +1。
 */
export interface StaffLevelDef {
  readonly xpToNext: number | null;
  readonly note: string;
}

export const STAFF_LEVELS: readonly StaffLevelDef[] = [
  { xpToNext: 12, note: "选择第一元素" },
  { xpToNext: 24, note: "固定：咏唱调律" },
  { xpToNext: 32, note: "元素棱镜（基础）" },
  { xpToNext: 40, note: "选择第二元素，领悟 R1 反应" },
  { xpToNext: 48, note: "R1 专精" },
  { xpToNext: 56, note: "元素棱镜·史诗" },
  { xpToNext: 64, note: "选择第三元素，补齐 R2/R3" },
  { xpToNext: 72, note: "R2 专精（与 R3 随机顺序）" },
  { xpToNext: 80, note: "R3 专精" },
  { xpToNext: 88, note: "分影" },
  { xpToNext: 96, note: "双影协奏" },
  { xpToNext: null, note: "大法师觉醒占位（全元素伤害 +5%）" },
];

/** 每次成功施法获得的法杖经验。 */
export const STAFF_XP_PER_CAST = 1;

/** 每 4 次成功施法切换元素；反应触发条件不变。 */
export const MAGE_CASTS_PER_ELEMENT = 4;

export interface MageStaffUpgradeDef {
  readonly id: MageUpgradeId;
  readonly name: string;
  readonly ico: string;
  readonly desc: string;
}

export interface MageSpecializationDef extends MageStaffUpgradeDef {
  readonly reaction: MageReactionId;
}

/** 六种反应专精：全部由法杖等级成长发放，不进三选一天赋池。 */
export const MAGE_SPECIALIZATIONS: Record<
  MageReactionId,
  MageSpecializationDef
> = {
  quench: {
    reaction: "quench",
    id: "specQuench",
    name: "余寒",
    ico: "❄️",
    desc: "急淬后脆化 4→6 秒；向 60px 内 1 个敌人传播 1 层凝冰（不触发反应）",
  },
  melt: {
    reaction: "melt",
    id: "specMelt",
    name: "余炽",
    ico: "♨️",
    desc: "融化后额外施加 1 层灼烧；对冻结/霜牢目标，融化伤害 +20% 且控制延长 0.5 秒",
  },
  overload: {
    reaction: "overload",
    id: "specOverload",
    name: "雷爆",
    ico: "⚡",
    desc: "超载后目标获得 1 层雷印；击杀时向 80px 内最多 2 个敌人传播 1 层灼烧（不触发反应）",
  },
  blaze: {
    reaction: "blaze",
    id: "specBlaze",
    name: "焰尾扩散",
    ico: "🔥",
    desc: "裂焰小爆炸范围 +20%、目标 +1；溅射目标获得 1 层灼烧",
  },
  superconduct: {
    reaction: "superconduct",
    id: "specSuperconduct",
    name: "霜雷共振",
    ico: "❄⚡",
    desc: "超导链额外 +1 跳、链伤害 +15%",
  },
  frostbind: {
    reaction: "frostbind",
    id: "specFrostbind",
    name: "霜牢碎裂",
    ico: "🧊",
    desc: "霜牢自然结束或被融化时，向目标及附近 2 个敌人传播 2 层凝冰",
  },
};

/** 专精的数值配置；消费点在 ElementSystem。 */
export const MAGE_SPEC_VALUES = {
  quench: {
    brittleBonus: 2,
    spreadStacks: 1,
    spreadRadius: 60,
    spreadTargets: 1,
  },
  melt: {
    extraBurn: 1,
    controlledBonus: 0.2,
    controlExtend: 0.5,
  },
  overload: {
    shockStacks: 1,
    deathSpreadBurn: 1,
    deathSpreadTargets: 2,
    deathSpreadRadius: 80,
  },
  blaze: { radiusMul: 1.2, extraTargets: 1, burnStacks: 1 },
  superconduct: { extraJumps: 1, damageBonus: 0.15 },
  frostbind: { targets: 2, stacks: 2, radius: 80 },
} as const;

export const MAGE_STAFF_UPGRADES: readonly MageStaffUpgradeDef[] = [
  {
    id: "tempo",
    name: "咏唱调律",
    ico: "🎼",
    desc: "施法速度 +5%；法阵范围 +10%",
  },
  {
    id: "prismRare",
    name: "元素棱镜",
    ico: "💠",
    desc: "每第 4 次成功施法留下棱镜 4 秒；下一次法阵从棱镜折射 50% 当前元素伤害。A 套装：分裂到棱镜周围两个分开的目标点，各 25%；B 套装：50% 集中折射到主落点",
  },
  {
    id: "prismEpic",
    name: "元素棱镜·史诗",
    ico: "🔷",
    desc: "折射预算 50% → 80%，棱镜可存 2 发再碎裂；A 套装两个落点各 40%，B 套装集中 80% 到主落点",
  },
  ...Object.values(MAGE_SPECIALIZATIONS),
  {
    id: "splitShadow",
    name: "分影",
    ico: "👥",
    desc: "每个元素第 4 下攻击召唤左右 2 个残影，各持另外两种元素；法阵为主角 80%，不结算直伤，只挂附着/触发反应；反应伤害为正常的 60%",
  },
  {
    id: "splitShadowPlus",
    name: "双影协奏",
    ico: "👥",
    desc: "左右 2 个残影常驻；每个元素第 2、第 4 下协同攻击；法阵与主角同大，不结算直伤，反应伤害为正常的 80%；残影独立反应预算、无视本体 ICD",
  },
  {
    id: "grandmasterPlaceholder",
    name: "大法师觉醒·占位",
    ico: "✧",
    desc: "Lv12 占位：全元素伤害 +5%；P2 由元素大法师替换",
  },
];

/** 法杖等级成长最多可得项：Lv2–12 共 9 项（Lv4/7 为元素选择）。 */
export const MAGE_UPGRADE_SLOTS = 9;

/** 强化定义查询：C 面板展示名称与描述。 */
export function mageUpgradeInfo(
  id: MageUpgradeId,
): { name: string; desc: string } | null {
  const def = MAGE_STAFF_UPGRADES.find((u) => u.id === id);
  return def ? { name: def.name, desc: def.desc } : null;
}

/** 所有法杖强化 id → 显示名；UI 与提示共用。 */
export function mageUpgradeName(id: MageUpgradeId): string {
  return MAGE_STAFF_UPGRADES.find((u) => u.id === id)?.name ?? id;
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
  prism: {
    life: 6,
    rareBudget: 0.6,
    rareCharges: 2,
    epicBudget: 0.8,
    epicCharges: 2,
    /** A 套装在棱镜周围寻找两个怪群的范围。 */
    searchRange: 140,
    /** 两个折射落点之间的最小距离。 */
    minSep: 50,
  },
  tempo: {
    castSpeed: 0.05,
    /** 法阵范围（半径乘区）。 */
    circleRange: 0.1,
  },
  /** Lv12 占位：全元素伤害 +5%，P2 由元素大法师替换。 */
  grandmasterPlaceholder: {
    elementDamageBonus: 0.05,
  },
  shadow: {
    /** 基础分影：法阵半径 / 反应伤害倍率。 */
    radiusMulBasic: 0.8,
    reactionScaleBasic: 0.6,
    /** 双影协奏：法阵半径 / 反应伤害倍率。 */
    radiusMulPlus: 1,
    reactionScalePlus: 0.8,
    lifetime: 0.35,
    /** 两个残影与主角的横向间距。 */
    offset: 12,
    /** A 套装寻找两个不同目标点的搜索范围与最小间距。 */
    searchRange: 150,
    minSep: 50,
  },
} as const;

/** v177–v180 元素使玩家三选一构筑卡的规则与初始占位数值。 */
export const MAGE_BUILD = {
  rotation: {
    name: "轮转",
    reactionBonus: 0.2,
  },
  charge: {
    name: "满印成势",
    layers: 3,
    reactionBonus: 0.2,
  },
  pierce: {
    name: "破法",
    resistancePen: 0.15,
  },
} as const;

/**
 * 元素选择面板的伪卡。它们**不进 UPGRADES**，只在法杖 Lv1/4/7 的
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
