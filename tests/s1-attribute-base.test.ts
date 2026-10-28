import { afterEach, describe, expect, it, vi } from "vitest";
import type { AttributePoint } from "../src/game/core/AttributeSources";
import type { Player } from "../src/game/core/types";
import { enemy, fresh, learn, ticks } from "./helpers";

/**
 * 伤害重做 S1 · 属性底座（读取侧）
 *
 * 验收线只有一条：**属性点为空时行为零变化**。属性强化是「第二个来源」，
 * 它必须和天赋来源在同一次 `resolveStats` 里合并解析——若各自投影一次，
 * 后写的一方会把前一方算出的字段抹掉（recompute 先 `statBase()` 重置再投影）。
 *
 * 因此本文件钉三件事：
 * 1. 空来源 ⇒ 逐字段零变化、重算幂等（不会因为新增投影链路而漂移）
 * 2. 只有属性 ⇒ 属性生效、重算两次不翻倍
 * 3. 属性 + 天赋共存 ⇒ 两者都生效（这条只有「合并解析」才能通过）
 *
 * 另加一条射程专项：射程从硬编码 130 提为 `p.attackRange` 之后，
 * **消费点真的读到它**（140px 处不攻击 → 加点后攻击）。
 */
afterEach(() => {
  vi.restoreAllMocks();
});

/** 会随帧变化的字段：比较「零变化」时必须排除，否则测的是时间流逝不是属性 */
const RUNTIME = new Set([
  "x",
  "y",
  "dx",
  "dy",
  "hp",
  "fireCd",
  "shield",
  "shieldCd",
  "dashT",
  "dashRe",
  "dashCharges",
  "haste",
  "hasteT",
  "rageT",
  "tempShield",
  "ndUsed",
  "orbA",
  "hurtCd",
  "meteorT",
  "lvl",
  "xp",
  "xpNext",
]);

function staticFields(p: Player): Record<string, number | boolean> {
  const out: Record<string, number | boolean> = {};
  for (const [k, v] of Object.entries(p)) {
    if (RUNTIME.has(k)) continue;
    if (typeof v === "number" || typeof v === "boolean") out[k] = v;
  }
  return out;
}

const attr = (
  stat: AttributePoint["stat"],
  value: number,
  stage: AttributePoint["stage"] = "flat",
): AttributePoint => ({ stat, stage, value });

describe("S1 · 属性来源为空时零变化", () => {
  it("recompute 前后静态字段逐项相等", () => {
    const g = fresh();
    learn(g, "强化弹丸");
    learn(g, "磐石");
    const before = staticFields(g.player);
    g.recompute();
    expect(staticFields(g.player)).toEqual(before);
  });

  it("连续 recompute 三次结果一致（幂等）", () => {
    const g = fresh();
    learn(g, "磨刃", 3);
    const once = staticFields(g.player);
    g.recompute();
    g.recompute();
    expect(staticFields(g.player)).toEqual(once);
  });

  it("属性射程默认 130，与旧硬编码等价", () => {
    const g = fresh();
    expect(g.player.attackRange).toBe(130);
    g.recompute();
    expect(g.player.attackRange).toBe(130);
  });
});

describe("S1 · 只有属性来源", () => {
  it("flat +10 攻击 ⇒ damage 11 → 21", () => {
    const g = fresh();
    g.attributePicks.push(attr("attack", 10));
    g.recompute();
    expect(g.player.damage).toBe(21);
  });

  it("重算两次不翻倍（来源不是累加缓存）", () => {
    const g = fresh();
    g.attributePicks.push(attr("attack", 10));
    g.recompute();
    g.recompute();
    expect(g.player.damage).toBe(21);
  });

  it("多条同类 flat 按顺序累加", () => {
    const g = fresh();
    g.attributePicks.push(attr("attack", 4), attr("attack", 6), attr("attack", 2));
    g.recompute();
    expect(g.player.damage).toBe(23);
  });

  it("percent 区同区加算（+10% 与 +20% ⇒ ×1.3，不是 ×1.32）", () => {
    const g = fresh();
    g.attributePicks.push(
      attr("attack", 0.1, "percent"),
      attr("attack", 0.2, "percent"),
    );
    g.recompute();
    expect(g.player.damage).toBeCloseTo(11 * 1.3, 10);
  });

  it("射程 flat +20 ⇒ 150", () => {
    const g = fresh();
    g.attributePicks.push(attr("attackRange", 20));
    g.recompute();
    expect(g.player.attackRange).toBe(150);
  });
});

describe("S1 · 属性与天赋共存（合并解析的关键用例）", () => {
  it("磨刃 ×1.1 与 +10 攻击同时生效：(11+10)×1.1 = 23.1", () => {
    const g = fresh();
    learn(g, "磨刃"); // damage final ×1.1
    g.attributePicks.push(attr("attack", 10));
    g.recompute();
    expect(g.player.damage).toBeCloseTo(23.1, 10);
  });

  it("加点后再学卡，属性不会被抹掉", () => {
    const g = fresh();
    g.attributePicks.push(attr("attack", 10));
    g.recompute();
    learn(g, "磨刃"); // learnTalent 内部会再投影一次
    expect(g.player.damage).toBeCloseTo(23.1, 10);
  });
});

describe("S1 · 射程被消费点真的读到", () => {
  it("140px 外不攻击；射程 +20 后开始攻击", () => {
    const g = fresh();
    g.enemies.length = 0;
    enemy(g, g.player.x + 140, g.player.y);
    g.player.fireCd = 0;
    ticks(g, 2);
    expect(g.bullets.length).toBe(0);

    g.attributePicks.push(attr("attackRange", 20));
    g.recompute();
    g.player.fireCd = 0;
    ticks(g, 2);
    expect(g.bullets.length).toBeGreaterThan(0);
  });

  it("弹道 life = 射程 ÷ 弹速（射程变长，飞行距离跟着变长）", () => {
    const g = fresh();
    g.enemies.length = 0;
    enemy(g, g.player.x + 20, g.player.y);
    g.player.fireCd = 0;
    ticks(g, 1);
    const short = g.bullets[0];
    expect(short).toBeDefined();
    // life 在本帧已被扣掉 1/60（发射与推进同帧），所以还原一帧再比
    expect(short.life + 1 / 60).toBeCloseTo(130 / g.player.projSpeed, 10);

    const g2 = fresh();
    g2.enemies.length = 0;
    g2.attributePicks.push(attr("attackRange", 70));
    g2.recompute();
    enemy(g2, g2.player.x + 20, g2.player.y);
    g2.player.fireCd = 0;
    ticks(g2, 1);
    expect(g2.bullets[0].life + 1 / 60).toBeCloseTo(
      200 / g2.player.projSpeed,
      10,
    );
  });
});
