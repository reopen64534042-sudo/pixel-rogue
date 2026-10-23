import { test, expect } from "@playwright/test";
test("upstream v8 source visual and same-name furnace defect baseline", async ({
  page,
}) => {
  await page.goto("/legacy/upstream-v8.html");
  await page.locator("#btn-start").click();
  await page.evaluate('state="pause"; cam.x=600;cam.y=481;draw();');
  await page.screenshot({ path: "output/playwright/upstream-v8-world.png" });
  const selection = await page.evaluate(`(()=>{
    resetGame();state='play';muted=true;
    player.upCounts={'磨刃':2};player.picks=['磨刃','磨刃'];
    enterRest();document.getElementById('bp-swapbtn').click();setSwTarget(1);
    document.querySelector('#sw-inv span').click();const first=swSelCount();
    document.querySelector('#sw-inv span').click();return {first,second:swSelCount()};
  })()`);
  expect(selection).toEqual({ first: 1, second: 0 });
});
