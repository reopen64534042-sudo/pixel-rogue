import {
  LASER_DAMAGE_MUL,
  LASER_RANGE_MUL,
  LASER_WIDTH,
  MISSILE_BURN_DPS_MUL,
  MISSILE_BURN_DURATION,
  MISSILE_DAMAGE_MUL,
  MISSILE_LATERAL_KICK,
  MISSILE_RADIUS,
  MISSILE_TURN_RATE,
  OFFHAND_OFFSET,
  SPECIAL_LEVELS,
  SPECIAL_UPGRADES,
  TRUE_DAMAGE_MUL,
  getSpecialLevelStats,
} from "../data/specialShot";
import { KNOCK } from "../data/knockback";
import type { GameCore } from "./GameCore";
import type { Enemy } from "./types";

function pointSegmentDistance(
  px: number,
  py: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len2 = dx * dx + dy * dy;
  const t = len2
    ? Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / len2))
    : 0;
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

/** 最近的敌人；没有敌人时返回 null。 */
function nearestTarget(core: GameCore) {
  const p = core.player;
  let target: Enemy | null = null;
  let best = Infinity;
  for (const e of core.enemies) {
    if (e.dead) continue;
    const d = (e.x - p.x) ** 2 + (e.y - p.y) ** 2;
    if (d < best) {
      best = d;
      target = e;
    }
  }
  return target;
}

/** 从玩家指定侧肩位取发射点。 */
function shoulderPoint(core: GameCore, side: number) {
  const p = core.player;
  return {
    x: p.x + side * OFFHAND_OFFSET,
    y: p.y - 3,
  };
}

/** 「激光」升级：从另一侧肩位独立索敌并发射穿透光束。预留：后续独立武器复用，当前不在强化弹升级池。 */
export function fireSpecialLaser(
  this: GameCore,
  specialTarget: Enemy,
  damage: number,
) {
  const p = this.player;
  const target = nearestTarget(this) ?? specialTarget;
  // 与导弹相反：激光从特殊弹同侧肩位出射，避免两条效果重合。
  const side = Math.sign(specialTarget.x - p.x) || 1;
  const start = shoulderPoint(this, side);
  const angle = Math.atan2(target.y - start.y, target.x - start.x);
  const length = p.attackRange * LASER_RANGE_MUL;
  const x1 = start.x;
  const y1 = start.y;
  const x2 = x1 + Math.cos(angle) * length;
  const y2 = y1 + Math.sin(angle) * length;
  const type = this.specialUpgrades.includes("trueDamage") ? "true" : "physical";
  const laserDamage =
    damage *
    LASER_DAMAGE_MUL *
    (this.specialUpgrades.includes("trueDamage") ? TRUE_DAMAGE_MUL : 1);
  for (const e of this.enemies) {
    if (e.dead) continue;
    if (pointSegmentDistance(e.x, e.y, x1, y1, x2, y2) <= LASER_WIDTH + e.r) {
      this.hurtEnemy(e, laserDamage, 0, 0, {
        src: "bullet",
        type,
        form: "other",
        noCrit: true,
        noChain: true,
        noLifesteal: true,
      });
    }
  }
  this.lasers.push({ x1, y1, x2, y2, t: 0.12 });
  this.audio.beep(1320, 0.08, "sawtooth", 0.035, -300);
}

/** 「导弹」升级：从另一侧肩位独立索敌，带侧向初速的弧线追踪弹。预留：后续独立武器复用，当前不在强化弹升级池。 */
export function launchSpecialMissile(
  this: GameCore,
  specialTarget: Enemy,
  damage: number,
) {
  // 导弹直接锁最近敌人，允许和特殊弹同目标。
  const target = nearestTarget(this) ?? specialTarget;
  // 从特殊弹的反侧肩位出膛，形成交叉火力。
  const side = -(Math.sign(specialTarget.x - this.player.x) || 1);
  const start = shoulderPoint(this, side);
  const speed = 220;
  const angle = Math.atan2(target.y - start.y, target.x - start.x);
  const perp = angle - Math.PI / 2;
  this.missiles.push({
    x: start.x,
    y: start.y,
    vx:
      Math.cos(angle) * speed +
      Math.cos(perp) * MISSILE_LATERAL_KICK,
    vy:
      Math.sin(angle) * speed +
      Math.sin(perp) * MISSILE_LATERAL_KICK,
    target,
    damage: damage * MISSILE_DAMAGE_MUL,
    t: 1.2,
  });
  this.audio.beep(300, 0.12, "sawtooth", 0.03, 180);
  return target;
}

export function updateSpecialMissiles(this: GameCore, dt: number) {
  for (let i = this.missiles.length - 1; i >= 0; i--) {
    const m = this.missiles[i];
    m.t -= dt;
    // 追踪：目标死亡/丢失时重新索敌最近的敌人，始终保持飞行方向修正。
    if (!m.target || m.target.dead) {
      let best = null;
      let bestD = Infinity;
      for (const e of this.enemies) {
        if (e.dead) continue;
        const d = (e.x - m.x) ** 2 + (e.y - m.y) ** 2;
        if (d < bestD) {
          bestD = d;
          best = e;
        }
      }
      m.target = best;
    }
    if (m.target && !m.target.dead) {
      const speed = Math.hypot(m.vx, m.vy) || 220;
      const desired = Math.atan2(m.target.y - m.y, m.target.x - m.x);
      const current = Math.atan2(m.vy, m.vx);
      let diff = desired - current;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      const turn = MISSILE_TURN_RATE * dt;
      const next = current + Math.max(-turn, Math.min(turn, diff));
      m.vx = Math.cos(next) * speed;
      m.vy = Math.sin(next) * speed;
    }
    m.x += m.vx * dt;
    m.y += m.vy * dt;
    const hit =
      m.target &&
      !m.target.dead &&
      Math.hypot(m.target.x - m.x, m.target.y - m.y) <= m.target.r + 8;
    if (m.t > 0 && !hit) continue;

    this.missiles.splice(i, 1);
    for (const e of this.enemies) {
      if (e.dead) continue;
      if (Math.hypot(e.x - m.x, e.y - m.y) <= MISSILE_RADIUS + e.r) {
        const d = Math.hypot(e.x - m.x, e.y - m.y) || 1;
        this.hurtEnemy(
          e,
          m.damage,
          ((e.x - m.x) / d) * KNOCK.shooter.missile,
          ((e.y - m.y) / d) * KNOCK.shooter.missile,
          {
            src: "explode",
            type: "physical",
            form: "other",
            fromExplode: true,
            noChain: true,
            noLifesteal: true,
          },
        );
      }
    }
    this.burnZones.push({
      x: m.x,
      y: m.y,
      R: MISSILE_RADIUS * 0.8,
      t: MISSILE_BURN_DURATION,
      dps: m.damage * MISSILE_BURN_DPS_MUL,
      showDamage: true,
      tickT: 0.5,
      tickDmg: 0,
    });
    for (let j = 0; j < 8; j++) {
      const a = (j / 8) * Math.PI * 2;
      this.parts.push({
        x: m.x,
        y: m.y,
        vx: Math.cos(a) * 90,
        vy: Math.sin(a) * 90,
        life: 0.3,
        c: "#ff9a3d",
      });
    }
    this.shake = Math.min(this.shake + 1.5, 6);
    this.audio.beep(120, 0.2, "sawtooth", 0.05, -60);
  }
}

/**
 * 强化弹命中积累经验；升级时按等级表提升伤害/穿透，
 * 并在 L4-L12 按「档位 + 权重」随机获得一条尚未拥有的升级：
 * 第 1 抽只出基础形态，第 2 抽解锁过载、两系生命伤害与裂变，
 * 第 8 抽（L11/L12）解锁完全追踪与完全真实伤害。
 * 升级结果统一在 C 属性面板查看，不再弹出世界飘字。
 */
export function gainSpecialXp(this: GameCore, amount: number) {
  if (!Number.isFinite(amount) || amount <= 0) return;
  if (this.specialLevel >= SPECIAL_LEVELS.length) return;
  this.specialXp += amount;

  while (this.specialLevel < SPECIAL_LEVELS.length) {
    const current = getSpecialLevelStats(this.specialLevel);
    if (current.xpToNext === null || this.specialXp < current.xpToNext) break;
    this.specialXp -= current.xpToNext;
    this.specialLevel++;

    const next = getSpecialLevelStats(this.specialLevel);
    if (next.grantsUpgrade) {
      const pickNo = this.specialUpgrades.length + 1;
      const pool = SPECIAL_UPGRADES.filter(
        (upgrade) =>
          !this.specialUpgrades.includes(upgrade.id) &&
          upgrade.minPick <= pickNo,
      );
      if (pool.length) {
        const totalWeight = pool.reduce(
          (sum, upgrade) => sum + upgrade.weight,
          0,
        );
        let roll = Math.random() * totalWeight;
        let pick = pool[pool.length - 1];
        for (const upgrade of pool) {
          roll -= upgrade.weight;
          if (roll < 0) {
            pick = upgrade;
            break;
          }
        }
        this.specialUpgrades.push(pick.id);
      }
    }
    this.audio.beep(1046, 0.12, "triangle", 0.05, 200);
  }
  if (this.specialLevel >= SPECIAL_LEVELS.length) this.specialXp = 0;
  this.shake = Math.min(this.shake + 1, 3);
}

/** DEV：直接把强化箭设置到指定等级，并按等级重建升级（L4 起每级 1 条）。 */
export function devSetSpecialLevel(this: GameCore, level: number) {
  const target = Math.max(
    1,
    Math.min(SPECIAL_LEVELS.length, Math.floor(level) || 1),
  );
  this.specialLevel = target;
  this.specialXp = 0;
  const grants = Math.max(0, target - 3);
  this.specialUpgrades = SPECIAL_UPGRADES.slice(0, grants).map((u) => u.id);
  this.audio.beep(1046, 0.12, "triangle", 0.05, 200);
}
