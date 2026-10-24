import { afterEach, describe, expect, it, vi } from "vitest";
import { enemy, fresh, ticks } from "./helpers";

afterEach(() => vi.restoreAllMocks());

/** 近战模块（#13）验收：单体扇形 / 全向 / 来源标记 / 击退 / 空挥 */
describe("melee module", () => {
  it("hits only enemies inside the arc and reach", () => {
    const g = fresh();
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    const p = g.player;
    const front = enemy(g, p.x + 20, p.y);
    const back = enemy(g, p.x - 20, p.y);
    const far = enemy(g, p.x + 200, p.y);

    const hits = g.meleeSwing({
      angle: 0,
      spread: Math.PI / 2,
      radius: 40,
      dmg: 10,
    });

    expect(hits).toHaveLength(1);
    expect(hits[0]).toBe(front);
    expect(front.hp).toBe(front.maxhp - 10);
    expect(back.hp).toBe(back.maxhp);
    expect(far.hp).toBe(far.maxhp);
    expect(g.slashes).toHaveLength(1);
  });

  it("hits every direction when spread is full", () => {
    const g = fresh();
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    const p = g.player;
    for (const [dx, dy] of [
      [20, 0],
      [-20, 0],
      [0, 20],
      [0, -20],
    ])
      enemy(g, p.x + dx, p.y + dy);

    const hits = g.meleeSwing({
      spread: Math.PI * 2,
      radius: 30,
      dmg: 5,
    });

    expect(hits).toHaveLength(4);
    for (const e of hits) expect(e.hp).toBe(e.maxhp - 5);
  });

  it("counts enemy radius in reach and tags damage as melee", () => {
    const g = fresh();
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    const p = g.player;
    const e = enemy(g, p.x, p.y);
    // 距离超出 radius，但在 radius + 敌人半径之内
    e.x = p.x + 40 + e.r - 1;

    const hits = g.meleeSwing({
      angle: 0,
      spread: Math.PI / 2,
      radius: 40,
      dmg: 7,
    });

    expect(hits).toHaveLength(1);
    expect(g.dmgBy.melee).toBe(7);
    expect(g.dmgBy.bullet).toBe(0);
    expect(e.hp).toBe(e.maxhp - 7);
  });

  it("knocks enemies back, then decays and clears the slash", () => {
    const g = fresh();
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    const p = g.player;
    const e = enemy(g, p.x + 20, p.y);
    e.hp = 9999;
    e.maxhp = 9999;

    g.meleeSwing({
      angle: 0,
      spread: Math.PI,
      radius: 40,
      dmg: 1,
      knock: 240,
    });
    expect(e.kx).toBeGreaterThan(0);
    const from = e.x;

    ticks(g, 12);
    expect(e.x).toBeGreaterThan(from);
    expect(Math.abs(e.kx ?? 0)).toBeLessThan(240);
    expect(g.slashes).toHaveLength(0);
  });

  it("does not swing when no target is in range", () => {
    const g = fresh();
    const hits = g.meleeSwing({ radius: 40, dmg: 10 });
    expect(hits).toHaveLength(0);
    expect(g.slashes).toHaveLength(0);
    expect(g.dmgBy.melee).toBe(0);
  });
});
