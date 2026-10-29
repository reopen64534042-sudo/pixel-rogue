import { MAGE_BALANCE as MB } from "../data/mageBalance";
import { WORLD, clamp } from "../data/constants";
import { applyMageHit, mageDamageType } from "./ElementSystem";
import type { GameCore } from "./GameCore";
import type { Enemy, MageCastPhase } from "./types";

/**
 * 法师施法系统（S3）。
 *
 * 法师的门控是**时间**：必须熬过前摇与施法间隔，被打断则这一发完全作废。
 * 因此本模块提供：
 * - 施法状态机（抬手 → 收束 → 爆裂 → 间隔）；
 * - 落点选取（射程内最密集处 + 按前摇时长做速度提前量）；
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

/** 法阵半径（广域符印 +20%，聚爆 +50%，站定 +20%）。 */
export function mageCircleRadius(
  core: GameCore,
  isCharge: boolean,
  steady = false,
): number {
  const p = core.player;
  let r = MB.circleRadius * p.area;
  if ((p.upCounts["广域符印"] || 0) > 0) r *= MB.wideSealAreaMul;
  if (isCharge && (p.upCounts["三连聚爆"] || 0) > 0) r *= MB.burstRadiusMul;
  if (steady) r *= MB.steadyRadiusMul;
  return r;
}

/** 法阵伤害（元素蓄能 / 三连聚爆 只作用于满充能的那一发；站定 +20%）。 */
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

/** 射程内「最密集处」：统计每个敌人周围 90px 内的敌人数，取最多者。 */
function findDensest(core: GameCore, range: number): Enemy | null {
  const p = core.player;
  let best: Enemy | null = null;
  let bestN = -1;
  for (const c of core.enemies) {
    if (c.dead) continue;
    if (Math.hypot(c.x - p.x, c.y - p.y) > range) continue;
    let n = 0;
    for (const o of core.enemies) {
      if (o.dead) continue;
      if (Math.hypot(o.x - c.x, o.y - c.y) < 90) n++;
    }
    if (n > bestN) {
      bestN = n;
      best = c;
    }
  }
  return best;
}

/**
 * 落点：最密集处 + 速度提前量。
 *
 * 提前量按「敌人在前摇时长内会移动的距离」估算。敌人 AI 是朝玩家移动，
 * 因此方向取「敌人 → 玩家」；这只是一个近似（敌人类型不同会后撤或横向游走），
 * 但它让法阵不至于总落在敌人身后 —— 提前量取 0 时近距离敌人几乎不会被命中。
 */
function resolveCastPoint(
  core: GameCore,
  target: Enemy,
): { x: number; y: number } {
  const p = core.player;
  const a = Math.atan2(p.y - target.y, p.x - target.x);
  const lead = target.speed * mageWindup(core);
  return {
    x: clamp(target.x + Math.cos(a) * lead, 16, WORLD.w - 16),
    y: clamp(target.y + Math.sin(a) * lead, 16, WORLD.h - 16),
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
  const dmg = mageCircleDamage(core, isCharge, steady);
  const R = mageCircleRadius(core, isCharge, steady);
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
 * 残影落点方向：与「玩家→最近敌人」垂直。
 *
 * 为什么不留在玩家脚下：实机反馈「怪物仍围着玩家的虚影打」——残影和玩家
 * 同坐标时，敌人只是在原地继续打同一个点，看不出仇恨被拉走。偏到侧面
 * 36px 后，敌人会明显转向，玩家才有脱离窗口。
 */
function decoyAngle(core: GameCore): number {
  const p = core.player;
  let nearest: Enemy | null = null;
  let best = Infinity;
  for (const e of core.enemies) {
    if (e.dead) continue;
    const d = Math.hypot(e.x - p.x, e.y - p.y);
    if (d < best) {
      best = d;
      nearest = e;
    }
  }
  if (!nearest) return Math.atan2(p.dy, p.dx) + Math.PI / 2;
  return Math.atan2(nearest.y - p.y, nearest.x - p.x) + Math.PI / 2;
}

/**
 * 镜像：留下残影吸引仇恨，自身进入 1 秒虚影。
 *
 * 虚影期间：不可受击（damagePlayer 直接挡下）、无视碰撞（敌人接触判定跳过）、
 * 不能施法（施法状态机跳过）。
 *
 * 残影是**限时仇恨源**（`mirrorDecoyDuration` 秒），不因接触而破碎：
 * 旧实现 hp=1，而触发条件正是「被贴脸打中」——残影生成当帧就被同一个敌人
 * 打掉，仇恨转移从未发生。现在它活满时长，敌人会持续追它。
 */
export function triggerMirrorDecoy(this: GameCore): boolean {
  const core = this;
  const p = core.player;
  if ((p.upCounts["镜像"] || 0) <= 0) return false;
  if (core.mageMirrorCd > 0) return false;
  core.mageMirrorCd = MB.mirrorCooldown;
  const a = decoyAngle(core);
  core.mageDecoys.push({
    x: clamp(p.x + Math.cos(a) * MB.mirrorDecoyOffset, 24, WORLD.w - 24),
    y: clamp(p.y + Math.sin(a) * MB.mirrorDecoyOffset, 24, WORLD.h - 24),
    t: MB.mirrorDecoyDuration,
  });
  core.magePhaseT = MB.mirrorDuration;
  core.addText(p.x, p.y - 12, "镜像", "#c07bff");
  core.audio.beep(660, 0.12, "triangle", 0.05, 240);
  return true;
}

/* ================= 路线B：星陨 / 多重陨星 / 元素残域 ================= */

function updateMeteorRoute(core: GameCore, dt: number) {
  const p = core.player;
  core.mageMeteorT -= dt;
  if (core.mageMeteorT <= 0) {
    core.mageMeteorT = MB.meteorInterval;
    const target = findDensest(core, p.attackRange);
    if (target) {
      const count =
        (p.upCounts["多重陨星"] || 0) > 0 ? MB.meteorCount : 1;
      const type = mageDamageType(p);
      // 落点提前量：陨星有 0.8 秒预警，敌人这段时间会朝玩家移动；
      // 不算提前量时落点永远在敌人身后，整条路线打空（实测 dmgBy.meteor=0）。
      const toPlayer = Math.atan2(p.y - target.y, p.x - target.x);
      const lead = target.speed * MB.meteorFall;
      const leadX = target.x + Math.cos(toPlayer) * lead;
      const leadY = target.y + Math.sin(toPlayer) * lead;
      for (let i = 0; i < count; i++) {
        // 多颗陨星的偏移用固定角度排布（不用随机数，保持确定性）
        const a = (i / count) * Math.PI * 2;
        core.mageMeteors.push({
          x: clamp(leadX + Math.cos(a) * 26, 16, WORLD.w - 16),
          y: clamp(leadY + Math.sin(a) * 26, 16, WORLD.h - 16),
          t: MB.meteorFall,
          R: MB.meteorRadius,
          element: type,
        });
      }
    }
  }
  for (let i = core.mageMeteors.length - 1; i >= 0; i--) {
    const m = core.mageMeteors[i];
    m.t -= dt;
    if (m.t > 0) continue;
    core.mageMeteors.splice(i, 1);
    const dmg = p.damage * MB.meteorDamageMul;
    for (const e of core.enemies) {
      if (e.dead) continue;
      const dx = e.x - m.x;
      const dy = e.y - m.y;
      if (dx * dx + dy * dy > m.R * m.R) continue;
      core.hurtEnemy(e, dmg, 0, 0, {
        noChain: true,
        src: "meteor",
        type: m.element,
        form: "other",
      });
      applyMageHit(core, e, dmg);
    }
    // 元素残域：落点留下持续领域
    if ((p.upCounts["元素残域"] || 0) > 0)
      core.mageDomains.push({
        x: m.x,
        y: m.y,
        R: MB.domainRadius,
        t: MB.domainDuration,
        element: m.element,
      });
    core.shake = Math.min(core.shake + 3, 6);
    core.audio.beep(90, 0.25, "sawtooth", 0.07, -40);
  }
  // 元素残域：持续伤害
  const dps = p.damage * MB.domainDpsMul;
  for (let i = core.mageDomains.length - 1; i >= 0; i--) {
    const d = core.mageDomains[i];
    d.t -= dt;
    if (d.t <= 0) {
      core.mageDomains.splice(i, 1);
      continue;
    }
    for (const e of core.enemies) {
      if (e.dead) continue;
      const dx = e.x - d.x;
      const dy = e.y - d.y;
      if (dx * dx + dy * dy > d.R * d.R) continue;
      core.hurtEnemy(e, dps * dt, 0, 0, {
        noCrit: true,
        noChain: true,
        src: "element",
        type: d.element,
        form: "other",
      });
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
    updateMeteorRoute(this, dt);
    return;
  }
  switch (this.castPhase as MageCastPhase) {
    case "idle": {
      this.castCd -= dt;
      if (this.castCd > 0) break;
      const target = findDensest(this, p.attackRange);
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
