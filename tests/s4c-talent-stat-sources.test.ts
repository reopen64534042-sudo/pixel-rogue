import { afterEach, describe, expect, it, vi } from "vitest";
import { enemy, fresh, learn, talent } from "./helpers";
import { getPlayerCombatStats } from "../src/game/core/CombatStats";
import {
  playerShadowFromEntity,
  playerShadowFromPicks,
} from "../src/game/core/StatSheets";
import type { GameCore } from "../src/game/core/GameCore";

// P3（第一轮评审）：恢复全局 Mock，防止 Math.random spy 跨测试泄漏污染
afterEach(() => {
  vi.restoreAllMocks();
});

/**
 * S4-C C1 聚焦测试：五张纯 flat 天赋（磐石/铁布衫/致命一击/会心深渊/
 * 元素亲和）的属性贡献由 core/TalentStatSources.ts 权威来源表声明，
 * 经 StatModel 解析后投影到 Player 兼容字段；Talent.f 不再写入。
 *
 * 断言分层：
 * - 旧权威基线逐位钉子（硬编码浮点尾，捕捉来源表/解析语义漂移）；
 * - S4-B shadow 双源对照（来源 B picks 独立重述 + 来源 A 实体恒等）；
 * - 全链路接入点（升级/宝箱/置换/重算）同步性与幂等；
 * - 非本批运行状态与 RNG 消耗不变；弹丸发射时快照不回溯。
 */
function learnOrder(g: GameCore, names: string[]) {
  for (const n of names) g.learnTalent(talent(n));
}

/** 非本批状态的运行时键（学习五张卡前后必须逐位不变） */
const RUNTIME_STATE_KEYS = [
  "hp",
  "shield",
  "shieldMax",
  "shieldCd",
  "dashT",
  "dashCharges",
  "dashRe",
  "dashLv",
  "haste",
  "hasteT",
  "hasteLv",
  "rageT",
  "rageLv",
  "ndUsed",
  "meteorT",
  "tempShield",
  "hurtCd",
  "orbA",
  "fireCd",
] as const;

function runtimeState(g: GameCore) {
  return JSON.stringify(
    Object.fromEntries(RUNTIME_STATE_KEYS.map((k) => [k, g.player[k]])),
  );
}

describe("S4-C C1 · 单级/满级基线钉子（旧权威逐位对照）", () => {
  it("磐石：×1 → 15，×3 → 45；未学习时键缺席", () => {
    const g = fresh();
    expect(g.player.defense).toBeUndefined();
    learn(g, "磐石");
    expect(g.player.defense).toBe(15);
    learn(g, "磐石", 2);
    expect(g.player.defense).toBe(45);
  });

  it("铁布衫：×1 → 0.1，×4 → 0.4（base 起始顺序累加逐位）", () => {
    const g = fresh();
    learn(g, "铁布衫");
    expect(g.player.tough).toBe(0.1);
    learn(g, "铁布衫", 3);
    expect(g.player.tough).toBe(0.4);
  });

  it("致命一击：×1 → 0.15000000000000002，×8 → 0.8499999999999999（≠ 分组 0.8500000000000001）", () => {
    const g = fresh();
    learn(g, "致命一击");
    expect(g.player.crit).toBe(0.15000000000000002);
    learn(g, "致命一击", 7);
    // flat 区语义钉子：base 起始逐次累加（S4-B 定论），先求和分组是另一浮点值
    expect(g.player.crit).toBe(0.8499999999999999);
    expect(g.player.crit).not.toBe(0.05 + 0.8);
  });

  it("会心深渊：×1 → 2.5，×4 → 4", () => {
    const g = fresh();
    learn(g, "会心深渊");
    expect(g.player.critMul).toBe(2.5);
    learn(g, "会心深渊", 3);
    expect(g.player.critMul).toBe(4);
  });

  it("元素亲和：×1 → 火/雷各 0.1，×3 → 0.30000000000000004（浮点尾逐位）", () => {
    const g = fresh();
    learn(g, "元素亲和");
    expect(g.player.typeDamageBonus?.fire).toBe(0.1);
    expect(g.player.typeDamageBonus?.lightning).toBe(0.1);
    learn(g, "元素亲和", 2);
    expect(g.player.typeDamageBonus?.fire).toBe(0.30000000000000004);
    expect(g.player.typeDamageBonus?.lightning).toBe(0.30000000000000004);
  });
});

describe("S4-C C1 · 觉醒边界与会心深渊组合", () => {
  it("致命一击×7 未觉醒：有效暴伤 2；×8 觉醒：2.4（读时判定）", () => {
    const g = fresh();
    learn(g, "致命一击", 7);
    expect(getPlayerCombatStats(g.player).critMultiplier).toBe(2);
    learn(g, "致命一击");
    expect(getPlayerCombatStats(g.player).critMultiplier).toBe(2.4);
    // 觉醒 +0.4 不烘焙进 p.critMul 字段（保持 critMultiplier() 兼容行为）
    expect(g.player.critMul).toBe(2);
  });

  it("致命一击×8 + 会心深渊×2 = 3.4，两种学习顺序都逐位一致", () => {
    for (const order of [
      [...Array(8).fill("致命一击"), "会心深渊", "会心深渊"],
      ["会心深渊", "会心深渊", ...Array(8).fill("致命一击")],
    ]) {
      const g = fresh();
      learnOrder(g, order);
      expect(g.player.critMul).toBe(3);
      expect(getPlayerCombatStats(g.player).critMultiplier).toBe(3.4);
    }
  });

  it("置换移除致命一击层级后觉醒按 upCounts 现值自动失效", () => {
    const g = fresh();
    learn(g, "致命一击", 8);
    expect(getPlayerCombatStats(g.player).critMultiplier).toBe(2.4);
    // 同档 t1 材料：致命一击 + 守护之刃 → 目标档 2（首选材料自动推导）
    learn(g, "守护之刃");
    g.wavePhase = "rest";
    g.openSwap();
    g.selectMaterial("致命一击");
    g.selectMaterial("守护之刃");
    vi.spyOn(Math, "random").mockReturnValue(0); // t2 池首 = 会心深渊
    g.melt();
    // upCounts["致命一击"] 8→7：低于 critMaxLevel，觉醒失效
    expect(g.player.upCounts["致命一击"]).toBe(7);
    expect(g.player.critMul).toBe(2.5);
    expect(getPlayerCombatStats(g.player).critMultiplier).toBe(2.5);
  });
});

describe("S4-C C1 · 交错顺序、shadow 双源对照与重算幂等", () => {
  const order = [
    "磐石",
    "元素亲和",
    "磐石",
    "铁布衫",
    "元素亲和",
    "致命一击",
    "磐石",
    "会心深渊",
    "致命一击",
  ];

  it("交错学习：五字段基线钉子逐位 + S4-B shadow 来源 B/来源 A 双对照", () => {
    const g = fresh();
    learnOrder(g, order);
    // 旧权威基线（重放语义）逐位钉子
    expect(g.player.defense).toBe(45);
    expect(g.player.tough).toBe(0.1);
    expect(g.player.crit).toBe(0.25);
    expect(g.player.critMul).toBe(2.5);
    expect(g.player.typeDamageBonus?.fire).toBe(0.2);
    expect(g.player.typeDamageBonus?.lightning).toBe(0.2);
    // 来源 B（picks 独立重述）与实体字段逐位一致
    const fromPicks = playerShadowFromPicks(g.player.picks);
    expect(fromPicks.defense).toBe(g.player.defense);
    expect(fromPicks.tough).toBe(g.player.tough);
    expect(fromPicks.critChance).toBe(g.player.crit);
    expect(fromPicks.critMultiplier).toBe(
      getPlayerCombatStats(g.player).critMultiplier,
    );
    expect(fromPicks.typeDamageBonus).toEqual(g.player.typeDamageBonus);
    // 来源 A（实体值打包）与来源 B 互相一致
    expect(playerShadowFromEntity(g.player)).toEqual(fromPicks);
  });

  it("重算幂等零重复叠加：recompute 两次后五字段与 picks 序列不变", () => {
    const g = fresh();
    learnOrder(g, order);
    const snapshot = () =>
      JSON.stringify({
        defense: g.player.defense,
        tough: g.player.tough,
        crit: g.player.crit,
        critMul: g.player.critMul,
        tdb: g.player.typeDamageBonus,
        picks: g.player.picks,
      });
    const before = snapshot();
    g.recompute();
    g.recompute();
    expect(snapshot()).toBe(before);
  });
});

describe("S4-C C1 · 获取路径：升级、宝箱、置换全链路同步", () => {
  it("宝箱强化（真实面板路径）与升级路径（learnTalent 为 chooseSlot 共用实现）同一卡同步更新", () => {
    const g = fresh();
    learn(g, "磐石");
    expect(g.player.defense).toBe(15);
    // 宝箱：只从已学未满级池抽 → 磐石必入池
    g.boxPicks = 1;
    g.openBoxPanel();
    expect(g.bpMode).toBe("box");
    expect(g.slots.map((s) => s.u.n)).toEqual(["磐石"]);
    expect(g.chooseSlot(0)).toBe(true);
    expect(g.player.defense).toBe(30);
    expect(g.bpMode).toBeNull();
    // 升级路径与宝箱分支共用 learnTalent（TalentSystem.chooseSlot 两分支）
    learn(g, "磐石");
    expect(g.player.defense).toBe(45);
  });

  it("置换：材料全部移除 → 输出卡获得 → defense 键删除、输出属性就位；随后重算幂等", () => {
    const g = fresh();
    learn(g, "磐石", 2);
    expect(g.player.defense).toBe(30);
    g.wavePhase = "rest";
    g.openSwap();
    g.setSwapTarget(2);
    g.selectMaterial("磐石");
    g.selectMaterial("磐石");
    vi.spyOn(Math, "random").mockReturnValue(0); // t2 池首 = 会心深渊
    const output = g.melt();
    expect(output?.n).toBe("会心深渊");
    expect(g.player.picks).toEqual(["会心深渊"]);
    expect(g.player.upCounts["磐石"]).toBeUndefined();
    expect(g.player.defense).toBeUndefined(); // 无来源 → 键删除（旧语义一致）
    expect(g.player.critMul).toBe(2.5);
    const critMulAfterMelt = g.player.critMul;
    g.recompute();
    expect(g.player.critMul).toBe(critMulAfterMelt);
    expect(g.player.defense).toBeUndefined();
  });

  it("置换：剩余材料层级保留（磐石×3 熔 2 → defense 15）", () => {
    const g = fresh();
    learn(g, "磐石", 3);
    g.wavePhase = "rest";
    g.openSwap();
    g.setSwapTarget(2);
    g.selectMaterial("磐石");
    g.selectMaterial("磐石");
    vi.spyOn(Math, "random").mockReturnValue(0);
    g.melt();
    expect(g.player.defense).toBe(15);
    expect(g.player.critMul).toBe(2.5);
  });

  it("置换输出元素亲和：typeDamageBonus 由投影重建（fire/lightning 键存在）", () => {
    const g = fresh();
    learn(g, "磐石", 2);
    g.wavePhase = "rest";
    g.openSwap();
    g.setSwapTarget(2);
    g.selectMaterial("磐石");
    g.selectMaterial("磐石");
    vi.spyOn(Math, "random").mockReturnValue(0.99); // t2 池末位 = 元素亲和
    const output = g.melt();
    expect(output?.n).toBe("元素亲和");
    expect(g.player.defense).toBeUndefined(); // 磐石来源全部移除
    expect(g.player.typeDamageBonus?.fire).toBe(0.1);
    expect(g.player.typeDamageBonus?.lightning).toBe(0.1);
  });

  it("P3：真实升级面板路径（openLevelPanel + chooseSlot）获得迁移天赋并立即投影", () => {
    const g = fresh();
    g.pendingLevels = 1;
    g.openLevelPanel();
    expect(g.bpMode).toBe("level");
    // S2：抽取池改为 18 张射手卡（旧表 retired），同一随机序列不再落到
    // 「磐石」。本用例验证「面板路径 → learnTalent → 投影立即生效」，
    // 与抽到哪张无关，因此显式注入，不把随机顺序当契约。
    g.slots = [
      { u: talent("磐石"), used: false },
      { u: talent("疾影步"), used: false },
      { u: talent("狂怒"), used: false },
    ];
    const idx = g.slots.findIndex((s) => s.u.n === "磐石");
    expect(idx).toBeGreaterThanOrEqual(0);
    const spy = vi.spyOn(Math, "random");
    const before = spy.mock.calls.length;
    expect(g.chooseSlot(idx)).toBe(true);
    // 学习步骤零额外 RNG（抽卡 RNG 只发生在 openLevelPanel）
    expect(spy.mock.calls.length).toBe(before);
    expect(g.player.defense).toBe(15); // 立即投影，无二次叠加
    expect(g.player.upCounts["磐石"]).toBe(1);
    expect(g.player.picks).toEqual(["磐石"]);
    expect(g.pendingLevels).toBe(0);
    expect(g.bpMode).toBeNull();
    expect(g.slots).toEqual([]);
  });
});

describe("S4-C C1 · P2 修订：typeDamageBonus 键级来源所有权", () => {
  it("预置 physical 非迁移键：学习磐石后保持不变", () => {
    const g = fresh();
    g.player.typeDamageBonus = { physical: 0.5 };
    learn(g, "磐石");
    expect(g.player.defense).toBe(15);
    expect(g.player.typeDamageBonus?.physical).toBe(0.5);
    expect(g.player.typeDamageBonus?.fire).toBeUndefined();
  });

  it("预置 physical：学习元素亲和后 physical 保留，fire/lightning 正确写入", () => {
    const g = fresh();
    g.player.typeDamageBonus = { physical: 0.5 };
    learn(g, "元素亲和");
    expect(g.player.typeDamageBonus?.physical).toBe(0.5);
    expect(g.player.typeDamageBonus?.fire).toBe(0.1);
    expect(g.player.typeDamageBonus?.lightning).toBe(0.1);
  });

  it("连续学习其他纯 flat 卡与元素亲和多次：无来源丢失、无重复叠加（绝对覆写）", () => {
    const g = fresh();
    g.player.typeDamageBonus = { physical: 0.5 };
    learn(g, "元素亲和");
    learn(g, "铁布衫");
    learn(g, "致命一击");
    learn(g, "会心深渊");
    learn(g, "元素亲和");
    expect(g.player.typeDamageBonus?.physical).toBe(0.5); // 全程保留
    expect(g.player.typeDamageBonus?.fire).toBe(0.2); // 绝对解析值，非 0.1+0.1 相加
    expect(g.player.typeDamageBonus?.lightning).toBe(0.2);
    expect(g.player.tough).toBe(0.1);
    expect(g.player.crit).toBe(0.15000000000000002);
    expect(g.player.critMul).toBe(2.5);
  });

  it("兼容边界：recompute/melt 路径沿用历史行为——非迁移键不保留（recompute 先整体删键）", () => {
    const g = fresh();
    g.player.typeDamageBonus = { physical: 0.5 };
    g.recompute();
    // recompute 的 S3-B 历史语义：先删整个 typeDamageBonus 键再重放，
    // 外部键在该路径不保留（本轮不修改，属 R 系列运行状态范畴之外的既有行为）
    expect(g.player.typeDamageBonus).toBeUndefined();
    // melt 内部调用 recompute，同样沿用
    const g2 = fresh();
    g2.player.typeDamageBonus = { physical: 0.5 };
    learn(g2, "磐石", 2);
    g2.wavePhase = "rest";
    g2.openSwap();
    g2.setSwapTarget(2);
    g2.selectMaterial("磐石");
    g2.selectMaterial("磐石");
    vi.spyOn(Math, "random").mockReturnValue(0); // t2 池首 = 会心深渊
    g2.melt();
    expect(g2.player.typeDamageBonus).toBeUndefined();
    expect(g2.player.critMul).toBe(2.5);
  });
});

describe("S4-C C1 · 非本批状态与 RNG 纪律", () => {
  it("学习五张卡不触碰当前 HP/护盾/冷却/狂热等运行状态", () => {
    const g = fresh();
    learn(g, "能量护盾");
    learn(g, "击杀狂热");
    learn(g, "疾影步");
    g.player.hp = 77;
    g.player.shield = 0; // 盾层已消耗
    g.player.dashT = 1.2; // 冲刺冷却中
    g.player.dashCharges = 0;
    g.player.hasteT = 0.5; // 狂热倒计时进行中
    g.player.rageT = 1.5;
    g.player.ndUsed = true;
    g.player.meteorT = 2.3;
    g.player.tempShield = 1;
    const before = runtimeState(g);
    learnOrder(g, ["磐石", "铁布衫", "致命一击", "会心深渊", "元素亲和"]);
    expect(runtimeState(g)).toBe(before);
  });

  it("learnTalent 消耗零随机数；melt 全流程恰好一次（输出池抽取）", () => {
    const g = fresh();
    learnOrder(g, ["磐石", "铁布衫", "致命一击", "会心深渊", "元素亲和"]);
    learn(g, "闪避本能"); // 凑同档 t0 材料
    const spy = vi.spyOn(Math, "random");
    const before = spy.mock.calls.length;
    learn(g, "磐石");
    expect(spy.mock.calls.length).toBe(before);
    g.wavePhase = "rest";
    g.openSwap();
    g.selectMaterial("铁布衫"); // 首选材料推导目标档 1
    g.selectMaterial("闪避本能");
    g.melt();
    expect(spy.mock.calls.length).toBe(before + 1);
  });
});

describe("S4-C C1 · 伤害管线单次乘区与弹丸快照", () => {
  it("元素亲和×1/×2：火系命中恰好 ×1.1/×1.2 一次（无重复乘区）", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.99); // 不暴击、不闪电
    const g = fresh();
    learn(g, "元素亲和");
    const e = enemy(g);
    e.hp = 999;
    e.maxhp = 999;
    g.hurtEnemy(e, 100, 0, 0, {
      src: "meteor",
      type: "fire",
      form: "other",
      noCrit: true,
      noChain: true,
    });
    expect(e.hp).toBe(999 - 110);
    learn(g, "元素亲和");
    g.hurtEnemy(e, 100, 0, 0, {
      src: "meteor",
      type: "fire",
      form: "other",
      noCrit: true,
      noChain: true,
    });
    expect(e.hp).toBe(999 - 230); // 110 + 120：第二跳恰 ×1.2
  });

  it("发射后学习天赋：在途弹丸按发射时快照结算，非迁移键保留且不回溯（P2 修订）", () => {
    const g = fresh();
    vi.spyOn(Math, "random").mockReturnValue(0.99);
    g.player.typeDamageBonus = { physical: 0.5 };
    const e = enemy(g, g.player.x + 30, g.player.y);
    e.hp = 9999;
    e.maxhp = 9999;
    e.speed = 0;
    g.player.fireCd = 0;
    g.update(1 / 60);
    expect(g.bullets).toHaveLength(1);
    learn(g, "元素亲和"); // 投影只管理 fire/lightning：physical 保留、火/雷就位
    expect(g.player.typeDamageBonus?.physical).toBe(0.5); // P2：非迁移键不清空
    expect(g.player.typeDamageBonus?.fire).toBe(0.1);
    for (let i = 0; i < 40 && g.dmgBy.bullet === 0; i++) g.update(1 / 60);
    expect(g.dmgBy.bullet).toBe(17); // 11 × 1.5（发射时快照，不回溯）
  });
});
