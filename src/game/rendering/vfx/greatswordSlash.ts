import type Phaser from "phaser";
import type { Slash } from "../../core/types";
import type { PixelPainter } from "../PixelPainter";
import { WARRIOR_BALANCE } from "../../data/warriorBalance";
import { GREATSWORD_LEAP_IMPACT } from "./greatswordLeapImpact";
import { GREATSWORD_ENERGY_SHEETS } from "./greatswordEnergy";

/** Default radii are baked into native-size frames; range upgrades scale around
 * the same player pivot with the game's nearest-neighbor texture filtering. */
export const GREATSWORD_SLASH_SHEETS = [
  {
    image: "assets/vfx/greatsword-sweep-96x96-10f.png",
    prefix: "greatsword-sweep-",
    size: 96,
    radius: 45,
  },
  {
    image: "assets/vfx/greatsword-sweep-ccw-96x96-10f.png",
    prefix: "greatsword-sweep-ccw-",
    size: 96,
    radius: 45,
  },
  {
    image: "assets/vfx/greatsword-heavy-144x144-10f.png",
    prefix: "greatsword-heavy-",
    size: 144,
    radius: 67.5,
  },
  {
    image: "assets/vfx/greatsword-heavy-ccw-144x144-10f.png",
    prefix: "greatsword-heavy-ccw-",
    size: 144,
    radius: 67.5,
  },
  GREATSWORD_LEAP_IMPACT,
  ...GREATSWORD_ENERGY_SHEETS,
] as const;

type SlashSheet = (typeof GREATSWORD_SLASH_SHEETS)[number];
const COLUMNS = 5;
const ROWS = 2;
const FRAMES = 10;

/** Register decoded sheets once; no texture uploads during attack playback. */
export function registerGreatswordSlash(
  textures: Phaser.Textures.TextureManager,
  image: HTMLImageElement,
  sheet: SlashSheet,
): void {
  if (
    image.naturalWidth !== COLUMNS * sheet.size ||
    image.naturalHeight !== ROWS * sheet.size
  ) throw new Error(`Invalid greatsword slash sheet dimensions: ${sheet.image}`);
  for (let frame = 0; frame < FRAMES; frame++) {
    const key = `${sheet.prefix}${frame}`;
    if (textures.exists(key)) continue;
    const canvas = document.createElement("canvas");
    canvas.width = sheet.size;
    canvas.height = sheet.size;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Cannot create greatsword slash frame canvas");
    context.imageSmoothingEnabled = false;
    context.drawImage(
      image,
      (frame % COLUMNS) * sheet.size,
      Math.floor(frame / COLUMNS) * sheet.size,
      sheet.size,
      sheet.size,
      0,
      0,
      sheet.size,
      sheet.size,
    );
    if (!textures.addCanvas(key, canvas)) {
      throw new Error(`Cannot register greatsword slash texture: ${key}`);
    }
  }
}

/** The slash snapshot owns time, facing, radius and heavy state. Returns false
 * while loading so draw.ts can preserve the existing procedural fallback.
 * `alpha` lets the dash-slash draw a faint trailing ghost without changing
 * the opaque normal attack. */
export function drawGreatswordSlash(
  painter: PixelPainter,
  slash: Slash,
  alpha = 1,
): boolean {
  if (
    !Number.isFinite(slash.x) || !Number.isFinite(slash.y) ||
    !Number.isFinite(slash.a) || !Number.isFinite(slash.r) ||
    !Number.isFinite(slash.life) || !Number.isFinite(slash.max) ||
    !Number.isFinite(slash.arc) ||
    Math.abs(slash.arc - WARRIOR_BALANCE.styles.greatsword.spread) > 1e-6 ||
    slash.r <= 0 || slash.max <= 0 || slash.life <= 0 || slash.life > slash.max
  ) return false;
  const angle = Math.atan2(Math.sin(slash.a), Math.cos(slash.a));
  const rightHalf = angle >= -Math.PI / 2 && angle < Math.PI / 2;
  const sheet = GREATSWORD_SLASH_SHEETS[(slash.heavy ? 2 : 0) + (rightHalf ? 0 : 1)];
  const frame = Math.min(FRAMES - 1, Math.floor((1 - slash.life / slash.max) * FRAMES));
  const key = `${sheet.prefix}${frame}`;
  if (!painter.hasTexture(key)) return false;
  const previousAlpha = painter.globalAlpha;
  painter.globalAlpha = alpha;
  try {
    painter.spriteRot(
      key,
      Math.round(slash.x),
      Math.round(slash.y),
      rightHalf ? angle : angle - Math.PI,
      slash.r / sheet.radius,
    );
  } finally {
    painter.globalAlpha = previousAlpha;
  }
  return true;
}
