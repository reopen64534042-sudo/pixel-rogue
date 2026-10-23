import { test, expect } from "@playwright/test";
test("production artifact loads, naturally completes first wave, selects upgrade and continues", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const failed: string[] = [];
  page.on("requestfailed", (r) => failed.push(r.url()));
  page.on("response", (r) => {
    if (r.status() >= 400) failed.push(`${r.status()} ${r.url()}`);
  });
  await page.goto("/");
  await expect(page.locator("canvas")).toHaveCount(1);
  expect(await page.evaluate(() => window.__PIXEL_ROGUE__)).toBeUndefined();
  await page.locator("#btn-start").click();
  // No test bridge, no patched timers, no changed stats: real production fight + auto-collection.
  await expect(page.locator("#bp-level")).toBeVisible({ timeout: 65000 });
  await expect(async () => {
    if (await page.locator("#bp-level").isVisible())
      await page.locator("#bp-cards .card").first().click();
    await expect(page.locator("#bp-rest")).toBeVisible({ timeout: 500 });
  }).toPass({ timeout: 15000 });
  await expect(page.locator("#bp-report")).toContainText("合计");
  await page.screenshot({
    path: "output/playwright/production-first-wave.png",
  });
  await page.locator("#bp-next").click();
  await expect(page.locator("#bp-rest")).toBeHidden();
  await page.keyboard.press("p");
  await expect(page.locator("#ov-pause")).toBeVisible();
  await page.locator("#btn-resume").click();
  await expect(page.locator("#ov-pause")).toBeHidden();
  expect(errors).toEqual([]);
  expect(failed).toEqual([]);
});
