import { afterEach, describe, expect, it, vi } from "vitest";
import { ETYPES } from "../src/game/data/enemies";
import {
  getEnemyCombatStats,
  getPlayerCombatStats,
} from "../src/game/core/CombatStats";
import type { EnemyConfig } from "../src/game/core/types";
import { enemy, fresh } from "./helpers";

afterEach(() => vi.restoreAllMocks());

/**
 * Combat Foundation S3-A 验收：docs/pixel-rogue-S3-implementation-brief.md §3-A/§5。
 * 只验证「可配置接线」——所有数值通过实体可选字段程序化赋予，默认中性、
 * 无正式平衡变更；既有 S2 行为零变化由其余测试与 parity 保证。
 */
describe("combat foundation s3-a attribute wiring", () => {
  it("默认中性：实体不带新字段时快照全为 0/空，行为与 S2 一致", () => {
    const g = fresh();
    const ps = getPlayerCombatStats(g.player);
    expect(ps.defense).toBe(0);
    expect(ps.resistances).toEqual({});
    expect(ps.globalDamageBonus).toBe(0);
    expect(ps.typeDamageBonus).toEqual({});
    expect(ps.formDamageBonus).toEqual({});
    expect(ps.skillDamageBonus).toBeUndefined();
    const e = enemy(g);
    expect(e.defense).toBeUndefined(); // 可选字段未写入，序列化形状不变
    const es = getEnemyCombatStats(e);
    expect(es.defense).toBe(0);
    expect(es.resistances).toEqual({});
    expect(es.tough).toBe(0);
  });

  it("敌方 DEF=50：100 点非暴击物理经真实 hurtEnemy 结算为 50", () => {
    const g = fresh();
    const e = enemy(g);
    e.hp = 999;
    e.maxhp = 999;
    e.defense = 50;
    vi.spyOn(Math, "random").mockReturnValue(0.99); // 不暴击
    g.hurtEnemy(e, 100, 0, 0, {
      src: "bullet",
      type: "physical",
      form: "ranged",
    });
    expect(e.hp).toBe(999 - 50);
    expect(g.dmgBy.bullet).toBe(50);
  });

  it("火焰抗性 20%：火 100→80；物理/雷电不受 fire 抗性影响", () => {
    const g = fresh();
    vi.spyOn(Math, "random").mockReturnValue(0.99);
    const mk = () => {
      const e = enemy(g);
      e.hp = 999;
      e.maxhp = 999;
      e.resistances = { fire: 0.2 };
      return e;
    };
    const fire = mk();
    g.hurtEnemy(fire, 100, 0, 0, {
      src: "meteor",
      type: "fire",
      form: "other",
    });
    expect(fire.hp).toBe(999 - 80);
    const physical = mk();
    g.hurtEnemy(physical, 100, 0, 0, {
      src: "bullet",
      type: "physical",
      form: "ranged",
    });
    expect(physical.hp).toBe(999 - 100);
    const lightning = mk();
    g.hurtEnemy(lightning, 100, 0, 0, {
      src: "chain",
      noCrit: true,
      noChain: true,
      type: "lightning",
      form: "other",
    });
    expect(lightning.hp).toBe(999 - 100);
  });

  it("敌方 DEF=50 且 tough=0.2：100 物理与两者乘算 → 40", () => {
    const g = fresh();
    const e = enemy(g);
    e.hp = 999;
    e.maxhp = 999;
    e.defense = 50;
    e.tough = 0.2;
    vi.spyOn(Math, "random").mockReturnValue(0.99);
    g.hurtEnemy(e, 100, 0, 0, {
      src: "bullet",
      type: "physical",
      form: "ranged",
    });
    expect(e.hp).toBe(999 - 40); // 100 × 50/100 × (1-0.2)
  });

  it("真实伤害无视 DEF/RES/tough，仍走普通命中管线", () => {
    const g = fresh();
    const e = enemy(g);
    e.hp = 999;
    e.maxhp = 999;
    e.defense = 50;
    e.tough = 0.2;
    e.resistances = { fire: 0.2, true: 0.9 };
    vi.spyOn(Math, "random").mockReturnValue(0.99);
    g.hurtEnemy(e, 100, 0, 0, { src: "bullet", type: "true", form: "ranged" });
    expect(e.hp).toBe(999 - 100);
  });

  it("增伤维度经真实调用生效：全局+20%、雷电+30%、近战+40% → 218", () => {
    const g = fresh();
    const e = enemy(g);
    e.hp = 9999;
    e.maxhp = 9999;
    g.player.globalDamageBonus = 0.2;
    g.player.typeDamageBonus = { lightning: 0.3 };
    g.player.formDamageBonus = { melee: 0.4 };
    vi.spyOn(Math, "random").mockReturnValue(0.99);
    g.hurtEnemy(e, 100, 0, 0, {
      src: "melee",
      type: "lightning",
      form: "melee",
    });
    expect(e.hp).toBe(9999 - 218); // 100×1.2×1.3×1.4=218.4 → round 218
    // fire/ranged 组合按各自乘区命中
    const g2 = fresh();
    const e2 = enemy(g2);
    e2.hp = 999;
    e2.maxhp = 999;
    g2.player.typeDamageBonus = { fire: 0.25 };
    g2.player.formDamageBonus = { ranged: 0.2 };
    vi.spyOn(Math, "random").mockReturnValue(0.99);
    g2.hurtEnemy(e2, 100, 0, 0, {
      src: "bullet",
      type: "fire",
      form: "ranged",
    });
    expect(e2.hp).toBe(999 - 150); // 100×1.25×1.2
  });

  it("玩家护甲走 preserve-float：100×50/100=50 浮点扣血；tough 仍乘算", () => {
    const g = fresh();
    const e = enemy(g, g.player.x + 5, g.player.y);
    e.dmg = 100;
    g.player.defense = 50;
    g.player.hurtCd = 0;
    vi.spyOn(Math, "random").mockReturnValue(0.99);
    g.damagePlayer(e.dmg, {
      melee: true,
      src: e,
      type: "physical",
      form: "melee",
    });
    expect(g.player.hp).toBeCloseTo(50, 10);
    g.player.defense = 0;
    g.player.tough = 0.3;
    g.player.hurtCd = 0;
    g.player.hp = 100;
    e.dmg = 8.4;
    g.damagePlayer(e.dmg, {
      melee: true,
      src: e,
      type: "physical",
      form: "melee",
    });
    expect(g.player.hp).toBeCloseTo(100 - 8.4 * 0.7, 10);
  });

  it("弹丸按发射时快照结算：发射后修改/移除敌人不改变原弹丸属性", () => {
    const g = fresh();
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    g.spawnEnemy("shooter");
    const s = g.enemies[0]!;
    s.x = g.player.x - 100;
    s.y = g.player.y;
    s.shootCd = 0;
    s.speed = 0;
    s.globalDamageBonus = 0.5; // S3-B 才会有正式来源，此处程序化赋值验证接线
    g.update(1 / 60);
    expect(g.ebullets).toHaveLength(1);
    expect(g.ebullets[0].stats!.globalDamageBonus).toBe(0.5);
    // 发射后：改掉敌人增伤并标记死亡/移除——弹丸仍按发射时快照结算
    s.globalDamageBonus = 0;
    s.dead = true;
    g.enemies.length = 0;
    const b = g.ebullets[0];
    b.x = g.player.x;
    b.y = g.player.y;
    b.vx = 0;
    b.vy = 0;
    g.player.hurtCd = 0;
    g.update(1 / 60);
    // 弹丸伤害快照 = 发射时 e.dmg，× 发射时增伤 (1+0.5)
    expect(g.player.hp).toBeCloseTo(100 - s.dmg * 1.5, 10);
  });

  it("EnemyConfig → spawnEnemy → Enemy 传递链：存在时拷贝、缺失不产生键", () => {
    const g = fresh();
    const cfg = ETYPES.slime as EnemyConfig;
    try {
      cfg.defense = 40;
      cfg.resistances = { fire: 0.1 };
      g.spawnEnemy("slime");
      const e = g.enemies.at(-1)!;
      expect(e.defense).toBe(40);
      expect(e.resistances).toEqual({ fire: 0.1 });
    } finally {
      delete cfg.defense;
      delete cfg.resistances;
    }
    // 恢复后生成的敌人不带这些键（形状与 parity 对照一致）
    const g2 = fresh();
    g2.spawnEnemy("slime");
    const plain = g2.enemies.at(-1)!;
    expect("defense" in plain).toBe(false);
    expect("resistances" in plain).toBe(false);
  });

  it("DoT 吃火焰抗性且保留浮点：DPS 40、火抗 25% → 60 帧共 30，无命中副作用", () => {
    const g = fresh();
    const e = enemy(g);
    e.hp = 999;
    e.maxhp = 999;
    e.burnT = 2;
    e.burnDps = 40;
    e.resistances = { fire: 0.25 };
    const textsBefore = g.texts.length;
    for (let i = 0; i < 60; i++) g.applyBurnDot(e, 1 / 60);
    expect(e.hp).toBeCloseTo(999 - 40 * 0.75, 9);
    expect(g.dmgBy.burn).toBeCloseTo(30, 9);
    expect(g.texts.length).toBe(textsBefore);
  });

  it("玩家快照的暴击倍率取 DamageMath 有效值（含 #41 满层觉醒）", () => {
    const g = fresh();
    expect(getPlayerCombatStats(g.player).critMultiplier).toBe(2);
    g.player.upCounts["致命一击"] = 8;
    expect(getPlayerCombatStats(g.player).critMultiplier).toBeCloseTo(2.4, 10);
  });
});
