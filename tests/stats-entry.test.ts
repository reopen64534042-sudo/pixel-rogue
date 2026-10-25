import { describe, expect, it } from "vitest";
import { fresh, ticks } from "./helpers";

/**
 * Issue #100：属性面板入口。
 *
 * 触屏没有 C 键，属性面板改从暂停界面进入。关键约束是**来源可回溯**：
 * 从暂停点进来的，关闭后必须回到暂停，不能直接恢复战斗。
 * 同时键盘路径（play↔stats）与 `ensurePlay()` 的既有语义必须原样。
 */
describe("stats panel entry from pause", () => {
  it("opens from pause and returns to pause instead of resuming battle", () => {
    const g = fresh();
    g.togglePause();
    expect(g.state).toBe("pause");
    expect(g.openStatsFromPause()).toBe(true);
    expect(g.state).toBe("stats");
    expect(g.statsFrom).toBe("pause");

    g.toggleStats();

    expect(g.state).toBe("pause");
    // 来源复位，下一次从战斗打开仍是「返回战斗」
    expect(g.statsFrom).toBe("play");
  });

  it("keeps the simulation frozen while the panel is open", () => {
    const g = fresh();
    g.togglePause();
    g.openStatsFromPause();
    const time = g.time;
    const x = g.player.x;
    g.setMoveAxis(1, 0);
    ticks(g, 30);
    expect(g.time).toBe(time);
    expect(g.player.x).toBe(x);
  });

  it("rejects the entry when not paused", () => {
    const g = fresh();
    expect(g.state).toBe("play");
    expect(g.openStatsFromPause()).toBe(false);
    expect(g.state).toBe("play");
    expect(g.statsFrom).toBe("play");
  });

  it("keeps the keyboard path play <-> stats unchanged", () => {
    const g = fresh();
    g.toggleStats();
    expect(g.state).toBe("stats");
    expect(g.statsFrom).toBe("play");
    g.toggleStats();
    expect(g.state).toBe("play");
  });

  it("still forces back to play for panel commands (Issue #34)", () => {
    const g = fresh();
    g.togglePause();
    g.openStatsFromPause();
    expect(g.state).toBe("stats");
    g.ensurePlay();
    expect(g.state).toBe("play");
    expect(g.statsFrom).toBe("play");
  });

  it("resets the source when a new run starts", () => {
    const g = fresh();
    g.togglePause();
    g.openStatsFromPause();
    g.startGame();
    expect(g.state).toBe("play");
    expect(g.statsFrom).toBe("play");
  });
});
