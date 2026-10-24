import { afterEach, describe, expect, it, vi } from "vitest";
import { fresh, ticks } from "./helpers";
import { POTION_GROW_CAP } from "../src/game/data/constants";

afterEach(() => vi.restoreAllMocks());

/** 血包转化机制（#12）：满血拾取永久提升最大生命，每波有上限，不设总上限 */
describe("potion conversion", () => {
  it("converts a potion into permanent max HP when at full HP", () => {
    const g = fresh();
    const p = g.player;
    expect(p.hp).toBe(p.maxhp);
    g.potions.push({ x: p.x, y: p.y });

    ticks(g, 1);

    expect(p.maxhp).toBe(101);
    expect(p.hp).toBe(101);
    expect(g.potionGrow).toBe(1);
    expect(g.potions).toHaveLength(0);
  });

  it("keeps +20 heal and does not grow max HP when wounded", () => {
    const g = fresh();
    const p = g.player;
    p.hp = 50;
    g.potions.push({ x: p.x, y: p.y });

    ticks(g, 1);

    expect(p.hp).toBe(70);
    expect(p.maxhp).toBe(100);
    expect(g.potionGrow).toBe(0);
  });

  it("caps conversion at POTION_GROW_CAP per wave but still consumes potions", () => {
    const g = fresh();
    const p = g.player;
    for (let i = 0; i < POTION_GROW_CAP + 3; i++)
      g.potions.push({ x: p.x, y: p.y });

    ticks(g, 1);

    expect(p.maxhp).toBe(100 + POTION_GROW_CAP);
    expect(g.potionGrow).toBe(POTION_GROW_CAP);
    expect(g.potions).toHaveLength(0);
  });

  it("resets the per-wave counter but keeps the permanent bonus", () => {
    const g = fresh();
    const p = g.player;
    for (let i = 0; i < 4; i++) g.potions.push({ x: p.x, y: p.y });
    ticks(g, 1);
    expect(p.maxhp).toBe(104);
    expect(g.potionGrow).toBe(4);

    g.wavePhase = "rest";
    g.pendingLevels = 0;
    expect(g.startNextWave()).toBe(true);

    expect(g.potionGrow).toBe(0);
    expect(p.maxhp).toBe(104);
  });

  it("pulls potions even at full HP", () => {
    const g = fresh();
    const p = g.player;
    const pot = { x: p.x + 12, y: p.y };
    g.potions.push(pot);
    const before = Math.hypot(p.x - pot.x, p.y - pot.y);

    ticks(g, 2);

    expect(Math.hypot(p.x - pot.x, p.y - pot.y)).toBeLessThan(before);
  });
});
