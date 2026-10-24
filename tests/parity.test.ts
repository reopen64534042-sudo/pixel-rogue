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
 * 改由本文件末尾的显式公式断言做回归保护；其余天赋仍全部参与严格对照，
 * 任何其他天赋出现与 v8 的差异都按 bug 处理。
 */
const D01_EXCLUDED = ["击杀狂热"] as const;
const parityTalents = UPGRADES.filter(
  (u) => !D01_EXCLUDED.includes(u.n as (typeof D01_EXCLUDED)[number]),
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
    const expected = JSON.parse(
      runInContext(
        `JSON.stringify((()=>{resetGame();const u=UPGRADES.find(x=>x.n===${JSON.stringify(u.n)});u.f(player);return {player,max:u.max,t:u.t};})())`,
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
      `resetGame();waveN=${wave};quota=waveQuota(waveN);keys.d=true;`,
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
    const actualSnap = takeMelee(JSON.parse(JSON.stringify(actual)));
    const expectedSnap = takeMelee(expected);
    expect(expectedSnap.melee).toBeUndefined();
    expect(actualSnap.melee).toBe(0);
    expect(actualSnap.rest).toEqual(expectedSnap.rest);
  },
);

it.each([4, 8, 16])(
  "all talents except D-01 in combat retain original simulation at wave %i",
  (wave) => {
    const baseline = original();
    const excluded = JSON.stringify([...D01_EXCLUDED]);
    runInContext(
      `resetGame();waveN=${wave};quota=waveQuota(waveN);for(const u of UPGRADES.filter(x=>!${excluded}.includes(x.n))){u.f(player);player.upCounts[u.n]=1;player.picks.push(u.n);}keys.s=true;keys[' ']=true;`,
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
    const actualSnap = takeMelee(JSON.parse(JSON.stringify(actual)));
    const expectedSnap = takeMelee(expected);
    expect(expectedSnap.melee).toBeUndefined();
    expect(actualSnap.melee).toBe(0);
    expect(actualSnap.rest).toEqual(expectedSnap.rest);
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
