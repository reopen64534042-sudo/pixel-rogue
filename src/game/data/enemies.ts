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
  splitter: {
    hp: 30,
    speed: 50,
    dmg: 9,
    r: 5,
    xp: 2,
    spr: "splitter",
    w0: 9,
    wt: 9,
    defense: 20,
    resistances: { fire: 0.2, frost: -0.1 },
  }, // 特殊: 死亡裂成两只小史莱姆
  // 裂胶史莱姆的子体：只由 splitter 死亡生成，永远不进随机刷新池。
  splitling: {
    hp: 12,
    speed: 62,
    dmg: 5,
    r: 3,
    xp: 0,
    spr: "splitling",
    w0: 999,
    wt: 0,
    defense: 10,
    resistances: { fire: 0.2, frost: -0.1 },
  },
  charger: {
    hp: 44,
    speed: 34,
    dmg: 14,
    r: 6,
    xp: 2,
    spr: "charger",
    w0: 5,
    wt: 9,
    defense: 30,
    resistances: { fire: 0.15, frost: -0.15 },
  }, // 特殊: 预警后直线冲锋，撞墙硬直
  drummer: {
    hp: 28,
    speed: 36,
    dmg: 6,
    r: 4,
    xp: 2,
    spr: "drummer",
    w0: 7,
    wt: 7,
    defense: 10,
    resistances: { fire: 0.1, lightning: 0.2 },
  }, // 特殊: 120px 光环，给附近敌人加速和增伤
};

/** 角兽冲锋参数：判定与预警线共用，避免表现和实际距离漂移。 */
export const CHARGER_CHARGE = {
  windup: 0.6,
  dash: 0.5,
  speed: 430,
  distance: 215,
  stun: 1.2,
  cooldown: 2.2,
} as const;

/** 战鼓手光环：半径 120px，附近敌人 +30% 移速 / +15% 伤害；同类不叠加。 */
export const DRUMMER_AURA = {
  radius: 120,
  speedMul: 1.3,
  dmgMul: 1.15,
} as const;

// 波次主题：同一批怪按主题换权重，避免后期所有怪均匀稀释成同一锅。
// from 为生效起始波（降序查找）；signature 是该主题首次出现时保证刷出的怪。
export interface WaveTheme {
  readonly from: number;
  readonly name: string;
  readonly signature?: string;
  readonly weights: Readonly<Record<string, number>>;
}

const WAVE_THEMES: readonly WaveTheme[] = [
  {
    from: 21,
    name: "狂潮",
    weights: {
      slime: 10,
      bat: 10,
      brute: 6,
      shooter: 6,
      bomber: 8,
      splitter: 10,
      drummer: 6,
      charger: 8,
    },
  },
  {
    from: 17,
    name: "混合",
    weights: {
      slime: 12,
      bat: 12,
      brute: 8,
      shooter: 8,
      bomber: 8,
      splitter: 8,
      drummer: 6,
      charger: 8,
    },
  },
  {
    from: 13,
    name: "仪式",
    weights: {
      slime: 16,
      bat: 12,
      brute: 8,
      shooter: 10,
      bomber: 6,
      splitter: 8,
      drummer: 10,
      charger: 8,
    },
  },
  {
    from: 11,
    name: "兽群",
    weights: {
      slime: 26,
      bat: 30,
      brute: 8,
      shooter: 8,
      bomber: 10,
      splitter: 8,
      charger: 6,
      drummer: 4,
    },
  },
  {
    from: 9,
    name: "巢穴",
    signature: "splitter",
    weights: {
      slime: 18,
      bat: 12,
      brute: 10,
      shooter: 8,
      bomber: 8,
      splitter: 18,
      drummer: 6,
      charger: 6,
    },
  },
  {
    from: 7,
    name: "鼓阵",
    signature: "drummer",
    weights: {
      slime: 16,
      bat: 14,
      brute: 8,
      shooter: 18,
      bomber: 8,
      drummer: 14,
      charger: 8,
    },
  },
  {
    from: 5,
    name: "冲锋",
    signature: "charger",
    weights: {
      slime: 24,
      bat: 18,
      brute: 10,
      shooter: 8,
      charger: 10,
    },
  },
  {
    from: 4,
    name: "前哨",
    weights: { slime: 40, bat: 18, brute: 12, shooter: 8 },
  },
  {
    from: 1,
    name: "潮涌",
    weights: { slime: 40, bat: 18 },
  },
];

export function waveTheme(wave: number): WaveTheme {
  return (
    WAVE_THEMES.find((entry) => wave >= entry.from) ??
    WAVE_THEMES[WAVE_THEMES.length - 1]
  );
}

export function enemyWeight(type: string, wave: number): number {
  return waveTheme(wave).weights[type] ?? 0;
}
