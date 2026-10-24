import { describe, expect, it } from "vitest";
import { COMBAT_BALANCE } from "../src/game/data/combatBalance";
import {
  DAMAGE_TYPES,
  type DamageTypeRegistry,
  type DamageTypeId,
} from "../src/game/data/damageTypes";
import {
  calculateDamage,
  generalMitigationFactor,
  typeMitigationFactor,
} from "../src/game/core/DamageSystem";
import type {
  CombatStatsSnapshot,
  DamageRequest,
} from "../src/game/core/types";

/** 扩展样例注册表：验证新增属性无需改动 DamageSystem 的类型分支 */
const FROST_TYPES = {
  ...DAMAGE_TYPES,
  frost: { mitigation: "resistance", label: "冰霜" },
} as const satisfies DamageTypeRegistry;

function snap<T extends string = DamageTypeId>(
  o: Partial<CombatStatsSnapshot<T>> = {},
): CombatStatsSnapshot<T> {
  return {
    attack: 0,
    defense: 0,
    critChance: 0,
    critMultiplier: 2,
    tough: 0,
    resistances: {},
    globalDamageBonus: 0,
    typeDamageBonus: {},
    formDamageBonus: {},
    ...o,
  };
}

function req(o: Partial<DamageRequest> = {}): DamageRequest {
  return {
    rawAmount: 100,
    type: "physical",
    form: "melee",
    origin: "test",
    kind: "hit",
    precision: "round-min-one",
    isCritical: false,
    attackerStats: snap(),
    defenderStats: snap(),
    ...o,
  };
}

/** Combat Foundation S1 验收：docs/pixel-rogue-combat-foundation-v1.md §7 S1 */
describe("combat foundation s1 damage calculator", () => {
  it("跨乘区相乘：100×1.2×1.3×1.4=218.4，hit 末尾一次取整", () => {
    const out = calculateDamage(
      DAMAGE_TYPES,
      req({
        type: "lightning",
        attackerStats: snap({
          globalDamageBonus: 0.2,
          typeDamageBonus: { lightning: 0.3 },
          formDamageBonus: { melee: 0.4 },
        }),
      }),
    );
    expect(out.rawDamage).toBe(100);
    expect(out.beforeMitigation).toBeCloseTo(218.4, 9);
    expect(out.settledDamage).toBe(218);
    expect(out.isCritical).toBe(false);
  });

  it("同乘区由适配器聚合为单一数值后只乘一次（+20% 与 +30% 合为 1.5）", () => {
    const out = calculateDamage(
      DAMAGE_TYPES,
      req({
        type: "lightning",
        attackerStats: snap({ typeDamageBonus: { lightning: 0.2 + 0.3 } }),
      }),
    );
    expect(out.beforeMitigation).toBeCloseTo(150, 9);
  });

  it("技能增伤按 skillId 命中一次；未声明 skillId 或映射缺失时不生效", () => {
    const attacker = snap({ skillDamageBonus: { blade: 0.1 } });
    expect(
      calculateDamage(
        DAMAGE_TYPES,
        req({ skillId: "blade", attackerStats: attacker }),
      ).beforeMitigation,
    ).toBeCloseTo(110, 9);
    expect(
      calculateDamage(
        DAMAGE_TYPES,
        req({ skillId: "unknown", attackerStats: attacker }),
      ).beforeMitigation,
    ).toBeCloseTo(100, 9);
    expect(
      calculateDamage(DAMAGE_TYPES, req({ attackerStats: attacker }))
        .beforeMitigation,
    ).toBeCloseTo(100, 9);
  });

  it("暴击在减伤前应用 critMultiplier；未暴击不乘", () => {
    const crit = calculateDamage(
      DAMAGE_TYPES,
      req({
        isCritical: true,
        attackerStats: snap({ critMultiplier: 2 }),
        defenderStats: snap({ defense: 50 }),
      }),
    );
    expect(crit.beforeMitigation).toBeCloseTo(200, 9);
    expect(crit.settledDamage).toBe(100); // 200 × 50/(50+50)
    const normal = calculateDamage(
      DAMAGE_TYPES,
      req({
        defenderStats: snap({ defense: 50 }),
      }),
    );
    expect(normal.settledDamage).toBe(50);
  });

  it("round-min-one 精度与既有敌方离散结算一致：max(1, round(raw))", () => {
    expect(
      calculateDamage(DAMAGE_TYPES, req({ rawAmount: 11 })).settledDamage,
    ).toBe(11);
    expect(
      calculateDamage(DAMAGE_TYPES, req({ rawAmount: 23.7 })).settledDamage,
    ).toBe(24);
    // 正伤害即使取整后为 0 也保底 1 点（对应 hurtEnemy 现行规则）
    expect(
      calculateDamage(DAMAGE_TYPES, req({ rawAmount: 0.4 })).settledDamage,
    ).toBe(1);
    // rawAmount=0 是合法零伤害，保持 0 而不是复活为 1
    expect(
      calculateDamage(DAMAGE_TYPES, req({ rawAmount: 0 })).settledDamage,
    ).toBe(0);
  });

  it("preserve-float 精度保留玩家受伤浮点语义（damagePlayer 不取整）", () => {
    // 评审 P1 用例：第二波史莱姆 8 × 1.05 = 8.4，现有系统扣 8.4 HP，不得取整为 8
    const slime = calculateDamage(
      DAMAGE_TYPES,
      req({ rawAmount: 8 * 1.05, precision: "preserve-float" }),
    );
    expect(slime.settledDamage).toBe(8 * 1.05);
    // tough 通用减伤同样保留浮点：10 × (1 - 0.5) = 5
    expect(
      calculateDamage(
        DAMAGE_TYPES,
        req({
          rawAmount: 10,
          precision: "preserve-float",
          defenderStats: snap({ tough: 0.5 }),
        }),
      ).settledDamage,
    ).toBe(5);
    // 小数伤害不取整、不保底（UI 取整仅用于显示，属 S2 表现层）
    expect(
      calculateDamage(
        DAMAGE_TYPES,
        req({ rawAmount: 0.3, precision: "preserve-float" }),
      ).settledDamage,
    ).toBe(0.3);
  });

  it("物理护甲 K/(K+max(0,DEF))：DEF 20 → 50/70；负护甲按 0 处理", () => {
    expect(
      typeMitigationFactor(DAMAGE_TYPES, "physical", snap({ defense: 20 })),
    ).toBeCloseTo(50 / 70, 12);
    expect(typeMitigationFactor(DAMAGE_TYPES, "physical", snap())).toBe(1);
    expect(
      typeMitigationFactor(DAMAGE_TYPES, "physical", snap({ defense: -30 })),
    ).toBe(1);
  });

  it("元素抗性 clamp(0, 75%)：未声明/0 → 1；超上限截断；负值按 0", () => {
    expect(typeMitigationFactor(DAMAGE_TYPES, "fire", snap())).toBe(1);
    expect(
      typeMitigationFactor(
        DAMAGE_TYPES,
        "lightning",
        snap({ resistances: { lightning: 0.9 } }),
      ),
    ).toBeCloseTo(1 - COMBAT_BALANCE.resistanceCap, 12);
    expect(
      typeMitigationFactor(
        DAMAGE_TYPES,
        "lightning",
        snap({ resistances: { lightning: 0.75 } }),
      ),
    ).toBeCloseTo(0.25, 12);
    expect(
      typeMitigationFactor(
        DAMAGE_TYPES,
        "fire",
        snap({ resistances: { fire: -0.5 } }),
      ),
    ).toBe(1);
  });

  it("真实伤害绕过护甲、抗性与通用减伤", () => {
    const tanky = snap({
      defense: 1000,
      resistances: { true: 0.9 },
      tough: 0.9,
    });
    expect(typeMitigationFactor(DAMAGE_TYPES, "true", tanky)).toBe(1);
    expect(generalMitigationFactor(DAMAGE_TYPES, "true", tanky)).toBe(1);
    expect(
      calculateDamage(DAMAGE_TYPES, req({ type: "true", defenderStats: tanky }))
        .settledDamage,
    ).toBe(100);
  });

  it("通用减伤（韧性）clamp(0, 60%)，仅作用于非真实属性，并与护甲乘算", () => {
    expect(
      generalMitigationFactor(DAMAGE_TYPES, "physical", snap({ tough: 0.3 })),
    ).toBeCloseTo(0.7, 12);
    expect(
      generalMitigationFactor(DAMAGE_TYPES, "fire", snap({ tough: 0.9 })),
    ).toBeCloseTo(1 - COMBAT_BALANCE.toughCap, 12);
    expect(
      generalMitigationFactor(DAMAGE_TYPES, "physical", snap({ tough: -1 })),
    ).toBe(1);
    // 100 × 50/70 × 0.5 = 35.71… → 36
    expect(
      calculateDamage(
        DAMAGE_TYPES,
        req({ defenderStats: snap({ defense: 20, tough: 0.5 }) }),
      ).settledDamage,
    ).toBe(36);
  });

  it("扩展属性 frost 无需改动计算器分支即可注册并计算", () => {
    const out = calculateDamage(FROST_TYPES, {
      rawAmount: 100,
      type: "frost",
      form: "ranged",
      origin: "test",
      kind: "hit",
      precision: "round-min-one",
      isCritical: false,
      attackerStats: snap(),
      defenderStats: snap<keyof typeof FROST_TYPES & string>({
        resistances: { frost: 0.3 },
      }),
    });
    expect(out.settledDamage).toBeCloseTo(70, 9);
    expect(
      calculateDamage(FROST_TYPES, {
        rawAmount: 100,
        type: "frost",
        form: "ranged",
        origin: "test",
        kind: "hit",
        precision: "round-min-one",
        isCritical: false,
        attackerStats: snap(),
        defenderStats: snap<keyof typeof FROST_TYPES & string>(),
      }).settledDamage,
    ).toBe(100);
  });

  it("未注册的伤害属性运行时显式报错（含原型链成员）", () => {
    expect(() => typeMitigationFactor(DAMAGE_TYPES, "frost", snap())).toThrow(
      /未注册/,
    );
    // 原型链上的成员（对象/函数均为真值）不得通过真值判断混入注册表
    for (const key of ["__proto__", "toString", "constructor"]) {
      expect(() => typeMitigationFactor(DAMAGE_TYPES, key, snap())).toThrow(
        /未注册/,
      );
    }
    // 模拟绕过编译期的非法调用，验证 calculateDamage 主路径同样拒绝
    const forged = { ...req(), type: "toString" } as unknown as DamageRequest;
    expect(() => calculateDamage(DAMAGE_TYPES, forged)).toThrow(/未注册/);
  });

  it("非法输入显式抛错：NaN/负数/Infinity、NaN 护甲或增伤、增伤致负", () => {
    expect(() =>
      calculateDamage(DAMAGE_TYPES, req({ rawAmount: Number.NaN })),
    ).toThrow(RangeError);
    expect(() => calculateDamage(DAMAGE_TYPES, req({ rawAmount: -5 }))).toThrow(
      RangeError,
    );
    expect(() =>
      calculateDamage(
        DAMAGE_TYPES,
        req({ rawAmount: Number.POSITIVE_INFINITY }),
      ),
    ).toThrow(RangeError);
    expect(() =>
      calculateDamage(
        DAMAGE_TYPES,
        req({ defenderStats: snap({ defense: Number.NaN }) }),
      ),
    ).toThrow(RangeError);
    expect(() =>
      calculateDamage(
        DAMAGE_TYPES,
        req({ attackerStats: snap({ globalDamageBonus: Number.NaN }) }),
      ),
    ).toThrow(RangeError);
    expect(() =>
      calculateDamage(
        DAMAGE_TYPES,
        req({
          attackerStats: snap({ typeDamageBonus: { physical: Number.NaN } }),
        }),
      ),
    ).toThrow(RangeError);
    // 增伤低于 -100% 会使乘区倍率为负：报错而不是意外变成 1 点伤害
    expect(() =>
      calculateDamage(
        DAMAGE_TYPES,
        req({ attackerStats: snap({ globalDamageBonus: -2 }) }),
      ),
    ).toThrow(RangeError);
    // 暴击倍率为负同样是非法配置
    expect(() =>
      calculateDamage(
        DAMAGE_TYPES,
        req({
          isCritical: true,
          attackerStats: snap({ critMultiplier: -1 }),
        }),
      ),
    ).toThrow(RangeError);
  });

  it("单个乘区低于 -100% 即非法：双负乘区互相抵消也不例外", () => {
    // -200% × -200% 的乘积为正，但每个乘区单独看都是非法配置，必须逐区拒绝
    expect(() =>
      calculateDamage(
        DAMAGE_TYPES,
        req({
          attackerStats: snap({
            globalDamageBonus: -2,
            typeDamageBonus: { physical: -2 },
          }),
        }),
      ),
    ).toThrow(RangeError);
    // 边界：恰为 -100% 的乘区合法（倍率为 0）→ 结算 0 而不是保底 1
    expect(
      calculateDamage(
        DAMAGE_TYPES,
        req({
          precision: "preserve-float",
          attackerStats: snap({ globalDamageBonus: -1 }),
        }),
      ).settledDamage,
    ).toBe(0);
  });

  it("dot 保留浮点精度：不取整、不保底", () => {
    const plain = calculateDamage(
      DAMAGE_TYPES,
      req({ kind: "dot", precision: "preserve-float", rawAmount: 10.5 }),
    );
    expect(plain.settledDamage).toBe(10.5);
    const resisted = calculateDamage(
      DAMAGE_TYPES,
      req({
        kind: "dot",
        precision: "preserve-float",
        rawAmount: 10.5,
        type: "fire",
        defenderStats: snap({ resistances: { fire: 0.3 } }),
      }),
    );
    expect(resisted.settledDamage).toBeCloseTo(10.5 * 0.7, 10);
  });

  it("dot 禁止暴击与取整精度：非法组合显式报错", () => {
    expect(() =>
      calculateDamage(
        DAMAGE_TYPES,
        req({ kind: "dot", precision: "preserve-float", isCritical: true }),
      ),
    ).toThrow(/dot 不允许暴击/);
    expect(() => calculateDamage(DAMAGE_TYPES, req({ kind: "dot" }))).toThrow(
      /preserve-float/,
    );
  });
});
