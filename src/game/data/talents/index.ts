import { LASER_TALENTS } from "./laser";
import { MISSILE_TALENTS } from "./missile";
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
 * 顺序有语义：旧表必须在前且保持 v40 的原顺序；v138 删除「能量护盾」与旧「不屈」后，
 * `tests/parity.test.ts` 的 41 张基线已过期，留待授权测试批次处理。
 *
 * S3 起职业池按「射手 → 法师 → 战士」顺序追加；法师池现只保留速咏/连咏、
 * 广域符印、护咒壁、相位/镜像，元素与反应不再经过三选一。旧表在前保证
 * `UPGRADES.find(u.n === ...)` 的稳定命中。
 */
export const UPGRADES: Talent[] = [
  ...LEGACY_UPGRADES,
  ...SHOOTER_TALENTS,
  ...MAGE_TALENTS,
  ...WARRIOR_TALENTS,
  ...LASER_TALENTS,
  ...MISSILE_TALENTS,
];
