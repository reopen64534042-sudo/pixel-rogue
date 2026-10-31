import type Phaser from "phaser";
import type { GameCore } from "../../core/GameCore";
import type { PixelPainter } from "../PixelPainter";

export const KATANA_CHARACTER = {
  texture: "character-katana-ronin",
  image: "assets/characters/katana-ronin-64x64.png",
  frameSize: 64,
  columns: 4,
  rows: 8,
  anchorX: 32,
  anchorY: 59,
  footOffsetY: 5,
} as const;

type Action = "idle" | "run" | "attack" | "dash";
const ACTION_ROW: Readonly<Record<Action, number>> = { idle: 0, run: 1, attack: 2, dash: 3 };
// Hits already settle when a Slash is emitted: start on the cut, never add a windup.
const ATTACK_FRAMES = [2, 2, 3, 0] as const;

export function registerKatanaCharacter(textures: Phaser.Textures.TextureManager, image: HTMLImageElement): void {
  const { texture, frameSize, columns, rows } = KATANA_CHARACTER;
  if (image.naturalWidth !== frameSize * columns || image.naturalHeight !== frameSize * rows)
    throw new Error("Katana character sheet must be 256x512 pixels");
  if (textures.exists(texture)) return;
  if (!textures.addSpriteSheet(texture, image, { frameWidth: frameSize, frameHeight: frameSize }))
    throw new Error("Cannot register katana character sheet");
}

/** Scene-owned presentation state. It observes real movement and never writes to Core. */
export class KatanaCharacter {
  private player: GameCore["player"] | null = null;
  private time = 0;
  private x = 0;
  private y = 0;
  private direction: "right" | "left" = "right";
  private action: Action = "idle";
  private elapsed = 0;
  private frame: number | null = null;

  reset(): void {
    this.player = null;
    this.frame = null;
    this.elapsed = 0;
    this.action = "idle";
    this.direction = "right";
  }

  capture(core: GameCore): void {
    if (core.prof !== "warrior" || core.warriorStyle !== "katana") {
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
    // No simulation step means no animation, input-facing change, or pause snap.
    const dt = core.time - this.time;
    if (dt === 0 && this.frame !== null) return;
    const moved = Math.hypot(p.x - this.x, p.y - this.y) > 0.01;
    if (moved && Math.abs(p.dx) > 0.01) this.direction = p.dx < 0 ? "left" : "right";
    let slash: GameCore["slashes"][number] | undefined;
    for (let i = core.slashes.length - 1; i >= 0; i--) {
      const candidate = core.slashes[i];
      if (candidate.weapon === "katana" && candidate.life > 0 && !candidate.impact &&
          Math.hypot(candidate.x - p.x, candidate.y - p.y) < 18) {
        slash = candidate;
        break;
      }
    }
    let action: Action, frame: number;
    if (p.dashT > 0) {
      action = "dash";
      frame = Math.min(3, Math.max(0, Math.floor((1 - p.dashT / 0.16) * 4)));
    } else if (slash) {
      action = "attack";
      const facing = Math.cos(slash.a);
      if (Math.abs(facing) > 0.1) this.direction = facing < 0 ? "left" : "right";
      const progress = Math.min(3, Math.max(0, Math.floor((1 - slash.life / slash.max) * 4)));
      frame = ATTACK_FRAMES[progress];
    } else {
      action = moved ? "run" : "idle";
      this.elapsed = action === this.action ? this.elapsed + Math.max(0, dt) : 0;
      frame = Math.floor(this.elapsed * (action === "run" ? 10 : 3)) % 4;
    }
    if (action !== this.action) this.elapsed = 0;
    this.action = action;
    this.frame = (this.direction === "left" ? 16 : 0) + ACTION_ROW[action] * 4 + frame;
    this.time = core.time;
    this.x = p.x;
    this.y = p.y;
  }

  /** The same pose is reused by the body and its actual dash afterimages. */
  draw(painter: PixelPainter, x: number, y: number): boolean {
    if (this.frame === null || !painter.hasTexture(KATANA_CHARACTER.texture)) return false;
    const { texture, frameSize, anchorX, anchorY, footOffsetY } = KATANA_CHARACTER;
    painter.spriteFrame(texture, String(this.frame), {
      x: Math.round(x), y: Math.round(y) + footOffsetY,
      originX: anchorX / frameSize, originY: anchorY / frameSize,
      angle: 0, scaleX: 1, scaleY: 1,
    });
    return true;
  }
}
