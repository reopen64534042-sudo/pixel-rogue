import type { GameCore } from "../core/GameCore";
import type { Enemy } from "../core/types";
import type { LaserLane, LaserLine } from "../data/laser";
import { LASER, LASER_XP, getLaserAim } from "../data/laser";
import { PALETTE_HEX as C } from "../data/palette";
import type { PixelPainter } from "./PixelPainter";

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));
const life = (line: LaserLine) => line.max > 0 ? clamp01(line.t / line.max) : 1;
// 折光残像显示与伤害共用寿命，短暂低亮保持后再淡出。
const DASH_ECHO_VISIBLE_SECONDS = LASER.echoLife;
const DASH_ECHO_CLEAR_SECONDS = 0.1;

function axis(line: LaserLine) {
  const length = Math.hypot(line.x2 - line.x, line.y2 - line.y);
  const ux = length > 0 ? (line.x2 - line.x) / length : 1;
  const uy = length > 0 ? (line.y2 - line.y) / length : 0;
  return { length, ux, uy, nx: -uy, ny: ux };
}

/** 束身两端收尖，整数像素轮廓；形状始终沿实际碰撞中心线。 */
function ribbon(ctx: PixelPainter, line: LaserLine, width: number, color: string, alpha: number) {
  const a = axis(line);
  if (a.length < 0.5 || alpha <= 0) return;
  const half = width / 2;
  const cap = Math.min(4, a.length / 4);
  const at = (distance: number, offset: number) => [
    Math.round(line.x + a.ux * distance + a.nx * offset),
    Math.round(line.y + a.uy * distance + a.ny * offset),
  ];
  ctx.polygon([
    ...at(0, 0), ...at(cap, -half), ...at(a.length - cap, -half),
    ...at(a.length, 0), ...at(a.length - cap, half), ...at(cap, half),
  ], color, alpha);
}

function slice(line: LaserLine, from: number, to: number): LaserLine {
  const a = axis(line);
  return { ...line,
    x: line.x + a.ux * from, y: line.y + a.uy * from,
    x2: line.x + a.ux * to, y2: line.y + a.uy * to };
}

function diamond(ctx: PixelPainter, x: number, y: number, radius: number, color: string, alpha: number) {
  x = Math.round(x); y = Math.round(y);
  ctx.polygon([x, y - radius, x + radius, y, x, y + radius, x - radius, y], color, alpha);
}

function fleck(ctx: PixelPainter, x: number, y: number, color: string, alpha: number, size = 1) {
  ctx.fillStyle = color;
  ctx.globalAlpha = clamp01(alpha);
  ctx.fillRect(Math.round(x), Math.round(y), size, size);
  ctx.globalAlpha = 1;
}

function drawMain(core: GameCore, ctx: PixelPainter, line: LaserLine) {
  const l = core.laser;
  const aim = getLaserAim(l, line.lane);
  const age = Math.max(0, l.total - l.remaining);
  const envelope = Math.min(clamp01(age / 0.035), clamp01(l.remaining / 0.04));
  const release = core.laserUpgrades.includes("collapse") ||
    (!!core.player.upCounts["熔断"] && aim.focus >= 1);
  const compress = release ? clamp01(1 - l.remaining / 0.12) : 0;
  const body = line.width * (0.78 + aim.focus * 0.12 - compress * 0.16);
  ribbon(ctx, line, line.width + 2, C.iceDeep, envelope * 0.12);
  ribbon(ctx, line, body, C.iceCyan, envelope * 0.88);
  ctx.beam(Math.round(line.x), Math.round(line.y), Math.round(line.x2), Math.round(line.y2),
    1, C.white, envelope * (0.86 + compress * 0.14));
  const focalContact = l.contacts.find(contact => contact.target &&
    (contact.lane ?? 0) === (line.lane ?? 0));
  if (core.player.upCounts["热穿"] && aim.focus >= 0.75 && focalContact) {
    const a = axis(line);
    const from = Math.max(0, Math.min(a.length,
      (focalContact.x - line.x) * a.ux + (focalContact.y - line.y) * a.uy));
    ribbon(ctx, slice(line, from, a.length), line.width * 0.65, C.bone, envelope * 0.3);
  }
  // 细小能量流只沿束身前进，主芯保持连续，避免闪成虚线/电弧。
  const a = axis(line);
  const distance = (core.time * 115) % Math.max(1, a.length);
  const packet = slice(line, Math.max(0, distance - 4), distance);
  ctx.beam(packet.x, packet.y, packet.x2, packet.y2, Math.min(2, body), C.white, envelope * 0.5);
  diamond(ctx, line.x, line.y, 2 + compress, C.iceCyan, envelope * 0.75);
  fleck(ctx, line.x, line.y, C.white, envelope);
}

function drawResidual(ctx: PixelPainter, line: LaserLine) {
  if (line.kind === "afterglow") {
    const k = life(line);
    // 余辉为逐渐变细的旧光路，不再复制主束的白色亮芯。
    ribbon(ctx, line, line.width * (0.25 + k * 0.45), C.iceDeep, k * 0.28);
    return;
  }
  const elapsed = Math.max(0, line.max - line.t);
  // 短暂保持清晰，再平缓淡出；冲刺结束后仍可辨认旧位置。
  const k = clamp01((DASH_ECHO_VISIBLE_SECONDS - elapsed) /
    (DASH_ECHO_VISIBLE_SECONDS - DASH_ECHO_CLEAR_SECONDS));
  if (k <= 0) return;
  ribbon(ctx, line, line.width, C.iceDeep, k * 0.06);
  ribbon(ctx, line, Math.max(1, line.width * 0.4), C.iceCyan, k * 0.28);
  // 一次冲刺只留一道人物轮廓；三条残留光束各自照常绘制。
  if ((line.lane ?? 0) !== 0) return;
  const a = axis(line);
  const oldX = Math.round(line.x - a.ux * 7), oldY = Math.round(line.y - a.uy * 7 + 3);
  ctx.fillStyle = C.iceCyan;
  ctx.globalAlpha = k * 0.22;
  ctx.fillRect(oldX - 2, oldY - 5, 4, 3);
  ctx.fillRect(oldX - 3, oldY - 1, 6, 4);
  ctx.fillRect(oldX - 2, oldY + 3, 1, 2);
  ctx.fillRect(oldX + 1, oldY + 3, 1, 2);
  ctx.globalAlpha = 1;
  // 旧发射口与人物、残留束共用同一快速淡出，避免留下闪眼的孤立亮点。
  ctx.beam(line.x - a.ux * 4, line.y - a.uy * 4, line.x, line.y, 2, C.iceDeep, k * 0.25);
  diamond(ctx, line.x, line.y, 2, C.iceCyan, k * 0.25);
}

function drawPulse(ctx: PixelPainter, line: LaserLine) {
  const k = life(line), age = 1 - k;
  const a = axis(line);
  const heavy = line.pulse === "meltdown";
  const color = heavy ? C.gold : C.iceCyan;
  // 首帧全路径闪光，随后亮头快速前进，留下收窄尾迹。
  ribbon(ctx, line, line.width + (heavy ? 5 : 3), color, k * k * 0.2);
  ribbon(ctx, line, line.width * (0.6 + k * (heavy ? 0.9 : 0.6)), color, k * 0.85);
  ctx.beam(line.x, line.y, line.x2, line.y2, 1, C.white, k * k);
  const front = a.length * Math.min(1, age / 0.7);
  const head = slice(line, Math.max(0, front - 9), Math.max(0.1, front));
  ribbon(ctx, head, line.width * (heavy ? 1.5 : 1.1), C.white, k * 0.95);
  diamond(ctx, line.x, line.y, 2 + k * 2, color, k * 0.75);
}

function drawScatter(ctx: PixelPainter, lines: LaserLine[]) {
  if (!lines.length) return;
  // 同次散射的三条原始线段合画成一片展开扇面，使用原始角度与长度。
  const middle = lines[Math.floor(lines.length / 2)];
  const a = axis(middle), k = life(middle);
  const angle = Math.atan2(a.uy, a.ux);
  const radius = a.length * (0.25 + (1 - k) * 0.75);
  const half = LASER.escapeArc / 2;
  const fan: number[] = [Math.round(middle.x), Math.round(middle.y)];
  for (let i = 0; i <= 8; i++) {
    const direction = angle - half + LASER.escapeArc * i / 8;
    fan.push(Math.round(middle.x + Math.cos(direction) * radius),
      Math.round(middle.y + Math.sin(direction) * radius));
  }
  ctx.polygon(fan, C.iceCyan, k * 0.13);
  ctx.strokeStyle = C.iceCyan;
  ctx.globalAlpha = k * 0.9;
  ctx.beginPath();
  ctx.arc(middle.x, middle.y, radius, angle - half, angle + half);
  ctx.stroke();
  ctx.globalAlpha = 1;
  for (const line of lines) {
    const edge = slice(line, radius * 0.65, radius);
    ctx.beam(edge.x, edge.y, edge.x2, edge.y2, 1, C.white, k * 0.7);
  }
}

function drawContacts(core: GameCore, ctx: PixelPainter, main: LaserLine) {
  const l = core.laser;
  l.contacts.forEach((contact, index) => {
    const beam = l.lines.find(line => line.kind === "main" &&
      (line.lane ?? 0) === (contact.lane ?? 0)) ?? main;
    const a = axis(beam);
    const aim = getLaserAim(l, contact.lane);
    const strength = contact.target ? 0.55 + aim.focus * 0.4 : 0.45;
    fleck(ctx, contact.x, contact.y, C.white, strength, 2);
    for (const side of [-1, 1]) {
      const phase = (core.time * 9 + index * 0.17 + (side > 0 ? 0.5 : 0)) % 1;
      fleck(ctx, contact.x + a.nx * side * (1 + phase * 4) + a.ux * phase * 2,
        contact.y + a.ny * side * (1 + phase * 4) + a.uy * phase * 2,
        C.iceCyan, strength * (1 - phase));
    }
  });
  const markers = new Map<Enemy, number>();
  for (const line of l.lines) {
    const aim = getLaserAim(l, line.lane);
    const e = aim.target;
    if (!e || e.dead || aim.focus <= 0 || !l.contacts.some(contact =>
      contact.target && (contact.lane ?? 0) === (line.lane ?? 0))) continue;
    markers.set(e, Math.max(markers.get(e) ?? 0, aim.focus));
  }
  // 四角锁相刻度向内收紧；不再绘制旋转圆环与绕目标公转的粒子。
  for (const [e, focus] of markers) {
    const radius = Math.round(e.r + 3 + (1 - focus) * 2);
    const arm = focus >= 1 ? 3 : 2;
    const color = focus >= 1 ? C.gold : C.iceCyan;
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
      const x = Math.round(e.x) + sx * radius, y = Math.round(e.y) + sy * radius;
      ctx.beam(x, y, x - sx * arm, y, 1, color, 0.55 + focus * 0.35);
      ctx.beam(x, y, x, y - sy * arm, 1, color, 0.55 + focus * 0.35);
    }
  }
}

function drawEmitter(core: GameCore, ctx: PixelPainter) {
  const l = core.laser, p = core.player;
  const lanes: LaserLane[] = core.laserUpgrades.includes("triple") ? [0, -1, 1] : [0];
  const charging = l.phase === "recharge" && l.total > 0 ? 1 - l.remaining / l.total : 0;
  for (const lane of lanes) {
    const aim = getLaserAim(l, lane);
    if (lane !== 0 && !aim.aimReady) continue;
    const dx = Math.cos(aim.angle), dy = Math.sin(aim.angle), nx = -dy, ny = dx;
    const x = p.x + dx * 7, y = p.y - 3 + dy * 7;
    ctx.beam(x - dx * 5, y - dy * 5, x - dx, y - dy, 3, C.ink1, 1);
    for (const side of [-1, 1]) {
      ctx.beam(Math.round(x - dx * 5 + nx * side), Math.round(y - dy * 5 + ny * side),
        Math.round(x - dx + nx * side), Math.round(y - dy + ny * side), 1, C.bone, 0.65);
    }
    diamond(ctx, x, y, 1, C.iceCyan, l.phase === "channel" ? 1 : 0.25 + charging * 0.6);
  }
}

/** 纯表现：所有线段/命中点来自模拟，动画只读模拟时间，零 RNG 与额外计时器。 */
export function drawLaser(core: GameCore, ctx: PixelPainter, animation?: () => boolean) {
  if (core.prof !== "shooter" || core.shooterWeapon !== "laser" || core.state === "over") return;
  const l = core.laser;
  const mains = l.lines.filter(line => line.kind === "main");
  const main = mains.find(line => (line.lane ?? 0) === 0) ?? mains[0];
  for (const line of l.aux) {
    if (line.kind !== "afterglow" && line.kind !== "echo") continue;
    // 静止照射时隐藏与主束重合的余辉亮层，避免多份光线叠成发白粗管。
    const current = mains.find(beam => (beam.lane ?? 0) === (line.lane ?? 0));
    if (line.kind === "afterglow" && current &&
      Math.hypot(line.x - current.x, line.y - current.y) < 2 &&
      Math.hypot(line.x2 - current.x2, line.y2 - current.y2) < 2) continue;
    drawResidual(ctx, line);
  }
  // The PNG player owns the main beams, focus rings and release transitions.
  // Keep the existing afterglow/echo/scatter mechanics visible in either path.
  if (animation?.()) {
    drawScatter(ctx, l.aux.filter(line => line.pulse === "scatter"));
    ctx.globalAlpha = 1;
    return;
  }
  for (const beam of mains) drawMain(core, ctx, beam);
  for (const line of l.aux) if (line.kind === "pulse" && line.pulse !== "scatter") drawPulse(ctx, line);
  drawScatter(ctx, l.aux.filter(line => line.pulse === "scatter"));
  if (main) drawContacts(core, ctx, main);
  drawEmitter(core, ctx);
  ctx.globalAlpha = 1;
}

export function drawLaserResources(core: GameCore, ctx: PixelPainter) {
  if (core.prof !== "shooter" || core.shooterWeapon !== "laser") return;
  const l = core.laser;
  const x = Math.round(core.player.x) - 9, y = Math.round(core.player.y);
  const ratio = l.total > 0 ? (l.phase === "recharge" ? 1 - l.remaining / l.total : l.remaining / l.total) : 1;
  const bar = (dy: number, value: number, color: string, height: number) => {
    ctx.fillStyle = C.ink1;
    ctx.fillRect(x, y + dy, 18, height);
    ctx.fillStyle = color;
    ctx.fillRect(x, y + dy, Math.round(18 * clamp01(value)), height);
  };
  bar(16, ratio, l.phase === "recharge" ? C.iceDeep : C.iceCyan, 2);
  const xp = LASER_XP[core.laserLevel - 1];
  bar(23, xp === null ? 1 : core.laserXp / xp, C.gold, 1);
}
