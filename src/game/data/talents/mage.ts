import type { Player, Talent } from "../../core/types";
import { MAGE_BALANCE as MB } from "../mageBalance";

/**
 * 法师池（S3）。
 *
 * 设计约束（见 docs/talent-pool-design-rules.md 附录 B）：
 * - **槽位由门控推导**：法师的是「时间门控」——必须熬过前摇与施法间隔，
 *   被打断则施法期零输出。所以槽位是
 *   元素（印记与反应）/ 路线A·路线B（两种打法）/ 节律（缩短前摇与间隔）/
 *   范围（法阵大小）/ 循环（充能条收益）/ 脱离（前摇被打断时的保险）。
 * - **一槽一条轴**：同槽位内的层是递进关系（L1 开通 → L2 放大 → L3 转向）。
 * - **天赋一次性获得**：全部 `max: 1`，不提供伤害数值，伤害来自属性系统与
 *   职业基础形态。因此所有 `f` 都是空操作——机制通过 `upCounts` 在消费点读取。
 * - **L3 必须是「转向」而非「更强」**：双修（同时挂两种元素，触发反应）、
 *   元素残域（落点留下持续领域）、过载（充能满时再触发一次）都改变了打法。
 *
 * ## 改名说明（重要）
 *
 * 设计文档里的「烈焰印记 / 冰霜之力 / 雷霆连锁 / 广域法印」与 v40 旧表
 * **同名**。而 `upCounts`、图鉴 id（`t:<名字>`）、`UPGRADES.find(u.n === ...)`
 * 全部以卡名为键，同名会让两套机制共用同一个计数器（旧卡一旦被熔炉点亮，
 * 就会与法师卡串味）。旧表不能删（parity 逐字段对照与历史存档都要它），
 * 因此法师侧改名，映射登记在 docs/migration.md：
 *
 * | 设计文档名 | 本表卡名 | 旧表同名卡 |
 * |---|---|---|
 * | 烈焰印记 | 炽焰印记 | 烈焰印记（retired） |
 * | 冰霜之力 | 霜寒之力 | 冰霜之力（retired） |
 * | 雷霆连锁 | 闪电连锁 | 雷霆连锁（retired） |
 * | 广域法印 | 广域符印 | 广域法印（retired） |
 *
 * ## 变体组
 *
 * - `mage-element`：火 / 冰 / 雷 三变体（设计文档 §1.8 允许元素破例三变体）。
 *   「双修」持有时**豁免**本组的排他——它必须让玩家同时持有两个元素。
 * - `mage-cycle`：咏唱护壁 / 回响（循环轴 L1 的两种实现）。
 * - `mage-escape`：相位 / 镜像（脱离轴 L1 的两种实现）。
 */

/** 法师元素与卡名的对应表。核心层据此判断玩家「拥有哪些元素」。 */
export const MAGE_ELEMENT_CARDS: readonly {
  card: string;
  element: "fire" | "frost" | "lightning";
}[] = [
  { card: "炽焰印记", element: "fire" },
  { card: "霜寒之力", element: "frost" },
  { card: "闪电连锁", element: "lightning" },
];

/** 变体组 id。放在这里是因为判定逻辑（canOffer）与卡表共用同一份定义。 */
export const MAGE_VARIANT_ELEMENT = "mage-element";
export const MAGE_VARIANT_CYCLE = "mage-cycle";
export const MAGE_VARIANT_ESCAPE = "mage-escape";

/** 玩家当前持有的元素集合（按火→冰→雷的固定顺序，保证行为可预测）。 */
export function mageElements(
  p: Pick<Player, "upCounts">,
): ("fire" | "frost" | "lightning")[] {
  const out: ("fire" | "frost" | "lightning")[] = [];
  for (const { card, element } of MAGE_ELEMENT_CARDS)
    if ((p.upCounts[card] || 0) > 0) out.push(element);
  return out;
}

/** 是否持有某个元素。 */
export function mageHasElement(
  p: Pick<Player, "upCounts">,
  element: "fire" | "frost" | "lightning",
): boolean {
  return MAGE_ELEMENT_CARDS.some(
    (c) => c.element === element && (p.upCounts[c.card] || 0) > 0,
  );
}

/** 持有任意一个元素 L1（用于「元素共振」「双修」「元素残域」的前置判定）。 */
export function hasAnyElement(p: Player): boolean {
  return MAGE_ELEMENT_CARDS.some((c) => (p.upCounts[c.card] || 0) > 0);
}

/** 持有循环轴 L1 的任意一张（咏唱护壁 或 回响）。 */
function hasAnyCycleL1(p: Player): boolean {
  return (
    (p.upCounts["咏唱护壁"] || 0) > 0 || (p.upCounts["回响"] || 0) > 0
  );
}

export const MAGE_TALENTS: Talent[] = [
  // ================= 元素槽：印记与反应 =================
  {
    n: "炽焰印记",
    ico: "🔥",
    t: 0,
    cat: "元素",
    slot: "元素",
    layer: 1,
    prof: "mage",
    variant: MAGE_VARIANT_ELEMENT,
    d: "命中叠「灼烧」，最多 4 层，每层 15% 元素伤害/秒，每层独立持续 5 秒",
    max: 1,
    pv: () =>
      `灼烧 ${MB.burnStackCap} 层 · 每层 ${Math.round(MB.burnDpsPerStack * 100)}%/秒 · 独立 ${MB.burnDuration} 秒`,
    f: () => {},
    cur: () => "命中叠灼烧（每层独立计时）",
  },
  {
    n: "霜寒之力",
    ico: "❄️",
    t: 0,
    cat: "元素",
    slot: "元素",
    layer: 1,
    prof: "mage",
    variant: MAGE_VARIANT_ELEMENT,
    d: "命中叠「凝冰」，最多 3 层，每层减速 6%；对携带凝冰的目标元素伤害 +8%；满 3 层冻结 1 秒，冻结目标受任意伤害 +10%",
    max: 1,
    pv: () =>
      `凝冰 ${MB.frostStackCap} 层 · 每层减速 ${Math.round(MB.frostSlowPerStack * 100)}% · 元素伤害 +${Math.round(MB.frostElementBonus * 100)}%`,
    f: () => {},
    cur: () => "命中叠凝冰（满层冻结）",
  },
  {
    n: "闪电连锁",
    ico: "⚡",
    t: 0,
    cat: "元素",
    slot: "元素",
    layer: 1,
    prof: "mage",
    variant: MAGE_VARIANT_ELEMENT,
    d: "命中施加「麻痹」（攻击间隔 +30%、移速 −10%，3 秒）；30% 概率触发闪电链，最多跳 3 个目标，每个受 40% 元素伤害",
    max: 1,
    pv: () =>
      `闪电链 ${Math.round(MB.chainChance * 100)}% 触发 · 跳 ${MB.chainJumps} 个 · 每个 ${Math.round(MB.chainDamageMul * 100)}% 伤害`,
    f: () => {},
    cur: () => "命中施加麻痹",
  },
  {
    n: "元素共振",
    ico: "🌀",
    t: 0,
    cat: "元素",
    slot: "元素",
    layer: 2,
    prof: "mage",
    req: hasAnyElement,
    reqHint: "需 元素卡",
    d: "印记触发时，60px 内的敌人按元素获得不同强化（火：继承灼烧层数；冰：各 +1 层凝冰；雷：闪电链多跳 1 个）",
    max: 1,
    pv: () => `共振半径 ${MB.resonanceRadius}px`,
    f: () => {},
    cur: () => "印记触发时引发元素共振",
  },

  // ================= 路线A：双修（两种元素 + 反应） =================
  {
    n: "双修",
    ico: "☯️",
    t: 0,
    cat: "路线A",
    slot: "路线A",
    layer: 3,
    prof: "mage",
    req: hasAnyElement,
    reqHint: "需 元素卡",
    excludes: ["星陨", "多重陨星", "元素残域"],
    // 双修的机制就是「同时挂两种元素」，必须能同时持有两个元素 L1，
    // 因此持有本卡时豁免元素变体组的 N 选 1 排他。
    variantBypass: MAGE_VARIANT_ELEMENT,
    d: "每次命中同时施加你持有的两种元素状态，两者相遇触发反应（火+雷 超载 / 火+冰 融化 / 冰+雷 超导）",
    max: 1,
    pv: () => "同时施加两种元素 · 触发三种反应之一",
    f: () => {},
    cur: () => "双元素同时生效",
  },

  // ================= 路线B：陨星路线 =================
  {
    n: "星陨",
    ico: "☄️",
    t: 0,
    cat: "路线B",
    slot: "路线B",
    layer: 1,
    prof: "mage",
    excludes: ["双修"],
    d: "法术改为周期性陨星，自动砸向最密集处，继承你的元素",
    max: 1,
    pv: () => `每 ${MB.meteorInterval} 秒 · 半径 ${MB.meteorRadius}px`,
    f: () => {},
    cur: () => "法术已改为周期性陨星",
  },
  {
    n: "多重陨星",
    ico: "🌠",
    t: 0,
    cat: "路线B",
    slot: "路线B",
    layer: 2,
    prof: "mage",
    requires: "星陨",
    d: "陨星同时落下 2 颗",
    max: 1,
    pv: () => `同时落下 ${MB.meteorCount} 颗`,
    f: () => {},
    cur: () => `陨星 ×${MB.meteorCount}`,
  },
  {
    n: "元素残域",
    ico: "🔥",
    t: 0,
    cat: "路线B",
    slot: "路线B",
    layer: 3,
    prof: "mage",
    requires: "多重陨星",
    // 残域继承施法者的元素；没有元素卡时无从谈起（否则会留下“物理领域”）。
    req: hasAnyElement,
    reqHint: "需 元素卡",
    d: "落点留下元素领域（燃烧 / 霜冻 / 电场），持续造成元素伤害（需持有元素卡）",
    max: 1,
    pv: () =>
      `领域半径 ${MB.domainRadius}px · 持续 ${MB.domainDuration} 秒 · 每秒 ${Math.round(MB.domainDpsMul * 100)}% 伤害`,
    f: () => {},
    cur: () => "落点留下元素领域",
  },

  // ================= 节律槽：缩短前摇与间隔 =================
  {
    n: "速咏",
    ico: "⏩",
    t: 0,
    cat: "节律",
    slot: "节律",
    layer: 1,
    prof: "mage",
    d: "施法前摇 −30%（0.35 → 0.245 秒）",
    max: 1,
    pv: () =>
      `前摇 ${MB.castWindup.toFixed(2)}s → ${(MB.castWindup * MB.quickCastWindupMul).toFixed(3)}s`,
    f: () => {},
    cur: () => "前摇缩短 30%",
  },
  {
    n: "连咏",
    ico: "🎼",
    t: 0,
    cat: "节律",
    slot: "节律",
    layer: 2,
    prof: "mage",
    requires: "速咏",
    d: "施法间隔 −20%（0.20 → 0.16 秒）",
    max: 1,
    pv: () =>
      `间隔 ${MB.castInterval.toFixed(2)}s → ${(MB.castInterval * MB.continuousCastIntervalMul).toFixed(2)}s`,
    f: () => {},
    cur: () => "施法间隔缩短 20%",
  },

  // ================= 范围槽：法阵大小 =================
  {
    n: "广域符印",
    ico: "🌐",
    t: 0,
    cat: "范围",
    slot: "范围",
    layer: 1,
    prof: "mage",
    d: "法阵作用范围 +20%",
    max: 1,
    pv: (p) =>
      `法阵半径 ${Math.round(MB.circleRadius * p.area)}px → ${Math.round(MB.circleRadius * p.area * MB.wideSealAreaMul)}px`,
    f: () => {},
    cur: (p) => `法阵半径 ${Math.round(MB.circleRadius * p.area * MB.wideSealAreaMul)}px`,
  },
  {
    n: "三连聚爆",
    ico: "💥",
    t: 0,
    cat: "范围",
    slot: "范围",
    layer: 2,
    prof: "mage",
    requires: "广域符印",
    d: "每 3 次施法，第 3 发伤害 +15%、法阵半径 +50%",
    max: 1,
    pv: () =>
      `第 3 发 · 伤害 +${Math.round((MB.burstDamageMul - 1) * 100)}% · 半径 +${Math.round((MB.burstRadiusMul - 1) * 100)}%`,
    f: () => {},
    cur: () => "第 3 发聚爆",
  },

  // ================= 循环槽：充能条 =================
  {
    n: "咏唱护壁",
    ico: "🛡",
    t: 0,
    cat: "循环",
    slot: "循环",
    layer: 1,
    prof: "mage",
    variant: MAGE_VARIANT_CYCLE,
    d: "充能满时获得护盾（最大生命 12%，持续 1.2 秒，不可叠层）",
    max: 1,
    pv: () =>
      `护盾 ${Math.round(MB.wardShieldPct * 100)}% 最大生命 · 持续 ${MB.wardShieldDuration} 秒`,
    f: () => {},
    cur: () => "充能满时获得护盾",
  },
  {
    n: "回响",
    ico: "🔔",
    t: 0,
    cat: "循环",
    slot: "循环",
    layer: 1,
    prof: "mage",
    variant: MAGE_VARIANT_CYCLE,
    d: "施法命中后获得少量护盾（最大生命 4%，持续 3 秒）",
    max: 1,
    pv: () =>
      `护盾 ${Math.round(MB.echoShieldPct * 100)}% 最大生命 · 持续 ${MB.echoShieldDuration} 秒`,
    f: () => {},
    cur: () => "施法命中获得护盾",
  },
  {
    n: "元素蓄能",
    ico: "🔋",
    t: 0,
    cat: "循环",
    slot: "循环",
    layer: 2,
    prof: "mage",
    req: hasAnyCycleL1,
    reqHint: "需 循环卡",
    d: "充能满时该次施法伤害 +40%",
    max: 1,
    pv: () => `满充能发伤害 +${Math.round((MB.chargeDamageMul - 1) * 100)}%`,
    f: () => {},
    cur: () => "满充能发增伤",
  },
  {
    n: "过载",
    ico: "⚡",
    t: 0,
    cat: "循环",
    slot: "循环",
    layer: 3,
    prof: "mage",
    requires: "元素蓄能",
    d: "充能满时该次施法立即再触发一次",
    max: 1,
    pv: () => "满充能发额外再触发一次",
    f: () => {},
    cur: () => "满充能发额外再触发",
  },

  // ================= 脱离槽：前摇被打断时的保险 =================
  {
    n: "相位",
    ico: "🌀",
    t: 0,
    cat: "脱离",
    slot: "脱离",
    layer: 1,
    prof: "mage",
    variant: MAGE_VARIANT_ESCAPE,
    d: "受击时传送到 80px 内没有敌人的位置；找不到落点时改为 0.5 秒无敌（10 秒冷却）",
    max: 1,
    pv: () => `传送 ${MB.phaseRange}px · 冷却 ${MB.phaseCooldown} 秒`,
    f: () => {},
    cur: () => "受击时相位传送",
  },
  {
    n: "镜像",
    ico: "👥",
    t: 0,
    cat: "脱离",
    slot: "脱离",
    layer: 1,
    prof: "mage",
    variant: MAGE_VARIANT_ESCAPE,
    d: "受击时留下残影吸引仇恨，自身进入 1 秒虚影（不可受击、无视碰撞、不能施法）（12 秒冷却）",
    max: 1,
    pv: () => `虚影 ${MB.mirrorDuration} 秒 · 冷却 ${MB.mirrorCooldown} 秒`,
    f: () => {},
    cur: () => "受击时留下残影",
  },
];
