import type Phaser from "phaser";
import type { GameCore } from "../../core/GameCore";
import type { ShooterWeapon } from "../../core/types";
import { PALETTE_HEX as C } from "../../data/palette";
import type { PixelPainter } from "../PixelPainter";

export const SHOOTER_CHARACTER = {
  bodyKey: "character-shooter-scout", bodyImage: "assets/characters/shooter-scout-body-64x64.png",
  weaponKey: "character-shooter-weapons", weaponImage: "assets/characters/shooter-scout-weapons-32x24.png",
  size: 64, anchorX: 32, anchorY: 59, footY: 5,
  directionFrames: 20, stride: 28,
} as const;
export type ShooterEchoDrawing = (x: number, y: number, angle: number, alpha: number) => boolean;
const WEAPON_ROW: Readonly<Record<ShooterWeapon, number>> = { charged: 0, laser: 1, missile: 2 };
const ECHO_COLOR = Number.parseInt(C.iceCyan.slice(1), 16);
type BodyAction = "idle" | "run" | "brace" | "dash";
const BODY_START: Readonly<Record<BodyAction, number>> = { idle: 0, run: 4, brace: 12, dash: 16 };
const RUN_LIFT = [0, 0, 1, 1, 0, 0, 1, 1] as const;

export function registerShooterCharacter(textures: Phaser.Textures.TextureManager, body: HTMLImageElement, weapons: HTMLImageElement): void {
  if (body.naturalWidth !== 256 || body.naturalHeight !== 640 || weapons.naturalWidth !== 128 || weapons.naturalHeight !== 72)
    throw new Error("Shooter sheets must be 256x640 and 128x72 pixels");
  if (!textures.exists(SHOOTER_CHARACTER.bodyKey) && !textures.addSpriteSheet(SHOOTER_CHARACTER.bodyKey, body, { frameWidth: 64, frameHeight: 64 }))
    throw new Error("Cannot register shooter body");
  if (!textures.exists(SHOOTER_CHARACTER.weaponKey) && !textures.addSpriteSheet(SHOOTER_CHARACTER.weaponKey, weapons, { frameWidth: 32, frameHeight: 24 }))
    throw new Error("Cannot register shooter weapons");
}

/** Presentation state belongs to this Scene; the simulation and its events stay read-only. */
export class ShooterCharacter {
  private player: GameCore["player"] | null = null;
  private time = 0;
  private x = 0;
  private y = 0;
  private angle = 0;
  private left = false;
  private weapon: ShooterWeapon = "charged";
  private action: BodyAction = "idle";
  private elapsed = 0;
  private frame: number | null = null;
  private weaponFrame = 0;
  private shotAt = Number.NEGATIVE_INFINITY;
  private shotTotal = 0;
  private counter = 0;
  private fireCd = 0;
  private wasDashing = false;
  private rounds = 0;
  private bodyAlpha = 1;
  private runDistance = 0;
  private runLift = 0;

  reset(): void {
    this.player = null;
    this.frame = null;
    this.elapsed = 0;
    this.action = "idle";
    this.shotAt = Number.NEGATIVE_INFINITY;
    this.shotTotal = 0;
    this.counter = this.fireCd = this.rounds = 0;
    this.wasDashing = false;
    this.bodyAlpha = 1;
    this.runDistance = this.runLift = 0;
  }

  capture(core: GameCore): void {
    if (core.prof !== "shooter") { this.reset(); return; }
    const p = core.player;
    if (this.player !== p || core.time < this.time || this.weapon !== core.shooterWeapon) {
      this.reset();
      this.player = p;
      this.time = core.time;
      this.x = p.x; this.y = p.y;
      this.weapon = core.shooterWeapon;
      this.angle = Math.atan2(p.dy, p.dx);
      this.left = p.dx < 0;
    }
    const dt = core.time - this.time;
    if (dt === 0 && this.frame !== null) return;
    const moveX = p.x - this.x, moveY = p.y - this.y;
    const movedDistance = Math.hypot(moveX, moveY);
    const moved = movedDistance > 0.01;
    if (moved && core.time - this.shotAt > 0.3) this.angle = Math.atan2(p.dy, p.dx);
    let active = false, reloading = false, progress = 0;
    if (this.weapon === "laser") {
      const laser = core.laser;
      if (laser.aimReady) this.angle = laser.angle;
      active = laser.phase === "channel";
      reloading = laser.phase === "recharge";
      progress = laser.total > 0 ? 1 - laser.remaining / laser.total : 0;
    } else if (this.weapon === "missile") {
      const missile = core.missile;
      if (missile.rounds !== this.rounds) {
        this.shotAt = core.time;
        for (let i = missile.launches.length - 1; i >= 0; i--) {
          const launch = missile.launches[i];
          if (!launch.micro && Math.hypot(launch.x - p.x, launch.y - (p.y - 3)) < 12) {
            this.angle = launch.angle;
            break;
          }
        }
      }
      active = core.time - this.shotAt < 0.16;
      reloading = missile.reload > 0;
      progress = missile.reloadTotal > 0 ? 1 - missile.reload / missile.reloadTotal : 0;
    } else {
      // A dash can advance the charged-shot counter without firing a projectile.
      const dashLoad = this.wasDashing && p.dashT <= 0 && (p.upCounts["双段疾冲"] || 0) > 0 ? 1 : 0;
      if (core.shotCounter !== this.counter + dashLoad && p.fireCd > this.fireCd + 0.000001) {
        this.shotAt = core.time;
        this.shotTotal = p.fireCd;
        const bullet = core.bullets[core.bullets.length - 1];
        if (bullet) this.angle = Math.atan2(bullet.vy, bullet.vx);
      }
      active = core.time - this.shotAt < 0.12;
      reloading = !active && p.fireCd > 0 && core.time - this.shotAt <= this.shotTotal;
      progress = this.shotTotal > 0 ? 1 - p.fireCd / this.shotTotal : 0;
    }
    this.weaponFrame = active ? 1 : reloading ? progress < 0.5 ? 2 : 3 : 0;
    const cos = Math.cos(this.angle);
    if (Math.abs(cos) > 0.1) this.left = cos < 0;
    let action: BodyAction, frame: number;
    if (p.dashT > 0) {
      action = "dash";
      frame = Math.min(3, Math.max(0, Math.floor((1 - p.dashT / 0.16) * 4)));
    } else if (moved) {
      action = "run";
      const backing = moveX * Math.cos(this.angle) + moveY * Math.sin(this.angle) < -0.01;
      const travel = backing ? -movedDistance : movedDistance;
      this.runDistance = ((this.runDistance + travel) % SHOOTER_CHARACTER.stride + SHOOTER_CHARACTER.stride) % SHOOTER_CHARACTER.stride;
      frame = Math.floor(this.runDistance / SHOOTER_CHARACTER.stride * 8) % 8;
    } else if (active) {
      action = "brace";
      frame = this.weapon === "laser" ? Math.floor((core.laser.total - core.laser.remaining) * 8) % 4
        : Math.min(3, Math.max(0, Math.floor((core.time - this.shotAt) * 25)));
    } else {
      action = "idle";
      this.elapsed = this.action === action ? this.elapsed + Math.max(0, dt) : 0;
      frame = Math.floor(this.elapsed * 3) % 4;
    }
    if (action !== this.action) this.elapsed = 0;
    this.action = action;
    this.runLift = action === "run" ? RUN_LIFT[frame] : 0;
    this.frame = (this.left ? SHOOTER_CHARACTER.directionFrames : 0) + BODY_START[action] + frame;
    this.counter = core.shotCounter; this.fireCd = p.fireCd; this.rounds = core.missile.rounds;
    this.wasDashing = p.dashT > 0;
    this.time = core.time; this.x = p.x; this.y = p.y;
  }

  private ready(painter: PixelPainter): boolean {
    return this.frame !== null && painter.hasTexture(SHOOTER_CHARACTER.bodyKey) && painter.hasTexture(SHOOTER_CHARACTER.weaponKey);
  }

  private body(painter: PixelPainter, frame: number, x: number, y: number, silhouette?: number): void {
    painter.spriteFrame(SHOOTER_CHARACTER.bodyKey, String(frame), {
      x: Math.round(x), y: Math.round(y) + 5, originX: 0.5, originY: 59 / 64,
      angle: 0, scaleX: 1, scaleY: 1, silhouette,
    });
  }

  private device(painter: PixelPainter, weapon: ShooterWeapon, frame: number, x: number, y: number, angle: number, silhouette?: number): void {
    painter.spriteFrame(SHOOTER_CHARACTER.weaponKey, String(WEAPON_ROW[weapon] * 4 + frame), {
      x: Math.round(x), y: Math.round(y) - 3, originX: 17 / 32, originY: 0.5,
      angle, scaleX: 1, scaleY: Math.cos(angle) < 0 ? -1 : 1, silhouette,
    });
  }

  drawBody(painter: PixelPainter, x: number, y: number): boolean {
    if (!this.ready(painter) || this.frame === null) return false;
    this.bodyAlpha = painter.globalAlpha;
    this.body(painter, this.frame, x, y - this.runLift);
    return true;
  }

  /** Draw after projectiles so a bolt born in the receiver stays behind its barrel. */
  drawWeapon(painter: PixelPainter): void {
    if (!this.ready(painter)) return;
    const previous = painter.globalAlpha;
    painter.globalAlpha = this.bodyAlpha;
    try { this.device(painter, this.weapon, this.weaponFrame, this.x, this.y, this.angle); }
    finally { painter.globalAlpha = previous; }
  }

  /** Laser echoes keep one frozen braced silhouette at the actual old line position. */
  drawEcho(painter: PixelPainter, x: number, y: number, angle: number, alpha: number): boolean {
    if (!this.ready(painter) || this.weapon !== "laser") return false;
    const previous = painter.globalAlpha;
    painter.globalAlpha = alpha;
    try {
      this.body(painter, (Math.cos(angle) < 0 ? SHOOTER_CHARACTER.directionFrames : 0) + BODY_START.brace, x, y, ECHO_COLOR);
      this.device(painter, "laser", 1, x, y, angle, ECHO_COLOR);
    } finally { painter.globalAlpha = previous; }
    return true;
  }
}
