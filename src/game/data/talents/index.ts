import { LASER_TALENTS } from "./laser";
import type { Talent } from "../../core/types";
import { LEGACY_UPGRADES } from "./legacy";
import { MAGE_TALENTS } from "./mage";
import { SHOOTER_TALENTS } from "./shooter";
import { WARRIOR_TALENTS } from "./warrior";

/**
 * 天赋数据总入口。
 *
 * 拆分目的：让每张卡表可以被单独 review（旧表 645 行里混着 39 张卡与全部常量，
 * 任何一处改动都很难看清影响了谁）。目录内的分工是：
 *
 * - `common.ts`  公共常量与纯函数（稀有度、权重曲线、分类颜色、无副作用派生）
 * - `legacy.ts`  v40 及以前的通用卡（S2 起整体 `hidden`；v138 移除能量护盾与旧不屈后 39 张）
 * - `shooter.ts` 射手职业池（S2）
 * - `mage.ts`    法师职业池（S3）
 * - `warrior.ts` 战士池（太刀/大剑核心、入场与共享卡）
 *
 * 外部一律从 `data/talents` 导入，不直接引用子文件。
 */
export * from "./common";
export { LEGACY_UPGRADES, DMG_POOL } from "./legacy";
export { SHOOTER_TALENTS } from "./shooter";
export { WARRIOR_TALENTS } from "./warrior";
export {
  MAGE_TALENTS,
  MAGE_ELEMENT_CARDS,
  MAGE_VARIANT_CYCLE,
  MAGE_VARIANT_ELEMENT,
  MAGE_VARIANT_ESCAPE,
  mageElements,
  mageHasElement,
} from "./mage";

/**
 * 全局卡表（旧表在前、各职业池在后）。
 *
 * 顺序有语义：旧表必须在前且保持 v40 的原顺序；v138 删除「能量护盾」与旧「不屈」后，
 * `tests/parity.test.ts` 的 41 张基线已过期，留待授权测试批次处理。
 *
 * S3 起职业池按「射手 → 法师 → 战士」顺序追加：法师池里有 4 张卡与旧表同名
 * （已改名，见 mage.ts 顶部的改名说明），旧表在前保证 `UPGRADES.find(u.n === ...)`
 * 仍命中旧卡——同名会让两套机制共用同一个 upCounts 计数器。
 */
export const UPGRADES: Talent[] = [
  ...LEGACY_UPGRADES,
  ...SHOOTER_TALENTS,
  ...MAGE_TALENTS,
  ...WARRIOR_TALENTS,
  ...LASER_TALENTS,
];
