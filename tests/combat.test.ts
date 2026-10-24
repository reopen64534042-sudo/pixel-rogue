import { afterEach, describe, expect, it, vi } from "vitest";
import { enemy, fresh, ticks } from "./helpers";

afterEach(() => vi.restoreAllMocks());

/**
 * Combat Foundation S2 验收：docs/pixel-rogue-combat-foundation-v1.md §7 S2。
 * parity 已保证全场 RNG/浮点一致，这里对管线关键语义做定点回归。
 */
describe("combat foundation s2 pipeline", () => {
  it("hurtEnemy 经管线结算与旧公式一致：max(1, round(dmg))，小伤害保底 1 点", () => {
    const g = fresh();
    const e = enemy(g);
    e.hp = 999;
    e.maxhp = 999;
    vi.spyOn(Math, "random").mockReturnValue(0.99); // 不暴击
    g.hurtEnemy(e, 23.7, 0, 0, {
      src: "bullet",
      type: "physical",
      form: "ranged",
    });
    expect(e.hp).toBe(999 - 24);
    expect(g.dmgBy.bullet).toBe(24);
    const e2 = enemy(g);
    e2.hp = 999;
    e2.maxhp = 999;
    g.hurtEnemy(e2, 0.4, 0, 0, {
      src: "bullet",
      type: "physical",
      form: "ranged",
    });
    expect(e2.hp).toBe(999 - 1);
  });

  it("暴击经 critMultiplier 结算；掷骰次数与顺序保持（先判定后音效，noCrit 不掷）", () => {
    const g = fresh();
    g.player.crit = 1;
    g.player.critMul = 2.5;
    const e = enemy(g);
    e.hp = 999;
    e.maxhp = 999;
    const rand = vi.spyOn(Math, "random").mockReturnValue(0.1);
    g.hurtEnemy(e, 10, 0, 0, {
      src: "bullet",
      type: "physical",
      form: "ranged",
    });
    expect(e.hp).toBe(999 - 25);
    // 无击杀时恰两次掷骰：暴击判定 → 命中音效
    expect(rand).toHaveBeenCalledTimes(2);
    expect(g.texts.some((t) => t.s === "25" && t.big)).toBe(true);
    const e2 = enemy(g);
    e2.hp = 999;
    e2.maxhp = 999;
    rand.mockClear();
    g.hurtEnemy(e2, 10, 0, 0, {
      src: "chain",
      noCrit: true,
      noChain: true,
      type: "lightning",
      form: "other",
    });
    expect(rand).toHaveBeenCalledTimes(1); // 仅音效
    expect(e2.hp).toBe(999 - 10);
  });

  it("吸血按结算值计算并封顶最大生命", () => {
    const g = fresh();
    g.player.lifesteal = 0.1;
    g.player.hp = 50;
    const e = enemy(g);
    e.hp = 999;
    e.maxhp = 999;
    vi.spyOn(Math, "random").mockReturnValue(0.99);
    g.hurtEnemy(e, 30, 0, 0, {
      src: "bullet",
      type: "physical",
      form: "ranged",
    });
    expect(g.player.hp).toBeCloseTo(50 + 3, 10);
    g.player.hp = g.player.maxhp - 1;
    const e2 = enemy(g);
    e2.hp = 999;
    e2.maxhp = 999;
    g.hurtEnemy(e2, 30, 0, 0, {
      src: "bullet",
      type: "physical",
      form: "ranged",
    });
    expect(g.player.hp).toBe(g.player.maxhp);
  });

  it("雷霆连锁继承上一击结算值 × (0.7 + chainDmg)，记账到 chain，冷却后不再连锁", () => {
    const g = fresh();
    g.player.chain = 1;
    g.player.chainDmg = 0.1;
    const a = enemy(g, g.player.x + 20, g.player.y);
    const b = enemy(g, a.x + 30, a.y);
    a.hp = 999;
    a.maxhp = 999;
    b.hp = 999;
    b.maxhp = 999;
    vi.spyOn(Math, "random").mockReturnValue(0.99);
    g.chainCd = 0;
    g.hurtEnemy(a, 10, 0, 0, {
      src: "bullet",
      type: "physical",
      form: "ranged",
    });
    expect(a.hp).toBe(999 - 10);
    expect(b.hp).toBe(999 - 8); // 10 × (0.7 + 0.1)
    expect(g.dmgBy.bullet).toBe(10);
    expect(g.dmgBy.chain).toBe(8);
    expect(g.bolts).toHaveLength(1);
    // 连锁进入 0.6s 冷却，第二击不再连锁
    g.hurtEnemy(a, 10, 0, 0, {
      src: "bullet",
      type: "physical",
      form: "ranged",
    });
    expect(g.bolts).toHaveLength(1);
    expect(b.hp).toBe(999 - 8);
    expect(g.chainCd).toBe(0.6);
  });

  it("damagePlayer 保留浮点伤害；tough 经通用减伤乘区生效，UI 取整仅用于显示", () => {
    const g = fresh();
    const e = enemy(g, g.player.x + 5, g.player.y);
    e.dmg = 8.4;
    vi.spyOn(Math, "random").mockReturnValue(0.99);
    g.player.hurtCd = 0;
    g.damagePlayer(e.dmg, {
      melee: true,
      src: e,
      type: "physical",
      form: "melee",
    });
    expect(g.player.hp).toBeCloseTo(100 - 8.4, 10);
    g.player.tough = 0.3;
    g.player.hurtCd = 0;
    g.player.hp = 100;
    g.damagePlayer(e.dmg, {
      melee: true,
      src: e,
      type: "physical",
      form: "melee",
    });
    expect(g.player.hp).toBeCloseTo(100 - 8.4 * 0.7, 10);
    expect(g.texts.some((t) => t.s === "-6")).toBe(true); // Math.round(5.88)
  });

  it("闪避 → 壁垒 → 护盾 顺序保持；抵挡时不扣血、不触发反伤", () => {
    const g = fresh();
    const e = enemy(g);
    g.player.tempShield = 1;
    g.player.shield = 1;
    g.player.thorns = 5;
    g.player.hurtCd = 0;
    g.damagePlayer(10, {
      melee: true,
      src: e,
      type: "physical",
      form: "melee",
    });
    expect(g.player.tempShield).toBe(0);
    expect(g.player.shield).toBe(1); // 壁垒优先，护盾未消耗
    expect(g.player.hp).toBe(100);
    expect(e.hp).toBe(e.maxhp); // 反伤未触发
    expect(g.dmgBy.thorns).toBe(0);
    g.player.hurtCd = 0;
    g.damagePlayer(10, {
      melee: true,
      src: e,
      type: "physical",
      form: "melee",
    });
    expect(g.player.shield).toBe(0);
    expect(g.player.shieldCd).toBe(10);
    expect(g.player.hp).toBe(100);
    // 真实扣血后反伤走 round-min-one 管线
    g.player.hurtCd = 0;
    g.damagePlayer(10, {
      melee: true,
      src: e,
      type: "physical",
      form: "melee",
    });
    expect(g.player.hp).toBeCloseTo(90, 10);
    expect(g.dmgBy.thorns).toBe(5);
    expect(e.hp).toBe(e.maxhp - 5);
  });

  it("闪避完全无效化；dodge>0 才消耗掷骰，dodge=0 全程无随机调用", () => {
    const g = fresh();
    g.player.dodge = 0.5;
    const rand = vi.spyOn(Math, "random").mockReturnValue(0.1);
    g.player.hurtCd = 0;
    g.damagePlayer(10, { type: "physical", form: "ranged" });
    expect(g.player.hp).toBe(100);
    expect(rand).toHaveBeenCalledTimes(1);
    rand.mockClear(); // 同一测试内二次 spyOn 复用同一 spy，先清零再验第二段
    const g2 = fresh();
    g2.player.hurtCd = 0;
    g2.damagePlayer(10, { type: "physical", form: "ranged" });
    expect(g2.player.hp).toBeCloseTo(90, 10);
    expect(rand).not.toHaveBeenCalled();
  });

  it("灼烧 DoT：60Hz 逐帧浮点累计 = DPS × 秒，无副作用触发链，死亡判定留在 EnemySystem", () => {
    const g = fresh();
    const e = enemy(g);
    e.hp = 999;
    e.maxhp = 999;
    e.burnT = 2;
    e.burnDps = 9; // 0.15/帧
    const textsBefore = g.texts.length;
    for (let i = 0; i < 60; i++) g.applyBurnDot(e, 1 / 60);
    expect(e.hp).toBeCloseTo(999 - 9, 9);
    expect(g.dmgBy.burn).toBeCloseTo(9, 9);
    expect(g.texts.length).toBe(textsBefore); // 不产生飘字/吸血/连锁
    expect(e.dead).toBeFalsy();
    // 灼烧致死走 EnemySystem 原有击杀路径
    const g2 = fresh();
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    const e2 = enemy(g2);
    e2.hp = 3;
    e2.maxhp = 3;
    e2.burnT = 1;
    e2.burnDps = 30; // 0.5/帧
    ticks(g2, 8);
    expect(e2.dead).toBe(true);
    expect(g2.kills).toBe(1);
  });
});
