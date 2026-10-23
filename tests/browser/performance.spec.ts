import { test, expect } from "@playwright/test";
test("measure 160 enemies and 120 projectiles without changing production algorithms", async ({
  page,
}) => {
  await page.goto("/");
  await page.locator("#btn-start").click();
  await page.waitForFunction(() => window.__PIXEL_ROGUE__);
  const result = await page.evaluate(() => {
    const api = window.__PIXEL_ROGUE__!,
      g = api.core;
    g.togglePause();
    g.enemies = [];
    g.bullets = [];
    for (let i = 0; i < 160; i++) {
      g.spawnEnemy("slime");
      const e = g.enemies.at(-1)!;
      e.x = 40 + (i % 20) * 15;
      e.y = 40 + Math.floor(i / 20) * 15;
      e.hp = e.maxhp = 1e12;
      e.speed = 0;
    }
    for (let i = 0; i < 120; i++)
      g.bullets.push({
        x: 40 + (i % 20) * 15,
        y: 40 + Math.floor(i / 20) * 15,
        vx: 0,
        vy: 0,
        dmg: 1,
        pierce: 10000,
        jumps: 0,
        life: 1000,
        size: 2,
        hitList: [],
      });
    g.state = "play";
    g.player.hp = 1e12;
    g.player.maxhp = 1e12;
    g.player.fireCd = 1000;
    g.spawnedThisWave = g.quota;
    const samples: number[] = [];
    for (let i = 0; i < 240; i++) {
      const begin = performance.now();
      g.update(1 / 60);
      samples.push(performance.now() - begin);
    }
    g.togglePause();
    samples.sort((a, b) => a - b);
    return {
      environment: navigator.userAgent,
      enemies: g.enemies.length,
      projectiles: g.bullets.length,
      p50ms: samples[120],
      p95ms: samples[228],
      maxms: samples[239],
      separationPairs: (160 * 159) / 2,
      projectilePairs: 160 * 120,
    };
  });
  console.log("SIMULATION_BASELINE", JSON.stringify(result));
  expect(result.enemies).toBe(160);
  expect(result.projectiles).toBe(120);
});
