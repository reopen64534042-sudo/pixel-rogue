/**
 * Combat Foundation v1 试验基准（S1）。
 * 规范：docs/pixel-rogue-combat-foundation-v1.md §3.2 —— armorK=50 与元素
 * 抗性 75% 上限是 v1 试验基准，不是平衡验证后的最终定值；S3 启用真实
 * 数值前须用实际试玩与测试数据复核。
 */
export interface CombatBalance {
  /** 物理护甲系数：减伤系数 = K / (K + max(0, DEF)) */
  armorK: number;
  /** 元素抗性减伤上限（比例） */
  resistanceCap: number;
  /** 通用减伤（韧性 tough）上限，兼容既有「铁布衫」60% */
  toughCap: number;
}
export const COMBAT_BALANCE: CombatBalance = {
  armorK: 50,
  resistanceCap: 0.75,
  toughCap: 0.6,
};
