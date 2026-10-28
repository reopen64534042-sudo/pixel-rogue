import { afterEach, describe, expect, it, vi } from "vitest";
import { getEnemyCombatStats } from "../src/game/core/CombatStats";
import {
  enemyDefenseSheet,
  resolveEnemyDefense,
  type EnemyDefenseStats,
} from "../src/game/core/EnemyStatSources";
import {
  enemyShadowFromConfig,
  enemyShadowFromEntity,
} from "../src/game/core/StatSheets";
import type { Enemy, EnemyConfig } from "../src/game/core/types";
import { ETYPES } from "../src/game/data/enemies";
import { fresh } from "./helpers";

afterEach(() => vi.restoreAllMocks());

const ENEMY_KINDS = ["slime", "bat", "brute", "shooter", "bomber"] as const;
type EnemyKind = (typeof ENEMY_KINDS)[number];

const BASE_ENEMY_KEYS = [
  "type",
  "spr",
  "x",
  "y",
  "hp",
  "maxhp",
  "speed",
  "dmg",
  "r",
  "xp",
  "elite",
  "flash",
  "orbCd",
  "slowT",
  "slowF",
  "burnT",
  "burnDps",
  "burnStacks",
  "frostStacks",
  "frozenT",
  "frostImmuneT",
  "seed",
  "shootCd",
  "fuse",
  "noDrop",
] as const;

// B：独立于 EnemyStatSources/EnemyConfig 的冻结字面量对照，不从生产表推导。
const EXPECTED_DEFENSE: Record<
  EnemyKind,
  { defense?: number; resistances?: Record<string, number>; tough?: number }
> = {
  slime: { defense: 25, resistances: { fire: 0.15, lightning: 0.05 } },
  bat: { defense: 10, resistances: { fire: 0.15 } },
  brute: { defense: 60 },
  shooter: { defense: 30, resistances: { fire: 0.1, lightning: 0.45 } },
  bomber: { defense: 18, resistances: { fire: 0.55 } },
};

function expectedKeys(kind: EnemyKind): string[] {
  const defenseKeys = Object.keys(EXPECTED_DEFENSE[kind]);
  return [...BASE_ENEMY_KEYS, ...defenseKeys];
}

function pickDeclaredDefense(value: {
  defense?: number;
  resistances?: Readonly<Record<string, number>>;
  tough?: number;
}): { defense?: number; resistances?: Record<string, number>; tough?: number } {
  const out: {
    defense?: number;
    resistances?: Record<string, number>;
    tough?: number;
  } = {};
  if (Object.hasOwn(value, "defense")) out.defense = value.defense;
  if (Object.hasOwn(value, "resistances") && value.resistances !== undefined) {
    out.resistances = { ...value.resistances };
  }
  if (Object.hasOwn(value, "tough")) out.tough = value.tough;
  return out;
}

function injectConfigField<K extends "defense" | "resistances" | "tough" | "formDamageBonus">(
  cfg: EnemyConfig,
  key: K,
  value: NonNullable<EnemyConfig[K]>,
  run: () => void,
): void {
  const original = cfg[key];
  try {
    cfg[key] = value as EnemyConfig[K];
    run();
  } finally {
    if (original === undefined) delete cfg[key];
    else cfg[key] = original;
  }
}

function spawnedEnemy(kind: EnemyKind): { core: ReturnType<typeof fresh>; enemy: Enemy } {
  const core = fresh();
  core.spawnEnemy(kind);
  return { core, enemy: core.enemies.at(-1)! };
}

describe("Combat Foundation S4-D1 · 敌人防御属性权威迁移", () => {
  it("D1-01 brute 只写 defense，保留冻结实体键集合", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    const { enemy: e } = spawnedEnemy("brute");
    expect(e.defense).toBe(60);
    expect("resistances" in e).toBe(false);
    expect("tough" in e).toBe(false);
    expect(Object.keys(e)).toEqual(expectedKeys("brute"));
    expect(e.hp).toBe(e.maxhp);
    expect([e.flash, e.orbCd, e.slowT, e.burnT, e.shootCd, e.fuse]).toEqual([
      0,
      0,
      0,
      0,
      1.75,
      0,
    ]);
    expect("dead" in e || "kx" in e || "ky" in e).toBe(false);
  });

  it("D1-02 shooter 保留护甲和配置抗性，不物化 tough", () => {
    const { enemy: e } = spawnedEnemy("shooter");
    expect(e.resistances).toEqual({ fire: 0.1, lightning: 0.45 });
    expect(e.defense).toBe(30);
    expect("tough" in e).toBe(false);
    expect(Object.keys(e)).toEqual(expectedKeys("shooter"));
  });

  it("D1-03 bomber 保留护甲与火抗，不物化 tough", () => {
    const { enemy: e } = spawnedEnemy("bomber");
    expect(e.resistances).toEqual({ fire: 0.55 });
    expect(e.defense).toBe(18);
    expect("tough" in e).toBe(false);
    expect(Object.keys(e)).toEqual(expectedKeys("bomber"));
  });

  it("D1-04 slime/bat 保留配置防御与快照", () => {
    for (const kind of ["slime", "bat"] as const) {
      const { enemy: e } = spawnedEnemy(kind);
      expect(e.defense).toBe(EXPECTED_DEFENSE[kind].defense);
      expect(e.resistances).toEqual(EXPECTED_DEFENSE[kind].resistances);
      expect("tough" in e).toBe(false);
      expect(Object.keys(e)).toEqual(expectedKeys(kind));
      const stats = getEnemyCombatStats(e);
      expect(stats.defense).toBe(EXPECTED_DEFENSE[kind].defense);
      expect(stats.resistances).toEqual(EXPECTED_DEFENSE[kind].resistances);
      expect(stats.tough).toBe(0);
    }
  });

  it("D1-05 五类敌人的精英防御属性与普通形态一致", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    for (const kind of ENEMY_KINDS) {
      const normalCore = fresh();
      normalCore.spawnEnemy(kind);
      const normal = normalCore.enemies.at(-1)!;
      const eliteCore = fresh();
      eliteCore.spawnEnemy(kind, true);
      const elite = eliteCore.enemies.at(-1)!;

      expect(pickDeclaredDefense(elite)).toEqual(pickDeclaredDefense(normal));
      expect(elite.hp).toBe(normal.hp * 7);
      expect(elite.dmg).toBe(normal.dmg * 1.6);
      expect(elite.r).toBe(ETYPES[kind].r * 1.8);
      expect(elite.speed).toBe(ETYPES[kind].speed * 0.8 * (0.9 + 0.5 * 0.2));
      expect(Object.keys(elite)).toEqual(expectedKeys(kind));
    }
  });

  it("D1-06 brute 物理伤害按护甲结算为 5", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.99);
    const { core, enemy: e } = spawnedEnemy("brute");
    e.hp = e.maxhp = 999;
    const result = core.hurtEnemy(e, 11, 0, 0, {
      noCrit: true,
      noChain: true,
      type: "physical",
      form: "ranged",
    });
    expect(result?.settledDamage).toBe(5);
    expect(e.hp).toBe(994);
  });

  it("D1-07 brute 火、雷、真实伤害不受物理护甲影响", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.99);
    for (const type of ["fire", "lightning", "true"] as const) {
      const { core, enemy: e } = spawnedEnemy("brute");
      e.hp = e.maxhp = 999;
      const result = core.hurtEnemy(e, 11, 0, 0, {
        noCrit: true,
        noChain: true,
        type,
      });
      expect(result?.settledDamage).toBe(11);
      expect(e.hp).toBe(988);
    }
  });

  it("D1-08 shooter 雷抗和护甲分别减伤", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.99);
    const lightning = spawnedEnemy("shooter");
    lightning.enemy.hp = lightning.enemy.maxhp = 999;
    expect(
      lightning.core.hurtEnemy(lightning.enemy, 10, 0, 0, {
        noCrit: true,
        noChain: true,
        type: "lightning",
      })?.settledDamage,
    ).toBe(6);
    const physical = spawnedEnemy("shooter");
    physical.enemy.hp = physical.enemy.maxhp = 999;
    expect(
      physical.core.hurtEnemy(physical.enemy, 10, 0, 0, {
        noCrit: true,
        noChain: true,
        type: "physical",
      })?.settledDamage,
    ).toBe(6);
  });

  it("D1-09 bomber 火抗减伤而真实伤害全额通过", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.99);
    const fire = spawnedEnemy("bomber");
    fire.enemy.hp = fire.enemy.maxhp = 999;
    expect(
      fire.core.hurtEnemy(fire.enemy, 10, 0, 0, {
        noCrit: true,
        noChain: true,
        type: "fire",
      })?.settledDamage,
    ).toBe(5);
    const truth = spawnedEnemy("bomber");
    truth.enemy.hp = truth.enemy.maxhp = 999;
    expect(
      truth.core.hurtEnemy(truth.enemy, 10, 0, 0, {
        noCrit: true,
        noChain: true,
        type: "true",
      })?.settledDamage,
    ).toBe(10);
  });

  it("D1-10 分开结算伤害与实际 HP 损失，抗性上限仍只在消费点裁剪", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.99);
    const surviving = spawnedEnemy("shooter");
    surviving.enemy.hp = surviving.enemy.maxhp = 999;
    const nonlethal = surviving.core.hurtEnemy(surviving.enemy, 100, 0, 0, {
      noCrit: true,
      noChain: true,
      type: "lightning",
    });
    expect(nonlethal?.settledDamage).toBe(55);
    expect(nonlethal?.effectiveHpLoss).toBe(55);
    expect(surviving.enemy.hp).toBe(944);
    expect(nonlethal?.lethal).toBe(false);

    const overkill = spawnedEnemy("shooter");
    overkill.enemy.hp = overkill.enemy.maxhp = 10;
    const lethal = overkill.core.hurtEnemy(overkill.enemy, 100, 0, 0, {
      noCrit: true,
      noChain: true,
      type: "lightning",
    });
    expect(lethal?.settledDamage).toBe(55);
    expect(lethal?.effectiveHpLoss).toBe(10);
    expect(overkill.enemy.hp).toBe(-45);
    expect(lethal?.lethal).toBe(true);
    expect(lethal?.killed).toBe(true);

    const cfg = ETYPES.shooter;
    injectConfigField(
      cfg,
      "resistances",
      { lightning: 0.9 },
      () => {
        expect(resolveEnemyDefense(cfg).resistances).toEqual({ lightning: 0.9 });
        const capped = spawnedEnemy("shooter");
        capped.enemy.hp = capped.enemy.maxhp = 999;
        expect(capped.enemy.resistances?.lightning).toBe(0.9);
        expect(
          capped.core.hurtEnemy(capped.enemy, 100, 0, 0, {
            noCrit: true,
            noChain: true,
            type: "lightning",
          })?.settledDamage,
        ).toBe(25);
      },
    );
  });

  it("D1-11 已构造快照不受实体抗性映射原地改写影响", () => {
    const { enemy: e } = spawnedEnemy("bomber");
    const snapshot = getEnemyCombatStats(e);
    e.resistances!.fire = 0.9;
    expect(e.resistances).toEqual({ fire: 0.9 });
    expect(snapshot.resistances).toEqual({ fire: 0.55 });
    expect(snapshot.resistances).not.toBe(e.resistances);
  });

  it("D1-12 配置、实体和快照的抗性映射互不共享引用", () => {
    const cfg = ETYPES.bomber;
    const original = cfg.resistances;
    const originalFire = original?.fire;
    try {
      const { enemy: e } = spawnedEnemy("bomber");
      const snapshot = getEnemyCombatStats(e);
      expect(e.resistances).not.toBe(cfg.resistances);
      expect(snapshot.resistances).not.toBe(e.resistances);
      expect(snapshot.resistances).not.toBe(cfg.resistances);

      e.resistances!.fire = 0.9;
      expect(cfg.resistances?.fire).toBe(0.55);
      expect(snapshot.resistances.fire).toBe(0.55);

      cfg.resistances!.fire = 0.6;
      expect(e.resistances!.fire).toBe(0.9);
      expect(snapshot.resistances.fire).toBe(0.55);

      snapshot.resistances.fire = 0.2;
      expect(e.resistances!.fire).toBe(0.9);
      expect(cfg.resistances!.fire).toBe(0.6);
    } finally {
      cfg.resistances = original;
      if (original && originalFire !== undefined) original.fire = originalFire;
    }
  });

  it("D1-13 权威解析、独立字面量、真实实体与快照三方逐位一致", () => {
    for (const kind of ENEMY_KINDS) {
      const cfg = ETYPES[kind];
      const sheet = enemyDefenseSheet(cfg);
      expect(sheet.base.defense).toBe(EXPECTED_DEFENSE[kind].defense);
      expect(sheet.base.tough).toBe(EXPECTED_DEFENSE[kind].tough);

      const authority = resolveEnemyDefense(cfg);
      expect(authority).toEqual(EXPECTED_DEFENSE[kind]);
      const { enemy: e } = spawnedEnemy(kind);
      expect(pickDeclaredDefense(e)).toEqual(EXPECTED_DEFENSE[kind]);
      expect(pickDeclaredDefense(getEnemyCombatStats(e))).toEqual({
        defense: EXPECTED_DEFENSE[kind].defense ?? 0,
        resistances: EXPECTED_DEFENSE[kind].resistances ?? {},
        tough: EXPECTED_DEFENSE[kind].tough ?? 0,
      });

      expect(enemyShadowFromEntity(e)).toEqual(enemyShadowFromConfig(cfg));
      expect(enemyShadowFromEntity(e)).toEqual({
        defense: EXPECTED_DEFENSE[kind].defense ?? 0,
        resistances: EXPECTED_DEFENSE[kind].resistances ?? {},
        tough: EXPECTED_DEFENSE[kind].tough ?? 0,
      });
      expect(Object.keys(e)).toEqual(expectedKeys(kind));
    }
  });

  it("D1-14 强制/自然抽取和位置重试的 RNG 次数保持冻结", () => {
    const cases: {
      forceType: boolean;
      corner: boolean;
      values: number[];
      calls: number;
    }[] = [
      { forceType: true, corner: false, values: [0, 0.5, 0.5, 0.5], calls: 4 },
      {
        forceType: true,
        corner: true,
        values: [0.625, 0.625, 0.625, 0.625, 0.625, 0.5, 0.5, 0.5],
        calls: 8,
      },
      { forceType: false, corner: false, values: [0, 0, 0.5, 0.5, 0.5], calls: 5 },
      {
        forceType: false,
        corner: true,
        values: [0, 0.625, 0, 0.5, 0.5, 0.5],
        calls: 6,
      },
      {
        forceType: false,
        corner: true,
        values: [0, 0.625, 0.625, 0.625, 0.625, 0.625, 0.5, 0.5, 0.5],
        calls: 9,
      },
    ];

    for (const scenario of cases) {
      const core = fresh();
      if (scenario.corner) {
        core.player.x = 30;
        core.player.y = 30;
      }
      let index = 0;
      const random = vi.spyOn(Math, "random").mockImplementation(() => {
        const value = scenario.values[index];
        if (value === undefined) throw new Error("unexpected RNG call");
        index += 1;
        return value;
      });
      try {
        core.spawnEnemy(scenario.forceType ? "slime" : undefined);
        expect(random).toHaveBeenCalledTimes(scenario.calls);
        expect(index).toBe(scenario.calls);
      } finally {
        random.mockRestore();
      }
    }
  });

  it("D1-15 tough 经权威解析进入实体和快照，物理减伤但 true 无视", () => {
    for (const kind of ENEMY_KINDS) {
      expect("tough" in ETYPES[kind]).toBe(false);
    }

    const cfg = ETYPES.slime;
    injectConfigField(cfg, "tough", 0.2, () => {
      vi.spyOn(Math, "random").mockReturnValue(0.99);
      const physical = spawnedEnemy("slime");
      const truth = spawnedEnemy("slime");
      physical.enemy.hp = physical.enemy.maxhp = 999;
      truth.enemy.hp = truth.enemy.maxhp = 999;

      expect(physical.enemy.tough).toBe(0.2);
      expect(truth.enemy.tough).toBe(0.2);
      expect(getEnemyCombatStats(physical.enemy).tough).toBe(0.2);
      expect(getEnemyCombatStats(truth.enemy).tough).toBe(0.2);

      const physicalHit = physical.core.hurtEnemy(physical.enemy, 100, 0, 0, {
        noCrit: true,
        noChain: true,
        type: "physical",
      });
      const trueHit = truth.core.hurtEnemy(truth.enemy, 100, 0, 0, {
        noCrit: true,
        noChain: true,
        type: "true",
      });
      expect(physicalHit?.settledDamage).toBe(53);
      expect(physical.enemy.hp).toBe(946);
      expect(trueHit?.settledDamage).toBe(100);
      expect(truth.enemy.hp).toBe(899);
      expect(physical.enemy.dead).not.toBe(true);
      expect(truth.enemy.dead).not.toBe(true);
    });

    const neutral = spawnedEnemy("slime");
    neutral.enemy.hp = neutral.enemy.maxhp = 999;
    expect("tough" in neutral.enemy).toBe(false);
    expect(
      neutral.core.hurtEnemy(neutral.enemy, 100, 0, 0, {
        noCrit: true,
        noChain: true,
        type: "physical",
      })?.settledDamage,
    ).toBe(67);
  });

  it("D1-16 攻击侧四映射不进入防御接口，既有原样浅拷贝保持不变", () => {
    type AttackStatKeys =
      | "globalDamageBonus"
      | "typeDamageBonus"
      | "formDamageBonus"
      | "skillDamageBonus";
    const defenseInterfaceHasNoAttackStats: [
      Extract<keyof EnemyDefenseStats, AttackStatKeys>,
    ] extends [never]
      ? true
      : false = true;
    expect(defenseInterfaceHasNoAttackStats).toBe(true);

    for (const kind of ENEMY_KINDS) {
      expect("globalDamageBonus" in ETYPES[kind]).toBe(false);
      expect("typeDamageBonus" in ETYPES[kind]).toBe(false);
      expect("formDamageBonus" in ETYPES[kind]).toBe(false);
      expect("skillDamageBonus" in ETYPES[kind]).toBe(false);

      const { enemy: e } = spawnedEnemy(kind);
      expect("globalDamageBonus" in e).toBe(false);
      expect("typeDamageBonus" in e).toBe(false);
      expect("formDamageBonus" in e).toBe(false);
      expect("skillDamageBonus" in e).toBe(false);
      const stats = getEnemyCombatStats(e);
      expect(stats.globalDamageBonus).toBe(0);
      expect(stats.typeDamageBonus).toEqual({});
      expect(stats.formDamageBonus).toEqual({});
      expect(stats.skillDamageBonus).toBeUndefined();
      expect("formDamageBonus" in resolveEnemyDefense(ETYPES[kind])).toBe(false);
    }

    const cfg = ETYPES.slime;
    injectConfigField(cfg, "formDamageBonus", { melee: 0.5 }, () => {
      const { enemy: e } = spawnedEnemy("slime");
      expect(e.formDamageBonus).toEqual({ melee: 0.5 });
      expect(e.formDamageBonus).not.toBe(cfg.formDamageBonus);
      expect(getEnemyCombatStats(e).formDamageBonus).toEqual({ melee: 0.5 });
    });
  });

  it("D1-Q1 负 defense、tough 或任意 resistance 在权威边界抛 RangeError", () => {
    const brute = ETYPES.brute;
    const originalDefense = brute.defense;
    try {
      brute.defense = -1;
      expect(() => resolveEnemyDefense(brute)).toThrow(RangeError);
    } finally {
      if (originalDefense === undefined) delete brute.defense;
      else brute.defense = originalDefense;
    }

    const slime = ETYPES.slime;
    const originalTough = slime.tough;
    try {
      slime.tough = -0.1;
      expect(() => resolveEnemyDefense(slime)).toThrow(RangeError);
    } finally {
      if (originalTough === undefined) delete slime.tough;
      else slime.tough = originalTough;
    }

    const shooter = ETYPES.shooter;
    const originalResistances = shooter.resistances;
    try {
      shooter.resistances = { lightning: -0.1 };
      expect(() => resolveEnemyDefense(shooter)).toThrow(RangeError);
    } finally {
      shooter.resistances = originalResistances;
    }
  });

  it("D1-P2 显式声明的非法抗性值经真实生成入口抛 TypeError", () => {
    const cfg = ETYPES.slime;
    const original = cfg.resistances;
    const invalidValues: readonly unknown[] = [
      undefined,
      null,
      Number.NaN,
      Number.POSITIVE_INFINITY,
      Number.NEGATIVE_INFINITY,
      "0.3",
    ];
    try {
      for (const value of invalidValues) {
        const malformed = { fire: value };
        const shallowCopy = { ...malformed };
        expect(Object.hasOwn(shallowCopy, "fire")).toBe(true);
        if (value === undefined) {
          expect(shallowCopy).toEqual({ fire: undefined });
          expect(JSON.stringify(shallowCopy)).toBe("{}");
        }

        cfg.resistances = malformed as unknown as EnemyConfig["resistances"];
        const core = fresh();
        expect(() => core.spawnEnemy("slime")).toThrow(TypeError);
        expect(core.enemies).toHaveLength(0);
      }
    } finally {
      cfg.resistances = original;
    }
  });

  it("D1-P2 有效零抗性经真实生成入口保持显式键和值", () => {
    const cfg = ETYPES.slime;
    const original = cfg.resistances;
    try {
      cfg.resistances = { fire: 0 };
      const core = fresh();
      core.spawnEnemy("slime");
      const e = core.enemies.at(-1)!;
      expect(Object.hasOwn(e.resistances ?? {}, "fire")).toBe(true);
      expect(e.resistances?.fire).toBe(0);
      expect(getEnemyCombatStats(e).resistances.fire).toBe(0);
      expect(JSON.stringify(e.resistances)).toBe('{"fire":0}');
    } finally {
      cfg.resistances = original;
    }
  });

  it("D1-P3 真实 spawnEnemy 拒绝负防御且不留下半成品敌人", () => {
    const cfg = ETYPES.brute;
    const original = cfg.defense;
    try {
      cfg.defense = -1;
      const core = fresh();
      expect(() => core.spawnEnemy("brute")).toThrow(RangeError);
      expect(core.enemies).toHaveLength(0);
    } finally {
      if (original === undefined) delete cfg.defense;
      else cfg.defense = original;
    }
  });

  it("D1-Q2 来源保留超上限抗性/tough，伤害消费点仍按原上限裁剪", () => {
    const cfg = ETYPES.slime;
    const originalResistances = cfg.resistances;
    const originalTough = cfg.tough;
    try {
      cfg.resistances = { fire: 0.9 };
      cfg.tough = 0.8;
      expect(resolveEnemyDefense(cfg)).toEqual({
        defense: 25,
        resistances: { fire: 0.9 },
        tough: 0.8,
      });

      vi.spyOn(Math, "random").mockReturnValue(0.99);
      const core = fresh();
      core.spawnEnemy("slime");
      const e = core.enemies.at(-1)!;
      e.hp = e.maxhp = 999;
      expect(e.resistances?.fire).toBe(0.9);
      expect(e.tough).toBe(0.8);
      expect(getEnemyCombatStats(e).resistances).toEqual({ fire: 0.9 });
      expect(getEnemyCombatStats(e).tough).toBe(0.8);

      expect(
        core.hurtEnemy(e, 100, 0, 0, {
          noCrit: true,
          noChain: true,
          type: "fire",
        })?.settledDamage,
      ).toBe(10);
      expect(
        core.hurtEnemy(e, 100, 0, 0, {
          noCrit: true,
          noChain: true,
          type: "physical",
        })?.settledDamage,
      ).toBe(27);
      expect(
        core.hurtEnemy(e, 100, 0, 0, {
          noCrit: true,
          noChain: true,
          type: "true",
        })?.settledDamage,
      ).toBe(100);
    } finally {
      cfg.resistances = originalResistances;
      if (originalTough === undefined) delete cfg.tough;
      else cfg.tough = originalTough;
    }
  });
});
