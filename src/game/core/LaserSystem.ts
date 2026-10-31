import { LASER as LB, LASER_UPGRADES, LASER_XP, createLaserState, getLaserAim } from "../data/laser";
import type { LaserAim, LaserLane, LaserLine, LaserUpgradeId } from "../data/laser";
import { LASER_DAMAGE as LD } from "../data/combatBalance";
import { WORLD } from "../data/constants";
import { getPlayerCombatStats } from "./CombatStats";
import {
  laserAuxDps, laserDps, laserEscapeDamage, laserExposureDamage,
  laserFocusMultiplier, laserLaneDamage, laserPierceMultiplier, laserPierceRetention, laserPulseDamage,
} from "./DamageMath";
import type { GameCore } from "./GameCore";
import type { CombatStatsSnapshot, Enemy } from "./types";

const has = (core: GameCore, name: string) => (core.player.upCounts[name] ?? 0) > 0;
const upgraded = (core: GameCore, id: LaserUpgradeId) => core.laserUpgrades.includes(id);
export const laserRange = (core: GameCore) => core.player.attackRange * (upgraded(core, "long") ? 1.25 : 1);
export const laserDuration = (core: GameCore) => upgraded(core, "capacitor") ? 1.3 : LB.duration;
export const laserRecharge = (core: GameCore) => upgraded(core, "cooling") ? 0.2 : LB.recharge;
export const laserBeamCount = (core: GameCore) => upgraded(core, "triple") ? 3 : 1;
export const laserWidth = (core: GameCore) => LB.width * core.player.area * (upgraded(core, "wide") ? 1.5 : 1);

function angleDifference(a: number, b: number) {
  return Math.atan2(Math.sin(a - b), Math.cos(a - b));
}

/** 矩形束身＋圆形端点；按沿束距离排序，决定贯穿衰减。 */
function lineHits(core: GameCore, line: LaserLine): Enemy[] {
  const dx = line.x2 - line.x, dy = line.y2 - line.y;
  const length2 = dx * dx + dy * dy;
  if (length2 <= 0) return [];
  const along = (e: Enemy) => ((e.x - line.x) * dx + (e.y - line.y) * dy) / length2;
  return core.enemies.filter(e => {
    if (e.dead) return false;
    const t = Math.max(0, Math.min(1, along(e)));
    return Math.hypot(e.x - line.x - t * dx, e.y - line.y - t * dy) <= e.r + line.width / 2;
  }).sort((a, b) => along(a) - along(b));
}

function makeLine(core: GameCore, x: number, y: number, angle: number, length: number,
  kind: LaserLine["kind"], dps: number, life = 0): LaserLine {
  const dx = Math.cos(angle), dy = Math.sin(angle);
  // 束身到达世界边界即结束，与真实碰撞线完全共用。
  const edgeX = dx > 0 ? (WORLD.w - x) / dx : dx < 0 ? -x / dx : Infinity;
  const edgeY = dy > 0 ? (WORLD.h - y) / dy : dy < 0 ? -y / dy : Infinity;
  const reach = Math.max(0, Math.min(length, edgeX, edgeY));
  return { x, y, x2: x + dx * reach, y2: y + dy * reach,
    width: laserWidth(core), kind, dps, t: life, max: life,
    stats: core.laser.stats ?? getPlayerCombatStats(core.player), lane: 0 };
}

function activeAims(core: GameCore): { lane: LaserLane; aim: LaserAim }[] {
  const lanes: LaserLane[] = laserBeamCount(core) === 3 ? [0, -1, 1] : [0];
  return lanes.map(lane => ({ lane, aim: getLaserAim(core.laser, lane) }));
}

/** 先保留有效且不同的锁定，再为剩余束找空闲目标；不足时允许集火。 */
function selectTargets(core: GameCore) {
  const p = core.player, range = laserRange(core);
  const distance = (e: Enemy) => (e.x - p.x) ** 2 + (e.y - p.y) ** 2;
  const candidates = core.enemies.filter(e => !e.dead && distance(e) <= range * range)
    .sort((a, b) => distance(a) - distance(b));
  const valid = new Set(candidates);
  const claimed = new Set<Enemy>();
  const pending: LaserAim[] = [];
  for (const { aim } of activeAims(core)) {
    if (aim.target && valid.has(aim.target) && !claimed.has(aim.target)) claimed.add(aim.target);
    else pending.push(aim);
  }
  for (const aim of pending) {
    const next = candidates.find(e => !claimed.has(e)) ??
      (aim.target && valid.has(aim.target) ? aim.target : candidates[0] ?? null);
    // 猎手接力在击杀时清 target 并保留部分焦点；普通失锁则清空。
    if (aim.target && aim.target !== next) { aim.focus = 0; aim.focusMiss = 0; }
    aim.target = next;
    if (next) claimed.add(next);
  }
}

/** 每束由自身方向决定枪口位置，允许同时向前、后、侧面发射。 */
function mainLines(core: GameCore): LaserLine[] {
  const p = core.player;
  return activeAims(core).filter(({ aim }) => aim.aimReady).map(({ lane, aim }) => ({
    ...makeLine(core, p.x + Math.cos(aim.angle) * 7, p.y - 3 + Math.sin(aim.angle) * 7,
      aim.angle, Math.max(0, laserRange(core) - 7), "main", laserLaneDamage(core.laser.dps, lane)),
    lane,
  }));
}

function addAux(core: GameCore, line: LaserLine) {
  const l = core.laser;
  if (l.aux.length >= LB.auxCap) l.aux.shift();
  l.aux.push(line);
}

function recordDamage(core: GameCore, e: Enemy, damage: number, crit: boolean) {
  if (damage <= 0) return;
  const l = core.laser;
  const text = l.texts.get(e) ?? { amount: 0, crit: false, next: core.time + LB.textInterval };
  text.amount += damage;
  text.crit ||= crit;
  l.texts.set(e, text);
}

function flushTexts(core: GameCore) {
  for (const [e, entry] of core.laser.texts) {
    if (core.time < entry.next && !e.dead) continue;
    core.addText(e.x, e.y - e.r - 3, Math.max(1, Math.round(entry.amount)),
      entry.crit ? "#ffd24a" : "#bafaff", entry.crit);
    core.laser.texts.delete(e);
  }
}

/** 主束一目标每 0.4s 一个暴击/命中特效窗口；附属束没有触发收益。 */
function settleExposure(core: GameCore) {
  const l = core.laser, p = core.player;
  let healed = 0;
  for (const [e, raw] of l.pendingMain) {
    if (e.dead || raw <= 0) continue;
    let proc = l.procs.get(e);
    const ready = !proc || core.time + 1e-9 >= proc.next;
    if (ready) {
      proc = { next: core.time + LB.procInterval, crit: Math.random() < (l.stats?.critChance ?? p.crit) };
      l.procs.set(e, proc);
    }
    const pressure = ready && has(core, "光压退敌") ? LB.pressureKnock : 0;
    const distance = Math.hypot(e.x - p.x, e.y - p.y) || 1;
    const result = core.hurtEnemy(e, raw, (e.x - p.x) / distance * pressure,
      (e.y - p.y) / distance * pressure, {
        src: "laser", type: "physical", form: "ranged", continuous: true,
        critical: proc?.crit ?? false, noOnHit: !ready, noChain: !ready,
        noLifesteal: true, silent: true, attackerStats: l.stats ?? undefined,
      });
    if (!result) continue;
    recordDamage(core, e, result.effectiveHpLoss, result.isCritical);
    // 实际 HP 损失决定吸血；整把武器共享 2% 最大生命/秒预算，多目标不能突破。
    const heal = Math.min(l.healBudget, Math.max(0, p.maxhp - p.hp),
      result.effectiveHpLoss * p.lifesteal * 0.3);
    p.hp = Math.min(p.maxhp, p.hp + heal);
    l.healBudget -= heal;
    healed += heal;
    if (result.killed) {
      if (has(core, "余能回收")) l.recycle = Math.min(LB.recycleCap, l.recycle + LB.recyclePerKill);
      for (const { aim } of activeAims(core)) if (aim.target === e) {
        aim.focus = has(core, "猎手接力") ? aim.focus * LD.focusRelay : 0;
        aim.target = null;
      }
    }
  }
  l.pendingMain.clear();
  if (healed > 0) l.heals.push({ at: core.time, amount: healed });
  for (const [e, snapshots] of l.pendingAux) {
    for (const [stats, raw] of snapshots) {
      if (e.dead || raw <= 0) break;
      const result = core.hurtEnemy(e, raw, 0, 0, {
        src: "laser", type: "physical", form: "ranged", continuous: true,
        noCrit: true, noOnHit: true, noChain: true, noLifesteal: true,
        fromExplode: true, silent: true, attackerStats: stats,
      });
      if (result) recordDamage(core, e, result.effectiveHpLoss, false);
    }
  }
  l.pendingAux.clear();
  for (const e of l.procs.keys()) if (e.dead) l.procs.delete(e);
  flushTexts(core);
}

function accumulateAux(core: GameCore, lines: { line: LaserLine; dt: number }[]) {
  // 同一帧重叠余辉/残像只取单目标最高伤害；三束主光束单独积分。
  const strongest = new Map<Enemy, { raw: number; stats: Readonly<CombatStatsSnapshot> }>();
  for (const { line, dt } of lines) {
    if (line.dps <= 0 || dt <= 0) continue;
    const raw = laserExposureDamage(line.dps, dt);
    for (const e of lineHits(core, line)) {
      if (raw > (strongest.get(e)?.raw ?? 0)) strongest.set(e, { raw, stats: line.stats });
    }
  }
  for (const [e, { raw, stats }] of strongest) {
    const snapshots = core.laser.pendingAux.get(e) ?? new Map<Readonly<CombatStatsSnapshot>, number>();
    snapshots.set(stats, (snapshots.get(stats) ?? 0) + raw);
    core.laser.pendingAux.set(e, snapshots);
  }
}

function gainLaserXp(core: GameCore, seconds: number) {
  if (core.tutorialMode || core.laserLevel >= LASER_XP.length) return;
  const l = core.laser;
  const xp = Math.max(0, Math.min(seconds * LB.xpPerSecond, LB.xpPerCycle - l.cycleXp));
  l.cycleXp += xp;
  core.laserXp += xp;
  while (core.laserLevel < LASER_XP.length) {
    const need = LASER_XP[core.laserLevel - 1];
    if (need === null || core.laserXp < need) break;
    core.laserXp -= need;
    core.laserLevel++;
    if (core.laserLevel >= 4) {
      const pool = LASER_UPGRADES.filter(u => u.minLevel <= core.laserLevel && !upgraded(core, u.id));
      if (pool.length) core.laserUpgrades.push(pool[Math.floor(Math.random() * pool.length)].id);
    }
    core.audio.beep(1046, 0.12, "triangle", 0.04, 200);
  }
  if (core.laserLevel >= LASER_XP.length) core.laserXp = 0;
}

function firePulse(core: GameCore) {
  const l = core.laser;
  const collapse = upgraded(core, "collapse");
  const melted: LaserAim[] = [];
  let fired = false;
  const retention = laserPierceRetention(upgraded(core, "pierce"), has(core, "偏振穿透"));
  const damage = new Map<Enemy, number>();
  for (const beam of mainLines(core)) {
    const aim = getLaserAim(l, beam.lane);
    const meltdown = has(core, "熔断") && aim.focus >= 1;
    if (!meltdown && !collapse) continue;
    if (meltdown) melted.push(aim);
    fired = true;
    const line: LaserLine = { ...beam, kind: "pulse", t: 0.12, max: 0.12, dps: 0,
      pulse: meltdown ? "meltdown" : "collapse" };
    const base = laserLaneDamage(laserPulseDamage(core.player, meltdown, collapse), line.lane ?? 0);
    lineHits(core, line).forEach((e, index) => {
      const raw = laserExposureDamage(base, 1, laserPierceMultiplier(retention, index));
      damage.set(e, (damage.get(e) ?? 0) + raw);
    });
    addAux(core, line);
  }
  for (const [e, raw] of damage) {
    core.hurtEnemy(e, raw, 0, 0, { src: "laser", type: "physical", form: "ranged", noCrit: true,
      noOnHit: true, noChain: true, noLifesteal: true, fromExplode: true });
  }
  for (const aim of melted) aim.focus = 0;
  if (!fired) return;
  core.audio.beep(180, 0.1, "sawtooth", 0.04, -100);
}

function emergencyScatter(core: GameCore) {
  const l = core.laser, p = core.player;
  if (l.escapeCd > 0 || !has(core, "紧急散射")) return;
  const target = core.nearestEnemy(p.x, p.y, LB.escapeRange);
  if (!target) return;
  l.escapeCd = LB.escapeCooldown;
  const angle = Math.atan2(target.y - p.y, target.x - p.x);
  for (const e of core.enemies) {
    if (e.dead) continue;
    const distance = Math.hypot(e.x - p.x, e.y - p.y);
    const a = Math.atan2(e.y - p.y, e.x - p.x);
    if (distance > LB.escapeRange + e.r || Math.abs(angleDifference(a, angle)) > LB.escapeArc / 2) continue;
    core.hurtEnemy(e, laserEscapeDamage(p), Math.cos(a) * LB.escapeKnock, Math.sin(a) * LB.escapeKnock,
      { src: "laser", type: "physical", form: "ranged", noCrit: true, noChain: true,
        noOnHit: true, noLifesteal: true, fromExplode: true });
  }
  for (const offset of [-LB.escapeArc / 2, 0, LB.escapeArc / 2]) {
    addAux(core, { ...makeLine(core, p.x, p.y - 3, angle + offset, LB.escapeRange,
      "pulse", 0, 0.12), pulse: "scatter" });
  }
}

/** 从 PlayerSystem 的实际冲刺入口调用，按下但未成功冲刺不会触发。 */
export function laserDash(this: GameCore) {
  if (this.prof !== "shooter" || this.shooterWeapon !== "laser") return;
  const l = this.laser;
  if (l.phase === "channel" && has(this, "折光步")) {
    for (const line of mainLines(this))
      addAux(this, { ...line, kind: "echo", dps: laserAuxDps(line.dps, "echo"), t: LB.echoLife, max: LB.echoLife });
  }
  if (l.phase === "recharge" && has(this, "冷却滑行") && !l.dashCoolingUsed) {
    l.remaining *= LB.coolingDash;
    l.dashCoolingUsed = true;
  }
}

export function updateLaser(this: GameCore, dt: number) {
  if (this.prof !== "shooter" || this.shooterWeapon !== "laser") return;
  if (this.wavePhase !== "fight" && !this.tutorialMode) {
    if (this.laser.phase !== "idle" || this.laser.aux.length || this.laser.texts.size) {
      settleExposure(this);
      this.laser = createLaserState();
    }
    return;
  }
  const l = this.laser, p = this.player;
  l.lines = [];
  l.contacts = [];
  l.escapeCd = Math.max(0, l.escapeCd - dt);
  l.heals = l.heals.filter(entry => this.time - entry.at < 1);
  l.healBudget = Math.max(0, p.maxhp * LB.lifeStealHpPerSecond -
    l.heals.reduce((sum, entry) => sum + entry.amount, 0));
  const auxiliary = l.aux.map(line => ({ line, dt: Math.min(dt, line.t) }));
  for (const line of l.aux) line.t -= dt;
  l.aux = l.aux.filter(line => line.t > 0);
  emergencyScatter(this);
  if (l.phase === "recharge") {
    l.remaining = Math.max(0, l.remaining - dt);
    if (l.remaining <= 0) l.phase = "idle";
  }
  selectTargets(this);
  if (l.phase === "idle" && l.target) {
    l.phase = "channel";
    l.remaining = l.total = laserDuration(this);
    l.cycleXp = 0;
    l.recycle = 0;
    l.dashCoolingUsed = false;
    l.afterglowT = 0;
    l.stats = getPlayerCombatStats(p);
    l.dps = laserDps(p, this.laserLevel);
    this.audio.beep(880, 0.07, "sine", 0.025, 60);
  }
  if (l.phase === "channel") {
    const active = Math.min(dt, l.remaining);
    const turn = LB.turnRate * (upgraded(this, "stable") ? 1.35 : 1) * (has(this, "稳束扫描") ? 1.4 : 1) * active;
    for (const { aim } of activeAims(this)) if (aim.target) {
      const desired = Math.atan2(aim.target.y - (p.y - 3), aim.target.x - p.x);
      if (!aim.aimReady) { aim.angle = desired; aim.aimReady = true; }
      else aim.angle += Math.max(-turn, Math.min(turn, angleDifference(desired, aim.angle)));
    }
    const beams = mainLines(this);
    const exposures = beams.map(line => ({ line, hits: lineHits(this, line) }));
    l.lines.push(...beams);
    const targets = new Set(exposures.flatMap(exposure => exposure.hits));
    // 每束只为自己的锁定目标累积焦点，聚焦速度不随束数提高。
    const focused = !!l.target && targets.has(l.target);
    for (const { line, hits } of exposures) {
      const aim = getLaserAim(l, line.lane);
      if (has(this, "锁相") && aim.target && hits.includes(aim.target)) {
        const far = has(this, "远距校准") && Math.hypot(aim.target.x - p.x, aim.target.y - p.y) >= laserRange(this) * 0.6;
        aim.focus = Math.min(1, aim.focus + active / LB.focusTime * (far ? LD.farFocusSpeed : 1));
        aim.focusMiss = 0;
      } else {
        aim.focusMiss += active;
        if (aim.focusMiss > (has(this, "预热电池") ? 0.4 : LB.focusGrace)) aim.focus = 0;
      }
    }
    const retention = laserPierceRetention(upgraded(this, "pierce"), has(this, "偏振穿透"));
    const shown = new Set<Enemy>();
    for (const { line, hits } of exposures) {
      const aim = getLaserAim(l, line.lane);
      const a = Math.atan2(line.y2 - line.y, line.x2 - line.x);
      const length = Math.hypot(line.x2 - line.x, line.y2 - line.y);
      const ux = Math.cos(a), uy = Math.sin(a);
      const focusIndex = aim.target ? hits.indexOf(aim.target) : -1;
      hits.forEach((e, index) => {
        const hot = has(this, "热穿") && aim.focus >= LD.highFocus && focusIndex >= 0 && index > focusIndex;
        const attenuation = laserPierceMultiplier(retention, hot ? focusIndex : index);
        const focus = e === aim.target && has(this, "锁相") ? laserFocusMultiplier(aim.focus) : 1;
        const raw = laserExposureDamage(line.dps, active, attenuation, focus);
        // 相同目标的三束伤害合并，仍只使用一个暴击/命中特效窗口。
        l.pendingMain.set(e, (l.pendingMain.get(e) ?? 0) + raw);
        if ((!shown.has(e) && shown.size < 6) || e === aim.target) {
          const along = Math.max(0, Math.min(length, (e.x - line.x) * ux + (e.y - line.y) * uy));
          l.contacts.push({ x: line.x + ux * along, y: line.y + uy * along,
            target: e === aim.target, lane: line.lane });
          shown.add(e);
        }
      });
    }
    if (targets.size) gainLaserXp(this, active);
    if (this.tutorialMode && focused && this.tutorialStep === 3) {
      this.tutorialSpecialHits += active;
      if (this.tutorialSpecialHits >= 2) this.tutorialProfDone = true;
    }
    if (upgraded(this, "afterglow")) {
      l.afterglowT -= active;
      if (l.afterglowT <= 0) {
        for (const line of beams)
          addAux(this, { ...line, kind: "afterglow", dps: laserAuxDps(line.dps, "afterglow"),
            t: LB.afterglowLife, max: LB.afterglowLife });
        l.afterglowT = LB.afterglowInterval;
      }
    }
    l.remaining = Math.max(0, l.remaining - active);
    if (l.remaining <= 0) {
      // 先结算最后一段照射，死亡与焦点接力均在收束脉冲之前完成。
      accumulateAux(this, auxiliary);
      auxiliary.length = 0;
      settleExposure(this);
      firePulse(this);
      l.phase = "recharge";
      l.remaining = l.total = Math.max(0.05, laserRecharge(this) - l.recycle);
      l.lines = [];
      l.contacts = [];
    }
  }
  accumulateAux(this, auxiliary);
  l.tickT += dt;
  if (l.tickT + 1e-9 >= LB.tick) {
    l.tickT = Math.max(0, l.tickT - LB.tick);
    settleExposure(this);
  }
  flushTexts(this);
}

/** DEV 面板复用相同等级门控；不提供生产环境控制入口。 */
export function devSetLaserLevel(this: GameCore, level: number) {
  if (!Number.isFinite(level)) return;
  this.laserLevel = Math.max(1, Math.min(LASER_XP.length, Math.floor(level)));
  this.laserXp = 0;
  this.laserUpgrades = [];
  for (let lv = 4; lv <= this.laserLevel; lv++) {
    const next = LASER_UPGRADES.find(u => u.minLevel <= lv && !upgraded(this, u.id));
    if (next) this.laserUpgrades.push(next.id);
  }
  this.laser = createLaserState();
}
