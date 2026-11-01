import { WORLD, VIEW, clamp } from "../data/constants";
import { BURROWER, CHARGER_CHARGE, DRUMMER_AURA, ELITE_DRUMMER_AURA, ELITE_NOVA, MONSTER_SKILLS as S, WEB_ZONE } from "../data/enemies";
import { PALETTE_HEX as C } from "../data/palette";
import { isFrozen, isFrostLocked } from "../core/ElementMath";
import type { GameCore } from "../core/GameCore";
import type { Enemy, EnemyBullet, EnemyVisualKind } from "../core/types";
import type { PixelPainter } from "./PixelPainter";
import { drawMonsterEffect, monsterWarningCircle, monsterWarningLane, type MonsterFxKind } from "./MonsterFxRecipes";

const RELEASE_FX: Readonly<Record<EnemyVisualKind, MonsterFxKind>> = {
  contact: "impact", shot: "muzzle", explosion: "fire", split: "slime", web: "muzzle", emerge: "emerge",
  charge: "stone", summon: "summon", nova: "frost", lob: "fire", thrust: "crystal", tether: "beam",
  stomp: "stone", gaze: "gaze", collapse: "rift", blink: "rift", sonic: "pulse",
};
function held(e: Enemy, time: number): boolean {
  return e.frozenT > 0 || isFrozen(e) || isFrostLocked(e) || (e.stunT ?? 0) > 0 || (e.domainStunUntil ?? 0) > time;
}
function visible(core: GameCore, x: number, y: number, radius: number): boolean {
  return x + radius >= core.cam.x - 24 && y + radius >= core.cam.y - 24 && x - radius <= core.cam.x + VIEW.w + 24 && y - radius <= core.cam.y + VIEW.h + 24;
}

/** All monster ground effects share one rendering path; exact warning geometry remains data-owned. */
export function drawEnemySkills(core: GameCore, ctx: PixelPainter): void {
  for (const h of core.hazards) {
    // Boss has the same recipes through its own preview-compatible view adapter.
    if (h.source?.boss || !visible(core, h.x, h.y, h.r)) continue;
    drawMonsterEffect(ctx, h.kind === "fire" ? "fire-ground" : h.kind === "frost" ? "frost-ground" : "lightning",
      1 - Math.min(1, h.t / 0.5), { ...h, radius: h.r, time: core.time, seed: h.x + h.y }, C);
  }
  for (const z of core.webZones) {
    if (!visible(core, z.x, z.y, z.R)) continue;
    if (z.arm > 0) monsterWarningCircle(ctx, z.x, z.y, z.R, 1 - z.arm / WEB_ZONE.arm, C);
    else {
      drawMonsterEffect(ctx, "web", 0, { ...z, radius: z.R, time: core.time }, C);
      const since = WEB_ZONE.duration - z.t;
      if (since < 0.2) drawMonsterEffect(ctx, "muzzle", since / 0.2, { ...z, radius: 10 }, C);
    }
  }
  for (const e of core.enemies) {
    if (e.dead || e.boss || !visible(core, e.x, e.y, 300)) continue;
    const seed = e.seed, time = core.time;
    if (e.guard) {
      drawMonsterEffect(ctx, "guard", e.guard.downT > 0 ? 1 : 0, { ...e, radius: e.r + 5, angle: e.guard.angle, arc: e.guard.arc, seed }, C);
      if (e.guard.downT > 0.5) drawMonsterEffect(ctx, "crystal", (S.thrust.guardDown - e.guard.downT) / 0.3,
        { ...e, radius: 15, angle: e.guard.angle }, C);
    }
    if ((e.type === "drummer" || e.type === "drummer_elite") && !held(e, time)) {
      const aura = e.type === "drummer_elite" ? ELITE_DRUMMER_AURA : DRUMMER_AURA;
      drawMonsterEffect(ctx, "aura", 0, { ...e, radius: aura.radius, seed, time }, C);
      drawMonsterEffect(ctx, "pulse", (time * 1.4 + seed) % 1, { ...e, radius: 14, seed, time }, C);
    }
    if (e.fuse > 0) {
      monsterWarningCircle(ctx, e.x, e.y, 38 + core.player.r, 1 - e.fuse / 0.5, C);
      drawMonsterEffect(ctx, "fire-ground", 0.1, { ...e, radius: 5, time: time * 2, seed }, C);
    }
    if (e.burrowState === "under") drawMonsterEffect(ctx, "burrow", 0, { ...e, radius: 10, seed, time }, C);
    if (e.burrowState === "surface") monsterWarningCircle(ctx, e.x, e.y, 24, 1 - (e.burrowT ?? 0) / BURROWER.surface, C);
    if (e.chargeState === "windup") monsterWarningLane(ctx, {
      ...e, radius: e.r, angle: Math.atan2(e.chargeDy ?? 0, e.chargeDx ?? 1),
      length: CHARGER_CHARGE.distance, width: (e.r + core.player.r) * 2,
    }, 1 - (e.chargeT ?? 0) / CHARGER_CHARGE.windup, C);
    if (e.chargeState === "dash") drawMonsterEffect(ctx, "dash", (time * 5 + seed) % 1,
      { ...e, radius: 28, angle: Math.atan2(e.chargeDy ?? 0, e.chargeDx ?? 1), seed, time }, C);
    if ((e.novaT ?? 0) > 0) monsterWarningCircle(ctx, e.x, e.y, ELITE_NOVA.radius, 1 - (e.novaT ?? 0) / ELITE_NOVA.windup, C, 0, true);
    const a = e.action;
    if (!a) continue;
    const k = clamp(1 - a.t / a.max, 0, 1), geometry = { ...a, radius: 16, seed, time };
    if (a.phase === "windup") {
      if (a.kind === "tether" || a.kind === "gaze" || a.kind === "thrust") monsterWarningLane(ctx,
        { ...geometry, length: S[a.kind].length, width: S[a.kind].width }, k, C);
      else if (a.kind === "blink") {
        const x = clamp(a.x + Math.cos(a.angle) * S.blink.distance, 20, WORLD.w - 20);
        const y = clamp(a.y + Math.sin(a.angle) * S.blink.distance, 20, WORLD.h - 20);
        drawMonsterEffect(ctx, "rift", k * 0.7, { x, y, radius: 12, seed, time }, C);
      } else {
        const radius = a.kind === "lob" ? S.lob.radius : a.kind === "stomp" ? S.stomp.radius : a.kind === "collapse" ? S.collapse.radius : S.sonic.radius;
        monsterWarningCircle(ctx, a.x, a.y, radius, k, C);
        if (a.kind === "lob") drawMonsterEffect(ctx, "lob-flight", k, { x: e.x, y: e.y, radius: 4, endX: a.x, endY: a.y }, C);
      }
    } else if (a.kind === "tether") drawMonsterEffect(ctx, "beam", 0.2,
      { ...geometry, length: S.tether.length, width: S.tether.width }, C);
    else if (a.kind === "thrust") drawMonsterEffect(ctx, "crystal", k, { ...geometry, x: e.x, y: e.y, radius: 20 }, C);
    else if (a.kind === "sonic") drawMonsterEffect(ctx, "pulse", k, { ...geometry, radius: S.sonic.radius }, C);
  }
  for (const v of core.enemyVisualEvents) {
    if (v.kind === "tether" || v.kind === "thrust" || v.kind === "sonic" || !visible(core, v.x, v.y, Math.max(v.radius, 300))) continue;
    const k = (core.time - v.at) / v.duration;
    if (k < 0 || k > 1) continue;
    drawMonsterEffect(ctx, RELEASE_FX[v.kind], k, {
      ...v, radius: v.radius, length: v.kind === "gaze" ? S.gaze.length : undefined,
      width: v.kind === "gaze" ? S.gaze.width : undefined, seed: v.source.seed, time: core.time,
    }, C);
  }
}

/** Visible core matches the existing projectile radius; directional trail is cosmetic. */
export function drawMonsterProjectile(ctx: PixelPainter, b: EnemyBullet, time: number): void {
  drawMonsterEffect(ctx, "projectile", 0, { ...b, radius: b.r, angle: Math.atan2(b.vy, b.vx),
    time, tint: b.reflected ? C.iceCyan : C.danger }, C);
}
