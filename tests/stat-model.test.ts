import { describe, expect, it } from "vitest";
import {
  modifierSources,
  resolveCombatStats,
  resolveStats,
  type StatModifier,
  type StatSheet,
} from "../src/game/core/StatModel";

function sheet(base: StatSheet["base"], modifiers: StatModifier[]): StatSheet {
  return { base, modifiers };
}
const mod = (
  sourceId: string,
  stat: StatModifier["stat"],
  stage: StatModifier["stage"],
  value: number,
): StatModifier => ({ sourceId, stat, stage, value });

describe("StatModel 通式与乘区语义（契约冻结）", () => {
  it("base=100 flat=20 percent=0.25 final=1.2 → 180", () => {
    const r = resolveStats(
      sheet({ attack: 100 }, [
        mod("生命强化", "attack", "flat", 20),
        mod("狂怒", "attack", "percent", 0.25),
        mod("毁灭本能", "attack", "final", 1.2),
      ]),
    );
    expect(r.attack).toBe(180);
  });

  it("同 percent 区加算：+20% 与 +30% 合成 ×1.5，而不是 ×1.26", () => {
    const r = resolveStats(
      sheet({ attack: 100 }, [
        mod("a", "attack", "percent", 0.2),
        mod("b", "attack", "percent", 0.3),
      ]),
    );
    expect(r.attack).toBe(150);
  });

  it("percent 加算的浮点契约：0.1+0.1 → ×1.2（逐位），非 1.1² 连乘", () => {
    const r = resolveStats(
      sheet({ attack: 100 }, [
        mod("a", "attack", "percent", 0.1),
        mod("b", "attack", "percent", 0.1),
      ]),
    );
    expect(r.attack).toBe(120);
  });

  it("final 连乘：1.1×1.1 → ×1.21（IEEE754 左结合，逐位等于同序表达式）", () => {
    const r = resolveStats(
      sheet({ attack: 100 }, [
        mod("a", "attack", "final", 1.1),
        mod("b", "attack", "final", 1.1),
      ]),
    );
    expect(r.attack).toBe(100 * 1.1 * 1.1);
    expect(r.attack).toBeGreaterThan(121);
  });

  it("legacy 逐次乘算兼容：基础 11 两级 ×1.1 是 final×2（13.31…），不是 percent+0.2（13.2）", () => {
    const r = resolveStats(
      sheet({ attack: 11 }, [
        mod("磨刃1", "attack", "final", 1.1),
        mod("磨刃2", "attack", "final", 1.1),
      ]),
    );
    expect(r.attack).toBe(11 * 1.1 * 1.1);
    expect(r.attack).not.toBe(13.2);
  });

  it("final 按修饰符数组顺序左结合（确定性契约）", () => {
    const order = (ids: [string, number][]) =>
      resolveStats(
        sheet(
          { attack: 100 },
          ids.map(([s, v]) => mod(s, "attack", "final", v)),
        ),
      ).attack;
    expect(
      order([
        ["a", 1.1],
        ["b", 1.3],
        ["c", 0.9],
      ]),
    ).toBe(100 * 1.1 * 1.3 * 0.9);
    expect(
      order([
        ["c", 0.9],
        ["b", 1.3],
        ["a", 1.1],
      ]),
    ).toBe(100 * 0.9 * 1.3 * 1.1);
  });

  it("零值边界：flat 0 / percent 0 合法；base 0 加修饰符得 0", () => {
    expect(
      resolveStats(sheet({ attack: 10 }, [mod("零平坦", "attack", "flat", 0)]))
        .attack,
    ).toBe(10);
    expect(
      resolveStats(
        sheet({ attack: 10 }, [mod("零百分比", "attack", "percent", 0)]),
      ).attack,
    ).toBe(10);
    expect(
      resolveStats(
        sheet({}, [
          mod("a", "attack", "percent", 0.5),
          mod("b", "attack", "final", 2),
        ]),
      ).attack,
    ).toBe(0);
  });

  it("负 percent 合法区间：-50% 减半；两项 -50% 相加得区因子 0（全免）", () => {
    expect(
      resolveStats(
        sheet({ attack: 100 }, [mod("debuff", "attack", "percent", -0.5)]),
      ).attack,
    ).toBe(50);
    expect(
      resolveStats(
        sheet({ attack: 100 }, [
          mod("d1", "attack", "percent", -0.6),
          mod("d2", "attack", "percent", -0.4),
        ]),
      ).attack,
    ).toBe(0);
  });

  it("负区因子现状钉住：多项合法负 percent 合计 < -1 允许负因子（政策留 S4-B 读取前明确，防静默更改）", () => {
    const r = resolveStats(
      sheet(
        { attack: 100 },
        [
          mod("d1", "attack", "percent", -0.6),
          mod("d2", "attack", "percent", -0.6),
        ],
      ),
    );
    // percentSum = -1.2（逐位），区因子 1-1.2 = -0.19999999999999996（Sterbenz 精确），
    // 与实现同序表达式逐位相等；是否允许负因子由 S4-B 批准后统一（本测试钉住现状）
    expect(r.attack).toBe(100 * (1 + (-0.6 + -0.6)));
    expect(r.attack).toBeLessThan(0);
  });

  it("负 flat 合法且模型不裁剪（夹紧属接入点决策，S4-B 不得静默更改）", () => {
    expect(
      resolveStats(sheet({ attack: 5 }, [mod("破甲", "attack", "flat", -8)]))
        .attack,
    ).toBe(-3);
  });

  it("缺省属性语义：只出现在修饰符的属性以 base=0 参与计算；未提及的属性不进结果", () => {
    const r = resolveStats(
      sheet({ attack: 10 }, [mod("磐石", "defense", "flat", 15)]),
    );
    expect(r.attack).toBe(10);
    expect(r.defense).toBe(15);
    expect("maxHp" in r).toBe(false);
  });
});

describe("StatModel 输入校验（禁止 NaN 传播与非法值域）", () => {
  it("NaN / ±Infinity 在 base、flat、percent、final 全部抛 TypeError", () => {
    const bad = [
      Number.NaN,
      Number.POSITIVE_INFINITY,
      Number.NEGATIVE_INFINITY,
    ];
    for (const v of bad) {
      expect(() => resolveStats(sheet({ attack: v }, []))).toThrow(TypeError);
      expect(() =>
        resolveStats(sheet({ attack: 1 }, [mod("x", "attack", "flat", v)])),
      ).toThrow(TypeError);
      expect(() =>
        resolveStats(sheet({ attack: 1 }, [mod("x", "attack", "percent", v)])),
      ).toThrow(TypeError);
      expect(() =>
        resolveStats(sheet({ attack: 1 }, [mod("x", "attack", "final", v)])),
      ).toThrow(TypeError);
    }
  });

  it("base 为负抛 RangeError", () => {
    expect(() => resolveStats(sheet({ attack: -1 }, []))).toThrow(RangeError);
  });

  it("溢出守卫：两个有限 flat 相加溢出（flat 聚合 Infinity → RangeError）", () => {
    expect(() =>
      resolveStats(
        sheet(
          { attack: 0 },
          [
            mod("a", "attack", "flat", 1e308),
            mod("b", "attack", "flat", 1e308),
          ],
        ),
      ),
    ).toThrow(RangeError);
  });

  it("溢出守卫：base 与 flat 各自合法但相加溢出（评审原始样例）", () => {
    expect(() =>
      resolveStats(
        sheet({ attack: Number.MAX_VALUE }, [
          mod("test", "attack", "flat", Number.MAX_VALUE),
        ]),
      ),
    ).toThrow(RangeError);
  });

  it("溢出守卫：两个有限 percent 相加溢出（percent 聚合 Infinity → RangeError）", () => {
    expect(() =>
      resolveStats(
        sheet(
          { attack: 1 },
          [
            mod("a", "attack", "percent", 1e308),
            mod("b", "attack", "percent", 1e308),
          ],
        ),
      ),
    ).toThrow(RangeError);
  });

  it("溢出守卫：base 与 final 倍率均合法但乘积溢出（final 阶段 Infinity → RangeError）", () => {
    expect(() =>
      resolveStats(
        sheet({ attack: 1e308 }, [mod("a", "attack", "final", 1e308)]),
      ),
    ).toThrow(RangeError);
  });

  it("percent ≤ -1 抛 RangeError（单一来源不可削减 ≥100%）", () => {
    expect(() =>
      resolveStats(sheet({ attack: 1 }, [mod("x", "attack", "percent", -1)])),
    ).toThrow(RangeError);
    expect(() =>
      resolveStats(sheet({ attack: 1 }, [mod("x", "attack", "percent", -1.5)])),
    ).toThrow(RangeError);
  });

  it("final ≤ 0 抛 RangeError（倍率本身非法；「+10%」不得写入 final）", () => {
    expect(() =>
      resolveStats(sheet({ attack: 1 }, [mod("x", "attack", "final", 0)])),
    ).toThrow(RangeError);
    expect(() =>
      resolveStats(sheet({ attack: 1 }, [mod("x", "attack", "final", -1.2)])),
    ).toThrow(RangeError);
  });

  it("sourceId 必须为非空字符串", () => {
    expect(() =>
      resolveStats(sheet({}, [mod("", "attack", "flat", 1)])),
    ).toThrow(TypeError);
  });

  it("白名单外属性 / 未知乘区 / 原型键一律抛 TypeError", () => {
    expect(() =>
      resolveStats(
        sheet({}, [
          { sourceId: "x", stat: "luck" as never, stage: "flat", value: 1 },
        ]),
      ),
    ).toThrow(TypeError);
    expect(() =>
      resolveStats(
        sheet({}, [
          { sourceId: "x", stat: "attack", stage: "mul" as never, value: 1 },
        ]),
      ),
    ).toThrow(TypeError);
    expect(() =>
      resolveStats(
        sheet(JSON.parse('{"__proto__": 5}') as StatSheet["base"], []),
      ),
    ).toThrow(TypeError);
  });
});

describe("StatModel 纯函数与来源追踪", () => {
  it("不改写任何输入：解析前后深快照一致；冻结输入下照常工作", () => {
    const input = sheet({ attack: 100, defense: 0 }, [
      mod("a", "attack", "flat", 20),
      mod("b", "attack", "percent", 0.25),
      mod("c", "attack", "final", 1.2),
      mod("磐石", "defense", "flat", 15),
    ]);
    const before = JSON.stringify(input);
    const r = resolveStats(input);
    expect(JSON.stringify(input)).toBe(before);
    expect(r.attack).toBe(180);
    expect(r.defense).toBe(15);
    resolveStats(Object.freeze(sheet(Object.freeze({ attack: 2 }), [])));
    expect(resolveStats(sheet({ attack: 2 }, [])).attack).toBe(2);
  });

  it("结果是新对象：改写结果不影响输入，输入非结果引用", () => {
    const input = sheet({ attack: 7 }, []);
    const r = resolveStats(input) as { attack?: number };
    expect(r).not.toBe(input.base);
    r.attack = 999;
    expect(input.base.attack).toBe(7);
  });

  it("modifierSources 按首次出现顺序去重，且按属性过滤", () => {
    const s = sheet({}, [
      mod("磐石", "defense", "flat", 15),
      mod("磐石", "defense", "flat", 15),
      mod("巨人血脉", "defense", "percent", 0.1),
      mod("磨刃", "attack", "final", 1.1),
    ]);
    expect(modifierSources(s, "defense")).toEqual(["磐石", "巨人血脉"]);
    expect(modifierSources(s, "attack")).toEqual(["磨刃"]);
    expect(modifierSources(s, "maxHp")).toEqual([]);
  });
});

describe("resolveCombatStats 桥接投影（S4-B shadow 设计，未接入运行时）", () => {
  it("投影 CombatStatsSnapshot 标量子集，缺失属性省略键", () => {
    const out = resolveCombatStats(
      sheet({ attack: 10, critChance: 0.05, critMultiplier: 1.5 }, [
        mod("磐石", "defense", "flat", 30),
        mod("狂怒", "attack", "final", 1.3),
      ]),
    );
    expect(out.attack).toBe(13);
    expect(out.defense).toBe(30);
    expect(out.critChance).toBe(0.05);
    expect(out.critMultiplier).toBe(1.5);
    expect("tough" in out).toBe(false);
  });

  it("投影不消费增伤/抗性映射（S4-B 决策项），纯函数无副作用", () => {
    const input = sheet({ attack: 3 }, [mod("x", "attack", "flat", 1)]);
    const before = JSON.stringify(input);
    resolveCombatStats(input);
    expect(JSON.stringify(input)).toBe(before);
  });
});
