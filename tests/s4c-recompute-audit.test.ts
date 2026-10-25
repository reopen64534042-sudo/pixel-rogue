import { describe, expect, it } from "vitest";
import { fresh, learn } from "./helpers";

/**
 * S4-C C0 属性影响审计：recompute()（当前唯一调用点 SwapSystem.melt）的
 * **现状行为定界**。差异矩阵见 docs/migration.md「D-19」R-1～R-5。
 *
 * 这些测试钉住既有语义（含已识别缺陷），用于：
 * 1. 证明 C1 权威迁移未改变非迁移区域的行为；
 * 2. 为后续批次（RuntimeState 分离、maxhp 持久来源）提供修复前基线——
 *    缺陷纠正须另行授权，不得借迁移之名静默修复（任务书 §4-S4-C.3）。
 */
describe("S4-C C0 · recompute 现状审计（差异矩阵 pin，不修复）", () => {
  it("R-1 缺陷：满血血包永久 maxhp 成长在 recompute 后丢失", () => {
    const g = fresh();
    // 真实路径触发满血转化：血包落在脚下 + 满血拾取 → maxhp+1（永久）
    g.player.hp = g.player.maxhp;
    g.potions.push({ x: g.player.x, y: g.player.y });
    g.update(1 / 60);
    expect(g.player.maxhp).toBe(101);
    expect(g.potionGrow).toBe(1);
    // recompute 以 statBase+talent 重放重建 maxhp：血包成长无来源 → 丢失
    g.recompute();
    expect(g.player.maxhp).toBe(100);
    expect(g.player.hp).toBe(100); // hp 被新 maxhp 夹紧
  });

  it("R-2 缺陷：能量护盾重放 shield++ → 已消耗盾层在 recompute 后恢复满值", () => {
    const g = fresh();
    learn(g, "能量护盾");
    expect(g.player.shieldMax).toBe(1);
    expect(g.player.shield).toBe(1);
    // 最短路径定界：直接模拟盾层已消耗（消耗方式与本缺陷无关）
    g.player.shield = 0;
    g.recompute();
    expect(g.player.shield).toBe(1); // 重放恢复，RuntimeState 未与属性分离
  });

  it("R-3 缺陷：击杀狂热首次获取的即时 buff 在 recompute 中重新触发", () => {
    const g = fresh();
    learn(g, "击杀狂热");
    expect(g.player.haste).toBe(1);
    expect(g.player.hasteT).toBe(3);
    // 推进到 buff 过期
    g.player.haste = 0;
    g.player.hasteT = 0;
    g.recompute();
    expect(g.player.haste).toBe(1); // 获得时效果被重放
    expect(g.player.hasteT).toBe(3);
  });

  it("R-4 缺陷：冲刺充能/冷却、陨星计时、临时盾、免死标记被 statBase 覆盖重置", () => {
    const g = fresh();
    learn(g, "疾影步");
    learn(g, "星辰坠落");
    learn(g, "壁垒");
    learn(g, "不屈"); // hidden 只影响卡池投放，不影响直接学习
    g.player.dashT = 1.5; // 冷却进行中
    g.player.dashCharges = 0; // 充能已用尽
    g.player.dashRe = 0.3;
    g.player.meteorT = 0.5; // 陨星即将落下
    g.player.tempShield = 1; // 壁垒临时盾未消耗
    g.player.ndUsed = true; // 不屈本波已触发
    g.recompute();
    expect(g.player.dashT).toBe(-1);
    expect(g.player.dashCharges).toBe(1);
    expect(g.player.dashRe).toBe(0);
    expect(g.player.meteorT).toBe(4);
    expect(g.player.tempShield).toBe(0);
    expect(g.player.ndUsed).toBe(false);
    // 天赋数值本身重建正确（对照项）：dashMax 首级 2.0
    expect(g.player.dashLv).toBe(1);
    expect(g.player.dashMax).toBe(2);
  });

  it("R-5 保护语义：重放治疗被 hp 夹紧中和——recompute 不改变当前 HP（除上限夹紧）", () => {
    const g = fresh();
    learn(g, "生命之泉"); // 学习时：maxhp 120 并回满
    learn(g, "巨人血脉"); // 学习时：maxhp 150、hp +30
    g.player.hp = 40; // 模拟战斗中受伤
    g.recompute();
    expect(g.player.maxhp).toBe(150); // 天赋来源正确重建
    // 重放会执行 f 的 hp=maxhp / hp+=30，但随后被 min(hpBefore, maxhp) 覆盖
    expect(g.player.hp).toBe(40);
  });
});
