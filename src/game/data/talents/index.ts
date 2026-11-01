import { LASER_TALENTS } from "./laser";
import { MISSILE_TALENTS } from "./missile";
import { DOMAIN_TALENTS } from "./domain";
import type { Talent } from "../../core/types";
import { MAGE_TALENTS } from "./mage";
import { SHOOTER_TALENTS } from "./shooter";
import { WARRIOR_TALENTS } from "./warrior";

/**
 * 天赋数据总入口。
 *
 * 拆分目的：让每张卡表可以被单独 review。目录内的分工是：
 *
 * - `common.ts`  公共常量与纯函数（稀有度、权重曲线、分类颜色、无副作用派生）
 * - `legacy.ts`  v165 已删除旧表全部卡牌，仅保留空导出供历史 parity / 熔炉代码编译
 * - `shooter.ts` 射手职业池（S2）
 * - `mage.ts`    法师保留卡（元素/反应/法杖成长已迁到 elementalMage + MageProgressionSystem）
 * - `warrior.ts` 战士池（太刀/大剑核心、入场与共享卡）
 *
 * 外部一律从 `data/talents` 导入，不直接引用子文件。
 */
export * from "./common";
export { LEGACY_UPGRADES, DMG_POOL } from "./legacy";
export { SHOOTER_TALENTS } from "./shooter";
export { WARRIOR_TALENTS } from "./warrior";
export { MAGE_TALENTS, MAGE_VARIANT_ESCAPE } from "./mage";

/**
 * 全局卡表（旧表在前、各职业池在后）。
 *
 * v165 起旧表不再进入全局卡表；顺序按「射手 → 法师 → 战士 → 激光 → 导弹」。
 * 旧表基线与退役卡断言已过期，留待授权测试批次处理。
 */
export const UPGRADES: Talent[] = [
  ...SHOOTER_TALENTS,
  ...MAGE_TALENTS,
  ...WARRIOR_TALENTS,
  ...LASER_TALENTS,
  ...MISSILE_TALENTS,
  ...DOMAIN_TALENTS,
];
