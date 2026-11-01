import { WORLD, clamp } from "../data/constants";
import { BULWARK_GUARD, ETYPES, EYE_SLOW, MONSTER_SKILLS as S } from "../data/enemies";
import { ELEMENTAL_MAGE } from "../data/elementalMage";
import type { DamageTypeId } from "../data/damageTypes";
import type { Enemy, EnemyAction, EnemyActionKind, Point } from "./types";
import type { GameCore } from "./GameCore";
import { enemySkillDamage } from "./DamageMath";
import { isParalyzed } from "./ElementMath";
import { addHostileHazard } from "./HostileHazards";
import { emitEnemyVisual } from "./EnemyVisualEvents";

export function interruptEnemyAction(e: Enemy): void {
  if (e.action?.kind === "thrust" && e.guard) e.guard.downT = S.thrust.guardDown;
  delete e.action;
}

export function enemyLineContains(p: Point, action: EnemyAction, length: number, width: number, radius = 0): boolean {
  const dx = Math.cos(action.angle), dy = Math.sin(action.angle);
  const along = clamp((p.x - action.x) * dx + (p.y - action.y) * dy, 0, length);
  return Math.hypot(p.x - action.x - dx * along, p.y - action.y - dy * along) <= width / 2 + radius;
}

function begin(e: Enemy, kind: EnemyActionKind, at: Point, angle: number): void {
  const max = S[kind].windup;
  e.action = { kind, phase: "windup", x: at.x, y: at.y, angle, t: max, max, tickT: 0, ticks: 0, hit: false };
}

function hit(core: GameCore, e: Enemy, skill: Exclude<EnemyActionKind, "blink">,
  type: DamageTypeId, aura: number, slow = false, knock = 0): void {
  const p = core.player;
  if (p.hurtCd > 0 || p.dashT > 0) return;
  const result = core.damagePlayer(enemySkillDamage(e.dmg, skill, aura), {
    src: e, type, form: type === "physical" ? "melee" : "ranged",
    cause: skill === "tether" || skill === "gaze" ? "projectile" : "explosion",
  });
  if (core.state !== "play" || result.effectiveHpLoss <= 0) return;
  if (slow) core.enemySlowT = Math.max(core.enemySlowT, EYE_SLOW.duration);
  if (knock) {
    const dx = p.x - e.x, dy = p.y - e.y, d = Math.hypot(dx, dy) || 1;
    p.x = clamp(p.x + dx / d * knock, 24, WORLD.w - 24);
    p.y = clamp(p.y + dy / d * knock, 24, WORLD.h - 24);
  }
}

function circle(core: GameCore, at: Point, radius: number): boolean {
  return Math.hypot(core.player.x - at.x, core.player.y - at.y) <= radius;
}

function advance(core: GameCore, e: Enemy, a: EnemyAction, dt: number, aura: number): void {
  a.t -= dt;
  if (a.phase === "windup") {
    if (a.t > 1e-8) return;
    const radius = a.kind === "lob" ? S.lob.radius : a.kind === "stomp" ? S.stomp.radius :
      a.kind === "collapse" ? S.collapse.radius : a.kind === "sonic" ? S.sonic.radius : e.r;
    emitEnemyVisual(core, e, a.kind, a, radius, a.angle);
    switch (a.kind) {
      case "lob":
        if (circle(core, a, S.lob.radius)) hit(core, e, "lob", "fire", aura);
        if (core.state !== "play") return;
        addHostileHazard(core, { kind: "fire", x: a.x, y: a.y, r: S.lob.groundRadius,
          t: S.lob.groundLife, tickT: S.lob.tick, interval: S.lob.tick,
          dmg: enemySkillDamage(e.dmg, "fireGround", aura, S.lob.tick), slowF: 0, source: e });
        break;
      case "gaze":
        if (enemyLineContains(core.player, a, S.gaze.length, S.gaze.width, core.player.r)) hit(core, e, "gaze", "lightning", aura, true);
        break;
      case "collapse":
        if (circle(core, a, S.collapse.radius)) hit(core, e, "collapse", "lightning", aura, true);
        break;
      case "stomp":
        if (circle(core, a, S.stomp.radius)) hit(core, e, "stomp", "physical", aura, false, S.stomp.knock);
        break;
      case "blink":
        e.x = clamp(a.x + Math.cos(a.angle) * S.blink.distance, 20, WORLD.w - 20);
        e.y = clamp(a.y + Math.sin(a.angle) * S.blink.distance, 20, WORLD.h - 20);
        emitEnemyVisual(core, e, "blink", e, 18, a.angle);
        break;
      case "thrust": case "tether": case "sonic": {
        a.phase = "active";
        a.t = a.max = S[a.kind].duration;
        a.tickT = a.kind === "tether" ? S.tether.tick : 0;
        return;
      }
    }
    // Keep the resolved geometry visible briefly; these frames never apply damage again.
    a.phase = "active";
    a.t = a.max = 0.2;
    return;
  }
  if (a.kind === "tether") {
    a.tickT -= dt;
    if (a.tickT <= 1e-8 && a.t >= -1e-8 && a.ticks < S.tether.ticks) {
      a.tickT += S.tether.tick;
      a.ticks++;
      if (enemyLineContains(core.player, a, S.tether.length, S.tether.width, core.player.r)) hit(core, e, "tether", "lightning", aura);
    }
  } else if (a.kind === "thrust") {
    const remaining = Math.max(0, a.t + dt);
    const moved = S.thrust.distance * Math.min(dt, remaining) / S.thrust.duration;
    const old = { ...a, x: e.x, y: e.y };
    e.x = clamp(e.x + Math.cos(a.angle) * moved, 20, WORLD.w - 20);
    e.y = clamp(e.y + Math.sin(a.angle) * moved, 20, WORLD.h - 20);
    if (!a.hit && enemyLineContains(core.player, old, moved, S.thrust.width, core.player.r)) {
      a.hit = true;
      hit(core, e, "thrust", "physical", aura);
    }
  } else if (a.kind === "sonic") {
    const r0 = S.sonic.radius * Math.max(0, 1 - (a.t + dt) / a.max);
    const r1 = S.sonic.radius * Math.min(1, 1 - a.t / a.max);
    const d = Math.hypot(core.player.x - a.x, core.player.y - a.y);
    if (!a.hit && d + core.player.r >= r0 && d - core.player.r <= r1) {
      a.hit = true;
      hit(core, e, "sonic", "physical", aura);
    }
    for (const ally of core.enemies) {
      if (ally === e || ally.dead || ally.boss) continue;
      const dist = Math.hypot(ally.x - a.x, ally.y - a.y);
      if (dist + ally.r >= r0 && dist - ally.r <= r1) ally.rallyUntil = core.time + S.sonic.rally;
    }
  }
  if (a.t <= 1e-8) {
    if (a.kind === "thrust" && e.guard) e.guard.downT = S.thrust.guardDown;
    delete e.action;
  }
}

function keepDistance(e: Enemy, target: Point, speed: number, dt: number, near: number, far: number): void {
  const dx = target.x - e.x, dy = target.y - e.y, d = Math.hypot(dx, dy) || 1;
  const direction = d < near ? -1 : d > far ? 1 : 0;
  e.x += dx / d * speed * direction * dt;
  e.y += dy / d * speed * direction * dt;
}

/** Only new species and the existing brute elite enter this dispatcher. Old AI and RNG stay in place. */
export function updateEnemyBehavior(core: GameCore, e: Enemy, target: Point, speed: number, aura: number, dt: number): boolean {
  const behavior = ETYPES[e.type]?.behavior;
  const bruteElite = e.type === "brute" && e.elite;
  if (!behavior && !bruteElite) return false;
  e.actionCd = Math.max(0, (e.actionCd ?? e.shootCd) - dt);
  e.secondaryCd = Math.max(0, (e.secondaryCd ?? 3) - dt);
  e.blinkCd = Math.max(0, (e.blinkCd ?? 0) - dt);
  const d = Math.hypot(target.x - e.x, target.y - e.y);
  const angle = Math.atan2(target.y - e.y, target.x - e.x);
  const cdMul = isParalyzed(e) ? 1 + ELEMENTAL_MAGE.paralyze.attackSlow : 1;
  if (behavior === "bulwark") {
    e.guard ??= { angle, ...BULWARK_GUARD, downT: 0 };
    e.guard.downT = Math.max(0, e.guard.downT - dt);
    if (!e.action) e.guard.angle = angle;
  }
  if (e.action) {
    if (e.action.phase === "windup" && e.action.kind !== "lob" && e.action.kind !== "collapse" && e.action.kind !== "blink") {
      e.action.x = e.x; e.action.y = e.y;
    }
    // Roots block displacement actions as well as normal walking.
    if ((e.domainRootUntil ?? 0) > core.time && (e.action.kind === "blink" || e.action.kind === "thrust")) interruptEnemyAction(e);
    else advance(core, e, e.action, dt, aura);
    return true;
  }
  let kind: EnemyActionKind | undefined;
  if (bruteElite && d <= S.stomp.range && e.actionCd <= 0) kind = "stomp";
  else if (behavior === "lobber" && d <= S.lob.range && e.actionCd <= 0) kind = "lob";
  else if (behavior === "bulwark" && d <= S.thrust.range && e.actionCd <= 0) kind = "thrust";
  else if (behavior === "tether" && d <= S.tether.range && e.actionCd <= 0) kind = "tether";
  else if (behavior === "drummerElite" && d <= S.sonic.range && e.actionCd <= 0) kind = "sonic";
  else if (behavior === "eyeElite") {
    if (d < S.blink.range && e.blinkCd <= 0 && (e.domainRootUntil ?? 0) <= core.time) kind = "blink";
    else if (d <= S.collapse.range && e.secondaryCd <= 0) kind = "collapse";
    else if (d <= S.gaze.range && e.actionCd <= 0) kind = "gaze";
  }
  if (kind) {
    begin(e, kind, kind === "lob" || kind === "collapse" ? target : e, kind === "blink" ? angle + Math.PI : angle);
    if (kind === "blink") e.blinkCd = S.blink.cooldown * cdMul;
    else if (kind === "collapse") e.secondaryCd = S.collapse.cooldown * cdMul;
    else e.actionCd = S[kind].cooldown * cdMul;
    core.audio.beep(kind === "lob" ? 180 : 420, 0.1, "triangle", 0.03, 80);
  } else {
    if (behavior === "lobber") keepDistance(e, target, speed, dt, 140, 280);
    else if (behavior === "tether") keepDistance(e, target, speed, dt, 120, 220);
    else if (behavior === "eyeElite") keepDistance(e, target, speed, dt, 160, 240);
    else if (behavior === "drummerElite") keepDistance(e, target, speed, dt, 100, 160);
    else keepDistance(e, target, speed, dt, 0, 0);
  }
  return true;
}
