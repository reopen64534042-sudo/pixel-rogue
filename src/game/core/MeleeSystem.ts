import type { GameCore } from "./GameCore";
import { KNOCK_DAMP } from "../data/knockback";
import type { Enemy } from "./types";

const FULL = Math.PI * 2;
/** 角度比较容差，避免 2π 与 0 的浮点误差 */
const EPS = 1e-6;

export interface MeleeSwingOptions {
  /**
   * 中心方向（弧度）。省略时自动朝最近敌人；
   * 全向（spread >= 2π）时省略则视为 0。
   */
  angle?: number;
  /** 张角（弧度）。默认 π/2（90° 扇形）；>= 2π 视为全向 */
  spread?: number;
  /** 有效半径，命中判定会额外加上敌人自身半径 */
  radius: number;
  /** 单次伤害绝对值（调用方负责乘倍率） */
  dmg: number;
  /** 击退初速度 (px/s)，省略或 0 表示不击退 */
  knock?: number;
  /** 刀光颜色 */
  color?: string;
  /** 震屏增量 */
  shake?: number;
  /** 刀光寿命（秒），默认 0.16 */
  life?: number;
  /** 吸血效率倍率；缺省 1（特殊弹等调用方按需传入）。 */
  lifestealMul?: number;
  /** 命中粒子色（默认白色） */
  particleColor?: string;
  /** 战士武器类型：选择对应扫击刀光。 */
  weapon?: "katana" | "greatsword";
  /** 本次重斩的表现快照，不改变伤害与命中。 */
  heavy?: boolean;
  /** 大剑落地冲击的表现快照，不改变命中结算。 */
  impact?: boolean;
  /** 中心口径：只看敌人中心是否在扇形内，视觉扇形 = 命中扇形。 */
  preciseSector?: boolean;
  /** 太刀「居合斩」：伤害数字用专属大字样式（见 FloatingText.iaiDmg） */
  iaiHit?: boolean;
  /** 大剑三段斩：伤害数字用暗金大字样式（见 FloatingText.triDmg） */
  triHit?: boolean;
  /** 居合·极 360° 旋斩：刀光改用全向回旋斩素材。 */
  spin?: boolean;
  /** 三段斩的冲刺斩：刀光追加后退残影，与普通平 A 区分。 */
  dashSlash?: boolean;
}

function angleDiff(target: number, center: number) {
  return Math.atan2(Math.sin(target - center), Math.cos(target - center));
}

/**
 * 执行一次近战挥砍：范围内命中判定 + 刀光 + 命中反馈。
 * 返回被命中的敌人列表（已结算伤害）。所有近战天赋都通过它出手。
 */
export function meleeSwing(this: GameCore, opts: MeleeSwingOptions): Enemy[] {
  const p = this.player;
  const spread = Math.min(opts.spread ?? Math.PI / 2, FULL);
  const full = spread >= FULL - EPS;
  const half = spread / 2;

  let angle = opts.angle;
  if (angle === undefined) {
    if (full) angle = 0;
    else {
      const tgt = this.nearestEnemy(p.x, p.y, opts.radius + 40);
      if (!tgt) return [];
      angle = Math.atan2(tgt.y - p.y, tgt.x - p.x);
    }
  }

  const hits: Enemy[] = [];
  for (const e of this.enemies) {
    if (e.dead) continue;
    const dx = e.x - p.x,
      dy = e.y - p.y;
    const reach = opts.preciseSector ? opts.radius : opts.radius + e.r;
    if (dx * dx + dy * dy > reach * reach) continue;
    if (!full) {
      const diff = Math.abs(angleDiff(Math.atan2(dy, dx), angle));
      if (opts.preciseSector) {
        // 中心口径：中心在扇形内就命中，和绘制的扇形完全一致。
        if (diff > half) continue;
      } else {
        // 身体口径：敌人圆与扇形重叠（旧近战/大剑沿用）。
        const d = Math.hypot(dx, dy);
        const pad = d > e.r ? Math.asin(Math.min(1, e.r / d)) : Math.PI;
        if (diff > half + pad) continue;
      }
    }
    hits.push(e);
  }

  for (const e of hits) {
    const dx = e.x - p.x,
      dy = e.y - p.y;
    const d = Math.hypot(dx, dy);
    if (opts.knock && !e.boss && !e.noKnock) {
      e.kx = (d > 0.01 ? dx / d : Math.cos(angle)) * opts.knock;
      e.ky = (d > 0.01 ? dy / d : Math.sin(angle)) * opts.knock;
    }
    this.hurtEnemy(e, opts.dmg, 0, 0, {
      src: opts.iaiHit ? "iai" : opts.triHit ? "tri" : "melee",
      type: "physical",
      form: "melee",
      ...(opts.lifestealMul !== undefined
        ? { lifestealMul: opts.lifestealMul }
        : {}),
      ...(opts.iaiHit ? { iaiHit: true } : {}),
      ...(opts.triHit ? { triHit: true } : {}),
    });
  }

  this.slashes.push({
    x: p.x,
    y: p.y,
    a: angle,
    arc: spread,
    r: opts.radius,
    life: opts.life ?? 0.16,
    max: opts.life ?? 0.16,
    c: opts.color ?? "#e8fbff",
    ...(opts.weapon ? { weapon: opts.weapon } : {}),
    ...(opts.spin ? { spin: true } : {}),
    ...(opts.heavy ? { heavy: true } : {}),
    ...(opts.dashSlash ? { dashSlash: true } : {}),
    ...(opts.impact ? { impact: true } : {}),
  });

  if (hits.length) {
    for (const e of hits) {
      for (let i = 0; i < 3; i++) {
        const a = Math.random() * FULL;
        this.parts.push({
          x: e.x,
          y: e.y,
          vx: Math.cos(a) * 60,
          vy: Math.sin(a) * 60,
          life: 0.22,
          c: opts.particleColor ?? "#ffffff",
        });
      }
    }
    this.shake = Math.min(this.shake + (opts.shake ?? 2), 8);
    this.audio.beep(300, 0.06, "square", 0.03, -120);
  }
  return hits;
}

/** 每帧推进：刀光衰减 + 敌人击退位移 */
export function updateMelee(this: GameCore, dt: number) {
  for (let i = this.slashes.length - 1; i >= 0; i--) {
    const s = this.slashes[i];
    s.life -= dt;
    if (s.life <= 0) this.slashes.splice(i, 1);
  }
}

/** 击退位移与衰减；由 EnemySystem 在每个敌人每帧调用 */
export function applyKnockback(e: Enemy, dt: number) {
  if (e.noKnock || e.boss) {
    e.kx = 0;
    e.ky = 0;
    return;
  }
  const kx = e.kx ?? 0,
    ky = e.ky ?? 0;
  if (!kx && !ky) return;
  e.x += kx * dt;
  e.y += ky * dt;
  const damp = Math.max(0, 1 - KNOCK_DAMP * dt);
  const nkx = kx * damp,
    nky = ky * damp;
  e.kx = Math.abs(nkx) < 1 ? 0 : nkx;
  e.ky = Math.abs(nky) < 1 ? 0 : nky;
}
