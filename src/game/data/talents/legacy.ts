import type { Talent } from "../../core/types";

/**
 * v165：旧表 39 张通用天赋已按用户要求全部删除。
 *
 * 空数组仅作为历史 parity / 熔炉代码的编译锚点保留；旧卡不再进入
 * `UPGRADES`、图鉴、DevPanel 或任何抽取池。已解锁的旧图鉴键仍由
 * `CodexStore` 原样保留，不会覆盖或损坏旧存档。
 */
export const LEGACY_UPGRADES: Talent[] = [];

/** v165：旧版三选一伤害保底池已随旧表一起删除。 */
export const DMG_POOL: string[] = [];
