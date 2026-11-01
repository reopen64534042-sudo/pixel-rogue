import type { EliteAffix, EnemyConfig } from "../core/types";
import { THREE_HEADED_BEAST } from "./boss";
export const ETYPES: Record<string, EnemyConfig> = {
  lobber: { hp: 30, dmg: 14, speed: 32, r: 5, xp: 2, spr: "lobber", w0: 15, wt: 8,
    defense: 18, resistances: { fire: 0.55, frost: -0.15 }, behavior: "lobber" },
  bulwark: { hp: 55, dmg: 12, speed: 28, r: 6, xp: 3, spr: "bulwark", w0: 16, wt: 6,
    defense: 45, resistances: { frost: 0.2, fire: -0.1 }, behavior: "bulwark" },
  tether: { hp: 24, dmg: 10, speed: 38, r: 4, xp: 2, spr: "tether", w0: 19, wt: 8,
    defense: 10, resistances: { lightning: 0.4, frost: -0.1 }, behavior: "tether" },
  shooter_elite: { hp: 32, dmg: 12, speed: 34, r: 4, xp: 2, spr: "shooter", w0: 999, wt: 0,
    defense: 12, resistances: { fire: 0.1, frost: 0.15, lightning: 0.45 },
    baseType: "shooter", eliteOnly: true, behavior: "eyeElite" },
  drummer_elite: { hp: 40, dmg: 8, speed: 30, r: 5, xp: 2, spr: "drummer", w0: 999, wt: 0,
    defense: 12, resistances: { fire: 0.1, lightning: 0.2 },
    baseType: "drummer", eliteOnly: true, behavior: "drummerElite" },
  boss_three: THREE_HEADED_BEAST,
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
    baseType: "brute",
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
  spinner: {
    hp: 26,
    speed: 34,
    dmg: 8,
    r: 4,
    xp: 2,
    spr: "spinner",
    w0: 11,
    wt: 8,
    defense: 12,
    resistances: { fire: 0.2, frost: -0.1 },
  }, // 特殊: 保持距离吐网，落点预警后减速玩家
  burrower: {
    hp: 40,
    speed: 46,
    dmg: 16,
    r: 5,
    xp: 3,
    spr: "burrower",
    w0: 13,
    wt: 9,
    defense: 20,
    resistances: { fire: 0.1, frost: 0.15 },
  }, // 特殊: 钻地突进，地面预警后钻出
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

/** Shared geometry/timing for simulation and telegraphs. Width means full corridor width. */
export const MONSTER_SKILLS = {
  lob: { windup: 0.8, cooldown: 3.5, range: 280, radius: 50, groundRadius: 24, groundLife: 3, tick: 0.25 },
  thrust: { windup: 0.6, cooldown: 4.5, range: 110, length: 110, width: 30, distance: 80, duration: 0.25, guardDown: 0.8 },
  tether: { windup: 0.8, cooldown: 5, range: 260, length: 240, width: 20, duration: 1.2, tick: 0.3, ticks: 4 },
  stomp: { windup: 0.7, cooldown: 6, range: 120, radius: 110, knock: 80 },
  gaze: { windup: 0.8, cooldown: 5, range: 280, length: 280, width: 24 },
  collapse: { windup: 0.9, cooldown: 7, range: 280, radius: 90 },
  blink: { windup: 0.3, cooldown: 4, range: 90, distance: 140 },
  sonic: { windup: 0.7, cooldown: 6, range: 180, radius: 150, duration: 0.6, rally: 3 },
} as const;
export const BULWARK_GUARD = { arc: Math.PI * 2 / 3, mul: 0.4 } as const;
export const ELITE_DRUMMER_AURA = { radius: 140, speedMul: 1.2, dmgMul: 1.2 } as const;
export const EYE_SLOW = { factor: 0.3, duration: 2 } as const;
export const ELITE_SPECIES = ["brute", "shooter_elite", "drummer_elite"] as const;
export function eliteSpeciesForSlot(slot: number): string { return ELITE_SPECIES[slot] ?? "brute"; }
export function enemyCodexKey(type: string, elite: boolean): string {
  return elite && !ETYPES[type]?.eliteOnly ? `${type}_elite` : type;
}

/** 织网蛛的蛛网：落点预警后生效，玩家在网内移速 ×0.6；同屏最多 12 张。 */
export const WEB_ZONE = {
  radius: 40,
  arm: 0.45,
  duration: 2.8,
  cooldown: 2.8,
  range: 220,
  slow: 0.6,
  max: 12,
} as const;

/** 掘地虫钻地节奏：下沉 / 地下移动 / 地面预警；地下移动速度固定，不受减速影响。 */
export const BURROWER = {
  dive: 0.35,
  under: 0.8,
  surface: 0.5,
  underSpeed: 150,
  cooldown: 2.6,
  rangeMin: 70,
  rangeMax: 300,
} as const;

/** 精英词缀从第 8 波开始出现；每次生成用 seed 确定性抽取，不额外推进随机序列。 */
export const ELITE_AFFIX_FROM = 8;
export const ELITE_AFFIXES: readonly EliteAffix[] = [
  "split",
  "summon",
  "nova",
];
export const ELITE_AFFIX_INFO: Readonly<
  Record<EliteAffix, { name: string; color: string }>
> = {
  split: { name: "分裂", color: "#ff8a2b" },
  summon: { name: "召唤", color: "#b05cff" },
  nova: { name: "冰霜新星", color: "#57e6ff" },
};

/**
 * 精英「冰霜新星」：进入 140px 后预警 0.55 秒，命中半径 95。
 * 预警圈必须按命中半径绘制——画出 90 却按 95 结算时，
 * 站在圈边的玩家会以为安全却被打中。
 */
export const ELITE_NOVA = {
  triggerRange: 140,
  windup: 0.55,
  radius: 95,
  cooldown: 4.5,
  damageMul: 1.2,
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
      lobber: 6, bulwark: 6, tether: 8,
      slime: 10,
      bat: 10,
      brute: 6,
      shooter: 6,
      bomber: 6,
      splitter: 6,
      drummer: 4,
      charger: 6,
      spinner: 6,
      burrower: 6,
    },
  },
  {
    from: 17,
    name: "混合",
    weights: {
      lobber: 8, bulwark: 8, tether: 8,
      slime: 12,
      bat: 12,
      brute: 6,
      shooter: 6,
      bomber: 8,
      splitter: 6,
      drummer: 4,
      charger: 6,
      spinner: 6,
      burrower: 8,
    },
  },
  {
    from: 13,
    name: "伏击",
    signature: "burrower",
    weights: {
      lobber: 6, bulwark: 6,
      slime: 14,
      bat: 12,
      brute: 6,
      shooter: 8,
      bomber: 6,
      splitter: 6,
      drummer: 6,
      charger: 6,
      spinner: 6,
      burrower: 8,
    },
  },
  {
    from: 11,
    name: "蛛巢",
    signature: "spinner",
    weights: {
      slime: 18,
      bat: 24,
      brute: 8,
      shooter: 8,
      bomber: 8,
      splitter: 8,
      spinner: 16,
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
