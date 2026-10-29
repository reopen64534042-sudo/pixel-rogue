import { afterEach, describe, expect, it, vi } from "vitest";
import { fresh, learn, talent, enemy, ticks, seeded, skipAttrs } from "./helpers";
import { UPGRADES, RAMP, TIER_VAL } from "../src/game/data/talents";
import { WORLD } from "../src/game/data/constants";
import { FixedClock } from "../src/game/core/FixedClock";
afterEach(() => vi.restoreAllMocks());

describe("game flow and state", () => {
  it("starts, moves at 62px/s, clamps all four borders", () => {
    const g = fresh();
    g.keys.d = true;
    ticks(g, 60);
    expect(g.player.x).toBeCloseTo(WORLD.w / 2 + 62, 8);
    for (const [key, axis, target] of [
      ["d", "x", WORLD.w - 24],
      ["a", "x", 24],
      ["s", "y", WORLD.h - 24],
      ["w", "y", 24],
    ] as const) {
      g.keys = { [key]: true };
      g.player[axis] = target;
      ticks(g, 1);
      expect(g.player[axis]).toBe(target);
    }
  });
  it("selects nearest target, auto-fires, kills and drops XP", () => {
    const g = fresh();
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    const far = enemy(g, g.player.x + 80),
      near = enemy(g, g.player.x + 25);
    near.hp = 10;
    expect(g.nearestEnemy(g.player.x, g.player.y, 230)).toBe(near);
    ticks(g, 12);
    expect(near.dead).toBe(true);
    expect(g.kills).toBe(1);
    expect(g.dmgBy.bullet).toBe(11);
    expect(far.hp).toBe(19);
    expect(g.gems.length + g.player.xp).toBeGreaterThan(0);
  });
  it("XP levels but no longer grants talents (S2: node elites do)", () => {
    const g = fresh();
    g.gems.push({ x: g.player.x, y: g.player.y, vx: 0, vy: 0, v: 8 });
    ticks(g, 1);
    expect(g.player.lvl).toBe(2);
    expect(g.player.xpNext).toBe(7);
    // S2：天赋发放从「升级」改为「每 4 波节点精英 + 终局」（一局 8 次）。
    // 等级只保留怪物强度采样与 HUD 显示两个职责，不再产生待选天赋。
    expect(g.pendingLevels).toBe(0);
    expect(g.phase).toBe("play"); // 升级不再立即弹面板
    // 面板本身的交互不变：仍可手动开、仍不暂停模拟、选完仍在 rest 收尾
    g.pendingLevels = 1;
    g.openLevelPanel();
    expect(g.phase).toBe("levelup");
    const slots = g.slots;
    g.openLevelPanel();
    expect(g.slots).toBe(slots);
    const time = g.time;
    ticks(g, 1);
    expect(g.time).toBeGreaterThan(time); // 模拟仍不暂停
    expect(g.chooseSlot(0)).toBe(true);
    expect(g.player.picks).toHaveLength(1);
    expect(g.pendingLevels).toBe(0);
    expect(g.chooseSlot(0)).toBe(false);
  });
  it("P and C freeze time, cooldowns, movement and enemies; resume works", () => {
    const g = fresh();
    enemy(g);
    g.keys.d = true;
    for (const toggle of [() => g.togglePause(), () => g.toggleStats()]) {
      toggle();
      const before = JSON.stringify({ p: g.player, e: g.enemies, t: g.time });
      ticks(g, 120);
      expect(JSON.stringify({ p: g.player, e: g.enemies, t: g.time })).toBe(
        before,
      );
      toggle();
    }
    ticks(g, 1);
    expect(g.time).toBeGreaterThan(0);
  });
  it("fight → collect → rest cascades level picks → report/swap → next wave is guarded (Issue #67)", () => {
    const g = fresh();
    skipAttrs(g); // 本用例验证「升级 → 宝箱 → 报告」链，属性面板另有用例覆盖
    expect(g.startNextWave()).toBe(false);
    g.spawnedThisWave = g.quota;
    g.gems.push({ x: g.player.x + 5, y: g.player.y, vx: 0, vy: 0, v: 8 });
    ticks(g, 1);
    expect(g.wavePhase).toBe("collect");
    // S2：升级不再产生待选天赋（改由节点精英发放），本用例已清空属性额度，
    // 所以收齐经验球后直接进入报告/置换。
    expect(g.pendingLevels).toBe(0);
    ticks(g, 2);
    expect(g.wavePhase).toBe("rest");
    expect(g.phase).toBe("report");
    expect(g.openSwap()).toBe(true);
    expect(g.phase).toBe("swap");
    g.player.barrierLv = 2;
    g.player.ndUsed = true;
    expect(g.startNextWave()).toBe(true);
    expect(g.waveN).toBe(2);
    expect(g.quota).toBe(30);
    expect(g.player.tempShield).toBe(2);
    expect(g.player.ndUsed).toBe(false);
    expect(g.startNextWave()).toBe(false);
  });
  it("fourth wave first spawn is elite and type unlocks are preserved", () => {
    const g = fresh();
    g.waveN = 4;
    g.spawnCd = 0;
    ticks(g, 1);
    expect(g.enemies[0]).toMatchObject({ type: "brute", elite: true, xp: 25 });
    const start = fresh();
    for (let i = 0; i < 20; i++) start.spawnEnemy();
    expect(start.enemies.every((e) => e.type === "slime")).toBe(true);
  });
  it("death records once and restart resets every run field", () => {
    const g = fresh();
    g.damagePlayer(101);
    expect(g.phase).toBe("over");
    expect(g.storage.read()).toHaveLength(1);
    g.gameOver();
    expect(g.storage.read()).toHaveLength(1);
    g.keys.d = true;
    g.swSel.test = 2;
    g.slots = [{ u: talent("磨刃"), used: true }];
    g.startGame();
    expect(g.phase).toBe("play");
    expect(g.player.hp).toBe(100);
    expect(g.player.lvl).toBe(1);
    expect(g.player.picks).toEqual([]);
    expect(g.enemies).toEqual([]);
    expect(g.keys).toEqual({});
    expect(g.slots).toEqual([]);
    expect(g.swSel).toEqual({});
    expect(g.waveN).toBe(1);
    expect(g.time).toBe(0);
  });
  it.each([30, 60, 120, 144])("fixed step gives same second at %iHz", (hz) => {
    const g = fresh(),
      clock = new FixedClock();
    g.keys.d = true;
    for (let i = 0; i < hz; i++) clock.advance(1 / hz, (dt) => g.step(dt));
    expect(g.time).toBeCloseTo(1, 8);
    expect(g.player.x).toBeCloseTo(WORLD.w / 2 + 62, 8);
  });
});

describe("34 talents, card pools and combat", () => {
  it("retains 56 unique names, wave-based tier ramp and chain prerequisites", () => {
    // S2：41 张旧表（retired）+ 18 张射手池
    expect(UPGRADES).toHaveLength(56);
    expect(new Set(UPGRADES.map((u) => u.n)).size).toBe(56);
    const g = fresh();
    // S2：稀有度按**波次**分档（v40 按 player.lvl）
    for (const r of RAMP) {
      g.waveN = r.min;
      expect(g.tierWeights()).toEqual(r.w);
    }
    // 旧卡「双段疾冲」已随 S2 删除；射手机动槽的「双段疾冲」接管该卡位
    expect(g.canOffer(talent("双段疾冲"))).toBe(true);
    // 新卡链式依赖：未持有 L1 时 L2 不进池
    expect(g.canOffer(talent("弹道贯穿"))).toBe(false);
    learn(g, "破甲箭");
    expect(g.canOffer(talent("弹道贯穿"))).toBe(true);
  });
  it("caps every talent and excludes capped choices", () => {
    const g = fresh();
    vi.spyOn(Math, "random").mockImplementation(seeded());
    for (const u of UPGRADES) g.player.upCounts[u.n] = u.max;
    expect(g.rollPicks()).toEqual([]);
    expect(g.rollOne([])).toBe(null);
    g.player.upCounts = {};
    // S2：删除了 DMG_POOL 硬保底——新体系天赋不提供伤害，保底会把清场卡
    // 强行塞进三选一。这里改为断言「三张互不重复、且不带前置不进池」。
    for (let i = 0; i < 100; i++) {
      const picks = g.rollPicks();
      expect(new Set(picks).size).toBe(3);
      expect(picks.every((u) => u.t < 3)).toBe(true);
    }
    learn(g, "疾速扳机", 8);
    expect(g.learnTalent(talent("疾速扳机"))).toBe(false);
  });
  it("each of three cards refreshes once, no duplicate peers or accidental selection", () => {
    const g = fresh();
    g.pendingLevels = 1;
    g.openLevelPanel();
    for (let i = 0; i < 3; i++) {
      expect(g.refreshSlot(i)).toBe(true);
      expect(g.refreshSlot(i)).toBe(false);
      expect(g.slots.filter((s) => s.used)).toHaveLength(i + 1);
    }
    expect(new Set(g.slots.map((s) => s.u.n)).size).toBe(3);
    expect(g.pendingLevels).toBe(1);
    expect(g.player.picks).toEqual([]);
    g.togglePause();
    expect(g.chooseSlot(0)).toBe(false);
    expect(g.refreshSlot(0)).toBe(false);
  });
  it("critical damage rounds once, honors noCrit and lifesteals dealt damage", () => {
    const g = fresh();
    g.player.crit = 1;
    g.player.lifesteal = 0.1;
    g.player.hp = 50;
    const e = enemy(g);
    e.hp = e.maxhp = 100;
    g.hurtEnemy(e, 10.6, 0, 0, { src: "bullet" });
    expect(e.hp).toBe(79);
    expect(g.player.hp).toBeCloseTo(52.1);
    expect(g.dmgBy.bullet).toBe(21);
    g.hurtEnemy(e, 10.6, 0, 0, { noCrit: true, src: "chain" });
    expect(e.hp).toBe(68);
  });
  it("temporary shield before normal shield, reduction and per-wave death prevention", () => {
    const g = fresh();
    g.player.tempShield = 1;
    g.player.shield = 1;
    g.damagePlayer(20);
    expect(g.player.hp).toBe(100);
    expect(g.player.shield).toBe(1);
    g.damagePlayer(20);
    expect(g.player.hp).toBe(100);
    expect(g.player.shield).toBe(0);
    expect(g.player.shieldCd).toBe(10);
    g.player.tough = 0.2;
    g.damagePlayer(20);
    expect(g.player.hp).toBe(84);
    learn(g, "不屈");
    g.damagePlayer(1000);
    expect(g.player.hp).toBe(1);
    expect(g.phase).toBe("play");
    g.damagePlayer(1000);
    expect(g.phase).toBe("over");
  });
  it("dash requires unlock, then consumes charges and recharges", () => {
    const g = fresh();
    g.keys[" "] = true;
    ticks(g, 1);
    expect(g.player.dashT).toBeLessThan(0);
    expect(g.player.dashCharges).toBe(1);
    learn(g, "疾影步");
    ticks(g, 1);
    expect(g.player.dashT).toBeGreaterThan(0);
    expect(g.player.dashCharges).toBe(0);
    g.keys = {};
    ticks(g, 121);
    expect(g.player.dashCharges).toBe(1);
    learn(g, "双段疾冲");
    ticks(g, 121);
    expect(g.player.dashCharges).toBe(2);
  });
  it.each(["pierce", "jumps"] as const)(
    "%s hits multiple enemies with 0.85 damage decay",
    (mechanic) => {
      const g = fresh();
      vi.spyOn(Math, "random").mockReturnValue(0.5);
      g.player.fireCd = 10;
      const a = enemy(g, g.player.x + 10),
        b = enemy(g, g.player.x + 35);
      a.hp = b.hp = 100;
      g.bullets.push({
        x: a.x - 3,
        y: a.y,
        vx: 170,
        vy: 0,
        dmg: 11,
        pierce: mechanic === "pierce" ? 1 : 0,
        falloff: 0.85,
        jumps: mechanic === "jumps" ? 1 : 0,
        life: 1.4,
        size: 2,
        hitList: [],
      });
      ticks(g, 15);
      expect(a.hp).toBe(89);
      expect(b.hp).toBe(91);
      expect(g.bullets).toHaveLength(0);
    },
  );
  it("mechanism attacks execute real damage, not visual-only effects", () => {
    const g = fresh();
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    for (const n of [
      "雷霆连锁",
      "烈焰印记",
      "星辰坠落",
      "守护之刃",
      "屠戮之欲",
    ])
      learn(g, n);
    const a = enemy(g),
      b = enemy(g, g.player.x + 27);
    a.hp = b.hp = 1000;
    g.hurtEnemy(a, 11, 0, 0, { src: "bullet" });
    expect(g.dmgBy.chain).toBeGreaterThan(0);
    expect(a.burnT).toBe(2);
    g.player.meteorT = 0;
    ticks(g, 55);
    expect(g.dmgBy.meteor).toBeGreaterThan(0);
    expect(g.dmgBy.orbit).toBeGreaterThan(0);
    expect(g.dmgBy.burn).toBeGreaterThan(0);
    g.killEnemy(a);
    expect(g.dmgBy.explode).toBeGreaterThan(0);
  });
});

describe("furnace economics and regressions", () => {
  it("per-wave report excludes earlier waves while stored totals stay cumulative", () => {
    const g = fresh();
    g.dmgBy.bullet = 100;
    g.enterRest();
    expect(g.waveDamage().bullet).toBe(100);
    g.startNextWave();
    g.dmgBy.bullet += 30;
    g.enterRest();
    expect(g.waveDamage().bullet).toBe(30);
    expect(g.dmgBy.bullet).toBe(130);
    g.gameOver();
    expect(g.storage.read()[0].dmg.bullet).toBe(130);
  });
  it.each([1, 2, 3])(
    "two tier %i-1 levels → one next tier, value conserved",
    (target) => {
      const g = fresh(),
        u = UPGRADES.find((u) => u.t === target - 1 && !u.req)!;
      learn(g, u.n, 2);
      g.wavePhase = "rest";
      g.openSwap();
      expect(g.setSwapTarget(target)).toBe(true);
      expect(g.selectMaterial(u.n)).toBe(true);
      expect(g.selectedCount()).toBe(1);
      g.selectMaterial(u.n);
      expect(g.selectedCount()).toBe(2);
      const before = g.player.picks.reduce(
        (a, n) => a + TIER_VAL[talent(n).t],
        0,
      );
      const output = g.melt();
      expect(output?.t).toBe(target);
      expect(g.player.picks).toHaveLength(1);
      expect(g.player.upCounts[u.n]).toBeUndefined();
      expect(TIER_VAL[output!.t]).toBe(before);
      expect(g.melt()).toBe(null);
    },
  );
  it("two distinct cards work; stale, wrong-tier and inflated material cannot destroy inventory", () => {
    const g = fresh();
    learn(g, "磨刃");
    learn(g, "强化弹丸");
    g.wavePhase = "rest";
    g.openSwap();
    g.setSwapTarget(1);
    g.selectMaterial("磨刃");
    g.selectMaterial("强化弹丸");
    const before = [...g.player.picks];
    g.swSel = { 不存在: 2 };
    expect(g.melt()).toBe(null);
    expect(g.player.picks).toEqual(before);
    g.swSel = { 磨刃: 2 };
    expect(g.melt()).toBe(null);
    expect(g.player.picks).toEqual(before);
    g.swSel = { 磨刃: 1, 强化弹丸: 1 };
    expect(g.melt()).not.toBe(null);
    expect(g.player.picks).toHaveLength(1);
  });
  // 基线更新依据：Issue #74（用户实测置换界面无法选材）——两步式下不再预设目标档
  it("two-step swap: target tier derived from first material, mixed tiers rejected", () => {
    const g = fresh();
    learn(g, "磨刃");
    learn(g, "强化弹丸");
    const rare = UPGRADES.find((u) => u.t === 1 && !u.req)!.n;
    learn(g, rare, 2); // 两级才能作为 2 个等级的材料投入
    g.wavePhase = "rest";
    g.openSwap();
    expect(g.swTarget).toBe(0);
    expect(g.selectMaterial("磨刃")).toBe(true);
    expect(g.swTarget).toBe(1); // 首选材料自动推导目标档
    expect(g.selectedCount()).toBe(1);
    expect(g.selectMaterial(rare)).toBe(false); // 稀有度不一致直接拒绝
    expect(g.selectedCount()).toBe(1);
    expect(g.selectMaterial("强化弹丸")).toBe(true);
    expect(g.selectedCount()).toBe(2);
    // 全部取消后目标档回退，允许改选其他档位
    g.selectMaterial("磨刃");
    g.selectMaterial("强化弹丸");
    expect(g.selectedCount()).toBe(0);
    expect(g.swTarget).toBe(0);
    expect(g.selectMaterial(rare)).toBe(true);
    expect(g.swTarget).toBe(2);
    g.selectMaterial(rare);
    vi.spyOn(Math, "random").mockReturnValue(0);
    const output = g.melt();
    expect(output?.t).toBe(2);
    expect(g.player.upCounts[rare]).toBeUndefined();
  });
  it("recomputes removed damage and preserves current HP; selection cycles back to zero", () => {
    const g = fresh();
    learn(g, "强化弹丸", 2);
    expect(g.player.boltDmgMul).toBeCloseTo(1.5625);
    expect(g.player.damage).toBe(11);
    g.player.hp = 40;
    g.wavePhase = "rest";
    g.openSwap();
    g.setSwapTarget(1);
    g.selectMaterial("强化弹丸");
    g.selectMaterial("强化弹丸");
    g.selectMaterial("强化弹丸");
    expect(g.selectedCount()).toBe(0);
    g.selectMaterial("强化弹丸");
    g.selectMaterial("强化弹丸");
    vi.spyOn(Math, "random").mockReturnValue(0);
    g.melt();
    expect(g.player.boltDmgMul).toBe(1);
    expect(g.player.damage).toBe(11);
    expect(g.player.hp).toBe(40);
  });
  it("all 56 talents provide cur(p) returning current effective value descriptions", () => {
    const g = fresh();
    const talents = UPGRADES;
    expect(talents).toHaveLength(56);
    for (const t of talents) {
      expect(typeof t.cur).toBe("function");
      const desc = t.cur!(g.player);
      expect(desc).toBeTruthy();
      expect(typeof desc).toBe("string");
    }
    learn(g, "疾影步");
    const dash = talents.find((u) => u.n === "疾影步")!;
    expect(dash.cur!(g.player)).toContain("2.0s");
  });
});
