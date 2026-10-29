import { afterEach, describe, expect, it, vi } from "vitest";
import {
  LEGACY_UPGRADES,
  SHOOTER_TALENTS,
} from "../src/game/data/talents";
import { fresh, learn, talent, ticks, seeded } from "./helpers";

/**
 * S2 射手纵切：池结构 / 抽取规则 / 发放方式 / 职业基础形态。
 *
 * 这个文件承担 S2 的三个检查点（docs/damage-rework-implementation-plan.md §4）：
 * ① 未学 L1 时 L2/L3 从未出现；
 * ② 一局天赋 8 次、单局可见 14 张；
 * ③ 旧卡 0 次出现、完成链后退出池。
 *
 * 以及「射手相对 v8 基线的差异」——这些差异在 parity 里被中和掉了
 *（见 tests/parity.test.ts 的 takeShooterBase），必须在这里显式钉住。
 */

function shoot(g: ReturnType<typeof fresh>) {
  g.player.fireCd = 0;
  g.update(1 / 60);
  return g.bullets;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("S2 射手池结构", () => {
  it("18 张，6 条槽位轴，层级 1/2/3 齐全", () => {
    expect(SHOOTER_TALENTS).toHaveLength(18);
    const slots = new Set(SHOOTER_TALENTS.map((t) => t.slot));
    expect(slots.size).toBe(6);
    for (const t of SHOOTER_TALENTS) {
      expect(t.prof).toBe("shooter");
      expect(t.max).toBe(1); // 一次性获得，不可重复升级
      expect(t.layer).toBeGreaterThanOrEqual(1);
      expect(t.layer).toBeLessThanOrEqual(3);
    }
    const layers = new Set(SHOOTER_TALENTS.map((t) => t.layer));
    expect([...layers].sort()).toEqual([1, 2, 3]);
  });

  it("卡名与旧表不冲突（upCounts 以名字为键）", () => {
    const legacy = new Set(LEGACY_UPGRADES.map((u) => u.n));
    for (const t of SHOOTER_TALENTS) expect(legacy.has(t.n)).toBe(false);
    expect(new Set(SHOOTER_TALENTS.map((t) => t.n)).size).toBe(18);
  });
});

describe("S2 检查点①：链的前置", () => {
  it("未学 L1 时，所有 L2/L3 都不进池（穷举）", () => {
    const g = fresh();
    const later = SHOOTER_TALENTS.filter((t) => (t.layer ?? 1) > 1);
    expect(later.length).toBeGreaterThan(0);
    for (const t of later) expect(g.canOffer(talent(t.n))).toBe(false);
  });

  it("学完 L1 后 L2 进池，L3 仍不进池", () => {
    const g = fresh();
    learn(g, "破甲箭");
    expect(g.canOffer(talent("弹道贯穿"))).toBe(true);
    // L3 需要 L2
    expect(g.canOffer(talent("贯穿轨迹"))).toBe(false);
    learn(g, "弹道贯穿");
    expect(g.canOffer(talent("贯穿轨迹"))).toBe(true);
  });
});

describe("S2 检查点②：一局 8 次天赋、单局可见 14 张", () => {
  it("节点波（每 4 波 + 终局）首只精英发 1 次天赋，同波第二只不发", () => {
    const g = fresh();
    let total = 0;
    for (let w = 1; w <= 30; w++) {
      g.waveN = w;
      g.waveTalentGiven = false;
      const before = g.pendingLevels;
      g.spawnEnemy("brute", true);
      g.killEnemy(g.enemies.at(-1)!);
      const gained = g.pendingLevels - before;
      const isNode = w % 4 === 0 || w === 30;
      expect(gained, `wave ${w}`).toBe(isNode ? 1 : 0);
      // 同波再杀一只精英：不再发放
      if (isNode) {
        const mid = g.pendingLevels;
        g.spawnEnemy("brute", true);
        g.killEnemy(g.enemies.at(-1)!);
        expect(g.pendingLevels).toBe(mid);
      }
      total += gained;
      g.boxes = []; // 清掉落，避免跨波累积干扰
      g.gems = [];
      g.potions = [];
    }
    expect(total).toBe(8);
  });

  it("4 组变体各损失 1 张 → 单局可见 18 − 4 = 14", () => {
    const groups = new Map<string, string[]>();
    for (const t of SHOOTER_TALENTS)
      if (t.variant)
        groups.set(t.variant, [...(groups.get(t.variant) ?? []), t.n]);
    expect(groups.size).toBe(4);
    for (const names of groups.values()) expect(names).toHaveLength(2);
    expect(SHOOTER_TALENTS.length - groups.size).toBe(14);
  });

  it("变体组单局只能取一张（双向）", () => {
    for (const variant of ["shooter-distance", "shooter-dodge", "shooter-escape", "shooter-dash"]) {
      const names = SHOOTER_TALENTS.filter((t) => t.variant === variant).map(
        (t) => t.n,
      );
      expect(names).toHaveLength(2);
      for (const first of names) {
        const second = names.find((n) => n !== first)!;
        const g = fresh();
        expect(g.canOffer(talent(second))).toBe(true);
        learn(g, first);
        expect(g.canOffer(talent(second)), `${first} → ${second}`).toBe(false);
      }
    }
  });

  it("互斥对（贯穿轨迹 ↔ 三重射击）双向成立", () => {
    const g1 = fresh();
    learn(g1, "破甲箭");
    learn(g1, "弹道贯穿");
    expect(g1.canOffer(talent("贯穿轨迹"))).toBe(true);
    learn(g1, "三重射击");
    expect(g1.canOffer(talent("贯穿轨迹"))).toBe(false);

    const g2 = fresh();
    learn(g2, "破甲箭");
    learn(g2, "弹道贯穿");
    learn(g2, "贯穿轨迹");
    expect(g2.canOffer(talent("三重射击"))).toBe(false);
  });
});

describe("S2 检查点③：旧表退役", () => {
  it("37 张退役卡在 200 次抽取中 0 次出现", () => {
    const g = fresh();
    vi.spyOn(Math, "random").mockImplementation(seeded(7));
    const seen = new Set<string>();
    for (let i = 0; i < 200; i++)
      for (const u of g.rollPicks()) seen.add(u.n);
    expect(seen.size).toBeGreaterThan(0);
    const retired = new Set(
      LEGACY_UPGRADES.filter((u) => u.retired).map((u) => u.n),
    );
    expect(retired.size).toBe(37); // 38 张旧表里「不屈」是原版 hidden，不带 retired
    expect([...seen].filter((n) => retired.has(n))).toEqual([]);
  });

  it("退役卡仍可被直接学习（hidden/retired 只约束投放）", () => {
    const g = fresh();
    expect(g.learnTalent(talent("强化弹丸"))).toBe(true);
    expect(g.player.upCounts["强化弹丸"]).toBe(1);
  });
});

describe("S2 射手职业基础形态", () => {
  it("基础穿透 1、衰减 0.5（v40 是穿透 0、衰减 0.85）", () => {
    const g = fresh();
    expect(g.player.pierce).toBe(0);
    expect(g.player.pierceFalloff).toBe(0.5);
    const e = (g.spawnEnemy("slime"), g.enemies.at(-1)!);
    e.x = g.player.x + 40;
    e.y = g.player.y;
    const [b] = shoot(g);
    expect(b.pierce).toBe(1); // 职业被动
    expect(b.falloff).toBe(0.5);
  });

  it("破甲箭：穿透 2、衰减 0.8；弹道贯穿：穿透 3、衰减 1.0", () => {
    const g = fresh();
    learn(g, "破甲箭");
    expect(g.player.pierce).toBe(1);
    expect(g.player.pierceFalloff).toBeCloseTo(0.8, 10);
    learn(g, "弹道贯穿");
    expect(g.player.pierce).toBe(2);
    expect(g.player.pierceFalloff).toBeCloseTo(1, 10);
  });

  it("长弓 +15% / 短弓 −10% 射程并 +20% 攻速", () => {
    const a = fresh();
    learn(a, "长弓");
    expect(a.player.attackRange).toBeCloseTo(149.5, 10);

    const b = fresh();
    learn(b, "短弓");
    expect(b.player.attackRange).toBeCloseTo(117, 10);
    expect(b.player.fireRate).toBeCloseTo(2.2 * 1.2, 10);
  });

  it("三重射击：一次 3 发、每发 50% 伤害", () => {
    const base = fresh();
    base.spawnEnemy("slime");
    base.enemies.at(-1)!.x = base.player.x + 40;
    base.enemies.at(-1)!.y = base.player.y;
    const [one] = shoot(base);

    const g = fresh();
    learn(g, "破甲箭");
    learn(g, "弹道贯穿");
    learn(g, "三重射击");
    g.spawnEnemy("slime");
    g.enemies.at(-1)!.x = g.player.x + 40;
    g.enemies.at(-1)!.y = g.player.y;
    const bullets = shoot(g);
    expect(bullets).toHaveLength(3);
    // 穿透提升了、但单发伤害被 ×0.5（boltDmgMul 走投影，非 f 直写）
    expect(g.player.multishot).toBe(3);
    expect(g.player.boltDmgMul).toBeCloseTo(0.5, 10);
    expect(bullets[0].dmg).toBeLessThan(one.dmg);
  });

  it("疾行：冲刺距离 ×1.25", () => {
    const g = fresh();
    expect(g.player.dashDistMul).toBe(1);
    learn(g, "疾行");
    expect(g.player.dashDistMul).toBeCloseTo(1.25, 10);
  });
});

describe("S2 机制：距离即收益 / 标记 / 宝箱折算", () => {
  it("距离即收益：按射程比例分档（50% / 75% / 92%）", () => {
    const near = fresh();
    learn(near, "距离即收益");
    near.spawnEnemy("slime");
    near.enemies.at(-1)!.x = near.player.x + 30; // 23% 射程 → 无加成
    near.enemies.at(-1)!.y = near.player.y;
    const [bNear] = shoot(near);

    const far = fresh();
    learn(far, "距离即收益");
    far.spawnEnemy("slime");
    far.enemies.at(-1)!.x = far.player.x + 125; // 96% 射程 → +25% 且 +10% 暴击
    far.enemies.at(-1)!.y = far.player.y;
    const [bFar] = shoot(far);

    expect(bFar.dmg).toBeCloseTo(bNear.dmg * 1.25, 6);
    expect(bFar.critBonus).toBeCloseTo(0.1, 10);
  });

  it("猎杀标记：同一目标 3 次命中后转为一层，受伤 +15%", () => {
    const g = fresh();
    learn(g, "猎杀标记");
    const e = (g.spawnEnemy("slime"), g.enemies.at(-1)!);
    e.hp = e.maxhp = 100000;
    e.x = g.player.x + 40;
    e.y = g.player.y;
    vi.spyOn(Math, "random").mockReturnValue(0.99); // 不暴击
    for (let i = 0; i < 3; i++) {
      g.player.fireCd = 0;
      g.update(1 / 60);
      ticks(g, 12);
    }
    expect(e.markStacks).toBe(1);
    expect(e.markT).toBeGreaterThan(0);
  });

  it("宝箱在波末折算为属性选择次数", () => {
    const g = fresh();
    g.boxPicks = 2;
    const before = g.attrPicks;
    g.player.xp = 0;
    g.wavePhase = "collect";
    g.spawnedThisWave = g.quota;
    ticks(g, 2);
    expect(g.boxPicks).toBe(0);
    expect(g.attrPicks).toBeGreaterThan(before);
  });
});
