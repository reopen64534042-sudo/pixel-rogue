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

  it("弹丸按发射时快照结算：发射后修改（含原地改映射）/移除敌人不改变原弹丸属性", () => {
    const g = fresh();
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    g.spawnEnemy("shooter");
    const s = g.enemies[0]!;
    s.x = g.player.x - 100;
    s.y = g.player.y;
    s.shootCd = 0;
    s.speed = 0;
    // S3-B 才会有正式来源，此处程序化赋值验证接线
    s.globalDamageBonus = 0.5;
    s.typeDamageBonus = { physical: 0.2 };
    g.update(1 / 60);
    expect(g.ebullets).toHaveLength(1);
    expect(g.ebullets[0].stats!.globalDamageBonus).toBe(0.5);
    expect(g.ebullets[0].stats!.typeDamageBonus).toEqual({ physical: 0.2 });
    // 发射后：顶层改值 + 原地修改嵌套映射（PR #3 评审 P2 场景）+ 标记死亡/移除
    // ——弹丸仍按发射时快照结算，嵌套映射不得与敌人共享引用
    s.globalDamageBonus = 0;
    s.typeDamageBonus.physical = 0.8;
    expect(g.ebullets[0].stats!.typeDamageBonus).toEqual({ physical: 0.2 });
    s.dead = true;
    g.enemies.length = 0;
    const b = g.ebullets[0];
    b.x = g.player.x;
    b.y = g.player.y;
    b.vx = 0;
    b.vy = 0;
    g.player.hurtCd = 0;
    g.update(1 / 60);
    // 弹丸伤害快照 = 发射时 e.dmg × (1+0.5)全局 × (1+0.2)物理；原地改映射不渗入
    expect(g.player.hp).toBeCloseTo(100 - s.dmg * 1.5 * 1.2, 10);
  });

  it("适配器快照与实体解除嵌套引用共享（PR #3 评审 P2 直测）", () => {
    const g = fresh();
    g.player.typeDamageBonus = { physical: 0.2 };
    g.player.resistances = { fire: 0.3 };
    const ps = getPlayerCombatStats(g.player);
    g.player.typeDamageBonus.physical = 0.8; // 原地修改实体映射
    g.player.resistances.fire = 0.9;
    expect(ps.typeDamageBonus).toEqual({ physical: 0.2 });
    expect(ps.resistances).toEqual({ fire: 0.3 });
    const e = enemy(g);
    e.formDamageBonus = { melee: 0.4 };
    const es = getEnemyCombatStats(e);
    e.formDamageBonus.melee = 0.6;
    expect(es.formDamageBonus).toEqual({ melee: 0.4 });
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

  it("PR #4 评审 P1：焦土燃烧经管线吃火抗与火系增伤，中性敌人数值与旧直算一致", () => {
    // 中性敌人：10 DPS × 1s = 10，与旧 e.hp -= dps*dt 逐位一致
    const g = fresh();
    const neutral = enemy(g);
    neutral.hp = 999;
    neutral.maxhp = 999;
    g.applyBurnGroundDot(neutral, 10, 1);
    expect(neutral.hp).toBeCloseTo(999 - 10, 10);
    expect(g.dmgBy.burn).toBeCloseTo(10, 10);
    // bomber 火抗 40% → 10 × 0.6 = 6
    const g2 = fresh();
    g2.spawnEnemy("bomber");
    const bomber = g2.enemies[0]!;
    bomber.hp = 999;
    bomber.maxhp = 999;
    g2.applyBurnGroundDot(bomber, 10, 1);
    expect(bomber.hp).toBeCloseTo(999 - 6, 10);
    // 火系增伤 +30%（元素亲和满级程序化等效）→ 13；与火抗组合 → 7.8
    const g3 = fresh();
    g3.player.typeDamageBonus = { fire: 0.3 };
    const e3 = enemy(g3);
    e3.hp = 999;
    e3.maxhp = 999;
    g3.applyBurnGroundDot(e3, 10, 1);
    expect(e3.hp).toBeCloseTo(999 - 13, 10);
    g3.spawnEnemy("bomber");
    const b3 = g3.enemies.at(-1)!;
    b3.hp = 999;
    b3.maxhp = 999;
    g3.applyBurnGroundDot(b3, 10, 1);
    expect(b3.hp).toBeCloseTo(999 - 7.8, 10);
    // 无普通命中副作用：不产生飘字/暴击/吸血
    expect(g3.texts.length).toBe(0);
    // 集成：真实焦土地带逐帧结算走同一入口（DPS = damage × 20%）
    const g4 = fresh();
    vi.spyOn(Math, "random").mockReturnValue(0.99);
    const e4 = enemy(g4);
    e4.hp = 999;
    e4.maxhp = 999;
    e4.speed = 0;
    g4.player.burnGround = 1;
    g4.burnZones.push({ x: e4.x, y: e4.y, R: 30, t: 5 });
    g4.update(1 / 60);
    expect(g4.dmgBy.burn).toBeCloseTo((g4.player.damage * 0.2) / 60, 10);
  });

  it("PR #4 评审 P2：暴击率随发射时快照固化，命中前改动不回溯", () => {
    // 发射时必暴 → 命中前把暴击率改为 0，在途弹丸仍按快照暴击（11 × 2 = 22）
    const g = fresh();
    const e = enemy(g, g.player.x + 30, g.player.y);
    e.hp = 9999;
    e.maxhp = 9999;
    e.speed = 0;
    g.player.crit = 1;
    vi.spyOn(Math, "random").mockReturnValue(0.99);
    g.player.fireCd = 0;
    g.update(1 / 60);
    g.player.crit = 0;
    for (let i = 0; i < 40 && g.dmgBy.bullet === 0; i++) g.update(1 / 60);
    expect(g.dmgBy.bullet).toBe(22);
    // 反向：发射时 0 暴击率，命中前改成 1 也不暴击
    const g2 = fresh();
    const e2 = enemy(g2, g2.player.x + 30, g2.player.y);
    e2.hp = 9999;
    e2.maxhp = 9999;
    e2.speed = 0;
    g2.player.crit = 0; // 基础暴击率是 0.05，须显式清零
    vi.spyOn(Math, "random").mockReturnValue(0.01);
    g2.player.fireCd = 0;
    g2.update(1 / 60);
    g2.player.crit = 1;
    for (let i = 0; i < 40 && g2.dmgBy.bullet === 0; i++) g2.update(1 / 60);
    expect(g2.dmgBy.bullet).toBe(11);
  });
});
