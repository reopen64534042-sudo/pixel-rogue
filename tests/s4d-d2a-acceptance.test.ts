import { afterEach, describe, expect, it, vi } from "vitest";
import { updateEnemies } from "../src/game/core/EnemySystem";
import { applyKnockback } from "../src/game/core/MeleeSystem";
import { burnStackDps } from "../src/game/core/DamageMath";
import { updateAttacks } from "../src/game/core/AttackSystem";
import { updateProjectiles } from "../src/game/core/ProjectileSystem";
import { draw } from "../src/game/rendering/draw";
import type { PixelPainter } from "../src/game/rendering/PixelPainter";
import { fresh } from "./helpers";

vi.mock("../src/game/rendering/assetRegistry", () => ({
  spriteEntry: () => ({ tex: "test", w: 8, h: 8 }),
}));

afterEach(() => vi.restoreAllMocks());

describe("S4-D2-A frozen acceptance", () => {
  it("D2-01/02/03 level 1 literal HP and damage across five types and seven waves", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    const rows = [
      ["slime", [14, 19.04, 21.560000000000002, 24.08, 31.639999999999997, 49.28, 52.64], [8, 8.8, 9.2, 9.6, 10.8, 13.600000000000001, 14.096], 30, 4, 1],
      ["bat", [9, 12.239999999999998, 13.86, 15.48, 20.339999999999996, 31.68, 33.839999999999996], [6, 6.6000000000000005, 6.8999999999999995, 7.199999999999999, 8.100000000000001, 10.200000000000001, 10.572], 62, 3, 1],
      ["brute", [65, 88.39999999999999, 100.10000000000001, 111.8, 146.89999999999998, 228.8, 244.39999999999998], [15, 16.5, 17.25, 18, 20.25, 25.500000000000004, 26.43], 20, 7, 3],
      ["shooter", [16, 21.759999999999998, 24.64, 27.52, 36.16, 56.32, 60.16], [10, 11, 11.5, 12, 13.5, 17, 17.62], 38, 4, 2],
      ["bomber", [12, 16.32, 18.48, 20.64, 27.119999999999997, 42.24, 45.12], [16, 17.6, 18.4, 19.2, 21.6, 27.200000000000003, 28.192], 72, 4, 2],
    ] as const;
    const waves = [1, 3, 4, 5, 8, 15, 16];
    for (const [kind, hp, dmg, speed, radius, xp] of rows) {
      for (const [i, wave] of waves.entries()) {
        for (const elite of [false, true]) {
          const g = fresh();
          g.waveN = wave;
          g.spawnEnemy(kind, elite);
          const e = g.enemies[0];
          expect(e.hp).toBe(hp[i] * (elite ? 8 : 1));
          expect(e.maxhp).toBe(e.hp);
          expect(e.dmg).toBe(dmg[i] * (elite ? 1.5 : 1));
          expect(e.speed).toBe(speed * (elite ? 0.8 : 1));
          expect(e.r).toBe(radius * (elite ? 1.8 : 1));
          expect(e.xp).toBe(elite ? 25 : xp);
        }
      }
    }
  });

  it("D2-03 elite slime speed keeps the 0.95 left-associated result", () => {
    const random = vi.spyOn(Math, "random").mockReturnValue(0.25);
    const g = fresh();
    random.mockReset().mockReturnValueOnce(0).mockReturnValueOnce(0.24999999999999972).mockReturnValue(0.5);
    g.spawnEnemy("slime", true);
    expect(g.enemies[0].speed).toBe(22.799999999999997);
    expect(g.enemies[0].speed).not.toBe(30 * (0.8 * 0.95));
  });

  it("D2-04/05 levels only affect new HP and never attack", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    const g = fresh();
    g.spawnEnemy("brute", true);
    const first = g.enemies[0];
    g.player.lvl = 20;
    expect(first.hp).toBe(520);
    g.spawnEnemy("brute", true);
    expect(g.enemies[1].hp).toBe(585.2645812000001);
    expect(g.enemies[1].dmg).toBe(first.dmg);
    g.player.lvl = 25;
    g.spawnEnemy("brute", true);
    expect(g.enemies[2].hp).toBe(602.822518636);
  });

  it("D2-07 reordered percent and grouped multipliers differ from frozen HP", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    const g = fresh();
    g.waveN = 3;
    g.player.lvl = 10;
    g.spawnEnemy("brute", true);
    const hp = g.enemies[0].hp;
    expect(hp).toBe(750.2684799999998);
    expect(hp).not.toBe(65 * (1 + (1.36 - 1) + (1.0609 - 1)) * 8);
    expect(hp).not.toBe(65 * (1.36 * 1.0609 * 8));
  });

  it("D2-08 natural spawn preserves base fields", () => {
    const values = [0.625, 0, 0.25, 0.5, 0.75];
    let i = 0;
    vi.spyOn(Math, "random").mockImplementation(() => values[i++]);
    const g = fresh();
    g.spawnEnemy();
    const e = g.enemies[0];
    expect([e.hp, e.maxhp, e.dmg, e.r]).toEqual([14, 14, 8, 4]);
    expect(i).toBe(5);
  });

  it("D2-13 injured entity remains independent after another spawn", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    const g = fresh();
    g.spawnEnemy("slime");
    const a = g.enemies[0];
    g.hurtEnemy(a, 3, 0, 0, { noCrit: true });
    g.spawnEnemy("slime");
    const b = g.enemies[1];
    expect(a).not.toBe(b);
    expect([a.hp, a.maxhp, b.hp, b.maxhp]).toEqual([11, 14, 14, 14]);
    b.hp = 2;
    expect(a.hp).toBe(11);
  });

  it("D2-23 frost stacks freeze and block movement, contact and shooting", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.99);
    const g = fresh();
    g.spawnEnemy("shooter");
    const e = g.enemies[0];
    e.x = g.player.x + 2;
    e.y = g.player.y;
    e.hp = e.maxhp = 1000;
    e.shootCd = 0;
    g.player.frostLv = 2;
    for (let i = 0; i < 3; i++) g.hurtEnemy(e, 1, 0, 0, { noCrit: true });
    expect([e.frostStacks, e.frozenT, e.frostImmuneT]).toEqual([0, 0.8, 2.5]);
    const x = e.x;
    const hp = g.player.hp;
    updateEnemies.call(g, 1 / 60);
    expect(e.x).toBe(x);
    expect(g.player.hp).toBe(hp);
    expect(g.ebullets).toHaveLength(0);
    expect(e.shootCd).toBe(0);
  });

  it("D2-24b burn first hit, DPS and four stack cap", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.99);
    const g = fresh();
    g.spawnEnemy("slime");
    const e = g.enemies[0];
    e.hp = e.maxhp = 1000;
    g.player.burn = 1;
    g.hurtEnemy(e, 1, 0, 0, { noCrit: true });
    expect([e.burnStacks, e.burnT, e.burnDps]).toEqual([1, 2, burnStackDps(g.player, 1)]);
    for (let i = 0; i < 4; i++) g.hurtEnemy(e, 1, 0, 0, { noCrit: true });
    expect([e.burnStacks, e.burnT, e.burnDps]).toEqual([4, 2, burnStackDps(g.player, 4)]);
  });

  it("D2-25 slow preserves speed and scales actual displacement", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    const g = fresh();
    g.spawnEnemy("slime");
    const e = g.enemies[0];
    e.x = g.player.x + 100;
    e.y = g.player.y;
    e.hp = e.maxhp = 1000;
    g.player.slow = 0.5;
    g.hurtEnemy(e, 1, 0, 0, { noCrit: true });
    expect([e.slowT, e.slowF, e.speed]).toEqual([1.2, 0.5, 30]);
    const x = e.x;
    updateEnemies.call(g, 1 / 60);
    expect(e.x).toBe(x - 30 * 0.5 * (1 / 60));
    expect(e.speed).toBe(30);
  });

  it("D2-26 shooter resets cooldown and non-shooter leaves it alone", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    const g = fresh();
    g.spawnEnemy("shooter");
    g.spawnEnemy("slime");
    const [shooter, slime] = g.enemies;
    expect([shooter.shootCd, slime.shootCd]).toEqual([1.75, 1.75]);
    shooter.x = g.player.x + 100;
    shooter.y = g.player.y;
    shooter.shootCd = 0;
    shooter.speed = slime.speed = 0;
    updateEnemies.call(g, 1 / 60);
    expect(shooter.shootCd).toBe(2.2);
    expect(slime.shootCd).toBe(1.75);
    expect(g.ebullets).toHaveLength(1);
  });

  it("D2-27 knockback direction, integration, damping and threshold", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    const g = fresh();
    g.spawnEnemy("slime");
    const e = g.enemies[0];
    e.x = g.player.x + 20;
    e.y = g.player.y;
    e.hp = e.maxhp = 1000;
    g.meleeSwing({ angle: 0, radius: 40, dmg: 1, knock: 240 });
    expect([e.kx, e.ky]).toEqual([240, 0]);
    const x = e.x;
    applyKnockback(e, 1 / 60);
    expect(e.x).toBe(x + 240 / 60);
    expect(e.kx).toBe(240 * (1 - 12 / 60));
    e.kx = 1;
    applyKnockback(e, 1 / 60);
    expect(e.kx).toBe(0);
  });

  it("D2-15 bomber starts fuse, detonates with current attack and is removed", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.99);
    const g = fresh();
    g.spawnEnemy("bomber");
    const e = g.enemies[0];
    e.x = g.player.x + 10;
    e.y = g.player.y;
    e.speed = 0;
    g.player.shield = 0;
    g.player.dodge = 0;
    updateEnemies.call(g, 1 / 60);
    expect(e.fuse).toBe(0.5);
    e.dmg = 19;
    e.fuse = 0.01;
    const hit = vi.spyOn(g, "damagePlayer");
    updateEnemies.call(g, 1 / 60);
    expect(hit.mock.calls[0][1]?.attackerStats?.attack).toBe(19);
    expect(g.player.hp).toBe(81);
    expect(e.noDrop).toBe(true);
    expect(e.hp).toBe(0);
    updateEnemies.call(g, 1 / 60);
    expect(g.enemies).toHaveLength(0);
  });

  it("D2-16 contact applies current attack as physical melee", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.99);
    const g = fresh();
    g.spawnEnemy("slime");
    const e = g.enemies[0];
    e.x = g.player.x;
    e.y = g.player.y;
    e.speed = 0;
    e.dmg = 13;
    g.player.shield = 0;
    g.player.dodge = 0;
    const hit = vi.spyOn(g, "damagePlayer");
    updateEnemies.call(g, 1 / 60);
    expect(hit.mock.calls[0][0]).toBe(13);
    expect(hit.mock.calls[0][1]).toMatchObject({ melee: true, src: e, type: "physical", form: "melee" });
    expect(g.player.hp).toBe(87);
  });

  it("D2-17 reflected projectile uses current player bonuses and leaves enemy attack unchanged", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.99);
    const g = fresh();
    g.spawnEnemy("slime");
    const e = g.enemies[0];
    e.x = g.player.x + 26;
    e.y = g.player.y;
    e.hp = e.maxhp = 1000;
    const attack = e.dmg;
    g.player.orbit = 1;
    g.player.orbA = 0;
    g.player.bladeReflect = 1;
    g.player.globalDamageBonus = 0.5;
    g.ebullets.push({ x: e.x, y: e.y, vx: 0, vy: 0, dmg: 10, r: 2, life: 4 });
    const hit = vi.spyOn(g, "hurtEnemy");
    updateProjectiles.call(g, 0);
    expect(hit.mock.calls[0][4]).toMatchObject({ src: "reflect", type: "physical", form: "ranged" });
    expect(hit.mock.calls[0][4]?.attackerStats).toBeUndefined();
    expect(e.hp).toBe(985);
    expect(e.dmg).toBe(attack);
    expect(g.ebullets).toHaveLength(0);
  });

  it("D2-18 bomber consumes stored four-stack DPS through enemy update", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.99);
    const g = fresh();
    g.spawnEnemy("bomber");
    const e = g.enemies[0];
    e.hp = e.maxhp = 1000;
    e.speed = 0;
    g.player.burn = 1;
    g.player.chain = 0;
    g.player.scorchVuln = 0;
    g.player.globalDamageBonus = 0;
    g.player.typeDamageBonus = {};
    g.player.formDamageBonus = {};
    g.player.skillDamageBonus = undefined;
    for (let i = 0; i < 4; i++) {
      g.hurtEnemy(e, 1, 0, 0, { noCrit: true, noChain: true });
    }
    expect(e.burnStacks).toBe(4);
    expect(e.burnT).toBe(2);
    expect(e.burnDps).toBe(burnStackDps(g.player, 4));
    expect(e.burnDps).toBe(4 * g.player.damage * 0.1);
    const savedDps = e.burnDps;
    const hpBefore = e.hp;
    g.player.damage *= 2;
    const damage = (savedDps * (1 / 60)) * 0.6;
    expect(Number.isInteger(damage)).toBe(false);
    expect(damage).toBeGreaterThan(0);
    expect(damage).toBeLessThan(1);
    updateEnemies.call(g, 1 / 60);
    expect(e.burnDps).toBe(savedDps);
    expect(g.dmgBy.burn).toBe(damage);
    expect(e.hp).toBe(hpBefore - damage);
    expect(hpBefore - e.hp).toBe(hpBefore - (hpBefore - damage));
    expect(e.burnT).toBe(2 - 1 / 60);
    expect(e.burnStacks).toBe(4);
  });

  it("D2-18 and D2-19 burn and ground zone retain float and fire resistance", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.99);
    const g = fresh();
    g.spawnEnemy("bomber");
    const e = g.enemies[0];
    e.hp = e.maxhp = 1000;
    e.speed = 0;
    e.burnStacks = 4;
    e.burnT = 2;
    e.burnDps = 10;
    updateEnemies.call(g, 1 / 60);
    expect(e.burnT).toBe(2 - 1 / 60);
    expect(g.dmgBy.burn).toBe((10 * (1 / 60)) * 0.6);
    const h = fresh();
    h.spawnEnemy("slime");
    const neutral = h.enemies[0];
    neutral.hp = neutral.maxhp = 1000;
    h.player.fireCd = 1e9;
    h.burnZones.push({ x: neutral.x, y: neutral.y, R: 30, t: 5 });
    const dps = h.player.damage * 0.2;
    updateAttacks.call(h, 1 / 60);
    expect(neutral.hp).toBe(1000 - dps * (1 / 60));
    expect(h.dmgBy.burn).toBe(dps * (1 / 60));
  });

  it("D2-20 meteor and D2-21 melee use their actual typed hit paths", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.99);
    const g = fresh();
    g.spawnEnemy("bomber");
    const e = g.enemies[0];
    e.x = g.player.x + 20;
    e.y = g.player.y;
    e.hp = e.maxhp = 1000;
    g.player.fireCd = 1e9;
    g.player.meteor = 1;
    g.player.meteorT = 10;
    g.meteors.push({ x: e.x, y: e.y, R: 34, t: 0.01 });
    const hit = vi.spyOn(g, "hurtEnemy");
    updateAttacks.call(g, 1 / 60);
    expect(hit.mock.calls[0][4]).toMatchObject({ src: "meteor", type: "fire", form: "other" });
    expect(e.hp).toBe(975);
    expect(g.player.meteorT).toBe(10 - 1 / 60);
    hit.mockClear();
    g.meleeSwing({ angle: 0, radius: 40, dmg: 5.4, knock: 100 });
    expect(hit.mock.calls[0][4]).toMatchObject({ src: "melee", type: "physical", form: "melee" });
    expect(e.hp).toBe(970);
    expect([e.kx, e.ky]).toEqual([100, 0]);
  });

  it("D2-22 true damage ignores brute armor and resistance and tough", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.99);
    const g = fresh();
    g.spawnEnemy("brute");
    const e = g.enemies[0];
    e.hp = e.maxhp = 1000;
    e.tough = 0.6;
    e.resistances = { true: 0.75 };
    const result = g.hurtEnemy(e, 100, 0, 0, { noCrit: true, type: "true" });
    expect(result?.settledDamage).toBe(100);
    expect(e.hp).toBe(900);
  });

  it("D2-28 draw reads current elite HP over maxhp", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    const g = fresh();
    g.spawnEnemy("slime", true);
    const e = g.enemies[0];
    const rectangles: { style: string; width: number }[] = [];
    const target: { fillStyle: string } = { fillStyle: "" };
    const painter = new Proxy(target, {
      get(obj, key) {
        if (key === "fillRect") return (_x: number, _y: number, width: number) => rectangles.push({ style: obj.fillStyle, width });
        if (key in obj) return Reflect.get(obj, key);
        return () => {};
      },
    }) as unknown as PixelPainter;
    draw.call(g, painter);
    const full = rectangles.find((r) => r.style === "#ff5b5b")!.width;
    rectangles.length = 0;
    e.hp = e.maxhp / 2;
    draw.call(g, painter);
    expect(rectangles.find((r) => r.style === "#ff5b5b")!.width).toBe(full / 2);
    expect(e.maxhp).toBe(112);
  });
});
