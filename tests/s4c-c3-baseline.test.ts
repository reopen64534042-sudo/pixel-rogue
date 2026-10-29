import { afterEach, describe, expect, it, vi } from "vitest";
import { resolveStats, type StatModifier } from "../src/game/core/StatModel";
import { enemy, fresh, learn, meltRollFor, ticks } from "./helpers";

/**
 * S4-C C3-0 混合天赋旧行为基线（契约冻结前置审计）。
 *
 * 与 tests/s4c-recompute-audit.test.ts（R-1～R-5）互补：本文件只补足 C0
 * 尚未覆盖的当前行为——混合卡（生命之泉/巨人血脉/能量护盾/击杀狂热/疾影步/
 * 战意沸腾/壁垒/二段冲刺/不屈）的**获得时效果**、护盾恢复侧、狂热消费点、
 * 冲刺充能语义、置换与换波入口。
 *
 * 全部断言按**当前真实实现**编写，包括已批准要修复的缺陷（D-C3-01～06，
 * 见 docs/pixel-rogue-S4C-C3-contract-v1.md §2）；未来期望行为只存在于契约
 * 文档 §7.2 的 Given/When/Then，不写成当前断言。C3-A/B/C 实施时按契约 §9
 * 将对应用例反转为新语义，反转时保留旧行为注释留痕。
 *
 * 反转进度：C3-A 已反转 R-1（s4c-recompute-audit，血包成长保留）；C3-B 已
 * 反转 B6（D-C3-02：破盾后重算不回满、shieldCd 保留，旧行为注释留痕）。
 * 其余 B 用例（B1~B5/B7~B16）为获得/消费/换波路径回归——它们钉住的正是
 * 获得时效果与消费点行为，新机制下必须持续通过、断言不削弱。
 *
 * v1.1 第一轮评审修订：B16 为现有 StatModel 有序 flat 解析行为的独立验证
 * （P2-2），不接入疾影步生产逻辑、不改动 StatModel 契约。
 */
// P3（第一轮评审先例）：恢复全局 Mock，防止 Math.random spy 跨测试泄漏污染
afterEach(() => {
  vi.restoreAllMocks();
});

describe("S4-C C3-0 · 生命卡获得时效果（旧行为基线）", () => {
  it("B1 生命之泉获得时回满 HP（OnAcquire：hp = 新 maxhp）", () => {
    const g = fresh();
    g.player.hp = 40;
    learn(g, "生命之泉");
    expect(g.player.maxhp).toBe(120);
    expect(g.player.hp).toBe(120);
  });

  it("B2 巨人血脉获得时当前 HP +30：不回满、不夹紧（满血时恰好等于新上限）", () => {
    const g = fresh();
    g.player.hp = 40;
    learn(g, "巨人血脉");
    expect(g.player.maxhp).toBe(130);
    expect(g.player.hp).toBe(70); // f: hp += 30，无回满语义
    const full = fresh();
    learn(full, "巨人血脉");
    expect(full.player.maxhp).toBe(130);
    expect(full.player.hp).toBe(130); // 100+30 = 新上限，f 无越界夹紧
  });

  it("B3 双生命卡顺序敏感：受伤插入点决定最终 HP（获得时效果的次序证据）", () => {
    // 顺序 A：泉（回满）→ 受伤 → 血脉（+30）
    const a = fresh();
    learn(a, "生命之泉");
    a.player.hp = 40;
    learn(a, "巨人血脉");
    expect(a.player.maxhp).toBe(150);
    expect(a.player.hp).toBe(70);
    // 顺序 B：血脉（100→130）→ 受伤 → 泉（回满至 150）
    const b = fresh();
    learn(b, "巨人血脉");
    b.player.hp = 40;
    learn(b, "生命之泉");
    expect(b.player.maxhp).toBe(150);
    expect(b.player.hp).toBe(150);
    // 同一批次不同学习顺序 → 不同当前 HP：旧 f 在学习时点立即生效
    expect(a.player.hp).not.toBe(b.player.hp);
  });
});

describe("S4-C C3-0 · 护盾获得/消耗/恢复（旧行为基线）", () => {
  it("B4 能量护盾获得时赠送一层；已消耗态再升级仍无条件 +1（旧 f 无条件 shield++）", () => {
    const g = fresh();
    learn(g, "能量护盾");
    expect(g.player.shieldMax).toBe(1);
    expect(g.player.shield).toBe(1);
    // 消耗后升级：赠层不检查当前层数（D-C3-02 冻结的旧行为面）
    g.player.shield = 0;
    learn(g, "能量护盾");
    expect(g.player.shieldMax).toBe(2);
    expect(g.player.shield).toBe(1);
  });

  it("B5 护盾恢复侧：CD 归零恢复一层并重置 CD=10；满盾时冻结不再倒计时", () => {
    const g = fresh();
    g.quota = 0; // 隔离：不刷怪，防止敌方接触消耗盾层干扰断言
    g.spawnCd = 1e9;
    learn(g, "能量护盾");
    g.player.shield = 0;
    g.player.shieldCd = 0.05;
    ticks(g, 4); // ≈0.067s，跨过 CD 终点
    expect(g.player.shield).toBe(1);
    expect(g.player.shieldCd).toBe(10);
    // 满盾：恢复 gate 关闭，shieldCd 冻结在 10、层数不超上限
    ticks(g, 120);
    expect(g.player.shield).toBe(1);
    expect(g.player.shieldCd).toBe(10);
  });

  it("B6 修复（D-C3-02）：破盾后 recompute 保留现值——盾不回满、shieldCd 不清零（R-2 补充面）", () => {
    const g = fresh();
    learn(g, "能量护盾");
    g.player.shield = 0;
    g.player.shieldCd = 6.5; // 恢复倒计时进行中
    g.recompute();
    // 旧行为（C3-0 pin，基线 65c6922）：重放赠层回满（shield=1）+ statBase
    // 重置 shieldCd=0（未满盾时下一帧立即恢复一层）。C3-B（D-C3-02/04）：
    // shield/shieldCd 均为 RuntimeState，重算原样保留——继续倒计时、不回满
    expect(g.player.shield).toBe(0);
    expect(g.player.shieldCd).toBe(6.5);
    // 两级部分消耗：同样保留现值，不回满
    const g2 = fresh();
    learn(g2, "能量护盾", 2);
    expect(g2.player.shieldMax).toBe(2);
    g2.player.shield = 0;
    g2.recompute();
    expect(g2.player.shield).toBe(0);
  });
});

describe("S4-C C3-0 · 击杀狂热/战意沸腾消费点（旧行为基线）", () => {
  it("B7 首次获得 haste=1/hasteT=3；后续升级不重新触发（与 recompute 重放路径行为不同）", () => {
    const g = fresh();
    learn(g, "击杀狂热");
    expect(g.player.hasteLv).toBe(1);
    expect(g.player.haste).toBe(1);
    expect(g.player.hasteT).toBe(3);
    // 真实升级路径：hasteLv 已 ≥1 → OnAcquire 首级条件不成立 → 不刷新、
    // 不重触发（C3-C 起 recompute 路径同样保留现值——D-C3-03 修复后两种
    // 入口行为一致，分叉缺陷已消除；对照 s4c-c3c-runtime G-10/G-11）
    g.player.haste = 0;
    g.player.hasteT = 0;
    learn(g, "击杀狂热");
    expect(g.player.hasteLv).toBe(2);
    expect(g.player.haste).toBe(0);
    expect(g.player.hasteT).toBe(0);
  });

  it("B8 击杀叠层与上限（cap=3+hasteLv、hasteT 刷新=2+hasteLv）、受伤 -2 层、战意沸腾 rageT 触发", () => {
    const g = fresh();
    learn(g, "击杀狂热"); // hasteLv=1 → cap=4
    expect(g.player.haste).toBe(1);
    const e1 = enemy(g);
    g.killEnemy(e1);
    expect(g.player.haste).toBe(2);
    expect(g.player.hasteT).toBe(3); // 2 + hasteLv
    g.killEnemy(enemy(g));
    expect(g.player.haste).toBe(3);
    g.killEnemy(enemy(g));
    expect(g.player.haste).toBe(4); // = cap
    g.killEnemy(enemy(g));
    expect(g.player.haste).toBe(4); // min(cap, …) 钳制
    // 受伤扣 2 层
    g.damagePlayer(5, { type: "physical", form: "ranged" });
    expect(g.player.haste).toBe(2);
    // 战意沸腾：受伤触发 rageT=3（rageLv 永久）
    learn(g, "战意沸腾");
    g.damagePlayer(5, { type: "physical", form: "ranged" });
    expect(g.player.rageLv).toBe(1);
    expect(g.player.rageT).toBe(3);
    expect(g.player.haste).toBe(0); // 2 - 2
  });

  it("B9 计时器推进：hasteT 耗尽 → haste 归零；rageT 独立衰减、rageLv 恒存", () => {
    const g = fresh();
    g.quota = 0; // 隔离：无敌人干扰
    g.spawnCd = 1e9;
    learn(g, "击杀狂热");
    learn(g, "战意沸腾");
    g.player.haste = 2;
    g.player.hasteT = 0.04;
    g.player.rageT = 0.5;
    ticks(g, 60); // 1s
    expect(g.player.haste).toBe(0); // hasteT ≤ 0 → haste=0
    expect(g.player.rageLv).toBe(1);
    expect(g.player.rageT).toBeLessThanOrEqual(0);
  });
});

describe("S4-C C3-0 · 冲刺解锁/充能（旧行为基线）", () => {
  it("B10 疾影步 dashLv 在基础 1 上 +1/级（#137 后首级=2），dashMax 每级 −0.4（逐位：2.0/1.6/1.2000000000000002）", () => {
    const g = fresh();
    // 基线更新依据：Issue #137——开局自带 dashLv=1（共享基础动作），
    // 疾影步在其上 +1/级；dashMax base 2.4 与 −0.4/级 未变，逐位序列保持
    learn(g, "疾影步");
    expect(g.player.dashLv).toBe(2);
    expect(g.player.dashMax).toBe(2.0);
    learn(g, "疾影步");
    expect(g.player.dashLv).toBe(3);
    expect(g.player.dashMax).toBe(1.6);
    learn(g, "疾影步");
    expect(g.player.dashLv).toBe(4);
    // 1.6 − 0.4 的 IEEE-754 结果 ≠ 1.2（契约 §8.3 预警的 ulp 级风险实测坐实：
    // C3-C 解析式/查表必须钉住旧 f 重放的逐位值，不得写 1.2）
    expect(g.player.dashMax).toBe(1.2000000000000002);
  });

  it("B11 充能上限 dchMax = 1 + dashChargeLv（#137 后冲刺开局自带，无需先解锁）", () => {
    const g = fresh();
    // S2：旧卡「二段冲刺」已删除，改学射手机动槽「双段疾冲」（同样 +1 充能）。
    // 「req 只约束 canOffer」的验证由射手链式依赖覆盖（见 game.test 的
    // 「chain prerequisites」用例），这里保留充能上限公式的验证。
    // 基线更新依据：Issue #137——开局 dashLv=1，「先学疾影步解锁」前提移除
    learn(g, "双段疾冲");
    expect(g.player.dashChargeLv).toBe(1);
    // 充能行为：0 → 1 → 2 充满后停（隔离刷怪）
    g.quota = 0;
    g.spawnCd = 1e9;
    g.player.dashCharges = 0;
    g.player.dashRe = 0.02;
    ticks(g, 2);
    expect(g.player.dashCharges).toBe(1);
    expect(g.player.dashRe).toBe(g.player.dashMax); // 继续按 dashMax 倒计时
    ticks(g, 60 * 2.5); // dashMax 2.4（未学疾影步，2.2s 不够）
    expect(g.player.dashCharges).toBe(2); // dchMax=2
    ticks(g, 60);
    expect(g.player.dashCharges).toBe(2); // 达到上限不再充能
  });
});

describe("S4-C C3-0 · 置换与换波入口（旧行为基线）", () => {
  it("B12 置换删除生命材料：recompute 重建 maxhp=100（无来源）+ hp 夹紧；输出卡伤害投影正常；恰好 1 次 Math.random", () => {
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
    vi.spyOn(Math, "random").mockReturnValue(meltRollFor(g, 1, "狂怒")); // 按池位置反算，不写死索引
    const rand = vi.spyOn(Math, "random");
    const output = g.melt();
    expect(output?.n).toBe("狂怒");
    expect(g.player.picks).toEqual(["狂怒"]);
    expect(g.player.maxhp).toBe(100); // 血包同源缺陷：生命卡来源随材料删除，无持久来源兜底
    expect(g.player.hp).toBe(100); // min(hpBefore=150, 100)（R-5 夹紧语义）
    expect(g.player.damage).toBe(13.2); // 输出卡经 learnTalent → C2-A 投影 11×1.2
    expect(rand).toHaveBeenCalledTimes(1); // melt 的 RNG 纪律：池抽取恰好 1 次
  });

  it("B13 置换输出卡 = 能量护盾：一次性效果（赠盾）在置换路径正常生效", () => {
    const g = fresh();
    learn(g, "狂怒");
    learn(g, "战意沸腾");
    g.wavePhase = "rest";
    g.openSwap();
    g.setSwapTarget(2);
    g.selectMaterial("狂怒");
    g.selectMaterial("战意沸腾");
    vi.spyOn(Math, "random").mockReturnValue(meltRollFor(g, 2, "能量护盾")); // 按池位置反算，不写死索引
    const output = g.melt();
    expect(output?.n).toBe("能量护盾");
    expect(g.player.picks).toEqual(["能量护盾"]);
    expect(g.player.shieldMax).toBe(1);
    expect(g.player.shield).toBe(1); // f 的获得时赠层在 learnTalent 输出路径生效
    expect(g.player.damage).toBe(11); // 伤害材料全部移除 → 投影回落基础值
  });

  it("B14 换波重置：potionGrow=0、tempShield=barrierLv 重建（非累加）、ndUsed=false", () => {
    const g = fresh();
    learn(g, "壁垒", 2);
    learn(g, "不屈"); // hidden 只影响投放，直接学习可用
    g.wavePhase = "rest";
    g.potionGrow = 5;
    g.player.tempShield = 0; // 本波临时盾已消耗
    g.player.ndUsed = true;
    expect(g.startNextWave()).toBe(true);
    expect(g.potionGrow).toBe(0); // 每波转化计数重置（成长保留在 maxhp）
    expect(g.player.tempShield).toBe(2); // = barrierLv，赋值重建
    expect(g.player.ndUsed).toBe(false);
  });

  it("B15 已迁移卡与混合卡交错学习：属性各归其源、recompute 幂等（交错场景回归）", () => {
    const g = fresh();
    learn(g, "磐石"); // C1：defense 15（投影）
    learn(g, "生命之泉"); // C3-A 已迁移：投影 maxhp+20 且回满（OnAcquire）
    learn(g, "磨刃"); // C2-A：damage 11×1.1（投影）
    learn(g, "击杀狂热"); // 混合（未迁移）：旧 f hasteLv=1 + 首级 Buff
    expect(g.player.defense).toBe(15);
    expect(g.player.maxhp).toBe(120);
    expect(g.player.damage).toBe(12.100000000000001);
    expect(g.player.hasteLv).toBe(1);
    expect(g.player.haste).toBe(1);
    expect(g.player.hasteT).toBe(3);
    g.recompute();
    g.recompute();
    // 属性面逐位幂等：f 重放（混合卡）+ 投影（迁移卡）共存正确
    expect(g.player.maxhp).toBe(120);
    expect(g.player.defense).toBe(15);
    expect(g.player.damage).toBe(12.100000000000001);
    expect(g.player.hasteLv).toBe(1);
    expect(g.player.hp).toBe(120);
    // 运行状态面（C3-C 保留语义，原 R-3 缺陷已修复）：Buff 生效中重算，
    // haste/hasteT 原样保留（不重放首级条件、不清除）——数值与旧行为一致，
    // 机制差异由 s4c-c3c-runtime G-10（过期态）与 G-12/G-13（降级/移除）咬住
    expect(g.player.haste).toBe(1);
    expect(g.player.hasteT).toBe(3);
  });
});

describe("S4-C C3-0 · StatModel 有序 flat 解析等价（v1.1/P2-2，独立验证不接入生产）", () => {
  /**
   * P2-2 定案依据：疾影步 dashMax 的计划 C3-C 设计为「有序 flat 来源」——
   * base 2.4（statBase）+ 每级单独 flat −0.4。StatModel flat 区的「base 起始、
   * 按修饰符顺序逐次累加」语义须逐位复现旧 f 序列 2.0 / 1.6 / 1.2000000000000002
   * （B10）。本用例以白名单内 attack 槽位承载等价验证（dashMax 尚不在
   * STAT_IDS 白名单，C3-C 按契约 §5.1 扩展），不改动 StatModel、不接入生产。
   * 对照组：折叠式 2.4 − 0.4×lv（先乘后减）不逐位一致（L2=1.5999999999999999、
   * L3=1.1999999999999997），C3-C 禁止采用。
   */
  const flatNeg04 = (n: number): StatModifier[] =>
    Array.from({ length: n }, (_, i) => ({
      sourceId: `验证:有序flat负增量${i + 1}`,
      stat: "attack",
      stage: "flat",
      value: -0.4,
    }));

  it("B16 base 2.4 + 每级 flat −0.4 逐位复现旧 f dashMax 序列，并与真实学习路径交叉验证", () => {
    expect(resolveStats({ base: { attack: 2.4 }, modifiers: flatNeg04(1) }).attack).toBe(2.0);
    expect(resolveStats({ base: { attack: 2.4 }, modifiers: flatNeg04(2) }).attack).toBe(1.6);
    expect(resolveStats({ base: { attack: 2.4 }, modifiers: flatNeg04(3) }).attack).toBe(
      1.2000000000000002,
    );
    // 与 B10 的游戏旧 f 序列逐位同值（真实学习路径读取对照）
    const g = fresh();
    learn(g, "疾影步", 3);
    expect(g.player.dashMax).toBe(
      resolveStats({ base: { attack: 2.4 }, modifiers: flatNeg04(3) }).attack,
    );
  });
});
