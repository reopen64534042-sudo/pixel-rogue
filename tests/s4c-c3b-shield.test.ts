import { afterEach, describe, expect, it, vi } from "vitest";
import { applyOnAcquireEffect } from "../src/game/core/OnAcquireEffects";
import { fresh, learn, talent, ticks } from "./helpers";

/**
 * S4-C C3-B：普通能量护盾属性来源迁移 + 获得时赠层分离 + 运行状态保护。
 *
 * 契约 docs/pixel-rogue-S4C-C3-contract-v1.md（v1.2）：
 * - G-6～G-9 为契约 §7.2 护盾验收的可执行落地（本批实施 C3-B）；
 * - 旧行为对照（旧 f 语义独立重述 legacyShield）证明学习路径与迁移前逐位一致；
 * - 结构钉子（f 空操作 / OnAcquire no-op 分发）咬住「绝对投影掩盖重复写入」
 *   类变异（七类变异 ③/⑦ 的检测面）。
 *
 * 反转记录：R-2（tests/s4c-recompute-audit）与 B6（tests/s4c-c3-baseline）
 * 已按 D-C3-02 反转为保留断言；B4/B5/B13 保持通过（获得赠层/恢复/输出卡
 * 路径回归，新机制不得改变）。
 */
// P3（第一轮评审先例）：恢复全局 Mock，防止 Math.random spy 跨测试泄漏污染
afterEach(() => {
  vi.restoreAllMocks();
});

/** 迁移前旧 f 语义的独立重述（不引用 talent.f / 来源表）：每级 shieldMax+1、shield+1 */
function legacyShield(levels: number): { shieldMax: number; shield: number } {
  return { shieldMax: levels, shield: levels };
}

/** 真实路径累计 n 次满血转化（血包落在脚下 + 满血拾取，每次 +1，C3-A 来源） */
function growByConversions(g: ReturnType<typeof fresh>, n: number) {
  g.player.hp = g.player.maxhp;
  for (let i = 0; i < n; i++) {
    g.potions.push({ x: g.player.x, y: g.player.y });
    g.update(1 / 60);
  }
}

describe("S4-C C3-B · 契约 §7.2 验收（G-6～G-9）", () => {
  it("G-6 重算不恢复已耗盾层：shield=0、shieldCd=4.2、shieldMax=2 反复重算幂等", () => {
    const g = fresh();
    learn(g, "能量护盾", 2);
    expect(g.player.shieldMax).toBe(2);
    expect(g.player.shield).toBe(2); // 获得路径两级各赠 1 层
    g.player.shield = 0; // 消耗尽
    g.player.shieldCd = 4.2; // 恢复倒计时剩余
    g.recompute();
    // D-C3-02：shield/shieldCd 属 RuntimeState，重算保留现值；容量按 picks 重建
    expect(g.player.shield).toBe(0);
    expect(g.player.shieldCd).toBe(4.2);
    expect(g.player.shieldMax).toBe(2);
    g.recompute();
    g.recompute();
    // 反复重算幂等：现值继续保留、容量不重复叠加
    expect(g.player.shield).toBe(0);
    expect(g.player.shieldCd).toBe(4.2);
    expect(g.player.shieldMax).toBe(2);
  });

  it("G-7 置换移除一级使容量下降：shield 夹紧至新上限（3→2）；恰好 1 次随机", () => {
    const g = fresh();
    learn(g, "能量护盾", 3); // 3/3 满盾
    learn(g, "屠戮之欲"); // 第二份同档（t2）材料——melt 必须两份同档
    expect(g.player.shieldMax).toBe(3);
    expect(g.player.shield).toBe(3);
    g.wavePhase = "rest";
    g.openSwap();
    g.setSwapTarget(3); // 材料档 t2 → 输出 t3
    g.selectMaterial("能量护盾"); // 移除 1 级（3 级中取 1 份）
    g.selectMaterial("屠戮之欲");
    const rand = vi.spyOn(Math, "random").mockReturnValue(0.4); // t3 池 [星辰坠落, 击杀狂热] idx 0
    const output = g.melt();
    expect(output?.n).toBe("星辰坠落"); // 真实池内固定输出
    expect(g.player.picks).toEqual(["能量护盾", "能量护盾", "星辰坠落"]);
    expect(g.player.upCounts["能量护盾"]).toBe(2);
    expect(g.player.upCounts["屠戮之欲"]).toBeUndefined();
    expect(g.player.shieldMax).toBe(2); // 权威重建：剩余 2 级
    expect(g.player.shield).toBe(2); // D-C3-02 夹紧：min(3, 2)
    expect(rand).toHaveBeenCalledTimes(1); // 池抽取恰好 1 次（RNG 纪律不变）
  });

  it("G-7 变体 部分消耗后降容量：shield=1 不凭空回满至新上限 2", () => {
    const g = fresh();
    learn(g, "能量护盾", 3);
    learn(g, "屠戮之欲");
    g.player.shield = 1; // 已消耗 2 层
    g.wavePhase = "rest";
    g.openSwap();
    g.setSwapTarget(3);
    g.selectMaterial("能量护盾");
    g.selectMaterial("屠戮之欲");
    vi.spyOn(Math, "random").mockReturnValue(0.4);
    g.melt();
    expect(g.player.shieldMax).toBe(2);
    expect(g.player.shield).toBe(1); // 保留现值：不重放、也不借夹紧回满
  });

  it("G-8 置换输出卡 = 能量护盾：赠层在置换路径正常（recompute 后 learnTalent）", () => {
    const g = fresh();
    learn(g, "狂怒");
    learn(g, "战意沸腾");
    g.wavePhase = "rest";
    g.openSwap();
    g.setSwapTarget(2);
    g.selectMaterial("狂怒");
    g.selectMaterial("战意沸腾");
    vi.spyOn(Math, "random").mockReturnValue(0.4); // t2 池 idx 3 = 能量护盾（B13 同款）
    const output = g.melt();
    expect(output?.n).toBe("能量护盾");
    expect(g.player.picks).toEqual(["能量护盾"]);
    expect(g.player.upCounts["能量护盾"]).toBe(1);
    expect(g.player.shieldMax).toBe(1); // 权威投影（C3-B 来源表）
    expect(g.player.shield).toBe(1); // OnAcquire 赠层（learnTalent 一次 → 一层）
  });

  it("G-9 满盾升级赠层；已消耗态升级仍无条件 +1 且不刷新恢复 CD（旧 f 语义保持）", () => {
    const g = fresh();
    learn(g, "能量护盾"); // 1/1 满盾
    expect(g.player.shieldMax).toBe(1);
    expect(g.player.shield).toBe(1);
    learn(g, "能量护盾"); // 满盾学第 2 级：无条件赠层 → 2/2
    expect(g.player.shieldMax).toBe(2);
    expect(g.player.shield).toBe(2);
    g.player.shield = 0; // 消耗尽
    g.player.shieldCd = 4.2; // 恢复倒计时进行中
    learn(g, "能量护盾"); // 第 3 级：仍无条件 +1（不回满）→ 1/3
    expect(g.player.shieldMax).toBe(3);
    expect(g.player.shield).toBe(1);
    // P3-2（复审）：获得路径只赠层——恢复倒计时原样保留，不被学习刷新/清零
    expect(g.player.shieldCd).toBe(4.2);
  });
});

describe("S4-C C3-B · 恢复计时与真实破盾路径", () => {
  it("真实 damagePlayer 破盾后重算：shieldCd=10 保留，剩余计时持续推进、合法到期才 +1", () => {
    const g = fresh();
    g.quota = 0; // 隔离：不刷怪，防止接触消耗/击杀干扰
    g.spawnCd = 1e9;
    learn(g, "能量护盾", 2);
    expect(g.player.shield).toBe(2);
    g.damagePlayer(5, { type: "physical", form: "ranged" }); // 破盾反震：shield--、shieldCd=10
    expect(g.player.shield).toBe(1);
    expect(g.player.shieldCd).toBe(10);
    g.recompute();
    expect(g.player.shield).toBe(1); // 重算不复活已消耗层
    expect(g.player.shieldCd).toBe(10); // 重算不清零恢复倒计时
    ticks(g, 60 * 9); // 9s：未到期，不恢复
    expect(g.player.shield).toBe(1);
    expect(g.player.shieldCd).toBeCloseTo(1, 8); // 剩余 ≈1s，持续倒计时
    ticks(g, 62); // 跨过 10s 终点（第 601 tick 到期）
    expect(g.player.shield).toBe(2); // 唯一一次合法恢复 +1
    expect(g.player.shieldCd).toBeGreaterThan(9.9); // 恢复成功重置 10 后继续倒走
  });

  it("满盾时 shieldCd 冻结：recompute 保留现值，推进模拟仍不倒计时", () => {
    const g = fresh();
    g.quota = 0;
    g.spawnCd = 1e9;
    learn(g, "能量护盾", 2); // 2/2 满盾
    g.player.shieldCd = 7; // 满盾下恢复 gate 关闭（B5 语义）
    g.recompute();
    expect(g.player.shield).toBe(2);
    expect(g.player.shieldCd).toBe(7); // 重算原样保留（不重置、不清零）
    ticks(g, 120); // 2s：满盾冻结，shieldCd 不动
    expect(g.player.shield).toBe(2);
    expect(g.player.shieldCd).toBe(7);
  });
});

describe("S4-C C3-B · 获得路径边界与交错回归", () => {
  it("未学习能量护盾时，其他天赋学习（含生命卡/混合卡）不得增加 shieldMax 或 shield", () => {
    const g = fresh();
    learn(g, "磐石");
    learn(g, "磨刃");
    learn(g, "生命之泉"); // C3-A 卡：只回满 HP，不赠盾
    learn(g, "击杀狂热"); // 未迁移混合卡：旧 f，无盾写入
    expect(g.player.shieldMax).toBe(0);
    expect(g.player.shield).toBe(0);
    g.recompute();
    expect(g.player.shieldMax).toBe(0); // 重算容量保持 base 0
    expect(g.player.shield).toBe(0);
  });

  it("满级（3 级）再学失败：零副作用、不赠盾", () => {
    const g = fresh();
    learn(g, "能量护盾", 3);
    expect(g.player.shieldMax).toBe(3);
    expect(g.player.shield).toBe(3);
    const before = JSON.stringify(g.player);
    expect(g.learnTalent(talent("能量护盾"))).toBe(false); // 满级路径早退
    expect(JSON.stringify(g.player)).toBe(before); // 失败路径零赠层/零写入
  });

  it("能量护盾与生命之泉/巨人血脉/血包永久成长交错学习和重算：各归其源、运行状态保留", () => {
    const g = fresh();
    growByConversions(g, 2); // 真实满血血包入口累计 potionMaxHpGrow=2
    expect(g.potionMaxHpGrow).toBe(2);
    learn(g, "能量护盾", 2); // 2/2
    learn(g, "生命之泉"); // maxhp 102+20=122，回满（OnAcquire 不回归）
    expect(g.player.maxhp).toBe(122);
    expect(g.player.hp).toBe(122);
    learn(g, "巨人血脉"); // maxhp 152，hp+30=152（OnAcquire 不回归）
    expect(g.player.maxhp).toBe(152);
    expect(g.player.hp).toBe(152);
    g.player.shield = 0; // 消耗盾层
    g.player.shieldCd = 3.3;
    g.recompute();
    // 属性面：生命（C3-A 来源）与护盾容量（C3-B 来源）同时正确重建
    expect(g.player.maxhp).toBe(152);
    expect(g.player.shieldMax).toBe(2);
    // 运行状态面：护盾现值保留
    expect(g.player.shield).toBe(0);
    expect(g.player.shieldCd).toBe(3.3);
    // 双生命卡 OnAcquire 行为不回归：受伤后再学血脉 +30（不回满）
    g.player.hp = 50;
    learn(g, "巨人血脉");
    expect(g.player.maxhp).toBe(182);
    expect(g.player.hp).toBe(80);
    g.recompute();
    expect(g.player.maxhp).toBe(182); // 重算不重放治疗（C3-A 语义）
    expect(g.player.hp).toBe(80);
    expect(g.player.shield).toBe(0); // 护盾现值继续保留
    expect(g.player.shieldCd).toBe(3.3);
  });

  it("随机抽卡与置换的 RNG 消耗数量不变：learnTalent 零次、melt 恰好 1 次", () => {
    const g = fresh();
    const rand = vi.spyOn(Math, "random");
    learn(g, "能量护盾");
    learn(g, "能量护盾");
    expect(rand).toHaveBeenCalledTimes(0); // 学习路径零 RNG（现状即如此）
    g.wavePhase = "rest";
    g.openSwap();
    g.setSwapTarget(3); // 材料档 t2（能量护盾×2 份）→ 输出 t3
    g.selectMaterial("能量护盾");
    g.selectMaterial("能量护盾");
    rand.mockClear();
    rand.mockReturnValue(0.4); // t3 池 [星辰坠落, 击杀狂热] idx 0
    const output = g.melt();
    expect(output?.n).toBe("星辰坠落");
    expect(rand).toHaveBeenCalledTimes(1); // 池抽取恰好 1 次
    expect(g.player.upCounts["能量护盾"]).toBeUndefined(); // 两级全部移除
    expect(g.player.shieldMax).toBe(0); // 无来源 → 权威回落 base
    expect(g.player.shield).toBe(0); // 上限降为 0 → 夹紧
  });

  it("旧版获得路径独立对照：学习路径与旧 f 语义逐位一致（1~3 级）", () => {
    for (const lv of [1, 2, 3]) {
      const g = fresh();
      learn(g, "能量护盾", lv);
      const legacy = legacyShield(lv);
      expect(g.player.shieldMax).toBe(legacy.shieldMax);
      expect(g.player.shield).toBe(legacy.shield);
      // 重算后容量仍与旧 f 重放语义一致；已消耗现值保留是 D-C3-02 批准差异
      //（旧 f 重放会回满——该差异由 R-2/B6 反转断言咬住，此处不重复）
      g.player.shield = 0;
      g.recompute();
      expect(g.player.shieldMax).toBe(legacy.shieldMax);
    }
  });
});

describe("S4-C C3-B · 结构契约（防绝对投影掩盖重复写入）", () => {
  it("能量护盾 f 为空操作：直接调用后 Player 全字段 JSON 不变", () => {
    const g = fresh();
    const before = JSON.stringify(g.player);
    talent("能量护盾").f(g.player);
    expect(JSON.stringify(g.player)).toBe(before);
  });

  it("OnAcquireEffects 对未登记卡 no-op（星辰坠落等仍走旧 f，不误伤）", () => {
    const g = fresh();
    const before = JSON.stringify(g.player);
    // C3-C 起击杀狂热已登记（首级 Buff，见 tests/s4c-c3c-runtime.test.ts），
    // 未登记样本改用仍走旧 f 的星辰坠落/磨刃（无获得时效果）
    applyOnAcquireEffect("星辰坠落", g.player, 0);
    applyOnAcquireEffect("疾影步", g.player, 0);
    applyOnAcquireEffect("磨刃", g.player, 0);
    applyOnAcquireEffect("壁垒", g.player, 0);
    expect(JSON.stringify(g.player)).toBe(before);
  });
});
