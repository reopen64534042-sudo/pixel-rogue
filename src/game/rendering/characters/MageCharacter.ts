import type Phaser from "phaser";
import type { GameCore } from "../../core/GameCore";
import { mageWindup } from "../../core/MageSystem";
import { MAGE_BALANCE as MB } from "../../data/mageBalance";
import type { PixelPainter } from "../PixelPainter";

export const MAGE_CHARACTER = {
  texture: "character-mage-witch", image: "assets/characters/mage-witch-64x64.png",
  size: 64, columns: 4, rows: 12, directionFrames: 24,
  anchorX: 32, anchorY: 59, footY: 5, stride: 30,
} as const;
const START = { idle: 0, run: 4, chant: 12, release: 16, dash: 20 } as const;
const RELEASE_SECONDS = 0.18;
export function registerMageCharacter(textures: Phaser.Textures.TextureManager, image: HTMLImageElement): void {
  if (image.naturalWidth !== 256 || image.naturalHeight !== 768)
    throw new Error("Mage character sheet must be 256x768 pixels");
  if (!textures.exists(MAGE_CHARACTER.texture) && !textures.addSpriteSheet(MAGE_CHARACTER.texture, image, { frameWidth: 64, frameHeight: 64 }))
    throw new Error("Cannot register mage character sheet");
}

function stamp(painter: PixelPainter, frame: number, x: number, y: number): boolean {
  if (!painter.hasTexture(MAGE_CHARACTER.texture)) return false;
  painter.spriteFrame(MAGE_CHARACTER.texture, String(frame), {
    x: Math.round(x), y: Math.round(y) + MAGE_CHARACTER.footY,
    originX: MAGE_CHARACTER.anchorX / MAGE_CHARACTER.size,
    originY: MAGE_CHARACTER.anchorY / MAGE_CHARACTER.size,
    angle: 0, scaleX: 1, scaleY: 1,
  });
  return true;
}

/** Body-only witch presentation with a fixed world/foot anchor.
 * Only reads existing movement and cast phases; no skill-VFX bridge is required. */
export class MageCharacter {
  private player: GameCore["player"] | null = null;
  private time = 0;
  private x = 0;
  private y = 0;
  private left = false;
  private distance = 0;
  private frame: number | null = null;
  private releasedAt = Number.NEGATIVE_INFINITY;
  private previousPhase: GameCore["castPhase"] = "idle";

  reset(): void {
    this.player = null;
    this.frame = null;
    this.left = false;
    this.distance = 0;
    this.releasedAt = Number.NEGATIVE_INFINITY;
    this.previousPhase = "idle";
  }

  capture(core: GameCore): void {
    if (core.prof !== "mage" || core.mageWeapon === "domain" || core.state === "start") { this.reset(); return; }
    const p = core.player;
    if (this.player !== p || core.time < this.time) {
      this.reset(); this.player = p;
      this.previousPhase = core.castPhase;
      this.time = core.time; this.x = p.x; this.y = p.y;
      this.left = p.dx < 0;
    }
    const dt = core.time - this.time;
    if (dt === 0 && this.frame !== null) return;
    const dx = p.x - this.x, dy = p.y - this.y;
    const travel = Math.hypot(dx, dy), moved = travel > 0.01;
    const casting = core.castPhase === "windup" || core.castPhase === "cast";
    const dashing = p.dashT > 0;
    if (moved && Math.abs(dx) > 0.01) this.left = dx < 0;
    if (dashing && Math.abs(p.dx) > 0.01) this.left = p.dx < 0;
    if (!dashing && casting && Math.abs(core.castX - p.x) > 2) this.left = core.castX < p.x;
    // In the existing state machine only a completed cast reaches idle with
    // an expired cast timer; windup interruptions and mirror cancellation do not.
    if (this.previousPhase === "cast" && core.castPhase === "idle" && core.castT <= 0
      && core.state === "play" && core.magePhaseT <= 0 && core.mageElements.length > 0) {
      this.releasedAt = core.time;
      if (!dashing && Math.abs(core.castX - p.x) > 2) this.left = core.castX < p.x;
    }
    let pose: number;
    if (dashing) {
      pose = START.dash + Math.min(3, Math.max(0, Math.floor((1 - p.dashT / 0.16) * 4)));
    } else if (moved) {
      const backward = Math.abs(dx) > 0.01 && (dx < 0) !== this.left;
      this.distance += backward ? -travel : travel;
      const phase = ((this.distance / MAGE_CHARACTER.stride) % 1 + 1) % 1;
      const step = Math.min(7, Math.floor(phase * 8));
      pose = START.run + step;
    } else if (core.time - this.releasedAt < RELEASE_SECONDS) {
      pose = START.release + Math.min(3, Math.floor((core.time - this.releasedAt) / RELEASE_SECONDS * 4));
    } else if (casting) {
      const total = Math.max(0.001, mageWindup(core));
      const tail = total * (1 - MB.castWindupInterruptible / MB.castWindup);
      const remain = core.castPhase === "windup" ? core.castT + tail : core.castT;
      const progress = Math.max(0, Math.min(1, 1 - remain / total));
      pose = START.chant + Math.min(3, Math.floor(progress * 4));
    } else pose = START.idle + Math.floor(core.time * 3) % 4;
    this.frame = (this.left ? MAGE_CHARACTER.directionFrames : 0) + pose;
    this.previousPhase = core.castPhase;
    this.time = core.time; this.x = p.x; this.y = p.y;
  }

  draw(painter: PixelPainter, x: number, y: number): boolean {
    return this.frame !== null && stamp(painter, this.frame, x, y);
  }
}
