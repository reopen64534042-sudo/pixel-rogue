import type { BossAttackId, BossPhase, EnemyConfig } from "../core/types";

/** Boss 不进入主题随机池，只由 Boss 波显式生成；不叠加精英倍率。 */
export const THREE_HEADED_BEAST: EnemyConfig = {
  hp: 1600, dmg: 24, speed: 38, r: 24, xp: 0,
  spr: "boss_three", w0: Number.POSITIVE_INFINITY, wt: 0,
  defense: 60, resistances: { fire: 0.1, frost: 0.1, lightning: 0.1 },
};

export const BOSS = {
  name: "三首巨兽",
  intro: 1.2,
  transition: 0.8,
  thresholds: [0.7, 0.35],
  spawnDistance: 200,
  margin: 30,
  actionInterval: 0.68,
  finalIntervalMul: 0.78,
  finalSpeedMul: 1.2,
  slowEffectMul: 0.5,
  enrageDistance: 240,
  enrageTime: 1.6,
  enrageEndDistance: 180,
  enrageSpeedMul: 1.45,
  closeDistance: 70,
  chargeMinDistance: 90,
  chargePriorityDistance: 220,
  recover: 0.28,
  charge: { duration: 0.65, speed: 440, stagger: 1, cooldowns: [5.6, 6.4, 4.8] },
  breath: { radius: 210, arc: 65 * Math.PI / 180, groundDistances: [100, 170], duration: 0.9, tick: 0.36, repeats: 2 },
  nova: { innerRadius: 45, radius: 155, secondInnerRadius: 58, secondRadius: 185, repeatDelay: 0.65 },
  spikes: { radius: 36, spacing: 65, count: 3, stagger: 0.18 },
  marks: { radius: 38, offset: 58, count: 3, salvos: 3, salvoGap: 0.18 },
  chain: { length: 270, width: 18, jumpRange: 100 },
  hazard: { radius: 30, duration: 4, tick: 1, max: 4, slow: 0.4 },
  slowDuration: 3,
  summons: 2,
  reward: { xpMul: 8, chests: 2, potions: 1 },
} as const;

export const BOSS_PHASES: Record<BossPhase, { name: string; color: string; sprite: string; attacks: readonly BossAttackId[] }> = {
  1: { name: "火焰首", color: "#ff8c3a", sprite: "boss_three_fire", attacks: ["breath"] },
  2: { name: "冰霜首", color: "#57e6ff", sprite: "boss_three_frost", attacks: ["nova", "spikes"] },
  3: { name: "雷霆首", color: "#ffe14a", sprite: "boss_three_lightning", attacks: ["marks", "chain"] },
};

export const BOSS_ATTACKS: Record<BossAttackId, { name: string; windup: number; cooldown: number }> = {
  stomp: { name: "震地践踏", windup: 0.6, cooldown: 3.4 },
  charge: { name: "蛮荒冲撞", windup: 0.65, cooldown: 5.6 },
  breath: { name: "焚野吐息", windup: 0.7, cooldown: 4.6 },
  nova: { name: "双重霜环", windup: 0.85, cooldown: 5.8 },
  spikes: { name: "冰川连刺", windup: 0.65, cooldown: 4.2 },
  marks: { name: "三轮雷罚", windup: 0.6, cooldown: 4.8 },
  chain: { name: "贯雷锁链", windup: 0.55, cooldown: 5.6 },
};

export const BOSS_STOMP_RADIUS = 100;
export function isBossWave(wave: number): boolean {
  return wave > 0 && wave % 10 === 0;
}
