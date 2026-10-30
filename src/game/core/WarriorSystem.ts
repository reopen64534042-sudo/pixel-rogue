import { WARRIOR_BALANCE as WB } from "../data/warriorBalance";
import { WORLD, clamp } from "../data/constants";
import { KNOCK, KNOCK_DAMP } from "../data/knockback";
import type { GameCore } from "./GameCore";
import type { Enemy } from "./types";

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

function flowDamageMul(core: GameCore): number {
  return flowOwned(core)
    ? 1 + WB.flow.dmgPerStack * core.warriorFlowStacks
    : 1;
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

/** 跃击：消耗冲刺充能、跳到目标敌群并落地 AOE；返回 false = 退回普通冲刺。 */
export function warriorLeap(this: GameCore): boolean {
  const p = this.player;
  if (this.prof !== "warrior" || (p.upCounts["跃击"] || 0) === 0) return false;
  const target = findLeapTarget(this);
  if (!target) return false;
  const style = WB.styles[this.warriorStyle];
  const dchMax = 1 + p.dashChargeLv;
  p.dashCharges = Math.max(0, p.dashCharges - 1);
  if (p.dashCharges < dchMax && p.dashRe <= 0)
    p.dashRe = p.dashMax + WB.leapRechargeExtra;
  p.x = clamp(target.x, 24, WORLD.w - 24);
  p.y = clamp(target.y, 24, WORLD.h - 24);
  if (this.tutorialMode) this.tutorialDashed = true;
  if ((p.upCounts["强袭"] || 0) > 0)
    this.warriorLeapHasteT = WB.leapHasteWindow;
  this.meleeSwing({
    spread: Math.PI * 2,
    radius: p.attackRange * 1.2,
    dmg: p.damage * WB.leapDamageMul,
    knock: KNOCK.warrior.leap * KNOCK_DAMP,
    color: style.color,
    particleColor: style.particle,
    weapon: this.warriorStyle,
    shake: 4,
  });
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    this.parts.push({
      x: p.x,
      y: p.y,
      vx: Math.cos(a) * 80,
      vy: Math.sin(a) * 80,
      life: 0.25,
      c: style.particle,
    });
  }
  this.audio.beep(220, 0.12, "square", 0.05, -120);
  return true;
}

/** 疾冲：冲刺路径上每个敌人各吃一次 80% 伤害，不叠流、不触发重斩。 */
export function warriorDashDamage(
  this: GameCore,
  fromX: number,
  fromY: number,
): void {
  const p = this.player;
  if (this.prof !== "warrior" || (p.upCounts["疾冲"] || 0) === 0) return;
  const style = WB.styles[this.warriorStyle];
  const dmg = p.damage * flowDamageMul(this) * WB.dashDamageMul;
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
 * 战士自动挥砍 + 流/重斩/共享卡核心链。
 *
 * 由 AttackSystem 每帧调用（与射手共用 p.fireCd）。扇形命中走 `meleeSwing`，
 * 所有伤害都是 `form: "melee"`。
 */
export function updateWarriorCombat(this: GameCore, dt: number) {
  if (this.prof !== "warrior") return;
  const p = this.player;

  // 剑气表现层衰减
  for (let i = this.warriorQi.length - 1; i >= 0; i--) {
    this.warriorQi[i].t -= dt;
    if (this.warriorQi[i].t <= 0) this.warriorQi.splice(i, 1);
  }
  if (this.warriorResolveT > 0)
    this.warriorResolveT = Math.max(0, this.warriorResolveT - dt);
  if (this.warriorLeapHasteT > 0)
    this.warriorLeapHasteT = Math.max(0, this.warriorLeapHasteT - dt);

  // 流计时：爆发期冻结层数与倒计时
  if (this.warriorFlowBurstT > 0) {
    this.warriorFlowBurstT = Math.max(0, this.warriorFlowBurstT - dt);
    if (this.warriorFlowBurstT === 0) this.warriorFlowT = flowDuration(this);
  } else if (this.warriorFlowT > 0) {
    this.warriorFlowT = Math.max(0, this.warriorFlowT - dt);
    if (this.warriorFlowT === 0) this.warriorFlowStacks = 0;
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
  const heavy =
    this.warriorStyle === "greatsword" &&
    (this.warriorSwingCount + 1) % WB.heavyEvery === 0;
  this.warriorSwingCount = (this.warriorSwingCount + 1) % WB.heavyEvery;

  // 破围：近战范围内同时有 ≥3 个敌人时，击退 ×2、伤害 +15%
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

  const resolveMul =
    this.warriorResolveT > 0 ? 1 + WB.resolveDamageMul : 1;
  const dmg =
    p.damage *
    flowDamageMul(this) *
    (heavy ? WB.heavyDamageMul : 1) *
    (breakout ? WB.breakoutDamageMul : 1) *
    resolveMul;
  const radius = p.attackRange * (heavy ? WB.heavyRangeMul : 1);
  const burst = this.warriorFlowBurstT > 0;
  const lifestealMul = burst ? 2 : 1;
  const knock =
    style.knock * (heavy ? WB.heavyKnockMul : 1) * (breakout ? WB.breakoutKnockMul : 1);

  const hits = this.meleeSwing({
    angle,
    spread: style.spread,
    radius,
    dmg,
    knock: knock * KNOCK_DAMP,
    color: heavy ? "#ffd24a" : style.color,
    particleColor: heavy ? "#ffe8a3" : style.particle,
    weapon: this.warriorStyle,
    preciseSector: this.warriorStyle === "katana",
    ...(this.warriorStyle === "katana" ? { life: 0.167 } : {}),
    shake: heavy ? 3 : 2,
    lifestealMul,
  });
  if (this.warriorResolveT > 0) this.warriorResolveT = 0;

  if (heavy && hits.length) {
    this.tutorialHeavyDone = true;
    // 破甲：重斩命中后护甲 −40%，持续 4 秒
    if ((p.upCounts["破甲"] || 0) > 0) {
      for (const e of hits) {
        e.armorBreakT = WB.heavyArmorBreakT;
        e.armorBreakPct = WB.heavyArmorBreakPct;
      }
    }
    // 剑气：重斩命中后向前放出一道直线，80% 伤害 + 强击退
    if ((p.upCounts["剑气"] || 0) > 0) {
      const x1 = p.x;
      const y1 = p.y - 3;
      const x2 = p.x + Math.cos(angle) * WB.swordQiRange;
      const y2 = p.y - 3 + Math.sin(angle) * WB.swordQiRange;
      for (const e of this.enemies) {
        if (e.dead) continue;
        if (
          pointSegmentDistance(e.x, e.y, x1, y1, x2, y2) >
          WB.swordQiWidth + e.r
        )
          continue;
        this.hurtEnemy(
          e,
          dmg * WB.swordQiDamageMul,
          Math.cos(angle) * KNOCK.warrior.qi,
          Math.sin(angle) * KNOCK.warrior.qi,
          {
            src: "melee",
            type: "physical",
            form: "melee",
            lifestealMul,
          },
        );
      }
      this.warriorQi.push({
        x1,
        y1,
        x2,
        y2,
        t: 0.18,
        max: 0.18,
        c: "#ffd24a",
        kind: "qi",
      });
    }
  }

  // 流：每次挥砍命中叠 1 层；L3 满层后下一次命中引爆
  if (flowOwned(this) && hits.length && this.warriorFlowBurstT <= 0) {
    const cap = warriorFlowCap(this);
    if ((p.upCounts["流·极"] || 0) > 0 && this.warriorFlowStacks >= cap) {
      this.warriorFlowBurstT = WB.flow.burstT;
      this.warriorFlowStacks = WB.flow.burstKeep;
    } else {
      this.warriorFlowStacks = Math.min(cap, this.warriorFlowStacks + 1);
      this.warriorFlowT = flowDuration(this);
    }
  }

  // 连斩：每次挥砍只要至少命中 1 个敌人，30% 重置间隔并回 3% 生命
  let resetCd = false;
  if (
    (p.upCounts["连斩"] || 0) > 0 &&
    hits.length &&
    Math.random() < WB.lianZhanChance
  ) {
    const heal = p.maxhp * WB.lianZhanHeal;
    p.hp = Math.min(p.maxhp, p.hp + heal);
    resetCd = true;
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
  const haste =
    this.warriorLeapHasteT > 0 ? 1 + WB.leapHasteMul : 1;
  p.fireCd = resetCd
    ? 0
    : (1 / (p.fireRate * flowSpeed * haste * (burst ? 2 : 1))) *
      (heavy ? WB.heavyIntervalMul : 1);
}
