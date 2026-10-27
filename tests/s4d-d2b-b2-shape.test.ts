import { expect, it, vi } from "vitest";
import { getEnemyCombatStats } from "../src/game/core/CombatStats";
import { resolveEnemyAttackBonuses } from "../src/game/core/EnemyStatSources";
import { ETYPES } from "../src/game/data/enemies";
import { fresh } from "./helpers";

it("preserves optional shape for five enemy types and both elite states", () => {
  const fields = ["globalDamageBonus", "typeDamageBonus", "formDamageBonus", "skillDamageBonus", "dead", "kx", "ky"];
  for (const kind of ["slime", "bat", "brute", "shooter", "bomber"]) {
    for (const elite of [false, true]) {
      const g = fresh(); g.spawnEnemy(kind, elite);
      for (const field of fields) expect(Object.hasOwn(g.enemies[0], field)).toBe(false);
    }
  }
});

it("preserves explicit undefined, empty maps and symbol keys through spawn and snapshot", () => {
  const fields = ["globalDamageBonus", "typeDamageBonus", "formDamageBonus", "skillDamageBonus"] as const;
  const original = Object.getOwnPropertyDescriptors(ETYPES.slime);
  const symbol = Symbol("bonus");
  try {
    for (const field of fields) Object.defineProperty(ETYPES.slime, field, { value: undefined, configurable: true, writable: true, enumerable: true });
    const first = fresh(); first.spawnEnemy("slime");
    for (const field of fields) expect(Object.hasOwn(first.enemies[0], field)).toBe(false);
    const source = { [symbol]: -0 };
    ETYPES.slime.typeDamageBonus = {};
    ETYPES.slime.formDamageBonus = {};
    ETYPES.slime.skillDamageBonus = source;
    const second = fresh(); second.spawnEnemy("slime");
    const enemy = second.enemies[0]; const snapshot = getEnemyCombatStats(enemy);
    expect(Object.hasOwn(enemy, "globalDamageBonus")).toBe(false);
    expect(Reflect.ownKeys(enemy.typeDamageBonus!)).toEqual([]);
    expect(Reflect.ownKeys(enemy.formDamageBonus!)).toEqual([]);
    expect(Reflect.ownKeys(enemy.skillDamageBonus!)).toEqual([symbol]);
    expect(Reflect.ownKeys(snapshot.skillDamageBonus!)).toEqual([symbol]);
    expect(Object.is(Reflect.get(snapshot.skillDamageBonus!, symbol), -0)).toBe(true);
    expect(enemy.skillDamageBonus).not.toBe(source);
    expect(snapshot.skillDamageBonus).not.toBe(enemy.skillDamageBonus);
    Reflect.set(source, symbol, 1);
    expect(Object.is(Reflect.get(enemy.skillDamageBonus!, symbol), -0)).toBe(true);
    Reflect.set(enemy.skillDamageBonus!, symbol, 2);
    expect(Object.is(Reflect.get(snapshot.skillDamageBonus!, symbol), -0)).toBe(true);
  } finally {
    for (const field of fields) {
      const descriptor = original[field];
      if (descriptor) Object.defineProperty(ETYPES.slime, field, descriptor);
      else Reflect.deleteProperty(ETYPES.slime, field);
    }
  }
});

it("attack source resolution consumes no randomness", () => {
  const random = vi.spyOn(Math, "random");
  try {
    resolveEnemyAttackBonuses({ ...ETYPES.slime, globalDamageBonus: -1.1, typeDamageBonus: { physical: 0.2 }, formDamageBonus: { melee: -0 }, skillDamageBonus: { x: -0.5 } });
    expect(random).not.toHaveBeenCalled();
  } finally { random.mockRestore(); }
});

it("replays natural spawn RNG through retry, jitter, seed and cooldown", () => {
  const values = [0.625, 0.6, 0.125, 0.25, 0.4, 0.8];
  let index = 0;
  const random = vi.spyOn(Math, "random").mockImplementation(() => {
    if (index >= values.length) throw new Error("unexpected RNG draw");
    return values[index++];
  });
  try {
    const g = fresh(); g.player.x = 30; g.player.y = 30; g.spawnEnemy();
    const enemy = g.enemies[0];
    expect(index).toBe(6);
    expect(enemy.type).toBe("slime");
    expect(enemy.x).toBe(242.13203435596427);
    expect(enemy.y).toBe(242.13203435596424);
    expect(enemy.speed).toBe(30 * (0.9 + 0.25 * 0.2));
    expect(enemy.seed).toBe(4);
    expect(enemy.shootCd).toBe(1 + 0.8 * 1.5);
  } finally { random.mockRestore(); }
});
