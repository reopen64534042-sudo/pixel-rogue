import { afterEach, describe, expect, it, vi } from "vitest";
import { fresh, learn, ticks } from "./helpers";
import { BOX_DROP_CAP, ELITE_XP_STEP } from "../src/game/data/constants";
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
    learn(g, "强化弹丸", 1);
    const box = { x: g.player.x + 60, y: g.player.y };
    g.boxes.push(box);
    g.wavePhase = "collect";
    g.boxes.forEach((b) => (b.auto = true));

    ticks(g, 5);
    expect(box.x).toBeLessThan(g.player.x + 60); // 确实在向玩家移动

    ticks(g, 25);
    expect(g.boxes).toHaveLength(0); // 已收完
    expect(g.bpMode).toBe("box"); // 收完直接进入开箱面板
    expect(g.slots.length).toBeGreaterThan(0);
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

  it("opening a box upgrades a learned talent, then the wave enters rest", () => {
    const g = fresh();
    learn(g, "强化弹丸", 1);
    learn(g, "疾影步", 1);
    g.boxPicks = 1;
    g.wavePhase = "collect";

    ticks(g, 2);
    expect(g.bpMode).toBe("box");

    const total = () =>
      Object.values(g.player.upCounts).reduce((a, b) => a + b, 0);
    const before = total();
    expect(g.chooseSlot(0)).toBe(true);
    expect(total()).toBe(before + 1);
    expect(g.boxPicks).toBe(0);
    expect(g.bpMode).toBeNull();

    ticks(g, 2);
    expect(g.wavePhase).toBe("rest");
  });

  it("falls back to XP when nothing can be upgraded", () => {
    const g = fresh();
    g.boxPicks = 1;
    g.wavePhase = "collect";
    const xpBefore = g.player.xp;
    const maxHpBefore = g.player.maxhp;

    ticks(g, 2);

    expect(g.bpMode).not.toBe("box");
    expect(g.boxPicks).toBe(0);
    expect(g.player.xp).toBe(xpBefore + 8);
    // 兜底还送一个血包，满血拾取会转化为最大生命（#12）
    expect(g.player.maxhp).toBe(maxHpBefore + 1);
  });
});
