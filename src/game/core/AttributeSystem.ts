import { ATTRIBUTE_CAPS, lifestealCap } from "../data/attributeBalance";
import { statBase } from "../data/stats";
import { TIERS } from "../data/talents";
import type { Player, Profession, ShooterWeapon, WarriorStyle } from "./types";
import type { GameCore } from "./GameCore";
import type { AttributePoint } from "./AttributeSources";
import type { ModifierStage, StatId } from "./StatModel";

/**
 * 伤害重做 S1：属性发放（波末四选一 + 一次刷新）。
 *
 * 设计口径（`docs/talent-pool-design-rules.md` §5.3 / `damage-rework-coordination-v1.md` §4-D）：
 * - 四格固定为 输出 / 生存 / 续航 / 功能，各出一格，所以「方向」永远齐全；
 * - 稀有度**纯随机、无保底**，刷新会把稀有度一起重掷（可能把金刷成白）；
 * - 数值梯度 1 : 1.5 : 2.1 : 2.9（白/绿/紫/金，约每档 ×1.45）；
 * - 概率随等级每 5 级一档，越到后期高档越常见——这是「越打越值钱」的来源；
 * - 已到上限的属性**不进候选**（玩家永远看不到无效选项，也不需要理解「已满」）。
 *
 * 与天赋的分工：属性只做「线性、无条件、可预期」的数值成长。凡是改变打法的
 * （穿透、多段、护盾、触发类）都留在天赋里；本模块不应出现任何条件逻辑。
 *
 * 分类轴：玩家拿这张卡想解决什么问题——打得更疼（输出）/ 不被秒（生存）/
 * 打完能回（续航）/ 走位、拾取、打得更远更广（功能）。暴击与暴击伤害同组，
 * 吸血与生命回复同组，不再使用「特殊」兜底。
 *
 * `regen`（生命回复）已随 #135 纳入：StatModel 白名单补了 lifesteal/regen，
 * 投影侧改成「有来源才写」，因此不会与旧卡 `f` 的直写冲突。
 */

/**
 * 内部 key 沿用历史命名（offense/defense/special/utility），玩家看到的标签
 * 以 ATTR_GROUPS 为准；`special` 现在表示「续航」，不再表示「特殊」。
 */
export type AttrGroup = "offense" | "defense" | "utility" | "special";

export interface AttrGroupDef {
  readonly key: AttrGroup;
  readonly label: string;
}

export const ATTR_GROUPS: readonly AttrGroupDef[] = [
  { key: "offense", label: "输出" },
  { key: "defense", label: "生存" },
  { key: "special", label: "续航" },
  { key: "utility", label: "功能" },
];

export interface AttrDef {
  readonly group: AttrGroup;
  /** 面板上的属性名（极简：只给名字与数值，不给公式） */
  readonly label: string;
  /** 职业专属候选（省略 = 所有职业通用） */
  readonly prof?: Profession;
  /** 射手武器专属候选；省略表示不按主武器过滤。 */
  readonly shooterWeapon?: ShooterWeapon;
  /**
   * 职业专属显示名。底层的 stat 不变，只换玩家看到的名字——
   * 法师的「攻击/攻速/射程」实际驱动的是元素伤害、施法速度、施法距离，
   * 沿用射手口径会让玩家以为自己在加物理攻击。
   */
  readonly labels?: Partial<Record<Profession | ShooterWeapon, string>>;
  /** 用于说明职业 / 武器口径下的实际收益。 */
  readonly hints?: Partial<Record<Profession | ShooterWeapon, string>>;
  readonly stat: StatId;
  readonly stage: ModifierStage;
  /** 白档数值：flat 为绝对值，percent 为小数（0.04 = +4%） */
  readonly base: number;
  /**
   * 显示方式：
   * - `int` 整数（保底 1，避免「金色 +0 攻击」）
   * - `pct` 百分比（×100 显示）
   * - `dec` 一位小数（生命回复这类 0.6/秒 的量级，取整会失真）
   */
  readonly kind: "int" | "pct" | "dec";
  /** 数值后缀（如「/秒」），拼在显示值后面 */
  readonly unit?: string;
  /** 返回 true 表示已到上限，不再进入候选 */
  readonly capped?: (
    p: Player,
    prof: Profession,
    warriorStyle: WarriorStyle,
  ) => boolean;
}

/**
 * 属性目录（白档基准）。数值全部为占位，配平阶段统一调整。
 *
 * 每格至少 2 个候选：只有一个时「这一格」就不是选择而是发放。
 */
export const ATTR_DEFS: readonly AttrDef[] = [
  // ================= 输出 =================
  // #134 方案 B：攻击 +5 → +2。
  // 原值对基础攻击 11 是 **+45%/次**，配上每波 5-7 次，30 波能把攻击堆到数百，
  // 天赋的机制收益完全被淹没。+2 约等于 +18%/次，与「一次选择 = 一个小台阶」相称。
  { group: "offense", label: "攻击", labels: { mage: "元素伤害" }, stat: "attack", stage: "flat", base: 2, kind: "int" },
  { group: "offense", label: "攻速", labels: { mage: "施法速度", laser: "光束输出" }, hints: { laser: "提高光束每秒伤害" }, stat: "fireRate", stage: "percent", base: 0.04, kind: "pct", capped: (p, prof, style) => p.fireRate >= statBase(prof, style).fireRate * ATTRIBUTE_CAPS.fireRateMul },
  {
    group: "offense",
    label: "暴击",
    stat: "critChance",
    stage: "flat",
    base: 0.03,
    kind: "pct",
    capped: (p) => p.crit >= 1,
  },
  {
    group: "offense",
    label: "暴击伤害",
    stat: "critMultiplier",
    stage: "flat",
    base: 0.15,
    kind: "pct",
  },
  {
    group: "offense",
    label: "全局增伤",
    stat: "globalDamageBonus",
    // 增伤比例从 0 起算：+5% 是 flat +0.05，再由伤害管线乘 (1 + bonus)。
    stage: "flat",
    base: 0.05,
    kind: "pct",
  },

  // ================= 生存 =================
  // #134 方案 B：生命 +15 → +10（对基础 100 是 +10%/次，原先 15% 偏猛）
  { group: "defense", label: "生命", stat: "maxHp", stage: "flat", base: 10, kind: "int" },
  { group: "defense", label: "护甲", stat: "defense", stage: "flat", base: 6, kind: "int" },
  // S5：闪避（完全免伤）。上限 60% 取自设计文档附录 E 的成长预算；
  // 白档 +3%（与暴击同档），金色 8.7%，集中投入约 7 次到顶。
  // 来源迁移：旧卡「闪避本能」已进 TalentStatSources，投影不会互相抹。
  {
    group: "defense",
    label: "闪避",
    stat: "dodge",
    stage: "flat",
    base: 0.03,
    kind: "pct",
    capped: (p) => p.dodge >= 0.6,
  },

  // ================= 续航 =================
  // 续航之一（#135）：命中回复伤害的百分比。
  // 0.04 = 4%/次：前期攻击 11 → 约 0.44/次、攻速 2.2 → 约 1/s，
  // 后期攻击上百后成为主要回复来源（与「生命回复」形成「打得多回得多 vs 稳定回」的分工）。
  {
    group: "special",
    label: "吸血",
    stat: "lifesteal",
    stage: "flat",
    base: 0.04,
    kind: "pct",
    capped: (p, prof) => p.lifesteal >= lifestealCap(prof),
  },
  // 续航之二（#135）：每秒固定回复。0.6/秒 取自旧卡「修复微光」，
  // 避免出现第二套量级。
  {
    group: "special",
    label: "生命回复",
    stat: "regen",
    stage: "flat",
    base: 0.6,
    kind: "dec",
    unit: "/秒",
    capped: (p) => p.regen >= ATTRIBUTE_CAPS.regen,
  },

  // ================= 功能 =================
  { group: "utility", label: "移速", stat: "moveSpeed", stage: "percent", base: 0.04, kind: "pct", capped: (p, prof, style) => p.speed >= statBase(prof, style).speed * ATTRIBUTE_CAPS.moveSpeedMul },
  // v137：移除「拾取范围」属性候选。magnet 仍保留给旧卡「磁力护符」
  // 与 ProgressionSystem 的吸附逻辑，但不再作为升级选项投放。
  { group: "utility", label: "射程", labels: { mage: "施法距离", warrior: "近战范围" }, stat: "attackRange", stage: "percent", base: 0.05, kind: "pct" },
  // 法阵范围：S2（#135）因射手零感知被移出面板，S3 法师的法阵半径直接读
  // `p.area`（mageCircleRadius），因此只对法师投放。
  { group: "utility", label: "法阵范围", prof: "mage", stat: "area", stage: "percent", base: 0.05, kind: "pct" },
  // 复用已接通的 area 来源，激光的碰撞 / 绘制都由 laserWidth 消费。
  { group: "utility", label: "光束宽度", prof: "shooter", shooterWeapon: "laser", hints: { laser: "加宽光束，扩大扫中敌人的范围" }, stat: "area", stage: "percent", base: 0.1, kind: "pct" },
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

/** 当前等级下白/绿/紫/金的期望倍率；用于品质威胁的基准线。 */
export function expectedRarity(lvl: number): number {
  const row = rarityChances(lvl);
  const total = row.reduce((a, b) => a + b, 0);
  return row.reduce((sum, p, idx) => sum + (p / total) * RARITY_MUL[idx], 0);
}

/** 每波给几次属性选择：1-10 波各 1 次，11-20 波 2 次，21 波起 3 次（一局 60 次） */
/**
 * 每波**新增**属性选择次数的硬上限（#134 方案 B）。
 *
 * 注意这是「新增额度」不是「存量上限」：`attrPicks` 仍是累加的（保留「这波没选完
 * 可以留到下次」的既有行为），但一波之内无论多少来源（基础额度 / 普通宝箱 /
 * 精英宝箱）合计不会超过这个数。
 *
 * 改之前：基础最多 3 + 宝箱最多 4 = 单波最多 7 次；一局约 120 次属性对上 8 次天赋，
 * 权重 15:1，天赋的机制完全被数值淹没。
 */
export const ATTR_WAVE_GRANT_CAP = 3;

export function attrPicksPerWave(wave: number): number {
  // 原实现 `1 + floor((wave-1)/10)` 会在 21 波后给到 3，把额度占满、宝箱补不进来。
  // 现在基础只给 1（前期）/ 2（11 波起），留出 1~2 的余量给宝箱，
  // 让「打精英拿宝箱 → 多一次属性」这条因果仍然成立。
  return wave >= 11 ? 2 : 1;
}

export interface AttrChoice {
  readonly def: AttrDef;
  /** 稀有度档位 0..3（与 TIERS 同序：普通/稀有/史诗/传奇） */
  readonly rarity: number;
  /** 已乘稀有度倍率、并按显示方式取整后的数值 */
  readonly value: number;
  /** 面板文案：`+8` / `+12%` */
  readonly text: string;
  /** 面板显示名（已按职业解析，如法师的「元素伤害」） */
  readonly label: string;
  readonly hint?: string;
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
  // 整数型保底 1，避免「金色 +0 攻击」这种笑话；百分比保留 3 位小数；
  // dec 型（生命回复）保留 1 位小数、保底 0.1 —— 0.6 若不保留小数会被 round 成 1。
  if (def.kind === "int") return Math.max(1, Math.round(raw));
  if (def.kind === "dec") return Math.max(0.1, Math.round(raw * 10) / 10);
  return Math.round(raw * 1000) / 1000;
}

function textOf(def: AttrDef, value: number): string {
  if (def.kind === "int") return `+${value}${def.unit ?? ""}`;
  if (def.kind === "dec") return `+${value.toFixed(1)}${def.unit ?? ""}`;
  return `+${Math.round(value * 1000) / 10}%`;
}

function makeChoice(
  def: AttrDef,
  p: Player,
  prof: Profession = "shooter",
  shooterWeapon: ShooterWeapon = "charged",
): AttrChoice {
  const rarity = pickRarity(p.lvl);
  const value = quantize(def, def.base * RARITY_MUL[rarity]);
  const presentation = prof === "shooter" ? shooterWeapon : prof;
  const hint = def.hints?.[presentation] ?? def.hints?.[prof];
  return {
    def,
    rarity,
    value,
    text: textOf(def, value),
    label: def.labels?.[presentation] ?? def.labels?.[prof] ?? def.label,
    ...(hint ? { hint } : {}),
  };
}

/**
 * 掷出四格候选：每格一个，且**同格内按已到上限过滤**。
 *
 * 某格全被过滤（例如暴击满了而攻势只剩它可选）时，该格改为必出的「攻击」，
 * 保证四格永远有四个可选项——否则会退化成三选一甚至空白面板。
 *
 * `prof` 决定职业专属候选与显示名（法师的「范围」、元素口径命名）；
 * 省略时按射手，保持既有调用与测试的默认行为。
 */
export function rollAttrChoices(
  p: Player,
  prof: Profession = "shooter",
  warriorStyle: WarriorStyle = "katana",
  shooterWeapon: ShooterWeapon = "charged",
): AttrChoice[] {
  const choices = ATTR_GROUPS.map((group) => {
    const pool = ATTR_DEFS.filter(
      (d) =>
        d.group === group.key &&
        (!d.prof || d.prof === prof) &&
        (!d.shooterWeapon || (prof === "shooter" && d.shooterWeapon === shooterWeapon)) &&
        !(d.capped?.(p, prof, warriorStyle) ?? false),
    );
    const usable = pool.length ? pool : ATTR_DEFS.filter((d) => d.stat === "attack");
    const def = usable[Math.floor(Math.random() * usable.length)];
    return makeChoice(def, p, prof, shooterWeapon);
  });
  // v79：四格顺序随机，避免输出类永远在第一张。键盘 1-4 跟随显示顺序。
  for (let i = choices.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [choices[i], choices[j]] = [choices[j], choices[i]];
  }
  return choices;
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

/**
 * 发放属性选择次数（#134 方案 B 的统一入口）。
 *
 * 所有来源（每波基础额度 / 普通宝箱 / 精英宝箱）都必须走这里：
 * - 单波新增合计不超过 `ATTR_WAVE_GRANT_CAP`；
 * - `attrPicks` 仍是累加的，未用完的次数照旧留到下次（既有语义不变）。
 *
 * 之前两处直接 `attrPicks +=`：`startNextWave`（基础）与 `enterRest`（宝箱），
 * 互相不设限，所以单波最多能到 7 次。
 *
 * @returns 实际发放的次数（可能小于请求值，被单波额度截断）
 */
export function grantAttrPicks(this: GameCore, n: number): number {
  if (!Number.isFinite(n) || n <= 0) return 0;
  const room = Math.max(0, ATTR_WAVE_GRANT_CAP - this.attrGrantedThisWave);
  const granted = Math.min(n, room);
  if (granted <= 0) return 0;
  this.attrPicks += granted;
  this.attrGrantedThisWave += granted;
  return granted;
}
export function openAttrPanel(this: GameCore) {
  if (this.bpMode) return;
  this.bpMode = "attr";
  this.attrChoices = rollAttrChoices(this.player, this.prof, this.warriorStyle, this.shooterWeapon);
  this.attrRefreshUsed = false;
  this.view.attr();
}

export function refreshAttr(this: GameCore) {
  this.ensurePlay(); // Issue #34：与天赋刷新一致，先收掉属性覆盖层
  if (this.state !== "play" || this.bpMode !== "attr" || this.attrRefreshUsed)
    return false;
  this.attrChoices = rollAttrChoices(this.player, this.prof, this.warriorStyle, this.shooterWeapon);
  this.attrRefreshUsed = true;
  this.view.attr();
  return true;
}

export function chooseAttr(this: GameCore, index: number) {
  this.ensurePlay();
  if (this.state !== "play" || this.bpMode !== "attr") return false;
  const choice = this.attrChoices[index];
  if (!choice) return false;
  // 动态难度：只把战斗属性计入品质偏离；功能属性不提高难度。
  const qualityWeight = choice.def.group === "utility" ? 0 : 1;
  this.qualityScore +=
    qualityWeight *
    (RARITY_MUL[choice.rarity] - expectedRarity(this.player.lvl));
  // 选「生命」时保持选择前的血量百分比：只加上限会让非满血玩家越选越虚。
  const hpBefore = this.player.hp;
  const maxBefore = this.player.maxhp;
  const hpRatio = maxBefore > 0 ? hpBefore / maxBefore : 1;
  this.attributePicks.push(toAttributePoint(choice));
  if (this.attrPicks > 0) this.attrPicks--;
  this.recompute();
  if (choice.def.stat === "maxHp" && this.player.maxhp > maxBefore) {
    this.player.hp = Math.max(
      1,
      Math.min(
        this.player.maxhp,
        Math.round(this.player.maxhp * hpRatio),
      ),
    );
  }
  if (this.attrPicks > 0) {
    // 还有次数：就地换一组新的，刷新额度重置（每「次选择」各有一次刷新）
    this.attrChoices = rollAttrChoices(this.player, this.prof, this.warriorStyle, this.shooterWeapon);
    this.attrRefreshUsed = false;
  } else {
    this.attrChoices = [];
    this.bpMode = null;
  }
  this.view.attr();
  return true;
}

