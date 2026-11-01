import type Phaser from "phaser";
import type { GameCore } from "../../core/GameCore";
import type { Enemy } from "../../core/types";
import { isFrozen, isFrostLocked, isShocked } from "../../core/ElementMath";
import { ELEMENTAL_MAGE, MAGE_ELEMENTS, type MageElement } from "../../data/elementalMage";
import type { PixelPainter } from "../PixelPainter";

/** Proposed handoff packet; the production Core does not expose this field. */
export interface MageVisualEvent {
  readonly kind: "body" | "echo" | "refract" | "shadow" | "burst";
  readonly at: number;
  readonly element: MageElement;
  readonly x: number;
  readonly y: number;
  readonly radius: number;
  readonly source?: Readonly<{ x: number; y: number }>;
}
export type MageVfxView = Readonly<Pick<GameCore, "player" | "prof" | "state" | "time" | "enemies" | "mageShadows"> & {
  mageVisualEvents: readonly MageVisualEvent[];
}>;

export const MAGE_VFX = {
  key: "mage-elemental-vfx", image: "assets/vfx/mage-elemental-48x48.png",
  size: 48, columns: 6, rows: 5, frameCount: 29, circleRadius: 18,
} as const;
// Order matches scripts/build-mage-vfx-assets.mjs / assets/vfx/mage/asset-record.json.
const START = { burn: 12, chill: 15, freeze: 18, shock: 22, prism: 26 } as const;
const ELEMENT_INDEX: Readonly<Record<MageElement, number>> = { fire: 0, frost: 1, lightning: 2 };
export const MAGE_STATUS = { fire: 1, frost: 2, freeze: 4, shock: 8, lock: 16 } as const;
const IMPACT_DURATION = 0.24;
const BREAK_DURATION = 0.18;
const sat = (v: number) => Math.max(0, Math.min(1, v));

export function registerMageVfx(textures: Phaser.Textures.TextureManager, image: HTMLImageElement): void {
  if (image.naturalWidth !== MAGE_VFX.columns * MAGE_VFX.size || image.naturalHeight !== MAGE_VFX.rows * MAGE_VFX.size)
    throw new Error("Mage VFX sheet must be 288x240 pixels");
  if (!textures.exists(MAGE_VFX.key) && !textures.addSpriteSheet(MAGE_VFX.key, image, { frameWidth: 48, frameHeight: 48, endFrame: MAGE_VFX.frameCount - 1 }))
    throw new Error("Cannot register mage VFX sheet");
}

function stamp(ctx: PixelPainter, frame: number, x: number, y: number, scale: number, alpha: number): boolean {
  if (!ctx.hasTexture(MAGE_VFX.key)) return false;
  const previous = ctx.globalAlpha;
  ctx.globalAlpha = alpha;
  try {
    ctx.spriteFrame(MAGE_VFX.key, String(frame), {
      x: Math.round(x), y: Math.round(y), angle: 0, scaleX: scale, scaleY: scale, originX: 0.5, originY: 0.5,
    });
  } finally { ctx.globalAlpha = previous; }
  return true;
}

interface FreezeView { phase: "freeze" | "lock"; at: number; duration: number; remaining: number; endedAt: number | null }
type Shadow = GameCore["mageShadows"][number];

/** UNWIRED handoff sampler, currently used only by the offline asset preview.
 * A collaborator must supply MageVfxView explicitly before any runtime use.
 * Capture after every fixed step, including steps
 * skipped by the display, to observe completed casts and the end of a freeze.
 * All ages use core.time: pause/stats freeze them, and a new player resets them. */
export class MageVfx {
  private player: GameCore["player"] | null = null;
  private time = 0;
  private packet: readonly MageVisualEvent[] | null = null;
  private impacts: MageVisualEvent[] = [];
  private readonly freezes = new Map<Enemy, FreezeView>();
  private readonly shadowAnchors = new Map<Shadow, { x: number; y: number }>();

  reset(): void {
    this.player = null;
    this.time = 0;
    this.packet = null;
    this.impacts = [];
    this.freezes.clear();
    this.shadowAnchors.clear();
  }

  capture(core: MageVfxView): void {
    if (core.prof !== "mage" || core.state === "start" || core.state === "over") { this.reset(); return; }
    if (this.player !== core.player || core.time < this.time) {
      this.reset();
      this.player = core.player;
    }
    this.time = core.time;
    // The simulation records actual element/position before advancing the wheel.
    // Packet identity prevents double playback on display-only/paused captures.
    if (this.packet !== core.mageVisualEvents) {
      this.impacts.push(...core.mageVisualEvents);
      this.packet = core.mageVisualEvents;
    }
    this.impacts = this.impacts.filter((v) => this.time - v.at < IMPACT_DURATION);
    const shadows = new Set(core.mageShadows);
    for (const shadow of shadows) if (!this.shadowAnchors.has(shadow))
      this.shadowAnchors.set(shadow, { x: core.player.x + shadow.side * ELEMENTAL_MAGE.shadow.offset, y: core.player.y });
    for (const shadow of this.shadowAnchors.keys()) if (!shadows.has(shadow)) this.shadowAnchors.delete(shadow);

    const alive = new Set(core.enemies.filter((e) => !e.dead));
    for (const e of alive) {
      const phase = isFrostLocked(e) ? "lock" : "freeze";
      const remaining = Math.max(0, phase === "lock" ? (e.elemFrostLockT ?? 0) : (e.elemFrozenT ?? 0));
      let view = this.freezes.get(e);
      if (remaining > 0) {
        if (!view || view.phase !== phase || view.endedAt !== null) {
          view = { phase, at: core.time, duration: remaining, remaining, endedAt: null };
          this.freezes.set(e, view);
        }
        // A hit extends frost lock; keep its appearance age instead of replaying formation.
        view.duration = Math.max(view.duration, core.time - view.at + remaining);
        view.remaining = remaining;
      } else if (view && view.endedAt === null) {
        view.remaining = 0;
        view.endedAt = core.time;
      }
    }
    for (const [e, v] of this.freezes)
      if (!alive.has(e) || (v.endedAt !== null && this.time - v.endedAt >= BREAK_DURATION)) this.freezes.delete(e);
  }

  /** Native pixels at integer scales, inside the exact procedural range ring. */
  drawCast(ctx: PixelPainter, x: number, y: number, radius: number, progress: number, element: MageElement | null): boolean {
    if (!element) return false;
    if (radius < MAGE_VFX.circleRadius) return false;
    const scale = Math.max(1, Math.floor(radius / MAGE_VFX.circleRadius));
    return stamp(ctx, ELEMENT_INDEX[element] * 4 + (progress < 0.6 ? 0 : 1), x, y, scale, 0.3 + sat(progress) * 0.3);
  }

  drawPrism(ctx: PixelPainter, prism: NonNullable<GameCore["magePrism"]>): boolean {
    return stamp(ctx, START.prism + ELEMENT_INDEX[prism.element], prism.x, prism.y - 1, 1, 0.9);
  }

  shadowPosition(shadow: Shadow): { x: number; y: number } | undefined {
    return this.shadowAnchors.get(shadow);
  }

  drawImpacts(ctx: PixelPainter): void {
    for (const v of this.impacts) {
      const age = this.time - v.at;
      const scale = Math.max(1, Math.floor(v.radius / MAGE_VFX.circleRadius));
      const strength = v.kind === "echo" ? 0.5 : v.kind === "shadow" ? 0.6 : 1;
      stamp(ctx, ELEMENT_INDEX[v.element] * 4 + (age < 0.09 ? 2 : 3), v.x, v.y, scale,
        strength * (age < 0.09 ? 0.75 : 0.55 * sat((IMPACT_DURATION - age) / 0.15)));
      if (v.source && age < 0.12)
        ctx.beam(v.source.x, v.source.y, v.x, v.y, 1, MAGE_ELEMENTS[v.element].color, (1 - age / 0.12) * 0.25);
    }
  }

  /** Returns which overlays were drawn so each old fallback remains independent.
   * Sprites sit below damage numbers / health bars, and use ordinary alpha. */
  drawEnemy(ctx: PixelPainter, e: Enemy, width: number, height: number): number {
    if (e.dead || !ctx.hasTexture(MAGE_VFX.key)) return 0;
    const scale = Math.min(2, Math.max(1, Math.floor(Math.max(width, height) / 28)));
    let drawn = 0;
    const pulse = Math.sin(this.time * 8 + e.seed * 6);
    const fire = e.elemFire?.length ?? 0;
    if (fire > 0) {
      stamp(ctx, START.burn + Math.min(2, fire - 1), e.x, e.y + (pulse > 0.6 ? -1 : 0), scale, 0.6 + pulse * 0.08);
      drawn |= MAGE_STATUS.fire;
    }
    const freeze = this.freezes.get(e);
    if (freeze) {
      const age = this.time - freeze.at;
      const ending = freeze.endedAt !== null;
      const frame = ending ? 3 : age < Math.min(0.12, freeze.duration * 0.2) ? 0
        : freeze.remaining <= Math.min(0.22, freeze.duration * 0.25) ? 2 : 1;
      const alpha = freeze.endedAt !== null ? 0.6 * sat(1 - (this.time - freeze.endedAt) / BREAK_DURATION) : freeze.phase === "lock" ? 0.75 : 0.58;
      stamp(ctx, START.freeze + frame, e.x, e.y, scale, alpha);
      drawn |= MAGE_STATUS.freeze;
      if (freeze.phase === "lock") drawn |= MAGE_STATUS.lock;
    }
    const frost = e.elemFrost?.length ?? 0;
    if (frost > 0 && !isFrozen(e) && !isFrostLocked(e)) {
      stamp(ctx, START.chill + Math.min(2, frost - 1), e.x, e.y, scale, 0.65 + pulse * 0.05);
      drawn |= MAGE_STATUS.frost;
    }
    if (isShocked(e)) {
      const remaining = e.elemShockT ?? 0;
      const frame = remaining < 0.2 ? 3 : Math.floor(this.time * 5 + e.seed * 3) % 3;
      stamp(ctx, START.shock + frame, e.x, e.y - Math.max(10, height / 2 + 3), scale, remaining < 0.2 ? 0.65 * remaining / 0.2 : 0.65);
      drawn |= MAGE_STATUS.shock;
    }
    return drawn;
  }
}
