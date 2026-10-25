import { readFileSync } from "node:fs";
import { createContext, runInContext } from "node:vm";
import { it, expect, vi, afterEach } from "vitest";
import { fresh, seeded, learn, enemy } from "./helpers";
import { UPGRADES } from "../src/game/data/talents";
import { ETYPES } from "../src/game/data/enemies";
import type { EnemyConfig } from "../src/game/core/types";
import {
  ELITE_BOX_GAIN,
  ELITE_XP_STEP,
  POTION_GROW_CAP,
} from "../src/game/data/constants";
afterEach(() => vi.restoreAllMocks());
/**
 * 基线更新依据：Issue #1（用户已批准的平衡变更）。
 * 击杀狂热的叠层上限改为 3 + hasteLv（Lv1=4 / Lv2=5 / Lv3=6），不再固定 3 层。
 * 该天赋因此不参与「与 v8 逐字段相等」的战斗对照（攻速分叉会必然扩散到所有弹道字段），
 * 改由本文件末尾的显式公式断言做回归保护。
 *
 * 基线更新依据：Issue #25（用户已批准的平衡变更）。
 * 强化弹丸从「全局伤害 +25%（99 层）」改为「仅魔弹伤害 +25%（30 层）」，
 * 解决普通卡单级/总潜力双双碾压稀有卡的稀有度倒挂；同样不参与 v8 对照，
 * 由 D-02 显式公式断言保护。
 *
 * 基线更新依据：Issue #47 / #48（用户已批准的平衡变更）。
 * 15 波起难度超线性增长、12 波起每波多 BOSS、BOSS 特殊宝箱——
 * 16 波的逐帧对照因此偏离 v8，该波次从全模拟对照中移除，
 * 由 D-03（难度公式）/ D-04（精英配额与特殊宝箱）显式断言保护。其余波次仍全部参与严格对照。
 *
 * 基线更新依据：Issue #36（用户已批准的手感变更）。
 * 多弹道散布改为动态（孤立目标收拢 0.04 / 密集目标 0.16），
 * 分裂射击不参与 v8 对照，由 D-05 显式断言保护。
 * 任何其他天赋出现与 v8 的差异都按 bug 处理。
 */
const BASELINE_EXCLUDED = [
  "击杀狂热",
  "强化弹丸",
  "分裂射击",
  "冰霜之力",
  "吸血獠牙",
  "致命一击",
  "烈焰印记",
] as const;
// Issue #55 批次新增的天赋（v8 无对应条目）：灼热易伤/烈焰蔓延/天眼制导/焦土燃烧
// v8 原版无 boltDmgMul 字段：对照前向原版 player 注入默认值 1，仅对齐结构，值语义不变。
const NOT_IN_V8 = [
  "灼热易伤",
  "烈焰蔓延",
  "天眼制导",
  "焦土燃烧",
  "魔刃回旋",
  // 基线更新依据：Combat Foundation S3-B 方案甲（用户已批准）。
  // 磐石/元素亲和是 v8 没有的新卡（玩家护甲 / 火雷增伤乘区），
  // 不参与 v8 逐字段对照与全天赋学习，由文件末尾 D-08 显式断言保护。
  "磐石",
  "元素亲和",
] as const;
const parityTalents = UPGRADES.filter(
  (u) =>
    !BASELINE_EXCLUDED.includes(u.n as (typeof BASELINE_EXCLUDED)[number]) &&
    !NOT_IN_V8.includes(u.n as (typeof NOT_IN_V8)[number]),
);
/**
 * 基线更新依据：Combat Foundation S4-C C1（Issue #32）权威来源迁移。
 * 铁布衫/会心深渊的属性贡献（tough +0.1/级、critMul +0.5/级）改由
 * core/TalentStatSources.ts 来源表声明，Talent.f 不再写入字段——
 * 「every talent effect」的裸 f 对照对本清单改走真实学习路径
 * learnTalent（f → 记录 → 权威投影），并把学习记录字段归一化后
 * 与 v8 f 结果逐字段比较；语义漂移仍由该对照与 S4-C 聚焦测试咬住。
 * 致命一击已在 BASELINE_EXCLUDED、磐石/元素亲和已在 NOT_IN_V8，
 * 全天赋模拟场景（parityTalents）继续包含铁布衫/会心深渊。
 *
 * 基线更新依据：Combat Foundation S4-C C2-A（本批）权威来源迁移。
 * 磨刃/狂怒/毁灭本能的 damage 逐次乘算（×1.1/×1.2/×1.3）同样改由来源表
 * 以 attack final 修饰符声明，Talent.f 不再写入——加入本清单走
 * learnTalent 路径对照；学习顺序 = picks 顺序与旧 f 重放一致，
 * 逐位数值由 S4-C C2-A 聚焦测试的旧实现基准对照咬住。
 */
const S4C_AUTHORITY_MIGRATED = [
  "铁布衫",
  "会心深渊",
  "磨刃",
  "狂怒",
  "毁灭本能",
] as const;
/**
 * 基线更新依据：Issue #13（用户已批准的近战基础设施建设）。
 * DamageSource 新增 "melee" 分项，而 v8 快照没有该键。对照时把它从两侧摘出单独断言，
 * 其余分项与其余字段仍逐字段严格相等 —— 保留回归能力：
 * 任何原有分项出现偏差，或近战伤害意外渗入，本对照都会失败。
 */
function takeMelee(snapshot: unknown) {
  const snap = snapshot as { dmgBy: Record<string, number> } & Record<
    string,
    unknown
  >;
  const { melee, ...rest } = snap.dmgBy;
  return { rest: { ...snap, dmgBy: rest }, melee };
}
/**
 * 基线更新依据：Issue #12（用户已批准的血包转化机制）。
 * 满血拾取血包会永久提升 maxhp（每波上限 10 点），v8 无此机制，
 * 因此把 hp/maxhp 从玩家对比中摘出单独断言：增长量落在 [0, POTION_GROW_CAP]，
 * 且当前血与上限同步增长；其余玩家属性与其余所有字段仍与 v8 逐字段严格相等。
 * 保留回归能力：任何非 hp/maxhp 字段的偏差，或增长量越界、不同步，都会失败。
 */
function splitPlayerHealth(snapshot: unknown) {
  const snap = snapshot as { player: Record<string, number> } & Record<
    string,
    unknown
  >;
  const { hp, maxhp, ...rest } = snap.player;
  return { rest: { ...snap, player: rest }, hp, maxhp };
}
/**
 * 基线更新依据：Issue #17（用户已批准的平衡变更）。
 * 精英经验由固定 25 改为 25 + (波次-1) × ELITE_XP_STEP，v8 无此规则。
 * 因此先断言每个精英宝石的经验符合新公式，再把该字段归一化后参与逐字段比较；
 * 普通宝石经验、掉落数量、位置仍与 v8 严格相等。
 */
function expectEliteXp(snapshot: unknown, wave: number) {
  const snap = snapshot as { gems: { e?: boolean; v: number }[] };
  const eliteXp = 25 + (wave - 1) * ELITE_XP_STEP;
  for (const g of snap.gems) if (g.e) expect(g.v).toBe(eliteXp);
}
function flattenEliteXp(snapshot: unknown) {
  const snap = snapshot as { gems: { e?: boolean; v: number }[] };
  for (const g of snap.gems) if (g.e) g.v = 0;
  return snapshot;
}
/**
 * 基线更新依据：Combat Foundation S2 · PR #2 评审 P2-3。
 * 敌方弹丸在发射时携带攻击者快照（stats），v8 无此字段。对照前把该字段
 * 从当前实现摘出，并显式断言 S2 不变量：所有发射时快照的增伤/护甲/抗性/
 * 韧性全为默认零值、attack 与弹丸伤害快照同源——即该字段在 S2 不改变
 * 任何数值（S3 引入精英增伤等非零来源时须同步更新本断言）。
 * 弹速/伤害/位置/寿命等其余字段仍与 v8 逐字段严格相等。
 */
function takeEbulletStats(snapshot: unknown) {
  const snap = snapshot as { ebullets?: { dmg: number; stats?: unknown }[] };
  const pairs: { dmg: number; stats: unknown }[] = [];
  for (const b of snap.ebullets ?? []) {
    pairs.push({ dmg: b.dmg, stats: b.stats });
    delete b.stats;
  }
  return { rest: snapshot, pairs };
}
/**
 * 逐字段对照，同时按三条已批准的基线规则做显式断言：
 * - Issue #13：dmgBy.melee 是新增分项，v8 无此键，当前实现必须恒为 0；
 * - Issue #12：hp/maxhp 的增量必须在 [0, POTION_GROW_CAP] 内且同步增长；
 * - Issue #17：精英宝石经验 = 25 + (波次-1) × ELITE_XP_STEP。
 * 其余全部字段（含其余伤害分项、普通宝石经验）仍与 v8 严格相等。
 */
function expectParity(actual: unknown, expected: unknown, wave: number) {
  const a0 = splitPlayerHealth(JSON.parse(JSON.stringify(actual)));
  const e0 = splitPlayerHealth(JSON.parse(JSON.stringify(expected)));
  const grow = a0.maxhp - e0.maxhp;
  expect(grow).toBeGreaterThanOrEqual(0);
  expect(grow).toBeLessThanOrEqual(POTION_GROW_CAP);
  expect(a0.hp - e0.hp).toBe(grow);

  // Issue #17：先断言精英经验符合新公式，再把该字段归一化后参与逐字段比较
  expectEliteXp(a0.rest, wave);
  flattenEliteXp(a0.rest);
  flattenEliteXp(e0.rest);

  const a = takeMelee(a0.rest);
  const e = takeMelee(e0.rest);
  expect(e.melee).toBeUndefined();
  expect(a.melee).toBe(0);

  // Combat Foundation S2：弹丸发射时快照摘出 + S2 零值断言（见上方依据）
  const aEb = takeEbulletStats(a.rest);
  const eEb = takeEbulletStats(e.rest);
  expect(eEb.pairs.every(({ stats }) => stats === undefined)).toBe(true);
  for (const { dmg, stats } of aEb.pairs) {
    const st = stats as {
      attack: number;
      defense: number;
      critChance: number;
      tough: number;
      resistances: Record<string, number>;
      globalDamageBonus: number;
      typeDamageBonus: Record<string, number>;
      formDamageBonus: Record<string, number>;
    };
    expect(st.defense).toBe(0);
    expect(st.critChance).toBe(0);
    expect(st.tough).toBe(0);
    expect(st.resistances).toEqual({});
    expect(st.globalDamageBonus).toBe(0);
    expect(st.typeDamageBonus).toEqual({});
    expect(st.formDamageBonus).toEqual({});
    expect(st.attack).toBe(dmg);
  }

  // Combat Foundation S3-B：玩家弹丸发射时快照摘出（v8 无此字段）。
  // 对照场景不含磐石/元素亲和（NOT_IN_V8），断言攻击相关乘区保持中性；
  // attack 与发射时伤害同源，穿透/弹射的 0.85 衰减只作用于 dmg。
  const aB = takeBulletStats(aEb.rest);
  const eB = takeBulletStats(eEb.rest);
  expect(eB.pairs.every(({ stats }) => stats === undefined)).toBe(true);
  for (const { dmg, stats } of aB.pairs) {
    const st = stats as {
      attack: number;
      resistances: Record<string, number>;
      globalDamageBonus: number;
      typeDamageBonus: Record<string, number>;
      formDamageBonus: Record<string, number>;
    };
    expect(st.resistances).toEqual({});
    expect(st.globalDamageBonus).toBe(0);
    expect(st.typeDamageBonus).toEqual({});
    expect(st.formDamageBonus).toEqual({});
    expect(st.attack).toBeGreaterThanOrEqual(dmg);
    expect(st.attack).toBeGreaterThan(0);
  }
  expect(aB.rest).toEqual(eB.rest);
}
/**
 * 基线更新依据：Combat Foundation S3-B（玩家弹丸发射时快照，定稿接口）。
 * Bullet 新增 stats 键，v8 无此字段；对照前摘出并断言中性不变量（见 expectParity）。
 */
function takeBulletStats(snapshot: unknown) {
  const snap = snapshot as { bullets?: { dmg: number; stats?: unknown }[] };
  const pairs: { dmg: number; stats: unknown }[] = [];
  for (const b of snap.bullets ?? []) {
    pairs.push({ dmg: b.dmg, stats: b.stats });
    delete b.stats;
  }
  return { rest: snapshot, pairs };
}
/** Run actual preserved source, never a rewritten expectation of the same algorithm. */
function original() {
  const node = {
    classList: { add() {}, remove() {} },
    style: {},
    getContext: () => ({ fillRect() {} }),
  };
  const math = Object.create(Math) as Math;
  math.random = seeded();
  const context = createContext({
    Math: math,
    document: {
      getElementById: () => node,
      createElement: () => ({ ...node }),
    },
    window: {},
    innerWidth: 960,
    innerHeight: 540,
    addEventListener() {},
    requestAnimationFrame() {},
    performance: { now: () => 0 },
    setTimeout() {},
  });
  // 换行归一化为 LF（上游 PR #76 评审 P1）：git blob 为 LF，但 Windows 的
  // autocrlf 检出会把工作区转成 CRLF——含 \r\n 的补丁模式只在 Windows 命中，
  // LF 检出（Linux/CI）下静默失配。读取后统一 LF，补丁模式全部用 LF，
  // 检出环境不再影响行为（已用 core.autocrlf=false 的独立检出双向验证）。
  const html = readFileSync("legacy/upstream-v8.html", "utf8").replace(
    /\r\n/g,
    "\n",
  );
  // 字符串补丁必须命中原版原文——失配即抛错（Issue #5 排障定论）：
  // 烈焰印记补丁曾因空格风格与 v8 紧凑风格不符而静默失效（String.replace
  // 无匹配时原样返回），烈焰印记滞留 t2，档位池 t1/t2 组成长期不对称，
  // 直到波 8 种子 908 在 t=878 升级抽卡踩中档内索引交叉点才显形。
  // 另：Issue #48 的「精英宝箱 special 标记」补丁已删除——upstream-v8
  // 快照（27565b4）根本没有宝箱代码，该补丁从未命中过任何文本，属死补丁。
  const patches: [RegExp | string, string][] = [
    // 基线随 Issue #37 更名对齐：急速施法 → 疾速扳机（否则按名查找落空）
    [/急速施法/g, "疾速扳机"],
    // 基线随 Issue #42 对齐：烈焰印记稀有度迁移（t2→1、max3→1，卡池组成保持一致）。
    // v8 原文为紧凑风格（冒号后无空格），模式串逐字对照 legacy/upstream-v8.html。
    [
      "n:'烈焰印记', ico:'♨️', t:2, cat:'技能', d:'命中点燃敌人，持续灼烧', max:3,",
      "n:'烈焰印记', ico:'♨️', t:1, cat:'技能', d:'命中叠加灼烧，最多 4 层，每层 10% 伤害/秒', max:1,",
    ],
    // 基线随 Issue #38-#45 批次补齐敌人新字段（结构对齐，值语义不变）
    [
      "burnDps:0,",
      "burnDps:0,burnStacks:0,frostStacks:0,frozenT:0,frostImmuneT:0,",
    ],
    // 基线随 Issue #45 对齐：陨星伤害 ×3（用户已批准的平衡变更）
    ["p.damage * 2 + p.meteor * 5", "p.damage * 3 + p.meteor * 8"],
    // 基线随 Issue #67 对齐：升级/宝箱延迟到休整统一执行
    // （移除立即开面板/collect 门/enterRest 级联；enterRest 为多行 LF 模式，
    // 依赖上方读取时的换行归一化，不得写 \r\n——见本函数开头说明）
    ["if (pendingLevels > 0) openLevelPanel();", ""],
    ["gems.length === 0 && pendingLevels === 0", "gems.length === 0"],
    [
      "function enterRest() {\n  wavePhase = 'rest';\n  swapUsedThisRest = false;\n  showRestBar();\n}",
      "function enterRest() {\n  wavePhase = 'rest';\n  swapUsedThisRest = false;\n  if (pendingLevels > 0) { bpMode = null; openLevelPanel(); return; }\n  if (boxPicks > 0) { bpMode = null; openBoxPanel(); return; }\n  showRestBar();\n}",
    ],
    // 基线随 Issue #17 对齐：精英经验 = 25 + (波次-1) × ELITE_XP_STEP（用户已批准）。
    // 此前两侧精英宝石经验不同（我们 53、v8 25），吸收后玩家等级分叉 → 升级抽卡
    // 权重不同 → 抽取结果分叉（PR #4 评审 P2 排障：tick 879 抽卡实测）——
    // 38 卡时代靠种子未显形，新卡改变档位池长度后级联成可见状态差。
    // 对齐公式后两侧经验/等级/权重对称；expectEliteXp 断言与归一化保持不变。
    [
      "gems.push({ x:e.x, y:e.y, vx:0, vy:0, v:25, e:true });",
      "gems.push({ x:e.x, y:e.y, vx:0, vy:0, v:25+(waveN-1)*ELITE_XP_STEP, e:true });",
    ],
    ["const ETYPES = {", "const ELITE_XP_STEP = 4; const ETYPES = {"],
  ];
  let script = html.match(/<script>([\s\S]*?)<\/script>/)![1];
  for (const [from, to] of patches) {
    const hit =
      typeof from === "string"
        ? script.includes(from)
        : script.search(from) >= 0;
    if (!hit)
      throw new Error(
        `基线补丁失配（原版无此片段）: ${String(from).slice(0, 60)}`,
      );
    script = script.replace(from, to);
  }
  runInContext(script, context);
  // Issue #55 批次：canOffer 对齐 hidden 语义（不屈移出基线卡池）
  runInContext(
    "canOffer = ((orig) => (u) => !u.hidden && orig(u))(canOffer);",
    context,
  );
  // 基线随 Issue #38-#45 批次补齐玩家新字段（结构对齐，值语义不变）
  runInContext(
    "const _rg = resetGame; resetGame = function () { _rg(); Object.assign(player, { boltDmgMul: 1, frostLv: 0, scorchVuln: 0, burnSpread: 0, meteorGuided: 0, burnGround: 0, bladeReflect: 0 }); Object.assign(dmgBy, { shock: 0, reflect: 0 }); };",
    context,
  );
  // 基线随 Issue #55 批次注入 4 张新卡桩（卡池组成对齐；__stub 标记，行为对照跳过）
  runInContext(
    'UPGRADES.push({ n: "灼热易伤", ico: "🌡️", t: 2, cat: "技能", d: "", max: 2, mech: 1, req: (p) => (p.upCounts["烈焰印记"] || 0) > 0, pv: () => "", f: () => {}, cur: () => "", __stub: 1 }, { n: "烈焰蔓延", ico: "🌋", t: 3, cat: "技能", d: "", max: 2, mech: 1, req: (p) => (p.upCounts["灼热易伤"] || 0) > 0, pv: () => "", f: () => {}, cur: () => "", __stub: 1 }, { n: "天眼制导", ico: "👁️", t: 2, cat: "技能", d: "", max: 1, mech: 1, req: (p) => (p.upCounts["天眼制导"] || 0) > 0, pv: () => "", f: () => {}, cur: () => "", __stub: 1 }, { n: "焦土燃烧", ico: "🏜️", t: 3, cat: "技能", d: "", max: 1, mech: 1, req: (p) => (p.upCounts["天眼制导"] || 0) > 0, pv: () => "", f: () => {}, cur: () => "", __stub: 1 }, { n: "魔刃回旋", ico: "🪞", t: 1, cat: "防御", d: "", max: 1, mech: 1, req: (p) => (p.upCounts["守护之刃"] || 0) > 0, pv: () => "", f: () => {}, cur: () => "", __stub: 1 });',
    context,
  );
  // 基线随 S3-B 方案甲注入 2 张新卡桩，并**按我们 UPGRADES 的顺序整体重排**
  // v8 的卡池（PR #4 评审 P2 排障定论）：
  // 1) 桩必须无 req、展示字段与真卡一致、f 空操作——req 恒假会把桩排除出
  //    v8 卡池，升级抽卡池 38≠40 不对称，伤害保底触发时机改变随机消耗数，
  //    整条随机流分叉（波 8 于 t≈18s 刷怪类型抽取处级联分叉）。
  // 2) 仅同位追加仍不够：#55 四张桩在 v8 尾部、我们同名真卡在数组中部，
  //    档位池顺序本就不一致（38 张时代种子未踩中的既有隐患）；新卡把
  //    档位池长度 N→N+1 后索引平移踩中错位（tick 879 升级抽卡实测）。
  //    因此以我方数组为基准重排 v8 UPGRADES，两侧卡池在数量、顺序、
  //    可序列化内容上逐位镜像；桩 f 不写字段，v8 模拟中无人学习它。
  runInContext(
    'UPGRADES.push({ n: "磐石", ico: "🪨", t: 1, cat: "防御", d: "护甲 +15/级（物理减伤，与通用减伤乘算）", max: 3, mech: 1, pv: () => "", f: () => {}, cur: () => "", __stub: 1 }, { n: "元素亲和", ico: "🔮", t: 2, cat: "技能", d: "火焰与雷电伤害 +10%/级", max: 3, pv: () => "", f: () => {}, cur: () => "", __stub: 1 });',
    context,
  );
  // 不屈在我方自 v11 起暂隐藏（hidden），v8 原文没有该字段——canOffer 补丁
  // 的 !u.hidden 拦不住它，v8 卡池因此 35≠34 多出一张（#55 时代的既有隐患，
  // 新卡改变档位池长度后索引平移踩中，tick 879 实测）。此处同步补 hidden。
  runInContext('UPGRADES.find(u=>u.n==="不屈").hidden = 1;', context);
  runInContext(
    `const _order = ${JSON.stringify(UPGRADES.map((u) => u.n))};
     const _byName = new Map(UPGRADES.map((u) => [u.n, u]));
     UPGRADES.length = 0;
     for (const _n of _order) UPGRADES.push(_byName.get(_n));`,
    context,
  );
  runInContext(
    "muted=true;state='play';drawCards=()=>{};showRestBar=()=>{bpMode='rest';};",
    context,
  );
  return context;
}
it("every talent effect, cap and tier matches the protected original", () => {
  const baseline = original();
  for (const u of UPGRADES) {
    // 基线已按 Issue 更新/新增的天赋跳过 v8 对照，由文件末尾显式公式断言保护
    if (
      (BASELINE_EXCLUDED as readonly string[]).includes(u.n) ||
      (NOT_IN_V8 as readonly string[]).includes(u.n)
    )
      continue;
    const expected = JSON.parse(
      runInContext(
        `JSON.stringify((()=>{resetGame();player.boltDmgMul=1;const u=UPGRADES.find(x=>x.n===${JSON.stringify(u.n)});u.f(player);return {player,max:u.max,t:u.t};})())`,
        baseline,
      ),
    );
    const g = fresh();
    if (
      S4C_AUTHORITY_MIGRATED.includes(
        u.n as (typeof S4C_AUTHORITY_MIGRATED)[number],
      )
    ) {
      // S4-C C1（见上方依据）：属性贡献已迁移，单级效果经真实学习路径对照，
      // 学习记录（upCounts/picks）归一化为 v8 f 不记录的现状后逐字段比较。
      g.learnTalent(u);
      expect({ ...g.player, upCounts: {}, picks: [] }).toEqual(expected.player);
    } else {
      u.f(g.player);
      expect(g.player).toEqual(expected.player);
    }
    expect(u.max).toBe(expected.max);
    expect(u.t).toBe(expected.t);
  }
});
/**
 * 基线更新依据：Combat Foundation S3-B 方案甲（用户已批准）。
 * brute（含波 4 首敌精英坦克）带 DEF 30、shooter（波 6 起）雷抗 30%、
 * bomber（波 8 起）火抗 40%——伤害结果自波 4 起分叉且无法用摘字段归一化
 * （击杀时序改变会连锁分叉全场状态）。原波次 4/5/8 从全模拟对照移除，
 * 严格对照保留波次 1/3（slime/bat 全中性），由 D-08 显式断言 +
 * game.test 精英/配额用例共同保护；全天赋场景同样改在波 3。
 */
it.each([1, 3])(
  "1800 deterministic ticks at wave %i match original combat and movement",
  (wave) => runWaveParity(wave),
);

function runWaveParity(wave: number) {
  const baseline = original();
  runInContext(
    `resetGame();player.boltDmgMul=1;waveN=${wave};quota=waveQuota(waveN);keys.d=true;`,
    baseline,
  );
  // Re-seed after original startup star generation, before either simulation begins.
  baseline.Math.random = seeded(900 + wave);
  runInContext("for(let i=0;i<1800;i++)update(1/60);", baseline);
  const expected = JSON.parse(
    runInContext(
      "JSON.stringify({player,enemies,bullets,gems,potions,time,kills,spawnCd,chainCd,wavePhase,waveN,quota,spawnedThisWave,dmgBy,ebullets,pendingLevels,bpMode,slotsUsed:slots.map(s=>s.used)})",
      baseline,
    ),
  );
  vi.spyOn(Math, "random").mockImplementation(seeded(900 + wave));
  const g = fresh();
  g.waveN = wave;
  g.quota = g.waveQuota(wave);
  g.keys.d = true;
  // Same original update entry point, independent of display-clock gating.
  for (let i = 0; i < 1800; i++) g.update(1 / 60);
  const actual = {
    player: g.player,
    enemies: g.enemies,
    bullets: g.bullets,
    gems: g.gems,
    potions: g.potions,
    time: g.time,
    kills: g.kills,
    spawnCd: g.spawnCd,
    chainCd: g.chainCd,
    wavePhase: g.wavePhase,
    waveN: g.waveN,
    quota: g.quota,
    spawnedThisWave: g.spawnedThisWave,
    dmgBy: g.dmgBy,
    ebullets: g.ebullets,
    pendingLevels: g.pendingLevels,
    bpMode: g.bpMode,
    slotsUsed: g.slots.map((s) => s.used),
  };
  expectParity(actual, expected, wave);
}

// 波次 4 因精英坦克带甲分叉（见上方依据），全天赋场景改在波 3（slime/bat 中性）
it.each([3])(
  "all talents except excluded baselines in combat retain original simulation at wave %i",
  (wave) => runAllTalentsParity(wave),
);

function runAllTalentsParity(wave: number) {
  const baseline = original();
  const excluded = JSON.stringify([...BASELINE_EXCLUDED, ...NOT_IN_V8]);
  runInContext(
    `resetGame();player.boltDmgMul=1;waveN=${wave};quota=waveQuota(waveN);for(const u of UPGRADES.filter(x=>!${excluded}.includes(x.n))){u.f(player);player.upCounts[u.n]=1;player.picks.push(u.n);}keys.s=true;keys[' ']=true;const q=UPGRADES.find(x=>x.n==='强化弹丸');q.d='魔弹伤害 +25%（仅魔弹）';q.max=30;`,
    baseline,
  );
  baseline.Math.random = seeded(400 + wave);
  runInContext("for(let i=0;i<1200;i++)update(1/60);", baseline);
  const fields =
    "player,enemies,bullets,gems,potions,time,kills,spawnCd,chainCd,wavePhase,waveN,quota,spawnedThisWave,dmgBy,ebullets,meteors,bolts,pendingLevels,bpMode,slots";
  const expected = JSON.parse(
    runInContext(`JSON.stringify({${fields}})`, baseline),
  );
  vi.spyOn(Math, "random").mockImplementation(seeded(400 + wave));
  const g = fresh();
  g.waveN = wave;
  g.quota = g.waveQuota(wave);
  for (const u of parityTalents) g.learnTalent(u);
  g.keys.s = true;
  g.keys[" "] = true;
  for (let i = 0; i < 1200; i++) g.update(1 / 60);
  const actual = Object.fromEntries(
    fields.split(",").map((key) => [key, g[key as keyof typeof g]]),
  );
  expectParity(actual, expected, wave);
}

/**
 * 基线更新依据：PR #4 评审 P2——恢复高波次全场对照覆盖。
 * 波 4/5/8 在生产配置下因方案甲 DEF/RES 分叉（见上方依据），此处改为
 * **测试内临时中性化**怪物新属性（try/finally 恢复，不修改生产配置迁就测试），
 * 恢复原波次的严格逐字段对照，保护高波次战斗/精英/掉落/波次转换的整场回归。
 */
function neutralizeEnemyAttributes() {
  const keys = Object.keys(ETYPES);
  const saved = keys.map((k) => {
    const cfg = ETYPES[k];
    const snapshot: {
      defense?: EnemyConfig["defense"];
      resistances?: EnemyConfig["resistances"];
    } = {};
    if (cfg.defense !== undefined) {
      snapshot.defense = cfg.defense;
      delete cfg.defense;
    }
    if (cfg.resistances !== undefined) {
      snapshot.resistances = cfg.resistances;
      delete cfg.resistances;
    }
    return snapshot;
  });
  return () => {
    keys.forEach((k, i) => Object.assign(ETYPES[k], saved[i]));
  };
}

// 波次 8 基础场景已随 Issue #5 专项排查恢复。根因：original() 的烈焰印记
// 重做补丁（Issue #42）因模式串空格风格与 v8 紧凑风格不符而静默失效，
// v8 侧烈焰印记滞留 t2，两侧档位池 t1/t2 组成不对称。种子 908 在 t=878
// 升级抽卡踩中档内索引交叉点：同一随机值 floor(r×11)=2 抽中致命一击
// （含伤害卡 → 保底不触发，消耗 6 次）、floor(r×12)=3 抽中守护之刃（无伤害
// 卡 → 保底触发，消耗 9 次），此后整条随机流错位级联成终局 HP ±8.1。
// 波 1/3/4/5 此前通过是种子未踩中交叉点；全天赋场景烈焰印记已满级不可
// 投放，天然免疫。修复：补丁模式串逐字对照 v8 原文，且全部字符串补丁
// 改为失配即抛错（见 original()），波 8 恢复中性化严格对照。
it.each([4, 5, 8])(
  "wave %i strict parity restored with S3-B attributes neutralized in-test",
  (wave) => {
    const restore = neutralizeEnemyAttributes();
    try {
      runWaveParity(wave);
    } finally {
      restore();
    }
  },
);

it.each([4, 8])(
  "all talents at wave %i strict parity restored with S3-B attributes neutralized in-test",
  (wave) => {
    const restore = neutralizeEnemyAttributes();
    try {
      runAllTalentsParity(wave);
    } finally {
      restore();
    }
  },
);

/**
 * 基线更新依据：Issue #1（用户已批准的平衡变更）。
 * 原基线为「击杀狂热叠层上限恒等于 v8 的 3 层」，现改为显式断言新公式，
 * 保留回归能力：任何偏离 3 + hasteLv 的实现都会让本条失败。
 */
it("D-01 击杀狂热叠层上限 = 3 + hasteLv（Lv1=4 / Lv2=5 / Lv3=6）", () => {
  const cases = [
    { lv: 1, cap: 4 },
    { lv: 2, cap: 5 },
    { lv: 3, cap: 6 },
  ] as const;
  for (const { lv, cap } of cases) {
    const g = fresh();
    learn(g, "击杀狂热", lv);
    expect(g.player.hasteLv).toBe(lv);
    expect(3 + g.player.hasteLv).toBe(cap);
    // 叠加次数远超上限，验证封顶而非线性累加
    for (let i = 0; i < cap + 4; i++) {
      const e = enemy(g);
      e.hp = 0;
      g.killEnemy(e);
    }
    expect(g.player.haste).toBe(cap);
    expect(g.player.hasteT).toBe(2 + lv);
  }
});

it("D-01 未学习击杀狂热时不产生叠层（与 v8 一致）", () => {
  const g = fresh();
  const e = enemy(g);
  e.hp = 0;
  g.killEnemy(e);
  expect(g.player.hasteLv).toBe(0);
  expect(g.player.haste).toBe(0);
});

/**
 * 基线更新依据：Issue #25（用户已批准的平衡变更）。
 * 强化弹丸只加成魔弹：boltDmgMul ×1.25、p.damage 不动、上限 30 层；
 * 保留回归能力：任何偏离该公式的实现都会让本条失败。
 */
it("D-02 强化弹丸只加成魔弹：boltDmgMul ×1.25，p.damage 不变，上限 30", () => {
  const g = fresh();
  const dmg0 = g.player.damage;
  learn(g, "强化弹丸", 2);
  expect(g.player.boltDmgMul).toBeCloseTo(1.5625);
  expect(g.player.damage).toBe(dmg0);
  const u = UPGRADES.find((x) => x.n === "强化弹丸");
  expect(u?.max).toBe(30);
});

it("D-02 魔弹实际伤害 = damage × boltDmgMul（衍生伤害不受强化弹丸影响）", () => {
  const g = fresh();
  learn(g, "强化弹丸", 1);
  enemy(g);
  g.player.fireCd = 0;
  g.update(1 / 60);
  expect(g.bullets.length).toBeGreaterThan(0);
  expect(g.bullets[0].dmg).toBeCloseTo(g.player.damage * g.player.boltDmgMul);
  const g2 = fresh();
  enemy(g2);
  g2.player.fireCd = 0;
  g2.update(1 / 60);
  expect(g2.bullets[0].dmg).toBeCloseTo(g2.player.damage);
  expect(g2.bullets[0].dmg).toBeCloseTo(g.bullets[0].dmg / 1.25);
});
/**
 * 基线更新依据：Issue #47（用户已批准的平衡变更）。
 * 15 波起难度超线性：over = max(0, waveN-15)，
 * hpScale = 1 + (n-1)*0.18 + over²×0.06，dmgScale = 1 + (n-1)*0.05 + over²×0.012。
 * 保留回归能力：任何偏离该公式的实现都会让本条失败。
 */
it("D-03 难度超线性：15 波起 HP/伤害平方项加速，15 波前与 v8 一致", () => {
  const g = fresh();
  g.waveN = 16;
  g.spawnEnemy("brute", true);
  const e = g.enemies[0];
  expect(e.hp).toBeCloseTo(65 * (1 + 15 * 0.18 + 1 * 0.06) * 8);
  expect(e.dmg).toBeCloseTo(15 * (1 + 15 * 0.05 + 1 * 0.012) * 1.5);
  const g2 = fresh();
  g2.waveN = 14;
  g2.spawnEnemy("brute", true);
  expect(g2.enemies[0].hp).toBeCloseTo(65 * (1 + 13 * 0.18) * 8);
});

/**
 * 基线更新依据：Issue #48（用户已批准的平衡变更）。
 * 精英配额：<12 波每 4 波 1 只（与 v8 一致）；12-19 波每波 2 只；20+ 波每波 3 只。
 */
it.each([
  [3, 0],
  [8, 1],
  [12, 2],
  [16, 2],
  [20, 3],
  [25, 3],
])("D-04 波 %i 的 BOSS 配额 = %i 只", (wave, expected) => {
  const g = fresh();
  g.waveN = wave;
  g.quota = g.waveQuota(wave);
  g.wavePhase = "fight";
  g.spawnCd = 0;
  for (let i = 0; i < 3; i++) {
    g.update(1 / 60);
    g.spawnCd = 0;
  }
  expect(g.enemies.filter((e) => e.elite).length).toBe(expected);
});

it("D-04 BOSS 掉落特殊宝箱：按 ELITE_BOX_GAIN 计点，不占普通掉落上限", () => {
  // 基线更新依据：Issue #87（用户已批准的平衡变更）。
  // 特殊宝箱由「固定 +2 点」改为「ELITE_BOX_GAIN 点 + 每波精英总点数上限 ELITE_BOX_POINT_CAP」。
  // 此处把原来的 +2 改为按常量显式断言，保留回归能力；上限行为由 tests/chest.test.ts 覆盖。
  const g = fresh();
  const e = enemy(g);
  e.elite = true;
  e.hp = 0;
  g.killEnemy(e);
  const box = g.boxes[g.boxes.length - 1];
  expect(box.special).toBe(true);
  const before = g.boxPicks;
  g.player.x = box.x;
  g.player.y = box.y;
  g.update(1 / 60);
  expect(g.boxPicks).toBe(before + ELITE_BOX_GAIN);
});
/**
 * 基线更新依据：Issue #36（用户已批准的手感变更）。
 * 动态散布：near = 目标 110px 内敌人数（含目标），
 * spread = 0.04 + 0.12 × min(1, (near-1)/4)——孤立目标近平行，5+ 目标完整扇形。
 * 保留回归能力：任何偏离该公式的实现都会让本条失败。
 */
it("D-05 动态散布：孤立目标收拢 0.04，密集目标展开 0.16", () => {
  const angle = (b: { vx: number; vy: number }) => Math.atan2(b.vy, b.vx);
  // 孤立目标 → 收拢
  const g = fresh();
  const split = UPGRADES.find((u) => u.n === "分裂射击");
  g.learnTalent(split!);
  g.learnTalent(split!); // multishot 3
  enemy(g);
  g.player.fireCd = 0;
  g.update(1 / 60);
  expect(g.bullets.length).toBe(3);
  const tight = [1, 2].map(
    (i) => angle(g.bullets[i]) - angle(g.bullets[i - 1]),
  );
  for (const d of tight) expect(d).toBeCloseTo(0.04, 1);
  // 密集目标 → 展开
  const g2 = fresh();
  g2.learnTalent(split!);
  g2.learnTalent(split!);
  enemy(g2);
  for (let i = 0; i < 5; i++)
    enemy(g2, g2.player.x + 60 + i * 8, g2.player.y + (i % 2) * 10);
  g2.player.fireCd = 0;
  g2.update(1 / 60);
  expect(g2.bullets.length).toBe(3);
  const wide = [1, 2].map(
    (i) => angle(g2.bullets[i]) - angle(g2.bullets[i - 1]),
  );
  for (const d of wide) expect(d).toBeCloseTo(0.16, 1);
});

/**
 * 基线更新依据：Combat Foundation S3-B 方案甲（用户已批准）。
 * 怪物克制分布 + 玩家护甲/元素增伤来源，替代被移除的波次 5/8 全模拟对照。
 * 保留回归能力：任何偏离以下公式的实现都会失败。
 */
it("D-08 方案甲怪物属性：brute 物理甲 / shooter 雷抗 / bomber 火抗", () => {
  const g = fresh();
  vi.spyOn(Math, "random").mockReturnValue(0.99); // 不暴击
  // brute DEF 30：物理 11 × 50/80 = 6.875 → 7；火焰/雷电不受护甲影响
  g.spawnEnemy("brute");
  const brute = g.enemies[0]!;
  brute.hp = 999;
  brute.maxhp = 999;
  g.hurtEnemy(brute, 11, 0, 0, {
    src: "bullet",
    type: "physical",
    form: "ranged",
  });
  expect(brute.hp).toBe(999 - 7);
  g.hurtEnemy(brute, 11, 0, 0, {
    src: "meteor",
    type: "fire",
    form: "other",
    noCrit: true,
    noChain: true,
  });
  expect(brute.hp).toBe(999 - 7 - 11);
  g.hurtEnemy(brute, 11, 0, 0, {
    src: "chain",
    type: "lightning",
    form: "other",
    noCrit: true,
    noChain: true,
  });
  expect(brute.hp).toBe(999 - 7 - 11 - 11);
  // shooter 雷抗 30%：雷 10 × 0.7 = 7；物理全额
  const g2 = fresh();
  vi.spyOn(Math, "random").mockReturnValue(0.99);
  g2.spawnEnemy("shooter");
  const shooter = g2.enemies[0]!;
  shooter.hp = 999;
  shooter.maxhp = 999;
  g2.hurtEnemy(shooter, 10, 0, 0, {
    src: "chain",
    type: "lightning",
    form: "other",
    noCrit: true,
    noChain: true,
  });
  expect(shooter.hp).toBe(999 - 7);
  g2.hurtEnemy(shooter, 10, 0, 0, {
    src: "bullet",
    type: "physical",
    form: "ranged",
  });
  expect(shooter.hp).toBe(999 - 17);
  // bomber 火抗 40%：火 10 × 0.6 = 6；真实伤害无视一切
  const g3 = fresh();
  vi.spyOn(Math, "random").mockReturnValue(0.99);
  g3.spawnEnemy("bomber");
  const bomber = g3.enemies[0]!;
  bomber.hp = 999;
  bomber.maxhp = 999;
  g3.hurtEnemy(bomber, 10, 0, 0, {
    src: "meteor",
    type: "fire",
    form: "other",
    noCrit: true,
    noChain: true,
  });
  expect(bomber.hp).toBe(999 - 6);
  g3.hurtEnemy(bomber, 10, 0, 0, {
    src: "bullet",
    type: "true",
    form: "ranged",
  });
  expect(bomber.hp).toBe(999 - 16);
  // slime/bat 保持全中性（方案甲：前 4 波教学期零影响）
  for (const type of ["slime", "bat"] as const) {
    const gn = fresh();
    gn.spawnEnemy(type);
    const e = gn.enemies[0]!;
    expect(e.defense).toBeUndefined();
    expect(e.resistances).toBeUndefined();
  }
});

it("D-08 磐石：每级 DEF+15（增量写入），物理减伤按 K/(K+DEF) 且 recompute 不叠加", () => {
  const g = fresh();
  learn(g, "磐石", 3);
  expect(g.player.defense).toBe(45);
  g.recompute();
  expect(g.player.defense).toBe(45); // f 按 upCounts 绝对值，重放安全
  // 玩家受击：100 × 50/95 浮点；再与 tough 乘算
  const e = enemy(g, g.player.x + 5, g.player.y);
  e.dmg = 100;
  g.player.hurtCd = 0;
  vi.spyOn(Math, "random").mockReturnValue(0.99);
  g.damagePlayer(e.dmg, {
    melee: true,
    src: e,
    type: "physical",
    form: "melee",
  });
  expect(g.player.hp).toBeCloseTo(100 - (100 * 50) / 95, 10);
  g.player.tough = 0.3;
  g.player.hurtCd = 0;
  g.player.hp = 100;
  g.damagePlayer(e.dmg, {
    melee: true,
    src: e,
    type: "physical",
    form: "melee",
  });
  expect(g.player.hp).toBeCloseTo(100 - ((100 * 50) / 95) * 0.7, 10);
});

it("D-08 元素亲和：火/雷 +10%/级只作用于对应属性，物理不受影响", () => {
  const g = fresh();
  learn(g, "元素亲和", 3);
  expect(g.player.typeDamageBonus?.fire).toBeCloseTo(0.3, 10);
  expect(g.player.typeDamageBonus?.lightning).toBeCloseTo(0.3, 10);
  g.recompute();
  expect(g.player.typeDamageBonus?.fire).toBeCloseTo(0.3, 10);
  expect(g.player.typeDamageBonus?.lightning).toBeCloseTo(0.3, 10);
  vi.spyOn(Math, "random").mockReturnValue(0.99);
  const e = enemy(g);
  e.hp = 999;
  e.maxhp = 999;
  g.hurtEnemy(e, 100, 0, 0, {
    src: "meteor",
    type: "fire",
    form: "other",
    noCrit: true,
    noChain: true,
  });
  expect(e.hp).toBe(999 - 130);
  g.hurtEnemy(e, 100, 0, 0, {
    src: "chain",
    type: "lightning",
    form: "other",
    noCrit: true,
    noChain: true,
  });
  expect(e.hp).toBe(999 - 260);
  g.hurtEnemy(e, 100, 0, 0, {
    src: "bullet",
    type: "physical",
    form: "ranged",
  });
  expect(e.hp).toBe(999 - 360); // 物理不吃火/雷增伤
});

it("D-08 玩家弹丸发射时快照：发射后修改增伤不回溯飞行中弹丸", () => {
  const g = fresh();
  vi.spyOn(Math, "random").mockReturnValue(0.99);
  g.player.typeDamageBonus = { physical: 0.5 };
  const e = enemy(g, g.player.x + 30, g.player.y);
  e.hp = 9999;
  e.maxhp = 9999;
  e.speed = 0;
  g.player.fireCd = 0;
  g.update(1 / 60);
  expect(g.bullets).toHaveLength(1);
  // 发射后原地提高增伤：飞行中的弹丸仍按发射时 +50% 结算
  g.player.typeDamageBonus.physical = 2;
  // 推进模拟直到弹丸命中目标
  for (let i = 0; i < 40 && e.hp > 9999 - 1; i++) g.update(1 / 60);
  expect(g.dmgBy.bullet).toBe(Math.round(11 * 1.5)); // 16.5 → 17（发射时快照）
  expect(g.player.typeDamageBonus.physical).toBe(2); // 实体现值未被快照逻辑改动
});
