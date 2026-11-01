import { MAGE_BALANCE as MB } from "../data/mageBalance";
import {
  ELEMENTAL_MAGE,
  MAGE_CASTS_PER_ELEMENT,
  MAGE_ELEMENTS,
} from "../data/elementalMage";
import type { MageElement } from "../data/elementalMage";
import { WORLD, clamp } from "../data/constants";
import {
  hasMageUpgrade,
  mageCastSpeedMul,
  mageCircleRangeMul,
  mageCurrentElement,
  mageBeatKind,
  mageIsGrandmaster,
  mageDirectDamageMul,
  gainStaffXp,
  magePrismTier,
} from "./MageProgressionSystem";
import {
  applyElementalBodyHit,
  mageReactionAvailableForHit,
} from "./ElementSystem";
import type { GameCore } from "./GameCore";
import { PLAYER_ATTACK_PROFILES as PA, withDamageType } from "../data/attackProfiles";
import type { Enemy, MageCastPhase } from "./types";
import { mageElementDamageBase, mageDirectHitDamage, mageRefractedBase, mageBeatDamageMul } from "./DamageMath";

/**
 * 元素法师施法系统。
 *
 * 门控仍是**时间**：熬过前摇与施法间隔，被打断则这一发作废。
 * v2 起，成功命中还会：
 * - 推进元素轮盘（每 4 次成功施法切换）；
 * - 累积法杖经验（Lv1–12，发放元素与能力池）；
 * - 由 ElementSystem 结算当前元素的反应与状态。
 *
 * 运行态全部放在 GameCore（不放 Player）：`recompute` 会用
 * `Object.assign(player, statBase())` 重建 Player，计时类状态会被抹掉。
 */

/** 施法速度倍率：1 = 职业基础速度。 */
function castRate(core: GameCore): number {
  return Math.max(0.05, core.player.fireRate * MB.castCycle * mageCastSpeedMul(core));
}

/** 有效前摇时长（第四拍：每阶段第 4 发 −40%；施法速度同比缩放）。 */
export function mageWindup(core: GameCore): number {
  const fourth =
    core.mageCastsInPhase + 1 >= MAGE_CASTS_PER_ELEMENT &&
    (core.player.upCounts["第四拍"] || 0) > 0;
  return (MB.castWindup * (fourth ? MB.fourthBeatWindupMul : 1)) / castRate(core);
}

/** 有效施法间隔（施法速度同比缩放）。 */
export function mageInterval(core: GameCore): number {
  return MB.castInterval / castRate(core);
}

/** 护咒壁护盾量：最大生命百分比 + 固定值 + 法杖等级成长。 */
export function mageWardShieldAmount(core: GameCore): number {
  return (
    core.player.maxhp * MB.wardShieldPct +
    MB.wardShieldFlat +
    MB.wardShieldPerStaffLevel * core.mageStaffLevel
  );
}

/** 法阵半径：属性范围 × 咏唱调律范围。 */
export function mageCircleRadius(core: GameCore): number {
  const p = core.player;
  return MB.circleRadius * p.area * mageCircleRangeMul(core);
}

/** 元素伤害基准（不含元素自身倍率与 4 拍倍率）。 */
function mageElementBase(core: GameCore): number {
  return mageElementDamageBase(core.player.damage);
}

/**
 * 落点目标：射程内**最近**的可见敌人。
 *
 * 试玩反馈：旧「最密集处」会在近处单敌与远处小群之间选择远处，
 * 玩家看到的是「法师不打贴脸的怪」。改为最近目标后，法阵仍以落点为圆心
 * 覆盖周围敌人；点杀优先级可预测，群怪收益由半径自然提供。
 */
function findNearest(core: GameCore, range: number): Enemy | null {
  const p = core.player;
  let best: Enemy | null = null;
  let bestD = range;
  for (const e of core.enemies) {
    if (e.dead || e.burrowState !== undefined) continue;
    const d = Math.hypot(e.x - p.x, e.y - p.y);
    if (d <= bestD) {
      bestD = d;
      best = e;
    }
  }
  return best;
}

/** 落点：目标位置 + 真实速度 × 前摇时长。 */
function resolveCastPoint(
  core: GameCore,
  target: Enemy,
): { x: number; y: number } {
  const lead = mageWindup(core);
  return {
    x: clamp(target.x + (target.vx ?? 0) * lead, 16, WORLD.w - 16),
    y: clamp(target.y + (target.vy ?? 0) * lead, 16, WORLD.h - 16),
  };
}

/** 法阵爆裂：范围内全体直伤，再逐个结算反应/状态。 */
interface CircleResult {
  hits: number;
}

function explodeCircle(
  core: GameCore,
  x: number,
  y: number,
  R: number,
  base: number,
  reactionBudget: Set<Enemy>,
  directMul = 1,
): CircleResult {
  const el = mageCurrentElement(core);
  if (!el) return { hits: 0 };
  // 直伤另乘 directDamageMul：状态 DoT / 闪电链 / 反应仍用完整元素基准。
  const dmg = mageDirectHitDamage(base, mageDirectDamageMul(core), el, directMul);
  core.mageVisualEvents.push({
    kind: "body",
    at: core.time,
    element: el,
    x,
    y,
    radius: R,
  });
  let hits = 0;
  for (const e of core.enemies) {
    if (e.dead) continue;
    const dx = e.x - x;
    const dy = e.y - y;
    if (dx * dx + dy * dy > R * R) continue;
    hits++;
    const hit = core.hurtEnemy(e, dmg, 0, 0, {
      origin: { x, y },
      noChain: true,
      src: "cast",
      ...withDamageType(PA.mageBody, el),
      // 有会造成伤害的已领悟反应时，直伤最多留 1 HP，让反应完成击杀。
      lethalCap: mageReactionAvailableForHit(core, e, el, reactionBudget),
    });
    if (hit) core.mageDmgBy.body += hit.effectiveHpLoss;
    if (e.dead) continue;
    applyElementalBodyHit(core, e, el, base, { reactionBudget });
  }
  if (hits) {
    core.audio.beep(520, 0.1, "sine", 0.05, 180);
    core.shake = Math.min(core.shake + 1.5, 5);
  }
  return { hits };
}

/** 成功施法后的轮盘推进：每 4 次切换；大法师改为 4 拍循环，不推进元素轮盘。 */
function advanceWheel(core: GameCore): void {
  core.mageCastsInPhase++;
  if (core.mageCastsInPhase < MAGE_CASTS_PER_ELEMENT) return;
  core.mageCastsInPhase = 0;
  if (mageIsGrandmaster(core)) return;
  if (core.mageElements.length > 1)
    core.mageWheelIndex =
      (core.mageWheelIndex + 1) % core.mageElements.length;
}

/** 留下一个元素棱镜（第 4 次成功施法时调用）；记录本次施法元素与档位。 */
function createPrism(core: GameCore, element: MageElement): void {
  const tier = magePrismTier(core);
  if (!tier) return;
  const p = ELEMENTAL_MAGE.prism;
  const epic = tier >= 2;
  core.magePrism = {
    // 棱镜生成在本次法阵的落点，而不是角色脚下。
    x: core.castX,
    y: core.castY,
    t: p.life,
    maxT: p.life,
    element,
    charges: epic ? p.epicCharges : p.rareCharges,
    budget: epic ? p.epicBudget : p.rareBudget,
  };
}

/** A 套装：在棱镜周围找两个彼此分开的目标点；B 套装集中在主落点。 */
function prismTargets(
  core: GameCore,
  prism: { x: number; y: number },
): { x: number; y: number }[] {
  const p = ELEMENTAL_MAGE.prism;
  const near = core.enemies
    .filter(
      (e) =>
        !e.dead &&
        e.burrowState === undefined &&
        Math.hypot(e.x - prism.x, e.y - prism.y) <= p.searchRange,
    )
    .sort(
      (a, b) =>
        Math.hypot(a.x - prism.x, a.y - prism.y) -
        Math.hypot(b.x - prism.x, b.y - prism.y),
    );
  if (!near.length) return [];
  const first = near[0];
  const second =
    near.find(
      (e) => Math.hypot(e.x - first.x, e.y - first.y) >= p.minSep,
    ) ?? null;
  return second
    ? [
        { x: first.x, y: first.y },
        { x: second.x, y: second.y },
      ]
    : [{ x: first.x, y: first.y }];
}

/**
 * 本体法阵施放时触发棱镜折射。
 *
 * - 普通折射使用**当前法阵元素与当前基准**，与本体共享每怪每发反应预算；
 *   不触发闪电链、不吸血、不给武器经验。
 * - A 套装在棱镜周围分裂到两个目标点；B 套装集中在主落点。
 * - 基础/史诗棱镜均为 2 发；预算 60%/80%，耗尽后消失。
 *
 * @returns 折射命中的敌人数（算作本体本次施法的一部分）。
 */
function refractPrism(
  core: GameCore,
  element: MageElement,
  base: number,
  R: number,
  reactionBudget: Set<Enemy>,
): number {
  const prism = core.magePrism;
  if (!prism) return 0;
  const points =
    core.mageSuit === "A"
      ? prismTargets(core, prism)
      : [{ x: core.castX, y: core.castY }];
  const targets = points.length
    ? points
    : [{ x: core.castX, y: core.castY }];
  // 纯表现事件：棱镜到各折射落点的光束（A 两条、B 一条），让特化可见。
  core.magePrismBeams.push({
    x: prism.x,
    y: prism.y,
    points: targets.map((point) => ({ x: point.x, y: point.y })),
    element,
    stored: prism.element,
    t: 0.3,
    maxT: 0.3,
  });
  const share = prism.budget / targets.length;
  const refractedBase = mageRefractedBase(base, share);
  const dmg = mageDirectHitDamage(base, mageDirectDamageMul(core), element, share);
  for (const point of targets)
    core.mageVisualEvents.push({
      kind: "refract",
      at: core.time,
      element,
      x: point.x,
      y: point.y,
      radius: R,
    });
  let hits = 0;
  for (const point of targets) {
    for (const e of core.enemies) {
      if (e.dead) continue;
      const dx = e.x - point.x;
      const dy = e.y - point.y;
      if (dx * dx + dy * dy > R * R) continue;
      hits++;
      const hit = core.hurtEnemy(e, dmg, 0, 0, {
        origin: point,
        noChain: true,
        noLifesteal: true,
        src: "cast",
        ...withDamageType(PA.mageRefract, element),
        lethalCap: mageReactionAvailableForHit(
          core,
          e,
          element,
          reactionBudget,
        ),
      });
      if (hit) core.mageDmgBy.refract += hit.effectiveHpLoss;
      if (e.dead) continue;
      applyElementalBodyHit(core, e, element, refractedBase, {
        reactionBudget,
        allowChain: false,
        noLifesteal: true,
      });
    }
  }
  if (hits) {
    core.shake = Math.min(core.shake + 2, 6);
    core.audio.beep(760, 0.1, "triangle", 0.05, 240);
  }
  prism.charges--;
  if (prism.charges <= 0) core.magePrism = null;
  return hits;
}

/** A 套装找两个彼此分开的目标点；B 套装两次都打主落点。 */
function splitShadowTargets(core: GameCore): { x: number; y: number }[] {
  const point = { x: core.castX, y: core.castY };
  if (core.mageSuit !== "A") return [point, point];
  const p = ELEMENTAL_MAGE.shadow;
  const near = core.enemies
    .filter(
      (e) =>
        !e.dead &&
        e.burrowState === undefined &&
        Math.hypot(e.x - point.x, e.y - point.y) <= p.searchRange,
    )
    .sort(
      (a, b) =>
        Math.hypot(a.x - point.x, a.y - point.y) -
        Math.hypot(b.x - point.x, b.y - point.y),
    );
  if (!near.length) return [point, point];
  const first = near[0];
  const second =
    near.find(
      (e) => Math.hypot(e.x - first.x, e.y - first.y) >= p.minSep,
    ) ?? first;
  return [
    { x: first.x, y: first.y },
    { x: second.x, y: second.y },
  ];
}

/**
 * 分影 / 双影协奏：按元素第 4 下（进阶为第 2、第 4 下）召唤残影。
 *
 * - 使用轮盘中除当前元素外的另外两种元素；
 * - 不结算直伤，只施加元素附着/触发反应；
 * - 残影拥有独立反应预算并忽略本体 ICD；每怪每拍最多一次，不递归；
 * - 基础：80% 法阵、60% 反应伤害；进阶：100% 法阵、80% 反应伤害。
 */
function triggerSplitShadows(
  core: GameCore,
  current: MageElement,
  base: number,
  R: number,
): void {
  const plus = hasMageUpgrade(core, "splitShadowPlus");
  const basic = hasMageUpgrade(core, "splitShadow");
  if (!basic && !plus) return;
  const phase = core.mageCastsInPhase;
  const shouldTrigger = plus ? phase === 1 || phase === 3 : phase === 3;
  if (!shouldTrigger) return;
  const others = core.mageElements.filter((el) => el !== current);
  if (!others.length) return;
  const p = ELEMENTAL_MAGE.shadow;
  const radius = R * (plus ? p.radiusMulPlus : p.radiusMulBasic);
  const reactionScale = plus ? p.reactionScalePlus : p.reactionScaleBasic;
  const points = splitShadowTargets(core);
  for (let i = 0; i < 2; i++) {
    const element = others[i % others.length];
    const point = points[i];
    if (!plus) {
      core.mageShadows.push({
        side: i === 0 ? -1 : 1,
        t: p.lifetime,
        maxT: p.lifetime,
        element,
      });
    }
    core.mageVisualEvents.push({
      kind: "shadow",
      at: core.time,
      element,
      x: point.x,
      y: point.y,
      radius,
    });
    const budget = new Set<Enemy>();
    for (const e of core.enemies) {
      if (e.dead) continue;
      const dx = e.x - point.x;
      const dy = e.y - point.y;
      if (dx * dx + dy * dy > radius * radius) continue;
      applyElementalBodyHit(core, e, element, base, {
        reactionBudget: budget,
        allowChain: false,
        noLifesteal: true,
        ignoreReactionIcd: true,
        reactionDamageScale: reactionScale,
      });
    }
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      core.parts.push({
        x: point.x,
        y: point.y,
        vx: Math.cos(a) * 70,
        vy: Math.sin(a) * 70,
        life: 0.25,
        c: MAGE_ELEMENTS[element].color,
      });
    }
  }
  core.shake = Math.min(core.shake + 2, 6);
  core.audio.beep(620, 0.1, "triangle", 0.05, 260);
}

/**
 * 一次施法结算：法阵爆裂 → 棱镜/分影 → 轮盘/法杖经验/充能。
 *
 * 充能条只服务保留旧卡「护咒壁」；元素系统本身不依赖充能。
 */
function detonate(core: GameCore) {
  const p = core.player;
  const el = mageCurrentElement(core);
  if (!el) return;
  const base = mageElementBase(core) * mageBeatDamageMul(mageBeatKind(core));
  const R = mageCircleRadius(core);
  const reactionBudget = new Set<Enemy>();
  const directMul =
    (p.upCounts["第四拍"] || 0) > 0 &&
    core.mageCastsInPhase + 1 >= MAGE_CASTS_PER_ELEMENT
      ? MB.fourthBeatDirectMul
      : 1;
  const body = explodeCircle(
    core,
    core.castX,
    core.castY,
    R,
    base,
    reactionBudget,
    directMul,
  );
  const prismHits = refractPrism(core, el, base, R, reactionBudget);
  // 分影按元素第 4 下（进阶第 2/4 下）触发，不再要求本体先触发反应。
  triggerSplitShadows(core, el, base, R);
  const hits = body.hits + prismHits;
  if (core.tutorialMode && core.tutorialProf === "mage" && hits >= 2)
    core.tutorialProfDone = true;
  // 目标已锁定并完成施法即算成功：目标在前摇中被灼烧/DoT 提前击杀导致
  // 本次 0 命中时，仍推进相位、轮盘、棱镜与法杖经验；无目标不会起手。

  // 护咒壁：满充能的那一次成功施法获得护盾（不可叠层 → 覆盖）。
  const isCharge = core.mageCharge + 1 >= MB.chargeFull;
  if (isCharge) {
    core.mageChargeFlashT = MB.chargeFlash;
    if ((p.upCounts["护咒壁"] || 0) > 0)
      grantMageShield(core, mageWardShieldAmount(core), MB.wardShieldDuration);
  }
  core.mageCharge = (core.mageCharge + 1) % MB.chargeFull;
  const phaseComplete =
    core.mageCastsInPhase + 1 >= MAGE_CASTS_PER_ELEMENT;
  advanceWheel(core);
  if (phaseComplete && magePrismTier(core) > 0) createPrism(core, el);
  gainStaffXp(core);
}

/**
 * 授予值型限时护盾（护咒壁）。
 *
 * 与既有护盾（`shield`/`shieldMax`/`shieldCd`：层数制、挡整伤、10s 恢复）
 * 是两套模型，因此用独立字段 `mageShield`/`mageShieldT`。
 */
export function grantMageShield(
  core: GameCore,
  amount: number,
  duration: number,
): void {
  // 护咒壁不可叠层：覆盖而不是相加。
  core.mageShield = Math.max(core.mageShield, amount);
  if (duration >= core.mageShieldT) {
    core.mageShieldT = duration;
    core.mageShieldMaxT = duration;
  }
}

/** 施法被打断（受击或冲刺）。当前处于抬手段时才会被打断。 */
export function interruptMageCast(this: GameCore): boolean {
  const core = this;
  if (core.castPhase !== "windup") return false;
  core.castPhase = "idle";
  core.castCd = MB.castIdleRetry;
  core.addText(core.player.x, core.player.y - 12, "施法被打断", "#ff5b5b");
  return true;
}

/**
 * 相位：受击时传送到附近没有敌人的位置；找不到落点时原地短暂无敌。
 *
 * 两种结果都规避触发本次伤害；当前施法仍按受击打断（由调用方先处理）。
 *
 * @returns true = 已触发相位（传送或原地无敌），本次伤害被规避
 */
export function triggerPhaseEscape(this: GameCore): boolean {
  const core = this;
  const p = core.player;
  if ((p.upCounts["相位"] || 0) <= 0) return false;
  if (core.magePhaseCd > 0) return false;
  core.magePhaseCd = MB.phaseCooldown;
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    const nx = clamp(p.x + Math.cos(a) * MB.phaseRange, 24, WORLD.w - 24);
    const ny = clamp(p.y + Math.sin(a) * MB.phaseRange, 24, WORLD.h - 24);
    const blocked = core.enemies.some(
      (e) => !e.dead && Math.hypot(e.x - nx, e.y - ny) < e.r + 20,
    );
    if (!blocked) {
      p.x = nx;
      p.y = ny;
      core.addText(p.x, p.y - 12, "相位", "#57e6ff");
      core.audio.beep(900, 0.1, "sine", 0.05, 320);
      return true;
    }
  }
  p.hurtCd = Math.max(p.hurtCd, MB.phaseInvuln);
  core.addText(p.x, p.y - 12, "相位失灵", "#ff9a3d");
  return true;
}

/**
 * 镜像：在受击位置留下残影吸引仇恨，自身进入 1 秒虚影。
 *
 * 触发本次伤害由调用方规避；残影是限时仇恨源，不因接触而破碎。
 */
export function triggerMirrorDecoy(this: GameCore): boolean {
  const core = this;
  const p = core.player;
  if ((p.upCounts["镜像"] || 0) <= 0) return false;
  if (core.mageMirrorCd > 0) return false;
  core.mageMirrorCd = MB.mirrorCooldown;
  core.mageDecoys.push({
    x: p.x,
    y: p.y,
    t: MB.mirrorDecoyDuration,
  });
  core.magePhaseT = MB.mirrorDuration;
  core.addText(p.x, p.y - 12, "镜像", "#c07bff");
  core.audio.beep(660, 0.12, "triangle", 0.05, 240);
  return true;
}

/**
 * 法师每帧更新：护盾计时、冷却、施法状态机。
 * 只在 `prof === "mage"` 时才做事——射手路径完全不受影响。
 */
export function updateMageCasting(this: GameCore, dt: number) {
  const p = this.player;
  if (this.prof !== "mage" || this.mageWeapon === "domain") return;
  // 值型限时护盾
  if (this.mageShieldT > 0) {
    this.mageShieldT -= dt;
    if (this.mageShieldT <= 0) {
      this.mageShieldT = 0;
      this.mageShield = 0;
      this.mageShieldMaxT = 0;
    }
  }
  if (this.mageChargeFlashT > 0) this.mageChargeFlashT -= dt;
  if (this.magePhaseCd > 0) this.magePhaseCd -= dt;
  if (this.mageMirrorCd > 0) this.mageMirrorCd -= dt;
  if (this.magePhaseT > 0) this.magePhaseT -= dt;
  if (this.magePrism) {
    this.magePrism.t -= dt;
    if (this.magePrism.t <= 0) this.magePrism = null;
  }
  for (let i = this.magePrismBeams.length - 1; i >= 0; i--) {
    const beam = this.magePrismBeams[i];
    beam.t -= dt;
    if (beam.t <= 0) this.magePrismBeams.splice(i, 1);
  }
  for (let i = this.mageShadows.length - 1; i >= 0; i--) {
    const shadow = this.mageShadows[i];
    shadow.t -= dt;
    if (shadow.t <= 0) this.mageShadows.splice(i, 1);
  }
  for (let i = this.mageDecoys.length - 1; i >= 0; i--) {
    const d = this.mageDecoys[i];
    d.t -= dt;
    if (d.t <= 0) this.mageDecoys.splice(i, 1);
  }
  // 虚影期间不能施法
  if (this.magePhaseT > 0) {
    this.castPhase = "idle";
    return;
  }
  // 还没有元素（开局选择面板期间）时不施法。元素待选（Lv4/7）时
  // 仍可用现有元素继续作战，选择留到休整面板。
  if (!this.mageElements.length) {
    this.castPhase = "idle";
    return;
  }
  switch (this.castPhase as MageCastPhase) {
    case "idle": {
      this.castCd -= dt;
      if (this.castCd > 0) break;
      const target = findNearest(this, p.attackRange);
      if (!target) {
        this.castCd = MB.castIdleRetry;
        break;
      }
      const point = resolveCastPoint(this, target);
      this.castX = point.x;
      this.castY = point.y;
      this.castPhase = "windup";
      this.castT =
        mageWindup(this) * (MB.castWindupInterruptible / MB.castWindup);
      break;
    }
    case "windup": {
      this.castT -= dt;
      if (this.castT > 0) break;
      this.castPhase = "cast";
      this.castT =
        mageWindup(this) * (1 - MB.castWindupInterruptible / MB.castWindup);
      break;
    }
    case "cast": {
      this.castT -= dt;
      if (this.castT > 0) break;
      this.castPhase = "idle";
      this.castCd = mageInterval(this);
      detonate(this);
      break;
    }
  }
}
