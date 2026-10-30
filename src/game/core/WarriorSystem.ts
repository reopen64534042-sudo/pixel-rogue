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
  this.warriorLianShanT = WB.lianShan.critWindow;
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

  // 剑气表现层衰减
  for (let i = this.warriorQi.length - 1; i >= 0; i--) {
    this.warriorQi[i].t -= dt;
    if (this.warriorQi[i].t <= 0) this.warriorQi.splice(i, 1);
  }
  if (this.warriorResolveT > 0)
    this.warriorResolveT = Math.max(0, this.warriorResolveT - dt);
  if (this.warriorLeapHasteT > 0)
    this.warriorLeapHasteT = Math.max(0, this.warriorLeapHasteT - dt);
  if (this.warriorIaiHasteT > 0)
    this.warriorIaiHasteT = Math.max(0, this.warriorIaiHasteT - dt);
  if (this.warriorLianShanT > 0)
    this.warriorLianShanT = Math.max(0, this.warriorLianShanT - dt);

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
  // 居合核心是全向旋斩；普通挥砍仍是前方扇形。
  const spread = iai ? Math.PI * 2 : style.spread;

  const hits = this.meleeSwing({
    angle,
    spread,
    radius,
    dmg,
    knock: knock * KNOCK_DAMP,
    color: iai ? "#a8f0ff" : heavy ? "#ffd24a" : style.color,
    particleColor: iai ? "#e8ffff" : heavy ? "#ffe8a3" : style.particle,
    weapon: this.warriorStyle,
    preciseSector: this.warriorStyle === "katana",
    ...(heavy ? { heavy: true } : {}),
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
    : (1 / (p.fireRate * flowSpeed * haste)) *
      (heavy ? WB.heavyIntervalMul : 1);
}
