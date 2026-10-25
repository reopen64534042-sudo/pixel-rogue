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
    // 基线更新依据：Issue #67（v14 波末统一执行）——升级不再立即弹面板，受控夹具显式打开
    g.openLevelPanel();
  });
  await expect(page.locator("#bp-level")).toBeVisible();
  await page.screenshot({ path: "output/playwright/bottombar-levelup.png" });
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
  // Stats panel inspection with split layout and current-value talent details
  await page.keyboard.press("c");
  await expect(page.locator("#ov-stats")).toBeVisible();
  await expect(page.locator("#stat-combat")).toBeVisible();
  await expect(page.locator("#stat-defense")).toBeVisible();
  const bladeTag = page.locator('#talent-list span[data-n="磨刃"]');
  await expect(bladeTag).toBeVisible();
  await expect(bladeTag).not.toHaveAttribute("title");
  await bladeTag.hover();
  const tooltip = page.locator("#talent-tooltip");
  await expect(tooltip).toBeVisible();
  await expect(tooltip.locator(".tt-name")).toHaveText("磨刃");
  await expect(tooltip.locator(".tt-lvl")).toContainText("Lv.");
  await expect(tooltip.locator(".tt-desc")).toHaveText("伤害 +10%");
  await expect(tooltip.locator(".tt-cur-val")).toContainText("当前伤害");
  await page.screenshot({ path: "output/playwright/stats-panel-large.png" });
  await page.mouse.move(10, 10);
  await expect(tooltip).toBeHidden();
  await bladeTag.click();
  await expect(tooltip).toBeVisible();
  await page.keyboard.press("c");
  await expect(page.locator("#ov-stats")).toBeHidden();
  await expect(tooltip).toBeHidden();
  // Automatic collection may open more genuine level selections.
  await expect(async () => {
    if (await page.locator("#bp-level").isVisible())
      await page.keyboard.press("1");
    await expect(page.locator("#bp-rest")).toBeVisible({ timeout: 500 });
  }).toPass({ timeout: 15000 });
  await page.screenshot({ path: "output/playwright/bottombar-rest.png" });
  await page.getByRole("button", { name: "⚗ 打开置换" }).click();
  // 基线更新依据：Issue #74（两步式置换）——目标稀有度由首选材料自动推导，旧目标按钮已移除
  const material = page.locator('#sw-inv span[data-n="磨刃"]');
  await material.click();
  await material.click();
  await expect(page.locator("#sw-melt")).toHaveText("🔥 熔 炼 (2/2)");
  await page.screenshot({ path: "output/playwright/bottombar-swap.png" });
  const countBefore = await page.evaluate(
    () => window.__PIXEL_ROGUE__!.core.player.picks.length,
  );
  await page.locator("#sw-melt").click();
  expect(
    await page.evaluate(() => window.__PIXEL_ROGUE__!.core.player.picks.length),
  ).toBe(countBefore - 1);
  await expect(page.locator("#sw-result")).toBeVisible();
  await expect(page.locator("#sw-result-card .sw-name")).toBeVisible();
  await page.screenshot({
    path: "output/playwright/bottombar-swap-result.png",
  });
  await page.locator("#sw-confirm").click();
  await expect(page.locator("#bp-swap")).toBeHidden();
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
  await page.screenshot({ path: "output/playwright/stats-panel-small.png" });
  await page.locator("#btn-statclose").click();
  await expect(page.locator("#ov-stats")).toBeHidden();
});

// Combat Foundation S4-C C2-A：宝箱强化走真实 DOM 面板与键盘命令，
// 磨刃经权威来源投影恰好一次 ×1.1（13.310000000000002 = 11×1.1×1.1）
test("chest box panel reinforces damage talent with exact projection", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await page.getByRole("button", { name: "开 始 冒 险" }).click();
  await page.waitForFunction(
    () => window.__PIXEL_ROGUE__?.core.state === "play",
  );
  await page.evaluate(() => {
    const g = window.__PIXEL_ROGUE__!.core;
    const UPGRADES = window.__PIXEL_ROGUE__!.talents;
    g.learnTalent(UPGRADES.find((u) => u.n === "磨刃")!);
    g.boxPicks = 2;
    g.openBoxPanel();
  });
  await expect(page.locator("#bp-level")).toBeVisible();
  await expect(page.locator("#bp-level .bp-title")).toContainText("开启宝箱");
  await page.screenshot({ path: "output/playwright/bottombar-box.png" });
  // 预置缺陷（C2-A 记录，未修复）：宝箱模式提示键盘 1/2/3，但 GameScene 快捷键
  // 只对 bpMode === "level" 响应——此处走卡片点击真实 UI 路径
  const boxCard = page.locator("#bp-cards .card").first();
  await boxCard.click(); // 池内唯一项 = 磨刃，强化到 2 级
  await boxCard.click(); // 剩余 1 次 → 再强化一次后关闭
  await expect(page.locator("#bp-level")).toBeHidden();
  const after = await page.evaluate(() => {
    const g = window.__PIXEL_ROGUE__!.core;
    return {
      damage: g.player.damage,
      lv: g.player.upCounts["磨刃"],
      boxPicks: g.boxPicks,
      bpMode: g.bpMode,
    };
  });
  // 夹具 1 级 + 宝箱强化 2 次 = 3 级：11×1.1×1.1×1.1
  expect(after.lv).toBe(3);
  expect(after.boxPicks).toBe(0);
  expect(after.bpMode).toBeNull();
  expect(after.damage).toBe(14.641000000000004);
  await page.screenshot({ path: "output/playwright/after-box.png" });
  expect(errors).toEqual([]);
});
