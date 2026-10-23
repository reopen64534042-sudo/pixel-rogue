import { test, expect } from "@playwright/test";
test("Phaser world, camera edge and HUD font match source dimensions", async ({
  page,
}) => {
  await page.goto("/");
  await page.locator("#btn-start").click();
  await page.waitForFunction(() => window.__PIXEL_ROGUE__);
  const labels = await page.evaluate(() => {
    const api = window.__PIXEL_ROGUE__!;
    api.core.togglePause();
    return api.scene.children.list
      .filter((o) => o.type === "Text")
      .map((o) => {
        const text = o as import("phaser").GameObjects.Text;
        return {
          text: text.text,
          width: text.width,
          font: text.context.font,
          style: text.style.fontFamily,
          size: text.style.fontSize,
        };
      });
  });
  console.log("HUD_METRICS", JSON.stringify(labels));
  expect(labels.find((t) => t.text === "Lv1")?.width).toBe(48);
  await page.evaluate(() => {
    const api = window.__PIXEL_ROGUE__!,
      g = api.core;
    g.player.x = 24;
    g.player.y = 24;
    g.state = "play";
    g.step(1 / 60);
    g.togglePause();
  });
  await expect
    .poll(() =>
      page.evaluate(() => ({
        x: window.__PIXEL_ROGUE__!.scene.cameras.main.scrollX,
        y: window.__PIXEL_ROGUE__!.scene.cameras.main.scrollY,
      })),
    )
    .toEqual({ x: 0, y: 0 });
  await page
    .locator("#ov-pause")
    .evaluate((node) => node.classList.add("hidden"));
  await page.screenshot({ path: "output/playwright/world-edge.png" });
});
