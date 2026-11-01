import { UPGRADES } from "../data/talents";
import { ETYPES, MONSTER_SKILLS as MS, BULWARK_GUARD, ELITE_DRUMMER_AURA, EYE_SLOW, ELITE_AFFIX_FROM } from "../data/enemies";
import type { Talent } from "../core/types";
import { CODEX_WEAPONS, OTHER_WEAPON_ENTRIES, type CodexWeaponId, type WeaponReferenceKind } from "./weaponCodex";
import { DOMAIN, DOMAIN_UPGRADES, DOMAIN_UNLOCK_LEVELS } from '../data/domain';
import { DOMAIN_VALUE_GAINS } from '../data/attributeBalance';

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
  /** Weapon ownership is independent of talent slot/category and persisted ids. */
  weapon?: CodexWeaponId;
  referenceKind?: WeaponReferenceKind;
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
  /** 天赋分类：按职业池（射手 / 法师 / 战士）。 */
  group?: string;
  /** 职业池归属（shooter / mage / warrior / common）。 */
  prof?: string;
  /** 槽位轴名（核心 / 元素 / 循环 …）。 */
  slot?: string;
  /** 链层级 1/2/3。 */
  layer?: number;
  /** 变体组 id。 */
  variant?: string;
  elite?: boolean;
  boss?: boolean;
  /** Explicit encounter schedule for elite slots; their config is not a normal spawn pool. */
  spawnWave?: number;
  spawnHint?: string;
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
 * v165 旧表已删除，图鉴按**职业池**分（射手 / 法师 / 战士）。
 * 槽位轴不作为分区——分区太多（16 个）会让图鉴的 tab 变成噪音；
 * 槽位改为在条目详情里显示。
 */
const PROF_GROUP: Record<string, string> = {
  shooter: "射手",
  mage: "法师",
  warrior: "战士",
};

function talentWeapon(talent: Talent): CodexWeaponId | undefined {
  if (talent.prof === "shooter") return talent.shooterWeapon ?? "charged";
  if (talent.prof === "mage") return talent.mageWeapon ?? "arcane";
  if (talent.prof === "warrior") return talent.warriorStyle;
  return undefined;
}

function talentSlot(talent: Talent): string | undefined {
  const weapon = talentWeapon(talent);
  return [weapon ? CODEX_WEAPONS[weapon].name : undefined, talent.slot].filter(Boolean).join(" · ") || undefined;
}

export const TALENT_ENTRIES: readonly CodexEntry[] = UPGRADES.filter(
  // v165：旧表与退役卡已从 UPGRADES 删除，图鉴同步不再生成条目。
  // 旧存档里的已解锁键仍由 CodexStore 原样保留，不覆盖、不损坏。
  (u) => !u.hidden && !u.retired,
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
    weapon: talentWeapon(u),
    slot: talentSlot(u),
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
 * 精英条目显式登记：岩石巨兽是 brute 的精英形态，眼魔/祭司有独立基础配置；
 * 三者共用生命 ×5、攻击 ×1.6、移速 ×0.8、半径 ×1.8，且不进入普通刷新池。
 *
 * 数据来源与配置保持一致：基础怪的名称/描述对应 `data/enemies.ts` 的数值与抗性；
 * `spr` 为逻辑贴图名，与绘制层同一套键（精英沿用 `` `${spr}_elite` `` 命名）。
 * 贴图经 `assetRegistry.spriteImageSrc()` 取得，**换贴图时本文件无需改动**。
 */
export const ENEMY_ENTRIES: readonly CodexEntry[] = [
  { id: enemyId("lobber"), cat: "enemy", name: "熔岩投手", spr: "lobber", link: "lobber", status: "live",
    desc: `第${ETYPES.lobber.w0}波解锁。圆形落点预警${MS.lob.windup}秒后造成火焰炮击，爆炸半径${MS.lob.radius}px；留下半径${MS.lob.groundRadius}px、持续${MS.lob.groundLife}秒的火地，每${MS.lob.tick}秒结算。技能冷却${MS.lob.cooldown}秒；保持移动并绕开火地。` },
  { id: enemyId("bulwark"), cat: "enemy", name: "晶甲虫", spr: "bulwark", link: "bulwark", status: "live",
    desc: `第${ETYPES.bulwark.w0}波解锁。正面${Math.round(BULWARK_GUARD.arc*180/Math.PI)}°方向护盾减伤${Math.round((1-BULWARK_GUARD.mul)*100)}%，真实伤害与持续伤害忽略方向护盾；忽略方向护盾不等于忽略护甲。短距突进预警${MS.thrust.windup}秒，冲出${MS.thrust.distance}px，结束后护盾关闭${MS.thrust.guardDown}秒。绕侧或抓住破绽输出。` },
  { id: enemyId("tether"), cat: "enemy", name: "缚电水母", spr: "tether", link: "tether", status: "live",
    desc: `第${ETYPES.tether.w0}波解锁。直线预警${MS.tether.windup}秒后，沿锁定方向持续放电${MS.tether.duration}秒；光束长${MS.tether.length}px、宽${MS.tether.width}px，每${MS.tether.tick}秒检查一次。横移出线可躲避，直接受击或硬控制可打断蓄力与持续放电。` },
  { id: enemyId("shooter_elite"), cat: "enemy", name: "飞行眼魔", spr: "shooter_elite", link: "shooter_elite", elite: true, spawnWave: 12, spawnHint: "非Boss波的第二精英槽；不由普通刷新池抽取", status: "live",
    desc: `第12波起占第二精英槽，Boss波不出现。凝视射线预警${MS.gaze.windup}秒，长${MS.gaze.length}px、宽${MS.gaze.width}px；重力塌缩预警${MS.collapse.windup}秒、半径${MS.collapse.radius}px，两者造成雷电伤害，实际受伤后减速${Math.round(EYE_SLOW.factor*100)}%持续${EYE_SLOW.duration}秒。近身时预警${MS.blink.windup}秒后向外闪烁${MS.blink.distance}px。分裂词缀产生普通射手。` },
  { id: enemyId("drummer_elite"), cat: "enemy", name: "战鼓祭司", spr: "drummer_elite", link: "drummer_elite", elite: true, spawnWave: 21, spawnHint: "非Boss波的第三精英槽；第20波为Boss，首次在第21波出现", status: "live",
    desc: `第21波起占第三精英槽，Boss波不出现。${ELITE_DRUMMER_AURA.radius}px内友军移速+${Math.round((ELITE_DRUMMER_AURA.speedMul-1)*100)}%、伤害+${Math.round((ELITE_DRUMMER_AURA.dmgMul-1)*100)}%，光环同项取最高、不叠加。预警${MS.sonic.windup}秒后释放半径${MS.sonic.radius}px的物理音爆环，经过的友军获得${MS.sonic.rally}秒移速强化。分裂词缀产生普通战鼓手。` },
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
    desc: `近战精英，第4波首次出现。${MS.stomp.range}px内触发${MS.stomp.windup}秒践踏预警，半径${MS.stomp.radius}px内造成物理伤害，实际受伤时击退${MS.stomp.knock}px，冷却${MS.stomp.cooldown}秒。生命×5、攻击×1.6；第${ELITE_AFFIX_FROM}波起携带词缀。`,
    spr: "brute_elite",
    link: "brute",
    elite: true,
    spawnWave: 4,
    spawnHint: "第一精英槽：第4、8波及第12波起的非Boss波",
    status: "live",
  },
];

/** Readable reference entries; do not add weapon references to saved talent progress. */
export const WEAPON_ENTRIES:readonly CodexEntry[]=[
  ...OTHER_WEAPON_ENTRIES,
  {id:'w:domain',cat:'weapon',weapon:'domain',referenceKind:'overview',prof:'mage',name:'坍缩领域',icon:'✦',group:'法师',slot:'领域武器',status:'live',
    desc:`向最近敌人部署领域，落地首跳后每0.25秒持续伤害。三领域合成优先锁定范围内可攻击Boss，0.35秒收拢跟随目标。武器仅在黑洞形成落地的爆发实际命中至少一个目标后+1经验；同次多人仍只计1点，空落、普通领域、后续跳伤或斩击不给经验。Lv.1–4伤害倍率0.80/0.97/1.14/1.31，Lv.5起回原曲线，满级×2.32。Lv.${DOMAIN_UNLOCK_LEVELS.slash}固定连斩、Lv.${DOMAIN_UNLOCK_LEVELS.void}固定无量；Lv.2–3先取得基础升级，满级全拿。人物每级基础伤害+0.4/领域值+0.5，领域值强化+6/+9/+12/+18、上限200。`},
  {id:'w:domain-hole',cat:'weapon',weapon:'domain',referenceKind:'mechanic',prof:'mage',name:'黑洞',icon:'🌀',group:'法师',slot:'领域技能',status:'live',
    desc:'形成时 2DW 引力主爆发（可暴击）+0.4DW 非暴击真伤+min(4%伤前生命,1DW) 非暴击引力生命压缩，再各乘一次领域倍率M；D为人物基础伤害，W为武器伤害倍率，M为领域值除以100。基础持续1秒，每0.2秒造成0.12DWM。黑洞以24px/s缓慢巡游，优先追向240px内较密集的敌群；引力增幅后30px/s。实际伤害/牵引/全域空间斩跟随当前位置，不重复形成爆发，不刷新寿命；无目标停留。4%是领域值100时的基准比例，攻击上限随W成长；生命压缩不受捕获质量、质量聚焦、暴击或全局增伤影响。'},
  {id:'w:domain-value',cat:'weapon',weapon:'domain',referenceKind:'mechanic',prof:'mage',name:'领域值',icon:'🔮',group:'法师',slot:'独立属性',status:'live',
    desc:`基础${DOMAIN.valueBase}，上限${DOMAIN.valueCap}；倍率为领域值÷100，与攻击和全局增伤独立。增强已解锁的领域伤害、牵引、控制及辅助效果，各项只应用一次；不改变范围、施放间隔、持续时间、领域数量或坍缩锁。属性强化按品质增加${DOMAIN_VALUE_GAINS.join(' / ')}；减速、硬控、护盾与回复仍受各自最终上限约束。`},
  ...DOMAIN_UPGRADES.map(u=>({id:`w:domain-${u.id}`,cat:'weapon' as const,weapon:'domain' as const,referenceKind:'upgrade' as const,prof:'mage',name:u.name,icon:'🔮',group:'法师',slot:`领域升级 · Lv.${u.minLevel} 起`,desc:u.desc,status:'live' as const})),
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
