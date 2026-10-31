import { PALETTE_HEX as C } from "../../../data/palette";
import { LASER_CLIPS, type LaserClip } from "./laserAssets";

export type PulseKind = "none" | "collapse" | "meltdown";
export interface VfxPoint { readonly x: number; readonly y: number }
export interface LaserVfxContact extends VfxPoint { readonly target: boolean }
export interface FocusTarget extends VfxPoint { readonly id: number; readonly radius: number }
export interface LaserVfxLane extends VfxPoint {
  readonly lane: -1 | 0 | 1;
  readonly x2: number;
  readonly y2: number;
  readonly width: number;
  readonly focus: number;
  readonly target: FocusTarget | null;
  readonly contacts: readonly LaserVfxContact[];
  /** Preview only: actual release events remain authoritative. */
  readonly expectedPulse: PulseKind;
}
export interface LaserVfxFrame {
  readonly time: number;
  readonly cycleId: number;
  readonly phase: "idle" | "channel" | "recharge";
  readonly elapsed: number;
  readonly duration: number;
  readonly lanes: readonly LaserVfxLane[];
}
export interface LaserVfxRelease {
  readonly id: string;
  readonly at: number;
  readonly kind: PulseKind;
  readonly beam: LaserVfxLane;
}
export type LaserVfxCommand =
  | { kind: "sprite"; clip: LaserClip; frame: number; x: number; y: number; angle: number; scaleX: number; scaleY: number; alpha: number; cropX?: number; cropWidth?: number }
  | { kind: "beam"; x: number; y: number; x2: number; y2: number; width: number; color: string; alpha: number }
  | { kind: "arc"; x: number; y: number; radius: number; start: number; end: number; color: string; alpha: number }
  | { kind: "pixel"; x: number; y: number; color: string; alpha: number };

const clamp = (v: number) => Math.max(0, Math.min(1, v));
const smooth = (v: number) => { const k = clamp(v); return k * k * (3 - 2 * k); };
export const LASER_PULSE_VISUAL_SECONDS = 0.24;
export const LASER_DISSOLVE_SECONDS = 0.16;

export function laserChannelLook(elapsed: number, duration: number) {
  const u = clamp(duration > 0 ? elapsed / duration : 0);
  const gather = smooth((u - 0.65) / 0.2), compress = smooth((u - 0.85) / 0.15);
  const stage = u < 0.08 ? "ignite" : u < 0.65 ? "sustain" : u < 0.85 ? "gather" : "compress";
  return { u, gather, compress, stage, ignite: smooth(u / 0.08) };
}

function frameAt(clip: LaserClip, seconds: number) {
  const desc = LASER_CLIPS[clip];
  if (!desc.frameDurations) return 0;
  const total = desc.frameDurations.reduce((a: number, b: number) => a + b, 0);
  const at = desc.loop ? ((seconds % total) + total) % total : Math.max(0, seconds);
  let edge = 0;
  for (let i = 0; i < desc.frameDurations.length; i++) {
    edge += desc.frameDurations[i];
    if (at < edge) return i;
  }
  return desc.frames.length - 1;
}

function geometry(line: LaserVfxLane) {
  const length = Math.hypot(line.x2 - line.x, line.y2 - line.y);
  const angle = Math.atan2(line.y2 - line.y, line.x2 - line.x);
  return { length, angle, dx: Math.cos(angle), dy: Math.sin(angle) };
}

function sprite(commands: LaserVfxCommand[], clip: LaserClip, frame: number, x: number, y: number,
  angle: number, scaleX: number, scaleY: number, alpha: number, cropWidth?: number, cropX?: number) {
  if (alpha <= 0) return;
  commands.push({ kind: "sprite", clip, frame: Math.max(0, Math.min(7, frame)), x, y, angle, scaleX, scaleY, alpha: clamp(alpha), cropX, cropWidth });
}
function beam(commands: LaserVfxCommand[], line: LaserVfxLane, width: number, color: string, alpha: number) {
  if (width > 0 && alpha > 0) commands.push({ kind: "beam", x: line.x, y: line.y, x2: line.x2, y2: line.y2, width, color, alpha: clamp(alpha) });
}

function drawChannel(commands: LaserVfxCommand[], frame: LaserVfxFrame, line: LaserVfxLane) {
  const a = geometry(line), look = laserChannelLook(frame.elapsed, frame.duration);
  if (a.length <= 0 || line.width <= 0) return;
  const ordinaryEnd = line.expectedPulse === "none" ? look.compress : 0;
  const focus = clamp(line.focus);
  // The dim full-width guide describes collision coverage; the visible body stays slender.
  beam(commands, line, line.width, C.iceDeep, (0.07 + focus * 0.03) * (1 - ordinaryEnd * 0.55));
  beam(commands, line, line.width * (0.48 - focus * 0.04), C.iceCyan,
    (0.22 + focus * 0.16) * (1 - ordinaryEnd * 0.5));
  const materialAlpha = (0.1 + focus * 0.12) * (1 - ordinaryEnd * 0.55);
  // One pixel-quantized world phase at 80px/s, NOT eight frames jumping 4px/50ms.
  // Integer source extents are shared by Canvas, Phaser and the Pillow exporter.
  const phase = ((-Math.floor(frame.time * 80) % 32) + 32) % 32;
  const materialLength = Math.max(0, Math.round(a.length));
  for (let from = 0, sourceX = phase; from < materialLength; sourceX = 0) {
    const count = Math.min(32 - sourceX, materialLength - from);
    sprite(commands, "beam-flow", 0,
      line.x + a.dx * from, line.y + a.dy * from, a.angle, 1,
      line.width / 4 * 0.28 * (1 - look.compress * 0.15) * (1 - focus * 0.05),
      materialAlpha, count, sourceX);
    from += count;
  }
  // One continuous white guide: moving material never turns this into projectiles.
  beam(commands, line, Math.max(1, line.width * 0.12), C.white,
    (0.6 + focus * 0.4) * (0.75 + look.ignite * 0.25) * (1 - ordinaryEnd * 0.15));
  const scale = Math.sqrt(line.width / 4);
  let clip: LaserClip = "emitter-loop", index = frameAt(clip, frame.time);
  if (look.u < 0.08) { clip = "emitter-ignite"; index = Math.floor(look.u / 0.08 * 8); }
  else if (look.u >= 0.65) {
    clip = "emitter-compress";
    const progress = look.u < 0.85 ? (look.u - 0.65) / 0.2 * 0.5 : 0.5 + (look.u - 0.85) / 0.15 * 0.5;
    index = Math.floor(progress * 8);
  }
  const emitterScale = scale * (0.62 - focus * 0.12);
  sprite(commands, clip, index, line.x, line.y, a.angle, emitterScale, emitterScale,
    (0.5 + focus * 0.5) * (0.65 + look.ignite * 0.35) * (1 - ordinaryEnd * 0.2));
  sprite(commands, "beam-tip", frameAt("beam-tip", frame.time), line.x2, line.y2,
    a.angle, scale * 0.3, scale * 0.3, 0.22 * (1 - ordinaryEnd * 0.7));
  for (const [i, contact] of line.contacts.entries()) {
    const focused = contact.target;
    const sparkScale = focused ? 0.45 + focus * 0.4 : 0.35;
    sprite(commands, "hit-sparks", frameAt("hit-sparks", frame.time + i * 0.04 + line.lane * 0.08),
      contact.x, contact.y, a.angle, sparkScale, sparkScale, focused ? 0.55 + focus * 0.45 : 0.35);
    if (!focused) continue;
    const reach = 0.65 + focus * 1.85, alpha = 0.25 + focus * 0.75;
    // Heat stays local to the actual locked-target contact, never every pierced enemy.
    beam(commands, { ...line, x: contact.x - a.dx * reach, y: contact.y - a.dy * reach,
      x2: contact.x + a.dx * reach, y2: contact.y + a.dy * reach }, 1 + focus * 0.8, C.white, alpha);
    const hot = smooth((focus - 0.75) / 0.25);
    if (hot > 0) beam(commands, { ...line, x: contact.x + a.dy * 1.75, y: contact.y - a.dx * 1.75,
      x2: contact.x - a.dy * 1.75, y2: contact.y + a.dx * 1.75 }, 1, C.white, hot * 0.9);
  }
}

function drawRelease(commands: LaserVfxCommand[], release: LaserVfxRelease, now: number, overlapElapsed: number | null) {
  const age = now - release.at, line = release.beam, a = geometry(line);
  if (age < 0 || a.length <= 0) return;
  const scale = Math.sqrt(line.width / 4);
  // The release's first pose IS the final channel pose. Crossfade textures and emitter,
  // instead of dropping the entire continuous material when core.laser.lines is cleared.
  const inherit = 1 - smooth(age / 0.045);
  if (inherit > 0) {
    const inherited: LaserVfxCommand[] = [];
    drawChannel(inherited, { time: release.at, cycleId: 0, phase: "channel", elapsed: 1, duration: 1, lanes: [line] },
      { ...line, expectedPulse: release.kind });
    for (const command of inherited) {
      const axisCore = command.kind === "beam" && command.color === C.white &&
        command.x === line.x && command.y === line.y && command.x2 === line.x2 && command.y2 === line.y2;
      // Pulse owns one uninterrupted core below. Two half-alpha white layers would
      // otherwise composite to a darker midpoint during the texture crossfade.
      if (release.kind !== "none" && axisCore) continue;
      commands.push({ ...command, alpha: command.alpha * inherit });
    }
  }
  if (release.kind === "none") {
    const k = clamp(1 - age / LASER_DISSOLVE_SECONDS);
    beam(commands, line, line.width * (0.3 + k * 0.5), C.iceDeep, k * k * 0.3 * (1 - inherit));
    beam(commands, line, 1, C.bone, k * k * 0.55 * (1 - inherit));
    sprite(commands, "dissolve", frameAt("dissolve", age), line.x, line.y, a.angle, scale * 0.6, scale * 0.6, k * 0.75 * (1 - inherit));
    return;
  }
  const heavy = release.kind === "meltdown", clip = release.kind;
  const expand = smooth(age / 0.045), fade = 1 - smooth((age - 0.075) / 0.165);
  const color = heavy ? C.gold : C.iceCyan;
  // Start at 1 on the next channel's first instant, then ease to 0.4 over 80ms.
  const lowOverlap = overlapElapsed === null ? 1 : 1 - 0.6 * smooth(overlapElapsed / 0.08);
  // At t=0 the whole actual path lights up: damage is NOT timed to the moving head.
  const focus = clamp(line.focus);
  // Release keeps the channel's slender silhouette. Pulse identity comes from
  // color, local energy heads and decay, never a wider full-length pipe.
  beam(commands, line, line.width, C.iceDeep,
    fade * (0.07 + focus * 0.03) * lowOverlap * (1 - inherit));
  beam(commands, line, line.width * (0.48 - focus * 0.04), color,
    fade * (0.22 + focus * 0.16) * lowOverlap * (1 - inherit));
  const startWidth = Math.max(1, line.width * 0.12), startAlpha = 0.6 + focus * 0.4;
  beam(commands, line, startWidth, C.white,
    fade * (startAlpha + (1 - startAlpha) * expand) * lowOverlap);
  if (age < 0.045) beam(commands, line, 1, C.white, 0.18 * (1 - age / 0.045));
  if (age < 0.045) for (const contact of line.contacts) {
    sprite(commands, "hit-sparks", 0, contact.x, contact.y, a.angle, 0.9, 0.9, 1 - age / 0.045);
  }
  const front = a.length * smooth((age - 0.035) / 0.135);
  const index = frameAt(clip, age);
  sprite(commands, clip, index, line.x, line.y, a.angle, scale * 0.65, scale * 0.65, fade * lowOverlap * expand);
  if (age >= 0.035) sprite(commands, clip, index, line.x + a.dx * front, line.y + a.dy * front,
    a.angle, scale * 0.7, scale * (heavy ? 0.8 : 0.65), fade * 0.8 * lowOverlap);
}

function drawFocus(commands: LaserVfxCommand[], frame: LaserVfxFrame) {
  const targets = new Map<number, { target: FocusTarget; focus: number }>();
  for (const line of frame.lanes) {
    if (!line.target || line.focus <= 0) continue;
    if ((targets.get(line.target.id)?.focus ?? -1) < line.focus) targets.set(line.target.id, { target: line.target, focus: clamp(line.focus) });
  }
  for (const { target, focus } of targets.values()) {
    const radius = target.radius + 3, color = focus >= 1 ? C.gold : C.iceCyan;
    commands.push({ kind: "arc", x: target.x, y: target.y, radius, start: -Math.PI / 2,
      end: -Math.PI / 2 + Math.PI * 2 * focus, color, alpha: 0.85 });
    for (let i = 0; i < 2; i++) {
      const angle = frame.time * 4 + i * Math.PI;
      commands.push({ kind: "pixel", x: Math.round(target.x + Math.cos(angle) * radius),
        y: Math.round(target.y + Math.sin(angle) * radius), color: i === 0 ? C.white : color, alpha: 0.8 });
    }
  }
}

/** One instance per Scene/run. Only caller-supplied simulation time advances it. */
export class LaserVfxPlayer {
  private releases = new Map<string, LaserVfxRelease>();
  private lastTime = -Infinity;

  reset() { this.releases.clear(); this.lastTime = -Infinity; }

  update(frame: LaserVfxFrame, events: readonly LaserVfxRelease[] = []): LaserVfxCommand[] {
    if (frame.time < this.lastTime) this.reset();
    this.lastTime = frame.time;
    for (const event of events) if (!this.releases.has(event.id)) {
      this.releases.set(event.id, { ...event, beam: { ...event.beam,
        target: event.beam.target ? { ...event.beam.target } : null,
        contacts: event.beam.contacts.map(contact => ({ ...contact })) } });
    }
    const commands: LaserVfxCommand[] = [];
    for (const [id, release] of this.releases) {
      const life = release.kind === "none" ? LASER_DISSOLVE_SECONDS : LASER_PULSE_VISUAL_SECONDS;
      if (frame.time - release.at >= life) { this.releases.delete(id); continue; }
      drawRelease(commands, release, frame.time, frame.phase === "channel" ? frame.elapsed : null);
    }
    if (frame.phase === "channel") {
      for (const line of frame.lanes) drawChannel(commands, frame, line);
      drawFocus(commands, frame);
    }
    return commands;
  }
}
