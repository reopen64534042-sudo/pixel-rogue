import { readFileSync } from "node:fs";
import { createContext, runInContext } from "node:vm";
import { it, expect, vi, afterEach } from "vitest";
import { fresh, seeded, learn, enemy } from "./helpers";
import { UPGRADES } from "../src/game/data/talents";
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
 * 由 D-02 显式公式断言保护。其余天赋仍全部参与严格对照，
 * 任何其他天赋出现与 v8 的差异都按 bug 处理。
 */
const BASELINE_EXCLUDED = ["击杀狂热", "强化弹丸"] as const;
// v8 原版无 boltDmgMul 字段：对照前向原版 player 注入默认值 1，仅对齐结构，值语义不变。
const parityTalents = UPGRADES.filter(
  (u) => !BASELINE_EXCLUDED.includes(u.n as (typeof BASELINE_EXCLUDED)[number]),
);
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
it.each([1, 4, 5, 8, 16])(
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
    expect(JSON.parse(JSON.stringify(actual))).toEqual(expected);
  },
);

it.each([4, 8, 16])(
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
    expect(JSON.parse(JSON.stringify(actual))).toEqual(expected);
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