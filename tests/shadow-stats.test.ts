import { describe, expect, it } from "vitest";
import { fresh, talent } from "./helpers";
import {
  getEnemyCombatStats,
  getPlayerCombatStats,
} from "../src/game/core/CombatStats";
import { critMultiplier } from "../src/game/core/DamageMath";
import {
  enemyShadowFromConfig,
  enemyShadowFromEntity,
  playerShadowFromEntity,
  playerShadowFromPicks,
  resolveKeyedMap,
} from "../src/game/core/StatSheets";
import { ETYPES } from "../src/game/data/enemies";
import type { GameCore } from "../src/game/core/GameCore";

/**
 * S4-B shadow 对照：来源 B（picks/怪物配置独立推导）与来源 A（实体值构造）
 * 都必须与权威快照（recompute 重放 + CombatStats 适配器）逐位一致。
 * 旧快照是唯一权威——shadow 只比较、不结算（任务书 §4-S4-B）。
 * 来源表值与 talent.f 无引用关系：权威实现的数值漂移会让本套件变红。
 */
function learnOrder(g: GameCore, names: string[]) {
  for (const n of names) g.learnTalent(talent(n));
}

describe("S4-B shadow · 来源 B（picks 独立推导）vs 权威重放", () => {
  it("零来源玩家：两路都等于 statBase 基线（defense 0 / crit 0.05 / 暴伤 2 / 空映射）", () => {
    const g = fresh();
    const a = playerShadowFromEntity(g.player);
    const b = playerShadowFromPicks([]);
    const auth = getPlayerCombatStats(g.player);
    expect(a).toEqual(b);
    expect(b.defense).toBe(0);
    expect(b.tough).toBe(0);
    expect(b.critChance).toBe(auth.critChance);
    expect(b.critMultiplier).toBe(auth.critMultiplier);
    expect(b.typeDamageBonus).toEqual({});
  });

  it("磐石×3：独立推导 defense = 45，与 recompute 重放逐位一致", () => {
    const g = fresh();
    learnOrder(g, ["磐石", "磐石", "磐石"]);
    const shadow = playerShadowFromPicks(g.player.picks);
    expect(shadow.defense).toBe(g.player.defense);
    expect(shadow.defense).toBe(45);
    expect(shadow.defense).toBe(getPlayerCombatStats(g.player).defense);
  });

  it("铁布衫×4：tough 逐位一致（base 起始顺序累加；0.6 上限在消费点，不在模型）", () => {
    const g = fresh();
    learnOrder(g, ["铁布衫", "铁布衫", "铁布衫", "铁布衫"]);
    const shadow = playerShadowFromPicks(g.player.picks);
    expect(shadow.tough).toBe(g.player.tough);
    expect(shadow.tough).toBe(0.4);
  });

  it("致命一击×8：暴击率逐位一致 + 觉醒暴伤 2→2.4（一次性 flat）", () => {
    const g = fresh();
    learnOrder(g, Array(8).fill("致命一击"));
    const shadow = playerShadowFromPicks(g.player.picks);
    expect(shadow.critChance).toBe(g.player.crit);
    expect(shadow.critMultiplier).toBe(critMultiplier(g.player));
    expect(shadow.critMultiplier).toBe(2.4);
  });

  it("致命一击×7：未觉醒，暴伤两侧同为 2（条件来源独立判定）", () => {
    const g = fresh();
    learnOrder(g, Array(7).fill("致命一击"));
    const shadow = playerShadowFromPicks(g.player.picks);
    expect(shadow.critChance).toBe(g.player.crit);
    expect(shadow.critMultiplier).toBe(critMultiplier(g.player));
    expect(shadow.critMultiplier).toBe(2);
  });

  it("会心深渊×1：暴伤 2→2.5，与权威 critMultiplier 逐位一致", () => {
    const g = fresh();
    learnOrder(g, ["会心深渊"]);
    const shadow = playerShadowFromPicks(g.player.picks);
    expect(shadow.critMultiplier).toBe(g.player.critMul);
    expect(shadow.critMultiplier).toBe(critMultiplier(g.player));
    expect(shadow.critMultiplier).toBe(2.5);
  });

  it("会心深渊×4（满级）：暴伤 4.0，与权威逐位一致", () => {
    const g = fresh();
    learnOrder(g, Array(4).fill("会心深渊"));
    const shadow = playerShadowFromPicks(g.player.picks);
    expect(shadow.critMultiplier).toBe(g.player.critMul);
    expect(shadow.critMultiplier).toBe(critMultiplier(g.player));
    expect(shadow.critMultiplier).toBe(4);
  });

  it("会心深渊×2 + 致命一击×8 觉醒：3.4（2 + 1.0 + 0.4），两种 pick 顺序都逐位一致", () => {
    for (const order of [
      [...Array(8).fill("致命一击"), "会心深渊", "会心深渊"],
      ["会心深渊", ...Array(8).fill("致命一击"), "会心深渊"],
    ]) {
      const g = fresh();
      learnOrder(g, order);
      const shadow = playerShadowFromPicks(g.player.picks);
      expect(shadow.critChance).toBe(g.player.crit);
      expect(shadow.critMultiplier).toBe(g.player.critMul + 0.4);
      expect(shadow.critMultiplier).toBe(critMultiplier(g.player));
      expect(shadow.critMultiplier).toBe(3.4);
    }
  });

  it("元素亲和×3：火/雷 typeDamageBonus 与快照逐位一致（含 0.30000000000000004 浮点尾）", () => {
    const g = fresh();
    learnOrder(g, ["元素亲和", "元素亲和", "元素亲和"]);
    const shadow = playerShadowFromPicks(g.player.picks);
    expect(shadow.typeDamageBonus.fire).toBe(g.player.typeDamageBonus?.fire);
    expect(shadow.typeDamageBonus.lightning).toBe(
      g.player.typeDamageBonus?.lightning,
    );
    expect(shadow.typeDamageBonus.fire).toBe(
      getPlayerCombatStats(g.player).typeDamageBonus.fire,
    );
  });

  it("混合顺序：learn 顺序即 picks 顺序，五字段同时逐位一致", () => {
    const order = [
      "磐石",
      "元素亲和",
      "磐石",
      "铁布衫",
      "元素亲和",
      "致命一击",
      "磐石",
    ];
    const g = fresh();
    learnOrder(g, order);
    const shadow = playerShadowFromPicks(g.player.picks);
    expect(shadow.defense).toBe(g.player.defense);
    expect(shadow.tough).toBe(g.player.tough);
    expect(shadow.critChance).toBe(g.player.crit);
    expect(shadow.critMultiplier).toBe(critMultiplier(g.player));
    expect(shadow.typeDamageBonus.fire).toBe(g.player.typeDamageBonus?.fire);
    expect(shadow.typeDamageBonus.lightning).toBe(
      g.player.typeDamageBonus?.lightning,
    );
  });
});

describe("S4-B shadow · 来源 A（实体值构造）接口兼容", () => {
  it("实体值恒等穿过解析管线，与权威快照五字段一致", () => {
    const g = fresh();
    learnOrder(g, ["磐石", "元素亲和", "致命一击", "致命一击", "铁布衫"]);
    const shadow = playerShadowFromEntity(g.player);
    const auth = getPlayerCombatStats(g.player);
    expect(shadow.defense).toBe(auth.defense);
    expect(shadow.tough).toBe(auth.tough);
    expect(shadow.critChance).toBe(auth.critChance);
    expect(shadow.critMultiplier).toBe(auth.critMultiplier);
    expect(shadow.typeDamageBonus).toEqual(auth.typeDamageBonus);
  });

  it("返回新对象：修改 shadow 映射不影响实体（无持久缓存/别名）", () => {
    const g = fresh();
    learnOrder(g, ["元素亲和"]);
    const shadow = playerShadowFromEntity(g.player);
    expect(shadow.typeDamageBonus).not.toBe(g.player.typeDamageBonus);
    shadow.typeDamageBonus.fire = 999;
    expect(g.player.typeDamageBonus?.fire).toBe(0.1);
  });

  it("构建器不改写任何输入（纯函数契约）", () => {
    const g = fresh();
    learnOrder(g, ["磐石", "元素亲和"]);
    const before = JSON.stringify(g.player);
    playerShadowFromEntity(g.player);
    playerShadowFromPicks(g.player.picks);
    expect(JSON.stringify(g.player)).toBe(before);
  });
});

describe("S4-B shadow · 敌人护甲与抗性（方案甲，权威=getEnemyCombatStats）", () => {
  it("brute/shooter/bomber：配置推导（来源 B）与生成实体（来源 A）都逐位一致", () => {
    for (const kind of ["brute", "shooter", "bomber"] as const) {
      const g = fresh();
      g.spawnEnemy(kind);
      const e = g.enemies.at(-1)!;
      const fromConfig = enemyShadowFromConfig(ETYPES[kind]);
      const fromEntity = enemyShadowFromEntity(e);
      const auth = getEnemyCombatStats(e);
      expect(fromConfig.defense).toBe(e.defense ?? 0);
      expect(fromConfig.resistances).toEqual(e.resistances ?? {});
      expect(fromEntity).toEqual(fromConfig);
      expect(fromConfig.defense).toBe(auth.defense);
      expect(fromConfig.resistances).toEqual(auth.resistances);
    }
  });

  it("精英倍率只作用 hp/dmg：三种怪的 elite 生成体甲抗与权威快照一致", () => {
    for (const kind of ["brute", "shooter", "bomber"] as const) {
      const g = fresh();
      g.spawnEnemy(kind, true);
      const e = g.enemies.at(-1)!;
      const fromConfig = enemyShadowFromConfig(ETYPES[kind]);
      const auth = getEnemyCombatStats(e);
      expect(e.elite).toBe(true);
      expect(fromConfig.defense).toBe(auth.defense);
      expect(fromConfig.resistances).toEqual(auth.resistances);
      expect(enemyShadowFromEntity(e)).toEqual(fromConfig);
    }
  });

  it("中性怪（slime/bat）：无甲无抗，权威快照同为 0/空映射", () => {
    for (const kind of ["slime", "bat"] as const) {
      const g = fresh();
      g.spawnEnemy(kind);
      const e = g.enemies.at(-1)!;
      const shadow = enemyShadowFromConfig(ETYPES[kind]);
      const auth = getEnemyCombatStats(e);
      expect(shadow.defense).toBe(0);
      expect(shadow.resistances).toEqual({});
      expect(auth.defense).toBe(0);
      expect(auth.resistances).toEqual({});
      expect(enemyShadowFromEntity(e)).toEqual(shadow);
    }
  });
});

describe("S4-B shadow · resolveKeyedMap 危险原型键（P3）", () => {
  it('base 中的自有 "__proto__" 键（JSON 解析产物）显式拒绝，不静默丢键', () => {
    const base = JSON.parse('{"__proto__": 3, "fire": 0.3}') as Record<
      string,
      number
    >;
    expect(Object.keys(base)).toContain("__proto__");
    expect(() => resolveKeyedMap("resistance", base, [])).toThrow(TypeError);
  });

  it('修饰符 key 为 "__proto__" 显式拒绝', () => {
    expect(() =>
      resolveKeyedMap("resistance", {}, [
        {
          sourceId: "x",
          stat: "resistance",
          stage: "flat",
          value: 0.3,
          key: "__proto__",
        },
      ]),
    ).toThrow(TypeError);
  });

  it('非魔键（如 "constructor"）作为自有数据属性正常工作', () => {
    const out = resolveKeyedMap("resistance", { constructor: 0.2 }, []);
    expect(out.constructor).toBe(0.2);
    expect(Object.prototype.hasOwnProperty.call(out, "constructor")).toBe(true);
  });
});
