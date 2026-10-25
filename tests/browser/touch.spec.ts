import { test, expect, type Page, type Locator } from "@playwright/test";

/**
 * Issue #95：触控层端到端。
 *
 * 用 `?touch=1`（DEV 专用开关，生产构建被摇树消除）在桌面 Chrome 上模拟触屏设备，
 * 通过合成 PointerEvent 驱动摇杆——与真机走的是同一条事件链，
 * 只是省掉了「手指」这一层。
 */
async function drag(
  page: Page,
  from: { x: number; y: number },
  to: { x: number; y: number },
  pointerId = 1,
) {
  await page.evaluate(
    ({ from, to, pointerId }) => {
      const canvas = document.querySelector("#game canvas");
      if (!canvas) throw new Error("缺少 canvas");
      const event = (type: string, x: number, y: number) =>
        new PointerEvent(type, {
          pointerId,
          pointerType: "touch",
          isPrimary: true,
          clientX: x,
          clientY: y,
          bubbles: true,
          cancelable: true,
        });
      canvas.dispatchEvent(event("pointerdown", from.x, from.y));
      canvas.dispatchEvent(event("pointermove", to.x, to.y));
    },
    { from, to, pointerId },
  );
}

async function release(
  page: Page,
  at: { x: number; y: number },
  pointerId = 1,
) {
  await page.evaluate(
    ({ at, pointerId }) => {
      const canvas = document.querySelector("#game canvas");
      canvas?.dispatchEvent(
        new PointerEvent("pointerup", {
          pointerId,
          pointerType: "touch",
          isPrimary: true,
          clientX: at.x,
          clientY: at.y,
          bubbles: true,
        }),
      );
    },
    { at, pointerId },
  );
}

test("PC stays keyboard-only: no touch layer, joystick vector untouched", async ({
  page,
}) => {
  await page.goto("/");
  await page.waitForFunction(() => Boolean(window.__PIXEL_ROGUE__?.scene));
  await expect(page.locator("#touch-layer")).toBeHidden();
  await expect(page.locator("#btn-dash")).toBeHidden();
  // 键位提示保持键鼠文案（触屏档才会被改写）
  await expect(page.locator("#ov-start .keys")).toContainText("WASD");
  // D1/D5：PC 端不提供摇杆设置入口，保持原有的禁用占位
  const entry = page.locator("#btn-pause-settings");
  await expect(entry).toBeDisabled();
  await expect(entry).toHaveText(/敬请期待/);
  await page.getByRole("button", { name: "开 始 冒 险" }).click();
  const start = await page.evaluate(() => {
    const core = window.__PIXEL_ROGUE__!.core;
    return { x: core.player.x, mx: core.moveX, my: core.moveY };
  });
  expect([start.mx, start.my]).toEqual([0, 0]);
  await page.keyboard.down("d");
  await page.waitForTimeout(300);
  await page.keyboard.up("d");
  expect(
    await page.evaluate(() => window.__PIXEL_ROGUE__!.core.player.x),
  ).toBeGreaterThan(start.x + 10);
});

test("touch joystick drives eight directions and releases cleanly", async ({
  page,
}) => {
  await page.goto("/?touch=1");
  await page.waitForFunction(() => Boolean(window.__PIXEL_ROGUE__?.scene));
  await expect(page.locator("#touch-layer")).toBeVisible();
  // 触屏档把开始界面的键位提示换成触控操作说明
  await expect(page.locator("#ov-start .keys")).toContainText("左半屏拖拽");
  await page.getByRole("button", { name: "开 始 冒 险" }).click();
  await page.waitForFunction(
    () => window.__PIXEL_ROGUE__!.core.state === "play",
  );
  const canvas = page.locator("#game canvas");
  const box = await canvas.boundingBox();
  if (!box) throw new Error("canvas 不可见");
  const origin = { x: box.x + box.width * 0.28, y: box.y + box.height * 0.62 };

  // 上：手指上移超过死区即吸附到正上方
  await drag(page, origin, { x: origin.x, y: origin.y - 80 });
  await expect
    .poll(() =>
      page.evaluate(() => {
        const core = window.__PIXEL_ROGUE__!.core;
        return [core.moveX, core.moveY];
      }),
    )
    .toEqual([0, -1]);
  const y0 = await page.evaluate(() => window.__PIXEL_ROGUE__!.core.player.y);
  await page.waitForTimeout(300);
  expect(
    await page.evaluate(() => window.__PIXEL_ROGUE__!.core.player.y),
  ).toBeLessThan(y0);

  // 右下：仍是八向（不会出现模拟量）
  await page.evaluate(
    ({ origin }) => {
      const canvas = document.querySelector("#game canvas")!;
      canvas.dispatchEvent(
        new PointerEvent("pointermove", {
          pointerId: 1,
          pointerType: "touch",
          clientX: origin.x + 70,
          clientY: origin.y + 70,
          bubbles: true,
        }),
      );
    },
    { origin },
  );
  await expect
    .poll(() =>
      page.evaluate(() => {
        const core = window.__PIXEL_ROGUE__!.core;
        return [core.moveX, core.moveY];
      }),
    )
    .toEqual([1, 1]);

  // 松手立即回中
  await release(page, { x: origin.x + 70, y: origin.y + 70 });
  await expect
    .poll(() =>
      page.evaluate(() => {
        const core = window.__PIXEL_ROGUE__!.core;
        return [core.moveX, core.moveY];
      }),
    )
    .toEqual([0, 0]);
  const stillY = await page.evaluate(
    () => window.__PIXEL_ROGUE__!.core.player.y,
  );
  await page.waitForTimeout(250);
  expect(
    await page.evaluate(() => window.__PIXEL_ROGUE__!.core.player.y),
  ).toBe(stillY);
});

test("dash button appears only after the dash talent and fires on hold", async ({
  page,
}) => {
  await page.goto("/?touch=1");
  await page.waitForFunction(() => Boolean(window.__PIXEL_ROGUE__?.scene));
  await page.getByRole("button", { name: "开 始 冒 险" }).click();
  await page.waitForFunction(
    () => window.__PIXEL_ROGUE__!.core.state === "play",
  );
  // D4：未解锁冲刺天赋时按钮不出现
  await expect(page.locator("#btn-dash")).toBeHidden();

  await page.evaluate(() => {
    const bridge = window.__PIXEL_ROGUE__!;
    const talent = bridge.talents.find((t) => t.n === "疾影步");
    if (!talent) throw new Error("缺少天赋：疾影步");
    bridge.core.learnTalent(talent);
  });
  await expect(page.locator("#btn-dash")).toBeVisible();

  await page.evaluate(() => {
    const button = document.getElementById("btn-dash");
    button?.dispatchEvent(
      new PointerEvent("pointerdown", {
        pointerId: 9,
        pointerType: "touch",
        isPrimary: true,
        bubbles: true,
        cancelable: true,
      }),
    );
  });
  await expect
    .poll(() =>
      page.evaluate(() => window.__PIXEL_ROGUE__!.core.player.dashT > 0),
    )
    .toBe(true);
  await page.evaluate(() => {
    document.getElementById("btn-dash")?.dispatchEvent(
      new PointerEvent("pointerup", {
        pointerId: 9,
        pointerType: "touch",
        isPrimary: true,
        bubbles: true,
      }),
    );
  });
  await expect
    .poll(() =>
      page.evaluate(() => window.__PIXEL_ROGUE__!.core.dashHeld),
    )
    .toBe(false);
});

test("joystick mode is switchable in settings and persists", async ({
  page,
}) => {
  await page.goto("/?touch=1");
  await page.waitForFunction(() => Boolean(window.__PIXEL_ROGUE__?.scene));
  await page.getByRole("button", { name: "开 始 冒 险" }).click();
  await page.waitForFunction(
    () => window.__PIXEL_ROGUE__!.core.state === "play",
  );
  await page.locator("#btn-pause").click();
  await expect(page.locator("#ov-pause")).toBeVisible();
  await page.locator("#btn-pause-settings").click();
  await expect(page.locator("#ov-input")).toBeVisible();
  await page.locator("#joy-mode-fixed").click();
  expect(
    await page.evaluate(() => localStorage.getItem("pixelrogue_joypad")),
  ).toBe(JSON.stringify({ v: 1, mode: "fixed" }));
  await page.locator("#btn-input-close").click();
  await expect(page.locator("#ov-input")).toBeHidden();

  await page.reload();
  await page.waitForFunction(() => Boolean(window.__PIXEL_ROGUE__?.scene));
  // 固定模式重启后常显锚点，说明持久化生效
  await expect(page.locator("#joy-base")).toBeVisible();
  expect(
    await page.evaluate(() => localStorage.getItem("pixelrogue_joypad")),
  ).toBe(JSON.stringify({ v: 1, mode: "fixed" }));
});

test("pause panel exposes the stats entry and returns to pause", async ({
  page,
}) => {
  // Issue #100：触屏没有 C 键，属性面板从暂停界面进入；关闭后必须回到暂停
  await page.goto("/");
  await page.waitForFunction(() => Boolean(window.__PIXEL_ROGUE__?.scene));
  await page.getByRole("button", { name: "开 始 冒 险" }).click();
  await page.waitForFunction(
    () => window.__PIXEL_ROGUE__!.core.state === "play",
  );
  await page.locator("#btn-pause").click();
  await expect(page.locator("#ov-pause")).toBeVisible();

  await page.locator("#btn-pause-stats").click();
  await expect(page.locator("#ov-stats")).toBeVisible();
  // #ov-stats(30) 低于 #ov-pause(60)：暂停面板必须先收起，否则属性被盖住
  await expect(page.locator("#ov-pause")).toBeHidden();
  await expect(page.locator("#btn-statclose")).toHaveText("返 回");
  expect(
    await page.evaluate(() => window.__PIXEL_ROGUE__!.core.state),
  ).toBe("stats");
  await expect(page.locator("#talent-list")).toBeVisible();

  await page.locator("#btn-statclose").click();
  await expect(page.locator("#ov-stats")).toBeHidden();
  await expect(page.locator("#ov-pause")).toBeVisible();
  expect(
    await page.evaluate(() => window.__PIXEL_ROGUE__!.core.state),
  ).toBe("pause");

  await page.locator("#btn-resume").click();
  await page.waitForFunction(
    () => window.__PIXEL_ROGUE__!.core.state === "play",
  );
});

test("portrait is gated by a rotate prompt, pauses the run, and does not auto-resume", async ({
  page,
}) => {
  // Issue #96（M2-1）：D2 定为强制横屏；竖屏只剩 390×219 窄条，继续跑模拟等于挨打
  await page.setViewportSize({ width: 844, height: 390 });
  await page.goto("/?touch=1");
  await page.waitForFunction(() => Boolean(window.__PIXEL_ROGUE__?.scene));
  await page.getByRole("button", { name: "开 始 冒 险" }).click();
  await page.waitForFunction(
    () => window.__PIXEL_ROGUE__!.core.state === "play",
  );
  await expect(page.locator("#ov-orient")).toBeHidden();

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator("#ov-orient")).toBeVisible();
  expect(
    await page.evaluate(() => window.__PIXEL_ROGUE__!.core.state),
  ).toBe("pause");

  // 转回横屏只收起遮罩，不自动恢复战斗（玩家可能正在看暂停里的信息）
  await page.setViewportSize({ width: 844, height: 390 });
  await expect(page.locator("#ov-orient")).toBeHidden();
  expect(
    await page.evaluate(() => window.__PIXEL_ROGUE__!.core.state),
  ).toBe("pause");

  await page.locator("#btn-resume").click();
  await page.waitForFunction(
    () => window.__PIXEL_ROGUE__!.core.state === "play",
  );
});

test("desktop is never blocked by the orientation gate", async ({ page }) => {
  // 非触屏设备即使窗口很窄也不该被横屏提示拦住
  await page.setViewportSize({ width: 420, height: 900 });
  await page.goto("/");
  await page.waitForFunction(() => Boolean(window.__PIXEL_ROGUE__?.scene));
  await expect(page.locator("#ov-orient")).toBeHidden();
  await expect(page.locator("#touch-layer")).toBeHidden();
});

/** 合成一次触控点按：pointerdown(touch) + click，复刻真机的事件顺序 */
async function tapByTouch(page: Page, target: Locator) {
  // 属性面板内部可滚动，标签可能在折叠区外；先滚进视口再取坐标
  await target.scrollIntoViewIfNeeded();
  const box = await target.boundingBox();
  if (!box) throw new Error("目标不可见");
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.evaluate(
    ({ x, y }) => {
      const el = document.elementFromPoint(x, y);
      if (!el || !el.closest("span[data-n]"))
        throw new Error("命中点不在天赋标签上");
      el.dispatchEvent(
        new PointerEvent("pointerdown", {
          pointerId: 21,
          pointerType: "touch",
          isPrimary: true,
          clientX: x,
          clientY: y,
          bubbles: true,
          cancelable: true,
        }),
      );
      el.dispatchEvent(
        new MouseEvent("click", {
          clientX: x,
          clientY: y,
          bubbles: true,
          cancelable: true,
        }),
      );
    },
    { x, y },
  );
}

test("talent tooltip opens, toggles closed on re-tap, and closes on outside tap", async ({
  page,
}) => {
  // Issue #96（M2-2）：触屏没有 mouseleave，原本点开就关不掉
  await page.setViewportSize({ width: 844, height: 390 });
  await page.goto("/?touch=1");
  await page.waitForFunction(() => Boolean(window.__PIXEL_ROGUE__?.scene));
  await page.getByRole("button", { name: "开 始 冒 险" }).click();
  await page.waitForFunction(
    () => window.__PIXEL_ROGUE__!.core.state === "play",
  );
  await page.evaluate(() => {
    const bridge = window.__PIXEL_ROGUE__!;
    for (const name of ["疾影步", "磨刃", "铁布衫"]) {
      const talent = bridge.talents.find((t) => t.n === name);
      if (!talent) throw new Error(`缺少天赋：${name}`);
      bridge.core.learnTalent(talent);
    }
  });
  await page.locator("#btn-pause").click();
  await page.locator("#btn-pause-stats").click();

  const tag = page.locator("#talent-list span[data-n]").first();
  const tip = page.locator("#talent-tooltip");

  await tapByTouch(page, tag);
  await expect(tip).toBeVisible();
  // 触屏最需要的能力：再点同一标签可以收起
  await tapByTouch(page, tag);
  await expect(tip).toBeHidden();

  await tapByTouch(page, tag);
  await expect(tip).toBeVisible();
  // 点面板空白处也收起（不依赖浏览器补发的 mouseover）
  await page.locator("#stat-combat").click();
  await expect(tip).toBeHidden();
});

test("hover-only rules are gated behind @media (hover: hover)", async ({
  page,
}) => {
  // 触屏上 :hover 会粘住（卡片放大、按钮变青底），因此这些规则必须被媒体查询包住
  await page.goto("/");
  await page.waitForFunction(() => Boolean(window.__PIXEL_ROGUE__?.scene));
  const result = await page.evaluate(() => {
    const gated: string[] = [];
    const topLevel: string[] = [];
    const walk = (rules: CSSRuleList, inHover: boolean) => {
      for (const rule of Array.from(rules)) {
        if (rule instanceof CSSMediaRule) {
          walk(
            rule.cssRules,
            inHover || rule.conditionText.includes("hover"),
          );
        } else if (rule instanceof CSSStyleRule && rule.selectorText.includes(":hover")) {
          if (inHover) gated.push(rule.selectorText);
          else topLevel.push(rule.selectorText);
        }
      }
    };
    for (const sheet of Array.from(document.styleSheets)) {
      try {
        walk(sheet.cssRules, false);
      } catch {
        // 跨域样式表（若未来引入）忽略
      }
    }
    return { gated, topLevel };
  });
  expect(result.gated).toEqual(
    expect.arrayContaining([
      ".btn:hover",
      "#bp-cards .card:hover",
      ".talent-tag:hover",
    ]),
  );
  expect(result.topLevel).toEqual([]);
});
