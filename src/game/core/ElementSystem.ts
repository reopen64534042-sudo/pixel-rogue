import { bossDamageTakenMultiplier, bossInvulnerable, syncBossPhase } from "./BossSystem";
import { MAGE_BALANCE as MB, type MageElement } from "../data/mageBalance";
import { DAMAGE_TYPES } from "../data/damageTypes";
import type { DamageTypeId } from "../data/damageTypes";
import { mageElements, mageHasElement } from "../data/talents/mage";
import { getEnemyCombatStats, getPlayerCombatStats } from "./CombatStats";
import { calculateDamage } from "./DamageSystem";
import {
  chainVsParalyzedMultiplier,
  elementDamageMultiplier,
  fireLayers,
  frostLayers,
  isFrozen,
} from "./ElementMath";
import type { GameCore } from "./GameCore";
import type { Enemy } from "./types";

/**
 * 法师元素系统（S3）。
 *
 * 承担三件事（docs/talent-pool-design-rules.md 附录 B）：
 * 1. **印记**：灼烧 / 凝冰 / 麻痹 的施加与推进（每层独立计时，§4.1）；
 * 2. **共振**：「元素共振」——印记触发时影响周围敌人；
 * 3. **反应**：双修/三修的三种法印反应（超载 / 融化 / 超导）。
 *
 * 设计上的三条硬约束：
 * - **不与旧表的 burn/frostLv/chain 混用**。旧机制是单值刷新模型
 *   （共享一个 burnT），而新设计要求「每层独立 5 秒」，语义不同；
 *   混用会让熔炉点亮的旧卡与法师卡互相干扰。新状态用独立的可选字段
 *   （elemFire/elemFrost/elemParaT/elemFrozenT/elemSuperT）。
 * - **不递归**。闪电链的次级目标不再施加印记（否则链会无限展开），
 *   元素施加只由「命中」显式触发（法阵爆裂 / 陨星爆裂）。
 * - **依赖方向单向**：本模块 → CombatSystem；CombatSystem 只读纯计算层
 *   ElementMath，不 import 本模块，避免运行时循环。
 */

/** 玩家当前的主元素（法阵与陨星的伤害属性）。无元素卡时返回 null。 */
export function magePrimaryElement(p: {
  upCounts: Record<string, number>;
}): MageElement | null {
  const els = mageElements(p);
  return els.length ? els[0] : null;
}

/** 主元素对应的伤害属性 ID；无元素时走物理（法术尚未定属性）。 */
export function mageDamageType(
  p: { upCounts: Record<string, number> },
): "fire" | "frost" | "lightning" | "physical" {
  const el = magePrimaryElement(p);
  return el ?? "physical";
}

type MageReaction = "melt" | "overload" | "superconduct";

interface HitStatusSnapshot {
  frozen: boolean;
  burn: number;
  frost: number;
  meltCd: number;
  overloadCd: number;
  superCd: number;
}

/** 命中前快照：反应只认这一发之前的元素状态，避免同一发自己喂自己。 */
function hitStatusSnapshot(e: Enemy): HitStatusSnapshot {
  return {
    frozen: isFrozen(e),
    burn: fireLayers(e),
    frost: frostLayers(e),
    meltCd: e.elemMeltCd ?? 0,
    overloadCd: e.elemOverloadCd ?? 0,
    superCd: e.elemSuperCd ?? 0,
  };
}

/** 反应伤害统一走命中管线，但单独记入 `reaction` 分项，不吃暴击/连锁。 */
function reactionDamage(
  core: GameCore,
  e: Enemy,
  amount: number,
  type: "fire" | "lightning",
): void {
  core.hurtEnemy(e, amount, 0, 0, {
    noCrit: true,
    noChain: true,
    src: "reaction",
    type,
    form: "other",
  });
}

/** 反应粒子：固定角度，不消耗随机数。 */
function spawnReactionFx(
  core: GameCore,
  e: Enemy,
  reaction: MageReaction,
): void {
  const colors =
    reaction === "melt"
      ? ["#e8f7ff", "#9fe1ff"]
      : reaction === "overload"
        ? ["#ff9a3d", "#ff5b5b", "#ffd24a"]
        : ["#d9a6ff", "#c07bff", "#57e6ff"];
  const count = reaction === "overload" ? 10 : 8;
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2;
    const speed =
      reaction === "overload" ? 56 + (i % 3) * 10 : 34 + (i % 3) * 7;
    core.parts.push({
      x: e.x,
      y: e.y,
      vx: Math.cos(a) * speed,
      vy: Math.sin(a) * speed,
      life: reaction === "overload" ? 0.32 : 0.26,
      c: colors[i % colors.length],
    });
  }
  if (reaction === "overload") {
    core.shake = Math.min(core.shake + 3, 8);
    core.audio.beep(90, 0.18, "sawtooth", 0.06, -40);
  } else if (reaction === "melt") {
    core.shake = Math.min(core.shake + 1.5, 5);
    core.audio.beep(1040, 0.1, "sine", 0.05, 320);
  } else {
    core.shake = Math.min(core.shake + 1, 4);
    core.audio.beep(1200, 0.1, "sawtooth", 0.05, -600);
  }
}

interface ReactionState {
  snap: HitStatusSnapshot;
  reactions: MageReaction[];
}

/** 命中前快照下会触发的反应列表（纯查询，不消耗状态、不设 CD）。 */
function reactionState(e: Enemy, els: MageElement[]): ReactionState {
  const snap = hitStatusSnapshot(e);
  const has = (el: MageElement) => els.includes(el);
  const reactions: MageReaction[] = [];
  if (has("fire") && has("frost") && snap.frozen && snap.meltCd <= 0)
    reactions.push("melt");
  if (
    has("fire") &&
    has("lightning") &&
    snap.burn >= MB.overloadMinStacks &&
    snap.overloadCd <= 0
  )
    reactions.push("overload");
  if (
    has("frost") &&
    has("lightning") &&
    (snap.frozen || snap.frost > 0) &&
    snap.superCd <= 0
  )
    reactions.push("superconduct");
  return { snap, reactions };
}

/**
 * 法阵/陨星直伤在结算前调用：目标当前是否满足某个反应的触发条件。
 * 只查询、不结算，供 v74 的「击杀保护」决定是否让出最后一击。
 */
export function mageReactionAvailable(core: GameCore, e: Enemy): boolean {
  if (e.dead) return false;
  return reactionState(e, mageElements(core.player)).reactions.length > 0;
}

/**
 * 一次直接命中结算所有满足条件的法印反应（三修 = 全部触发）。
 *
 * - 融化：火命中冻结（消耗冻结），伤害 = 反应基数 × 2.5
 * - 超载：雷命中 ≥2 层灼烧（消耗全部灼烧），伤害 = 层数 × 每层 DPS × 3 秒
 * - 超导：雷命中冻结或带凝冰（不消耗），直接雷伤 + 保证链 +2 + 雷易伤 15%
 *
 * 判定用命中前快照；三个反应各有独立 ICD，互不阻塞。反应先于本发印记
 * 结算，随后才叠灼烧/凝冰/麻痹。`reactionBase` 由调用方传入「反应基数」，
 * 与 v74 下调后的直伤解耦（见 mageBalance.reactionBaseMul）。
 */
function resolveMageReactions(
  core: GameCore,
  e: Enemy,
  reactionBase: number,
): MageReaction[] {
  const p = core.player;
  const out: MageReaction[] = [];
  if (e.dead) return out;
  const { snap, reactions } = reactionState(e, mageElements(p));

  for (const reaction of reactions) {
    if (reaction === "melt") {
      e.elemFrozenT = 0;
      reactionDamage(core, e, reactionBase * MB.meltDamageMul, "fire");
      e.elemMeltCd = MB.reactionIcdMelt;
      spawnReactionFx(core, e, "melt");
      out.push("melt");
    } else if (reaction === "overload") {
      const layers = snap.burn;
      e.elemFire = [];
      reactionDamage(
        core,
        e,
        layers * p.damage * MB.burnDpsPerStack * MB.overloadSeconds,
        "fire",
      );
      e.elemOverloadCd = MB.reactionIcdOverload;
      spawnReactionFx(core, e, "overload");
      out.push("overload");
    } else {
      // 冰壳/凝冰都不消耗；这一发雷伤先结算，再设置超导易伤（避免自乘）。
      reactionDamage(core, e, reactionBase * MB.superDamageMul, "lightning");
      e.elemSuperT = MB.superVulnDuration;
      e.elemSuperCd = MB.reactionIcdSuper;
      spawnReactionFx(core, e, "superconduct");
      out.push("superconduct");
    }
  }
  return out;
}

/** 链上次级目标只允许超载；超导不递归，避免无限连锁。 */
function resolveChainOverload(core: GameCore, e: Enemy): void {
  const p = core.player;
  if (e.dead || (e.elemOverloadCd ?? 0) > 0) return;
  if (!mageHasElement(p, "fire") || !mageHasElement(p, "lightning")) return;
  const layers = fireLayers(e);
  if (layers < MB.overloadMinStacks) return;
  e.elemFire = [];
  reactionDamage(
    core,
    e,
    layers * p.damage * MB.burnDpsPerStack * MB.overloadSeconds,
    "fire",
  );
  e.elemOverloadCd = MB.reactionIcdOverload;
  spawnReactionFx(core, e, "overload");
}

/**
 * 施加一层元素印记（反应已经在 resolveMageReactions 里先结算过）。
 *
 * 不含共振与连锁判定——那两步在 applyMageHit 里分开做，
 * 目的是让「共振先于连锁结算」（雷共振会给连锁加跳数与跳跃距离）。
 */
function applyElementStack(
  core: GameCore,
  e: Enemy,
  element: MageElement,
  silent = false,
): void {
  if (element === "fire") {
    // 灼烧：每层独立计时（§4.1）
    const arr = e.elemFire ?? (e.elemFire = []);
    if (arr.length < MB.burnStackCap) arr.push(MB.burnDuration);
    return;
  }
  if (element === "frost") {
    // 冻结期间不能重新叠加凝冰（设计：解除后才能重新叠加）
    if (isFrozen(e)) return;
    const arr = e.elemFrost ?? (e.elemFrost = []);
    if (arr.length < MB.frostStackCap) arr.push(MB.frostDuration);
    if (!e.boss && arr.length >= MB.frostStackCap) {
      // 满层冻结：移除全部凝冰
      arr.length = 0;
      e.elemFrozenT = MB.frostFreezeDuration;
      // 不再刷「冻结」飘字：元素共振会一次冻住一片怪，满屏文字比伤害数字还乱。
      // 状态改由敌人身上的冰壳表现（rendering/draw.ts 的 drawFrozenOverlay）。
      if (!silent) core.audio.beep(880, 0.1, "sine", 0.04, 300);
    }
    return;
  }
  // 闪电：麻痹（可刷新，单值计时）
  if (!e.boss) e.elemParaT = MB.paraDuration;
}

/**
 * 元素残域每秒给领域内敌人补一次元素状态。
 *
 * 只走上状态，不走 `applyMageHit`：残域不触发闪电链、不触发反应，
 * 也不刷冻结音效（一次覆盖多个敌人时音效会叠成噪音）。
 */
export function applyDomainElement(
  core: GameCore,
  e: Enemy,
  type: DamageTypeId,
): void {
  if (type === "fire" || type === "frost" || type === "lightning")
    applyElementStack(core, e, type, true);
}

/** 共振对本次连锁的加成（雷共振才有）。 */
interface ResonanceResult {
  chainBonusJumps: number;
  chainRangeMul: number;
}

/**
 * 元素共振：「印记触发时，60px 内的敌人按元素获得不同强化」。
 *
 * - 火：获得目标 50% 的灼烧层数（向下取整，至少 1 层）
 * - 冰：各 +1 层凝冰（**不因此触发冻结**）
 * - 雷：闪电链额外跳 1 个目标，跳跃距离 +50%
 *
 * 雷的实现说明：设计文档把雷共振写成对「附近敌人」的强化，
 * 落到机制上等价于「这些敌人成为闪电链的额外目标」。
 * 这里按「本次连锁多跳 1 个 + 距离 ×1.5」实现——不引入持久状态，
 * 每次雷印记触发都重新给一次加成。
 */
function applyResonance(
  core: GameCore,
  target: Enemy,
  element: MageElement,
): ResonanceResult {
  const out: ResonanceResult = { chainBonusJumps: 0, chainRangeMul: 1 };
  for (const o of core.enemies) {
    if (o === target || o.dead) continue;
    if (Math.hypot(o.x - target.x, o.y - target.y) > MB.resonanceRadius) continue;
    if (element === "fire") {
      const n = Math.max(1, Math.floor(fireLayers(target) * 0.5));
      const arr = o.elemFire ?? (o.elemFire = []);
      for (let i = 0; i < n && arr.length < MB.burnStackCap; i++)
        arr.push(MB.burnDuration);
    } else if (element === "frost") {
      // 不因此触发冻结：只加一层，且满层时不解冻
      const arr = o.elemFrost ?? (o.elemFrost = []);
      if (!isFrozen(o) && arr.length < MB.frostStackCap)
        arr.push(MB.frostDuration);
    } else {
      out.chainBonusJumps += 1;
      out.chainRangeMul = 1.5;
    }
  }
  return out;
}

/**
 * 闪电链。
 *
 * @param jumps 最大跳跃目标数
 * @param rangeMul 跳跃距离倍率（雷共振给 1.5）
 */
function triggerChainLightning(
  core: GameCore,
  origin: Enemy,
  dmg: number,
  jumps: number,
  rangeMul: number,
): void {
  const range = MB.chainRange * rangeMul;
  const near = core.enemies
    .filter(
      (o) => o !== origin && !o.dead && Math.hypot(o.x - origin.x, o.y - origin.y) < range,
    )
    .slice(0, jumps);
  let px = origin.x;
  let py = origin.y;
  for (const o of near) {
    core.bolts.push({ x1: px, y1: py, x2: o.x, y2: o.y, life: 0.15 });
    px = o.x;
    py = o.y;
    // 链上次级只允许超载；超导不递归，避免无限连锁。
    resolveChainOverload(core, o);
    if (o.dead) continue;
    core.hurtEnemy(
      o,
      dmg * MB.chainDamageMul * chainVsParalyzedMultiplier(o),
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
  }
  if (near.length) core.audio.beep(1200, 0.08, "sawtooth", 0.04, -600);
}

/**
 * 一次命中带来的元素结算：反应 → 印记 → 共振 → 连锁。
 *
 * @param reactionBase 反应伤害基数（融化/超导/闪电链按它折算）。
 *   调用方传入与直伤解耦的基数；v74 下调法阵直伤后，反应数字保持不变。
 */
export function applyMageHit(
  core: GameCore,
  e: Enemy,
  reactionBase: number,
): void {
  const p = core.player;
  const els = mageElements(p);
  if (!els.length || e.dead) return;
  // 三修：所有满足条件的反应都结算；双修通常只有一个配对。
  const reactions = resolveMageReactions(core, e, reactionBase);
  if (e.dead) return;
  const superconduct = reactions.includes("superconduct");
  const hasResonance = (p.upCounts["元素共振"] || 0) > 0;
  for (const el of els) {
    applyElementStack(core, e, el);
    let bonusJumps = 0;
    let rangeMul = 1;
    if (hasResonance) {
      const r = applyResonance(core, e, el);
      bonusJumps = r.chainBonusJumps;
      rangeMul = r.chainRangeMul;
    }
    if (el === "lightning") {
      const jumps =
        MB.chainJumps + (superconduct ? MB.superChainBonusJumps : 0) + bonusJumps;
      const chance = superconduct ? 1 : MB.chainChance;
      if (Math.random() < chance)
        triggerChainLightning(core, e, reactionBase, jumps, rangeMul);
    }
  }
}

/**
 * 通用 DoT 结算：preserve-float、不暴击、**不产生飘字**。
 *
 * 灼烧与元素残域共用——绝不能走 `hurtEnemy`：后者的 `round-min-one` 会把
 * 每帧 0.073 的伤害取整成 1，并且每帧生成一条飘字（实机事故：元素残域
 * 里满屏「1」）。受击方条件加成（冻结 +10% 等）在这里显式乘上。
 */
export function applyDotDamage(
  core: GameCore,
  e: Enemy,
  rawAmount: number,
  type: DamageTypeId,
): void {
  const raw = rawAmount * elementDamageMultiplier(e, type);
  const calc = calculateDamage(DAMAGE_TYPES, {
    rawAmount: raw,
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

/** 灼烧 DoT：每帧按层数 × 每层 DPS 扣血。 */
function applyElementDot(
  core: GameCore,
  e: Enemy,
  dps: number,
  dt: number,
): void {
  applyDotDamage(core, e, dps * dt, "fire");
}

/**
 * 推进元素状态（每帧）。
 *
 * 灼烧/凝冰的每层独立倒计时（§4.1）；麻痹/冻结/超导是单值计时。
 * 死亡判定留在调用侧（与旧 burn 的处理一致）。
 */
export function updateMageElements(this: GameCore, dt: number) {
  if (this.prof==='mage' && this.mageWeapon==='domain') return;
  const p = this.player;
  for (const e of this.enemies) {
    if (e.elemFire?.length) {
      e.elemFire = e.elemFire.filter((t) => t - dt > 0);
      const layers = e.elemFire.length;
      if (layers > 0) {
        const dps = layers * p.damage * MB.burnDpsPerStack;
        applyElementDot(this, e, dps, dt);
        if (e.hp <= 0) {
          this.killEnemy(e);
          continue;
        }
      } else if (e.elemFire.length === 0) {
        delete e.elemFire;
      }
    }
    if (e.elemFrost?.length) {
      e.elemFrost = e.elemFrost.filter((t) => t - dt > 0);
      if (e.elemFrost.length === 0) delete e.elemFrost;
    }
    if (e.elemParaT) e.elemParaT = Math.max(0, e.elemParaT - dt);
    if (e.elemFrozenT) e.elemFrozenT = Math.max(0, e.elemFrozenT - dt);
    if (e.elemSuperT) e.elemSuperT = Math.max(0, e.elemSuperT - dt);
    if (e.elemMeltCd) e.elemMeltCd = Math.max(0, e.elemMeltCd - dt);
    if (e.elemOverloadCd)
      e.elemOverloadCd = Math.max(0, e.elemOverloadCd - dt);
    if (e.elemSuperCd) e.elemSuperCd = Math.max(0, e.elemSuperCd - dt);
  }
}
