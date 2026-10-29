import type { Talent } from "../../core/types";
import { LEGACY_UPGRADES } from "./legacy";
import { SHOOTER_TALENTS } from "./shooter";

/**
 * 天赋数据总入口。
 *
 * 拆分目的：让每张卡表可以被单独 review（旧表 645 行里混着 41 张卡与全部常量，
 * 任何一处改动都很难看清影响了谁）。目录内的分工是：
 *
 * - `common.ts`  公共常量与纯函数（稀有度、权重曲线、分类颜色、无副作用派生）
 * - `legacy.ts`  v40 及以前的 41 张通用卡（S2 起整体 `hidden`，保留实现）
 * - `shooter.ts` 射手职业池（S2）
 * - `mage.ts` / `warrior.ts` 法师与战士池（S3）
 *
 * 外部一律从 `data/talents` 导入，不直接引用子文件。
 */
export * from "./common";
export { LEGACY_UPGRADES, DMG_POOL } from "./legacy";
export { SHOOTER_TALENTS } from "./shooter";

/**
 * 全局卡表（旧表在前、各职业池在后）。
 *
 * 顺序有语义：`tests/parity.test.ts` 用它重排 v8 卡池并逐项对照，
 * 旧表必须在前且保持 v40 的原顺序（41 张逐字段对照的基线）。
 */
export const UPGRADES: Talent[] = [...LEGACY_UPGRADES, ...SHOOTER_TALENTS];
