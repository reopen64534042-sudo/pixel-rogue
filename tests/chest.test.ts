import { afterEach, describe, expect, it, vi } from "vitest";
import { fresh, learn, skipAttrs, ticks } from "./helpers";
import {
  BOX_DROP_CAP,
  ELITE_BOX_GAIN,
  ELITE_BOX_POINT_CAP,
  ELITE_XP_STEP,
} from "../src/game/data/constants";
import type { GameCore } from "../src/game/core/GameCore";

afterEach(() => vi.restoreAllMocks());

/** 造一个可控 seed 的敌人，用于确定性掉落判定 */
function mk(g: GameCore, seed: number, elite = false) {
  g.spawnEnemy("slime", elite);
  const e = g.enemies.at(-1)!;
  e.seed = seed;
  e.speed = 0;
  return e;
}

/** 宝箱机制（#15）与精英奖励（#17） */
describe("chest drops and elite rewards", () => {
  it("caps normal box drops at BOX_DROP_CAP per wave", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    const g = fresh();
    for (let s = 0; s < 3000; s++) g.killEnemy(mk(g, s));
    expect(g.boxDropsThisWave).toBe(BOX_DROP_CAP);
    expect(g.boxes).toHaveLength(BOX_DROP_CAP);
  });

  it("stops dropping normal boxes once the cap is reached", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    const g = fresh();
    g.boxDropsThisWave = BOX_DROP_CAP;
    for (let s = 0; s < 1000; s++) g.killEnemy(mk(g, s));
    expect(g.boxes).toHaveLength(0);
  });

  it("elite always drops a box without consuming the normal quota", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    const g = fresh();
    g.killEnemy(mk(g, 7, true));
    expect(g.boxes).toHaveLength(1);
    expect(g.boxDropsThisWave).toBe(0);
  });

  it("elite XP grows with the wave number", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    const g = fresh();
    g.waveN = 10;
    g.killEnemy(mk(g, 7, true));
    const gem = g.gems.find((x) => x.e)!;
    expect(gem.v).toBe(25 + 9 * ELITE_XP_STEP);
  });

  it("picks a box up on contact and queues it for opening", () => {
    const g = fresh();
    g.boxes.push({ x: g.player.x, y: g.player.y });
    ticks(g, 1);
    expect(g.boxPicks).toBe(1);
    expect(g.boxes).toHaveLength(0);
  });

  it("uncollected boxes fly to the player after the wave clears", () => {
    const g = fresh();
    skipAttrs(g); // 本用例验证宝箱链，属性面板另有用例覆盖
    learn(g, "强化弹丸", 1);
    const box = { x: g.player.x + 60, y: g.player.y };
    g.boxes.push(box);
    g.wavePhase = "collect";
    g.boxes.forEach((b) => (b.auto = true));

    ticks(g, 5);
    expect(box.x).toBeLessThan(g.player.x + 60); // 确实在向玩家移动

    ticks(g, 25);
    expect(g.boxes).toHaveLength(0); // 已收完
    // S2：宝箱不再开「强化天赋」面板——天赋一次获得、没有可升级的对象。
    // 点数要么还在队列（collect 未结束），要么已被 enterRest 折算成属性次数；
    // 两种都说明没丢，所以断言「折算后 attrPicks 有增长或 boxPicks 仍有值」。
    expect(g.boxPicks > 0 || g.attrPicks > 0).toBe(true);
    expect(g.bpMode).not.toBe("box");
  });

  it("box candidates only include learned talents below their cap", () => {
    const g = fresh();
    learn(g, "强化弹丸", 1);
    learn(g, "疾影步", 1);
    const picks = g.rollBoxPicks();
    expect(picks).toHaveLength(2);
    for (const u of picks) {
      const lv = g.player.upCounts[u.n] || 0;
      expect(lv).toBeGreaterThan(0);
      expect(lv).toBeLessThan(u.max);
    }
  });

  it("S2: boxes convert into attribute picks at the rest phase", () => {
    const g = fresh();
    skipAttrs(g); // 本用例验证宝箱折算，属性面板本身另有用例覆盖
    g.boxPicks = 2;
    const before = g.attrPicks;
    g.wavePhase = "collect";

    ticks(g, 2);

    // S2：点数在 enterRest 折算成属性次数，不再打开 box 面板。
    // 原「开箱强化已学天赋」在 max=1 的体系里会静默退化成「转经验 + 血包」，
    // 所以这里改为断言「点数变成选择次数」，而不是「面板出现」。
    expect(g.boxPicks).toBe(0);
    expect(g.attrPicks).toBeGreaterThan(before);
    expect(g.bpMode).not.toBe("box");
  });

  it("S2: boxes are never silently discarded when nothing is upgradeable", () => {
    const g = fresh();
    skipAttrs(g);
    g.boxPicks = 1;
    const before = g.attrPicks;
    g.wavePhase = "collect";

    ticks(g, 2);

    // 天赋全部 max=1，`rollBoxPicks` 的候选恒为空——旧实现会走 Issue #71 兜底
    // 转成经验 + 血包，玩家看不到任何成长。S2 改为折算属性次数。
    expect(g.boxPicks).toBe(0);
    expect(g.attrPicks).toBeGreaterThan(before);
  });
});

/**
 * Issue #87（用户批准的平衡变更）：特殊宝箱 1 点 + 每波精英宝箱点数上限 2。
 * 上限只约束精英宝箱，普通宝箱独立计算。
 */
describe("elite box gains (#87)", () => {
  function dropSpecial(g: GameCore) {
    g.boxes.push({ x: g.player.x, y: g.player.y, special: true });
    ticks(g, 1);
  }

  it("single elite box grants exactly one point", () => {
    const g = fresh();
    dropSpecial(g);
    expect(g.boxPicks).toBe(ELITE_BOX_GAIN);
    expect(g.eliteBoxPointsThisWave).toBe(ELITE_BOX_GAIN);
  });

  it("two elite boxes reach the per-wave cap", () => {
    const g = fresh();
    dropSpecial(g);
    dropSpecial(g);
    expect(g.boxPicks).toBe(ELITE_BOX_POINT_CAP);
    expect(g.eliteBoxPointsThisWave).toBe(ELITE_BOX_POINT_CAP);
  });

  it("third elite box converts to xp and potion instead of points", () => {
    const g = fresh();
    dropSpecial(g);
    dropSpecial(g);
    const picksBefore = g.boxPicks;
    const xpBefore = g.player.xp;
    const potionsBefore = g.potions.length;

    dropSpecial(g);

    expect(g.boxPicks).toBe(picksBefore);
    expect(g.player.xp).toBe(xpBefore + 8);
    expect(g.potions.length).toBe(potionsBefore + 1);
    expect(g.eliteBoxPointsThisWave).toBe(ELITE_BOX_POINT_CAP);
  });

  it("normal boxes are unaffected by the elite cap", () => {
    const g = fresh();
    dropSpecial(g);
    dropSpecial(g);
    expect(g.eliteBoxPointsThisWave).toBe(ELITE_BOX_POINT_CAP);

    g.boxes.push({ x: g.player.x, y: g.player.y });
    ticks(g, 1);
    expect(g.boxPicks).toBe(ELITE_BOX_POINT_CAP + 1);
  });

  it("cap resets on the next wave", () => {
    const g = fresh();
    dropSpecial(g);
    dropSpecial(g);
    expect(g.eliteBoxPointsThisWave).toBe(ELITE_BOX_POINT_CAP);

    g.wavePhase = "rest";
    g.pendingLevels = 0;
    expect(g.startNextWave()).toBe(true);
    expect(g.eliteBoxPointsThisWave).toBe(0);

    dropSpecial(g);
    expect(g.eliteBoxPointsThisWave).toBe(ELITE_BOX_GAIN);
  });
});
