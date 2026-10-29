import { expect, type Page } from "@playwright/test";

/**
 * #136：开局天赋面板会冻结整个模拟（选完才开始游戏）。
 * 所有需要「已开始对局」的 spec 在点击「开始冒险」后统一调用本助手消费开局天赋。
 */
export async function dismissStartTalent(page: Page) {
  const card = page.locator("#bp-cards .card").first();
  if (await card.isVisible().catch(() => false)) {
    await card.click();
    await expect(page.locator("#bp-level")).toBeHidden();
  }
}
