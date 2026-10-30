import type { Slash } from "../../core/types";
import type { PixelPainter } from "../PixelPainter";

/** Fixed camera-space ground ellipse: never rotate or mirror with attack facing. */
export const GREATSWORD_LEAP_IMPACT = {
  image: "assets/vfx/greatsword-leap-impact-144x144-10f.png",
  prefix: "greatsword-leap-impact-",
  size: 144,
  radius: 67.5,
  // Keep the first three holds above 1/60s: updateMelee ages a new slash
  // in the same simulation step before its first draw.
  frameStarts: [0, 0.06, 0.12, 0.18, 0.27, 0.37, 0.49, 0.62, 0.76, 0.9],
} as const;

/** Draw below actors from the saved landing point, radius and simulation time.
 * False leaves the caller's existing procedural impact available while loading. */
export function drawGreatswordLeapImpact(painter: PixelPainter, slash: Slash): boolean {
  if (
    slash.weapon !== "greatsword" || !slash.impact ||
    !Number.isFinite(slash.x) || !Number.isFinite(slash.y) ||
    !Number.isFinite(slash.r) || !Number.isFinite(slash.arc) ||
    !Number.isFinite(slash.life) || !Number.isFinite(slash.max) ||
    Math.abs(slash.arc - Math.PI * 2) > 1e-6 ||
    slash.r <= 0 || slash.max <= 0 || slash.life <= 0 || slash.life > slash.max
  ) return false;
  const progress = 1 - slash.life / slash.max;
  const starts = GREATSWORD_LEAP_IMPACT.frameStarts;
  let frame = 0;
  while (frame + 1 < starts.length && progress >= starts[frame + 1]) frame++;
  const key = `${GREATSWORD_LEAP_IMPACT.prefix}${frame}`;
  if (!painter.hasTexture(key)) return false;
  const previousAlpha = painter.globalAlpha;
  painter.globalAlpha = 1;
  try {
    painter.spriteRot(key, Math.round(slash.x), Math.round(slash.y), 0,
      slash.r / GREATSWORD_LEAP_IMPACT.radius);
  } finally {
    painter.globalAlpha = previousAlpha;
  }
  return true;
}
