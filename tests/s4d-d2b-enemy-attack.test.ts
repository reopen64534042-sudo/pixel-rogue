import { afterEach, describe, expect, it, vi } from "vitest";
import { getEnemyCombatStats } from "../src/game/core/CombatStats";
import { calculateDamage } from "../src/game/core/DamageSystem";
import { resolveEnemyAttackBonuses } from "../src/game/core/EnemyStatSources";
import { updateEnemies } from "../src/game/core/EnemySystem";
import { resolveKeyedMap } from "../src/game/core/StatKeyedMap";
import type { EnemyConfig } from "../src/game/core/types";
import { DAMAGE_TYPES } from "../src/game/data/damageTypes";
import { ETYPES } from "../src/game/data/enemies";
import { fresh } from "./helpers";

afterEach(() => vi.restoreAllMocks());
const cfg = (fields: object): EnemyConfig => ({ ...ETYPES.slime, ...fields });

describe("S4-D2-B enemy attack authority", () => {
  it("routes all four configured bonuses through spawn, snapshot and damage independently", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    const fields = ["globalDamageBonus", "typeDamageBonus", "formDamageBonus", "skillDamageBonus"] as const;
    const original = Object.getOwnPropertyDescriptors(ETYPES.slime);
    const type = { physical: 0.2 };
    const form = { melee: 0.3 };
    const skill = { blade: 0.4 };
    try {
      ETYPES.slime.globalDamageBonus = 0.1;
      ETYPES.slime.typeDamageBonus = type;
      ETYPES.slime.formDamageBonus = form;
      ETYPES.slime.skillDamageBonus = skill;

      const g = fresh();
      g.spawnEnemy("slime");
      const enemy = g.enemies[0];
      const snapshot = getEnemyCombatStats(enemy);
      for (const field of fields) expect(Object.hasOwn(enemy, field)).toBe(true);
      expect(enemy.globalDamageBonus).toBe(0.1);
      expect(snapshot.globalDamageBonus).toBe(0.1);
      expect(Reflect.ownKeys(enemy.typeDamageBonus!)).toEqual(["physical"]);
      expect(Reflect.ownKeys(enemy.formDamageBonus!)).toEqual(["melee"]);
      expect(Reflect.ownKeys(enemy.skillDamageBonus!)).toEqual(["blade"]);
      expect(enemy.typeDamageBonus).toEqual({ physical: 0.2 });
      expect(enemy.formDamageBonus).toEqual({ melee: 0.3 });
      expect(enemy.skillDamageBonus).toEqual({ blade: 0.4 });
      expect(snapshot.typeDamageBonus).toEqual({ physical: 0.2 });
      expect(snapshot.formDamageBonus).toEqual({ melee: 0.3 });
      expect(snapshot.skillDamageBonus).toEqual({ blade: 0.4 });
      expect(snapshot.attack).toBe(enemy.dmg);

      const request = { rawAmount: 100, type: "physical" as const, form: "melee" as const, skillId: "blade", origin: "test", kind: "hit" as const, precision: "preserve-float" as const, isCritical: false, attackerStats: snapshot, defenderStats: getEnemyCombatStats() };
      expect(calculateDamage(DAMAGE_TYPES, request).settledDamage).toBe((((100 * 1.1) * 1.2) * 1.3) * 1.4);
      expect(calculateDamage(DAMAGE_TYPES, { ...request, attackerStats: { ...snapshot, globalDamageBonus: 0 } }).settledDamage).toBe(((100 * 1.2) * 1.3) * 1.4);
      expect(calculateDamage(DAMAGE_TYPES, { ...request, type: "fire" }).settledDamage).toBe(((100 * 1.1) * 1.3) * 1.4);
      expect(calculateDamage(DAMAGE_TYPES, { ...request, form: "other" }).settledDamage).toBe(((100 * 1.1) * 1.2) * 1.4);
      expect(calculateDamage(DAMAGE_TYPES, { ...request, skillId: "other" }).settledDamage).toBe(((100 * 1.1) * 1.2) * 1.3);

      for (const [configured, entityMap, snapshotMap, key, initial] of [
        [type, enemy.typeDamageBonus!, snapshot.typeDamageBonus, "physical", 0.2],
        [form, enemy.formDamageBonus!, snapshot.formDamageBonus, "melee", 0.3],
        [skill, enemy.skillDamageBonus!, snapshot.skillDamageBonus!, "blade", 0.4],
      ] as const) {
        expect(configured).not.toBe(entityMap);
        expect(entityMap).not.toBe(snapshotMap);
        expect(configured).not.toBe(snapshotMap);
        Reflect.set(configured, key, 0.6);
        expect(Reflect.get(entityMap, key)).toBe(initial);
        expect(Reflect.get(snapshotMap, key)).toBe(initial);
        Reflect.set(entityMap, key, 0.7);
        expect(Reflect.get(configured, key)).toBe(0.6);
        expect(Reflect.get(snapshotMap, key)).toBe(initial);
        Reflect.set(snapshotMap, key, 0.8);
        expect(Reflect.get(configured, key)).toBe(0.6);
        expect(Reflect.get(entityMap, key)).toBe(0.7);
      }
    } finally {
      for (const field of fields) {
        const descriptor = original[field];
        if (descriptor) Object.defineProperty(ETYPES.slime, field, descriptor);
        else Reflect.deleteProperty(ETYPES.slime, field);
      }
    }
  });

  it.each([0.5, -0.5, 0, -0, -1, -1.1])("preserves all four values and key shape: %s", (value) => {
    const input = cfg({ globalDamageBonus: value, typeDamageBonus: { physical: value }, formDamageBonus: { melee: value }, skillDamageBonus: { blade: value } });
    const out = resolveEnemyAttackBonuses(input);
    expect(Object.is(out.globalDamageBonus, value)).toBe(true);
    for (const [map, key] of [[out.typeDamageBonus, "physical"], [out.formDamageBonus, "melee"], [out.skillDamageBonus, "blade"]] as const) {
      expect(Object.hasOwn(map!, key)).toBe(true);
      expect(Object.is(Reflect.get(map!, key), value)).toBe(true);
    }
    expect(Reflect.ownKeys(out)).toEqual(["globalDamageBonus", "typeDamageBonus", "formDamageBonus", "skillDamageBonus"]);
  });

  it("keeps absent fields absent and empty maps distinct", () => {
    expect(Reflect.ownKeys(resolveEnemyAttackBonuses(cfg({})))).toEqual([]);
    const empty = {};
    const out = resolveEnemyAttackBonuses(cfg({ typeDamageBonus: empty, formDamageBonus: empty, skillDamageBonus: empty }));
    for (const map of [out.typeDamageBonus, out.formDamageBonus, out.skillDamageBonus]) {
      expect(Reflect.ownKeys(map!)).toEqual([]);
      expect(map).not.toBe(empty);
      expect(Object.getPrototypeOf(map)).toBe(Object.prototype);
    }
  });

  it.each([NaN, Infinity, -Infinity, "1", null, undefined, Symbol("bad")])("rejects illegal map values including unused keys: %s", (value) => {
    expect(() => resolveEnemyAttackBonuses(cfg({ skillDamageBonus: { unused: value } }))).toThrow(TypeError);
  });
  it.each([null, [], () => 1, 3, "x", false])("rejects illegal map container %#", (value) => {
    expect(() => resolveEnemyAttackBonuses(cfg({ typeDamageBonus: value }))).toThrow(TypeError);
  });
  it.each([NaN, Infinity, -Infinity, "x", null, Symbol("bad")])("rejects illegal global %#", (value) => {
    expect(() => resolveEnemyAttackBonuses(cfg({ globalDamageBonus: value }))).toThrow(TypeError);
  });

  it("preserves own special keys and symbols, rejects __proto__, and keeps generic nullish behavior", () => {
    const symbol = Symbol("bonus");
    const map = { constructor: -0.5, toString: 0.5, [symbol]: -0 };
    const out = resolveEnemyAttackBonuses(cfg({ skillDamageBonus: map })).skillDamageBonus!;
    expect(Reflect.ownKeys(out)).toEqual(Reflect.ownKeys(map));
    expect(Object.hasOwn(out, "constructor")).toBe(true);
    expect(out.constructor).toBe(-0.5);
    expect(Reflect.get(out, "toString")).toBe(0.5);
    expect(Object.is(Reflect.get(out, symbol), -0)).toBe(true);
    expect(out).not.toBe(map);
    const bad = Object.defineProperty({}, "__proto__", { value: 1, enumerable: true });
    expect(() => resolveEnemyAttackBonuses(cfg({ skillDamageBonus: bad }))).toThrow(TypeError);
    const mods = ["constructor", "toString"].map((key) => ({ sourceId: "test", stat: "typeDamageBonus" as const, key, stage: "flat" as const, value: 0.5 }));
    const generic = resolveKeyedMap("typeDamageBonus", {}, mods);
    expect(Object.hasOwn(generic, "constructor")).toBe(true);
    expect(generic.constructor).toBe(0.5);
    expect(Reflect.get(generic, "toString")).toBe(0.5);
    const nullish = { a: undefined, b: null } as unknown as Record<string, number>;
    expect(resolveKeyedMap("resistance", nullish, [])).toEqual({ a: 0, b: 0 });
  });

  it("preserves snapshots and computes four independent zones with an independent formula", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    const symbol = Symbol("isolated");
    const source = { physical: 0.2, [symbol]: 0.6 };
    const original = ETYPES.slime.typeDamageBonus;
    try {
      ETYPES.slime.typeDamageBonus = source;
      const g = fresh(); g.spawnEnemy("slime");
      const e = g.enemies[0];
      e.globalDamageBonus = 0.1; e.formDamageBonus = { melee: 0.3 }; e.skillDamageBonus = { blade: 0.4 };
      const snap = getEnemyCombatStats(e);
      source.physical = 0.8;
      expect(e.typeDamageBonus!.physical).toBe(0.2);
      e.typeDamageBonus!.physical = 0.9;
      expect(snap.typeDamageBonus.physical).toBe(0.2);
      expect(Reflect.get(snap.typeDamageBonus, symbol)).toBe(0.6);
      const request = { rawAmount: 100, type: "physical" as const, form: "melee" as const, skillId: "blade", origin: "test", kind: "hit" as const, precision: "preserve-float" as const, isCritical: false, attackerStats: snap, defenderStats: getEnemyCombatStats() };
      expect(calculateDamage(DAMAGE_TYPES, request).settledDamage).toBe((((100 * 1.1) * 1.2) * 1.3) * 1.4);
      expect(snap.attack).toBe(e.dmg);
      expect(calculateDamage(DAMAGE_TYPES, { ...request, type: "fire", form: "other", skillId: "other" }).settledDamage).toBe(100 * 1.1);
      snap.typeDamageBonus.physical = -1.1;
      expect(() => calculateDamage(DAMAGE_TYPES, request)).toThrow(RangeError);
      expect(() => calculateDamage(DAMAGE_TYPES, { ...request, type: "fire" })).not.toThrow();
    } finally { if (original === undefined) delete ETYPES.slime.typeDamageBonus; else ETYPES.slime.typeDamageBonus = original; }
  });

  it.each(["global", "type", "form", "skill"] as const)("defers the %s range error until its consumption", (zone) => {
    const g = fresh(); g.spawnEnemy("slime"); const e = g.enemies[0];
    const bonuses = resolveEnemyAttackBonuses(cfg({
      globalDamageBonus: zone === "global" ? -1.1 : 0,
      typeDamageBonus: { physical: zone === "type" ? -1.1 : 0 },
      formDamageBonus: { melee: zone === "form" ? -1.1 : 0 },
      skillDamageBonus: { blade: zone === "skill" ? -1.1 : 0 },
    }));
    Object.assign(e, bonuses);
    const request = { rawAmount: 10, type: "physical" as const, form: "melee" as const, skillId: "blade", origin: "test", kind: "hit" as const, precision: "preserve-float" as const, isCritical: false, attackerStats: getEnemyCombatStats(e), defenderStats: getEnemyCombatStats() };
    expect(() => calculateDamage(DAMAGE_TYPES, request)).toThrow(RangeError);
    if (zone === "type") expect(() => calculateDamage(DAMAGE_TYPES, { ...request, type: "fire" })).not.toThrow();
    if (zone === "form") expect(() => calculateDamage(DAMAGE_TYPES, { ...request, form: "other" })).not.toThrow();
    if (zone === "skill") expect(() => calculateDamage(DAMAGE_TYPES, { ...request, skillId: "other" })).not.toThrow();
  });

  it("reads a proxy field after the RNG draws and propagates its error", () => {
    const events: string[] = [];
    vi.spyOn(Math, "random").mockImplementation(() => { events.push("rng"); return 0.5; });
    const original = Object.getOwnPropertyDescriptor(ETYPES.slime, "typeDamageBonus");
    const marker = new Error("proxy access");
    try {
      Object.defineProperty(ETYPES.slime, "typeDamageBonus", { configurable: true, get() {
        events.push("field");
        return new Proxy({ physical: 0.5 }, { get(_target, key) { events.push(`get:${String(key)}`); throw marker; } });
      } });
      const g = fresh();
      expect(() => g.spawnEnemy("slime")).toThrow(marker);
      expect(events).toEqual(["rng", "rng", "rng", "rng", "field", "get:physical"]);
      expect(g.enemies).toHaveLength(0);
    } finally {
      if (original) Object.defineProperty(ETYPES.slime, "typeDamageBonus", original); else Reflect.deleteProperty(ETYPES.slime, "typeDamageBonus");
    }
  });

  it("resolves after seed/shootCd and stops on the first invalid field without pushing", () => {
    const g = fresh(); const events: string[] = [];
    const random = vi.spyOn(Math, "random").mockImplementation(() => { events.push("random"); return 0.5; });
    const original = Object.getOwnPropertyDescriptors(ETYPES.slime);
    try {
      for (const field of ["globalDamageBonus", "typeDamageBonus", "formDamageBonus", "skillDamageBonus"] as const) {
        Object.defineProperty(ETYPES.slime, field, { configurable: true, get() { events.push(field); return field === "typeDamageBonus" ? { bad: NaN } : field === "globalDamageBonus" ? 0 : { bad: NaN }; } });
      }
      expect(() => g.spawnEnemy("slime")).toThrow(/typeDamageBonus/);
      expect(random).toHaveBeenCalledTimes(4);
      expect(events).toEqual(["random", "random", "random", "random", "globalDamageBonus", "typeDamageBonus"]);
      expect(g.enemies).toHaveLength(0);
    } finally {
      for (const field of ["globalDamageBonus", "typeDamageBonus", "formDamageBonus", "skillDamageBonus"] as const) {
        const descriptor = original[field];
        if (descriptor) Object.defineProperty(ETYPES.slime, field, descriptor); else Reflect.deleteProperty(ETYPES.slime, field);
      }
    }
  });

  it("uses launch, detonation and actual contact snapshots at their existing times", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    const shot = fresh(); shot.spawnEnemy("shooter"); const shooter = shot.enemies[0];
    shooter.x = shot.player.x - 100; shooter.y = shot.player.y; shooter.speed = 0; shooter.shootCd = 0; shooter.globalDamageBonus = 0.2;
    updateEnemies.call(shot, 1 / 60); const bullet = shot.ebullets[0];
    shooter.globalDamageBonus = 0.9; shot.enemies.length = 0;
    bullet.x = shot.player.x; bullet.y = shot.player.y; bullet.vx = bullet.vy = 0; shot.player.hurtCd = 0;
    shot.update(1 / 60); expect(shot.player.hp).toBe(100 - bullet.dmg * 1.2);

    const blast = fresh(); blast.spawnEnemy("bomber"); const bomber = blast.enemies[0];
    bomber.x = blast.player.x; bomber.y = blast.player.y; bomber.speed = 0; bomber.fuse = 0.01; bomber.globalDamageBonus = 0.5;
    updateEnemies.call(blast, 1 / 60); expect(blast.player.hp).toBe(100 - bomber.dmg * 1.5);

    const contact = fresh(); contact.spawnEnemy("slime"); const enemy = contact.enemies[0];
    enemy.x = contact.player.x; enemy.y = contact.player.y; enemy.speed = 0; enemy.globalDamageBonus = 0.25;
    const damage = vi.spyOn(contact, "damagePlayer");
    updateEnemies.call(contact, 1 / 60); expect(contact.player.hp).toBe(100 - enemy.dmg * 1.25);
    contact.player.hurtCd = 0; contact.player.dashT = 0; enemy.x = contact.player.x; enemy.y = contact.player.y; enemy.globalDamageBonus = 0.5;
    updateEnemies.call(contact, 1 / 60); expect(damage).toHaveBeenCalledTimes(2);
    expect(contact.player.hp).toBe(100 - enemy.dmg * 1.25 - enemy.dmg * 1.5);
  });
});
