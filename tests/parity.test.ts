import { readFileSync } from "node:fs";
import { createContext, runInContext } from "node:vm";
import { it, expect, vi, afterEach } from "vitest";
import { fresh, seeded, learn, enemy } from "./helpers";
import { UPGRADES } from "../src/game/data/talents";
import { ELITE_XP_STEP, POTION_GROW_CAP } from "../src/game/data/constants";
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
const BASELINE_EXCLUDED = ["击杀狂热", "强化弹丸", "分裂射击"] as const;
// v8 原版无 boltDmgMul 字段：对照前向原版 player 注入默认值 1，仅对齐结构，值语义不变。
const parityTalents = UPGRADES.filter(
  (u) => !BASELINE_EXCLUDED.includes(u.n as (typeof BASELINE_EXCLUDED)[number]),
);
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
  expect(aEb.rest).toEqual(eEb.rest);
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
  const html = readFileSync("legacy/upstream-v8.html", "utf8");
  runInContext(html.match(/<script>([\s\S]*?)<\/script>/)![1], context);
  runInContext(
    "muted=true;state='play';drawCards=()=>{};showRestBar=()=>{bpMode='rest';};",
    context,
  );
  return context;
}
it("every talent effect, cap and tier matches the protected original", () => {
  const baseline = original();
  for (const u of UPGRADES) {
    if ((BASELINE_EXCLUDED as readonly string[]).includes(u.n)) {
      // 基线已按 Issue 更新的天赋跳过 v8 对照，由文件末尾显式公式断言保护
      if (u.n === "强化弹丸") {
        const g2 = fresh();
        const d0 = g2.player.damage;
        u.f(g2.player);
        expect(g2.player.damage).toBe(d0);
        expect(g2.player.boltDmgMul).toBeCloseTo(1.25);
        expect(u.max).toBe(30);
      }
      continue;
    }
    const expected = JSON.parse(
      runInContext(
        `JSON.stringify((()=>{resetGame();player.boltDmgMul=1;const u=UPGRADES.find(x=>x.n===${JSON.stringify(u.n)});u.f(player);return {player,max:u.max,t:u.t};})())`,
        baseline,
      ),
    );
    const g = fresh();
    u.f(g.player);
    expect(g.player).toEqual(expected.player);
    expect(u.max).toBe(expected.max);
    expect(u.t).toBe(expected.t);
  }
});
it.each([1, 4, 5, 8])(
  "1800 deterministic ticks at wave %i match original combat and movement",
  (wave) => {
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
        "JSON.stringify({player,enemies,bullets,gems,potions,time,kills,spawnCd,chainCd,wavePhase,waveN,quota,spawnedThisWave,dmgBy,ebullets,pendingLevels,bpMode,slotNames:slots.map(s=>({name:s.u.n,used:s.used}))})",
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
      slotNames: g.slots.map((s) => ({ name: s.u.n, used: s.used })),
    };
    expectParity(actual, expected, wave);
  },
);

it.each([4, 8])(
  "all talents except excluded baselines in combat retain original simulation at wave %i",
  (wave) => {
    const baseline = original();
    const excluded = JSON.stringify([...BASELINE_EXCLUDED]);
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

it("D-04 BOSS 掉落特殊宝箱：+2 宝箱点数，不占普通掉落上限", () => {
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
  expect(g.boxPicks).toBe(before + 2);
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
