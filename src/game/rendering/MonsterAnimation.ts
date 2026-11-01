import type Phaser from "phaser";
import type { GameCore } from "../core/GameCore";
import type { Enemy, EnemyVisualEvent } from "../core/types";
import { isFrozen, isFrostLocked } from "../core/ElementMath";
import { enemyCodexKey } from "../data/enemies";
import { MONSTER_ART } from "../data/monsterArt";
import { MONSTER_POSES, type MonsterPose } from "./MonsterAnimationArt";
import type { PixelPainter } from "./PixelPainter";

export function preloadMonsterAnimation(scene: Phaser.Scene): void {
  for (const [key, art] of Object.entries(MONSTER_ART)) scene.load.spritesheet(`monster-motion:${key}`,
    `${import.meta.env.BASE_URL}assets/monsters/animation/${key}.png`, { frameWidth: art.size + 8, frameHeight: art.size + 8 });
}
interface Motion { x: number; y: number; distance: number; age: number; pose: MonsterPose; angle: number; }

/** Scene-owned presentation state, sampled only from real fixed-step movement and release events. */
export class MonsterAnimation {
  private motions = new Map<Enemy, Motion>();
  private player: GameCore["player"] | null = null;
  private time = -1;
  reset(): void { this.motions.clear(); this.player = null; this.time = -1; }
  capture(core: GameCore): void {
    if (this.player !== core.player || core.time < this.time || core.state === "start" || core.state === "over") this.reset();
    this.player = core.player;
    const dt = this.time < 0 ? 0 : Math.max(0, core.time - this.time);
    this.time = core.time;
    if (dt === 0 && this.motions.size > 0 && core.state === "play") return;
    const latest = new Map<Enemy, EnemyVisualEvent>();
    for (const v of core.enemyVisualEvents) latest.set(v.source, v);
    const living = new Set(core.enemies.filter(e => !e.dead && !e.boss));
    for (const e of this.motions.keys()) if (!living.has(e)) this.motions.delete(e);
    for (const e of living) {
      let m = this.motions.get(e);
      if (!m) { m = { x: e.x, y: e.y, distance: 0, age: 0, pose: "idle", angle: 0 }; this.motions.set(e, m); }
      const dx = e.x - m.x, dy = e.y - m.y, moved = Math.hypot(dx, dy);
      const controlled = e.frozenT > 0 || isFrozen(e) || isFrostLocked(e) || (e.stunT ?? 0) > 0 || (e.domainStunUntil ?? 0) > core.time;
      m.x = e.x; m.y = e.y;
      if (controlled || core.state !== "play") continue;
      m.age += dt;
      if (moved > 0.01) { m.distance += Math.min(moved, 8); m.angle = Math.atan2(dy, dx); }
      const v = latest.get(e), released = v && core.time - v.at < 0.24;
      if (e.action) {
        m.angle = e.action.angle;
        const k = 1 - e.action.t / e.action.max;
        m.pose = e.action.phase === "windup" ? k < 0.55 ? "windup-a" : "windup-b" :
          e.action.kind === "tether" ? Math.floor(m.age * 12) % 2 ? "channel-a" : "channel-b" : k < 0.45 ? "strike-a" : "strike-b";
      } else if ((e.novaT ?? 0) > 0 || e.fuse > 0 || e.chargeState === "windup" || e.burrowState === "dive" || e.burrowState === "surface") {
        const urgent = e.fuse > 0 ? e.fuse < 0.2 : (e.novaT ?? 0) > 0 ? (e.novaT ?? 0) < 0.2 : (e.chargeT ?? e.burrowT ?? 1) < 0.2;
        m.pose = urgent ? "windup-b" : "windup-a";
      } else if (e.chargeState === "dash") m.pose = Math.floor(m.age * 16) % 2 ? "strike-a" : "strike-b";
      else if (released) { m.angle = v.angle; m.pose = core.time - v.at < 0.1 ? "strike-a" : "recover"; }
      else if (e.guard && e.guard.downT > 0) m.pose = "break";
      else if (e.flash > 0) m.pose = "hurt";
      else if (e.type === "drummer" || e.type === "drummer_elite") m.pose = Math.floor(m.age * 6) % 3 === 0 ? "strike-b" : "windup-a";
      else if (e.type === "shooter" && e.shootCd > 0 && e.shootCd < 0.25 && Math.hypot(core.player.x - e.x, core.player.y - e.y) < 210) m.pose = "windup-a";
      else m.pose = moved > 0.01 ? Math.floor(m.distance / 5) % 2 ? "move-a" : "move-b" : "idle";
    }
  }
  draw(ctx: PixelPainter, e: Enemy): boolean {
    const key = enemyCodexKey(e.type, e.elite), art = MONSTER_ART[key], m = this.motions.get(e);
    const texture = `monster-motion:${key}`;
    if (!art || !m || !ctx.hasTexture(texture) || e.burrowState === "under") return false;
    const launch = m.pose === "strike-a" ? 1 : m.pose === "recover" ? -1 : 0;
    ctx.spriteFrame(texture, String(MONSTER_POSES.indexOf(m.pose)), {
      x: Math.round(e.x + Math.cos(m.angle) * launch), y: Math.round(e.y + Math.sin(m.angle) * launch),
      angle: 0, scaleX: 1, scaleY: 1, originX: 0.5, originY: 0.5,
    });
    return true;
  }
}
