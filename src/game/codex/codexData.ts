import { UPGRADES } from "../data/talents";
import { DOMAIN_UPGRADES, DOMAIN_UNLOCK_LEVELS } from '../data/domain';

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
export type CodexCategory = "talent" | "enemy" | 'weapon';

export interface CodexEntry {
  id: string;
  cat: CodexCategory;
  name: string;
  desc: string;
  /** 展示图标：天赋复用 `Talent.ico`；敌人不设 emoji，走贴图 */
  icon?: string;
  /** 逻辑贴图名（敌人用）：经 `assetRegistry.spriteImageSrc()` 取图，换贴图零改动 */
  spr?: string;
  /** 关联数据键：天赋 = `UPGRADES.n`，敌人 = `ETYPES` 键 */
  link?: string;
  /** 曾用名：改名后旧存档仍能命中同一条目 */
  aliases?: string[];
  /** 天赋稀有度 0-3，复用 `TIERS` */
  tier?: number;
  /** 天赋分类：旧表是 攻击 / 增幅 / 技能 / 防御；职业池按职业分（射手 / 法师） */
  group?: string;
  /** 职业池归属（shooter / mage / common）。旧表为空。 */
  prof?: string;
  /** 槽位轴名（核心 / 元素 / 循环 …）。旧表为空。 */
  slot?: string;
  /** 链层级 1/2/3。旧表为空。 */
  layer?: number;
  /** 变体组 id。旧表为空。 */
  variant?: string;
  elite?: boolean;
  boss?: boolean;
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

/**
 * 图鉴分区名（S3）。
 *
 * 旧表按旧四类（攻击/增幅/技能/防御）分；职业池改按**职业**分
 * （设计文档：旧分类是过渡方案，将被「职业轴 × 槽位轴」取代）。
 * 槽位轴不再作为分区——分区太多（16 个）会让图鉴的 tab 变成噪音；
 * 槽位改为在条目详情里显示。
 */
const PROF_GROUP: Record<string, string> = {
  shooter: "射手",
  mage: "法师",
  warrior: "战士",
};

export const TALENT_ENTRIES: readonly CodexEntry[] = UPGRADES.filter(
  // S2：只排除**原版隐藏**（`hidden`，如「不屈」）。
  // `retired` 的旧表**保留在图鉴里**——这是有意的裁决：旧存档里的已解锁记录
  //（`codex.syncTalents` 以卡名为键）必须有条目可落，否则会变成孤儿；
  // 玩家上一局见过的卡突然消失也更像 bug。
  // 代价是收集分母包含 40 张当前拿不到的卡，所以图鉴描述里对 retired 的卡
  // 标注「已退役」（见 `CodexUI` 的 tier 文案），后续若要做「已退役」分区，
  // 在这里加分组而不是重新过滤。
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
    group: (u.prof && PROF_GROUP[u.prof]) || u.cat,
    prof: u.prof,
    slot: u.mageWeapon==='domain' ? '坍缩领域 · '+u.slot : u.shooterWeapon === "laser" ? "激光 · " + u.slot : u.shooterWeapon === "missile" ? "导弹 · " + u.slot : u.slot,
    layer: u.layer,
    variant: u.variant,
    status: "live",
  }),
);

export const ENEMY_ID_PREFIX = "e:";

export function enemyId(key: string): string {
  return `${ENEMY_ID_PREFIX}${key}`;
}

/**
 * 敌人条目。
 *
 * **不能靠遍历 `ETYPES` 生成**：精英不是独立配置，而是 `spawnEnemy("brute", true)`
 * 的强化标记（生命 ×8、伤害 ×1.5、体型 ×1.8），因此精英条目必须显式登记。
 *
 * 数据来源与配置保持一致：基础怪的名称/描述对应 `data/enemies.ts` 的数值与抗性；
 * `spr` 为逻辑贴图名，与绘制层同一套键（精英沿用 `` `${spr}_elite` `` 命名）。
 * 贴图经 `assetRegistry.spriteImageSrc()` 取得，**换贴图时本文件无需改动**。
 */
export const ENEMY_ENTRIES: readonly CodexEntry[] = [
  {
    id: enemyId("boss_three"), cat: "enemy", name: "三首巨兽", spr: "boss_three", link: "boss_three", boss: true,
    desc: "每 10 波出现的首领。70% / 35% 生命切换火焰、冰霜、雷霆首；转阶段短暂无敌。免疫硬控与击退、减速效果减半；冲锋结束后硬直 1 秒，承伤 +15%。冰环贴身可躲，雷击落点锁定施放位置。阶段随从无经验和掉落。必掉 2 普通宝箱、1 血包及 8 倍精英经验。",
    status: "live",
  },
  {
    id: enemyId("slime"),
    cat: "enemy",
    name: "史莱姆",
    desc: "最基础的小怪，行动缓慢、数量最多，靠成群压上来。",
    spr: "slime",
    link: "slime",
    status: "live",
  },
  {
    id: enemyId("bat"),
    cat: "enemy",
    name: "蝙蝠",
    desc: "移动最快的小怪，血量最低，容易贴着边角绕过来。",
    spr: "bat",
    link: "bat",
    status: "live",
  },
  {
    id: enemyId("brute"),
    cat: "enemy",
    name: "岩石兽",
    desc: "皮糙肉厚的近战怪，带物理护甲；元素与真实伤害可以绕开护甲。",
    spr: "brute",
    link: "brute",
    status: "live",
  },
  {
    id: enemyId("shooter"),
    cat: "enemy",
    name: "射手",
    desc: "保持距离射击的远程怪，雷电抗性高，连锁闪电对它效率偏低。",
    spr: "shooter",
    link: "shooter",
    status: "live",
  },
  {
    id: enemyId("bomber"),
    cat: "enemy",
    name: "火囊虫",
    desc: "高速逼近后自爆的虫子，火焰抗性高；自毁时不产生掉落。",
    spr: "bomber",
    link: "bomber",
    status: "live",
  },
  {
    id: enemyId("splitter"),
    cat: "enemy",
    name: "裂胶史莱姆",
    desc: "死亡时裂成两只小史莱姆；子体不再分裂、也不掉落经验。用穿透或范围伤害一次清干净。",
    spr: "splitter",
    link: "splitter",
    status: "live",
  },
  {
    id: enemyId("splitling"),
    cat: "enemy",
    name: "小史莱姆",
    desc: "裂胶史莱姆死亡后裂出的子体：体型更小、生命更低，不再分裂，也不掉落经验；只由母体生成，不进入随机刷新池。",
    spr: "splitling",
    link: "splitling",
    status: "live",
  },
  {
    id: enemyId("charger"),
    cat: "enemy",
    name: "角兽",
    desc: "先亮起红色冲锋线，再沿直线高速撞过来；撞墙后会硬直 1.2 秒，是反打窗口。",
    spr: "charger",
    link: "charger",
    status: "live",
  },
  {
    id: enemyId("drummer"),
    cat: "enemy",
    name: "战鼓手",
    desc: "躲在怪群中后敲鼓：120px 内的敌人 +30% 移速、+15% 伤害。本体很脆，优先处理它能明显降低整群压力。",
    spr: "drummer",
    link: "drummer",
    status: "live",
  },
  {
    id: enemyId("spinner"),
    cat: "enemy",
    name: "织网蛛",
    desc: "保持中距离，在玩家脚下吐网；落点先亮金色预警，随后形成减速 40% 的蛛网，持续约 2.8 秒。",
    spr: "spinner",
    link: "spinner",
    status: "live",
  },
  {
    id: enemyId("burrower"),
    cat: "enemy",
    name: "掘地虫",
    desc: "钻入地下快速接近玩家，再在地面亮起收缩黄圈后钻出；钻地期间不会被自动索敌。",
    spr: "burrower",
    link: "burrower",
    status: "live",
  },
  {
    id: enemyId("brute_elite"),
    cat: "enemy",
    name: "岩石巨兽",
    desc: "精英形态：生命 ×5、攻击 ×1.6、移速 ×0.8、体型 ×1.8；第 8 波起随机携带「分裂 / 召唤蝙蝠 / 冰霜新星」词缀。普通宝箱（品质祝福）50% 概率掉落，血包与经验仍必掉。",
    spr: "brute_elite",
    link: "brute",
    elite: true,
    status: "live",
  },
];

/** Readable reference entries; do not add weapon references to saved talent progress. */
export const WEAPON_ENTRIES:readonly CodexEntry[]=[
  {id:'w:domain',cat:'weapon',name:'坍缩领域',icon:'✦',group:'法师',slot:'领域武器',status:'live',
    desc:`向最近敌人部署领域，落地首跳后每0.25秒持续伤害。三领域合成优先锁定范围内可攻击Boss，0.35秒收拢跟随目标。武器仅在黑洞形成落地的爆发实际命中至少一个目标后+1经验；同次多人仍只计1点，空落、普通领域、后续跳伤或斩击不给经验。Lv.1–4伤害倍率0.80/0.97/1.14/1.31，Lv.5起回原曲线，满级×2.32。Lv.${DOMAIN_UNLOCK_LEVELS.slash}固定连斩、Lv.${DOMAIN_UNLOCK_LEVELS.void}固定无量；Lv.2–3先取得基础升级，满级全拿。人物每级基础伤害+0.4/领域值+0.5，领域值强化+6/+9/+12/+18、上限200。`},
  {id:'w:domain-hole',cat:'weapon',name:'黑洞',icon:'🌀',group:'法师',slot:'领域技能',status:'live',
    desc:'形成时 2DW 引力主爆发（可暴击）+0.4DW 非暴击真伤+min(4%伤前生命,1DW) 非暴击引力生命压缩，再各乘一次领域倍率M；W为武器等级倍率。基础持续1秒，每0.2秒造成0.12DWM。黑洞以24px/s缓慢巡游，优先追向240px内较密集的敌群；引力增幅后30px/s。实际伤害/牵引/全域空间斩跟随当前位置，不重复形成爆发，不刷新寿命；无目标停留。生命压缩比例保持4%，仅攻击上限随W成长，不吃B/F/暴击或全局增伤。'},
  ...DOMAIN_UPGRADES.map(u=>({id:`w:domain-${u.id}`,cat:'weapon' as const,name:u.name,icon:'🔮',group:'法师',slot:`领域升级 · Lv.${u.minLevel} 起`,desc:u.desc,status:'live' as const})),
];
export const CODEX_ENTRIES: readonly CodexEntry[] = [
  ...TALENT_ENTRIES,
  ...ENEMY_ENTRIES,
  ...WEAPON_ENTRIES,
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

/** 敌人图鉴条目总数，用作完成度分母。 */
export const ENEMY_TOTAL = ENEMY_ENTRIES.length;
