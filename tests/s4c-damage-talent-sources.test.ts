import { afterEach, describe, expect, it, vi } from "vitest";
import { enemy, fresh, learn, talent, ticks } from "./helpers";
import { statBase } from "../src/game/data/stats";
import {
  boltDamage,
  burnGroundDps,
  burnStackDps,
  meteorDamage,
  shieldShockDamage,
} from "../src/game/core/DamageMath";
import { applyTalentStatProjection } from "../src/game/core/TalentStatSources";
import type { GameCore } from "../src/game/core/GameCore";

// P3（C1 先例）：恢复全局 Mock，防止 Math.random spy 跨测试泄漏污染
afterEach(() => {
  vi.restoreAllMocks();
});

/**
 * S4-C C2-A 聚焦测试：三张全局基础伤害乘法天赋（磨刃/狂怒/毁灭本能）的
 * damage 逐次乘算贡献由 core/TalentStatSources.ts 权威来源表声明
 * （StatModel attack final 区按 picks 顺序连乘），Talent.f 不再写入。
 *
 * 断言分层：
 * - 旧实现基准逐位对照：legacyDamage 独立重述迁移前 `p.damage *= m` 语义
 *   （statBase().damage 起始、picks 顺序逐次乘算），全部场景 toBe 逐位一致；
 * - 硬编码浮点尾钉子（捕捉来源表/解析语义漂移，含顺序敏感对）；
 * - 全链路接入点（学习/无关天赋/重算/置换）同步与幂等；
 * - 全伤害链路（魔弹/陨星/灼烧/护盾反震/飞刃/近战/弹丸）入口数值回归；
 * - 发射时快照 vs 命中时取值规则不变。
 */

/** 旧实现基准：迁移前 data/talents.ts 三张卡 f 的语义独立重述（不引用 f） */
function legacyDamage(picks: readonly string[]): number {
  let damage = statBase().damage;
  for (const n of picks) {
    if (n === "磨刃") damage *= 1.1;
    else if (n === "狂怒") damage *= 1.2;
    else if (n === "毁灭本能") damage *= 1.3;
  }
  return damage;
}

function learnOrder(g: GameCore, names: string[]) {
  for (const n of names) g.learnTalent(talent(n));
}

/** 本批三张伤害卡（legacyDamage 对照范围与无关天赋过滤共用） */
const DAMAGE_CARDS = new Set(["磨刃", "狂怒", "毁灭本能"]);

describe("S4-C C2-A · 单级/满级/多级重复乘算（旧权威逐位对照）", () => {
  it("磨刃：×1 → 12.100000000000001，×2 → 13.310000000000002（final 逐次连乘非折叠）", () => {
    const g = fresh();
    learn(g, "磨刃");
    expect(g.player.damage).toBe(12.100000000000001);
    expect(g.player.damage).toBe(legacyDamage(["磨刃"]));
    learn(g, "磨刃");
    expect(g.player.damage).toBe(13.310000000000002);
    expect(g.player.damage).toBe(legacyDamage(["磨刃", "磨刃"]));
    // 多级逐次乘算不得折叠：percent +0.2（13.2）或预乘 1.1×1.1（13.309999999999999）都不是
    expect(g.player.damage).not.toBe(11 * 1.2);
    expect(g.player.damage).not.toBe(11 * 1.21);
  });

  it("磨刃满级 ×99 → 137806.12339822375（99 次连乘与旧重放逐位一致）", () => {
    const g = fresh();
    learn(g, "磨刃", 99);
    expect(g.player.upCounts["磨刃"]).toBe(99);
    expect(g.player.damage).toBe(137806.12339822375);
    expect(g.player.damage).toBe(legacyDamage(Array(99).fill("磨刃")));
  });

  it("狂怒：×1 → 13.2，满级 ×5 → 27.37151999999999", () => {
    const g = fresh();
    learn(g, "狂怒");
    expect(g.player.damage).toBe(13.2);
    expect(g.player.damage).toBe(legacyDamage(["狂怒"]));
    learn(g, "狂怒", 4);
    expect(g.player.damage).toBe(27.37151999999999);
    expect(g.player.damage).toBe(legacyDamage(Array(5).fill("狂怒")));
  });

  it("毁灭本能：×1 → 14.3，满级 ×3 → 24.167", () => {
    const g = fresh();
    learn(g, "毁灭本能");
    expect(g.player.damage).toBe(14.3);
    expect(g.player.damage).toBe(legacyDamage(["毁灭本能"]));
    learn(g, "毁灭本能", 2);
    expect(g.player.damage).toBe(24.167);
    expect(g.player.damage).toBe(legacyDamage(Array(3).fill("毁灭本能")));
  });
});

describe("S4-C C2-A · 交错学习与获取顺序浮点表现", () => {
  it("交错 A→B→A→C 与 C→A→B→A：都为 20.763600000000004（逐位 = 旧基准）", () => {
    for (const order of [
      ["磨刃", "狂怒", "磨刃", "毁灭本能"],
      ["毁灭本能", "磨刃", "狂怒", "磨刃"],
    ]) {
      const g = fresh();
      learnOrder(g, order);
      expect(g.player.damage).toBe(20.763600000000004);
      expect(g.player.damage).toBe(legacyDamage(order));
    }
  });

  it("同层数不同顺序的顺序敏感对：磨刃→狂怒 14.520000000000001 ≠ 狂怒→磨刃 14.52（各与旧基准逐位一致）", () => {
    const gMF = fresh();
    learnOrder(gMF, ["磨刃", "狂怒"]);
    expect(gMF.player.damage).toBe(14.520000000000001);
    expect(gMF.player.damage).toBe(legacyDamage(["磨刃", "狂怒"]));
    const gFM = fresh();
    learnOrder(gFM, ["狂怒", "磨刃"]);
    expect(gFM.player.damage).toBe(14.52);
    expect(gFM.player.damage).toBe(legacyDamage(["狂怒", "磨刃"]));
    // IEEE-754 非结合：本对两种顺序结果不同——顺序被本测试咬住
    expect(gMF.player.damage).not.toBe(gFM.player.damage);
  });

  it("顺序敏感对（毁灭本能×2）：磨刃→毁灭×2 20.449000000000005 ≠ 毁灭×2→磨刃 20.449", () => {
    const gMC = fresh();
    learnOrder(gMC, ["磨刃", "毁灭本能", "毁灭本能"]);
    expect(gMC.player.damage).toBe(20.449000000000005);
    expect(gMC.player.damage).toBe(
      legacyDamage(["磨刃", "毁灭本能", "毁灭本能"]),
    );
    const gCM = fresh();
    learnOrder(gCM, ["毁灭本能", "毁灭本能", "磨刃"]);
    expect(gCM.player.damage).toBe(20.449);
    expect(gCM.player.damage).toBe(
      legacyDamage(["毁灭本能", "毁灭本能", "磨刃"]),
    );
    expect(gMC.player.damage).not.toBe(gCM.player.damage);
  });
});

describe("S4-C C2-A · 无关天赋、重算幂等与投影所有权", () => {
  it("结构钉子：三张卡 Talent.f 不再写入任何字段（单一权威来源的结构保证）", () => {
    // 投影为绝对覆写语义，learnTalent 内恢复旧 f 在数值上不可区分——
    // 「f 不写入」本身是交付契约，由此钉子直接咬住（变异验证 ②a）
    const g = fresh();
    const before = JSON.stringify(g.player);
    for (const name of DAMAGE_CARDS) talent(name).f(g.player);
    expect(JSON.stringify(g.player)).toBe(before);
  });

  it("学习无关天赋（flat 五卡）：damage 不发生重复增强", () => {
    const g = fresh();
    learnOrder(g, ["磐石", "铁布衫", "会心深渊", "磐石"]);
    expect(g.player.damage).toBe(11);
    expect(g.player.defense).toBe(30); // 无关卡自身贡献照常投影
    learn(g, "磨刃");
    expect(g.player.damage).toBe(12.100000000000001); // 恰好一次 ×1.1
    learnOrder(g, ["铁布衫", "元素亲和"]);
    expect(g.player.damage).toBe(12.100000000000001); // 后续无关学习不再乘算
    expect(g.player.damage).toBe(
      legacyDamage(g.player.picks.filter((n) => DAMAGE_CARDS.has(n))),
    );
  });

  it("recompute 幂等：多次重算 damage 与全部已迁移字段零漂移", () => {
    const g = fresh();
    learnOrder(g, ["磨刃", "狂怒", "磨刃", "毁灭本能"]);
    const snapshot = () =>
      JSON.stringify({
        damage: g.player.damage,
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
    g.recompute();
    expect(snapshot()).toBe(before);
    expect(g.player.damage).toBe(20.763600000000004);
    expect(g.player.damage).toBe(legacyDamage(g.player.picks));
  });

  it("空 picks 投影 = statBase 基础值 11（fresh 后 damage 不被改写）", () => {
    const g = fresh();
    expect(g.player.damage).toBe(11);
    // C3-A：persistent 为必传参数（契约 v1.2 §10.8）——测试显式提供来源
    //（fresh 实例无血包成长，语义等价 0），不用默认参数掩盖漏传
    applyTalentStatProjection(g.player, { potionMaxHpGrow: g.potionMaxHpGrow });
    expect(g.player.damage).toBe(11);
  });
});

describe("S4-C C2-A · 置换链路：移除/获得伤害天赋后正确重算", () => {
  it("置换移除全部磨刃：材料 2×磨刃 → damage 回落基础值 11", () => {
    const g = fresh();
    learn(g, "磨刃", 2);
    expect(g.player.damage).toBe(13.310000000000002);
    g.wavePhase = "rest";
    g.openSwap();
    g.setSwapTarget(1);
    g.selectMaterial("磨刃");
    g.selectMaterial("磨刃");
    vi.spyOn(Math, "random").mockReturnValue(0); // t1 池首 = 分裂射击
    const output = g.melt();
    expect(output?.n).toBe("分裂射击");
    expect(g.player.picks).toEqual(["分裂射击"]);
    expect(g.player.damage).toBe(11);
    expect(g.player.damage).toBe(legacyDamage(g.player.picks));
    g.recompute();
    expect(g.player.damage).toBe(11); // 重算幂等
  });

  it("置换保留部分层级：磨刃×3 熔 2 → 剩 1 级 ×1.1", () => {
    const g = fresh();
    learn(g, "磨刃", 3);
    expect(g.player.damage).toBe(14.641000000000004);
    g.wavePhase = "rest";
    g.openSwap();
    g.setSwapTarget(1);
    g.selectMaterial("磨刃");
    g.selectMaterial("磨刃");
    vi.spyOn(Math, "random").mockReturnValue(0);
    g.melt();
    // 剩余 1 级磨刃保留 + 输出卡分裂射击
    expect(g.player.picks).toEqual(["磨刃", "分裂射击"]);
    expect(g.player.damage).toBe(12.100000000000001);
    expect(g.player.damage).toBe(legacyDamage(g.player.picks));
  });

  it("置换获得狂怒：材料 2×磨刃 → 输出卡经 learnTalent 投影 ×1.2", () => {
    const g = fresh();
    learn(g, "磨刃", 2);
    g.wavePhase = "rest";
    g.openSwap();
    g.setSwapTarget(1);
    g.selectMaterial("磨刃");
    g.selectMaterial("磨刃");
    vi.spyOn(Math, "random").mockReturnValue(0.8); // t1 池（12 项）idx 9 = 狂怒
    const output = g.melt();
    expect(output?.n).toBe("狂怒");
    expect(g.player.picks).toEqual(["狂怒"]);
    expect(g.player.damage).toBe(13.2);
    expect(g.player.damage).toBe(legacyDamage(g.player.picks));
    g.recompute();
    expect(g.player.damage).toBe(13.2);
  });

  it("置换获得毁灭本能：材料 2×狂怒 → 输出卡投影 ×1.3", () => {
    const g = fresh();
    learn(g, "狂怒", 2);
    g.wavePhase = "rest";
    g.openSwap();
    g.setSwapTarget(2);
    g.selectMaterial("狂怒");
    g.selectMaterial("狂怒");
    vi.spyOn(Math, "random").mockReturnValue(0.7); // t2 池（8 项）idx 5 = 毁灭本能
    const output = g.melt();
    expect(output?.n).toBe("毁灭本能");
    expect(g.player.damage).toBe(14.3);
    expect(g.player.damage).toBe(legacyDamage(g.player.picks));
  });

  it("置换移除交错伤害卡：picks 顺序重算与旧基准逐位一致", () => {
    const g = fresh();
    learnOrder(g, ["磨刃", "狂怒", "磨刃", "毁灭本能", "闪避本能"]);
    g.wavePhase = "rest";
    g.openSwap();
    g.setSwapTarget(1);
    // t0 材料：磨刃×2 + 闪避本能×1 → 首选磨刃推导目标档 1
    g.selectMaterial("磨刃");
    g.selectMaterial("磨刃");
    vi.spyOn(Math, "random").mockReturnValue(0);
    g.melt();
    // 剩余 picks：狂怒 → 毁灭本能 → 闪避本能（顺序保留）+ 输出卡分裂射击
    expect(g.player.picks).toEqual([
      "狂怒",
      "毁灭本能",
      "闪避本能",
      "分裂射击",
    ]);
    expect(g.player.damage).toBe(legacyDamage(g.player.picks));
    expect(g.player.damage).toBe(17.16); // (11×1.2)×1.3，分裂射击无贡献
  });
});

describe("S4-C C2-A · pv/cur 显示口径不变", () => {
  it("磨刃 pv/cur：学习前后读数与迁移前格式逐字一致", () => {
    const g = fresh();
    expect(talent("磨刃").pv(g.player)).toBe("伤害 11.0 → 12.1");
    expect(talent("磨刃").cur!(g.player)).toBe("当前伤害 11.0");
    learn(g, "磨刃");
    expect(talent("磨刃").pv(g.player)).toBe("伤害 12.1 → 13.3");
    expect(talent("磨刃").cur!(g.player)).toBe("当前伤害 12.1");
  });

  it("狂怒/毁灭本能 pv：基础值读数格式不变", () => {
    const g = fresh();
    expect(talent("狂怒").pv(g.player)).toBe("伤害 11.0 → 13.2");
    expect(talent("毁灭本能").pv(g.player)).toBe("伤害 11.0 → 14.3");
    learn(g, "狂怒");
    expect(talent("毁灭本能").pv(g.player)).toBe("伤害 13.2 → 17.2");
  });
});

describe("S4-C C2-A · 全伤害链路入口回归（公式单次乘区）", () => {
  it("boltDamage：基础伤害与 boltDmgMul 只相乘一次", () => {
    const g = fresh();
    learn(g, "磨刃");
    expect(boltDamage(g.player)).toBe(12.100000000000001);
    learn(g, "强化弹丸"); // boltDmgMul 1.25：技能特化倍率，与 damage 独立
    expect(g.player.boltDmgMul).toBe(1.25);
    expect(boltDamage(g.player)).toBe(15.125000000000002);
  });

  it("meteorDamage：基础伤害 ×3 与陨星等级项加法顺序不变", () => {
    const g = fresh();
    learn(g, "毁灭本能");
    g.player.meteor = 0;
    expect(meteorDamage(g.player)).toBe(42.900000000000006); // 14.3×3
    g.player.meteor = 2;
    expect(meteorDamage(g.player)).toBe(58.900000000000006); // 42.9… + 16
    expect(meteorDamage(g.player)).toBe(g.player.damage * 3 + 2 * 8);
  });

  it("burnStackDps/burnGroundDps/shieldShockDamage：以投影后 damage 计算", () => {
    const g = fresh();
    learn(g, "磨刃");
    expect(burnStackDps(g.player, 3)).toBe(3.630000000000001);
    expect(burnGroundDps(g.player)).toBe(2.4200000000000004);
    expect(shieldShockDamage(g.player)).toBe(24.200000000000003);
  });

  it("真实弹丸路径：磨刃前命中 11，学习后新弹丸 12（round-min-one）", () => {
    const g = fresh();
    vi.spyOn(Math, "random").mockReturnValue(0.99); // 不暴击
    const e = enemy(g, g.player.x + 30, g.player.y);
    e.hp = 9999;
    e.maxhp = 9999;
    e.speed = 0;
    g.player.fireCd = 0;
    g.update(1 / 60);
    expect(g.bullets).toHaveLength(1);
    expect(g.bullets[0].dmg).toBe(11);
    learn(g, "磨刃");
    expect(g.player.damage).toBe(12.100000000000001);
    g.player.fireCd = 0;
    for (let i = 0; i < 90 && g.dmgBy.bullet < 12; i++) g.update(1 / 60);
    expect(g.dmgBy.bullet).toBe(11 + 12); // 第一发 11（快照）+ 第二发 12
  });

  it("发射后学习磨刃：在途弹丸按发射时快照结算，不回溯", () => {
    const g = fresh();
    vi.spyOn(Math, "random").mockReturnValue(0.99);
    const e = enemy(g, g.player.x + 30, g.player.y);
    e.hp = 9999;
    e.maxhp = 9999;
    e.speed = 0;
    g.player.fireCd = 0;
    g.update(1 / 60);
    expect(g.bullets).toHaveLength(1);
    learn(g, "磨刃"); // 弹丸已在途
    expect(g.bullets[0].dmg).toBe(11); // 发射时快照不变
    expect(g.bullets[0].stats!.attack).toBe(11);
    for (let i = 0; i < 40 && g.dmgBy.bullet === 0; i++) g.update(1 / 60);
    expect(g.dmgBy.bullet).toBe(11);
  });

  it("真实陨星路径：命中时计算 meteorDamage（学习在坠落期间生效）", () => {
    const g = fresh();
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    const e = enemy(g, g.player.x + 10, g.player.y);
    e.hp = 9999;
    e.maxhp = 9999;
    e.speed = 0;
    g.player.meteor = 1;
    g.player.meteorT = 0.05;
    for (let i = 0; i < 10 && g.meteors.length === 0; i++) g.update(1 / 60);
    expect(g.meteors).toHaveLength(1); // 推入陨星（t=0.8 坠落中）
    learn(g, "毁灭本能"); // 坠落期间学习 → 命中时取现值
    for (let i = 0; i < 120 && g.dmgBy.meteor === 0; i++) g.update(1 / 60);
    // meteorDamage = 14.3×3 + 1×8 = 50.9…? 逐位由基准函数咬住；round → 51
    expect(g.dmgBy.meteor).toBe(
      Math.max(1, Math.round(meteorDamage(g.player))),
    );
    expect(meteorDamage(g.player)).toBe(14.3 * 3 + 1 * 8);
    expect(g.dmgBy.meteor).toBe(51);
  });

  it("真实灼烧路径：命中叠层 burnDps 以投影后 damage 计算", () => {
    const g = fresh();
    vi.spyOn(Math, "random").mockReturnValue(0.99);
    learn(g, "烈焰印记"); // burn = 1
    learn(g, "磨刃");
    const e = enemy(g);
    e.hp = 9999;
    e.maxhp = 9999;
    g.hurtEnemy(e, 100, 0, 0, { src: "bullet", noCrit: true, noChain: true });
    expect(e.burnStacks).toBe(1);
    expect(e.burnDps).toBe(1.2100000000000002); // 1 × 12.100000000000001 × 0.1
  });

  it("真实飞刃路径：orbit 命中 = orbitDmg + damage×0.3（命中时读现值）", () => {
    const g = fresh();
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    learn(g, "守护之刃"); // orbit = 1
    const e = enemy(g, g.player.x + 20, g.player.y);
    e.hp = 9999;
    e.maxhp = 9999;
    e.speed = 0;
    learn(g, "磨刃");
    for (let i = 0; i < 90 && g.dmgBy.orbit === 0; i++) g.update(1 / 60);
    // 7 + 12.100000000000001×0.3 = 10.63 → round → 11
    expect(g.dmgBy.orbit).toBe(11);
  });

  it("近战入口：dmg 绝对值由调用方基于 damage 计算，round-min-one 保底", () => {
    const g = fresh();
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    const e = enemy(g, g.player.x + 20, g.player.y);
    e.hp = 9999;
    e.maxhp = 9999;
    expect(
      g.meleeSwing({ angle: 0, radius: 40, dmg: g.player.damage }),
    ).toHaveLength(1);
    expect(e.hp).toBe(e.maxhp - 11);
    learn(g, "狂怒");
    g.meleeSwing({ angle: 0, radius: 40, dmg: g.player.damage });
    expect(e.hp).toBe(e.maxhp - 11 - Math.round(13.2));
  });
});

describe("S4-C C2-A · RuntimeState 与 RNG 纪律", () => {
  it("学习三张伤害卡不触碰当前 HP/护盾/冷却/狂热等运行状态", () => {
    const g = fresh();
    learn(g, "能量护盾");
    learn(g, "击杀狂热");
    learn(g, "疾影步");
    g.player.hp = 77;
    g.player.shield = 0;
    g.player.dashT = 1.2;
    g.player.dashCharges = 0;
    g.player.hasteT = 0.5;
    g.player.rageT = 1.5;
    g.player.ndUsed = true;
    g.player.meteorT = 2.3;
    g.player.tempShield = 1;
    const keys = [
      "hp",
      "shield",
      "dashT",
      "dashCharges",
      "dashRe",
      "haste",
      "hasteT",
      "rageT",
      "ndUsed",
      "meteorT",
      "tempShield",
    ] as const;
    const before = JSON.stringify(
      Object.fromEntries(keys.map((k) => [k, g.player[k]])),
    );
    learnOrder(g, ["磨刃", "狂怒", "毁灭本能"]);
    expect(
      JSON.stringify(Object.fromEntries(keys.map((k) => [k, g.player[k]]))),
    ).toBe(before);
  });

  it("learnTalent 消耗零随机数（学习步骤无 RNG）", () => {
    const g = fresh();
    const spy = vi.spyOn(Math, "random");
    const before = spy.mock.calls.length;
    learnOrder(g, ["磨刃", "狂怒", "毁灭本能"]);
    expect(spy.mock.calls.length).toBe(before);
  });

  it("ticks 正常推进：伤害卡学习后战斗模拟无异常", () => {
    const g = fresh();
    learnOrder(g, ["磨刃", "狂怒", "毁灭本能"]);
    expect(g.player.damage).toBe(18.876); // (11×1.1)×1.2×1.3
    expect(() => ticks(g, 30)).not.toThrow();
    expect(g.player.damage).toBe(18.876); // 无人击杀、无学习 → 不变
  });
});
