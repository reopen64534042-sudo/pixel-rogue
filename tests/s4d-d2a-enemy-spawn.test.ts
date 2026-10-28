import { afterEach, describe, expect, it, vi } from "vitest";
import { getEnemyCombatStats } from "../src/game/core/CombatStats";
import { resolveEnemySpawnStats } from "../src/game/core/EnemyStatSources";
import { updateEnemies } from "../src/game/core/EnemySystem";
import { updateProgression } from "../src/game/core/ProgressionSystem";
import { ETYPES } from "../src/game/data/enemies";
import { fresh } from "./helpers";

afterEach(() => vi.restoreAllMocks());

describe("S4-D2-A enemy spawn", () => {
  it("matches the independent current formula for every enemy, wave, elite and level threshold", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.25);
    for (const kind of ["slime", "bat", "brute", "shooter", "bomber"]) {
      const cfg = ETYPES[kind];
      for (const wave of [1, 3, 4, 5, 8, 15, 16]) {
        for (const level of [4, 5, 9, 10, 14, 15, 19, 20, 24, 25]) {
          for (const elite of [false, true]) {
            const g = fresh();
            g.waveN = wave;
            g.player.lvl = level;
            g.spawnEnemy(kind, elite);
            const e = g.enemies.at(-1)!;
            const over = Math.max(0, wave - 15);
            const hpScale = 1 + (wave - 1) * 0.18 + over * over * 0.06;
            const dmgScale = 1 + (wave - 1) * 0.055 + over * over * 0.012;
            const hp = cfg.hp * hpScale * Math.pow(1.03, Math.floor(level / 5)) * (elite ? 7 : 1);
            const dmg = cfg.dmg * dmgScale * (elite ? 1.6 : 1);
            const speed = cfg.speed * (elite ? 0.8 : 1) * (0.9 + 0.25 * 0.2);
            expect(e.hp).toBe(hp);
            expect(e.maxhp).toBe(hp);
            expect(e.dmg).toBe(dmg);
            expect(getEnemyCombatStats(e).attack).toBe(dmg);
            expect(e.speed).toBe(speed);
            expect(e.r).toBe(cfg.r * (elite ? 1.8 : 1));
            expect(e.xp).toBe(elite ? 25 : cfg.xp);
            expect(e.defense).toBe(cfg.defense! + Math.min(24, Math.max(0, wave - 8) * 1.2));
            expect(e.resistances).toEqual(cfg.resistances);
            expect(e.tough).toBe(cfg.tough);
          }
        }
      }
    }
  });

  it("preserves the floating point order and does not draw randomness in the resolver", () => {
    const random = vi.spyOn(Math, "random");
    const result = resolveEnemySpawnStats(ETYPES.brute, { wave: 3, playerLevel: 10, elite: true, speedJitter: 0.95 });
    expect(result.maxHp).toBe(656.4849199999999);
    expect(result.maxHp).not.toBe(65 * ((1 + 2 * 0.18) * Math.pow(1.03, 2) * 7));
    expect(result.moveSpeed).toBe(22 * 0.8 * 0.95);
    expect(30 * 0.8 * 0.95).not.toBe(30 * (0.8 * 0.95));
    expect(random).not.toHaveBeenCalled();
  });

  it.each([
    { forced: false, corner: false, values: [0.625, 0, 0.25, 0.5, 0.75], x: 996, y: 520, speed: 52.25000000000001, seed: 5, cd: 2.125 },
    { forced: true, corner: false, values: [0.625, 0, 0.25, 0.5], x: 483.86796564403573, y: 307.86796564403573, speed: 49.5, seed: 2.5, cd: 1.75 },
    { forced: true, corner: true, values: [0.6, 0.6, 0.6, 0.6, 0.6, 0.5, 0.5, 0.5], x: 30, y: 30, speed: 55, seed: 5, cd: 1.75 },
    { forced: false, corner: true, values: [0.6, 0.6, 0.6, 0.6, 0.6, 0.6, 0.5, 0.5, 0.5], x: 30, y: 30, speed: 55, seed: 5, cd: 1.75 },
    { forced: true, corner: true, values: [0.125, 0.5, 0.5, 0.5], x: 242.13203435596427, y: 242.13203435596424, speed: 55, seed: 5, cd: 1.75 },
    { forced: false, corner: true, values: [0.625, 0.6, 0.125, 0.5, 0.5, 0.5], x: 242.13203435596427, y: 242.13203435596424, speed: 55, seed: 5, cd: 1.75 },
  ])("preserves RNG sequence %#", ({ forced, corner, values, x, y, speed, seed, cd }) => {
    let index = 0;
    const random = vi.spyOn(Math, "random").mockImplementation(() => {
      if (index >= values.length) throw new Error("unexpected random draw");
      return values[index++];
    });
    const g = fresh();
    if (corner) { g.player.x = 30; g.player.y = 30; }
    g.spawnEnemy(forced ? "slime" : undefined);
    const e = g.enemies.at(-1)!;
    expect(random).toHaveBeenCalledTimes(values.length);
    expect([e.type, e.x, e.y, e.speed, e.seed, e.shootCd]).toEqual(["slime", x, y, speed, seed, cd]);
  });

  it("does not restore an injured enemy when another spawns", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.99);
    const g = fresh();
    g.spawnEnemy("brute");
    const e = g.enemies[0];
    g.hurtEnemy(e, 10, 0, 0, { noCrit: true, noChain: true, type: "true", form: "other" });
    const hp = e.hp;
    const maxhp = e.maxhp;
    expect(hp).toBeLessThan(maxhp);
    g.spawnEnemy("slime");
    expect(e.hp).toBe(hp);
    expect(e.maxhp).toBe(maxhp);
  });

  it.each([false, true])("D2-09b: center accepts angle 0.6 on first try (forced=%s)", (forced) => {
    const random = vi.spyOn(Math, "random").mockReturnValue(0.6);
    const g = fresh();
    g.spawnEnemy(forced ? "slime" : undefined);
    const e = g.enemies.at(-1)!;
    expect(random).toHaveBeenCalledTimes(forced ? 4 : 5);
    expect([e.x, e.y]).toEqual([453.2949016875158, 343.6644243122581]);
  });

  it("D2-10: wave 8 naturally selects bat with the frozen random sequence", () => {
    const random = vi.spyOn(Math, "random").mockReturnValue(0.5);
    const g = fresh();
    g.waveN = 8;
    g.spawnEnemy();
    const e = g.enemies.at(-1)!;
    expect(random).toHaveBeenCalledTimes(5);
    expect([e.type, e.hp, e.dmg, e.speed, e.seed, e.shootCd]).toEqual([
      "bat", 29.379999999999995, 11.08, 62, 5, 1.75,
    ]);
  });

  // 怪物数值强化 v1：真实抽取路径覆盖阶段边界、解锁与 RNG 次数。
  it.each([
    [1, [40], ["slime"]],
    [3, [40, 18], ["slime", "bat"]],
    [4, [40, 18, 16], ["slime", "bat", "shooter"]],
    [7, [40, 18, 12, 16], ["slime", "bat", "brute", "shooter"]],
    [8, [35, 20, 15, 18, 12], ["slime", "bat", "brute", "shooter", "bomber"]],
    [14, [35, 20, 15, 18, 12], ["slime", "bat", "brute", "shooter", "bomber"]],
    [15, [28, 22, 15, 22, 13], ["slime", "bat", "brute", "shooter", "bomber"]],
    [24, [28, 22, 15, 22, 13], ["slime", "bat", "brute", "shooter", "bomber"]],
    [25, [25, 22, 18, 22, 13], ["slime", "bat", "brute", "shooter", "bomber"]],
  ])("wave %i uses the authorized unlocked weights", (wave, weights, types) => {
    const total = weights.reduce((sum, weight) => sum + weight, 0);
    let lower = 0;
    for (let i = 0; i < weights.length; i++) {
      const roll = (lower + weights[i] / 2) / total;
      const random = vi.spyOn(Math, "random").mockReturnValueOnce(roll).mockReturnValue(0.5);
      const g = fresh(); g.waveN = wave; g.spawnEnemy();
      expect(g.enemies[0].type).toBe(types[i]);
      expect(random).toHaveBeenCalledTimes(5);
      random.mockRestore();
      lower += weights[i];
    }
  });

  it("bomber snapshots current attack at detonation through the real update path", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.99);
    const g = fresh();
    g.spawnEnemy("bomber");
    const e = g.enemies[0];
    e.x = g.player.x;
    e.y = g.player.y;
    e.speed = 0;
    e.fuse = 0.01;
    e.dmg = 19;
    const damage = vi.spyOn(g, "damagePlayer");
    updateEnemies.call(g, 1 / 60);
    expect(damage).toHaveBeenCalledOnce();
    const [amount, options] = damage.mock.calls[0];
    expect(amount).toBe(19);
    expect(options?.attackerStats?.attack).toBe(19);
    expect(options?.type).toBe("fire");
    expect(e.noDrop).toBe(true);
    expect(e.hp).toBe(0);
  });

  it("contact reads the current entity attack at the real collision", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.99);
    const g = fresh();
    g.spawnEnemy("slime");
    const e = g.enemies[0];
    e.x = g.player.x;
    e.y = g.player.y;
    e.speed = 0;
    e.dmg = 13;
    const damage = vi.spyOn(g, "damagePlayer");
    updateEnemies.call(g, 1 / 60);
    expect(damage).toHaveBeenCalledOnce();
    expect(damage.mock.calls[0][0]).toBe(13);
    expect(damage.mock.calls[0][1]?.src).toBe(e);
    expect(getEnemyCombatStats(e).attack).toBe(13);
  });

  it.each([3, 8, 15])("D2-06 wave %i preserves left association through spawn", (wave) => {
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    const g = fresh();
    g.waveN = wave;
    g.player.lvl = 10;
    g.spawnEnemy("brute", true);
    const scale = 1 + (wave - 1) * 0.18;
    expect(g.enemies[0].hp).toBe(65 * scale * 1.0609 * 7);
    if (wave === 3) expect(g.enemies[0].hp).not.toBe(65 * (scale * 1.0609 * 7));
  });

  it("D2-24 burn resolves 121 frames and clears on frame 122", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.99);
    const g = fresh();
    g.spawnEnemy("slime");
    const e = g.enemies[0];
    e.hp = e.maxhp = 1_000_000;
    e.resistances = {}; // 此测试验证中性持续伤害的计时与累计。
    e.burnT = 2;
    e.burnDps = 10;
    e.burnStacks = 2;
    e.speed = 0;
    g.quota = 0;
    g.spawnCd = 1e9;
    g.player.fireCd = 1e9;
    for (let i = 0; i < 120; i++) updateEnemies.call(g, 1 / 60);
    expect(e.burnT).toBe(2.1024848528838902e-15);
    expect(e.burnStacks).toBe(2);
    updateEnemies.call(g, 1 / 60);
    expect(e.burnT).toBe(-0.016666666666664564);
    expect(e.burnStacks).toBe(2);
    expect(g.dmgBy.burn).toBe(20.16666666666667);
    expect(1_000_000 - e.hp).toBe(20.16666666197125);
    expect(e.dead).not.toBe(true);
    updateEnemies.call(g, 1 / 60);
    expect(e.burnStacks).toBe(0);
    expect(e.burnT).toBe(-0.016666666666664564);
    expect(g.dmgBy.burn).toBe(20.16666666666667);
  });

  it("D2-14 shooter projectile retains launch damage after mutation and removal", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    const g = fresh();
    g.spawnEnemy("shooter");
    const e = g.enemies[0];
    e.x = g.player.x - 100;
    e.y = g.player.y;
    e.speed = 0;
    e.shootCd = 0;
    e.typeDamageBonus = { physical: 0.2 };
    const launchDamage = e.dmg;
    updateEnemies.call(g, 1 / 60);
    const b = g.ebullets[0];
    expect(b.dmg).toBe(launchDamage);
    expect(b.stats?.attack).toBe(launchDamage);
    e.dmg = 999;
    e.typeDamageBonus.physical = 0.8;
    g.enemies.length = 0;
    expect(b.dmg).toBe(launchDamage);
    expect(b.stats?.typeDamageBonus.physical).toBe(0.2);
    b.x = g.player.x;
    b.y = g.player.y;
    b.vx = b.vy = 0;
    g.player.hurtCd = 0;
    g.update(1 / 60);
    expect(g.player.hp).toBe(100 - launchDamage * 1.2);
  });

  it.each([
    { elite: false, explode: 0, nearby: 0, spread: 0, expected: 25 },
    { elite: true, explode: 0, nearby: 0, spread: 0, expected: 60 },
    { elite: false, explode: 1, nearby: 0, spread: 0, expected: 35 },
    { elite: false, explode: 1, nearby: 2, spread: 0, expected: 37 },
    { elite: false, explode: 0, nearby: 3, spread: 1, expected: 25 },
  ])("D2-12 kill RNG budget %#", ({ elite, explode, nearby, spread, expected }) => {
    const random = vi.spyOn(Math, "random").mockReturnValue(0.99);
    const g = fresh();
    g.spawnEnemy("slime", elite);
    const victim = g.enemies[0];
    for (let i = 0; i < nearby; i++) {
      g.spawnEnemy("slime");
      const e = g.enemies.at(-1)!;
      e.x = victim.x + 1 + i;
      e.y = victim.y;
      e.hp = e.maxhp = 1000;
    }
    g.player.explode = explode;
    g.player.burnSpread = spread;
    victim.burnStacks = spread ? 1 : 0;
    random.mockClear();
    g.killEnemy(victim);
    expect(random).toHaveBeenCalledTimes(expected);
    expect(g.parts.length).toBe(elite ? 20 : explode ? 17 : 7);
    if (!elite) expect(g.gems[0].v).toBe(victim.xp);
    if (spread) expect(g.enemies.slice(1).map((e) => e.burnStacks)).toEqual([1, 1, 0]);
  });

  it("D2-12b hit and pickups preserve separate RNG budgets", () => {
    const random = vi.spyOn(Math, "random").mockReturnValue(0.99);
    const g = fresh();
    g.spawnEnemy("slime");
    const e = g.enemies[0];
    e.hp = e.maxhp = 1000;
    random.mockClear();
    g.hurtEnemy(e, 1, 0, 0, { noChain: true });
    expect(random).toHaveBeenCalledTimes(2);
    random.mockClear();
    g.hurtEnemy(e, 1, 0, 0, { noChain: true, noCrit: true });
    expect(random).toHaveBeenCalledTimes(1);
    random.mockClear();
    g.gems.push({ x: g.player.x + 1, y: g.player.y, vx: 0, vy: 0, v: 1 });
    updateProgression.call(g, 1 / 60);
    expect(random).toHaveBeenCalledTimes(1);
    expect(g.gems).toHaveLength(0);
    random.mockClear();
    g.potions.push({ x: g.player.x, y: g.player.y });
    updateProgression.call(g, 1 / 60);
    expect(random).not.toHaveBeenCalled();
    expect(g.potions).toHaveLength(0);
    g.boxes.push({ x: g.player.x, y: g.player.y });
    updateProgression.call(g, 1 / 60);
    expect(random).not.toHaveBeenCalled();
    expect(g.boxes).toHaveLength(0);
  });

  it("D2-12 ordinary drop consumes luck, gem velocities, then potion roll", () => {
    const g = fresh();
    g.spawnEnemy("slime");
    const e = g.enemies[0];
    const sequence = [0.8, 0.2, 0.7, 0.99, ...Array<number>(21).fill(0.5)];
    let i = 0;
    vi.spyOn(Math, "random").mockImplementation(() => {
      if (i >= sequence.length) throw new Error("unexpected random draw");
      return sequence[i++];
    });
    g.killEnemy(e);
    expect(i).toBe(25);
    expect(g.gems[0].v).toBe(e.xp);
    expect(g.gems[0].vx).toBe((0.2 - 0.5) * 30);
    expect(g.gems[0].vy).toBe((0.7 - 0.5) * 30);
    expect(g.potions).toHaveLength(0);
  });

  it("documents invalid spawn inputs against old arithmetic and StatModel exceptions", () => {
    const cfg = ETYPES.slime;
    const ctx = { wave: 1, playerLevel: 1, elite: false, speedJitter: 1 };
    for (const field of ["hp", "dmg", "speed"] as const) {
      expect(-1 * 1).toBe(-1);
      expect(() => resolveEnemySpawnStats({ ...cfg, [field]: -1 }, ctx)).toThrow(RangeError);
      for (const value of [NaN, Infinity, -Infinity]) {
        expect(Number.isFinite(value * 1)).toBe(false);
        expect(() => resolveEnemySpawnStats({ ...cfg, [field]: value }, ctx)).toThrow(TypeError);
      }
    }
    for (const field of ["wave", "speedJitter"] as const) {
      for (const value of [NaN, Infinity, -Infinity]) {
        expect(() => resolveEnemySpawnStats(cfg, { ...ctx, [field]: value })).toThrow(TypeError);
      }
    }
    for (const value of [NaN, Infinity]) {
      expect(() => resolveEnemySpawnStats(cfg, { ...ctx, playerLevel: value })).toThrow(TypeError);
    }
    expect(Math.pow(1.03, -Infinity)).toBe(0);
    expect(() => resolveEnemySpawnStats(cfg, { ...ctx, playerLevel: -Infinity })).toThrow(RangeError);
    expect(Number.MAX_VALUE * (1 + 2 * 0.18)).toBe(Infinity);
    expect(() => resolveEnemySpawnStats({ ...cfg, hp: Number.MAX_VALUE }, { ...ctx, wave: 3 })).toThrow(RangeError);
  });
});
