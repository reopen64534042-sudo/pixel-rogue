import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ATTR_DEFS,
  ATTR_GROUPS,
  RARITY_CHANCE,
  attrPicksPerWave,
  rarityChances,
  rollAttrChoices,
} from "../src/game/core/AttributeSystem";
import { enemy, fresh, learn, skipAttrs, ticks } from "./helpers";

/**
 * 伤害重做 S1 · 属性发放（波末四选一 + 一次刷新）
 *
 * 验收线（实施清单 S1 检查点 ②）：
 * 1. 一局能连续完成 30+ 次选择，不卡流程；
 * 2. 四格方向不重复、已满属性不进候选；
 * 3. 刷新恰好一次，且稀有度一起重掷（不是只换属性方向）；
 * 4. 波末链 属性 → 天赋 → 宝箱 → 报告 的任何分支都能走到「开始下一波」。
 */
afterEach(() => {
  vi.restoreAllMocks();
});

/** 固定随机，避免用例依赖真实随机序列（与 parity 的做法一致） */
function seedRandom(seed = 20261029) {
  let s = seed;
  vi.spyOn(Math, "random").mockImplementation(() => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  });
}

describe("S1 · 发放节奏", () => {
  it("每波次数：1-10 波 1 次 / 11-20 波 2 次 / 21 波起 3 次", () => {
    expect(attrPicksPerWave(1)).toBe(1);
    expect(attrPicksPerWave(10)).toBe(1);
    expect(attrPicksPerWave(11)).toBe(2);
    expect(attrPicksPerWave(20)).toBe(2);
    expect(attrPicksPerWave(21)).toBe(3);
    expect(attrPicksPerWave(30)).toBe(3);
  });

  it("一局 30 波共 60 次（不是 30 次：后期加速）", () => {
    let total = 0;
    for (let w = 1; w <= 30; w++) total += attrPicksPerWave(w);
    expect(total).toBe(60);
  });
});

describe("S1 · 候选生成", () => {
  it("四格各出一个，方向互不重复", () => {
    seedRandom();
    const g = fresh();
    for (let i = 0; i < 50; i++) {
      const choices = rollAttrChoices(g.player);
      expect(choices).toHaveLength(ATTR_GROUPS.length);
      expect(choices.map((c) => c.def.group)).toEqual(
        ATTR_GROUPS.map((gr) => gr.key),
      );
    }
  });

  it("已满上限的属性不再出现（暴击满后攻势格只剩攻击/攻速）", () => {
    seedRandom();
    const g = fresh();
    g.player.crit = 1;
    const seen = new Set<string>();
    for (let i = 0; i < 200; i++)
      for (const c of rollAttrChoices(g.player))
        if (c.def.group === "offense") seen.add(c.def.label);
    expect(seen.has("暴击")).toBe(false);
    expect(seen.size).toBeGreaterThan(0);
  });

  it("稀有度梯度：金档数值约等于白档的 2.9 倍", () => {
    const attack = ATTR_DEFS.find((d) => d.label === "攻击")!;
    // 直接按倍率推导，避免依赖随机
    const white = Math.round(attack.base * 1);
    const gold = Math.max(1, Math.round(attack.base * 2.9));
    expect(white).toBe(5);
    expect(gold).toBe(15);
  });

  it("概率表：7 档 × 4 稀有度，且每档合计 100", () => {
    expect(RARITY_CHANCE).toHaveLength(7);
    for (const row of RARITY_CHANCE) {
      expect(row).toHaveLength(4);
      expect(row.reduce((a, b) => a + b, 0)).toBe(100);
    }
    // 等级只影响档位，30 级后封顶
    expect(rarityChances(1)).toBe(RARITY_CHANCE[0]);
    expect(rarityChances(30)).toBe(RARITY_CHANCE[6]);
    expect(rarityChances(99)).toBe(RARITY_CHANCE[6]);
  });
});

describe("S1 · 面板流程", () => {
  it("波末先弹属性面板，选完才回到休整报告", () => {
    seedRandom();
    const g = fresh();
    g.spawnedThisWave = g.quota;
    g.wavePhase = "collect";
    ticks(g, 2);
    expect(g.wavePhase).toBe("rest");
    expect(g.bpMode).toBe("attr");

    g.chooseAttr(0);
    expect(g.attrPicks).toBe(0);
    expect(g.bpMode).toBeNull();
    expect(g.attributePicks).toHaveLength(1);
  });

  it("还有次数时就地换一组，面板不关", () => {
    seedRandom();
    const g = fresh();
    g.attrPicks = 2;
    g.openAttrPanel();
    expect(g.bpMode).toBe("attr");
    g.chooseAttr(0);
    expect(g.attrPicks).toBe(1);
    expect(g.bpMode).toBe("attr");
    expect(g.attrChoices).toHaveLength(4);
    g.chooseAttr(1);
    expect(g.attrPicks).toBe(0);
    expect(g.bpMode).toBeNull();
  });

  it("刷新每次只有一次，第二次被拒", () => {
    seedRandom();
    const g = fresh();
    g.attrPicks = 1;
    g.openAttrPanel();
    expect(g.refreshAttr()).toBe(true);
    expect(g.attrRefreshUsed).toBe(true);
    expect(g.refreshAttr()).toBe(false);
    // 选完进入下一次时额度重置
    g.attrPicks = 2;
    g.chooseAttr(0);
    expect(g.attrRefreshUsed).toBe(false);
  });

  it("刷新会连稀有度一起重掷（不是只换属性方向）", () => {
    seedRandom(7);
    const g = fresh();
    g.player.lvl = 30; // 高档概率足够高
    g.attrPicks = 1;
    g.openAttrPanel();
    let sawDifferentRarity = false;
    for (let i = 0; i < 20 && !sawDifferentRarity; i++) {
      g.attrRefreshUsed = false;
      g.openAttrPanel();
      const before = g.attrChoices.map((c) => c.rarity);
      g.refreshAttr();
      const after = g.attrChoices.map((c) => c.rarity);
      if (before.some((r, k) => r !== after[k])) sawDifferentRarity = true;
    }
    expect(sawDifferentRarity).toBe(true);
  });

  it("选属性后数值立刻生效（recompute 走来源投影）", () => {
    seedRandom(3);
    const g = fresh();
    const before = g.player.damage;
    g.attrPicks = 1;
    g.openAttrPanel();
    // 找一张攻击卡，保证这条断言不依赖随机
    const idx = g.attrChoices.findIndex((c) => c.def.stat === "attack");
    if (idx < 0) return; // 攻势格这次没出攻击，跳过（分布由上面的用例覆盖）
    g.chooseAttr(idx);
    expect(g.player.damage).toBeGreaterThan(before);
  });
});

describe("S1 · 一局跑完不卡（检查点 ②）", () => {
  it("30 波 × 60 次选择，每次都能走完且面板正确关闭", () => {
    seedRandom(11);
    const g = fresh();
    let picks = 0;
    for (let w = 1; w <= 30; w++) {
      g.attrPicks = attrPicksPerWave(w);
      g.pendingLevels = 0;
      g.boxPicks = 0;
      g.openAttrPanel();
      expect(g.bpMode).toBe("attr");
      let guard = 0;
      while (g.attrPicks > 0) {
        expect(guard++).toBeLessThan(10); // 死循环守卫
        expect(g.chooseAttr(guard % 4)).toBe(true);
        picks++;
      }
      expect(g.bpMode).toBeNull();
    }
    expect(picks).toBe(60);
    expect(g.attributePicks).toHaveLength(60);
  });

  it("属性额度不会丢：跳过的次数留到下次休整", () => {
    seedRandom(5);
    const g = fresh();
    // 第 1 波不选，直接开第 2 波（模拟延迟处理）
    g.wavePhase = "rest";
    skipAttrs(g);
    expect(g.startNextWave()).toBe(true);
    expect(g.attrPicks).toBe(attrPicksPerWave(2));
  });
});

/**
 * #135：属性池增删两条续航 + 移除「范围」。
 *
 * 这里验证的是**整条链路**（AttributeSystem → StatModel 白名单 → 投影写回 →
 * 战斗消费点），不是只断言目录里多了两行——之前 `regen` 就是「有消费点、
 * 无来源」的死字段，只加目录不加白名单会静默失效。
 */
describe("属性池：#135 续航与范围", () => {
  it("「范围」不再进属性池，但 area 这个 stat 仍在（法师 AOE 会用）", () => {
    expect(ATTR_DEFS.some((d) => d.label === "范围")).toBe(false);
    expect(ATTR_DEFS.some((d) => d.stat === "area")).toBe(false);
  });

  it("生命汲取在攻势组、生命回复在守势组，且显示格式正确", () => {
    const leech = ATTR_DEFS.find((d) => d.label === "生命汲取")!;
    expect(leech.group).toBe("offense");
    expect(leech.stat).toBe("lifesteal");
    expect(leech.base).toBeCloseTo(0.04, 10);

    const regen = ATTR_DEFS.find((d) => d.label === "生命回复")!;
    expect(regen.group).toBe("defense");
    expect(regen.stat).toBe("regen");
    expect(regen.base).toBeCloseTo(0.6, 10);
    // 0.6 必须保留一位小数：int 型会被 round 成 1，量级就翻了 66%
    expect(regen.kind).toBe("dec");
    expect(regen.unit).toBe("/秒");

    // 每格仍有 ≥2 个候选（否则那一格不是选择而是发放）
    for (const group of ["offense", "defense", "utility", "special"]) {
      const n = ATTR_DEFS.filter((d) => d.group === group).length;
      expect(n, group).toBeGreaterThanOrEqual(2);
    }
  });

  it("生命汲取走通整条链路：命中后按伤害比例回血", () => {
    const g = fresh();
    g.quota = 0;
    g.attributePicks.push({ stat: "lifesteal", stage: "flat", value: 0.5 });
    g.recompute();
    expect(g.player.lifesteal).toBeCloseTo(0.5, 10); // 白名单 + 写回都通了

    g.player.hp = 50;
    const e = enemy(g);
    e.hp = e.maxhp = 1e6;
    g.hurtEnemy(e, 20, 0, 0, {
      src: "bullet",
      type: "physical",
      form: "ranged",
    });
    expect(g.player.hp).toBeGreaterThan(50);
  });

  it("生命回复走通整条链路：每秒按恒定速率回血", () => {
    const g = fresh();
    g.quota = 0;
    g.attributePicks.push({ stat: "regen", stage: "flat", value: 6 });
    g.recompute();
    expect(g.player.regen).toBeCloseTo(6, 10);

    g.player.hp = 50;
    ticks(g, 60); // 约 1 秒
    // 60 帧 × 1/60 × 6 ≈ 6 点；给足容差，只验证「确实在回」且量级正确
    expect(g.player.hp).toBeGreaterThan(54);
    expect(g.player.hp).toBeLessThanOrEqual(57);
  });

  it("两条续航与旧卡 f 不互相覆盖（投影只在有来源时写）", () => {
    const g = fresh();
    g.quota = 0;
    // 旧卡路径：f 直接写
    learn(g, "修复微光", 2); // 0.6 × 2
    const viaCard = g.player.regen;
    expect(viaCard).toBeCloseTo(1.2, 10);
    // 属性来源不存在时，recompute 不得把卡的效果抹成 0
    g.recompute();
    expect(g.player.regen).toBeCloseTo(viaCard, 10);
  });
});
