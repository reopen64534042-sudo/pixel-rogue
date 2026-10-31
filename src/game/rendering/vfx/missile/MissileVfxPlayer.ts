import { PALETTE_HEX } from "../../../data/palette";
import { MISSILE_CLIPS, MISSILE_GEOMETRY, type MissileClip } from "./missileAssets";

export type MissileLook = "heavy" | "micro" | "ion";
export interface MissileFlightPose {
  x: number; y: number; angle: number;
  /** Simulation age; neither wall time nor a second animation timer. */
  age: number;
  ejectDuration: number;
  igniteDuration: number;
  look: MissileLook;
  trail: readonly { x: number; y: number; age: number }[];
}
export interface MissileLaunchPose {
  x: number; y: number; angle: number; age: number; micro?: boolean;
}
export interface MissileImpactPose {
  x: number; y: number; age: number; radius: number; look: MissileLook;
}
export interface MissileArcPose {
  x: number; y: number; x2: number; y2: number; age: number;
}
export interface MissileVfxSnapshot {
  flights: readonly MissileFlightPose[];
  launches: readonly MissileLaunchPose[];
  impacts: readonly MissileImpactPose[];
  arcs: readonly MissileArcPose[];
}
export type MissileVfxCommand = {
  kind: "sprite"; clip: MissileClip; frame: number;
  x: number; y: number; angle: number; scaleX: number; scaleY: number; alpha: number;
} | {
  kind: "line"; x: number; y: number; x2: number; y2: number;
  color: string; width: number; alpha: number;
};

/** One-shot clips disappear at the end; loops wrap exactly at their duration. */
export function sampleMissileClip(clip: MissileClip, seconds: number): number | null {
  if (!Number.isFinite(seconds) || seconds < 0) return null;
  const c = MISSILE_CLIPS[clip];
  if (!c.loop && seconds >= c.duration) return null;
  let remaining = c.loop ? seconds % c.duration : seconds;
  for (let index = 0; index < c.frameDurations.length; index++) {
    if (remaining < c.frameDurations[index]) return index;
    remaining -= c.frameDurations[index];
  }
  return c.frames.length - 1;
}

/** Stateless artwork sampler: does not own movement, targets, impacts, damage or clocks. */
export function missileVfxCommands(snapshot: MissileVfxSnapshot): MissileVfxCommand[] {
  const commands: MissileVfxCommand[] = [];
  const sprite = (clip: MissileClip, age: number, x: number, y: number, angle = 0, scale = 1, alpha = 1, scaleX = scale) => {
    const frame = sampleMissileClip(clip, age);
    if (frame === null || alpha <= 0 || scale <= 0 || scaleX <= 0) return;
    commands.push({ kind: "sprite", clip, frame, x, y, angle, scaleX, scaleY: scale, alpha: Math.min(1, alpha) });
  };
  // Low-contrast dust stays below projectiles and short bright impact cores.
  for (const impact of snapshot.impacts) {
    const scale = impact.radius / MISSILE_GEOMETRY.referenceBlastRadius;
    sprite("smoke", impact.age - 0.1, impact.x, impact.y, 0, scale, 0.3 * Math.max(0, 1 - impact.age / 0.69));
  }
  for (const launch of snapshot.launches) {
    sprite("eject", launch.age, launch.x, launch.y, launch.angle, launch.micro ? 0.6 : 1, 0.45);
  }
  for (const flight of snapshot.flights) {
    if (flight.age < 0) continue;
    const micro = flight.look === "micro", charged = flight.look === "ion";
    const body: MissileClip = micro ? "micro-body" : "body";
    // At most the newest eight historical segments; all are visual, never hitboxes.
    const trail = flight.trail.slice(-9);
    for (let i = 1; i < trail.length; i++) {
      const a = trail[i - 1], b = trail[i];
      const fade = Math.max(0, 1 - Math.max(a.age, b.age) / 0.24);
      if (!fade) continue;
      commands.push({ kind: "line", x: a.x, y: a.y, x2: b.x, y2: b.y,
        color: PALETTE_HEX[charged ? "iceDeep" : "steelMid"], width: 1, alpha: fade * (micro ? 0.15 : 0.22) });
    }
    const engineAge = flight.age - flight.ejectDuration;
    const nozzle = micro ? MISSILE_GEOMETRY.microNozzleOffset : MISSILE_GEOMETRY.nozzleOffset;
    const nx = flight.x + Math.cos(flight.angle) * nozzle;
    const ny = flight.y + Math.sin(flight.angle) * nozzle;
    if (engineAge >= 0) {
      const ignition = engineAge < flight.igniteDuration;
      const clip: MissileClip = charged ? "ion-exhaust" : ignition ? "ignite" : "exhaust";
      const progress = flight.igniteDuration > 0 ? Math.min(1, engineAge / flight.igniteDuration) : 1;
      const time = charged ? engineAge : ignition ? progress * MISSILE_CLIPS.ignite.duration : engineAge - flight.igniteDuration;
      sprite(clip, time, nx, ny, flight.angle, micro ? 0.65 : 1, charged && ignition ? progress : 1);
    }
    sprite(body, 0, flight.x, flight.y, flight.angle);
  }
  for (const impact of snapshot.impacts) {
    const micro = impact.look === "micro";
    const scale = impact.radius / (micro ? MISSILE_GEOMETRY.referenceMicroRadius : MISSILE_GEOMETRY.referenceBlastRadius);
    sprite(micro ? "micro-blast" : impact.look === "ion" ? "ion-blast" : "blast",
      impact.age, impact.x, impact.y, 0, scale, Math.min(1, Math.max(0, (0.52 - impact.age) / 0.12)));
    if (!micro) sprite("debris", impact.age - 0.03, impact.x, impact.y, 0, scale, 0.75 * Math.max(0, 1 - impact.age / 0.5));
  }
  for (const arc of snapshot.arcs) {
    const dx = arc.x2 - arc.x, dy = arc.y2 - arc.y, length = Math.hypot(dx, dy);
    if (!length) continue;
    // Each link has one shared material phase; no separate timer per segment.
    const pieces = Math.max(1, Math.ceil(length / 24)), size = length / pieces;
    for (let i = 0; i < pieces; i++) sprite("arc", arc.age, arc.x + dx * i / pieces, arc.y + dy * i / pieces,
      Math.atan2(dy, dx), 0.65, Math.max(0, 1 - arc.age / MISSILE_CLIPS.arc.duration), size / MISSILE_CLIPS.arc.width);
  }
  return commands;
}
