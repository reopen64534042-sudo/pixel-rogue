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
  mageCircleWidthMul,
  mageCurrentElement,
  mageDirectDamageMul,
  gainStaffXp,
  magePrismTier,
} from "./MageProgressionSystem";
import {
  applyElementalBodyHit,
  applyElementalBurst,
  mageReactionAvailableForHit,
} from "./ElementSystem";
import type { GameCore } from "./GameCore";
import type { Enemy, MageCastPhase } from "./types";

/**
 * 元素法师施法系统。
 *
 * 门控仍是**时间**：熬过前摇与施法间隔，被打断则这一发作废。
 * v2 起，成功命中还会：
 * - 推进元素轮盘（每 3 次成功施法切换）；
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

/** 有效前摇时长（速咏 −30%，施法速度同比缩放）。 */
export function mageWindup(core: GameCore): number {
  const mul =
    (core.player.upCounts["速咏"] || 0) > 0 ? MB.quickCastWindupMul : 1;
  return (MB.castWindup * mul) / castRate(core);
}

/** 有效施法间隔（连咏 −20%，施法速度同比缩放）。 */
export function mageInterval(core: GameCore): number {
  const mul =
    (core.player.upCounts["连咏"] || 0) > 0
      ? MB.continuousCastIntervalMul
      : 1;
  return (MB.castInterval * mul) / castRate(core);
}

/** 法阵半径：属性范围、广域符印 +20%、法阵扩幅 +8%。 */
export function mageCircleRadius(core: GameCore): number {
  const p = core.player;
  let r = MB.circleRadius * p.area * mageCircleWidthMul(core);
  if ((p.upCounts["广域符印"] || 0) > 0) r *= MB.wideSealAreaMul;
  return r;
}

/** 元素伤害基准（不含元素自身倍率）；原站定 1.5× 已折入基准。 */
function mageElementBase(core: GameCore): number {
  return core.player.damage * MB.elementBaseMul;
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
  /** 本体是否至少触发了一条配对反应（用于分影齐射）。 */
  reacted: boolean;
}

function explodeCircle(
  core: GameCore,
  x: number,
  y: number,
  R: number,
  base: number,
  reactionBudget: Set<Enemy>,
): CircleResult {
  const el = mageCurrentElement(core);
  if (!el) return { hits: 0, reacted: false };
  // 直伤另乘 directDamageMul：状态 DoT / 闪电链 / 反应仍用完整元素基准。
  const dmg =
    base *
    MB.directDamageMul *
    mageDirectDamageMul(core) *
    MAGE_ELEMENTS[el].damageMul;
  core.mageVisualEvents.push({
    kind: "body",
    at: core.time,
    element: el,
    x,
    y,
    radius: R,
  });
  let hits = 0;
  let reacted = false;
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
      type: el,
      form: "other",
      // 有会造成伤害的已领悟反应时，直伤最多留 1 HP，让反应完成击杀。
      lethalCap: mageReactionAvailableForHit(core, e, el, reactionBudget),
    });
    if (hit) core.mageDmgBy.body += hit.effectiveHpLoss;
    if (e.dead) continue;
    if (applyElementalBodyHit(core, e, el, base, { reactionBudget }))
      reacted = true;
  }
  if (hits) {
    core.audio.beep(520, 0.1, "sine", 0.05, 180);
    core.shake = Math.min(core.shake + 1.5, 5);
  }
  return { hits, reacted };
}

/** 成功施法后的轮盘推进：每 3 次切换，获得新元素时不重置当前阶段。 */
function advanceWheel(core: GameCore): void {
  core.mageCastsInPhase++;
  if (core.mageCastsInPhase < MAGE_CASTS_PER_ELEMENT) return;
  core.mageCastsInPhase = 0;
  if (core.mageElements.length > 1)
    core.mageWheelIndex =
      (core.mageWheelIndex + 1) % core.mageElements.length;
}

/** 回响法阵：把本次法阵的 37.5% 直伤延迟到 0.3 秒后再结算一次。 */
function queueEcho(
  core: GameCore,
  x: number,
  y: number,
  R: number,
  base: number,
): void {
  const el = mageCurrentElement(core);
  if (!el) return;
  core.mageEchoes.push({
    x,
    y,
    t: ELEMENTAL_MAGE.echo.delay,
    maxT: ELEMENTAL_MAGE.echo.delay,
    R,
    damage:
      base *
      MB.directDamageMul *
      mageDirectDamageMul(core) *
      MAGE_ELEMENTS[el].damageMul *
      ELEMENTAL_MAGE.echo.damageMul,
    element: el,
  });
}

function updateMageEchoes(core: GameCore, dt: number): void {
  for (let i = core.mageEchoes.length - 1; i >= 0; i--) {
    const echo = core.mageEchoes[i];
    echo.t -= dt;
    if (echo.t > 0) continue;
    core.mageEchoes.splice(i, 1);
    core.mageVisualEvents.push({
      kind: "echo",
      at: core.time,
      element: echo.element,
      x: echo.x,
      y: echo.y,
      radius: echo.R,
    });
    for (const e of core.enemies) {
      if (e.dead) continue;
      const dx = e.x - echo.x;
      const dy = e.y - echo.y;
      if (dx * dx + dy * dy > echo.R * echo.R) continue;
      // 回响只结算伤害：不施加状态、不触发反应、不给武器经验。
      const hit = core.hurtEnemy(e, echo.damage, 0, 0, {
        origin: echo,
        noCrit: true,
        noChain: true,
        src: "cast",
        type: echo.element,
        form: "other",
      });
      if (hit) core.mageDmgBy.echo += hit.effectiveHpLoss;
    }
    core.audio.beep(420, 0.08, "sine", 0.03, 120);
  }
}

/** 留下一个元素棱镜（第 3 次成功施法时调用）；记录本次施法元素与档位。 */
function createPrism(core: GameCore, element: MageElement): void {
  const tier = magePrismTier(core);
  if (!tier) return;
  const p = ELEMENTAL_MAGE.prism;
  const epic = tier >= 2;
  core.magePrism = {
    x: core.player.x,
    y: core.player.y,
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
 * 棱镜·终极：碎裂时追加 120% 范围冲击 + 元素震爆。
 *
 * 元素震爆按「记录元素 → 当前元素」配对，对范围内每只敌人结算一次反应伤害，
 * 不消耗标记、不施加控制、不递归。
 */
function shatterPrism(
  core: GameCore,
  prism: { x: number; y: number; element: MageElement },
  current: MageElement,
  base: number,
): void {
  const R = ELEMENTAL_MAGE.prism.ultimateShatterRadius;
  const dmg =
    base * ELEMENTAL_MAGE.prism.ultimateShatterMul * MAGE_ELEMENTS[current].damageMul;
  core.mageVisualEvents.push({
    kind: "burst",
    at: core.time,
    element: current,
    x: prism.x,
    y: prism.y,
    radius: R,
  });
  for (const e of core.enemies) {
    if (e.dead) continue;
    const dx = e.x - prism.x;
    const dy = e.y - prism.y;
    if (dx * dx + dy * dy > R * R) continue;
    const hit = core.hurtEnemy(e, dmg, 0, 0, {
      origin: prism,
      noCrit: true,
      noChain: true,
      noLifesteal: true,
      src: "cast",
      type: current,
      form: "other",
    });
    if (hit) core.mageDmgBy.shatter += hit.effectiveHpLoss;
    if (e.dead) continue;
    // 记录元素作为“标记”、当前元素作为“触发”：A 套装火棱镜 + 当前冰 → 急淬；
    // B 套装火棱镜 + 当前雷 → 超载。顺序与套装定义一致。
    applyElementalBurst(core, e, prism.element, current, base);
  }
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    core.parts.push({
      x: prism.x,
      y: prism.y,
      vx: Math.cos(a) * 120,
      vy: Math.sin(a) * 120,
      life: 0.4,
      c: MAGE_ELEMENTS[current].color,
    });
  }
  core.shake = Math.min(core.shake + 4, 8);
  core.audio.beep(180, 0.2, "sawtooth", 0.07, -80);
}

/**
 * 本体法阵施放时触发棱镜折射。
 *
 * - 普通折射使用**当前法阵元素与当前基准**，与本体共享每怪每发反应预算；
 *   不触发闪电链、不吸血、不给武器经验。
 * - A 套装在棱镜周围分裂到两个目标点；B 套装集中在主落点。
 * - 史诗棱镜可折射 2 发后碎裂；稀有 1 发。
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
  const refractedBase = base * share;
  const dmg =
    base *
    MB.directDamageMul *
    mageDirectDamageMul(core) *
    MAGE_ELEMENTS[element].damageMul *
    share;
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
        type: element,
        form: "other",
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
  if (prism.charges <= 0) {
    if (hasMageUpgrade(core, "prismUltimate"))
      shatterPrism(core, prism, element, base);
    core.magePrism = null;
  }
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
 * 分影齐射：本体触发反应后，左右残影各释放一次 55% 法阵。
 *
 * - 使用轮盘中除当前元素外的另外两种元素；
 * - 只施加 60% 持续时间的元素状态，不触发配对反应/闪电链、不给武器经验/吸血；
 * - A 套装打不同目标点，B 套装集火主落点；6 秒冷却。
 */
function triggerSplitShadows(
  core: GameCore,
  current: MageElement,
  base: number,
  R: number,
): void {
  if (!hasMageUpgrade(core, "splitShadow") || core.mageShadowCd > 0) return;
  const others = core.mageElements.filter((el) => el !== current);
  if (!others.length) return;
  core.mageShadowCd = ELEMENTAL_MAGE.shadow.cooldown;
  const points = splitShadowTargets(core);
  const p = ELEMENTAL_MAGE.shadow;
  for (let i = 0; i < 2; i++) {
    const element = others[i % others.length];
    const point = points[i];
    core.mageShadows.push({
      side: i === 0 ? -1 : 1,
      t: p.lifetime,
      maxT: p.lifetime,
      element,
    });
    core.mageVisualEvents.push({
      kind: "shadow",
      at: core.time,
      element,
      x: point.x,
      y: point.y,
      radius: R,
    });
    const dmg =
      base *
      MB.directDamageMul *
      mageDirectDamageMul(core) *
      MAGE_ELEMENTS[element].damageMul *
      p.damageMul;
    for (const e of core.enemies) {
      if (e.dead) continue;
      const dx = e.x - point.x;
      const dy = e.y - point.y;
      if (dx * dx + dy * dy > R * R) continue;
      const hit = core.hurtEnemy(e, dmg, 0, 0, {
        origin: point,
        noCrit: true,
        noChain: true,
        noLifesteal: true,
        src: "cast",
        type: element,
        form: "other",
      });
      if (hit) core.mageDmgBy.shadow += hit.effectiveHpLoss;
      if (e.dead) continue;
      applyElementalBodyHit(core, e, element, base, {
        allowChain: false,
        allowReaction: false,
        noLifesteal: true,
        statusDurationMul: p.statusDurationMul,
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
 * 一次施法结算：法阵爆裂 → 回响/棱镜 → 轮盘/法杖经验/充能。
 *
 * 充能条只服务保留旧卡「护咒壁」；元素系统本身不依赖充能。
 */
function detonate(core: GameCore) {
  const p = core.player;
  const el = mageCurrentElement(core);
  if (!el) return;
  const base = mageElementBase(core);
  const R = mageCircleRadius(core);
  const reactionBudget = new Set<Enemy>();
  const body = explodeCircle(
    core,
    core.castX,
    core.castY,
    R,
    base,
    reactionBudget,
  );
  if (hasMageUpgrade(core, "echoCircle"))
    queueEcho(core, core.castX, core.castY, R, base);
  const prismHits = refractPrism(core, el, base, R, reactionBudget);
  // 分影在棱镜折射之后触发：残影状态不会反过来喂给同一次施法的棱镜反应。
  if (body.reacted) triggerSplitShadows(core, el, base, R);
  const hits = body.hits + prismHits;
  if (core.tutorialMode && core.tutorialProf === "mage" && hits >= 2)
    core.tutorialProfDone = true;
  if (hits <= 0) return;

  // 护咒壁：满充能的那一次成功施法获得护盾（不可叠层 → 覆盖）。
  const isCharge = core.mageCharge + 1 >= MB.chargeFull;
  if (isCharge) {
    core.mageChargeFlashT = MB.chargeFlash;
    if ((p.upCounts["护咒壁"] || 0) > 0)
      grantMageShield(
        core,
        p.maxhp * MB.wardShieldPct,
        MB.wardShieldDuration,
      );
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
 * 相位：受击时传送到附近没有敌人的位置。
 *
 * @returns true = 已传送，**本次伤害被完全规避**；
 *          false = 找不到落点（改为给 0.5 秒无敌，本次伤害照常结算）
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
  return false;
}

/**
 * 镜像：在受击位置留下残影吸引仇恨，自身进入 1 秒虚影。
 * 残影是限时仇恨源，不因接触而破碎。
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
  if (this.mageShadowCd > 0) this.mageShadowCd -= dt;
  for (let i = this.mageShadows.length - 1; i >= 0; i--) {
    const shadow = this.mageShadows[i];
    shadow.t -= dt;
    if (shadow.t <= 0) this.mageShadows.splice(i, 1);
  }
  updateMageEchoes(this, dt);
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
  // 还没有元素（开局选择面板期间）时不施法。元素待选（Lv3/6）时
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
