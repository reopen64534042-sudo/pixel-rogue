import { TIERS } from "../data/talents";
import type { Player } from "./types";
import type { GameCore } from "./GameCore";
import type { AttributePoint } from "./AttributeSources";
import type { ModifierStage, StatId } from "./StatModel";

/**
 * 伤害重做 S1：属性发放（波末四选一 + 一次刷新）。
 *
 * 设计口径（`docs/talent-pool-design-rules.md` §5.3 / `damage-rework-coordination-v1.md` §4-D）：
 * - 四格固定为 攻势 / 守势 / 功能 / 特殊，各出一格，所以「方向」永远齐全；
 * - 稀有度**纯随机、无保底**，刷新会把稀有度一起重掷（可能把金刷成白）；
 * - 数值梯度 1 : 1.5 : 2.1 : 2.9（白/绿/紫/金，约每档 ×1.45）；
 * - 概率随等级每 5 级一档，越到后期高档越常见——这是「越打越值钱」的来源；
 * - 已到上限的属性**不进候选**（玩家永远看不到无效选项，也不需要理解「已满」）。
 *
 * 与天赋的分工：属性只做「线性、无条件、可预期」的数值成长。凡是改变打法的
 * （穿透、多段、护盾、触发类）都留在天赋里；本模块不应出现任何条件逻辑。
 *
 * 暂未纳入的两项：`dodge`（闪避）与 `regen`（回复）尚无权威来源——它们目前
 * 由旧卡 `f` 直接写 Player（闪避本能 / 修复微光），纳入投影需要先把那两张卡
 * 迁进来源表（S2 的迁移批次）。在那之前属性池里不提供它们，避免出现
 * 「投影写回 0 把卡的加成抹掉」这类问题。
 */

export type AttrGroup = "offense" | "defense" | "utility" | "special";

export interface AttrGroupDef {
  readonly key: AttrGroup;
  readonly label: string;
}

export const ATTR_GROUPS: readonly AttrGroupDef[] = [
  { key: "offense", label: "攻势" },
  { key: "defense", label: "守势" },
  { key: "utility", label: "功能" },
  { key: "special", label: "特殊" },
];

export interface AttrDef {
  readonly group: AttrGroup;
  /** 面板上的属性名（极简：只给名字与数值，不给公式） */
  readonly label: string;
  readonly stat: StatId;
  readonly stage: ModifierStage;
  /** 白档数值：flat 为绝对值，percent 为小数（0.04 = +4%） */
  readonly base: number;
  /** 显示方式：int 整数、pct 百分比 */
  readonly kind: "int" | "pct";
  /** 返回 true 表示已到上限，不再进入候选 */
  readonly capped?: (p: Player) => boolean;
}

/**
 * 属性目录（白档基准）。数值全部为占位，配平阶段统一调整。
 *
 * 每格至少 2 个候选：只有一个时「这一格」就不是选择而是发放。
 */
export const ATTR_DEFS: readonly AttrDef[] = [
  { group: "offense", label: "攻击", stat: "attack", stage: "flat", base: 5, kind: "int" },
  { group: "offense", label: "攻速", stat: "fireRate", stage: "percent", base: 0.04, kind: "pct" },
  {
    group: "offense",
    label: "暴击",
    stat: "critChance",
    stage: "flat",
    base: 0.03,
    kind: "pct",
    capped: (p) => p.crit >= 1,
  },

  { group: "defense", label: "生命", stat: "maxHp", stage: "flat", base: 15, kind: "int" },
  { group: "defense", label: "护甲", stat: "defense", stage: "flat", base: 6, kind: "int" },

  { group: "utility", label: "移速", stat: "moveSpeed", stage: "percent", base: 0.04, kind: "pct" },
  // 「拾取范围」：magnet 决定经验球与血瓶的自动吸附半径（ProgressionSystem）。
  // 旧名「拾取」含义模糊（是范围？速度？自动？），直接写清范围，不加额外提示。
  { group: "utility", label: "拾取范围", stat: "magnet", stage: "flat", base: 8, kind: "int" },
  { group: "utility", label: "射程", stat: "attackRange", stage: "percent", base: 0.05, kind: "pct" },

  {
    group: "special",
    label: "暴伤",
    stat: "critMultiplier",
    stage: "flat",
    base: 0.15,
    kind: "pct",
  },
  {
    group: "special",
    label: "增伤",
    stat: "globalDamageBonus",
    stage: "percent",
    base: 0.05,
    kind: "pct",
  },
  { group: "special", label: "范围", stat: "area", stage: "percent", base: 0.05, kind: "pct" },
];

/** 稀有度倍率：白 / 绿 / 紫 / 金 */
export const RARITY_MUL = [1, 1.5, 2.1, 2.9] as const;

/**
 * 稀有度概率（百分比，每 5 级一档，30 级后封顶）。
 * 期望倍率从 1.29 涨到 2.13，一局约 ×1.65——这是替代「后期次数更多」的加速器。
 */
export const RARITY_CHANCE: readonly (readonly number[])[] = [
  [60, 28, 10, 2],
  [48, 32, 16, 4],
  [36, 34, 22, 8],
  [26, 34, 27, 13],
  [18, 32, 31, 19],
  [12, 28, 34, 26],
  [8, 24, 35, 33],
];

export function rarityChances(lvl: number): readonly number[] {
  const i = Math.min(RARITY_CHANCE.length - 1, Math.max(0, Math.floor(lvl / 5)));
  return RARITY_CHANCE[i];
}

/** 每波给几次属性选择：1-10 波各 1 次，11-20 波 2 次，21 波起 3 次（一局 60 次） */
export function attrPicksPerWave(wave: number): number {
  return 1 + Math.floor((wave - 1) / 10);
}

export interface AttrChoice {
  readonly def: AttrDef;
  /** 稀有度档位 0..3（与 TIERS 同序：普通/稀有/史诗/传奇） */
  readonly rarity: number;
  /** 已乘稀有度倍率、并按显示方式取整后的数值 */
  readonly value: number;
  /** 面板文案：`+8` / `+12%` */
  readonly text: string;
}

function pickRarity(lvl: number): number {
  const w = rarityChances(lvl);
  const total = w[0] + w[1] + w[2] + w[3];
  let roll = Math.random() * total;
  for (let i = 0; i < w.length; i++) {
    if (roll < w[i]) return i;
    roll -= w[i];
  }
  return 0;
}

function quantize(def: AttrDef, raw: number): number {
  // 整数型保底 1，避免「金色 +0 攻击」这种笑话；百分比保留 3 位小数
  return def.kind === "int" ? Math.max(1, Math.round(raw)) : Math.round(raw * 1000) / 1000;
}

function textOf(def: AttrDef, value: number): string {
  return def.kind === "int" ? `+${value}` : `+${Math.round(value * 1000) / 10}%`;
}

function makeChoice(def: AttrDef, p: Player): AttrChoice {
  const rarity = pickRarity(p.lvl);
  const value = quantize(def, def.base * RARITY_MUL[rarity]);
  return { def, rarity, value, text: textOf(def, value) };
}

/**
 * 掷出四格候选：每格一个，且**同格内按已到上限过滤**。
 *
 * 某格全被过滤（例如暴击满了而攻势只剩它可选）时，该格改为必出的「攻击」，
 * 保证四格永远有四个可选项——否则会退化成三选一甚至空白面板。
 */
export function rollAttrChoices(p: Player): AttrChoice[] {
  return ATTR_GROUPS.map((group) => {
    const pool = ATTR_DEFS.filter(
      (d) => d.group === group.key && !(d.capped?.(p) ?? false),
    );
    const usable = pool.length ? pool : ATTR_DEFS.filter((d) => d.stat === "attack");
    const def = usable[Math.floor(Math.random() * usable.length)];
    return makeChoice(def, p);
  });
}

/** 候选 → 可提交的属性点（stage 与数值原样带过去） */
export function toAttributePoint(choice: AttrChoice): AttributePoint {
  return {
    stat: choice.def.stat,
    stage: choice.def.stage,
    value: choice.value,
  };
}

/** 稀有度显示名（与天赋共用四档命名，便于玩家把两套系统对起来） */
export function rarityLabel(rarity: number): string {
  return TIERS[rarity];
}

/** 方向显示名 */
export function groupLabel(group: AttrGroup): string {
  return ATTR_GROUPS.find((g) => g.key === group)?.label ?? group;
}

// ---- 面板流程 -------------------------------------------------------------
// 与天赋面板同构：open 掷四格、refresh 全量重掷一次、choose 落地并 recompute。
// 与天赋的关键差异：这里**可能连续选多次**（attrPicks 由波次给），所以 choose 后
// 若仍有剩余次数，就地重掷下一组，不关闭面板。

export function openAttrPanel(this: GameCore) {
  if (this.bpMode) return;
  this.bpMode = "attr";
  this.attrChoices = rollAttrChoices(this.player);
  this.attrRefreshUsed = false;
  this.view.attr();
}

export function refreshAttr(this: GameCore) {
  this.ensurePlay(); // Issue #34：与天赋刷新一致，先收掉属性覆盖层
  if (this.state !== "play" || this.bpMode !== "attr" || this.attrRefreshUsed)
    return false;
  this.attrChoices = rollAttrChoices(this.player);
  this.attrRefreshUsed = true;
  this.view.attr();
  return true;
}

export function chooseAttr(this: GameCore, index: number) {
  this.ensurePlay();
  if (this.state !== "play" || this.bpMode !== "attr") return false;
  const choice = this.attrChoices[index];
  if (!choice) return false;
  this.attributePicks.push(toAttributePoint(choice));
  if (this.attrPicks > 0) this.attrPicks--;
  this.recompute();
  if (this.attrPicks > 0) {
    // 还有次数：就地换一组新的，刷新额度重置（每「次选择」各有一次刷新）
    this.attrChoices = rollAttrChoices(this.player);
    this.attrRefreshUsed = false;
  } else {
    this.attrChoices = [];
    this.bpMode = null;
  }
  this.view.attr();
  return true;
}

