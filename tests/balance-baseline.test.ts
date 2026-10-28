import fs from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { getPlayerCombatStats } from "../src/game/core/CombatStats";
import { resolveEnemySpawnStats } from "../src/game/core/EnemyStatSources";
import { UPGRADES } from "../src/game/data/talents";
import { ETYPES } from "../src/game/data/enemies";
import { COMBAT_BALANCE } from "../src/game/data/combatBalance";
import type { Player } from "../src/game/core/types";
import { fresh, talent } from "./helpers";

/**
 * 伤害重做 · 基线快照（v40，41 张卡 + 怪物压力）
 *
 * 目的：换掉整张天赋表之前先留一把尺子。之后任何一批改动都能回答
 * 「变强还是变弱」，而不是靠体感。
 *
 * 结构与口径：
 * - `playerBase`：未学任何天赋时的**全部静态数值字段**（绝对值）+ 两个派生指标。
 * - `talents[name]`：学 1 级 / 满级后**相对 base 的增量**（只记变了的字段）+ 指标比值。
 * - `enemyPressure`：标准怪（slime）在采样波次的单怪数值与配额压力。
 *
 * 为什么用「增量」而不是「绝对值」：41 张 × 2 档 × 全字段的绝对值会把
 * 差异埋进几百个相同数字里；增量表能直接看出「这张卡改了什么、改了多少」。
 *
 * 派生指标是**参考指标，不是权威公式**（假设写在 INDICES_NOTES 里）。
 * 权威伤害公式在 `DamageSystem.calculateDamage`，本文件不复制它的逻辑，
 * 只用一条可比的粗指标做横向对照。
 *
 * 更新方式（改基线必须留痕：提交信息写明「基线更新依据」）：
 *   UPDATE_BALANCE_BASELINE=1 npx vitest run tests/balance-baseline.test.ts
 */

// P3 先例：恢复全局 Mock，防止 Math.random spy 跨测试泄漏
afterEach(() => {
  vi.restoreAllMocks();
});

const UPDATE = process.env.UPDATE_BALANCE_BASELINE === "1";
const FIXTURE = path.join(import.meta.dirname, "fixtures", "balance-baseline.json");

/**
 * 不计入静态快照的字段（运行态 / 位置 / 计时器 / 进度）。
 *
 * 原则：**只排除「会随帧变化」的东西**。凡是「学了卡就会变、且不随时间衰减」
 * 的一律保留——包括 hasteLv / rageLv / barrierLv 这类等级型字段，它们是
 * 天赋的真实产出，必须进快照。
 */
const RUNTIME_FIELDS = new Set([
  "x",
  "y",
  "dx",
  "dy",
  "hp",
  "fireCd",
  "shield",
  "shieldCd",
  "dashT",
  "dashRe",
  "dashCharges",
  "haste",
  "hasteT",
  "rageT",
  "tempShield",
  "ndUsed",
  "orbA",
  "hurtCd",
  "meteorT",
  "lvl",
  "xp",
  "xpNext",
  "time",
]);

/** 会被展开成 `键.子键` 的对象型属性（不展开会整张卡看起来「无变化」）。 */
const MAP_FIELDS = new Set([
  "typeDamageBonus",
  "formDamageBonus",
  "resistances",
  "skillDamageBonus",
]);

const WAVES = [1, 5, 10, 15, 20, 25, 30];

/** 采样波次的玩家等级（用于 lvlPow；按现有经验曲线估，仅供怪物侧对照）。 */
const SAMPLE_LEVELS: Record<number, number> = {
  1: 1,
  5: 8,
  10: 16,
  15: 25,
  20: 32,
  25: 36,
  30: 39,
};

const INDICES_NOTES = {
  coverage: "(1 + pierce) × multishot —— 单发平均能覆盖几个目标（无视 area/弹射，粗口径）",
  critExp: "1 + min(1, critChance) × (critMultiplier - 1) —— 暴击期望倍率",
  dpsIndex: "attack × boltDmgMul × fireRate × critExp × (1 + globalDamageBonus) × coverage",
  ehpIndex:
    "maxhp ÷ [(1 - 护甲减伤) × (1 - 韧性) × (1 - min(0.6, dodge))]，护甲减伤 = 1 - K/(K+DEF)，K 取 COMBAT_BALANCE.armorK，韧性夹在 0..0.6",
  caution:
    "参考指标：不含属性强化（当前系统尚无属性成长）、不含类型/形态条件增伤（按伤害类型与攻击方式生效，见 indices.typeDamageBonus）、不含元素/DoT/召唤/护盾/环绕飞刃等衍生伤害。只用于同口径横向对比。",
  coverageCaution:
    "coverage 是乐观口径：多弹道实际会分散、穿透受队形影响，所以覆盖率翻倍不等于 DPS 翻倍。",
};

const round = (v: number, digits = 4) => {
  const f = 10 ** digits;
  const r = Math.round(v * f) / f;
  return Object.is(r, -0) ? 0 : r;
};

/** 未学任何天赋时的静态数值（绝对值）；对象型属性展开为 `键.子键`。 */
function baseFields(p: Player): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(p)) {
    if (RUNTIME_FIELDS.has(k)) continue;
    if (typeof v === "number") {
      out[k] = round(v);
      continue;
    }
    // 映射型属性只在图上展开一层；未出现的键不物化（与 DamageSystem 的自有键语义一致）
    if (MAP_FIELDS.has(k) && v && typeof v === "object") {
      for (const [sub, sv] of Object.entries(v as Record<string, unknown>)) {
        if (typeof sv === "number") out[`${k}.${sub}`] = round(sv);
      }
    }
  }
  return out;
}

/** 相对 base 的增量（只保留变了的字段，含新出现的映射子键）。 */
function deltaFields(
  base: Record<string, number>,
  p: Player,
): Record<string, number> {
  const now = baseFields(p);
  const out: Record<string, number> = {};
  for (const k of Object.keys(now)) {
    if (base[k] === undefined) {
      out[k] = now[k];
      continue;
    }
    if (now[k] !== base[k]) out[k] = round(now[k] - base[k]);
  }
  return out;
}

function indices(p: Player, fields: Record<string, number>) {
  const s = getPlayerCombatStats(p);
  const pierce = fields.pierce ?? 0;
  const multishot = fields.multishot ?? 1;
  const fireRate = fields.fireRate ?? 0;
  const boltDmgMul = fields.boltDmgMul ?? 1;
  const maxhp = fields.maxhp ?? 0;
  const dodge = fields.dodge ?? 0;
  const tough = fields.tough ?? 0;
  const coverage = (1 + pierce) * multishot;
  const critExp = 1 + Math.min(1, s.critChance) * (s.critMultiplier - 1);
  const dpsIndex =
    s.attack *
    boltDmgMul *
    fireRate *
    critExp *
    (1 + s.globalDamageBonus) *
    coverage;
  const k = COMBAT_BALANCE.armorK;
  const armorMit = 1 - k / (k + Math.max(0, s.defense));
  const toughMit = Math.min(0.6, Math.max(0, tough));
  const ehpIndex = maxhp / ((1 - armorMit) * (1 - toughMit) * (1 - Math.min(0.6, dodge)));
  return {
    attack: round(s.attack),
    defense: round(s.defense),
    critChance: round(s.critChance, 6),
    critMultiplier: round(s.critMultiplier, 6),
    tough: round(s.tough),
    globalDamageBonus: round(s.globalDamageBonus, 6),
    // 条件增伤原样记录但不折进 dpsIndex（是否生效取决于伤害类型与攻击方式）
    typeDamageBonus: s.typeDamageBonus,
    formDamageBonus: s.formDamageBonus,
    coverage: round(coverage),
    critExp: round(critExp, 6),
    dpsIndex: round(dpsIndex),
    ehpIndex: round(ehpIndex),
  };
}

interface Snapshot {
  playerBase: {
    fields: Record<string, number>;
    indices: ReturnType<typeof indices>;
  };
  talents: Record<
    string,
    {
      tier: number;
      cat: string;
      max: number;
      lv1: { fields: Record<string, number>; indices: ReturnType<typeof indices> };
      lvMax: {
        fields: Record<string, number>;
        indices: ReturnType<typeof indices>;
      };
    }
  >;
  enemyPressure: Record<
    string,
    { hp: number; dmg: number; quota: number; pressure: number }
  >;
}

function buildSnapshot(): Snapshot {
  const base = fresh();
  const baseFieldsSnap = baseFields(base.player);
  const talents: Snapshot["talents"] = {};

  for (const u of UPGRADES) {
    const lv1 = fresh();
    lv1.learnTalent(talent(u.n));
    const lvMax = fresh();
    for (let i = 0; i < u.max; i++) lvMax.learnTalent(talent(u.n));
    talents[u.n] = {
      tier: u.t,
      cat: u.cat,
      max: u.max,
      lv1: {
        fields: deltaFields(baseFieldsSnap, lv1.player),
        indices: indices(lv1.player, baseFields(lv1.player)),
      },
      lvMax: {
        fields: deltaFields(baseFieldsSnap, lvMax.player),
        indices: indices(lvMax.player, baseFields(lvMax.player)),
      },
    };
  }

  const cfg = ETYPES.slime;
  const enemyPressure: Snapshot["enemyPressure"] = {};
  const wave1Hp =
    resolveEnemySpawnStats(cfg, {
      wave: 1,
      playerLevel: SAMPLE_LEVELS[1],
      elite: false,
      speedJitter: 1,
    }).maxHp * base.waveQuota(1);
  for (const w of WAVES) {
    const st = resolveEnemySpawnStats(cfg, {
      wave: w,
      playerLevel: SAMPLE_LEVELS[w],
      elite: false,
      speedJitter: 1,
    });
    const quota = base.waveQuota(w);
    enemyPressure[String(w)] = {
      hp: round(st.maxHp, 2),
      dmg: round(st.attack, 2),
      quota,
      pressure: round((st.maxHp * quota) / wave1Hp, 4),
    };
  }

  return {
    playerBase: {
      fields: baseFieldsSnap,
      indices: indices(base.player, baseFieldsSnap),
    },
    talents,
    enemyPressure,
  };
}

const snapshot = buildSnapshot();

if (UPDATE) {
  fs.mkdirSync(path.dirname(FIXTURE), { recursive: true });
  fs.writeFileSync(FIXTURE, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
}

const baseline: Snapshot = JSON.parse(fs.readFileSync(FIXTURE, "utf8"));

describe("基线快照 · 玩家基础（未学天赋）", () => {
  it("静态数值与指纹一致", () => {
    expect(snapshot.playerBase.fields).toEqual(baseline.playerBase.fields);
  });

  it("派生指标一致（attack 11 / fireRate 2.2 / 覆盖率 1）", () => {
    expect(snapshot.playerBase.indices).toEqual(baseline.playerBase.indices);
    // 几个能人眼复核的数：11 × 1 × 2.2 × 1.05 × 1 × 1
    expect(snapshot.playerBase.indices.dpsIndex).toBeCloseTo(25.41, 2);
    expect(snapshot.playerBase.indices.ehpIndex).toBeCloseTo(100, 2);
  });
});

describe("基线快照 · 单卡增量（41 张）", () => {
  it("卡数与基线条目一致（换表时这里会先红）", () => {
    expect(Object.keys(snapshot.talents).length).toBe(
      Object.keys(baseline.talents).length,
    );
    expect(Object.keys(snapshot.talents).sort()).toEqual(
      Object.keys(baseline.talents).sort(),
    );
  });

  it.each(UPGRADES.map((u) => u.n))("%s 的 1 级增量与基线一致", (name) => {
    expect(snapshot.talents[name].lv1).toEqual(baseline.talents[name].lv1);
    expect(snapshot.talents[name].lvMax).toEqual(baseline.talents[name].lvMax);
    expect(snapshot.talents[name].tier).toBe(baseline.talents[name].tier);
    expect(snapshot.talents[name].max).toBe(baseline.talents[name].max);
  });

  it("满级增益不得低于 1 级（单调性自检，防止增量表写反）", () => {
    const flat: string[] = [];
    for (const [name, t] of Object.entries(snapshot.talents)) {
      if (t.lvMax.indices.dpsIndex + 1e-9 < t.lv1.indices.dpsIndex)
        flat.push(`${name}(dps)`);
      if (t.lvMax.indices.ehpIndex + 1e-9 < t.lv1.indices.ehpIndex)
        flat.push(`${name}(ehp)`);
    }
    // 现有表里不存在「满级比 1 级弱」的卡；出现即说明有卡写错或指标口径失效
    expect(flat).toEqual([]);
  });
});

describe("基线快照 · 怪物压力（标准怪 slime）", () => {
  it("七个采样波次的单怪数值与压力倍数一致", () => {
    expect(snapshot.enemyPressure).toEqual(baseline.enemyPressure);
  });

  it("压力随波次单调上升", () => {
    const values = WAVES.map((w) => snapshot.enemyPressure[String(w)].pressure);
    for (let i = 1; i < values.length; i++)
      expect(values[i]).toBeGreaterThan(values[i - 1]);
  });
});

describe("基线快照 · 假设声明", () => {
  it("派生指标口径与文档一致（改指标必须同时改这里）", () => {
    expect(INDICES_NOTES.dpsIndex).toBe(
      "attack × boltDmgMul × fireRate × critExp × (1 + globalDamageBonus) × coverage",
    );
    expect(INDICES_NOTES.caution).toContain("不含属性强化");
  });
});

// 供文档引用的说明（测试文件里保留，避免口径散落在别处）
export { INDICES_NOTES };
