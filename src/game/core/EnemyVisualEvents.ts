import type { GameCore } from "./GameCore";
import type { Enemy, EnemyVisualKind, Point } from "./types";

/** Bounded, deterministic presentation events; does not consume combat RNG. */
export function emitEnemyVisual(core: GameCore, source: Enemy, kind: EnemyVisualKind,
  at: Point = source, radius = source.r, angle = Math.atan2(core.player.y - source.y, core.player.x - source.x)): void {
  if (core.enemyVisualEvents.length >= 192) core.enemyVisualEvents.shift();
  core.enemyVisualEvents.push({ kind, source, x: at.x, y: at.y, at: core.time,
    duration: kind === "shot" || kind === "contact" ? 0.24 : kind === "blink" ? 0.4 : 0.65, angle, radius });
}
