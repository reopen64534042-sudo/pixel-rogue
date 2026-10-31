import type Phaser from "phaser";
import type { GameCore } from "../../core/GameCore";
import { WARRIOR_BALANCE as WB } from "../../data/warriorBalance";
import type { PixelPainter } from "../PixelPainter";

export const GREATSWORD_CHARACTER = {
  texture: "character-greatsword-mercenary",
  image: "assets/characters/greatsword-mercenary-96x96.png",
  frameSize: 96,
  columns: 4,
  rows: 16,
  anchorX: 48,
  anchorY: 83,
  footOffsetY: 5,
} as const;

type Action = "idle" | "run" | "attack" | "dash" | "heavy" | "takeoff" | "air" | "land";
const ACTION_ROW: Readonly<Record<Action, number>> = {
  idle: 0, run: 1, attack: 2, dash: 3, heavy: 4, takeoff: 5, air: 6, land: 7,
};
// The hit is already settled when Slash is emitted; show the cut immediately.
const CUT_FRAMES = [2, 2, 3, 0] as const;
const phaseFrame = (elapsed: number, duration: number) =>
  Math.min(3, Math.max(0, Math.floor(elapsed / duration * 4)));

export function registerGreatswordCharacter(textures: Phaser.Textures.TextureManager, image: HTMLImageElement): void {
  const { texture, frameSize, columns, rows } = GREATSWORD_CHARACTER;
  if (image.naturalWidth !== frameSize * columns || image.naturalHeight !== frameSize * rows)
    throw new Error("Greatsword character sheet must be 384x1536 pixels");
  if (textures.exists(texture)) return;
  if (!textures.addSpriteSheet(texture, image, { frameWidth: frameSize, frameHeight: frameSize }))
    throw new Error("Cannot register greatsword character sheet");
}

/** Scene-owned animation, driven only by actual simulation state and hit events. */
export class GreatswordCharacter {
  private player: GameCore["player"] | null = null;
  private time = 0;
  private x = 0;
  private y = 0;
  private direction: "right" | "left" = "right";
  private action: Action = "idle";
  private elapsed = 0;
  private frame: number | null = null;
  private latestSlashStart = Number.NEGATIVE_INFINITY;

  reset(): void {
    this.player = null;
    this.frame = null;
    this.elapsed = 0;
    this.action = "idle";
    this.direction = "right";
    this.latestSlashStart = Number.NEGATIVE_INFINITY;
  }

  capture(core: GameCore): void {
    if (core.prof !== "warrior" || core.warriorStyle !== "greatsword") {
      this.reset();
      return;
    }
    const p = core.player;
    if (this.player !== p || core.time < this.time) {
      this.reset();
      this.player = p;
      this.time = core.time;
      this.x = p.x;
      this.y = p.y;
      this.direction = p.dx < 0 ? "left" : "right";
    }
    const dt = core.time - this.time;
    if (dt === 0 && this.frame !== null) return;
    const moved = Math.hypot(p.x - this.x, p.y - this.y) > 0.01;
    if (moved && Math.abs(p.dx) > 0.01) this.direction = p.dx < 0 ? "left" : "right";
    let slash: GameCore["slashes"][number] | undefined;
    for (let i = core.slashes.length - 1; i >= 0; i--) {
      const candidate = core.slashes[i];
      const started = core.time - (candidate.max - candidate.life);
      if (candidate.weapon === "greatsword" && candidate.life > 0 &&
          Math.hypot(candidate.x - p.x, candidate.y - p.y) < 28 &&
          started >= this.latestSlashStart - 0.000001) {
        slash = candidate;
        // A longer-lived old impact cannot resume after a newer normal cut expires.
        this.latestSlashStart = Math.max(this.latestSlashStart, started);
        break;
      }
    }
    const leap = core.warriorLeapState;
    let action: Action, frame: number;
    if (leap) {
      const dx = leap.x - leap.fromX;
      if (Math.abs(dx) > 0.01) this.direction = dx < 0 ? "left" : "right";
      if (leap.phase === "windup") {
        action = "takeoff";
        frame = phaseFrame(leap.elapsed, WB.leapWindup);
      } else {
        action = "air";
        frame = phaseFrame(leap.elapsed - WB.leapWindup, WB.leapFall);
      }
    } else if (p.dashT > 0) {
      action = "dash";
      frame = phaseFrame(0.16 - p.dashT, 0.16);
    } else if (slash) {
      const facing = Math.cos(slash.a);
      if (!slash.impact && Math.abs(facing) > 0.1) this.direction = facing < 0 ? "left" : "right";
      const progress = phaseFrame(slash.max - slash.life, slash.max);
      action = slash.impact ? "land" : slash.heavy ? "heavy" : "attack";
      frame = slash.impact ? progress : CUT_FRAMES[progress];
    } else {
      action = moved ? "run" : "idle";
      this.elapsed = action === this.action ? this.elapsed + Math.max(0, dt) : 0;
      frame = Math.floor(this.elapsed * (action === "run" ? 8 : 3)) % 4;
    }
    if (action !== this.action) this.elapsed = 0;
    this.action = action;
    this.frame = (this.direction === "left" ? 32 : 0) + ACTION_ROW[action] * 4 + frame;
    this.time = core.time;
    this.x = p.x;
    this.y = p.y;
  }

  /** Caller retains the existing leap height, alpha, depth and camera behavior. */
  draw(painter: PixelPainter, x: number, y: number): boolean {
    if (this.frame === null || !painter.hasTexture(GREATSWORD_CHARACTER.texture)) return false;
    const { texture, frameSize, anchorX, anchorY, footOffsetY } = GREATSWORD_CHARACTER;
    painter.spriteFrame(texture, String(this.frame), {
      x: Math.round(x), y: Math.round(y) + footOffsetY,
      originX: anchorX / frameSize, originY: anchorY / frameSize,
      angle: 0, scaleX: 1, scaleY: 1,
    });
    return true;
  }
}
