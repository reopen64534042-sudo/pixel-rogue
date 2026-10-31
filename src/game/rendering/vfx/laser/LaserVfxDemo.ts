/** Independent ART DEMO. No GameCore mutation, enemy AI, damage, XP or combat timing. */
import type { LaserVfxFrame, LaserVfxLane, LaserVfxRelease, PulseKind } from "./LaserVfxPlayer";

export interface LaserDemoCase {
  readonly id: string;
  readonly title: string;
  readonly duration: number;
  readonly recharge: number;
  readonly widths: readonly number[];
  readonly range: number;
  readonly pulse: "none" | "collapse" | "meltdown" | "mixed";
  readonly moving?: boolean;
  readonly focusLoss?: boolean;
  readonly sharedTarget?: boolean;
}
export const LASER_DEMO_CASES: readonly LaserDemoCase[] = [
  { id: "base", title: "1.0s · 普通结束 · 4px", duration: 1, recharge: 0.3, widths: [4], range: 190, pulse: "none" },
  { id: "collapse", title: "1.0s · 青白坍缩 · 6px", duration: 1, recharge: 0.3, widths: [6], range: 250, pulse: "collapse" },
  { id: "capacitor", title: "1.3s · 金白熔断 · 10px", duration: 1.3, recharge: 0.3, widths: [10], range: 285, pulse: "meltdown" },
  { id: "triple", title: "三束独立多向 · 熔断与坍缩", duration: 1.3, recharge: 0.2, widths: [6, 6, 6], range: 170, pulse: "mixed" },
  { id: "short", title: "0.05s 回充 · 余光与新轮重叠", duration: 1, recharge: 0.05, widths: [4, 4, 4], range: 165, pulse: "mixed", moving: true },
  { id: "move", title: "移动中结束 · 新轮更换目标", duration: 1, recharge: 0.3, widths: [6], range: 220, pulse: "collapse", moving: true },
  { id: "focus-loss", title: "末段焦点失效 · 回到普通结束", duration: 1.3, recharge: 0.2, widths: [4], range: 205, pulse: "none", focusLoss: true },
  { id: "shared", title: "多束同目标 · 只画最高焦点圆环", duration: 1.3, recharge: 0.05, widths: [4, 4, 4], range: 180, pulse: "mixed", sharedTarget: true },
];

export interface LaserFocusDemoCase extends LaserDemoCase {
  readonly fixedFocus: readonly number[];
  readonly angle?: number;
  readonly focusFalloff?: boolean;
  readonly miss?: boolean;
}
const comparison = (id: string, title: string, width: number, focus: number, angle = 0): LaserFocusDemoCase =>
  ({ id, title, duration: 1.3, recharge: 0.3, widths: [width], range: 350, pulse: "collapse", fixedFocus: [focus], angle });
export const LASER_FOCUS_DEMO_CASES: readonly LaserFocusDemoCase[] = [
  comparison("focus-0", "同 u=0.40 / 4px / focus=0", 4, 0),
  comparison("focus-05", "同 u=0.40 / 4px / focus=0.5", 4, 0.5),
  comparison("focus-1", "同 u=0.40 / 4px / focus=1", 4, 1),
  comparison("width-4", "长束 / 实际宽度 4px / focus=0.75", 4, 0.75),
  comparison("width-6", "长束 / 实际宽度 6px / focus=0.75", 6, 0.75),
  comparison("width-10", "长束 / 实际宽度 10px / focus=0.75", 10, 0.75),
  comparison("diagonal", "斜向长束 / 10px / 共用滚动相位", 10, 0.75, -0.35),
  { ...comparison("focus-return", "固定 u / 聚焦增强→满值→失去焦点", 6, 0), focusFalloff: true },
  { ...comparison("focus-triple", "三束各自 focus=0 / 0.5 / 1", 6, 0), widths: [6, 6, 6], range: 165, fixedFocus: [0, 0.5, 1] },
  { ...comparison("focus-miss", "未命中锁定目标 / 焦点保持 0", 4, 0), miss: true },
];

/** Fixed u/geometry isolates actual focus from elapsed time in the art comparison. */
export function sampleLaserFocusDemo(c: LaserFocusDemoCase, time: number) {
  const triple = c.widths.length > 1;
  const player = { x: triple ? 238 : 58, y: c.angle ? 190 : 140 };
  const targets: { id: number; x: number; y: number; radius: number }[] = [];
  const lanes: LaserVfxLane[] = c.widths.map((width, i) => {
    const angle = triple ? [0, -2.4, 2.35][i] : c.angle ?? 0, dx = Math.cos(angle), dy = Math.sin(angle);
    const t = ((time % 3.2) + 3.2) % 3.2;
    const focus = c.focusFalloff ? Math.max(0, Math.min(1, t / 0.8)) * (1 - Math.max(0, Math.min(1, (t - 1.3) / 0.65))) : c.fixedFocus[i];
    const contact = { x: player.x + dx * c.range * 0.72, y: player.y - 3 + dy * c.range * 0.72, target: true };
    const pierced = { x: player.x + dx * c.range * 0.35, y: player.y - 3 + dy * c.range * 0.35, target: false };
    const target = { id: i + 1, x: contact.x + (c.miss ? -dy * 14 : 0), y: contact.y + (c.miss ? dx * 14 : 0), radius: 5 };
    targets.push(target, { id: 100 + i, x: pierced.x, y: pierced.y, radius: 4 });
    return { lane: ([0, -1, 1] as const)[i], x: player.x + dx * 7, y: player.y - 3 + dy * 7,
      x2: player.x + dx * c.range, y2: player.y - 3 + dy * c.range, width, focus, target,
      contacts: c.miss ? [pierced] : [pierced, contact], expectedPulse: "collapse" };
  });
  const frame: LaserVfxFrame = { time, cycleId: 0, phase: "channel", elapsed: c.duration * 0.4, duration: c.duration, lanes };
  return { frame, releases: [] as LaserVfxRelease[], player, targets, cycle: 0, elapsed: frame.elapsed };
}

function playerAt(c: LaserDemoCase, time: number) {
  return { x: c.widths.length > 1 ? 238 + (c.moving ? Math.sin(time * 2) * 25 : 0) : 88 + (c.moving ? Math.sin(time * 2) * 25 : 0),
    y: 140 + (c.moving ? Math.cos(time * 1.4) * 14 : 0) };
}

function lanesAt(c: LaserDemoCase, cycle: number, elapsed: number, time: number): LaserVfxLane[] {
  const p = playerAt(c, time), u = Math.max(0, Math.min(1, elapsed / c.duration));
  return c.widths.map((width, i) => {
    const lane = ([0, -1, 1] as const)[i];
    const base = c.sharedTarget ? -0.2 : c.widths.length > 1 ? [-0.08, -2.5, 2.35][i] : -0.12;
    // Demo authoring chooses separate target paths; the real bridge reads actual solver angles.
    const angle = base + Math.sin(time * 1.7 + i) * (c.moving ? 0.18 : 0.06) + (c.moving ? cycle % 2 * 0.5 : 0);
    const range = c.range * (i > 0 ? 0.85 : 1), dx = Math.cos(angle), dy = Math.sin(angle);
    let focus = Math.min(1, elapsed / (i === 1 ? 2.1 : i === 2 ? 2.9 : 0.8));
    if (c.focusLoss) focus *= 1 - Math.max(0, Math.min(1, (u - 0.9) / 0.04));
    const kind: PulseKind = c.pulse === "mixed" ? (i === 0 ? "meltdown" : "collapse") :
      c.pulse === "meltdown" ? "meltdown" : c.pulse;
    const expectedPulse = kind === "meltdown" && focus < 1 ? "none" : kind;
    const contact = { x: p.x + dx * range * 0.72, y: p.y - 3 + dy * range * 0.72 };
    const shared = { x: p.x + Math.cos(-0.2) * c.range * 0.72, y: p.y - 3 + Math.sin(-0.2) * c.range * 0.72 };
    const point = c.sharedTarget ? shared : contact;
    const aimAngle = c.sharedTarget ? Math.atan2(point.y - (p.y - 3), point.x - p.x) : angle;
    return { lane, x: p.x + Math.cos(aimAngle) * 7, y: p.y - 3 + Math.sin(aimAngle) * 7,
      x2: p.x + Math.cos(aimAngle) * range, y2: p.y - 3 + Math.sin(aimAngle) * range, width,
      focus, target: { id: c.sharedTarget ? cycle * 10 + 1 : cycle * 10 + i + 1, ...point, radius: i === 2 ? 8 : 5 },
      contacts: [{ ...point, target: true }], expectedPulse };
  });
}

/** Seekable analytical scenario. Releases are explicit frozen snapshots at their real end time. */
export function sampleLaserDemo(c: LaserDemoCase, time: number) {
  const period = c.duration + c.recharge, cycle = Math.floor(Math.max(0, time) / period);
  const elapsed = Math.max(0, time) - cycle * period, channel = elapsed < c.duration;
  const lanes = lanesAt(c, cycle, Math.min(elapsed, c.duration), time);
  const frame: LaserVfxFrame = { time, cycleId: cycle, phase: channel ? "channel" : "recharge",
    elapsed: channel ? elapsed : c.duration, duration: c.duration, lanes: channel ? lanes : [] };
  const releases: LaserVfxRelease[] = [];
  // Include any release still alive, including a previous cycle during a short recharge.
  for (let old = Math.max(0, cycle - 1); old <= cycle; old++) {
    const at = old * period + c.duration;
    if (at > time || time - at >= 0.24) continue;
    for (const beam of lanesAt(c, old, c.duration, at)) releases.push({
      id: `${c.id}:${old}:${beam.lane}`, at, kind: beam.expectedPulse, beam,
    });
  }
  return { frame, releases, player: playerAt(c, time), targets: lanes.map(l => l.target!), cycle, elapsed };
}
