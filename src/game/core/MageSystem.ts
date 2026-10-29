import { MAGE_BALANCE as MB } from "../data/mageBalance";
import { WORLD, clamp } from "../data/constants";
import { applyDotDamage, applyMageHit, mageDamageType } from "./ElementSystem";
import type { GameCore } from "./GameCore";
import type { Enemy, MageCastPhase } from "./types";

/**
 * 法师施法系统（S3）。
 *
 * 法师的门控是**时间**：必须熬过前摇与施法间隔，被打断则这一发完全作废。
 * 因此本模块提供：
 * - 施法状态机（抬手 → 收束 → 爆裂 → 间隔）；
 * - 落点选取（射程内、按法阵实际半径统计的最密集处 + 按前摇时长做速度提前量）；
 * - 充能条（每 3 次成功施法满一次，满时按已学顺序结算循环轴）；
 * - 值型限时护盾（与既有「层数制 + 10s 恢复」的护盾是两套模型）；
 * - 脱离槽（相位传送 / 镜像残影）；
 * - 路线B（星陨 / 多重陨星 / 元素残域）——把主施法整体换成周期性陨星。
 *
 * 运行态全部放在 GameCore（不放 Player）：
 * `recompute` 会用 `Object.assign(player, statBase())` 重建 Player，
 * 计时类状态放进去会被抹掉。放 GameCore 的先例是射手池的
 * dodgeNextCrit / contactKnockCd 等。
 */

/**
 * 施法速度倍率：1 = 职业基础速度。
 *
 * 法师的 fireRate base 是 `1 / castCycle`（见 data/stats.ts），属性「施法速度」
 * 通过 fireRate 的百分比成长作用到这里——前摇与间隔同比缩放，施法周期
 * 始终等于 `1 / fireRate`。下限保护只防「速度为 0」的非法配置。
 */
function castRate(core: GameCore): number {
  return Math.max(0.05, core.player.fireRate * MB.castCycle);
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

/**
 * 站定判定：前摇**最后一段**保持静止。
 *
 * 静止窗口 = 前摇总长 × `steadyHoldRatio`（0.4）。基础前摇 0.35s →
 * 最后 0.14s 不许动；速咏后按缩短后的前摇同比缩放。
 * 判定依据是「最后一次移动的时刻」，因此玩家可以边跑边施法，在读数临近
 * 完成时急停——停够窗口就吃加成。绘制侧与 detonate 共用本函数，
 * 读条变青的时刻就是判定生效的时刻。
 */
export function mageIsSteady(core: GameCore): boolean {
  if (core.castPhase !== "windup" && core.castPhase !== "cast") return false;
  return core.time - core.mageLastMoveAt >= mageWindup(core) * MB.steadyHoldRatio;
}

/**
 * 法阵半径（广域符印 +20%，聚爆 +50%）。
 *
 * **不看站定**：半径只由天赋/属性决定，移动和站定必须一致——
 * 否则玩家会以为「范围天赋只在站定时生效」。
 */
export function mageCircleRadius(core: GameCore, isCharge: boolean): number {
  const p = core.player;
  let r = MB.circleRadius * p.area;
  if ((p.upCounts["广域符印"] || 0) > 0) r *= MB.wideSealAreaMul;
  if (isCharge && (p.upCounts["三连聚爆"] || 0) > 0) r *= MB.burstRadiusMul;
  return r;
}

/** 法阵伤害（元素蓄能 / 三连聚爆 只作用于满充能的那一发；站定 ×1.5）。 */
export function mageCircleDamage(
  core: GameCore,
  isCharge: boolean,
  steady = false,
): number {
  const p = core.player;
  let dmg = p.damage * MB.castDamageMul;
  if (steady) dmg *= MB.steadyDamageMul;
  if (isCharge) {
    if ((p.upCounts["元素蓄能"] || 0) > 0) dmg *= MB.chargeDamageMul;
    if ((p.upCounts["三连聚爆"] || 0) > 0) dmg *= MB.burstDamageMul;
  }
  return dmg;
}

/**
 * 射程内「最密集处」：按本次法阵实际半径统计覆盖人数，取最多者；
 * 人数相同取离玩家更近的那个。
 *
 * 旧实现用固定 90px 统计邻居——法阵基础半径只有 34px，两个相距 80px 的
 * 敌人会被当成「密集」，但法阵根本覆盖不到第二个，于是远处假集群压过
 * 近处单敌。改用实际半径后，密度与真实命中一致；孤立敌人按距离取近。
 */
function findDensest(
  core: GameCore,
  range: number,
  radius: number,
): Enemy | null {
  const p = core.player;
  let best: Enemy | null = null;
  let bestN = -1;
  let bestD = Infinity;
  for (const c of core.enemies) {
    if (c.dead) continue;
    const d = Math.hypot(c.x - p.x, c.y - p.y);
    if (d > range) continue;
    let n = 0;
    for (const o of core.enemies) {
      if (o.dead) continue;
      if (Math.hypot(o.x - c.x, o.y - c.y) <= radius) n++;
    }
    if (n > bestN || (n === bestN && d < bestD)) {
      bestN = n;
      bestD = d;
      best = c;
    }
  }
  return best;
}

/**
 * 落点：目标位置 + 真实速度 × 前摇时长。
 *
 * 速度由 EnemySystem 每帧在法师路径物化（`e.vx/e.vy`）。旧实现按
 * 「敌人在前摇内朝玩家移动」估算——面对会后撤/横移的射手敌人时，
 * 落点会被推到玩家与敌人中间，永远打空。
 */
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

/** 法阵爆裂：范围内全体受伤 + 施加元素印记。 */
function explodeCircle(
  core: GameCore,
  x: number,
  y: number,
  R: number,
  dmg: number,
): number {
  const p = core.player;
  const type = mageDamageType(p);
  let hits = 0;
  for (const e of core.enemies) {
    if (e.dead) continue;
    const dx = e.x - x;
    const dy = e.y - y;
    if (dx * dx + dy * dy > R * R) continue;
    hits++;
    core.hurtEnemy(e, dmg, 0, 0, {
      noChain: true,
      src: "cast",
      type,
      form: "other",
    });
    applyMageHit(core, e, dmg);
  }
  if (hits) {
    // 不再刷「法阵」飘字：它每 0.55 秒在落点出现一次，正好压住伤害数字
    //（玩家实机反馈两者互相看不清）。命中反馈由法阵圈、音效与震屏承担。
    core.audio.beep(520, 0.1, "sine", 0.05, 180);
    core.shake = Math.min(core.shake + 1.5, 5);
  }
  return hits;
}

/**
 * 一次施法结算：爆裂 → 充能结算 → 充能条推进。
 *
 * 充能条语义（设计文档 §4.5 + 附录 B）：
 * 每 3 次成功施法「满充能」，满充能的那一发享受循环轴收益
 * （三连聚爆 +15% 伤害 / 半径 +50%、元素蓄能 +40% 伤害、
 *  咏唱护壁给护盾、过载额外再触发一次）。
 */
function detonate(core: GameCore, steady: boolean) {
  const p = core.player;
  const isCharge = core.mageCharge + 1 >= MB.chargeFull;
  // 满充能触发：三格全亮 0.35 秒（1→2→3 的计数反馈），随后清零
  if (isCharge) core.mageChargeFlashT = MB.chargeFlash;
  const dmg = mageCircleDamage(core, isCharge, steady);
  const R = mageCircleRadius(core, isCharge);
  const hits = explodeCircle(core, core.castX, core.castY, R, dmg);
  // 回响：施法命中后获得少量护盾（可叠加，总量有上限）
  if (hits > 0 && (p.upCounts["回响"] || 0) > 0) {
    grantMageShield(
      core,
      p.maxhp * MB.echoShieldPct,
      MB.echoShieldDuration,
      true,
    );
  }
  if (isCharge) {
    // 咏唱护壁：满充能时获得护盾（不可叠层 → 覆盖而不是相加）
    if ((p.upCounts["咏唱护壁"] || 0) > 0)
      grantMageShield(
        core,
        p.maxhp * MB.wardShieldPct,
        MB.wardShieldDuration,
        false,
      );
    // 过载：满充能时该次施法立即再触发一次（额外这一次不吃充能加成，
    // 但同属这一发，站定加成一并继承）
    if ((p.upCounts["过载"] || 0) > 0)
      explodeCircle(
        core,
        core.castX,
        core.castY,
        R,
        mageCircleDamage(core, false, steady),
      );
  }
  core.mageCharge = (core.mageCharge + 1) % MB.chargeFull;
}

/**
 * 授予值型限时护盾。
 *
 * 与既有护盾（`shield`/`shieldMax`/`shieldCd`：层数制、挡整伤、10s 恢复）
 * 是**两套模型**，因此用独立字段 `mageShield`/`mageShieldT`，
 * 不复用也不改写旧护盾。
 *
 * @param stack true = 可叠加（回响）；false = 不可叠层（咏唱护壁）
 */
export function grantMageShield(
  core: GameCore,
  amount: number,
  duration: number,
  stack: boolean,
): void {
  const cap = core.player.maxhp * MB.echoShieldCapPct;
  if (stack) {
    core.mageShield = Math.min(cap, core.mageShield + amount);
  } else {
    core.mageShield = Math.max(core.mageShield, amount);
  }
  core.mageShieldT = Math.max(core.mageShieldT, duration);
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
  // 找不到落点：改为 0.5 秒无敌（本次伤害照常结算）
  p.hurtCd = Math.max(p.hurtCd, MB.phaseInvuln);
  core.addText(p.x, p.y - 12, "相位失灵", "#ff9a3d");
  return false;
}

/**
 * 镜像：在**受击位置**留下残影吸引仇恨，自身进入 1 秒虚影。
 *
 * 虚影期间：不可受击（damagePlayer 直接挡下）、无视碰撞（敌人接触判定跳过）、
 * 不能施法（施法状态机跳过）。
 *
 * 残影是**限时仇恨源**（`mirrorDecoyDuration` 秒），不因接触而破碎：
 * 旧实现 hp=1，而触发条件正是「被贴脸打中」——残影生成当帧就被同一个敌人
 * 打掉，仇恨转移从未发生。位置取受击点而不是侧方偏移点：假体留在原地、
 * 玩家在无敌帧里脱离，敌人才会继续围着「刚才的你」打。
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

/* ================= 路线B：星陨 / 多重陨星 / 元素残域 ================= */

/**
 * 取「最密集且彼此分开」的若干落点。
 *
 * 多重陨星如果都砸在同一个点上，单目标会被双倍伤害——等于把路线B的
 * 单体伤害偷偷翻倍。这里按「局部密度降序 + 与已选点保持 meteorMinSep」
 * 挑选；密度按本波陨星的实际半径统计，同等密度取更近的点。
 * 数量不足时由调用方围绕已有落点铺开（保证始终落 count 颗）。
 */
function findDensestPoints(
  core: GameCore,
  range: number,
  count: number,
  radius: number,
): { x: number; y: number; e: Enemy }[] {
  const p = core.player;
  const cands: { e: Enemy; n: number; d: number }[] = [];
  for (const c of core.enemies) {
    if (c.dead) continue;
    const d = Math.hypot(c.x - p.x, c.y - p.y);
    if (d > range) continue;
    let n = 0;
    for (const o of core.enemies) {
      if (o.dead) continue;
      if (Math.hypot(o.x - c.x, o.y - c.y) <= radius) n++;
    }
    cands.push({ e: c, n, d });
  }
  cands.sort((a, b) => b.n - a.n || a.d - b.d);
  const out: { x: number; y: number; e: Enemy }[] = [];
  for (const c of cands) {
    if (out.length >= count) break;
    if (
      out.every((o) => Math.hypot(o.x - c.e.x, o.y - c.e.y) >= MB.meteorMinSep)
    )
      out.push({ x: c.e.x, y: c.e.y, e: c.e });
  }
  return out;
}

function updateMeteorRoute(core: GameCore, dt: number) {
  const p = core.player;
  core.mageMeteorT -= dt;
  if (core.mageMeteorT <= 0) {
    core.mageMeteorT = MB.meteorInterval;
    const multi = (p.upCounts["多重陨星"] || 0) > 0;
    const count = multi ? MB.meteorCount : 1;
    // 密度按本波陨星的实际半径统计；满充能的三连聚爆半径也要提前算入，
    // 否则统计用的是基础半径、实际落点却更大，密集处会选偏。
    const isCharge = core.mageCharge + 1 >= MB.chargeFull;
    let R = MB.meteorRadius;
    if (isCharge && (p.upCounts["三连聚爆"] || 0) > 0)
      R *= MB.burstRadiusMul;
    const points = findDensestPoints(core, p.attackRange, count, R);
    if (points.length) {
      const type = mageDamageType(p);
      // S5：陨星也吃充能条——每 3 波陨星触发一次满充能，循环轴 5 张卡
      // 在星陨路线下不再失效（此前 mageCharge 只在基础施法的 detonate 里推进）。
      let dmg = p.damage * MB.meteorDamageMul;
      // 多重陨星对单目标会双份命中：每颗降为 0.8 倍，避免 L2 单体直接翻倍。
      if (multi) dmg *= MB.meteorMultiDamageMul;
      if (isCharge) {
        if ((p.upCounts["元素蓄能"] || 0) > 0) dmg *= MB.chargeDamageMul;
        if ((p.upCounts["三连聚爆"] || 0) > 0) dmg *= MB.burstDamageMul;
        // 咏唱护壁：满充能波次给盾（不可叠层 → 覆盖）
        if ((p.upCounts["咏唱护壁"] || 0) > 0)
          grantMageShield(
            core,
            p.maxhp * MB.wardShieldPct,
            MB.wardShieldDuration,
            false,
          );
      }
      const spawnMeteor = (
        base: { x: number; y: number; e: Enemy },
        ox = 0,
        oy = 0,
        chargeMarker = false,
      ) => {
        // 落点提前量：按敌人**真实速度**外推落地时长。旧实现假设敌人朝玩家
        // 移动，射手后撤时落点会落在玩家与敌人中间，永远打空。
        const leadX = (base.e.vx ?? 0) * MB.meteorFall;
        const leadY = (base.e.vy ?? 0) * MB.meteorFall;
        core.mageMeteors.push({
          x: clamp(base.x + ox + leadX, 16, WORLD.w - 16),
          y: clamp(base.y + oy + leadY, 16, WORLD.h - 16),
          t: MB.meteorFall,
          R,
          element: type,
          dmg,
          charged: isCharge,
          chargeMarker,
        });
      };
      for (let i = 0; i < count; i++) {
        // 敌群够多：一颗一个群；敌群不足（例如只剩一个敌人）：围绕同一个
        // 目标按固定角度铺开，保证「同时落下 count 颗」这条卡面承诺永远成立。
        const base = points[i % points.length];
        const extra = i >= points.length ? i : -1;
        const a = extra >= 0 ? (extra / count) * Math.PI * 2 : 0;
        const ox = extra >= 0 ? Math.cos(a) * MB.meteorSpread : 0;
        const oy = extra >= 0 ? Math.sin(a) * MB.meteorSpread : 0;
        // 只有这一波的第一颗带充能标记：落地时才推进一次点数
        spawnMeteor(base, ox, oy, i === 0);
      }
      // 过载：满充能波次额外再落一颗（落在第一个目标群）
      if (isCharge && (p.upCounts["过载"] || 0) > 0) spawnMeteor(points[0]);
      // 充能推进不在这里——改到陨星落地那一帧（见下方 impact 段），
      // 让点数与出伤同步，观感更自然。
    }
  }
  for (let i = core.mageMeteors.length - 1; i >= 0; i--) {
    const m = core.mageMeteors[i];
    m.t -= dt;
    if (m.t > 0) continue;
    core.mageMeteors.splice(i, 1);
    const dmg = m.dmg;
    let hits = 0;
    for (const e of core.enemies) {
      if (e.dead) continue;
      const dx = e.x - m.x;
      const dy = e.y - m.y;
      if (dx * dx + dy * dy > m.R * m.R) continue;
      hits++;
      core.hurtEnemy(e, dmg, 0, 0, {
        noChain: true,
        src: "meteor",
        type: m.element,
        form: "other",
      });
      applyMageHit(core, e, dmg);
    }
    // 充能：这一波的第一颗落地时推进一次（与出伤同步）；满充能波次三格闪一下
    if (m.chargeMarker) {
      if (m.charged) core.mageChargeFlashT = MB.chargeFlash;
      core.mageCharge = (core.mageCharge + 1) % MB.chargeFull;
    }
    // 回响：陨星命中后给盾（可叠层，总量上限见 grantMageShield）
    if (hits > 0 && (p.upCounts["回响"] || 0) > 0)
      grantMageShield(
        core,
        p.maxhp * MB.echoShieldPct,
        MB.echoShieldDuration,
        true,
      );
    // 元素残域：落点留下持续领域
    if ((p.upCounts["元素残域"] || 0) > 0)
      core.mageDomains.push({
        x: m.x,
        y: m.y,
        R: MB.domainRadius,
        t: MB.domainDuration,
        tick: MB.domainTick,
        element: m.element,
      });
    core.shake = Math.min(core.shake + 3, 6);
    core.audio.beep(90, 0.25, "sawtooth", 0.07, -40);
  }
  // 元素残域：持续伤害——按 domainTick 结算的 DoT，**不走 hurtEnemy**。
  // hurtEnemy 是「命中」管线：round-min-one 会把每帧 0.073 取整成 1，
  // 并且每帧弹一条飘字（实机事故：领域内满屏「1」）。
  const dps = p.damage * MB.domainDpsMul;
  for (let i = core.mageDomains.length - 1; i >= 0; i--) {
    const d = core.mageDomains[i];
    d.t -= dt;
    if (d.t <= 0) {
      core.mageDomains.splice(i, 1);
      continue;
    }
    d.tick -= dt;
    if (d.tick > 0) continue;
    d.tick += MB.domainTick;
    for (const e of core.enemies) {
      if (e.dead) continue;
      const dx = e.x - d.x;
      const dy = e.y - d.y;
      if (dx * dx + dy * dy > d.R * d.R) continue;
      applyDotDamage(core, e, dps * MB.domainTick, d.element);
      if (e.hp <= 0) core.killEnemy(e);
    }
  }
}

/**
 * 法师每帧更新：护盾计时、冷却、施法状态机、路线B。
 *
 * 只在 `prof === "mage"` 时才做事——射手路径完全不受影响。
 */
export function updateMageCasting(this: GameCore, dt: number) {
  const p = this.player;
  if (this.prof !== "mage") return;
  // 站定判定的移动追踪：Simulation 里本模块紧随 updatePlayer，读到的就是
  // 本帧位移。0.05px 阈值忽略浮点噪声；只有真正移动才刷新计时。
  if (Math.hypot(p.x - this.magePrevX, p.y - this.magePrevY) > 0.05)
    this.mageLastMoveAt = this.time;
  this.magePrevX = p.x;
  this.magePrevY = p.y;
  // 值型限时护盾
  if (this.mageShieldT > 0) {
    this.mageShieldT -= dt;
    if (this.mageShieldT <= 0) {
      this.mageShieldT = 0;
      this.mageShield = 0;
    }
  }
  if (this.mageChargeFlashT > 0) this.mageChargeFlashT -= dt;
  if (this.magePhaseCd > 0) this.magePhaseCd -= dt;
  if (this.mageMirrorCd > 0) this.mageMirrorCd -= dt;
  if (this.magePhaseT > 0) this.magePhaseT -= dt;
  // 残影计时
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
  // 路线B：法术整体换成周期性陨星
  if ((p.upCounts["星陨"] || 0) > 0) {
    // 选卡时可能正在读条：切到星陨路线必须清掉残留的施法状态，
    // 否则 castPhase 会永远停在 windup/cast，读条卡住不动。
    this.castPhase = "idle";
    this.castT = 0;
    updateMeteorRoute(this, dt);
    return;
  }
  switch (this.castPhase as MageCastPhase) {
    case "idle": {
      this.castCd -= dt;
      if (this.castCd > 0) break;
      const target = findDensest(
        this,
        p.attackRange,
        mageCircleRadius(this, this.mageCharge + 1 >= MB.chargeFull),
      );
      if (!target) {
        this.castCd = MB.castIdleRetry;
        break;
      }
      const point = resolveCastPoint(this, target);
      this.castX = point.x;
      this.castY = point.y;
      this.castPhase = "windup";
      // 抬手段：可被受击打断。速咏按比例缩短抬手与收束两段。
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
      // 站定判定必须在切回 idle 之前取——mageIsSteady 以 castPhase 为前提
      const steady = mageIsSteady(this);
      this.castPhase = "idle";
      this.castCd = mageInterval(this);
      detonate(this, steady);
      break;
    }
  }
}
