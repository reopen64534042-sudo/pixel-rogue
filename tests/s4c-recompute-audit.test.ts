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
 *
 * 基线更新依据：Combat Foundation S4-C C3-A（D-C3-01，用户已批准）。
 * R-1 由「缺陷存在」反转为「永久成长正确保留」——血包永久 maxhp 成长进入
 * GameCore 实例级持久来源 potionMaxHpGrow，recompute 后由权威投影重建；
 * 旧行为（成长丢失回 100）的对照依据保留在用例注释中（契约 v1.2 §2）。
 * R-5 的断言保持不变（夹紧语义逐字保留，D-C3-05）；R-3/R-4 维持缺陷
 * pin，留给 C3-C。
 *
 * 基线更新依据：Combat Foundation S4-C C3-B（D-C3-02/D-C3-04 护盾部分，
 * 用户已批准）。R-2 由「缺陷存在」反转为「已消耗盾层与恢复倒计时正确保留」
 * ——shield/shieldCd 进入 RuntimeStateProtection 白名单，recompute 快照
 * 保留现值、绝不重放赠层/清零倒计时；旧行为（重放回满 + shieldCd 清 0）
 * 的对照依据保留在用例注释中（契约 v1.2 §2）。
 */
describe("C3 差异审计与分阶段修复验证", () => {
  it("R-1 修复（D-C3-01）：满血血包永久 maxhp 成长在 recompute 后保留", () => {
    const g = fresh();
    // 真实路径触发满血转化：血包落在脚下 + 满血拾取 → maxhp+1（永久）
    g.player.hp = g.player.maxhp;
    g.potions.push({ x: g.player.x, y: g.player.y });
    g.update(1 / 60);
    expect(g.player.maxhp).toBe(101);
    expect(g.potionGrow).toBe(1);
    expect(g.potionMaxHpGrow).toBe(1); // C3-A：实例级持久来源同步累计
    // 旧行为（C3-0 pin，基线 de37d93）：recompute 以 statBase 重放、血包成长
    // 无来源 → maxhp 丢失回 100。修复后：持久来源参与权威重建 → 成长保留
    g.recompute();
    expect(g.player.maxhp).toBe(101);
    expect(g.player.hp).toBe(101); // 满血拾取后 hp=maxhp，夹紧语义保持（D-C3-05）
    g.recompute();
    g.recompute();
    expect(g.player.maxhp).toBe(101); // 连续重算幂等，成长不重复计也不丢失
  });

  it("R-2 修复（D-C3-02）：已消耗盾层在 recompute 后保留现值，不重放赠层", () => {
    const g = fresh();
    learn(g, "能量护盾");
    expect(g.player.shieldMax).toBe(1);
    expect(g.player.shield).toBe(1);
    // 最短路径定界：直接模拟盾层已消耗（消耗方式与本缺陷无关）
    g.player.shield = 0;
    g.recompute();
    // 旧行为（C3-0 pin，基线 65c6922）：重放 f 的 shield++ → 已耗盾恢复满值。
    // C3-B（D-C3-02）：shield 属 RuntimeState（RuntimeStateProtection 白名单），
    // 重算保留现值、绝不重放获得时赠层；容量属性 shieldMax 按 picks 重建不变
    expect(g.player.shield).toBe(0);
    expect(g.player.shieldMax).toBe(1);
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

  it("R-5 保护语义：recompute 不改变当前 HP（除上限夹紧）——D-C3-05 逐字保留", () => {
    const g = fresh();
    learn(g, "生命之泉"); // 学习时：maxhp 120 并回满
    learn(g, "巨人血脉"); // 学习时：maxhp 150、hp +30
    g.player.hp = 40; // 模拟战斗中受伤
    g.recompute();
    expect(g.player.maxhp).toBe(150); // 天赋来源正确重建（C3-A 起经权威投影）
    // C3-0 时点的旧行为注释：重放会执行 f 的 hp=maxhp / hp+=30，但随后被
    // min(hpBefore, maxhp) 覆盖。C3-A（D-C3-01/03）起获得时效果不再进入
    // recompute（两张生命卡 f 为空操作），重放治疗从根源消失——夹紧公式
    // max(1, min(hpBefore, maxhp)) 逐字保留，断言与旧行为完全一致
    expect(g.player.hp).toBe(40);
  });
});
