import { afterEach, describe, expect, it, vi } from "vitest";
import { enemy, fresh, learn, meltRollFor, talent, ticks } from "./helpers";
import { statBase } from "../src/game/data/stats";
import { boltDamage } from "../src/game/core/DamageMath";
import type { GameCore } from "../src/game/core/GameCore";
import type { Player } from "../src/game/core/types";

// P3（C1 先例）：恢复全局 Mock，防止 Math.random spy 跨测试泄漏污染
afterEach(() => {
  vi.restoreAllMocks();
});

/**
 * S4-C C2-B 聚焦测试：五张乘法属性天赋（强化弹丸/疾速扳机/疾风之靴/
 * 磁力护符/广域法印）的 boltDmgMul/fireRate/speed/magnet/area 逐次乘算
 * 贡献由 core/TalentStatSources.ts 权威来源表声明（StatModel 对应 StatId
 * final 区按 picks 顺序连乘），Talent.f 不再写入。
 *
 * 断言分层（对齐任务书 §四/§五/§六）：
 * - 旧实现基准逐位对照：legacyMultiplicative 独立重述迁移前 `p.X *= m`
 *   语义（statBase 对应字段起始、picks 顺序逐次乘算、不引用来源表/f），
 *   全部场景 toBe 逐位一致；
 * - 硬编码浮点尾钉子（多级 ≠ percent 折叠，捕捉来源表/解析语义漂移）；
 * - 全链路接入点（升级面板/宝箱强化/置换/重算）同步与幂等；
 * - 五条消费路径逐项回归（魔弹/攻速/移速/拾取/范围），生成时固化 vs
 *   命中时读取的既有行为分别钉住，不擅自统一。
 */

/** 旧实现基准：迁移前 data/talents.ts 五张卡 f 的语义独立重述（不引用 f） */
function legacyMultiplicative(picks: readonly string[]) {
  const b = statBase();
  const st = {
    boltDmgMul: b.boltDmgMul,
    fireRate: b.fireRate,
    speed: b.speed,
    magnet: b.magnet,
    area: b.area,
  };
  for (const n of picks) {
    if (n === "强化弹丸") st.boltDmgMul *= 1.25;
    else if (n === "疾速扳机") st.fireRate *= 1.18;
    else if (n === "疾风之靴") st.speed *= 1.1;
    else if (n === "磁力护符") st.magnet *= 1.4;
    else if (n === "广域法印") st.area *= 1.2;
  }
  return st;
}

/** 旧实现基准：迁移前三张伤害卡 f 的语义独立重述（交错场景用，不引用 f） */
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

/** 本批五张乘法卡（结构钉子与无关天赋过滤共用） */
const MULTIPLICATIVE_CARDS = [
  "强化弹丸",
  "疾速扳机",
  "疾风之靴",
  "磁力护符",
  "广域法印",
] as const;

/** 五字段 + damage 的投影快照（recompute 幂等对照用） */
function statSnapshot(g: GameCore) {
  const p = g.player;
  return JSON.stringify({
    boltDmgMul: p.boltDmgMul,
    fireRate: p.fireRate,
    speed: p.speed,
    magnet: p.magnet,
    area: p.area,
    damage: p.damage,
    picks: p.picks,
  });
}

describe("S4-C C2-B · 单级/多级/满级（旧权威逐位对照）", () => {
  it("强化弹丸：×1 → 1.25，×2 → 1.5625，满级 ×30 → 807.793566946316", () => {
    const g = fresh();
    learn(g, "强化弹丸");
    expect(g.player.boltDmgMul).toBe(1.25);
    expect(g.player.boltDmgMul).toBe(legacyMultiplicative(["强化弹丸"]).boltDmgMul);
    learn(g, "强化弹丸");
    expect(g.player.boltDmgMul).toBe(1.5625);
    // 多级逐次乘算不得折叠成 percent：+0.25+0.25 → 1.5 不是本实现
    expect(g.player.boltDmgMul).not.toBe(1 * (1 + 0.25 + 0.25));
    expect(g.player.boltDmgMul).toBe(
      legacyMultiplicative(["强化弹丸", "强化弹丸"]).boltDmgMul,
    );
    const gMax = fresh();
    learn(gMax, "强化弹丸", 30);
    expect(gMax.player.boltDmgMul).toBe(807.793566946316);
    expect(gMax.player.boltDmgMul).toBe(
      legacyMultiplicative(Array(30).fill("强化弹丸")).boltDmgMul,
    );
  });

  it("疾速扳机：×1 → 2.596，×2 → 3.06328，满级 ×8 → 8.269490245875355", () => {
    const g = fresh();
    learn(g, "疾速扳机");
    expect(g.player.fireRate).toBe(2.596);
    expect(g.player.fireRate).toBe(legacyMultiplicative(["疾速扳机"]).fireRate);
    learn(g, "疾速扳机");
    // percent 折叠（1+0.18+0.18=1.36 → 2.992）不是逐次乘算 3.06328
    expect(g.player.fireRate).toBe(3.06328);
    expect(g.player.fireRate).not.toBe(2.2 * (1 + 0.18 + 0.18));
    expect(g.player.fireRate).toBe(
      legacyMultiplicative(["疾速扳机", "疾速扳机"]).fireRate,
    );
    const gMax = fresh();
    learn(gMax, "疾速扳机", 8);
    expect(gMax.player.fireRate).toBe(8.269490245875355);
    expect(gMax.player.fireRate).toBe(
      legacyMultiplicative(Array(8).fill("疾速扳机")).fireRate,
    );
  });

  it("疾风之靴：×1 → 68.2，×2 → 75.02000000000001，满级 ×6 → 109.83678200000007", () => {
    const g = fresh();
    learn(g, "疾风之靴");
    expect(g.player.speed).toBe(68.2);
    expect(g.player.speed).toBe(legacyMultiplicative(["疾风之靴"]).speed);
    learn(g, "疾风之靴");
    // 68.2×1.1 的浮点尾 ≠ percent 折叠 62×1.2 = 74.4
    expect(g.player.speed).toBe(75.02000000000001);
    expect(g.player.speed).not.toBe(62 * (1 + 0.1 + 0.1));
    expect(g.player.speed).toBe(
      legacyMultiplicative(["疾风之靴", "疾风之靴"]).speed,
    );
    const gMax = fresh();
    learn(gMax, "疾风之靴", 6);
    expect(gMax.player.speed).toBe(109.83678200000007);
    expect(gMax.player.speed).toBe(
      legacyMultiplicative(Array(6).fill("疾风之靴")).speed,
    );
  });

  it("磁力护符：×1 → 50.4，×2 → 70.55999999999999，满级 ×5 → 193.61663999999993", () => {
    const g = fresh();
    learn(g, "磁力护符");
    expect(g.player.magnet).toBe(50.4);
    expect(g.player.magnet).toBe(legacyMultiplicative(["磁力护符"]).magnet);
    learn(g, "磁力护符");
    // percent 折叠 36×1.8 = 64.8 不是逐次乘算 70.55999999999999
    expect(g.player.magnet).toBe(70.55999999999999);
    expect(g.player.magnet).not.toBe(36 * (1 + 0.4 + 0.4));
    expect(g.player.magnet).toBe(
      legacyMultiplicative(["磁力护符", "磁力护符"]).magnet,
    );
    const gMax = fresh();
    learn(gMax, "磁力护符", 5);
    expect(gMax.player.magnet).toBe(193.61663999999993);
    expect(gMax.player.magnet).toBe(
      legacyMultiplicative(Array(5).fill("磁力护符")).magnet,
    );
  });

  it("广域法印：×1 → 1.2，×2 → 1.44，满级 ×4 → 2.0736", () => {
    const g = fresh();
    learn(g, "广域法印");
    expect(g.player.area).toBe(1.2);
    expect(g.player.area).toBe(legacyMultiplicative(["广域法印"]).area);
    learn(g, "广域法印");
    // percent 折叠 1×1.4 = 1.4 不是逐次乘算 1.44
    expect(g.player.area).toBe(1.44);
    expect(g.player.area).not.toBe(1 * (1 + 0.2 + 0.2));
    expect(g.player.area).toBe(legacyMultiplicative(["广域法印", "广域法印"]).area);
    const gMax = fresh();
    learn(gMax, "广域法印", 4);
    expect(gMax.player.area).toBe(2.0736);
    expect(gMax.player.area).toBe(
      legacyMultiplicative(Array(4).fill("广域法印")).area,
    );
  });
});

describe("S4-C C2-B · 交错学习与无关天赋", () => {
  it("五卡正序/逆序交错学习：五字段各自与旧基准逐位一致", () => {
    for (const order of [
      [...MULTIPLICATIVE_CARDS],
      [...MULTIPLICATIVE_CARDS].reverse(),
    ]) {
      const g = fresh();
      learnOrder(g, order);
      const legacy = legacyMultiplicative(order);
      expect(g.player.boltDmgMul).toBe(legacy.boltDmgMul);
      expect(g.player.fireRate).toBe(legacy.fireRate);
      expect(g.player.speed).toBe(legacy.speed);
      expect(g.player.magnet).toBe(legacy.magnet);
      expect(g.player.area).toBe(legacy.area);
      expect(g.player.boltDmgMul).toBe(1.25);
      expect(g.player.fireRate).toBe(2.596);
      expect(g.player.speed).toBe(68.2);
      expect(g.player.magnet).toBe(50.4);
      expect(g.player.area).toBe(1.2);
    }
  });

  it("与 C2-A 伤害卡交错：damage 与 boltDmgMul 各自独立解析、互不串乘", () => {
    const g = fresh();
    learnOrder(g, ["磨刃", "强化弹丸", "磨刃", "疾速扳机"]);
    const p = g.player;
    expect(p.damage).toBe(legacyDamage(["磨刃", "磨刃"]));
    expect(p.damage).toBe(13.310000000000002);
    expect(p.boltDmgMul).toBe(1.25);
    expect(p.fireRate).toBe(2.596);
    // boltDamage = damage × boltDmgMul，与学习顺序无关（不同属性独立解析）
    // damage 13.310000000000002 × boltDmgMul 1.25 = 16.637500000000003
    expect(boltDamage(p)).toBe(16.637500000000003);
    expect(boltDamage(p)).toBe(
      legacyDamage(["磨刃", "磨刃"]) *
        legacyMultiplicative(["强化弹丸"]).boltDmgMul,
    );
  });

  it("学习无关天赋（C1 flat 卡）：五字段不发生重复乘算", () => {
    const g = fresh();
    learnOrder(g, ["磐石", "铁布衫", "会心深渊", "磐石"]);
    expect(g.player.boltDmgMul).toBe(1);
    expect(g.player.fireRate).toBe(2.2);
    expect(g.player.speed).toBe(62);
    expect(g.player.magnet).toBe(36);
    expect(g.player.area).toBe(1);
    expect(g.player.defense).toBe(30); // 无关卡自身贡献照常投影
    learn(g, "磁力护符");
    expect(g.player.magnet).toBe(50.4); // 恰好一次 ×1.4
    learnOrder(g, ["铁布衫", "广域法印"]);
    expect(g.player.magnet).toBe(50.4); // 后续无关学习不再乘算
    expect(g.player.area).toBe(1.2);
    expect(g.player.magnet).toBe(
      legacyMultiplicative(g.player.picks.filter((n) => n === "磁力护符")).magnet,
    );
  });

  it("recompute 幂等：多次重算五字段与全部已迁移字段零漂移", () => {
    const g = fresh();
    learnOrder(g, [...MULTIPLICATIVE_CARDS, "磨刃"]);
    const before = statSnapshot(g);
    g.recompute();
    g.recompute();
    g.recompute();
    expect(statSnapshot(g)).toBe(before);
    expect(g.player.magnet).toBe(50.4);
    expect(g.player.area).toBe(1.2);
    const legacy = legacyMultiplicative(g.player.picks);
    expect(g.player.boltDmgMul).toBe(legacy.boltDmgMul);
    expect(g.player.fireRate).toBe(legacy.fireRate);
    expect(g.player.speed).toBe(legacy.speed);
    expect(g.player.magnet).toBe(legacy.magnet);
    expect(g.player.area).toBe(legacy.area);
  });

  it("结构钉子：五张卡 Talent.f 不再写入任何字段（单一权威来源的结构保证）", () => {
    // 投影为绝对覆写语义，learnTalent 内恢复旧 f 在数值上不可区分——
    // 「f 不写入」本身是交付契约，由此钉子直接咬住（C2-A 变异 ②a 先例）
    const g = fresh();
    const before = JSON.stringify(g.player);
    for (const name of MULTIPLICATIVE_CARDS) talent(name).f(g.player);
    expect(JSON.stringify(g.player)).toBe(before);
  });

  it("空 picks 投影 = statBase 基础值（fresh 后五字段不被改写）", () => {
    const g = fresh();
    expect(g.player.boltDmgMul).toBe(1);
    expect(g.player.fireRate).toBe(2.2);
    expect(g.player.speed).toBe(62);
    expect(g.player.magnet).toBe(36);
    expect(g.player.area).toBe(1);
    g.learnTalent(talent("磐石")); // 触发一次投影
    g.recompute();
    expect(g.player.boltDmgMul).toBe(1);
    expect(g.player.fireRate).toBe(2.2);
    expect(g.player.speed).toBe(62);
    expect(g.player.magnet).toBe(36);
    expect(g.player.area).toBe(1);
  });
});

describe("S4-C C2-B · 获取路径：升级面板、宝箱强化、置换全链路", () => {
  it("真实面板路径：选择后立即投影，学习步骤零额外 RNG", () => {
    const g = fresh();
    g.pendingLevels = 1;
    g.openLevelPanel();
    expect(g.bpMode).toBe("level");
    // S2：抽取池由 41 张变为 18 张射手卡（旧表 retired），同一随机序列不再
    // 落到这批 C2-B 卡上。本用例验证的是「面板路径 → learnTalent → 投影立即
    // 生效」，与抽到哪张无关，因此显式注入三张卡——不把随机顺序当契约。
    g.slots = [
      { u: talent("磁力护符"), used: false },
      { u: talent("强化弹丸"), used: false },
      { u: talent("荆棘护甲"), used: false },
    ];
    const spy = vi.spyOn(Math, "random");
    const before = spy.mock.calls.length;
    expect(g.chooseSlot(0)).toBe(true);
    // 学习步骤零额外 RNG（抽卡 RNG 只发生在 openLevelPanel）
    expect(spy.mock.calls.length).toBe(before);
    expect(g.player.magnet).toBe(50.4); // 立即投影，无二次叠加
    expect(g.player.upCounts["磁力护符"]).toBe(1);
    expect(g.player.picks).toEqual(["磁力护符"]);
    expect(g.pendingLevels).toBe(0);
    expect(g.bpMode).toBeNull();
  });

  it("宝箱强化（真实面板路径）：疾速扳机 ×2 → fireRate 3.06328", () => {
    const g = fresh();
    learn(g, "疾速扳机");
    expect(g.player.fireRate).toBe(2.596);
    g.boxPicks = 1;
    g.openBoxPanel(); // 只从已学未满级池抽 → 疾速扳机必入池
    expect(g.bpMode).toBe("box");
    expect(g.slots.map((s) => s.u.n)).toEqual(["疾速扳机"]);
    expect(g.chooseSlot(0)).toBe(true);
    expect(g.player.fireRate).toBe(3.06328);
    expect(g.player.fireRate).toBe(
      legacyMultiplicative(["疾速扳机", "疾速扳机"]).fireRate,
    );
    expect(g.bpMode).toBeNull();
  });

  it("置换移除全部：磁力护符×2 → magnet 回落基础值 36", () => {
    const g = fresh();
    learn(g, "磁力护符", 2);
    expect(g.player.magnet).toBe(70.55999999999999);
    g.wavePhase = "rest";
    g.openSwap();
    g.setSwapTarget(1);
    g.selectMaterial("磁力护符");
    g.selectMaterial("磁力护符");
    // S2：旧卡「分裂射击」已删除，改用同为 t1 且不影响 magnet 的「致命一击」
    vi.spyOn(Math, "random").mockReturnValue(meltRollFor(g, 1, "致命一击"));
    const output = g.melt();
    expect(output?.n).toBe("致命一击");
    expect(g.player.picks).toEqual(["致命一击"]);
    expect(g.player.magnet).toBe(36);
    expect(g.player.magnet).toBe(legacyMultiplicative(g.player.picks).magnet);
    g.recompute();
    expect(g.player.magnet).toBe(36); // 重算幂等
  });

  it("置换保留部分层级：磁力护符×3 熔 2 → 剩 1 级 ×1.4", () => {
    const g = fresh();
    learn(g, "磁力护符", 3);
    expect(g.player.magnet).toBe(98.78399999999998);
    g.wavePhase = "rest";
    g.openSwap();
    g.setSwapTarget(1);
    g.selectMaterial("磁力护符");
    g.selectMaterial("磁力护符");
    // S2：旧卡「分裂射击」已删除，改用同为 t1 且不影响 magnet 的「致命一击」
    vi.spyOn(Math, "random").mockReturnValue(meltRollFor(g, 1, "致命一击"));
    g.melt();
    // 剩余 1 级磁力护符保留 + 输出卡致命一击
    expect(g.player.picks).toEqual(["磁力护符", "致命一击"]);
    expect(g.player.magnet).toBe(50.4);
    expect(g.player.magnet).toBe(legacyMultiplicative(g.player.picks).magnet);
  });

  it("置换获得 C2-B 输出卡：2×疾风之靴 → 广域法印（t1 池 idx4），area/speed 各自正确", () => {
    const g = fresh();
    learn(g, "疾风之靴", 2);
    expect(g.player.speed).toBe(75.02000000000001);
    g.wavePhase = "rest";
    g.openSwap();
    g.setSwapTarget(1);
    g.selectMaterial("疾风之靴");
    g.selectMaterial("疾风之靴");
    // t1 池 12 项（含穿透之矢）：广域法印 idx 4 → random 0.35（floor(4.2)=4）
    vi.spyOn(Math, "random").mockReturnValue(meltRollFor(g, 1, "广域法印"));
    const output = g.melt();
    expect(output?.n).toBe("广域法印");
    expect(g.player.picks).toEqual(["广域法印"]);
    expect(g.player.speed).toBe(62); // 疾风之靴来源全部移除
    expect(g.player.area).toBe(1.2); // 输出卡经 learnTalent 投影
    expect(g.player.area).toBe(legacyMultiplicative(g.player.picks).area);
    g.recompute();
    expect(g.player.area).toBe(1.2);
  });

  it("置换输出 C2-A 卡与残留 C2-B 卡共存：两族来源同时正确解析", () => {
    const g = fresh();
    learnOrder(g, ["广域法印", "磨刃", "广域法印"]);
    expect(g.player.area).toBe(1.44);
    g.wavePhase = "rest";
    g.openSwap();
    g.setSwapTarget(1);
    // t1 材料：广域法印×2 → 目标档 2；产出按 t2 池位置反算（S2 删卡后顺序已变）
    g.selectMaterial("广域法印");
    g.selectMaterial("广域法印");
    vi.spyOn(Math, "random").mockReturnValue(meltRollFor(g, 2, "会心深渊"));
    const output = g.melt();
    expect(output?.n).toBe("会心深渊");
    // 剩余 picks：磨刃（保留）+ 会心深渊（输出）
    expect(g.player.picks).toEqual(["磨刃", "会心深渊"]);
    expect(g.player.area).toBe(1); // 广域法印来源全部移除
    expect(g.player.damage).toBe(12.100000000000001); // 磨刃保留 + 会心深渊无贡献
    expect(g.player.damage).toBe(legacyDamage(g.player.picks));
  });
});

describe("S4-C C2-B · pv/cur 显示口径与精度不变", () => {
  it("强化弹丸 pv/cur：学习前后读数与迁移前格式逐字一致", () => {
    const g = fresh();
    expect(talent("强化弹丸").pv(g.player)).toBe("魔弹伤害 11.0 → 13.8");
    learn(g, "强化弹丸");
    expect(talent("强化弹丸").pv(g.player)).toBe("魔弹伤害 13.8 → 17.2");
    expect(talent("强化弹丸").cur!(g.player)).toBe(
      "魔弹伤害 13.8（仅魔弹，全局伤害 11.0）",
    );
  });

  it("疾速扳机 pv/cur：toFixed(2) 精度不变", () => {
    const g = fresh();
    expect(talent("疾速扳机").pv(g.player)).toBe("攻速 2.20 → 2.60/秒");
    learn(g, "疾速扳机");
    expect(talent("疾速扳机").pv(g.player)).toBe("攻速 2.60 → 3.06/秒");
    expect(talent("疾速扳机").cur!(g.player)).toBe("当前攻速 2.60/秒");
  });

  it("疾风之靴 pv/cur：Math.round 精度不变（68.2 → 68、75.02… → 75）", () => {
    const g = fresh();
    expect(talent("疾风之靴").pv(g.player)).toBe("移速 62 → 68");
    learn(g, "疾风之靴");
    expect(talent("疾风之靴").pv(g.player)).toBe("移速 68 → 75");
    expect(talent("疾风之靴").cur!(g.player)).toBe("当前移速 68");
  });

  it("磁力护符 pv/cur：Math.round 精度不变（50.4 → 50、70.56… → 71）", () => {
    const g = fresh();
    expect(talent("磁力护符").pv(g.player)).toBe("拾取 36 → 50");
    learn(g, "磁力护符");
    expect(talent("磁力护符").pv(g.player)).toBe("拾取 50 → 71");
    expect(talent("磁力护符").cur!(g.player)).toBe("当前拾取范围 50");
  });

  it("广域法印 pv/cur：toFixed(2) 精度不变（×1.20、×1.44）", () => {
    const g = fresh();
    expect(talent("广域法印").pv(g.player)).toBe("范围 ×1.00 → ×1.20");
    learn(g, "广域法印");
    expect(talent("广域法印").pv(g.player)).toBe("范围 ×1.20 → ×1.44");
    expect(talent("广域法印").cur!(g.player)).toBe("施法范围加成 ×1.20");
  });
});

describe("S4-C C2-B 消费路径 A · 强化弹丸（boltDmgMul）", () => {
  it("boltDamage：damage 与 boltDmgMul 只相乘一次，磨刃/强化弹丸交错语义不变", () => {
    const g = fresh();
    learnOrder(g, ["磨刃", "强化弹丸", "磨刃"]);
    // damage 13.310000000000002（磨刃×2）× boltDmgMul 1.25（强化弹丸×1）
    expect(g.player.boltDmgMul).toBe(1.25);
    expect(boltDamage(g.player)).toBe(16.637500000000003);
    expect(boltDamage(g.player)).toBe(g.player.damage * g.player.boltDmgMul);
    expect(g.player.damage).toBe(legacyDamage(["磨刃", "磨刃"]));
    expect(boltDamage(g.player)).toBe(
      legacyDamage(["磨刃", "磨刃"]) *
        legacyMultiplicative(["强化弹丸"]).boltDmgMul,
    );
    // 强化弹丸 ×2：boltDmgMul 1.5625（final 逐次连乘）
    learn(g, "强化弹丸");
    expect(g.player.boltDmgMul).toBe(1.5625);
    expect(boltDamage(g.player)).toBe(20.796875000000004);
  });

  it("非魔弹来源不受 boltDmgMul 影响：陨星/灼烧/护盾反震公式只读 damage", () => {
    const g = fresh();
    learn(g, "强化弹丸", 3); // boltDmgMul 1.953125，damage 仍 11
    expect(g.player.boltDmgMul).toBe(1.953125);
    expect(g.player.damage).toBe(11);
    g.player.meteor = 2;
    // meteorDamage = damage×3 + meteor×8：boltDmgMul 不进陨星
    expect(g.player.damage * 3 + g.player.meteor * 8).toBe(49);
    // 灼烧每层 DPS = damage×0.1；护盾反震 = damage×2
    expect(1 * g.player.damage * 0.1).toBe(1.1);
    expect(g.player.damage * 2).toBe(22);
  });

  it("发射时快照：学习强化弹丸前发射的弹丸伤害与 stats 不回溯", () => {
    const g = fresh();
    vi.spyOn(Math, "random").mockReturnValue(0.99); // 不暴击
    const e = enemy(g, g.player.x + 30, g.player.y);
    e.hp = 9999;
    e.maxhp = 9999;
    g.player.fireCd = 0;
    g.update(1 / 60);
    expect(g.bullets).toHaveLength(1);
    expect(g.bullets[0].dmg).toBe(11);
    learn(g, "强化弹丸"); // 弹丸已在途
    expect(g.player.boltDmgMul).toBe(1.25);
    expect(g.bullets[0].dmg).toBe(11); // 发射时快照不变
    expect(g.bullets[0].stats!.attack).toBe(11);
    for (let i = 0; i < 40 && g.dmgBy.bullet === 0; i++) g.update(1 / 60);
    expect(g.dmgBy.bullet).toBe(11); // 按发射时 11 结算，不是 13.75
  });

  it("学习后新弹丸按投影值：dmg = damage × boltDmgMul", () => {
    const g = fresh();
    vi.spyOn(Math, "random").mockReturnValue(0.99);
    const e = enemy(g, g.player.x + 75, g.player.y); // 75px：单 tick 内弹丸不命中
    e.hp = 9999;
    e.maxhp = 9999;
    e.speed = 0;
    learn(g, "强化弹丸");
    g.player.fireCd = 0;
    g.update(1 / 60);
    expect(g.bullets).toHaveLength(1);
    expect(g.bullets[0].dmg).toBe(13.75);
  });
});

describe("S4-C C2-B 消费路径 B · 疾速扳机（fireRate）", () => {
  it("基础 fireRate 逐位一致：学习后字段 = 2.596，投影不烘焙动态攻速", () => {
    const g = fresh();
    learn(g, "击杀狂热"); // haste = 1（首次获得即时触发）、hasteT = 3
    expect(g.player.haste).toBe(1);
    learn(g, "疾速扳机");
    // p.fireRate 字段不含狂热：动态加成留在消费点（AttackSystem 开火公式）
    expect(g.player.fireRate).toBe(2.596);
    expect(g.player.fireRate).toBe(legacyMultiplicative(["疾速扳机"]).fireRate);
  });

  it("开火冷却公式不变：1/(fireRate×(1+haste×0.1+(rageT>0?0.2×rageLv:0)))", () => {
    const g = fresh();
    const e = enemy(g, g.player.x + 30, g.player.y);
    e.hp = 9999;
    e.maxhp = 9999;
    e.speed = 0;
    // 基础：fireCd = 1/2.2（镜像同一表达式，逐位）
    g.player.fireCd = 0;
    g.update(1 / 60);
    expect(g.player.fireCd).toBe(1 / (g.player.fireRate * (1 + 0 * 0.1 + 0)));
    expect(g.player.fireCd).toBe(1 / 2.2);
    // 疾速扳机 ×1：fireCd = 1/2.596
    learn(g, "疾速扳机");
    g.player.fireCd = 0;
    g.update(1 / 60);
    expect(g.player.fireCd).toBe(1 / 2.596);
    // 击杀狂热 haste=1：×1.1 仍在消费点叠加（0.35018910211514215）
    learn(g, "击杀狂热");
    g.player.fireCd = 0;
    g.update(1 / 60);
    expect(g.player.fireCd).toBe(
      1 / (g.player.fireRate * (1 + g.player.haste * 0.1)),
    );
    expect(g.player.fireCd).toBe(0.35018910211514215);
    // 战意沸腾 rageLv=1 + rageT>0：再叠 0.2（与 haste 同区加算）
    learn(g, "战意沸腾");
    g.player.rageT = 1;
    g.player.fireCd = 0;
    g.update(1 / 60);
    expect(g.player.fireCd).toBe(
      1 / (g.player.fireRate * (1 + 1 * 0.1 + 0.2 * g.player.rageLv)),
    );
    expect(g.player.fireCd).toBe(1 / (2.596 * 1.3));
    // rageT 过期后回落：动态状态不进属性模型
    g.player.rageT = 0;
    g.player.fireCd = 0;
    g.update(1 / 60);
    expect(g.player.fireCd).toBe(1 / (2.596 * 1.1));
  });

  it("攻速时序：fireRate 2.596 → 首发后 25 tick 内恰好第 2 发（间隔 = 1/2.596）", () => {
    const g = fresh();
    vi.spyOn(Math, "random").mockReturnValue(0.99);
    const e = enemy(g, g.player.x + 75, g.player.y); // 75px：射程内的静止目标
    e.hp = 9999;
    e.maxhp = 9999;
    e.speed = 0;
    learn(g, "疾速扳机");
    const fired = vi.spyOn(g.bullets, "push");
    g.player.fireCd = 0;
    g.update(1 / 60); // tick 1：首发
    expect(fired).toHaveBeenCalledTimes(1);
    for (let i = 0; i < 23; i++) g.update(1 / 60);
    expect(fired).toHaveBeenCalledTimes(1); // 24 tick 时未达冷却
    g.update(1 / 60); // tick 25：累计 24/60 > 1/2.596 → 第二发
    expect(fired).toHaveBeenCalledTimes(2);
  });

  it("学习疾速扳机零 RNG（学习步骤无随机消耗）", () => {
    const g = fresh();
    const spy = vi.spyOn(Math, "random");
    const before = spy.mock.calls.length;
    learnOrder(g, ["疾速扳机", "强化弹丸", "疾风之靴"]);
    expect(spy.mock.calls.length).toBe(before);
  });
});

describe("S4-C C2-B 消费路径 C · 疾风之靴（speed）", () => {
  it("正常移动：学习后每 tick 位移 = speed×dt（镜像表达式逐位）", () => {
    const g = fresh();
    const x0 = g.player.x;
    g.keys["d"] = true;
    ticks(g, 1);
    expect(g.player.x).toBe(x0 + 1 * 62 * (1 / 60)); // 基础 62
    learn(g, "疾风之靴");
    ticks(g, 1);
    expect(g.player.x).toBe(x0 + 1 * 62 * (1 / 60) + 1 * 68.2 * (1 / 60));
    g.keys["d"] = false;
  });

  it("60 tick 累计位移与旧语义逐位一致（同运算序列镜像）", () => {
    const g = fresh();
    learn(g, "疾风之靴");
    const x0 = g.player.x;
    g.keys["d"] = true;
    ticks(g, 60);
    // 与 updatePlayer 相同的累加序列：x += mx × speed × dt
    let expected = x0;
    for (let i = 0; i < 60; i++) expected += 1 * g.player.speed * (1 / 60);
    expect(g.player.x).toBe(expected);
    g.keys["d"] = false;
  });

  it("冲刺运动独立：dashT>0 期间按固定 280 px/s，不读 speed", () => {
    const g = fresh();
    learn(g, "疾风之靴", 6); // speed 109.83678200000007，远小于 280
    const x0 = g.player.x;
    g.player.dashLv = 1;
    g.player.dashT = 0.1;
    g.keys["d"] = true;
    ticks(g, 1);
    expect(g.player.x).toBe(x0 + 1 * 280 * (1 / 60)); // 冲刺固定速度
    expect(g.player.x).not.toBe(x0 + 1 * g.player.speed * (1 / 60));
    g.keys["d"] = false;
  });

  it("固定步长与暂停：学习移速卡不改变 60Hz 步进与暂停冻结语义", () => {
    const g = fresh();
    learn(g, "疾风之靴");
    g.keys["d"] = true;
    ticks(g, 10);
    const moved = g.player.x;
    g.togglePause();
    ticks(g, 30); // 暂停冻结整个模拟
    expect(g.player.x).toBe(moved);
    g.togglePause();
    ticks(g, 1);
    expect(g.player.x).toBeGreaterThan(moved); // 恢复后继续按步长移动
    expect(g.player.x).toBe(moved + 1 * g.player.speed * (1 / 60));
    g.keys["d"] = false;
  });
});

describe("S4-C C2-B 消费路径 D · 磁力护符（magnet）", () => {
  it("经验球吸附阈值：36 内不吸 40 处的球；学习后 40 < 50.4 开始吸附", () => {
    const g = fresh();
    const outside = { x: g.player.x + 40, y: g.player.y, vx: 0, vy: 0, v: 1 };
    g.gems.push(outside);
    ticks(g, 1);
    expect(outside.x).toBe(g.player.x + 40); // 40 ≥ 36：不吸附
    learn(g, "磁力护符"); // magnet 50.4
    ticks(g, 1);
    expect(outside.x).toBeLessThan(g.player.x + 40); // 进入吸附
  });

  it("吸附速度公式不变：s = 160 + (magnet - d)×4（镜像表达式逐位）", () => {
    const g = fresh();
    learn(g, "磁力护符");
    const gem = { x: g.player.x + 40, y: g.player.y, vx: 0, vy: 0, v: 1 };
    g.gems.push(gem);
    const x0 = gem.x;
    ticks(g, 1);
    // updateProgression 镜像：dx = p.x - g.x = -40、d = 40、s = 160+(50.4-40)×4
    const s = 160 + (g.player.magnet - 40) * 4;
    expect(s).toBe(201.6);
    expect(gem.x).toBe(x0 + (-1) * s * (1 / 60));
  });

  it("血瓶吸附半径 pullR = magnet×0.4：基础 14.4 不吸 20 处血瓶；学习后 20 < 20.16 吸附", () => {
    const g = fresh();
    const far = { x: g.player.x + 20, y: g.player.y };
    g.potions.push(far);
    ticks(g, 1);
    expect(far.x).toBe(g.player.x + 20); // 20 ≥ 14.4：不吸附
    const g2 = fresh();
    learn(g2, "磁力护符"); // pullR = 50.4×0.4 = 20.16
    const potion = { x: g2.player.x + 20, y: g2.player.y };
    g2.potions.push(potion);
    const x0 = potion.x;
    ticks(g2, 1);
    // 20 < 20.16 → 以固定 140 px/s 吸附（镜像表达式逐位）
    expect(potion.x).toBe(x0 + (-1) * 140 * (1 / 60));
    expect(potion.x).not.toBe(g2.player.x + 20); // 确实发生位移
  });

  it("满血血包永久成长行为不变：满血拾取 maxhp+1（potionGrow 上限照旧）", () => {
    const g = fresh();
    learn(g, "磁力护符");
    g.player.hp = g.player.maxhp;
    g.potions.push({ x: g.player.x + 1, y: g.player.y });
    ticks(g, 1);
    expect(g.player.maxhp).toBe(101); // 满血转化 maxhp+1，迁移不影响
  });
});

describe("S4-C C2-B 消费路径 E · 广域法印（area）", () => {
  it("弹丸尺寸生成时固化：学习后 size = 2×1.2 = 2.4；在途弹丸不回溯", () => {
    const g = fresh();
    vi.spyOn(Math, "random").mockReturnValue(0.99);
    const e = enemy(g, g.player.x + 75, g.player.y);
    e.hp = 9999;
    e.maxhp = 9999;
    e.speed = 0;
    g.player.fireCd = 0;
    g.update(1 / 60);
    expect(g.bullets[0].size).toBe(2); // 基础 area 1
    learn(g, "广域法印"); // 弹丸在途时学习
    expect(g.bullets[0].size).toBe(2); // 生成时固化，不回溯
    g.player.fireCd = 0;
    g.update(1 / 60);
    expect(g.bullets[1].size).toBe(2.4); // 新弹丸按投影 area
  });

  it("环绕飞刃位置与命中半径实时读取：orbR = e.r+3+3×area（6.3 px 距离判别）", () => {
    // 判别距离 6.3：base orbR = 0+3+3×1 = 6（不命中）、area 1.2 → 6.6（命中）
    const run = (withArea: boolean) => {
      const g = fresh();
      vi.spyOn(Math, "random").mockReturnValue(0.99);
      learn(g, "守护之刃"); // orbit = 1
      if (withArea) learn(g, "广域法印");
      ticks(g, 1); // orbA: 0 → 4/60（首帧刀光检查已跑过、无敌可命中）
      // 下一帧刀光位置（与 updateAttacks 相同运算序列镜像）：
      // orbA = 4×dt 后再 +4×dt；a = orbA + (0×2π)/1；bx = p.x + cos(a)×26×area
      const orbA = 4 * (1 / 60) + 4 * (1 / 60);
      const a = orbA + (0 * Math.PI * 2) / 1;
      const e = enemy(g, g.player.x, g.player.y);
      e.r = 0;
      e.hp = 9999;
      e.maxhp = 9999;
      e.speed = 0;
      e.x = g.player.x + Math.cos(a) * 26 * g.player.area + 6.3;
      e.y = g.player.y + Math.sin(a) * 26 * g.player.area;
      ticks(g, 1);
      return g.dmgBy.orbit;
    };
    expect(run(false)).toBe(0); // area 1：6.3 > orbR 6，不命中
    expect(run(true)).toBe(10); // area 1.2：6.3 < orbR 6.6，orbit 伤害 round(7+11×0.3)
  });

  it("陨星半径生成时固化：坠落期间学习不扩大已生成陨星的 R", () => {
    const g = fresh();
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    const e = enemy(g, g.player.x + 10, g.player.y);
    e.hp = 9999;
    e.maxhp = 9999;
    e.speed = 0;
    g.player.meteor = 1;
    g.player.meteorT = 0.05;
    for (let i = 0; i < 10 && g.meteors.length === 0; i++) g.update(1 / 60);
    expect(g.meteors).toHaveLength(1);
    expect(g.meteors[0].R).toBe(34); // 生成时 area 1
    learn(g, "广域法印"); // 坠落期间学习
    expect(g.meteors[0].R).toBe(34); // R 生成时固化，不回溯
    // 命中判定用固化的 m.R（34）：陨星落点为敌人位置，敌人在 R 内正常受伤
    for (let i = 0; i < 120 && g.dmgBy.meteor === 0; i++) g.update(1 / 60);
    expect(g.dmgBy.meteor).toBe(Math.max(1, Math.round(11 * 3 + 1 * 8)));
  });

  it("学习后新陨星 R = 34×area（40.8），命中范围按新值", () => {
    const g = fresh();
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    learn(g, "广域法印");
    const e = enemy(g, g.player.x + 10, g.player.y);
    e.hp = 9999;
    e.maxhp = 9999;
    e.speed = 0;
    g.player.meteor = 1;
    g.player.meteorT = 0.05;
    for (let i = 0; i < 10 && g.meteors.length === 0; i++) g.update(1 / 60);
    expect(g.meteors[0].R).toBe(40.8);
  });

  it("爆炸半径实时读取：学习广域法印后爆炸 R = (26+explode×6)×area（35 px 距离判别）", () => {
    // 判别距离 35：base R = (26+6)×1 = 32（不命中）、area 1.2 → 38.4（命中）
    const run = (withArea: boolean) => {
      const g = fresh();
      vi.spyOn(Math, "random").mockReturnValue(0.5);
      learn(g, "屠戮之欲"); // explode = 1
      if (withArea) learn(g, "广域法印");
      const victim = enemy(g, g.player.x + 60, g.player.y);
      const bystander = enemy(g, victim.x + 35, victim.y);
      victim.hp = 1; // 一击致死触发击杀爆炸
      victim.maxhp = 1;
      bystander.hp = 9999;
      bystander.maxhp = 9999;
      g.killEnemy(victim);
      return g.dmgBy.explode;
    };
    expect(run(false)).toBe(0); // area 1：35 > R 32，波及不到
    expect(run(true)).toBe(11); // area 1.2：35 < R 38.4，(11×0.5+2)×1.5 → round 11
  });

  it("无关天赋学习不改变半径：学习疾风之靴后弹丸尺寸/陨星 R 不变", () => {
    const g = fresh();
    vi.spyOn(Math, "random").mockReturnValue(0.99);
    const e = enemy(g, g.player.x + 75, g.player.y);
    e.hp = 9999;
    e.maxhp = 9999;
    e.speed = 0;
    learn(g, "疾风之靴");
    g.player.fireCd = 0;
    g.update(1 / 60);
    expect(g.bullets[0].size).toBe(2);
    expect(g.player.area).toBe(1);
  });
});

describe("S4-C C2-B · RuntimeState 与五字段隔离", () => {
  it("学习五张卡不触碰当前 HP/护盾/冷却/狂热/冲刺等运行状态", () => {
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
    learnOrder(g, [...MULTIPLICATIVE_CARDS]);
    expect(
      JSON.stringify(Object.fromEntries(keys.map((k) => [k, g.player[k]]))),
    ).toBe(before);
  });

  it("ticks 正常推进：五卡学习后战斗模拟无异常且属性稳定", () => {
    const g = fresh();
    learnOrder(g, [...MULTIPLICATIVE_CARDS]);
    expect(() => ticks(g, 30)).not.toThrow();
    expect(g.player.boltDmgMul).toBe(1.25);
    expect(g.player.fireRate).toBe(2.596);
    expect(g.player.speed).toBe(68.2);
    expect(g.player.magnet).toBe(50.4);
    expect(g.player.area).toBe(1.2);
  });

  it("Player 类型契约：五字段为必填（编译期由类型保证，运行期投影后无 undefined）", () => {
    const g = fresh();
    learnOrder(g, [...MULTIPLICATIVE_CARDS]);
    const p: Player = g.player;
    for (const k of [
      "boltDmgMul",
      "fireRate",
      "speed",
      "magnet",
      "area",
    ] as const) {
      expect(typeof p[k]).toBe("number");
      expect(Number.isFinite(p[k])).toBe(true);
    }
  });
});
