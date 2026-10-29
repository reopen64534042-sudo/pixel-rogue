import type { EnemyConfig } from "../core/types";
export const ETYPES: Record<string, EnemyConfig> = {
  slime: {
    hp: 19,
    speed: 55,
    dmg: 10,
    r: 4,
    xp: 1,
    spr: "slime",
    w0: 1,
    wt: 40,
    defense: 25,
    resistances: { fire: 0.15, lightning: 0.05 },
  },
  bat: { hp: 13, speed: 62, dmg: 8, r: 3, xp: 1, spr: "bat", w0: 3, wt: 18, defense: 10, resistances: { fire: 0.15 } },
  brute: {
    hp: 65,
    speed: 22,
    dmg: 18,
    r: 7,
    xp: 3,
    spr: "brute",
    w0: 5,
    wt: 12,
    defense: 60,
    resistances: { fire: 0.3, frost: -0.2 },
  },
  shooter: {
    hp: 22,
    speed: 40,
    dmg: 10,
    r: 4,
    xp: 2,
    spr: "shooter",
    w0: 4,
    wt: 8,
    defense: 15,
    resistances: { fire: 0.1, frost: 0.15, lightning: 0.45 },
  }, // 远程: 保持距离射击；前期权重减半，伤害下调
  bomber: {
    hp: 16,
    speed: 72,
    dmg: 20,
    r: 4,
    xp: 2,
    spr: "bomber",
    w0: 8,
    wt: 14,
    defense: 18,
    resistances: { fire: 0.55, frost: -0.2 },
  }, // 特殊: 自爆
};

// 第 1～7 波沿用 ETYPES 的解锁和原始权重；之后按波次切换。
const WAVE_WEIGHTS: ReadonlyArray<{ from: number; weights: Readonly<Record<string, number>> }> = [
  { from: 25, weights: { slime: 25, bat: 22, brute: 18, shooter: 22, bomber: 13 } },
  { from: 15, weights: { slime: 28, bat: 22, brute: 15, shooter: 22, bomber: 13 } },
  { from: 8, weights: { slime: 35, bat: 20, brute: 15, shooter: 18, bomber: 12 } },
];

export function enemyWeight(type: string, wave: number): number {
  const stage = WAVE_WEIGHTS.find((entry) => wave >= entry.from);
  return stage?.weights[type] ?? ETYPES[type].wt;
}
