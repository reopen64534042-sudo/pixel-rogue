import { bossDamageTakenMultiplier, bossInvulnerable, syncBossPhase } from "./BossSystem";
import {
  ELEMENTAL_MAGE,
  MAGE_REACTIONS,
  reactionForPair,
} from "../data/elementalMage";
import type { MageElement, MageReactionId } from "../data/elementalMage";
import { MAGE_BALANCE as MB } from "../data/mageBalance";import { DAMAGE_TYPES } from "../data/damageTypes";
import type { DamageTypeId } from "../data/damageTypes";
import { getEnemyCombatStats, getPlayerCombatStats } from "./CombatStats";
import { calculateDamage } from "./DamageSystem";
import { typeBonusMultiplier } from "./DamageMath";
import {
  fireLayers,
  frostLayers,
  isFrozen,
  isFrostLocked,
  isParalyzed,
  isShocked,
  reactionDamageMultiplier,
} from "./ElementMath";
import {
  hasMageUpgrade,
  magePreviousElement,
  mageStatusDurationBonus,
  mageReactionDamageMul,
  mageReactionIcd,
} from "./MageProgressionSystem";
import type { GameCore } from "./GameCore";
import type { Enemy } from "./types";

/**
 * 元素法师 v2 的状态与六反应结算。
 *
 * 施法系统只负责「本体法阵命中」并传入当前元素与元素伤害基准；本模块：
 * 1. 按命中前快照判定**一条**配对反应（每怪每发一次）；
 * 2. 结算反应、再施加本发元素状态；
 * 3. 雷元素命中时判定闪电链。
 *
 * 三条硬约束：
 * - 只有本体法阵调用 `applyElementalBodyHit`；链/反应派生伤害只施加状态或纯伤害，
 *   不递归触发新反应。
 * - 反应只认 `mageReactionIds` 中已领悟的配对；未掌握时即使状态满足也不触发。
 * - DoT 不走 hurtEnemy（round-min-one 会把每帧伤害取整成 1 并刷屏）。
 */

interface StatusSnapshot {
  burn: number;
  frost: number;
  frozen: boolean;
  frostLock: boolean;
  shock: boolean;
}

function snapshot(e: Enemy): StatusSnapshot {
  return {
    burn: fireLayers(e),
    frost: frostLayers(e),
    frozen: isFrozen(e),
    frostLock: isFrostLocked(e),
    shock: isShocked(e),
  };
}

/** 当前元素在本局轮盘上是否会触发某条已领悟反应。 */
function learnedReaction(
  core: GameCore,
  element: MageElement,
): MageReactionId | null {
  const from = magePreviousElement(core);
  if (!from) return null;
  const id = reactionForPair(from, element);
  if (!id || !core.mageReactionIds.includes(id)) return null;
  // 只开放本局套装的三条反应；即使异常状态下学到了别套反应也不触发。
  if (core.mageSuit && MAGE_REACTIONS[id].suit !== core.mageSuit) return null;
  return id;
}

/** 反应是否造成直接伤害（用于直伤击杀保护；超导/霜缚为 false）。 */
function reactionDealsDamage(id: MageReactionId): boolean {
  return (
    id === "quench" ||
    id === "melt" ||
    id === "overload" ||
    id === "blaze"
  );
}

/**
 * 法阵直伤结算前查询：目标是否满足一个**会造成伤害**的已领悟反应。
 *
 * 供 MageSystem 把直伤压到 1 HP，让随后结算的反应完成击杀；
 * 超导/霜缚没有直伤，不能给这个保护，否则目标会停在 1 HP。
 */
export function mageReactionAvailableForHit(
  core: GameCore,
  e: Enemy,
  element: MageElement,
  reactionBudget?: ReadonlySet<Enemy>,
): boolean {
  if (e.dead || reactionBudget?.has(e)) return false;
  const id = learnedReaction(core, element);
  if (!id || !reactionDealsDamage(id)) return false;
  const snap = snapshot(e);
  switch (id) {
    case "quench":
      return snap.burn > 0 && !snap.frozen;
    case "melt":
      return snap.frozen || snap.frostLock;
    case "overload":
      return snap.burn > 0;
    case "blaze":
      return snap.shock;
    default:
      return false;
  }
}

/** 反应伤害：单独记入 reaction 分项，吃脆化/精通/终章；不吃暴击/连锁。 */
function reactionDamage(
  core: GameCore,
  e: Enemy,
  base: number,
  element: MageElement,
  mul: number,
  noLifesteal = false,
  finaleEcho = true,
  controlled = false,
  secondary?: MageElement,
): number {
  let amount =
    base * mul * reactionDamageMultiplier(e) * mageReactionDamageMul(core);
  // 双元素增伤：触发元素由 hurtEnemy 结算；配对的另一元素在此补上
  // typeDamageBonus。抗性方向仍按触发元素（见 docs §19）。
  if (secondary && secondary !== element)
    amount *= typeBonusMultiplier(core.player.typeDamageBonus, secondary);
  if (
    hasMageUpgrade(core, "reactionFinale") &&
    core.mageSuit === "B" &&
    controlled
  )
    amount *= 1 + ELEMENTAL_MAGE.finale.controlledBonus;
  if (amount <= 0) return 0;
  const reactionId =
    (secondary ? reactionForPair(secondary, element) : null) ??
    reactionForPair(magePreviousElement(core) ?? element, element);
  const hit = core.hurtEnemy(e, amount, 0, 0, {
    noCrit: true,
    noChain: true,
    reactionId: reactionId ?? undefined,
    src: "reaction",
    type: element,
    form: "other",
    noLifesteal,
  });
  if (hit && reactionId)
    core.mageDmgBy.reaction[reactionId] += hit.effectiveHpLoss;
  // A 套装反应终章：向附近 1 个敌人传播一次低伤害回响。
  // 只由主反应触发；blaze 小爆炸等次级伤害传 false，避免连锁放大。
  if (
    finaleEcho &&
    hasMageUpgrade(core, "reactionFinale") &&
    core.mageSuit === "A"
  ) {
    let target: Enemy | null = null;
    let best: number = ELEMENTAL_MAGE.finale.echoRadius;
    for (const o of core.enemies) {
      if (o === e || o.dead) continue;
      const d = Math.hypot(o.x - e.x, o.y - e.y);
      if (d <= best) {
        best = d;
        target = o;
      }
    }
    if (target) {
      const echoHit = core.hurtEnemy(
        target,
        amount * ELEMENTAL_MAGE.finale.echoMul,
        0,
        0,
        {
          noCrit: true,
          noChain: true,
          noLifesteal: true,
          src: "reaction",
          type: element,
          form: "other",
        },
      );
      if (echoHit && reactionId)
        core.mageDmgBy.reaction[reactionId] += echoHit.effectiveHpLoss;
    }
  }
  return amount;
}

/** 反应粒子 + 名称飘字「名称（元素→元素）」；固定角度，不消耗随机数。 */
function spawnReactionFx(
  core: GameCore,
  e: Enemy,
  id: MageReactionId,
): void {
  const def = MAGE_REACTIONS[id];
  const colors =
    id === "quench"
      ? ["#e8f7ff", "#9fe1ff", "#57e6ff"]
      : id === "melt"
        ? ["#e8f7ff", "#ffffff", "#9fe1ff"]
        : id === "overload" || id === "blaze"
          ? ["#ff9a3d", "#ff5b5b", "#ffd24a"]
          : id === "superconduct"
            ? ["#d9a6ff", "#c07bff", "#57e6ff"]
            : ["#57e6ff", "#9fe1ff", "#e8f7ff"];
  core.mageVisualEvents.push({
    kind: "burst",
    at: core.time,
    element: def.to,
    x: e.x,
    y: e.y,
    radius: id === "overload" || id === "blaze" ? 34 : 18,
  });
  const count = id === "overload" || id === "blaze" ? 10 : 8;
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2;
    const speed = id === "overload" || id === "blaze" ? 56 + (i % 3) * 10 : 34 + (i % 3) * 7;
    core.parts.push({
      x: e.x,
      y: e.y,
      vx: Math.cos(a) * speed,
      vy: Math.sin(a) * speed,
      life: id === "overload" || id === "blaze" ? 0.32 : 0.26,
      c: colors[i % colors.length],
    });
  }
  if (id === "overload" || id === "blaze") {
    core.shake = Math.min(core.shake + 3, 8);
    core.audio.beep(90, 0.18, "sawtooth", 0.06, -40);
  } else if (id === "melt") {
    core.shake = Math.min(core.shake + 1.5, 5);
    core.audio.beep(1040, 0.1, "sine", 0.05, 320);
  } else if (id === "quench") {
    core.shake = Math.min(core.shake + 1.5, 5);
    core.audio.beep(880, 0.1, "sine", 0.05, 300);
  } else if (id === "frostbind") {
    core.shake = Math.min(core.shake + 1, 4);
    core.audio.beep(660, 0.12, "triangle", 0.05, 240);
  } else {
    core.shake = Math.min(core.shake + 1, 4);
    core.audio.beep(1200, 0.1, "sawtooth", 0.05, -600);
  }
  // 只显示反应名「急淬」等两字；元素方向只保留在升级领悟提示与卡面/图鉴。
  const text = core.addText(
    e.x,
    e.y - e.r - 12,
    def.name,
    def.color,
  );
  text.reactionName = true;
  text.reactionId = id;
  text.life = 0.9;
  text.vy = -16;
}

/** 施加灼烧：每层独立计时，最多 3 层。 */
function applyBurn(core: GameCore, e: Enemy, durationMul = 1): void {
  const arr = e.elemFire ?? (e.elemFire = []);
  if (arr.length >= ELEMENTAL_MAGE.burn.stackCap) return;
  arr.push(
    (ELEMENTAL_MAGE.burn.duration + mageStatusDurationBonus(core)) *
      durationMul,
  );
  if (e.elemFireTickT === undefined)
    e.elemFireTickT = ELEMENTAL_MAGE.burn.tick;
}

function freeze(e: Enemy, durationMul = 1): void {
  e.elemFrozenT =
    ELEMENTAL_MAGE.frost.freezeDuration * durationMul;
}

/**
 * 施加凝冰。冻结/霜牢期间不能叠新凝冰。
 *
 * - 1 层：持续 3 秒；2 层刷新为 6 秒；3 层冻结 1.5 秒并保留层数。
 * - `suppressFreeze`：霜缚用——满 3 层也不进入冻结，交给霜牢压制。
 */
function applyFrost(
  core: GameCore,
  e: Enemy,
  stacks = 1,
  suppressFreeze = false,
  durationMul = 1,
): void {
  if (isFrozen(e) || isFrostLocked(e)) return;
  const arr = e.elemFrost ?? (e.elemFrost = []);
  const cap = ELEMENTAL_MAGE.frost.stackCap;
  const bonus = mageStatusDurationBonus(core);
  for (let i = 0; i < stacks && arr.length < cap; i++) {
    arr.push((ELEMENTAL_MAGE.frost.duration1 + bonus) * durationMul);
    if (arr.length === 2) {
      for (let j = 0; j < arr.length; j++)
        arr[j] = (ELEMENTAL_MAGE.frost.duration2 + bonus) * durationMul;
    }
    if (arr.length >= cap) {
      // Boss 免疫冻结；保留满层凝冰，由减速承担冰系收益。
      if (!suppressFreeze && !e.boss) freeze(e, durationMul);
      break;
    }
  }
}

/** 施加雷印与麻痹；麻痹已存在时不刷新、不覆盖。 */
function applyLightningStatus(
  core: GameCore,
  e: Enemy,
  durationMul = 1,
): void {
  e.elemShockT = ELEMENTAL_MAGE.shock.duration * durationMul;
  // Boss 免疫麻痹；雷印仍可挂上，供裂焰/超载判定。
  if (!isParalyzed(e) && !e.boss)
    e.elemParaT =
      (ELEMENTAL_MAGE.paralyze.duration + mageStatusDurationBonus(core)) *
      durationMul;
}

/** 施加霜牢：初始 2 秒；已在霜牢中则至少刷新到 2 秒。Boss 免疫控制。 */
function applyFrostLock(e: Enemy): void {
  if (e.boss) return;
  const base = ELEMENTAL_MAGE.frostLock.duration;
  if (isFrostLocked(e)) {
    e.elemFrostLockT = Math.max(e.elemFrostLockT ?? 0, base);
    e.elemFrostLockTotal = Math.max(e.elemFrostLockTotal ?? base, base);
    return;
  }
  e.elemFrostLockT = base;
  e.elemFrostLockTotal = base;
  e.elemFrostLockExtendAt = -1e9;
}

/** 退出冻结并清空凝冰（融化/超导/霜缚转霜牢时用）。 */
function clearFrost(e: Enemy, keepStacks = false): void {
  if (e.elemFrozenT !== undefined) delete e.elemFrozenT;
  if (!keepStacks && e.elemFrost) delete e.elemFrost;
}

/** 退出霜牢并清空凝冰（融化/自然结束）。 */
function clearFrostLock(e: Enemy): void {
  if (e.elemFrostLockT !== undefined) delete e.elemFrostLockT;
  if (e.elemFrostLockTotal !== undefined) delete e.elemFrostLockTotal;
  if (e.elemFrostLockExtendAt !== undefined) delete e.elemFrostLockExtendAt;
}

/** 闪电链：只施加雷印/麻痹，不触发反应、不递归。 */
function triggerChain(
  core: GameCore,
  origin: Enemy,
  base: number,
  jumps: number,
  guaranteed: boolean,
): void {
  if (!guaranteed && Math.random() >= ELEMENTAL_MAGE.chain.chance) return;
  const near = core.enemies
    .filter(
      (o) =>
        o !== origin &&
        !o.dead &&
        Math.hypot(o.x - origin.x, o.y - origin.y) <
          ELEMENTAL_MAGE.chain.range,
    )
    .sort(
      (a, b) =>
        Math.hypot(a.x - origin.x, a.y - origin.y) -
        Math.hypot(b.x - origin.x, b.y - origin.y),
    )
    .slice(0, jumps);
  let px = origin.x;
  let py = origin.y;
  for (const o of near) {
    core.bolts.push({ x1: px, y1: py, x2: o.x, y2: o.y, life: 0.15 });
    px = o.x;
    py = o.y;
    core.hurtEnemy(
      o,
      base * ELEMENTAL_MAGE.chain.damageMul,
      0,
      0,
      {
        noCrit: true,
        noChain: true,
        src: "chain",
        type: "lightning",
        form: "other",
      },
    );
    if (o.dead) continue;
    applyLightningStatus(core, o);
  }
  if (near.length) core.audio.beep(1200, 0.08, "sawtooth", 0.04, -600);
}

interface ReactionResult {
  /** 本发是否实际触发了一条反应（用于每怪每发一次预算）。 */
  triggered: boolean;
  /** 本发元素状态已由反应处理，跳过普通施加。 */
  skipStatus: boolean;
  /** 本发闪电链必定触发（超导）。 */
  forceChain: boolean;
  chainJumps: number;
}

/**
 * 按命中前快照结算一条配对反应。
 *
 * 返回的 skipStatus/forceChain 交给调用方决定后续状态与闪电链。
 */
function resolveReaction(
  core: GameCore,
  e: Enemy,
  element: MageElement,
  base: number,
  snap: StatusSnapshot,
  noLifesteal: boolean,
): ReactionResult {
  const result: ReactionResult = {
    triggered: false,
    skipStatus: false,
    forceChain: false,
    chainJumps: ELEMENTAL_MAGE.chain.jumps,
  };
  const id = learnedReaction(core, element);
  if (!id) return result;
  const partner = MAGE_REACTIONS[id].from;

  switch (id) {
    case "quench": {
      if (snap.burn <= 0 || snap.frozen) return result;
      const layers = snap.burn;
      if (e.elemFire) delete e.elemFire;
      if (e.elemFireTickT !== undefined) delete e.elemFireTickT;
      e.elemBrittleT = ELEMENTAL_MAGE.brittle.duration;
      reactionDamage(
        core,
        e,
        base,
        element,
        ELEMENTAL_MAGE.reaction.quenchPerBurn * layers,
        noLifesteal,
        true,
        false,
        partner,
      );
      spawnReactionFx(core, e, id);
      if (!e.dead)
        applyFrost(core, e, ELEMENTAL_MAGE.reaction.quenchFrostStacks);
      result.triggered = true;
      result.skipStatus = true;
      return result;
    }
    case "melt": {
      if (!snap.frozen && !snap.frostLock) return result;
      const layers = snap.frost;
      clearFrost(e);
      clearFrostLock(e);
      // 本次火击施加的灼烧被融化消耗；已有灼烧保留。
      reactionDamage(
        core,
        e,
        base,
        element,
        ELEMENTAL_MAGE.reaction.meltPerFrost * layers,
        noLifesteal,
        true,
        snap.frozen || snap.frostLock,
        partner,
      );
      spawnReactionFx(core, e, id);
      result.triggered = true;
      result.skipStatus = true;
      return result;
    }
    case "overload": {
      if (snap.burn <= 0) return result;
      const layers = snap.burn;
      if (e.elemFire) delete e.elemFire;
      if (e.elemFireTickT !== undefined) delete e.elemFireTickT;
      reactionDamage(
        core,
        e,
        base,
        element,
        ELEMENTAL_MAGE.reaction.overloadPerBurn * layers,
        noLifesteal,
        true,
        snap.frozen || snap.frostLock,
        partner,
      );
      spawnReactionFx(core, e, id);
      result.triggered = true;
      return result;
    }
    case "blaze": {
      if (!snap.shock) return result;
      if (e.elemShockT !== undefined) delete e.elemShockT;
      reactionDamage(
        core,
        e,
        base,
        element,
        ELEMENTAL_MAGE.reaction.blazeMain,
        noLifesteal,
        true,
        snap.frozen || snap.frostLock,
        partner,
      );
      const splash = core.enemies
        .filter(
          (o) =>
            o !== e &&
            !o.dead &&
            Math.hypot(o.x - e.x, o.y - e.y) <=
              ELEMENTAL_MAGE.reaction.blazeSplashRadius,
        )
        .sort((a, b) => {
          const sa = isShocked(a) ? 0 : 1;
          const sb = isShocked(b) ? 0 : 1;
          if (sa !== sb) return sa - sb;
          return (
            Math.hypot(a.x - e.x, a.y - e.y) -
            Math.hypot(b.x - e.x, b.y - e.y)
          );
        })
        .slice(0, ELEMENTAL_MAGE.reaction.blazeSplashCount);
      for (const o of splash) {
        core.mageVisualEvents.push({
          kind: "burst",
          at: core.time,
          element: "fire",
          x: o.x,
          y: o.y,
          radius: 18,
        });
        reactionDamage(
          core,
          o,
          base,
          element,
          ELEMENTAL_MAGE.reaction.blazeSplash,
          noLifesteal,
          false,
          false,
          partner,
        );
      }
      spawnReactionFx(core, e, id);
      result.triggered = true;
      result.skipStatus = true;
      return result;
    }
    case "superconduct": {
      if (!snap.frozen) return result;
      clearFrost(e);
      result.triggered = true;
      result.forceChain = true;
      result.chainJumps = ELEMENTAL_MAGE.chain.superconductJumps;
      spawnReactionFx(core, e, id);
      return result;
    }
    case "frostbind": {
      if (!snap.shock) return result;
      if (e.elemShockT !== undefined) delete e.elemShockT;
      if (snap.frozen) {
        // 已冻结：解除冻结，保留 3 层凝冰，转为霜牢。
        clearFrost(e, true);
      } else if (!snap.frostLock) {
        // 本次冰击的 1 层凝冰保留；本会冻结时由霜牢压制。
        applyFrost(core, e, 1, true);
      }
      applyFrostLock(e);
      spawnReactionFx(core, e, id);
      result.triggered = true;
      result.skipStatus = true;
      return result;
    }
  }
}

export interface ElementalHitOptions {
  /** 同一次施法内共享的反应预算：棱镜折射与本体不重复触发同一怪物。 */
  reactionBudget?: Set<Enemy>;
  /** 棱镜折射不触发闪电链；本体默认允许。 */
  allowChain?: boolean;
  /** 残影只施加状态，不触发配对反应。 */
  allowReaction?: boolean;
  /** 棱镜/残影不吸血。 */
  noLifesteal?: boolean;
  /** 残影施加的元素状态持续时间倍率（0.6 = 60%）。 */
  statusDurationMul?: number;
}

/**
 * 本体法阵/棱镜/残影命中一个敌人：反应 → 元素状态 → 闪电链。
 *
 * 直伤由调用方先行结算；反应判定使用命中前快照（直伤不改变状态）。
 *
 * @returns 本发是否触发了一条配对反应（供分影齐射判断）。
 */
export function applyElementalBodyHit(
  core: GameCore,
  e: Enemy,
  element: MageElement,
  base: number,
  opts: ElementalHitOptions = {},
): boolean {
  if (e.dead) return false;
  const snap = snapshot(e);
  const inBudget = opts.reactionBudget?.has(e) ?? false;
  const icdBlocked = (e.elemReactionCd ?? 0) > 0;
  const canReact =
    opts.allowReaction !== false && !inBudget && !icdBlocked;
  const result = canReact
    ? resolveReaction(core, e, element, base, snap, opts.noLifesteal ?? false)
    : {
        triggered: false,
        skipStatus: false,
        forceChain: false,
        chainJumps: ELEMENTAL_MAGE.chain.jumps,
      };
  if (result.triggered) {
    opts.reactionBudget?.add(e);
    e.elemReactionCd = mageReactionIcd(core);
  }
  if (e.dead) return result.triggered;

  if (!result.skipStatus) {
    const durationMul = opts.statusDurationMul ?? 1;
    if (element === "fire") applyBurn(core, e, durationMul);
    else if (element === "frost") applyFrost(core, e, 1, false, durationMul);
    else applyLightningStatus(core, e, durationMul);
  }

  if (opts.allowChain !== false && element === "lightning" && !e.dead) {
    const guaranteed = result.forceChain;
    triggerChain(core, e, base, result.chainJumps, guaranteed);
  }
  return result.triggered;
}

/**
 * 元素震爆：棱镜·终极碎裂时的独立事件。
 *
 * 按「记录元素 → 当前元素」的配对，对范围内每只敌人**直接结算一次反应**：
 * - 标记类反应按 3 层上限计算（不读取/不消耗目标当前标记）；
 * - 不施加/解除控制、不触发连锁、不递归；
 * - 超导/霜缚没有直伤，震爆只由 120% 范围冲击负责伤害。
 */
export function applyElementalBurst(
  core: GameCore,
  e: Enemy,
  from: MageElement,
  to: MageElement,
  base: number,
): void {
  if (e.dead) return;
  const id = reactionForPair(from, to);
  if (!id || !core.mageReactionIds.includes(id)) return;
  if (core.mageSuit && MAGE_REACTIONS[id].suit !== core.mageSuit) return;
  switch (id) {
    case "quench":
      reactionDamage(
        core,
        e,
        base,
        to,
        ELEMENTAL_MAGE.reaction.quenchPerBurn * ELEMENTAL_MAGE.burn.stackCap,
        true,
        false,
        false,
        from,
      );
      return;
    case "melt":
      reactionDamage(
        core,
        e,
        base,
        to,
        ELEMENTAL_MAGE.reaction.meltPerFrost * ELEMENTAL_MAGE.frost.stackCap,
        true,
        false,
        false,
        from,
      );
      return;
    case "overload":
      reactionDamage(
        core,
        e,
        base,
        to,
        ELEMENTAL_MAGE.reaction.overloadPerBurn * ELEMENTAL_MAGE.burn.stackCap,
        true,
        false,
        false,
        from,
      );
      return;
    case "blaze":
      reactionDamage(
        core,
        e,
        base,
        to,
        ELEMENTAL_MAGE.reaction.blazeMain,
        true,
        false,
        false,
        from,
      );
      return;
    default:
      // 超导/霜缚没有直伤；震爆不施加控制、不消耗标记。
      return;
  }
}

/**
 * 通用 DoT 结算：preserve-float、不暴击、不产生飘字。
 *
 * 灼烧每 0.5 秒调用一次；绝不能走 hurtEnemy（round-min-one 会把每帧
 * 小伤害取整成 1，并每帧生成一条飘字）。
 */
export function applyDotDamage(
  core: GameCore,
  e: Enemy,
  rawAmount: number,
  type: DamageTypeId,
): void {
  const calc = calculateDamage(DAMAGE_TYPES, {
    rawAmount,
    type,
    form: "other",
    origin: "element",
    kind: "dot",
    precision: "preserve-float",
    isCritical: false,
    attackerStats: getPlayerCombatStats(core.player),
    defenderStats: getEnemyCombatStats(e),
  });
  const taken = bossInvulnerable(core, e) ? 0 : calc.settledDamage * (e.damageTakenMul ?? 1) * bossDamageTakenMultiplier(core, e);
  e.hp -= taken;
  syncBossPhase(core, e);
  core.dmgBy.element += taken;
}

/** 推进元素状态（每帧）。 */
export function updateMageElements(this: GameCore, dt: number): void {
  const burnBase = this.player.damage * MB.elementBaseMul;
  for (const e of this.enemies) {
    if (e.dead) continue;
    const wasFrozen = isFrozen(e);

    // 灼烧：每层独立倒计时；每 0.5 秒按当前层数结算一次。
    if (e.elemFire?.length) {
      e.elemFire = e.elemFire.filter((t) => t - dt > 0);
      if (e.elemFire.length === 0) {
        delete e.elemFire;
        if (e.elemFireTickT !== undefined) delete e.elemFireTickT;
      } else {
        if (e.elemFireTickT === undefined)
          e.elemFireTickT = ELEMENTAL_MAGE.burn.tick;
        e.elemFireTickT -= dt;
        if (e.elemFireTickT <= 0) {
          e.elemFireTickT += ELEMENTAL_MAGE.burn.tick;
          const layers = e.elemFire.length;
          applyDotDamage(
            this,
            e,
            layers * ELEMENTAL_MAGE.burn.damagePerLayer * burnBase,
            "fire",
          );
          if (e.hp <= 0) {
            this.killEnemy(e);
            continue;
          }
        }
      }
    }

    // 冻结/霜牢期间保留凝冰层数，不推进凝冰计时。
    if (e.elemFrozenT !== undefined) {
      e.elemFrozenT = Math.max(0, e.elemFrozenT - dt);
      if (e.elemFrozenT === 0) delete e.elemFrozenT;
    }
    if (e.elemFrostLockT !== undefined) {
      e.elemFrostLockT = Math.max(0, e.elemFrostLockT - dt);
      if (e.elemFrostLockT === 0) {
        delete e.elemFrostLockT;
        delete e.elemFrostLockTotal;
        delete e.elemFrostLockExtendAt;
        if (e.elemFrost) delete e.elemFrost;
      }
    }
    if (e.elemFrost?.length && !isFrozen(e) && !isFrostLocked(e)) {
      e.elemFrost = e.elemFrost.filter((t) => t - dt > 0);
      if (e.elemFrost.length === 0) delete e.elemFrost;
    }
    // 冻结自然结束时清空凝冰；霜缚转霜牢时 wasFrozen 但仍有霜牢，不清。
    if (wasFrozen && !isFrozen(e) && !isFrostLocked(e) && e.elemFrost) {
      delete e.elemFrost;
    }

    if (e.elemParaT !== undefined) {
      e.elemParaT = Math.max(0, e.elemParaT - dt);
      if (e.elemParaT === 0) delete e.elemParaT;
    }
    if (e.elemShockT !== undefined) {
      e.elemShockT = Math.max(0, e.elemShockT - dt);
      if (e.elemShockT === 0) delete e.elemShockT;
    }
    if (e.elemBrittleT !== undefined) {
      e.elemBrittleT = Math.max(0, e.elemBrittleT - dt);
      if (e.elemBrittleT === 0) delete e.elemBrittleT;
    }
    if (e.elemReactionCd !== undefined) {
      e.elemReactionCd = Math.max(0, e.elemReactionCd - dt);
      if (e.elemReactionCd === 0) delete e.elemReactionCd;
    }
  }
}
