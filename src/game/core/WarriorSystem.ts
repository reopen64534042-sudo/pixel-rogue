import { WARRIOR_BALANCE as WB } from "../data/warriorBalance";
import { WORLD, clamp } from "../data/constants";
import { KNOCK, KNOCK_DAMP } from "../data/knockback";
import type { GameCore } from "./GameCore";
import type { Enemy, Point } from "./types";
import type { MeleeSwingOptions } from "./MeleeSystem";

interface WarriorSwingSnapshot {
  angle: number;
  spread: number;
  radius: number;
  dmg: number;
  knock: number;
  heavy: boolean;
  resolveReady: boolean;
  iai: { cap: number } | null;
  greatIai: boolean;
  flowConsume: boolean;
}

type WarriorLeapAttack = { kind: "leap"; impact: MeleeSwingOptions };

/** One locked destination and attack snapshot for windup -> fall -> impact. */
export type WarriorLeapState = WarriorLeapAttack & {
  phase: "windup" | "fall";
  elapsed: number;
  fromX: number;
  fromY: number;
  x: number;
  y: number;
  radius: number;
  /** 三段斩第三段：落地附带眩晕、推进循环并开启 0.8s 无敌。 */
  triStage3?: boolean;
};

function beginWarriorLeap(
  core: GameCore,
  target: Point,
  attack: WarriorLeapAttack,
  triStage3 = false,
) {
  core.warriorLeapState = {
    ...attack,
    ...(triStage3 ? { triStage3: true } : {}),
    phase: "windup",
    elapsed: 0,
    fromX: core.player.x,
    fromY: core.player.y,
    x: clamp(target.x, 24, WORLD.w - 24),
    y: clamp(target.y, 24, WORLD.h - 24),
    radius: attack.impact.radius,
  };
}

/** Advance before player movement/camera; damage is settled by warrior combat. */
export function updateWarriorLeapMotion(this: GameCore, dt: number) {
  const leap = this.warriorLeapState;
  if (!leap) return;
  const total = WB.leapWindup + WB.leapFall;
  leap.elapsed = Math.min(total, leap.elapsed + dt);
  if (leap.elapsed < WB.leapWindup) return;
  leap.phase = "fall";
  const progress = Math.min(1, (leap.elapsed - WB.leapWindup) / WB.leapFall);
  const travel = 1 - (1 - progress) ** 2;
  this.player.x = leap.fromX + (leap.x - leap.fromX) * travel;
  this.player.y = leap.fromY + (leap.y - leap.fromY) * travel;
}

function landWarriorLeap(core: GameCore, leap: WarriorLeapState) {
  core.player.x = leap.x;
  core.player.y = leap.y;
  // Clear before settling damage: impact is grounded and cannot resolve twice.
  core.warriorLeapState = null;
  const hits = core.meleeSwing(leap.impact);
  if (leap.triStage3) {
    for (const e of hits)
      e.stunT = Math.max(e.stunT ?? 0, WB.triDash.stunT);
    advanceWarriorTriDash.call(core);
    core.warriorLeapInvulnT = WB.triDash.leapInvulnT;
  }
  if ((core.player.upCounts["强袭"] || 0) > 0)
    core.warriorLeapHasteT = WB.leapHasteWindow;
  const style = WB.styles.greatsword;
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    core.parts.push({
      x: leap.x, y: leap.y,
      vx: Math.cos(a) * 80, vy: Math.sin(a) * 80,
      life: 0.25, c: style.particle,
    });
  }
  core.audio.beep(220, 0.12, "square", 0.05, -120);
}

function flowOwned(core: GameCore): boolean {
  return (core.player.upCounts["流·初"] || 0) > 0;
}

/** 当前流派可见的流上限：L3 > L2 > L1 > 无。 */
export function warriorFlowCap(core: GameCore): number {
  const p = core.player;
  if (!flowOwned(core)) return 0;
  if ((p.upCounts["流·极"] || 0) > 0) return WB.flow.cap3;
  if ((p.upCounts["流·续"] || 0) > 0) return WB.flow.cap2;
  return WB.flow.cap1;
}

function flowDuration(core: GameCore): number {
  return (core.player.upCounts["流·续"] || 0) > 0
    ? WB.flow.duration2
    : WB.flow.duration1;
}

/**
 * 「居合」链（太刀专属）：走路积势、满层自动爆发。
 *
 * 势只增不减——移动累积到上限后，**下一刀**自动变居合斩并清零。
 * 为什么不做「挥砍时倾泻」：实测两次挥砍之间只能移动 27px（2.5 刀/秒 × 68px/s
 * × 0.4s），而一层需要 100px，那样势会永远停在 0–1 层、上限完全失去意义。
 */
export function iaiOwned(core: GameCore): boolean {
  return (core.player.upCounts["居合"] || 0) > 0;
}

/** 势上限：核心 8；「居合·迅」作为可选增幅再 +4。 */
export function warriorIaiCap(core: GameCore): number {
  if (!iaiOwned(core)) return 0;
  return (
    WB.iai.cap +
    ((core.player.upCounts["居合·迅"] || 0) > 0 ? WB.iai.capBonus : 0)
  );
}

/** 每层势所需的移动距离（px）：核心 50；「居合·迅」再减 10。 */
export function warriorIaiStep(core: GameCore): number {
  return (
    WB.iai.distPerStack -
    ((core.player.upCounts["居合·迅"] || 0) > 0
      ? WB.iai.stepReduction
      : 0)
  );
}

/** 势满 → 下一刀变居合斩。返回 null 表示本次是普通挥砍。 */
function iaiReady(core: GameCore): { cap: number } | null {
  const cap = warriorIaiCap(core);
  if (cap <= 0) return null;
  return core.warriorIaiStacks >= cap ? { cap } : null;
}

/** 「流」只增幅居合斩伤害（不再给普通挥砍/冲刺路径通用增伤）。 */
function flowIaiMul(core: GameCore): number {
  return flowOwned(core)
    ? 1 + WB.flow.dmgPerStack * core.warriorFlowStacks
    : 1;
}

/**
 * 基准挥砍伤害（#178）：攻击基线。
 *
 * 这是战士普通挥砍的共同基准；流只增幅居合斩，因此不再乘进这里。
 * **不含** heavy（大剑第 3 下）、breakout（被围）、resolve 这些条件倍率——
 * 它们随敌群状态逐帧跳动，放进面板会让数字无解释地变化；
 * 这些条件倍率由各自的行单独标注（如「重斩 每 3 下 · 250%」）。
 */
export function warriorSwingDamage(core: GameCore): number {
  return core.player.damage;
}

function pointSegmentDistance(
  px: number,
  py: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return Math.hypot(px - x1, py - y1);
  const t = Math.max(
    0,
    Math.min(1, ((px - x1) * dx + (py - y1) * dy) / len2),
  );
  return Math.hypot(px - (x1 + dx * t), py - (y1 + dy * t));
}

function warriorLeapRange(core: GameCore): number {
  const p = core.player;
  const extra =
    (p.upCounts["强袭"] || 0) > 0 ? WB.leapRangeMul : 1;
  return p.attackRange + WB.leapRange * extra;
}

/** 跃击目标：搜索范围内最密集的敌群，同密度取最近。 */
function findLeapTarget(core: GameCore): Enemy | null {
  const p = core.player;
  const range = warriorLeapRange(core);
  const clusterR = Math.max(40, p.attackRange);
  let best: Enemy | null = null;
  let bestCount = -1;
  let bestDist = Infinity;
  for (const e of core.enemies) {
    if (e.dead) continue;
    const d = Math.hypot(e.x - p.x, e.y - p.y);
    if (d > range) continue;
    let count = 0;
    for (const o of core.enemies) {
      if (o.dead) continue;
      if (Math.hypot(o.x - e.x, o.y - e.y) <= clusterR) count++;
    }
    if (count > bestCount || (count === bestCount && d < bestDist)) {
      best = e;
      bestCount = count;
      bestDist = d;
    }
  }
  return best;
}

/** 三段斩第三段：只有同时持有三段斩与跃击时才存在。 */
function warriorTriStage3(core: GameCore): boolean {
  return (
    core.warriorTriDashActive &&
    core.warriorTriDashStage === 2 &&
    (core.player.upCounts["三段斩"] || 0) > 0 &&
    (core.player.upCounts["跃击"] || 0) > 0
  );
}

/** 无锁定目标时的前冲落点：沿当前朝向（无输入则朝最近敌人）。 */
function forwardLeapPoint(core: GameCore): { x: number; y: number } {
  const p = core.player;
  let dx = p.dx;
  let dy = p.dy;
  if (!dx && !dy) {
    const target = core.nearestEnemy(p.x, p.y, p.attackRange + WB.triDash.leapDist);
    if (target) {
      dx = target.x - p.x;
      dy = target.y - p.y;
    } else {
      dx = 1;
    }
  }
  const len = Math.hypot(dx, dy) || 1;
  return {
    x: clamp(p.x + (dx / len) * WB.triDash.leapDist, 24, WORLD.w - 24),
    y: clamp(p.y + (dy / len) * WB.triDash.leapDist, 24, WORLD.h - 24),
  };
}

/**
 * 跃击（v131 状态机）：锁定落点，起手 + 坠落结束后才结算 AOE。
 *
 * - 普通跃击：消耗一次共享冲刺充能，锁定最密集敌群；无目标退回普通冲刺。
 * - 三段斩第三段（triStage3）：消费第 3 个独立冲刺槽；无目标时向前 85px
 *   起跳；落地附带眩晕、推进三段循环，并开启 0.8s 落地无敌。
 */
export function warriorLeap(
  this: GameCore,
  opts?: { triStage3?: boolean },
): boolean {
  const p = this.player;
  const tri = opts?.triStage3 === true;
  if (
    this.state !== "play" ||
    this.prof !== "warrior" ||
    this.warriorStyle !== "greatsword" ||
    this.warriorLeapState ||
    p.dashT > 0
  )
    return false;
  if (tri) {
    if (!warriorTriStage3(this)) return false;
    if (this.warriorTriSlotRe[2] > 0) return false;
  } else if (
    (p.upCounts["跃击"] || 0) === 0 ||
    p.dashCharges <= 0
  ) {
    return false;
  }
  const target = findLeapTarget(this);
  if (!target && !tri) return false;
  const point = target
    ? { x: target.x, y: target.y }
    : forwardLeapPoint(this);
  if (tri) {
    // 三段斩第三段消费第 3 个独立冲刺槽。
    this.warriorTriSlotRe[2] = p.dashMax;
    p.dashCharges = 0;
    p.dashRe = 0;
  } else {
    const dchMax = 1 + p.dashChargeLv;
    p.dashCharges = Math.max(0, p.dashCharges - 1);
    if (p.dashCharges < dchMax && p.dashRe <= 0)
      p.dashRe = p.dashMax + WB.leapRechargeExtra;
  }
  if (this.tutorialMode) this.tutorialDashed = true;
  const style = WB.styles[this.warriorStyle];
  beginWarriorLeap(
    this,
    point,
    {
      kind: "leap",
      impact: {
        angle: 0,
        spread: Math.PI * 2,
        radius: p.attackRange * (tri ? WB.triDash.leapRadiusMul : 1.2),
        dmg: p.damage * (tri ? WB.triDash.leapDmgMul : WB.leapDamageMul),
        knock:
          KNOCK.warrior.leap *
          KNOCK_DAMP *
          (tri ? WB.triDash.leapKnockMul : 1),
        color: style.color,
        particleColor: style.particle,
        weapon: "greatsword",
        impact: true,
        life: WB.leapImpactLife,
        shake: tri ? 6 : 4,
      },
    },
    tri,
  );
  return true;
}

function advanceWarriorTriDash(this: GameCore): void {
  this.warriorTriDashActive = false;
  this.warriorTriDashStage = (this.warriorTriDashStage + 1) % 3;
}

/** 重斩命中后生成平推剑气；持裂地时改为四斜向强化剑气。 */
function spawnWarriorHeavyWaves(this: GameCore, angle: number): void {
  const p = this.player;
  if ((p.upCounts["裂地"] || 0) > 0) {
    const cfg = WB.energyWaves.fissure;
    const sharedHit: Enemy[] = [];
    for (const dir of [
      (-3 * Math.PI) / 4,
      -Math.PI / 4,
      Math.PI / 4,
      (3 * Math.PI) / 4,
    ]) {
      this.warriorWaves.push({
        kind: "fissure",
        x: p.x + Math.cos(dir) * cfg.offset,
        y: p.y + Math.sin(dir) * cfg.offset,
        vx: Math.cos(dir) * cfg.speed,
        vy: Math.sin(dir) * cfg.speed,
        angle: dir,
        t: cfg.life,
        max: cfg.life,
        halfW: cfg.halfW,
        halfH: cfg.halfH,
        dmg: p.damage * cfg.dmgMul,
        knock: KNOCK.warrior.fissure,
        stun: cfg.stunT,
        scale: cfg.scale,
        hit: sharedHit,
      });
    }
    this.audio.beep(180, 0.12, "sawtooth", 0.05, -40);
    return;
  }
  if ((p.upCounts["剑气"] || 0) > 0) {
    const cfg = WB.energyWaves.qi;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    this.warriorWaves.push({
      kind: "qi",
      x: p.x + cos * cfg.offset,
      y: p.y + sin * cfg.offset,
      vx: cos * cfg.speed,
      vy: sin * cfg.speed,
      angle,
      t: cfg.life,
      max: cfg.life,
      halfW: cfg.halfW,
      halfH: cfg.halfH,
      dmg: p.damage * cfg.dmgMul,
      knock: KNOCK.warrior.qi,
      stun: 0,
      scale: 1,
      hit: [],
    });
    this.audio.beep(280, 0.1, "sine", 0.04, 120);
  }
}

/** 推进波面并按“方向半宽/垂直半高”碰撞盒结算，每个波面/整次裂地只命中一次。 */
function updateWarriorWaves(this: GameCore, dt: number): void {
  for (let i = this.warriorWaves.length - 1; i >= 0; i--) {
    const w = this.warriorWaves[i];
    w.t -= dt;
    if (w.t <= 0) {
      this.warriorWaves.splice(i, 1);
      continue;
    }
    w.x += w.vx * dt;
    w.y += w.vy * dt;
    const cos = Math.cos(w.angle);
    const sin = Math.sin(w.angle);
    for (const e of this.enemies) {
      if (e.dead || w.hit.includes(e)) continue;
      const dx = e.x - w.x;
      const dy = e.y - w.y;
      const forward = dx * cos + dy * sin;
      const lateral = -dx * sin + dy * cos;
      if (
        Math.abs(forward) > w.halfW + e.r ||
        Math.abs(lateral) > w.halfH + e.r
      )
        continue;
      w.hit.push(e);
      const armorBonus =
        w.kind === "fissure" && (e.armorBreakT ?? 0) > 0
          ? 1 + WB.energyWaves.fissure.armorBonus
          : 1;
      this.hurtEnemy(e, w.dmg * armorBonus, cos * w.knock, sin * w.knock, {
        src: "melee",
        type: "physical",
        form: "melee",
      });
      if (w.stun > 0) e.stunT = Math.max(e.stunT ?? 0, w.stun);
    }
  }
}

/**
 * 三段斩末尾攻击：第 1/2 段为扇斩（同级，只差冲刺距离），第 3 段为旋斩。
 * 第 3 段若持有跃击，会走 updateWarriorLeap 的跃击状态机，不进入这里。
 */
export function finishWarriorTriDash(this: GameCore): void {
  if (!this.warriorTriDashActive) return;
  const p = this.player;
  const style = WB.styles[this.warriorStyle];
  const stage = this.warriorTriDashStage;
  const fromX = this.warriorDashFromX;
  const fromY = this.warriorDashFromY;
  let angle = Math.atan2(p.dy, p.dx);
  if (fromX !== null && fromY !== null) {
    const dx = p.x - fromX;
    const dy = p.y - fromY;
    if (Math.hypot(dx, dy) > 0.5) angle = Math.atan2(dy, dx);
  }
  // 持跃击时三段组成改为：扇斩 → 旋斩 → 跃击。
  // 因此第 2 段在没有跃击时仍是扇斩，持跃击时提前变成旋斩。
  const leapOwned = (p.upCounts["跃击"] || 0) > 0;
  const spin = stage === 2 || (stage === 1 && leapOwned);
  this.meleeSwing({
    angle,
    spread: spin ? Math.PI * 2 : style.spread,
    radius: p.attackRange,
    dmg:
      p.damage *
      (stage === 0
        ? WB.triDash.dmgMul1
        : spin
          ? WB.triDash.dmgMul3
          : WB.triDash.dmgMul2),
    knock: style.knock * KNOCK_DAMP,
    color: style.color,
    particleColor: style.particle,
    weapon: "greatsword",
    ...(spin ? { spin: true } : {}),
    ...(this.warriorStyle === "greatsword" ? { dashSlash: true } : {}),
    shake: spin ? 3 : 2,
  });
  advanceWarriorTriDash.call(this);
}

/** 斩浪：冲刺路径上每个敌人各吃一次 100% 伤害，不叠流、不触发重斩。 */
export function warriorDashDamage(
  this: GameCore,
  fromX: number,
  fromY: number,
): void {
  const p = this.player;
  if (this.prof !== "warrior" || (p.upCounts["斩浪"] || 0) === 0) return;
  const style = WB.styles[this.warriorStyle];
  const dmg = p.damage * WB.dashDamageMul;
  for (const e of this.enemies) {
    if (e.dead) continue;
    if (pointSegmentDistance(e.x, e.y, fromX, fromY, p.x, p.y) > 12 + e.r)
      continue;
    this.hurtEnemy(e, dmg, 0, 0, {
      src: "melee",
      type: "physical",
      form: "melee",
    });
  }
  this.warriorQi.push({
    x1: fromX,
    y1: fromY,
    x2: p.x,
    y2: p.y,
    t: 0.42,
    max: 0.42,
    c: style.trail,
    kind: "dash",
  });
  // 路径火花：沿冲刺方向两侧交替甩出，强化「这一刀划过去」的体感。
  const dx = p.x - fromX;
  const dy = p.y - fromY;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;
  for (let i = 0; i < 12; i++) {
    const k = (i + 1) / 13;
    const side = i % 2 === 0 ? 1 : -1;
    const speed = 30 + (i % 3) * 18;
    this.parts.push({
      x: fromX + dx * k,
      y: fromY + dy * k,
      vx: nx * side * speed,
      vy: ny * side * speed,
      life: 0.22 + (i % 4) * 0.04,
      c: i % 3 === 0 ? "#ffffff" : style.particle,
    });
  }
}

/**
 * 连闪·破空：冲刺穿过敌人时减速并返还冷却；无论是否命中都开启 2 秒锐势窗口。
 * 不造成伤害——路径伤害仍归「斩浪」，两者可以同时持有。
 */
export function warriorLianShanDash(
  this: GameCore,
  fromX: number,
  fromY: number,
): void {
  const p = this.player;
  if (this.prof !== "warrior" || (p.upCounts["连闪"] || 0) === 0) return;
  if (this.warriorStyle === "greatsword") {
    // 大剑特化：把太刀的锐势暴击窗口换成「下一刀视为重斩」。
    this.warriorHeavyReadyT = WB.lianShan.critWindow;
  } else {
    this.warriorLianShanT = WB.lianShan.critWindow;
  }
  let hits = 0;
  for (const e of this.enemies) {
    if (e.dead) continue;
    if (pointSegmentDistance(e.x, e.y, fromX, fromY, p.x, p.y) > 12 + e.r)
      continue;
    e.slowT = WB.lianShan.slowT;
    e.slowF = WB.lianShan.slowF;
    hits++;
  }
  if (!hits) return;
  const refund = Math.min(
    WB.lianShan.refundCap,
    hits * WB.lianShan.refundPerHit,
  );
  if (p.dashRe > 0)
    p.dashRe = Math.max(0, p.dashRe - p.dashMax * refund);
}

/**
 * 战士自动挥砍 + 流/重斩/共享卡核心链。
 *
 * 由 AttackSystem 每帧调用（与射手共用 p.fireCd）。扇形命中走 `meleeSwing`，
 * 所有伤害都是 `form: "melee"`。
 */
export function updateWarriorCombat(this: GameCore, dt: number) {
  if (this.prof !== "warrior") return;
  const p = this.player;

  // 剑气/地裂表现层衰减
  for (let i = this.warriorQi.length - 1; i >= 0; i--) {
    this.warriorQi[i].t -= dt;
    if (this.warriorQi[i].t <= 0) this.warriorQi.splice(i, 1);
  }
  // 剑气/裂地波面：先于跃击早退推进，飞行与命中不受当前动作阻塞。
  updateWarriorWaves.call(this, dt);
  if (this.warriorResolveT > 0)
    this.warriorResolveT = Math.max(0, this.warriorResolveT - dt);
  if (this.warriorLeapHasteT > 0)
    this.warriorLeapHasteT = Math.max(0, this.warriorLeapHasteT - dt);
  if (this.warriorIaiHasteT > 0)
    this.warriorIaiHasteT = Math.max(0, this.warriorIaiHasteT - dt);
  if (this.warriorLianShanT > 0)
    this.warriorLianShanT = Math.max(0, this.warriorLianShanT - dt);
  if (this.warriorHeavyReadyT > 0)
    this.warriorHeavyReadyT = Math.max(0, this.warriorHeavyReadyT - dt);
  if (this.warriorLeapInvulnT > 0)
    this.warriorLeapInvulnT = Math.max(0, this.warriorLeapInvulnT - dt);

  // 流计时：断档清空
  if (this.warriorFlowT > 0) {
    this.warriorFlowT = Math.max(0, this.warriorFlowT - dt);
    if (this.warriorFlowT === 0) this.warriorFlowStacks = 0;
  }

  // 残心·残影追击：延迟 0.25s 的第二刀；不叠流、不触发重斩/连斩。
  for (let i = this.warriorEchoes.length - 1; i >= 0; i--) {
    const echo = this.warriorEchoes[i];
    echo.t -= dt;
    if (echo.t > 0) continue;
    this.warriorEchoes.splice(i, 1);
    this.meleeSwing({
      angle: echo.angle,
      spread: echo.spread,
      radius: echo.radius,
      dmg: echo.dmg,
      color: "#a8f0ff",
      particleColor: "#e8ffff",
      weapon: "katana",
      preciseSector: true,
      life: 0.12,
      shake: 1,
      ...(echo.spin ? { spin: true } : {}),
    });
  }

  const leap = this.warriorLeapState;
  if (leap) {
    if (leap.elapsed >= WB.leapWindup + WB.leapFall)
      landWarriorLeap(this, leap);
    return;
  }
  if (p.fireCd > 0) return;

  const style = WB.styles[this.warriorStyle];
  const target = this.nearestEnemy(p.x, p.y, p.attackRange);
  if (!target) {
    p.fireCd = 0.06;
    return;
  }
  const angle = Math.atan2(target.y - p.y, target.x - p.x);
  // 重斩是大剑流派的核心机制；太刀只走流，不出重斩。
  // 大剑版连闪：冲刺后的下一刀也按重斩结算，但不推进自然重斩计数。
  const naturalHeavy =
    this.warriorStyle === "greatsword" &&
    (this.warriorSwingCount + 1) % WB.heavyEvery === 0;
  const dashHeavy =
    this.warriorStyle === "greatsword" && this.warriorHeavyReadyT > 0;
  const heavy = naturalHeavy || dashHeavy;
  if (!dashHeavy)
    this.warriorSwingCount = (this.warriorSwingCount + 1) % WB.heavyEvery;
  if (dashHeavy) this.warriorHeavyReadyT = 0;

  // 破围：以玩家为圆心、攻击距离+e.r 内同时有 ≥3 敌（不看朝向，不是身体接触）。
  let breakout = false;
  if ((p.upCounts["破围"] || 0) > 0) {
    let nearby = 0;
    for (const e of this.enemies) {
      if (e.dead) continue;
      if (Math.hypot(e.x - p.x, e.y - p.y) <= p.attackRange + e.r)
        nearby++;
    }
    breakout = nearby >= WB.breakoutCount;
  }

  const resolveReady = this.warriorResolveT > 0;
  // 居合核心：势满时这一刀必为 360° 旋斩；迅/极只做可选增幅。
  const iai = iaiReady(this);
  const greatIai = iai !== null && (p.upCounts["居合·极"] || 0) > 0;
  const iaiMul = iai ? 1 + WB.iai.perStack * iai.cap : 1;
  const iaiKnock = iai
    ? greatIai
      ? WB.iai.upgradeKnockMul
      : WB.iai.spinKnockMul
    : 1;
  const flowConsume =
    iai !== null &&
    (p.upCounts["流·极"] || 0) > 0 &&
    this.warriorFlowStacks >= WB.flow.cap3;
  const flowIai = iai ? flowIaiMul(this) : 1;
  const consumeMul = flowConsume ? 1 + WB.flow.iaiConsumeBonus : 1;
  // #178：基准伤害统一走 warriorSwingDamage（面板显示同一个函数），
  // 条件倍率在外层相乘，避免「面板值」与「实战值」两处公式各自漂移。
  const dmg =
    warriorSwingDamage(this) *
    (heavy ? WB.heavyDamageMul : 1) *
    (breakout ? WB.breakoutDamageMul : 1) *
    iaiMul *
    flowIai *
    consumeMul;
  const radius =
    p.attackRange *
    (heavy ? WB.heavyRangeMul : 1) *
    (greatIai ? WB.iai.upgradeRangeMul : 1);
  const knock =
    style.knock *
    (heavy ? WB.heavyKnockMul : 1) *
    (breakout ? WB.breakoutKnockMul : 1) *
    iaiKnock;
  // 居合为全向；重斩保留前方扇形 + 范围 +50%。
  const spread = iai ? Math.PI * 2 : style.spread;

  const swing: WarriorSwingSnapshot = {
    angle, spread, radius, dmg, knock: knock * KNOCK_DAMP,
    heavy, resolveReady, iai, greatIai, flowConsume,
  };
  resolveWarriorSwing.call(this, swing);
}

/** Shared actual-hit settlement, used immediately by normal swings and once at
 * combo landing. Heavy talents, chain procs and cooldown keep one owner. */
function resolveWarriorSwing(
  this: GameCore,
  swing: WarriorSwingSnapshot,
  elapsed = 0,
  impact = false,
) {
  const p = this.player;
  const style = WB.styles[this.warriorStyle];
  const { angle, spread, radius, dmg, knock, heavy, resolveReady, iai, greatIai, flowConsume } = swing;

  const hits = this.meleeSwing({
    angle,
    spread,
    radius,
    dmg,
    knock,
    color: iai ? "#a8f0ff" : heavy ? "#ffd24a" : style.color,
    particleColor: iai ? "#e8ffff" : heavy ? "#ffe8a3" : style.particle,
    weapon: this.warriorStyle,
    preciseSector: this.warriorStyle === "katana",
    ...(heavy ? { heavy: true } : {}),
    ...(impact ? { impact: true, life: WB.leapImpactLife } : {}),
    ...(this.warriorStyle === "katana" ? { life: 0.167 } : {}),
    shake: iai ? 5 : heavy ? 3 : 2,
    ...(iai ? { iaiHit: true } : {}),
    ...(iai ? { spin: true } : {}),
  });
  if (resolveReady && hits.length) {
    this.warriorEchoes.push({
      t: WB.resolveEchoDelay,
      angle,
      spread,
      radius,
      dmg: dmg * WB.resolveEchoMul,
      spin: iai !== null,
    });
    this.warriorResolveT = 0;
  }

  // 居合斩结算：势清零、补流层、可选增幅与锐势窗口。
  // 空挥也清零——势只会在「真的挥出一刀」时消耗，玩家不能靠空挥存着。
  if (iai) {
    this.warriorIaiStacks = 0;
    this.warriorIaiDist = 0;
    if (hits.length) {
      if (greatIai) {
        for (const e of hits) {
          e.armorBreakT = WB.iai.upgradeArmorBreakT;
          e.armorBreakPct = WB.iai.upgradeArmorBreakPct;
        }
      }
      if (flowConsume) {
        this.warriorFlowStacks = Math.max(
          0,
          this.warriorFlowStacks - WB.flow.iaiConsumeStacks,
        );
        p.hp = Math.min(p.maxhp, p.hp + p.maxhp * WB.flow.iaiConsumeHeal);
        this.warriorFlowT = flowDuration(this);
      }
      if (flowOwned(this)) {
        const cap = warriorFlowCap(this);
        this.warriorFlowStacks = Math.min(
          cap,
          this.warriorFlowStacks + WB.iai.flowGain,
        );
        this.warriorFlowT = flowDuration(this);
      }
      this.warriorIaiHasteT = WB.iai.hasteWindow;
    }
  }

  if (heavy && hits.length) {
    this.tutorialHeavyDone = true;
    // 破甲：重斩命中后护甲 −40%，持续 4 秒
    if ((p.upCounts["破甲"] || 0) > 0) {
      for (const e of hits) {
        e.armorBreakT = WB.heavyArmorBreakT;
        e.armorBreakPct = WB.heavyArmorBreakPct;
      }
    }
    // 剑气/裂地：重斩命中当步生成脱离角色的移动波面。
    spawnWarriorHeavyWaves.call(this, angle);
  }

  // 流：命中叠层；只增幅居合，不再触发独立 3 秒爆发。
  if (flowOwned(this) && hits.length) {
    const cap = warriorFlowCap(this);
    this.warriorFlowStacks = Math.min(cap, this.warriorFlowStacks + 1);
    this.warriorFlowT = flowDuration(this);
  }

  // 连斩：每次挥砍只要至少命中 1 个敌人，30% 重置间隔并回 3% 生命。
  // #179：单次链式最多连 lianZhanMaxChain 次（用户裁决 3）。达到上限后必须
  // 走完一次正常间隔（即下一次挥砍没触发连斩）才归零，节奏因此可预期。
  let resetCd = false;
  if (
    (p.upCounts["连斩"] || 0) > 0 &&
    hits.length &&
    this.warriorChainCount < WB.lianZhanMaxChain &&
    Math.random() < WB.lianZhanChance
  ) {
    const heal = p.maxhp * WB.lianZhanHeal;
    p.hp = Math.min(p.maxhp, p.hp + heal);
    this.warriorChainCount++;
    resetCd = true;
  } else {
    // 没触发（含达到上限、未命中、未学卡）：链结束，重新计数
    this.warriorChainCount = 0;
  }

  if (
    this.tutorialMode &&
    this.tutorialProf === "warrior" &&
    this.tutorialStep === 3 &&
    hits.length >= 2
  )
    this.tutorialProfDone = true;

  const flowSpeed =
    (p.upCounts["流·续"] || 0) > 0
      ? 1 + WB.flow.atkSpeedPerStack * this.warriorFlowStacks
      : 1;
  // 攻速加成：强袭（跃击落地）与居合命中后的攻速窗口各自独立相乘
  const haste =
    (this.warriorLeapHasteT > 0 ? 1 + WB.leapHasteMul : 1) *
    (this.warriorIaiHasteT > 0 ? 1 + WB.iai.hasteMul : 1);
  p.fireCd = resetCd
    ? 0
    : Math.max(0, (1 / (p.fireRate * flowSpeed * haste)) *
      (heavy ? WB.heavyIntervalMul : 1) - elapsed);
}
