import { afterEach, describe, expect, it, vi } from "vitest";
import { resolveEnemyDefense } from "../src/game/core/EnemyStatSources";
import { getEnemyCombatStats } from "../src/game/core/CombatStats";
import { ETYPES } from "../src/game/data/enemies";
import { fresh } from "./helpers";

afterEach(() => vi.restoreAllMocks());

describe("怪物防御 v1", () => {
  it.each([
    ["slime", 25, { fire: 0.15, lightning: 0.05 }],
    ["bat", 10, { fire: 0.15 }],
    ["brute", 60, undefined],
    ["shooter", 30, { fire: 0.1, lightning: 0.45 }],
    ["bomber", 18, { fire: 0.55 }],
  ])("%s 生成时按波次解析并由精英继承", (kind, base, resistance) => {
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    for (const [wave, bonus] of [[1, 0], [8, 0], [15, 8.4], [20, 14.4], [28, 24], [30, 24]] as const) {
      const g = fresh(); g.waveN = wave; g.player.lvl = 20;
      g.spawnEnemy(kind); g.spawnEnemy(kind, true);
      for (const e of g.enemies) {
        expect(e.defense).toBe(base + bonus);
        expect(e.resistances).toEqual(resistance);
        expect(e.tough).toBeUndefined();
      }
      const e = g.enemies[0];
      const snapshot = getEnemyCombatStats(e);
      g.waveN = 30; g.player.lvl = 30;
      expect(e.defense).toBe(base + bonus);
      e.defense = 999;
      if (e.resistances) e.resistances.fire = 0.99;
      expect(snapshot.defense).toBe(base + bonus);
      expect(snapshot.resistances).toEqual(resistance ?? {});
    }
  });

  it("缺省防御与抗性不被物化，也不消费随机数", () => {
    const { defense: _defense, resistances: _resistances, ...cfg } = ETYPES.slime;
    const random = vi.spyOn(Math, "random");
    expect(resolveEnemyDefense(cfg, 30)).toEqual({});
    expect(random).not.toHaveBeenCalled();
    const original = ETYPES.slime;
    try {
      ETYPES.slime = cfg;
      const g = fresh(); g.waveN = 30; g.spawnEnemy("slime");
      expect(Object.hasOwn(g.enemies[0], "defense")).toBe(false);
      expect(Object.hasOwn(g.enemies[0], "resistances")).toBe(false);
    } finally { ETYPES.slime = original; }
  });

  it("波次改变只影响之后生成的实体，生成随机调用不变", () => {
    const random = vi.spyOn(Math, "random").mockReturnValue(0.5);
    const g = fresh(); g.waveN = 8;
    random.mockClear(); g.spawnEnemy("slime");
    expect(random).toHaveBeenCalledTimes(4);
    const first = g.enemies[0];
    g.waveN = 20; g.player.lvl = 25;
    random.mockClear(); g.spawnEnemy("slime");
    expect(random).toHaveBeenCalledTimes(4);
    expect(first.defense).toBe(25);
    expect(g.enemies[1].defense).toBe(39.4);
  });

  it.each([
    ["physical", 63], ["fire", 90], ["lightning", 55], ["true", 100],
  ] as const)("射手 100 点 %s 伤害按真实管线结算 %i", (type, expected) => {
    vi.spyOn(Math, "random").mockReturnValue(0.99);
    const g = fresh(); g.spawnEnemy("shooter"); const e = g.enemies[0];
    e.hp = e.maxhp = 1000;
    const result = g.hurtEnemy(e, 100, 0, 0, { type, noCrit: true, noChain: true });
    expect(result?.settledDamage).toBe(expected);
    expect(e.hp).toBe(1000 - expected);
  });
});
