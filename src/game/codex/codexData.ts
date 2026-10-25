import { UPGRADES } from "../data/talents";

/**
 * 图鉴条目模型与静态数据。
 *
 * **id 规则（不得改为下标）**
 * - 天赋：`t:<名字>`。名字是与位置解耦的稳定键，`UPGRADES` 任意重排都不影响历史存档。
 *   实测依据：在索引 5 处插入 1 条新天赋，下标键会错位 36/41 条，名字键 41/41 全命中。
 *   名字键的失效模式是「单条丢失且可修」（改名加 `TALENT_RENAMES` 即可恢复），
 *   下标键的失效模式是「全局静默错位且无法反推」。
 * - 敌人：`e:<ETYPES 键>`；精英用 `e:<spr>_elite`，与绘制层 `` `${spr}_elite` `` 命名一致。
 *
 * **条目由 `UPGRADES` 派生，不手工罗列**：新增天赋自动进入图鉴，
 * 不存在「加了卡忘了加条目」的漏配问题，因此也不需要一致性对照表。
 * 隐藏天赋（`Talent.hidden`）在这一层直接过滤：不生成条目、不显示、不计入分母。
 *
 * 本模块不依赖 DOM / Phaser，可被纯逻辑测试直接引用。
 */
export type CodexCategory = "talent" | "enemy";

export interface CodexEntry {
  id: string;
  cat: CodexCategory;
  name: string;
  desc: string;
  /** 展示图标：天赋复用 `Talent.ico`；敌人 M4 接入后由贴图键派生 */
  icon?: string;
  /** 关联数据键：天赋 = `UPGRADES.n`，敌人 = `ETYPES` 键 */
  link?: string;
  /** 曾用名：改名后旧存档仍能命中同一条目 */
  aliases?: string[];
  /** 天赋稀有度 0-3，复用 `TIERS` */
  tier?: number;
  /** 天赋分类：攻击 / 增幅 / 技能 / 防御 */
  group?: string;
  elite?: boolean;
  status?: "live" | "planned";
}

export const TALENT_ID_PREFIX = "t:";

export function talentId(name: string): string {
  return `${TALENT_ID_PREFIX}${name}`;
}

/**
 * 天赋改名登记表：旧名 → 现名。
 * 只在天赋改名时追加一行，平时保持为空；旧存档读到旧名会被 `resolveEntryId` 映射到现条目。
 */
export const TALENT_RENAMES: Readonly<Record<string, string>> = {};

function aliasesOf(name: string): string[] | undefined {
  const renamed = Object.keys(TALENT_RENAMES).filter(
    (was) => TALENT_RENAMES[was] === name,
  );
  return renamed.length ? renamed : undefined;
}

export const TALENT_ENTRIES: readonly CodexEntry[] = UPGRADES.filter(
  (u) => !u.hidden,
).map(
  (u): CodexEntry => ({
    id: talentId(u.n),
    cat: "talent",
    name: u.n,
    desc: u.d,
    icon: u.ico,
    link: u.n,
    aliases: aliasesOf(u.n),
    tier: u.t,
    group: u.cat,
    status: "live",
  }),
);

/**
 * 敌人条目：M4 接入。
 * 届时由 `ETYPES` 派生基础怪，并**显式**补充精英形态
 * （精英不是独立配置，而是 `spawnEnemy("brute", true)` 的强化标记，无法循环推导）。
 */
export const ENEMY_ENTRIES: readonly CodexEntry[] = [];

export const CODEX_ENTRIES: readonly CodexEntry[] = [
  ...TALENT_ENTRIES,
  ...ENEMY_ENTRIES,
];

const ENTRIES_BY_ID = new Map(CODEX_ENTRIES.map((e) => [e.id, e]));

export function codexEntry(id: string): CodexEntry | undefined {
  return ENTRIES_BY_ID.get(id);
}

/**
 * 存档键 → 当前条目 id。
 * 改名后仍可命中；无法解析（条目已删除或被隐藏）返回 `undefined`，由调用方跳过。
 * `renames` 参数只为测试可注入，生产调用一律使用 `TALENT_RENAMES`。
 */
export function resolveEntryId(
  raw: string,
  renames: Readonly<Record<string, string>> = TALENT_RENAMES,
): string | undefined {
  if (ENTRIES_BY_ID.has(raw)) return raw;
  if (!raw.startsWith(TALENT_ID_PREFIX)) return undefined;
  const current = renames[raw.slice(TALENT_ID_PREFIX.length)];
  if (!current) return undefined;
  const id = talentId(current);
  return ENTRIES_BY_ID.has(id) ? id : undefined;
}

/** 天赋图鉴条目总数（已排除隐藏天赋），用作完成度分母。 */
export const TALENT_TOTAL = TALENT_ENTRIES.length;
