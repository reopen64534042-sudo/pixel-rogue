import { afterEach, describe, expect, it, vi } from "vitest";
import { applyOnAcquireEffect } from "../src/game/core/OnAcquireEffects";
import { fresh, learn, talent } from "./helpers";

/**
 * S4-C C3-A：生命上限权威迁移 + 获得时治疗分离 + 血包永久成长修复。
 *
 * 契约 docs/pixel-rogue-S4C-C3-contract-v1.md（v1.2）：
 * - G-1～G-5 / G-23 为契约 §7.2 已批准新行为的可执行验收（本批实施 C3-A）；
 * - 旧行为对照（旧 f 语义独立重述 legacyLife）证明学习路径与迁移前逐位一致；
 * - 结构钉子（f 空操作 / OnAcquire no-op 分发）咬住「旧 f 恢复写入被绝对
 *   投影掩盖」类变异（变异⑤/⑥ 的检测面）。
 *
 * R-1 反转见 tests/s4c-recompute-audit.test.ts（保留旧行为注释与批准编号）；
 * R-2/R-3/R-4 维持缺陷 pin 不动（C3-B/C3-C 范围）。
 */
// P3（第一轮评审先例）：恢复全局 Mock，防止 Math.random spy 跨测试泄漏污染
afterEach(() => {
  vi.restoreAllMocks();
});

/** 迁移前旧 f 语义的独立重述（不引用 talent.f / 来源表）：statBase 起点按 picks 顺序应用 */
function legacyLife(picks: string[]): { maxhp: number; hp: number } {
  let maxhp = 100;
  let hp = 100;
  for (const n of picks) {
    if (n === "生命之泉") {
      maxhp += 20;
      hp = maxhp;
    } else if (n === "巨人血脉") {
      maxhp += 30;
      hp += 30;
    }
  }
  return { maxhp, hp };
}

/** 真实路径累计 n 次满血转化（血包落在脚下 + 满血拾取，每次 +1） */
function growByConversions(g: ReturnType<typeof fresh>, n: number) {
  g.player.hp = g.player.maxhp;
  for (let i = 0; i < n; i++) {
    g.potions.push({ x: g.player.x, y: g.player.y });
    g.update(1 / 60);
  }
}

describe("S4-C C3-A · 契约 §7.2 验收（G-1～G-5 / G-23）", () => {
  it("G-1 血包永久成长与生命之泉叠加：recompute×3 maxhp=125 恒定", () => {
    const g = fresh();
    growByConversions(g, 5);
    expect(g.potionMaxHpGrow).toBe(5);
    expect(g.player.maxhp).toBe(105);
    learn(g, "生命之泉"); // 学习时回满至新上限 125
    expect(g.player.maxhp).toBe(125);
    expect(g.player.hp).toBe(125);
    g.recompute();
    g.recompute();
    g.recompute();
    expect(g.player.maxhp).toBe(125); // 成长（持久来源）+ 生命卡（picks）恒定
    expect(g.player.hp).toBe(125); // D-C3-05 夹紧：min(hpBefore, maxhp) 逐字保留
  });

  it("G-2 HP 已受伤时 recompute 不治疗：hp=40、maxhp=120 不变", () => {
    const g = fresh();
    learn(g, "生命之泉"); // 120/120（获得时回满只在 learnTalent 发生）
    g.player.hp = 40;
    g.recompute();
    expect(g.player.maxhp).toBe(120);
    expect(g.player.hp).toBe(40); // D-C3-05：max(1, min(hpBefore, maxhp))
  });

  it("G-3 当前 HP=0.5（浮点受击可产生）时 recompute 按旧公式抬升至 1", () => {
    const g = fresh();
    g.player.hp = 0.5;
    g.recompute();
    expect(g.player.hp).toBe(1); // max(1, …) 下限语义随 D-C3-05 冻结（契约 §2）
    expect(g.player.maxhp).toBe(100);
  });

  it("G-4 熔炉移除两级生命天赋：maxHp 重建为 100、HP 夹紧、输出卡正常学习", () => {
    const g = fresh();
    learn(g, "生命之泉");
    learn(g, "巨人血脉");
    expect(g.player.maxhp).toBe(150);
    expect(g.player.hp).toBe(150);
    g.wavePhase = "rest";
    g.openSwap();
    g.setSwapTarget(1);
    g.selectMaterial("生命之泉");
    g.selectMaterial("巨人血脉");
    vi.spyOn(Math, "random").mockReturnValue(0.8); // t1 池 12 项 idx 9 = 狂怒
    const output = g.melt();
    expect(output?.n).toBe("狂怒");
    expect(g.player.picks).toEqual(["狂怒"]);
    expect(g.player.maxhp).toBe(100); // 生命来源随材料移除、无成长来源 → 权威重建
    expect(g.player.hp).toBe(100); // max(1, min(150, 100))——上限降低夹紧
    expect(g.player.damage).toBe(13.2); // 输出卡经 learnTalent（携带实例持久来源）
  });

  it("G-5 换波保留累计成长、新游戏清零（potionGrow 每波计数语义不变）", () => {
    const g = fresh();
    growByConversions(g, 3);
    expect(g.potionMaxHpGrow).toBe(3);
    expect(g.player.maxhp).toBe(103);
    g.wavePhase = "rest";
    expect(g.startNextWave()).toBe(true);
    expect(g.potionGrow).toBe(0); // 每波转化计数重置（既有语义）
    expect(g.potionMaxHpGrow).toBe(3); // 持久来源跨换波保留（D-C3-01）
    expect(g.player.maxhp).toBe(103);
    g.resetGame();
    g.startGame();
    expect(g.potionMaxHpGrow).toBe(0); // 新游戏清零（契约 §6 生命⑤）
    expect(g.player.maxhp).toBe(100);
  });

  it("G-23 血包永久成长后学习无关天赋（磐石/磨刃）：maxHp 不丢失、投影各归其源", () => {
    const g = fresh();
    growByConversions(g, 3);
    expect(g.player.maxhp).toBe(103);
    learn(g, "磐石"); // C1 卡：defense 投影，与 maxHp 无关
    expect(g.player.defense).toBe(15);
    expect(g.player.maxhp).toBe(103); // 获得路径投影携带当前实例持久来源
    expect(g.player.hp).toBe(103); // 无关天赋学习不产生治疗副作用
    learn(g, "磨刃"); // C2-A 卡：攻击投影同样不丢来源
    expect(g.player.damage).toBe(12.100000000000001);
    expect(g.player.maxhp).toBe(103);
    g.recompute();
    g.recompute();
    expect(g.player.maxhp).toBe(103); // 重算幂等（成长恰好计一次）
    expect(g.player.defense).toBe(15);
    expect(g.player.damage).toBe(12.100000000000001);
    expect(g.player.hp).toBe(103);
  });
});

describe("S4-C C3-A · 旧行为对照与边界（任务书 §六.B）", () => {
  it("旧版生命效果独立对照：学习路径与旧 f 语义逐位一致（四种顺序）", () => {
    const orders = [
      ["生命之泉", "巨人血脉"],
      ["巨人血脉", "生命之泉"],
      ["生命之泉", "生命之泉", "巨人血脉"],
      ["巨人血脉", "生命之泉", "巨人血脉"],
    ];
    for (const order of orders) {
      const g = fresh();
      for (const n of order) learn(g, n);
      const legacy = legacyLife(order);
      expect(g.player.maxhp).toBe(legacy.maxhp);
      expect(g.player.hp).toBe(legacy.hp);
      g.recompute();
      // 重算后 maxhp 与旧 f 重放语义一致；hp 由夹紧保留（不重放治疗）
      expect(g.player.maxhp).toBe(legacy.maxhp);
    }
  });

  it("生命卡与 recompute 交错：受伤状态下重算不补血、继续学习时序正确", () => {
    // A：泉 → 受伤 → 血脉 → 重算
    const a = fresh();
    learn(a, "生命之泉"); // 120/120
    a.player.hp = 40;
    learn(a, "巨人血脉"); // 150/70（+30 不夹紧）
    a.recompute(); // maxhp 投影重建；hp=70（旧行为重放后也被夹回 70，可观测一致）
    expect(a.player.maxhp).toBe(150);
    expect(a.player.hp).toBe(70);
    // B：血脉 → 受伤 → 泉 → 重算
    const b = fresh();
    learn(b, "巨人血脉"); // 130/130
    b.player.hp = 40;
    learn(b, "生命之泉"); // 150/150（回满）
    b.recompute();
    expect(b.player.maxhp).toBe(150);
    expect(b.player.hp).toBe(150);
  });

  it("宝箱强化获得生命卡：chooseSlot → learnTalent 全链路获得时回满", () => {
    const g = fresh();
    learn(g, "生命之泉"); // 已学 1 级（box 候选要求已学未满级）
    g.player.hp = 50;
    g.bpMode = "box";
    g.boxPicks = 1;
    g.slots = [{ u: talent("生命之泉"), used: false }];
    expect(g.chooseSlot(0)).toBe(true);
    expect(g.player.maxhp).toBe(140); // 120 + 20（权威投影）
    expect(g.player.hp).toBe(140); // 获得时回满（OnAcquire，箱强化路径同样触发一次）
    expect(g.boxPicks).toBe(0);
    expect(g.bpMode).toBeNull();
  });

  it("重复学习生命之泉至满级（99 级）；满级再学失败且无治疗副作用", () => {
    const g = fresh();
    for (let i = 0; i < 99; i++) learn(g, "生命之泉");
    expect(g.player.upCounts["生命之泉"]).toBe(99);
    expect(g.player.maxhp).toBe(100 + 99 * 20);
    expect(g.player.hp).toBe(g.player.maxhp); // 每次获得都回满
    const hpBefore = g.player.hp;
    const picksBefore = g.player.picks.length;
    expect(g.learnTalent(talent("生命之泉"))).toBe(false); // 满级路径早退
    expect(g.player.hp).toBe(hpBefore); // 失败路径零治疗副作用
    expect(g.player.picks.length).toBe(picksBefore);
    expect(g.player.maxhp).toBe(100 + 99 * 20);
  });

  it("多波血包成长累计超单波上限：每波守 POTION_GROW_CAP，跨波累计保留", () => {
    const g = fresh();
    growByConversions(g, 10);
    expect(g.potionGrow).toBe(10);
    expect(g.potionMaxHpGrow).toBe(10);
    expect(g.player.maxhp).toBe(110);
    growByConversions(g, 1); // 第 11 瓶：本波已达上限，不再成长
    expect(g.potionGrow).toBe(10);
    expect(g.potionMaxHpGrow).toBe(10);
    expect(g.player.maxhp).toBe(110);
    g.wavePhase = "rest";
    g.startNextWave();
    expect(g.potionGrow).toBe(0); // 每波计数清零
    expect(g.potionMaxHpGrow).toBe(10); // 累计成长保留
    growByConversions(g, 10); // 第二波再转化 10
    expect(g.potionGrow).toBe(10);
    expect(g.potionMaxHpGrow).toBe(20); // 跨波累计 20（>单波上限 10）
    expect(g.player.maxhp).toBe(120);
  });

  it("置换：生命卡与伤害卡混合熔炼（melt 经实例持久来源），输出卡获得一次效果", () => {
    const g = fresh();
    learn(g, "生命之泉"); // 120/120
    learn(g, "磨刃"); // damage 12.1…，hp 不变
    g.wavePhase = "rest";
    g.openSwap();
    g.setSwapTarget(1);
    g.selectMaterial("生命之泉");
    g.selectMaterial("磨刃");
    vi.spyOn(Math, "random").mockReturnValue(0.8); // t1 池 idx 9 = 狂怒
    const output = g.melt();
    expect(output?.n).toBe("狂怒");
    expect(g.player.picks).toEqual(["狂怒"]);
    expect(g.player.maxhp).toBe(100); // 生命材料移除、无成长 → 重建 100
    expect(g.player.hp).toBe(100); // max(1, min(120, 100))
    expect(g.player.damage).toBe(13.2); // 输出卡仅一次投影效果（melt→learnTalent）
    g.recompute();
    expect(g.player.damage).toBe(13.2); // 重算幂等，无二次叠加
    expect(g.player.maxhp).toBe(100);
  });

  it("回归：永久成长 3 + 双生命卡 153 → 置换移除后 103、成长保留且输出卡仅学一次", () => {
    const g = fresh();
    growByConversions(g, 3); // 真实满血血包入口累计 potionMaxHpGrow=3
    expect(g.potionMaxHpGrow).toBe(3);
    expect(g.player.maxhp).toBe(103);
    learn(g, "生命之泉"); // 123/123
    learn(g, "巨人血脉"); // 153/153
    expect(g.player.maxhp).toBe(153);
    expect(g.player.hp).toBe(153);

    g.wavePhase = "rest";
    g.openSwap();
    g.setSwapTarget(1);
    g.selectMaterial("生命之泉");
    g.selectMaterial("巨人血脉");
    vi.spyOn(Math, "random").mockReturnValue(0.8); // t1 池 idx 9 = 狂怒
    const hpBeforeMelt = g.player.hp; // 153：recompute 的 hpBefore
    const output = g.melt();

    expect(output?.n).toBe("狂怒");
    expect(g.player.picks).toEqual(["狂怒"]);
    expect(g.player.upCounts["生命之泉"]).toBeUndefined();
    expect(g.player.upCounts["巨人血脉"]).toBeUndefined();
    expect(g.player.upCounts["狂怒"]).toBe(1); // 输出卡恰好学习一次
    expect(g.player.picks.filter((n) => n === "狂怒")).toHaveLength(1);
    expect(g.player.maxhp).toBe(103); // 100 + 持久成长 3，生命卡来源已移除
    expect(g.player.hp).toBe(
      Math.max(1, Math.min(hpBeforeMelt, g.player.maxhp)),
    ); // D-C3-05 原公式：max(1, min(153, 103)) = 103
    expect(g.player.hp).toBe(103);
    expect(g.potionMaxHpGrow).toBe(3); // 置换不移除实例级持久来源
    expect(g.player.damage).toBe(13.2); // 输出卡经 learnTalent 投影恰好一次

    g.recompute();
    g.recompute();
    expect(g.player.maxhp).toBe(103); // 后续重算仍以持久来源重建
    expect(g.potionMaxHpGrow).toBe(3);
    learn(g, "磐石"); // 无关卡学习不丢成长、不重复治疗
    expect(g.player.maxhp).toBe(103);
    expect(g.player.hp).toBe(103);
    expect(g.player.defense).toBe(15);
    expect(g.player.upCounts["狂怒"]).toBe(1); // 无关卡学习不重复输出卡
  });

  it("C3-A 结构契约：两张生命卡 f 为空操作（直接调用后 Player 全字段 JSON 不变）", () => {
    const g = fresh();
    const before = JSON.stringify(g.player);
    talent("生命之泉").f(g.player);
    talent("巨人血脉").f(g.player);
    expect(JSON.stringify(g.player)).toBe(before);
  });

  it("C3-A 结构契约：OnAcquireEffects 对未登记卡 no-op（不误伤其他天赋）", () => {
    const g = fresh();
    const before = JSON.stringify(g.player);
    applyOnAcquireEffect("磨刃", g.player, 0);
    applyOnAcquireEffect("击杀狂热", g.player, 0);
    applyOnAcquireEffect("能量护盾", g.player, 0);
    expect(JSON.stringify(g.player)).toBe(before);
  });
});
