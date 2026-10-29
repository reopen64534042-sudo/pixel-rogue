import { COMBAT_BALANCE } from "../combatBalance";

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

/**
 * 稀有度权重曲线。
 *
 * 当前按 `player.lvl` 分档（S2 之前的行为）。S2 起天赋改由波次节点发放，
 * 这里会改为按波次取档——改动集中在本表与 `pickTier()` 一处。
 */
export const RAMP = [
  { min: 1, w: [70, 25, 5, 0] },
  { min: 5, w: [45, 35, 15, 5] },
  { min: 10, w: [25, 35, 25, 15] },
  { min: 16, w: [10, 30, 35, 25] },
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
