import { COMBAT_BALANCE } from "../combatBalance";
import type { Talent } from "../../core/types";

/**
 * 天赋池的公共常量与无副作用的派生函数。
 *
 * 这里只放「被多个职业池共享」的内容：稀有度定义、抽取权重曲线、分类颜色，
 * 以及若干被 UI 预览与战斗消费点同时调用的纯函数。
 * 任何一张具体的卡都不应写在本文件里。
 */

/** 击杀狂热叠层上限：随天赋等级提高（Lv1→4 层，Lv2→5 层，Lv3→6 层） */
export function hasteCap(hasteLv: number) {
  return 3 + hasteLv;
}

/** 磐石预览用：护甲对应的物理减伤百分比（K/(K+DEF) 公式与 DamageSystem 一致） */
export function physMitPct(def: number) {
  const k = COMBAT_BALANCE.armorK;
  return Math.round((1 - k / (k + Math.max(0, def))) * 100);
}

export const TIERS = ["普通", "稀有", "史诗", "传奇"];
export const TIER_VAL = [1, 2, 4, 8];
export const TIER_COLOR = ["#e8e8f0", "#4dff88", "#c07bff", "#ffd24a"];

/** 链卡是否真有后续：L1 被同槽 L2 的 req 承接，或 requires 连线。 */
function chainLinked(u: Talent, all: readonly Talent[]): boolean {
  if (!u.layer) return false;
  const group = all.filter(
    (x) =>
      x.slot === u.slot &&
      x.prof === u.prof &&
      x.warriorStyle === u.warriorStyle,
  );
  return (
    !!u.requires ||
    all.some((x) => x.requires === u.n) ||
    (u.layer === 1 &&
      group.some((x) => (x.layer ?? 0) > 1 && !x.requires && !!x.req))
  );
}

/** 只返回需要显示的链层级；L1 不再显式标出。 */
export function chainDisplayLayer(
  u: Talent,
  all: readonly Talent[],
): 2 | 3 | null {
  if ((u.layer !== 2 && u.layer !== 3) || !chainLinked(u, all)) return null;
  return u.layer;
}

/**
 * 卡面视觉稀有度：链 L2=稀有、L3=史诗；无后续的 L1 保持普通。
 * 不改真实 `u.t`（抽取权重仍用原稀有度），只供 UI 框与标签使用。
 */
export function displayTalentTier(
  u: Talent,
  all: readonly Talent[],
): number {
  if (!u.layer) return u.t;
  if (!chainLinked(u, all)) return 0;
  return u.layer - 1;
}

/**
 * 稀有度权重曲线。`min` 是**波次**阈值（S2 起）。
 *
 * v40 按 `player.lvl` 分档，S2 把天赋发放从升级改为「每 4 波节点精英」，
 * 若继续按等级分档，就会形成「等级越高天赋越好」的第二条隐性耦合
 * （而等级已不发放天赋）。改按波次后，天赋品质只与推进深度相关。
 *
 * 档位边界取 1 / 8 / 16 / 24，与「节点精英出现在 4/8/12/16/20/24/28/30 波」
 * 搭配后：前两次天赋（4、8 波）以普通为主，中期开始出史诗，20 波后传奇才常见。
 */
export const RAMP = [
  { min: 1, w: [70, 25, 5, 0] },
  { min: 8, w: [45, 35, 15, 5] },
  { min: 16, w: [25, 35, 25, 15] },
  { min: 24, w: [10, 30, 35, 25] },
];

export const CAT_COLOR: Record<string, string> = {
  攻击: "#ff6b9d",
  增幅: "#4dff88",
  技能: "#57e6ff",
  防御: "#ffd24a",
  // S2 射手六个槽位轴。写死映射是必要的：UI 直接读 CAT_COLOR[cat] /
  // CAT_ICO[cat]，缺键会让卡面显示 "undefined"（已踩过）。
  核心: "#ff6b9d",
  标记: "#c07bff",
  距离: "#57e6ff",
  生存: "#4dff88",
  脱离: "#ff9a3d",
  机动: "#ffd24a",
  // S3 法师七个槽位轴。与射手同名的「脱离」共用一个配色（语义相同：
  // 都是「门控破功时的保险」）。
  元素: "#ff9a3d",
  路线A: "#c07bff",
  路线B: "#ffd24a",
  节律: "#57e6ff",
  范围: "#4dff88",
  循环: "#ff6b9d",
};
export const CAT_ICO: Record<string, string> = {
  攻击: "⚔",
  增幅: "📈",
  技能: "✨",
  防御: "🛡",
  核心: "◎",
  标记: "◈",
  距离: "⟷",
  生存: "◇",
  脱离: "⇄",
  机动: "➤",
  元素: "✹",
  路线A: "☯",
  路线B: "☄",
  节律: "⏩",
  范围: "◉",
  循环: "↻",
};
