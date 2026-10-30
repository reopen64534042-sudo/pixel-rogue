import { WARRIOR_BALANCE as WB } from "../../data/warriorBalance";
import type { WarriorLeapState } from "../../core/WarriorSystem";
import type { PixelPainter } from "../PixelPainter";

/** Render-only height: ground position/collision remain owned by the simulation. */
export function greatswordLeapPose(leap: WarriorLeapState | null) {
  if (!leap) return { height: 0, alpha: 1 };
  if (leap.phase === "windup") {
    const progress = Math.min(1, leap.elapsed / WB.leapWindup);
    return { height: Math.round(10 * progress), alpha: 1 - 0.85 * progress };
  }
  const progress = Math.max(0, Math.min(1, (leap.elapsed - WB.leapWindup) / WB.leapFall));
  return { height: Math.round(42 * (1 - progress * progress)), alpha: 0.25 + 0.75 * progress };
}

/** The full outer ring never grows: it marks the actual saved hit radius. */
export function drawGreatswordLeapTelegraph(painter: PixelPainter, leap: WarriorLeapState) {
  const x = Math.round(leap.x), y = Math.round(leap.y);
  const progress = Math.min(1, leap.elapsed / (WB.leapWindup + WB.leapFall));
  const previousAlpha = painter.globalAlpha;
  painter.globalAlpha = leap.phase === "fall" ? 0.75 : 0.3 + progress * 0.3;
  painter.strokeStyle = "#f4a940";
  painter.beginPath();
  painter.arc(x, y, leap.radius, 0, Math.PI * 2);
  painter.stroke();
  if (progress > 0) {
    painter.globalAlpha = 0.8;
    painter.strokeStyle = "#ffe8a3";
    painter.beginPath();
    painter.arc(x, y, leap.radius, -Math.PI / 2, -Math.PI / 2 + progress * Math.PI * 2);
    painter.stroke();
  }
  painter.globalAlpha = 0.85;
  painter.fillStyle = "#ffd24a";
  painter.fillRect(x - 3, y, 7, 1);
  painter.fillRect(x, y - 3, 1, 7);
  painter.globalAlpha = previousAlpha;
}

/** Small ground shadow and vertical speed streaks, below the existing player art. */
export function drawGreatswordLeapDescent(
  painter: PixelPainter, leap: WarriorLeapState, x: number, y: number,
) {
  const previousAlpha = painter.globalAlpha;
  const pose = greatswordLeapPose(leap);
  const px = Math.round(x), py = Math.round(y);
  painter.globalAlpha = 0.65;
  painter.fillStyle = "#9b4b16";
  painter.fillRect(px - 3, py + 4, 7, 1);
  if (leap.phase === "fall") {
    painter.globalAlpha = pose.alpha * 0.65;
    painter.fillStyle = "#ffe8a3";
    painter.fillRect(px - 3, py - pose.height - 12, 1, 6);
    painter.fillStyle = "#f4a940";
    painter.fillRect(px + 4, py - pose.height - 10, 1, 4);
  }
  painter.globalAlpha = previousAlpha;
}
