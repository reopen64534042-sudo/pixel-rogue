import { describe, expect, it } from "vitest";
import { fresh } from "./helpers";
import { UPGRADES } from "../src/game/data/talents";

describe("Issue #34 属性面板开着时底部面板命令仍可用", () => {
  it("rest + 属性面板开着：startNextWave 自动关闭面板并开波", () => {
    const g = fresh();
    g.state = "play";
    g.wavePhase = "rest";
    g.bpMode = "rest";
    g.pendingLevels = 0;
    g.toggleStats(); // 属性面板打开
    expect(g.state).toBe("stats");
    expect(g.startNextWave()).toBe(true); // 自动关闭并开波
    expect(g.state).toBe("play");
    expect(g.waveN).toBe(2);
  });

  it("rest + 属性面板开着：openSwap/melt 链路可用", () => {
    const g = fresh();
    g.state = "play";
    g.wavePhase = "rest";
    g.bpMode = "rest";
    const moRen = UPGRADES.find((u) => u.n === "磨刃");
    g.learnTalent(moRen!);
    g.learnTalent(moRen!); // 2 级 = 2 张普通卡
    g.toggleStats(); // 属性面板打开
    expect(g.state).toBe("stats");
    expect(g.openSwap()).toBe(true); // 自动关闭并打开置换
    expect(g.state).toBe("play");
    expect(g.setSwapTarget(1)).toBe(true);
    g.swSel = {};
    let put = 0;
    for (const [n, lv] of Object.entries(g.player.upCounts)) {
      const u = UPGRADES.find((x) => x.n === n);
      while (put < 2 && u && u.t === 0 && (g.swSel[n] || 0) < lv) {
        g.swSel[n] = (g.swSel[n] || 0) + 1;
        put++;
      }
      if (put >= 2) break;
    }
    expect(put).toBe(2);
    expect(g.melt()).not.toBe(null); // 属性面板开着也能熔炼
    expect(g.state).toBe("play");
  });

  it("关闭属性面板后 startNextWave 正常（回归保护）", () => {
    const g = fresh();
    g.state = "play";
    g.wavePhase = "rest";
    g.bpMode = "rest";
    g.toggleStats();
    g.toggleStats();
    expect(g.state).toBe("play");
    expect(g.startNextWave()).toBe(true);
  });
});
