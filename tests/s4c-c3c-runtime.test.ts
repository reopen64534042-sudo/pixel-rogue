import { afterEach, describe, expect, it, vi } from "vitest";
import { fresh, learn, talent, ticks, enemy } from "./helpers";

/**
 * S4-C C3-C：狂热/冲刺/等级属性权威迁移 + 完整运行状态保护与上限协调。
 *
 * 契约 docs/pixel-rogue-S4C-C3-contract-v1.md（v1.2）：
 * - G-10～G-22 为契约 §7.2 狂热/冲刺/换波验收的可执行落地（本批实施 C3-C）；
 * - 旧行为对照（旧 f 语义独立重述 legacyLevels）证明学习路径与迁移前逐位
 *   一致（dashMax 含逐位浮点序列）；
 * - 结构钉子（六卡 f 空操作 / OnAcquire no-op 分发）咬住「绝对投影掩盖
 *   重复写入」类变异。
 *
 * 反转记录：R-3/R-4（tests/s4c-recompute-audit）已按 D-C3-03/04/06 反转为
 * 保留断言；R-1/R-2/R-5 不变；B7~B11/B14/B16 持续通过（B15 断言值不变、
 * 注释更新为保留语义）。
 *
 * 防御性路径说明（G-12/G-13）：击杀狂热为 t3，SwapSystem.selectMaterial
 * 拒绝 t>2 材料——降级/移除在当前生产置换中不可达。用例以「保持 picks/
 * upCounts 一致地构造材料已移除状态 + 调用真实生产 recompute()」的方式
 * 验证防御性协调，不绕过 recompute 直接调用 reconcileRuntimeToCaps 冒充
 * 全链路验证（契约 §2 D-C3-03 可达性备注）。
 */
// P3（第一轮评审先例）：恢复全局 Mock，防止 Math.random spy 跨测试泄漏污染
afterEach(() => {
  vi.restoreAllMocks();
});

/** 真实路径累计 n 次满血转化（C3-A 持久来源） */
function growByConversions(g: ReturnType<typeof fresh>, n: number) {
  g.player.hp = g.player.maxhp;
  for (let i = 0; i < n; i++) {
    g.potions.push({ x: g.player.x, y: g.player.y });
    g.update(1 / 60);
  }
}

/** 迁移前旧 f 语义的独立重述（不引用 talent.f / 来源表）：等级属性与首级 Buff 按旧规则推导 */
function legacyLevels(picks: string[]) {
  let hasteLv = 0,
    // 基线更新依据：Issue #137——开局自带 dashLv=1（共享基础动作），疾影步
    // 每级 +1 dashLv / −0.4 dashMax（首级 2.0 与旧「解锁」序列逐位一致）
    dashLv = 1,
    dashMax = 2.4,
    dashChargeLv = 0,
    barrierLv = 0,
    nd = 0,
    rageLv = 0,
    haste = 0,
    hasteT = 0;
  for (const n of picks) {
    if (n === "击杀狂热") {
      hasteLv++;
      if (hasteLv === 1) {
        haste = 1;
        hasteT = 3;
      }
    } else if (n === "疾影步") {
      dashLv++;
      dashMax -= 0.4;
    } else if (n === "双段疾冲") dashChargeLv++;
    else if (n === "壁垒") barrierLv++;
    else if (n === "不屈") nd = 1;
    else if (n === "战意沸腾") rageLv++;
  }
  return {
    hasteLv,
    haste,
    hasteT,
    dashLv,
    dashMax,
    dashChargeLv,
    barrierLv,
    nd,
    rageLv,
  };
}

/** 防御性路径：保持 picks/upCounts 一致地移除一级击杀狂热（再走真实 recompute） */
function removeHasteLevel(g: ReturnType<typeof fresh>) {
  g.player.picks.splice(g.player.picks.lastIndexOf("击杀狂热"), 1);
  const left = (g.player.upCounts["击杀狂热"] ?? 0) - 1;
  if (left > 0) g.player.upCounts["击杀狂热"] = left;
  else delete g.player.upCounts["击杀狂热"];
}

describe("S4-C C3-C · 契约 §7.2 验收：狂热（G-10～G-14）", () => {
  it("G-10 狂热 Buff 过期后 recompute：不重触发、过期态保持（R-3 语义）", () => {
    const g = fresh();
    learn(g, "击杀狂热");
    expect(g.player.haste).toBe(1);
    expect(g.player.hasteT).toBe(3);
    // 推进到 Buff 过期
    g.player.haste = 0;
    g.player.hasteT = 0;
    g.recompute();
    // 旧行为（C3-0 pin，基线 3b0e198）：重放 f 首级分支 → Buff 重新触发。
    // C3-C（D-C3-03）：haste/hasteT 属 RuntimeState，重算保留现值
    expect(g.player.haste).toBe(0);
    expect(g.player.hasteT).toBe(0);
    expect(g.player.hasteLv).toBe(1); // 等级属性按 picks 重建
  });

  it("G-11 Buff 生效中学第 2 级：haste/hasteT 不刷新、不重触发", () => {
    const g = fresh();
    learn(g, "击杀狂热");
    g.player.haste = 3; // 击杀叠层后的中间态
    g.player.hasteT = 2;
    learn(g, "击杀狂热");
    expect(g.player.hasteLv).toBe(2);
    expect(g.player.haste).toBe(3); // OnAcquire lvBefore>0 → 不改变
    expect(g.player.hasteT).toBe(2);
  });

  it("G-12 Lv.2→1 降级夹紧：haste 5→4、hasteT=1.7 不刷新、衰减继续（防御性路径）", () => {
    const g = fresh();
    learn(g, "击杀狂热", 2);
    expect(g.player.hasteLv).toBe(2);
    g.player.haste = 5; // = hasteCap(2)
    g.player.hasteT = 1.7;
    // 防御性路径构造（t3 不可作熔炉材料，见文件头注）+ 真实生产 recompute
    removeHasteLevel(g);
    g.recompute();
    expect(g.player.hasteLv).toBe(1);
    expect(g.player.haste).toBe(4); // 夹紧至 hasteCap(1)
    expect(g.player.hasteT).toBe(1.7); // 部分降级不刷新
    // 衰减不受夹紧影响
    g.quota = 0;
    g.spawnCd = 1e9;
    ticks(g, 60); // 1s
    expect(g.player.hasteT).toBeCloseTo(0.7, 8);
    expect(g.player.haste).toBe(4);
  });

  it("G-13 Lv.1→0 移除末级：清空 haste/hasteT（防御性路径）", () => {
    const g = fresh();
    learn(g, "击杀狂热");
    g.player.haste = 2;
    g.player.hasteT = 1.5;
    removeHasteLevel(g);
    g.recompute();
    expect(g.player.hasteLv).toBe(0);
    expect(g.player.haste).toBe(0);
    expect(g.player.hasteT).toBe(0);
  });

  it("G-14 rageT 独立运行状态：recompute 保留、自然衰减、rageLv 恒存", () => {
    const g = fresh();
    g.quota = 0;
    g.spawnCd = 1e9;
    learn(g, "战意沸腾");
    g.player.rageT = 1.5;
    g.recompute();
    expect(g.player.rageLv).toBe(1);
    expect(g.player.rageT).toBe(1.5); // 不清除、不刷新
    ticks(g, 60); // 1s
    expect(g.player.rageT).toBeCloseTo(0.5, 8);
    ticks(g, 60);
    expect(g.player.rageT).toBeLessThanOrEqual(0);
    expect(g.player.rageLv).toBe(1); // 衰减只影响 rageT
    g.recompute();
    expect(g.player.rageLv).toBe(1); // 重算不影响等级属性
  });
});

describe("S4-C C3-C · 契约 §7.2 验收：冲刺（G-15～G-19）", () => {
  it("G-15 冲刺运行状态重算保留：charges=0、dashRe=0.8、dashT=-0.3 反复重算原样", () => {
    const g = fresh();
    learn(g, "疾影步");
    g.player.dashCharges = 0; // 充能已用尽
    g.player.dashRe = 0.8; // 恢复倒计时非整数剩余
    g.player.dashT = -0.3; // 触发窗口冷却中
    g.recompute();
    // 旧行为（C3-0 pin）：charges=1/dashRe=0/dashT=-1（补满清零）。C3-C
    // （D-C3-06）：三值原样保留——不补回已消耗充能、不刷新恢复倒计时
    expect(g.player.dashCharges).toBe(0);
    expect(g.player.dashRe).toBe(0.8);
    expect(g.player.dashT).toBe(-0.3);
    expect(g.player.dashLv).toBe(2); // #137：基础 1 + 疾影步 1 级
    expect(g.player.dashMax).toBe(2);
    g.recompute();
    g.recompute();
    // 幂等：反复重算不补充、不重置
    expect(g.player.dashCharges).toBe(0);
    expect(g.player.dashRe).toBe(0.8);
    expect(g.player.dashT).toBe(-0.3);
  });

  it("G-16 dashMax L3 逐位 1.2000000000000002；升级不缩放 dashRe（有序 flat 非折叠式）", () => {
    const g = fresh();
    learn(g, "疾影步", 2);
    expect(g.player.dashMax).toBe(1.6);
    g.player.dashRe = 1.2; // 升级时恢复倒计时进行中
    learn(g, "疾影步");
    expect(g.player.dashLv).toBe(4); // #137：基础 1 + 3 级
    // 1.6 − 0.4 的 IEEE-754 结果 ≠ 1.2（折叠式 2.4−1.2 会得 1.2，B10/B16 逐位钉子）
    expect(g.player.dashMax).toBe(1.2000000000000002);
    expect(g.player.dashRe).toBe(1.2); // 不按新 dashMax 缩放
    g.recompute();
    expect(g.player.dashMax).toBe(1.2000000000000002); // 重算幂等（有序 flat 逐位一致）
    expect(g.player.dashRe).toBe(1.2);
  });

  it("G-17 熔掉充能卡：充能上限 2→1 夹紧 charges、dashRe 保留（真实置换）", () => {
    const g = fresh();
    learn(g, "疾影步"); // #137 前用于解锁冲刺，现仅提供 dashMax −0.4 档
    // S2：旧卡「双段疾冲」已删除，用射手机动槽「双段疾冲」（同为 t0、同为 +1 充能）
    learn(g, "双段疾冲");
    learn(g, "疾风之靴"); // 第二份同档 t0 材料（melt 须两份同档）
    expect(g.player.dashChargeLv).toBe(1);
    g.player.dashCharges = 2; // 已充满
    g.player.dashRe = 0.4;
    g.wavePhase = "rest";
    g.openSwap();
    g.setSwapTarget(1);
    g.selectMaterial("双段疾冲");
    g.selectMaterial("疾风之靴");
    const rand = vi.spyOn(Math, "random").mockReturnValue(0.4); // t1 池内固定输出
    const output = g.melt();
    expect(output).toBeTruthy(); // 产出具体是哪张由 t1 池决定，本用例只验证夹紧语义
    expect(g.player.upCounts["双段疾冲"]).toBeUndefined();
    expect(g.player.upCounts["疾风之靴"]).toBeUndefined();
    expect(g.player.dashChargeLv).toBe(0); // 来源随材料移除
    expect(g.player.dashLv).toBe(2); // #137：基础 1 + 疾影步 1 级（材料仅移除双段疾冲/疾风之靴）
    expect(g.player.dashCharges).toBe(1); // min(2, dchMax=1)——不补回、只夹紧
    expect(g.player.dashRe).toBe(0.4); // 剩余时间原样（不缩放、不清零）
    expect(rand).toHaveBeenCalledTimes(1);
  });

  it("G-18 正在冲刺时重算不中断：实际位移延续、自然结束后接触无敌门控关闭", () => {
    // 随机性固化（本用例原先没有固定 Math.random，是全套里唯一会偶发误报的用例）：
    // 断言「冲刺结束后接触伤害必定结算」，就不能让暴击掷骰改变这一击的伤害量、
    // 也不能让掉落/闪避分支消耗随机序列。做法与 parity 一致——固定为不暴击值。
    // 依据：全量并行时该用例约每 12 次误报 1 次（单跑 20 次 0 失败），
    // 属测试自身未固定随机的缺陷，不是接触伤害的玩法问题。
    vi.spyOn(Math, "random").mockReturnValue(0.99);
    const g = fresh();
    g.spawnCd = 1e9; // 隔离自动刷怪（保留 quota，避免清场进入 collect）
    learn(g, "疾影步");
    // 可达性说明：契约 §6 冲刺④——rest 期置换可在 dashT>0 时完成 melt；
    // 本用例聚焦 recompute 对进行中冲刺的影响，直接构造 dashT=0.1（触发
    // 值 0.16 自然衰减 0.06s 后的合法中间值）+ 消耗一段充能的一致测试态，
    // 随后走真实 recompute，不绕过生产路径
    g.player.dashT = 0.1;
    g.player.dashCharges = 0;
    g.recompute();
    expect(g.player.dashT).toBe(0.1); // 不中断、不重置 -1
    expect(g.player.dashCharges).toBe(0); // 不补回充能
    // ① 实际位移：冲刺方向记忆（dx/dy 快照保留）驱动 PlayerSystem 冲刺分支，
    //    每帧按 280 px/s 推进（不是只在字段上倒计时）
    const x0 = g.player.x;
    ticks(g, 3); // 0.05s，dashT 仍 > 0
    expect(g.player.dashT).toBeCloseTo(0.05, 8);
    expect(g.player.x - x0).toBeCloseTo((280 * 3) / 60, 6); // 280 px/s 的实际位移
    // ② 无敌门控：真实 EnemySystem 接触碰撞路径（EnemySystem 接触判定
    //    `p.hurtCd <= 0 && p.dashT <= 0`）。令 dx=dy=0 使冲刺位移为 0、
    //    敌人保持与玩家重叠：冲刺窗内接触不结算伤害；冲刺自然结束后
    //    同一接触路径立即生效
    g.player.dx = 0;
    g.player.dy = 0;
    const e = enemy(g);
    e.x = g.player.x;
    e.y = g.player.y;
    const hpDuringDash = g.player.hp;
    ticks(g, 1); // dashT 0.05 → 0.0333（仍 > 0）
    expect(g.player.dashT).toBeGreaterThan(0);
    expect(g.player.hp).toBe(hpDuringDash); // 冲刺无敌：重叠接触不结算伤害
    ticks(g, 3); // 跨过 dashT 终点
    expect(g.player.dashT).toBeLessThanOrEqual(0);
    expect(g.player.hp).toBeLessThan(hpDuringDash); // 门控关闭后同一接触路径生效
  });

  it("G-19 失去疾影步保留双段疾冲：基础冲刺仍在（#137）、充能不清零；重学后 dashMax 降档（真实置换）", () => {
    const g = fresh();
    g.quota = 0;
    g.spawnCd = 1e9;
    learn(g, "疾影步");
    learn(g, "双段疾冲");
    learn(g, "战意沸腾"); // 第二份同档 t1 材料
    g.player.dashCharges = 2;
    g.wavePhase = "rest";
    g.openSwap();
    g.setSwapTarget(2);
    g.selectMaterial("疾影步");
    g.selectMaterial("战意沸腾");
    const rand = vi.spyOn(Math, "random").mockReturnValue(0); // t2 池 idx 0 = 会心深渊
    const output = g.melt();
    expect(output?.n).toBe("会心深渊");
    expect(rand).toHaveBeenCalledTimes(1); // 池抽取恰好 1 次
    // 基线更新依据：Issue #137——dashLv 基础值 1 不随疾影步移除而消失
    expect(g.player.dashLv).toBe(1);
    expect(g.player.dashMax).toBe(2.4); // 回落 base（疾影步的 −0.4/级 随材料移除）
    expect(g.player.dashChargeLv).toBe(1); // 双段疾冲保留
    expect(g.player.dashCharges).toBe(2); // dchMax 仍=2：不夹紧、不清零
    // 基础冲刺仍可触发（#137 前此场景 dashLv=0 门死；现在开局自带）
    g.player.dashT = -0.2;
    g.keys[" "] = true;
    ticks(g, 1);
    expect(g.player.dashT).toBe(0.16);
    expect(g.player.dashCharges).toBe(1); // 消耗一段
    g.keys[" "] = false;
    // 同波重学疾影步：dashLv=2、dashMax=2.0（−0.4/级）、充能沿用不补满
    learn(g, "疾影步");
    expect(g.player.dashLv).toBe(2);
    expect(g.player.dashMax).toBe(2);
    expect(g.player.dashCharges).toBe(1);
    g.player.dashT = -0.2;
    g.keys[" "] = true;
    ticks(g, 1);
    expect(g.player.dashT).toBe(0.16); // 重新可触发
    expect(g.player.dashCharges).toBe(0); // 消耗一段
    g.keys[" "] = false;
  });
});

describe("S4-C C3-C · 契约 §7.2 验收：换波与全局（G-20～G-22）", () => {
  it("G-20 换波显式重置面：potionGrow/tempShield(=barrierLv)/ndUsed；其余运行状态不动", () => {
    const g = fresh();
    learn(g, "壁垒", 2);
    learn(g, "不屈");
    learn(g, "击杀狂热");
    learn(g, "能量护盾", 2);
    growByConversions(g, 2);
    g.potionGrow = 5;
    g.player.tempShield = 0; // 本波临时盾已消耗
    g.player.ndUsed = true;
    g.player.haste = 2;
    g.player.hasteT = 1.1;
    g.player.rageT = 0.8;
    g.player.shield = 0;
    g.player.shieldCd = 3.3;
    g.player.dashT = -0.4;
    g.player.dashCharges = 0;
    g.player.dashRe = 1.7;
    g.player.meteorT = 0.9;
    g.player.orbA = 2.1;
    g.player.hurtCd = 0.3;
    g.player.dx = -1;
    g.player.dy = 0;
    g.wavePhase = "rest";
    expect(g.startNextWave()).toBe(true);
    // 显式重置面（D-C3-04 例外面，B14 语义）
    expect(g.potionGrow).toBe(0);
    expect(g.player.tempShield).toBe(2); // = barrierLv 赋值重建（非累加）
    expect(g.player.ndUsed).toBe(false);
    expect(g.potionMaxHpGrow).toBe(2); // 持久成长保留
    // 其余运行状态不因换波被清理（现状冻结确认，D-C3-04）
    expect(g.player.haste).toBe(2);
    expect(g.player.hasteT).toBe(1.1);
    expect(g.player.rageT).toBe(0.8);
    expect(g.player.shield).toBe(0);
    expect(g.player.shieldCd).toBe(3.3);
    expect(g.player.dashT).toBe(-0.4);
    expect(g.player.dashCharges).toBe(0);
    expect(g.player.dashRe).toBe(1.7);
    expect(g.player.meteorT).toBe(0.9);
    expect(g.player.orbA).toBe(2.1);
    expect(g.player.hurtCd).toBe(0.3);
    expect(g.player.dx).toBe(-1);
    expect(g.player.dy).toBe(0);
  });

  it("G-21 混合天赋交错 + recompute×3：属性幂等、15 个运行状态逐字段保留、无新增枚举字段", () => {
    const g = fresh();
    g.quota = 0;
    g.spawnCd = 1e9;
    learn(g, "磐石"); // C1
    learn(g, "生命之泉"); // C3-A
    learn(g, "能量护盾", 2); // C3-B
    learn(g, "击杀狂热"); // C3-C
    learn(g, "疾影步", 2);
    learn(g, "双段疾冲");
    learn(g, "壁垒");
    learn(g, "不屈");
    learn(g, "战意沸腾");
    learn(g, "磨刃"); // C2-A
    // 消耗/触发形成非默认运行状态
    g.player.shield = 1;
    g.player.shieldCd = 5.5;
    g.player.haste = 3;
    g.player.hasteT = 1.3;
    g.player.rageT = 1.9;
    g.player.dashT = -0.35;
    g.player.dashCharges = 1;
    g.player.dashRe = 0.9;
    g.player.meteorT = 0.7;
    g.player.tempShield = 1;
    g.player.ndUsed = true;
    g.player.orbA = 1.4;
    g.player.hurtCd = 0.25;
    g.player.dx = -1;
    g.player.dy = 0;
    g.player.hp = 77; // 受伤态（排除回满干扰）
    const keysBefore = JSON.stringify(Object.keys(g.player).sort());
    for (let i = 0; i < 3; i++) g.recompute();
    // 属性面逐位幂等（各归其源）
    expect(g.player.defense).toBe(15);
    expect(g.player.maxhp).toBe(120);
    expect(g.player.shieldMax).toBe(2);
    expect(g.player.hasteLv).toBe(1);
    expect(g.player.dashLv).toBe(3); // #137：基础 1 + 疾影步 2 级
    expect(g.player.dashMax).toBe(1.6);
    expect(g.player.dashChargeLv).toBe(1);
    expect(g.player.barrierLv).toBe(1);
    expect(g.player.nd).toBe(1);
    expect(g.player.rageLv).toBe(1);
    expect(g.player.damage).toBe(12.100000000000001);
    // 运行状态面：15 字段全部原样保留
    expect(g.player.shield).toBe(1);
    expect(g.player.shieldCd).toBe(5.5);
    expect(g.player.haste).toBe(3);
    expect(g.player.hasteT).toBe(1.3);
    expect(g.player.rageT).toBe(1.9);
    expect(g.player.dashT).toBe(-0.35);
    expect(g.player.dashCharges).toBe(1);
    expect(g.player.dashRe).toBe(0.9);
    expect(g.player.meteorT).toBe(0.7);
    expect(g.player.tempShield).toBe(1);
    expect(g.player.ndUsed).toBe(true);
    expect(g.player.orbA).toBe(1.4);
    expect(g.player.hurtCd).toBe(0.25);
    expect(g.player.dx).toBe(-1);
    expect(g.player.dy).toBe(0);
    // HP 夹紧（D-C3-05 逐字保留）
    expect(g.player.hp).toBe(77);
    // 不新增 Player 可枚举字段
    expect(JSON.stringify(Object.keys(g.player).sort())).toBe(keysBefore);
  });

  it("G-22 RNG 与时序纪律：六张卡 learnTalent 零随机、melt 恰好 1 次", () => {
    const g = fresh();
    const rand = vi.spyOn(Math, "random");
    for (const n of [
      "击杀狂热",
      "疾影步",
      "双段疾冲",
      "壁垒",
      "不屈",
      "战意沸腾",
    ])
      learn(g, n);
    expect(rand).toHaveBeenCalledTimes(0); // 学习路径零 RNG（现状即如此）
    learn(g, "屠戮之欲"); // 第二份同档 t2 材料
    g.wavePhase = "rest";
    g.openSwap();
    g.setSwapTarget(3); // 材料档 t2 → 输出 t3
    g.selectMaterial("壁垒");
    g.selectMaterial("屠戮之欲");
    rand.mockClear();
    rand.mockReturnValue(0); // t3 池 [星辰坠落, 击杀狂热] idx 0
    const output = g.melt();
    expect(output?.n).toBe("星辰坠落");
    expect(rand).toHaveBeenCalledTimes(1); // 池抽取恰好 1 次（RNG 纪律不变）
  });
});

describe("S4-C C3-C · 额外重点（任务书 §七）", () => {
  it("不屈：致死触发 ndUsed=true 后 recompute 保留，同波只能免死一次（真实 damagePlayer）", () => {
    const g = fresh();
    g.quota = 0;
    g.spawnCd = 1e9;
    learn(g, "不屈");
    expect(g.player.nd).toBe(1);
    g.damagePlayer(999, { type: "physical", form: "ranged" });
    expect(g.player.hp).toBe(1); // 首次免死
    expect(g.player.ndUsed).toBe(true);
    g.recompute();
    expect(g.player.ndUsed).toBe(true); // 重算不复活免死标记
    // 同波第二次致死：nd 门控 p.nd && !p.ndUsed 不成立 → 无第二次免死
    g.player.hp = 50;
    g.damagePlayer(999, { type: "physical", form: "ranged" });
    expect(g.player.hp).toBeLessThanOrEqual(0);
    expect(g.phase).toBe("over");
  });

  it("tempShield 已消耗后重算不补充；下一波按 barrierLv 重建", () => {
    const g = fresh();
    learn(g, "壁垒");
    g.player.tempShield = 0; // 本波已消耗
    g.recompute();
    expect(g.player.tempShield).toBe(0); // 重算不重发（D-C3-04）
    expect(g.player.barrierLv).toBe(1);
    g.wavePhase = "rest";
    expect(g.startNextWave()).toBe(true);
    expect(g.player.tempShield).toBe(1); // 换波显式重建
  });

  it("meteorT=0.5（陨星在途）重算保留，不刷新为初始 4；未迁移卡 meteor 属性面正常", () => {
    const g = fresh();
    learn(g, "星辰坠落"); // 未迁移卡：f 重放（meteor=1）
    g.player.meteorT = 0.5;
    g.recompute();
    expect(g.player.meteorT).toBe(0.5); // 在途计时保留
    expect(g.player.meteor).toBe(1); // 属性面经 f 重放重建（未迁移语义）
  });

  it("攻速 Buff 与疾速扳机乘区互不污染：haste 不烘焙进 fireRate 投影", () => {
    const g = fresh();
    learn(g, "疾速扳机"); // C2-B：fireRate ×1.18 投影
    const baseFire = g.player.fireRate;
    learn(g, "击杀狂热"); // OnAcquire：haste=1/hasteT=3（Buff）
    expect(g.player.fireRate).toBe(baseFire); // Buff 不污染属性
    expect(g.player.haste).toBe(1);
    g.killEnemy(enemy(g)); // 击杀叠层（haste=2、hasteT=2+hasteLv=3）
    expect(g.player.haste).toBe(2);
    expect(g.player.fireRate).toBe(baseFire); // 叠层同样只走消费点动态乘算
    g.recompute();
    expect(g.player.fireRate).toBe(baseFire); // 重算幂等（haste 不进投影）
    expect(g.player.haste).toBe(2);
    expect(g.player.hasteT).toBe(3);
  });

  it("六张卡满级学习失败：零副作用（不触发 Buff、不写属性）", () => {
    const g = fresh();
    learn(g, "疾影步", 3);
    learn(g, "壁垒", 2);
    learn(g, "战意沸腾", 2);
    learn(g, "不屈");
    learn(g, "击杀狂热", 3);
    learn(g, "双段疾冲");
    const before = JSON.stringify(g.player);
    for (const n of [
      "疾影步",
      "壁垒",
      "战意沸腾",
      "不屈",
      "击杀狂热",
      "双段疾冲",
    ])
      expect(g.learnTalent(talent(n))).toBe(false); // 满级路径早退
    expect(JSON.stringify(g.player)).toBe(before); // 失败路径零写入
  });

  it("真实宝箱入口：chooseSlot 强化壁垒/疾影步，属性投影正确、本波 tempShield 不变", () => {
    const g = fresh();
    learn(g, "壁垒");
    g.bpMode = "box";
    g.boxPicks = 1;
    g.slots = [{ u: talent("壁垒"), used: false }];
    expect(g.chooseSlot(0)).toBe(true);
    expect(g.player.barrierLv).toBe(2); // 权威投影
    expect(g.player.tempShield).toBe(0); // 学习不发放临时盾——换波才按 barrierLv 重建
    learn(g, "疾影步");
    g.bpMode = "box";
    g.boxPicks = 1;
    g.slots = [{ u: talent("疾影步"), used: false }];
    expect(g.chooseSlot(0)).toBe(true);
    expect(g.player.dashLv).toBe(3); // #137：基础 1 + 疾影步 2 级
    expect(g.player.dashMax).toBe(1.6); // 有序 flat 逐位
    g.wavePhase = "rest";
    expect(g.startNextWave()).toBe(true);
    expect(g.player.tempShield).toBe(2); // 下一波按 barrierLv=2 重建
  });

  it("S2 射手卡经 recompute 重建后属性不丢（投影幂等）", () => {
    const g = fresh();
    learn(g, "破甲箭");
    learn(g, "三重射击");
    const { pierce, multishot, pierceFalloff, boltDmgMul } = g.player;
    g.recompute();
    expect(g.player.pierce).toBe(pierce);
    expect(g.player.multishot).toBe(multishot);
    expect(g.player.pierceFalloff).toBe(pierceFalloff);
    expect(g.player.boltDmgMul).toBe(boltDmgMul);
  });
});

describe("S4-C C3-C · 旧行为对照与结构契约", () => {
  it("旧版学习路径独立对照：六张卡 learnTalent 与旧 f 语义逐位一致（含 dashMax 浮点序列）", () => {
    const orders = [
      ["击杀狂热", "疾影步", "战意沸腾"],
      ["疾影步", "疾影步", "击杀狂热", "壁垒", "不屈", "双段疾冲"],
      ["战意沸腾", "战意沸腾", "疾影步", "疾影步", "疾影步"],
    ];
    for (const order of orders) {
      const g = fresh();
      for (const n of order) learn(g, n);
      const legacy = legacyLevels(order);
      expect(g.player.hasteLv).toBe(legacy.hasteLv);
      expect(g.player.haste).toBe(legacy.haste); // 首级 Buff 逐字一致
      expect(g.player.hasteT).toBe(legacy.hasteT);
      expect(g.player.dashLv).toBe(legacy.dashLv);
      expect(g.player.dashMax).toBe(legacy.dashMax); // 含 1.2000000000000002
      expect(g.player.dashChargeLv).toBe(legacy.dashChargeLv);
      expect(g.player.barrierLv).toBe(legacy.barrierLv);
      expect(g.player.nd).toBe(legacy.nd); // 数字 0/1
      expect(g.player.rageLv).toBe(legacy.rageLv);
      g.recompute();
      // 重算后属性面仍一致（重放路径自 C3-C 起不含这六卡的写入）
      expect(g.player.dashMax).toBe(legacy.dashMax);
      expect(g.player.hasteLv).toBe(legacy.hasteLv);
      expect(g.player.nd).toBe(legacy.nd);
    }
  });

  it("C3-C 结构契约：六张卡 f 为空操作（直接调用后 Player 全字段 JSON 不变）", () => {
    const g = fresh();
    const before = JSON.stringify(g.player);
    for (const n of [
      "击杀狂热",
      "疾影步",
      "双段疾冲",
      "壁垒",
      "不屈",
      "战意沸腾",
    ])
      talent(n).f(g.player);
    expect(JSON.stringify(g.player)).toBe(before);
  });
});
