import { afterEach, expect, it, vi } from "vitest";
import { updateAttacks } from "../src/game/core/AttackSystem";
import { updateEnemies } from "../src/game/core/EnemySystem";
import { updateProjectiles } from "../src/game/core/ProjectileSystem";
import { ETYPES } from "../src/game/data/enemies";
import { enemy, fresh } from "./helpers";

afterEach(() => vi.restoreAllMocks());

it("默认索敌距离及弹丸速度与寿命", () => {
  const g = fresh();
  const e = enemy(g, g.player.x + 130.01, g.player.y);
  updateAttacks.call(g, 0);
  expect(g.bullets).toHaveLength(0);
  e.x = g.player.x + 129.99;
  g.player.fireCd = 0;
  updateAttacks.call(g, 0);
  expect(g.bullets).toHaveLength(1);
  expect(g.player.projSpeed).toBe(260);
  expect(Math.hypot(g.bullets[0].vx, g.bullets[0].vy)).toBe(260);
  expect(g.bullets[0].life).toBe(130 / 260);
});

it.each(Array.from({ length: 16 }, (_, i) => i * Math.PI / 8))("固定步长下索敌边缘目标可命中，角度 %f", (angle) => {
  vi.spyOn(Math, "random").mockReturnValue(0.99);
  const g = fresh();
  const e = enemy(g, g.player.x + Math.cos(angle) * 129.99, g.player.y + Math.sin(angle) * 129.99);
  e.r = 3; e.hp = e.maxhp = 1000;
  updateAttacks.call(g, 0);
  expect(g.bullets).toHaveLength(1);
  for (let i = 0; i < 40 && g.bullets.length; i++) updateProjectiles.call(g, 1 / 60);
  expect(e.hp).toBeLessThan(1000);
});

it("普通弹丸在约 130 px 内失效，穿透和弹射仍可继续命中", () => {
  vi.spyOn(Math, "random").mockReturnValue(0.99);
  const g = fresh(); const aim = enemy(g, g.player.x + 75, g.player.y);
  aim.hp = aim.maxhp = 1000;
  updateAttacks.call(g, 0); g.enemies.length = 0;
  const bullet = g.bullets[0];
  while (g.bullets.length) updateProjectiles.call(g, 1 / 60);
  expect(Math.hypot(bullet.x - g.player.x, bullet.y - (g.player.y - 3))).toBeCloseTo(130, 8);
  for (const mode of ["pierce", "ricochet"] as const) {
    const h = fresh(); h.player[mode] = 1;
    const a = enemy(h, h.player.x + 30, h.player.y);
    const b = enemy(h, h.player.x + 65, h.player.y);
    a.hp = a.maxhp = b.hp = b.maxhp = 1000;
    updateAttacks.call(h, 0);
    for (let i = 0; i < 40 && h.bullets.length; i++) updateProjectiles.call(h, 1 / 60);
    expect(a.hp).toBeLessThan(1000);
    expect(b.hp).toBeLessThan(1000);
  }
});

it("史莱姆速度扰动、蝙蝠与射手解锁及射手原有弹幕", () => {
  const random = vi.spyOn(Math, "random").mockReturnValue(0.5);
  expect(ETYPES.slime.speed).toBe(55);
  expect(ETYPES.bat.w0).toBe(3);
  expect(ETYPES.shooter.w0).toBe(4);
  const g = fresh(); g.spawnEnemy("slime");
  expect(g.enemies[0].speed).toBe(55);
  random.mockReturnValue(0.25); g.spawnEnemy("slime");
  expect(g.enemies[1].speed).toBe(55 * (0.9 + 0.25 * 0.2));
  g.enemies.length = 0; g.spawnEnemy("shooter");
  const shooter = g.enemies[0]; shooter.speed = 0; shooter.shootCd = 0;
  shooter.x = g.player.x + 209; shooter.y = g.player.y;
  updateEnemies.call(g, 0);
  expect(shooter.shootCd).toBe(2);
  expect(g.ebullets).toHaveLength(1);
  expect(Math.hypot(g.ebullets[0].vx, g.ebullets[0].vy)).toBe(95);
  expect(g.ebullets[0].life).toBe(4);
  shooter.shootCd = 0; shooter.x = g.player.x + 210;
  updateEnemies.call(g, 0);
  expect(g.ebullets).toHaveLength(1);
  shooter.speed = 40; shooter.shootCd = 100;
  shooter.x = g.player.x + 151; updateEnemies.call(g, 0.1);
  expect(shooter.x).toBeCloseTo(g.player.x + 147);
  shooter.x = g.player.x + 89; updateEnemies.call(g, 0.1);
  expect(shooter.x).toBeCloseTo(g.player.x + 93);
});
