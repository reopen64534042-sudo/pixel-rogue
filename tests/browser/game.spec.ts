import { test, expect } from "@playwright/test";
test("real Phaser input, UI commands, pause, choices, furnace, death, history, restart", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await page.getByRole("button", { name: "开 始 冒 险" }).click();
  await page.waitForFunction(
    () => window.__PIXEL_ROGUE__?.core.state === "play",
  );
  const start = await page.evaluate(
    () => window.__PIXEL_ROGUE__!.core.player.x,
  );
  await page.keyboard.down("d");
  await page.waitForTimeout(500);
  await page.keyboard.up("d");
  expect(
    await page.evaluate(() => window.__PIXEL_ROGUE__!.core.player.x),
  ).toBeGreaterThan(start + 20);
  for (const key of ["p", "c"]) {
    await page.keyboard.press(key);
    const frozen = await page.evaluate(() => {
      const g = window.__PIXEL_ROGUE__!.core;
      return { t: g.time, fire: g.player.fireCd, x: g.player.x };
    });
    await page.waitForTimeout(300);
    expect(
      await page.evaluate(() => {
        const g = window.__PIXEL_ROGUE__!.core;
        return { t: g.time, fire: g.player.fireCd, x: g.player.x };
      }),
    ).toEqual(frozen);
    await page.keyboard.press(key);
  }
  // Controlled fixtures still exercise actual damage, pickups, selection and melt commands.
  await page.evaluate(() => {
    const g = window.__PIXEL_ROGUE__!.core;
    g.gems.push({ x: g.player.x + 1, y: g.player.y, vx: 0, vy: 0, v: 18 });
  });
  await expect(page.locator("#bp-level")).toBeVisible();
  const first = page.locator("#bp-cards .card").first();
  await first.locator(".refr").click();
  await expect(page.locator("#bp-cards .refr")).toHaveCount(2);
  const picksBefore = await page.evaluate(
    () => window.__PIXEL_ROGUE__!.core.player.picks.length,
  );
  await page.keyboard.press("1");
  await page.keyboard.press("2");
  await expect(page.locator("#bp-level")).toBeHidden();
  expect(
    await page.evaluate(() => window.__PIXEL_ROGUE__!.core.player.picks.length),
  ).toBe(picksBefore + 2);
  await page.evaluate(async () => {
    const g = window.__PIXEL_ROGUE__!.core;
    const UPGRADES = window.__PIXEL_ROGUE__!.talents;
    g.learnTalent(UPGRADES.find((u) => u.n === "磨刃")!);
    g.learnTalent(UPGRADES.find((u) => u.n === "磨刃")!);
    // End quota by actual kills, not an alternate fake report implementation.
    for (const e of g.enemies)
      g.hurtEnemy(e, 100000, 0, 0, { noCrit: true, src: "bullet" });
    g.spawnedThisWave = g.quota;
  });
  // Automatic collection may open more genuine level selections.
  await expect(async () => {
    if (await page.locator("#bp-level").isVisible())
      await page.keyboard.press("1");
    await expect(page.locator("#bp-rest")).toBeVisible({ timeout: 500 });
  }).toPass({ timeout: 15000 });
  await page.getByRole("button", { name: "⚗ 打开置换" }).click();
  await page
    .getByRole("button", { name: "→ 稀有 (2×普通)", exact: true })
    .click();
  const material = page.locator('#sw-inv span[data-n="磨刃"]');
  await material.click();
  await material.click();
  await expect(page.locator("#sw-melt")).toHaveText("🔥 熔 炼 (2/2)");
  const countBefore = await page.evaluate(
    () => window.__PIXEL_ROGUE__!.core.player.picks.length,
  );
  await page.locator("#sw-melt").click();
  expect(
    await page.evaluate(() => window.__PIXEL_ROGUE__!.core.player.picks.length),
  ).toBe(countBefore - 1);
  await expect(page.locator("#bp-swapbtn")).toBeHidden();
  await page.locator("#bp-next").click();
  expect(await page.evaluate(() => window.__PIXEL_ROGUE__!.core.waveN)).toBe(2);
  await page.evaluate(() => {
    const g = window.__PIXEL_ROGUE__!.core;
    g.player.shield = 0;
    g.player.tempShield = 0;
    g.player.nd = 0;
    g.player.dodge = 0;
    g.damagePlayer(100000);
  });
  await expect(page.locator("#ov-over")).toBeVisible();
  expect(
    await page.evaluate(
      () => JSON.parse(localStorage.getItem("pixelrogue_records")!).length,
    ),
  ).toBe(1);
  const listeners = await page.evaluate(() =>
    window.__PIXEL_ROGUE__!.scene.input.keyboard!.listenerCount("keydown"),
  );
  await page.getByRole("button", { name: "再 来 一 局 (R)" }).click();
  expect(
    await page.evaluate(() => ({
      hp: window.__PIXEL_ROGUE__!.core.player.hp,
      picks: window.__PIXEL_ROGUE__!.core.player.picks,
      wave: window.__PIXEL_ROGUE__!.core.waveN,
    })),
  ).toEqual({ hp: 100, picks: [], wave: 1 });
  expect(
    await page.evaluate(() =>
      window.__PIXEL_ROGUE__!.scene.input.keyboard!.listenerCount("keydown"),
    ),
  ).toBe(listeners);
  await page.screenshot({ path: "output/playwright/phaser-gameplay.png" });
  expect(errors).toEqual([]);
});

test("small viewport stays within screen and controls remain reachable", async ({
  page,
}) => {
  await page.setViewportSize({ width: 400, height: 300 });
  await page.goto("/");
  await expect(page.locator("#btn-start")).toBeInViewport();
  const box = await page.locator("#stage").boundingBox();
  expect(box!.width).toBeLessThanOrEqual(400);
  expect(box!.height).toBeLessThanOrEqual(300);
  await page.locator("#btn-start").click();
  await page.keyboard.press("c");
  await expect(page.locator("#btn-statclose")).toBeInViewport();
  await page.screenshot({ path: "output/playwright/small-viewport.png" });
});
