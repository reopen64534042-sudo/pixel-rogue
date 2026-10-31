import type { Enemy } from "../../../core/types";
import type { LaserVfxFrame, LaserVfxLane, LaserVfxRelease, PulseKind } from "./LaserVfxPlayer";

interface LaserV137Aim {
  readonly target: Enemy | null;
  readonly focus: number;
}
interface LaserV137Line {
  readonly x: number;
  readonly y: number;
  readonly x2: number;
  readonly y2: number;
  readonly width: number;
  readonly lane?: -1 | 0 | 1;
  readonly kind: string;
  readonly pulse?: "collapse" | "meltdown" | "scatter";
  readonly t: number;
  readonly max: number;
}
interface LaserV137State extends LaserV137Aim {
  readonly phase: "idle" | "channel" | "recharge";
  readonly total: number;
  readonly remaining: number;
  readonly sideAims: Readonly<Record<-1 | 1, LaserV137Aim>>;
  readonly lines: readonly LaserV137Line[];
  readonly aux: readonly LaserV137Line[];
  readonly contacts: readonly { x: number; y: number; lane?: -1 | 0 | 1; target: boolean }[];
}
/** Structural read-only boundary; the asset package does not import the combat draft. */
export interface LaserV137CoreSnapshot {
  readonly prof: string;
  readonly shooterWeapon: string;
  readonly state: string;
  readonly time: number;
  readonly player: { readonly upCounts: Readonly<Record<string, number>> };
  readonly laser: LaserV137State;
  readonly laserUpgrades: readonly string[];
}

/** Read-only compatibility bridge. Call AFTER EVERY fixed simulation step, not just render. */
export class LaserV137Bridge {
  private previous: LaserVfxFrame | null = null;
  private seenPulses = new WeakSet<LaserV137Line>();
  private targetIds = new WeakMap<Enemy, number>();
  private nextTargetId = 0;
  private cycleId = 0;
  private owner: LaserV137CoreSnapshot | null = null;
  private laserOwner: LaserV137State | null = null;

  reset() {
    this.previous = null; this.seenPulses = new WeakSet(); this.targetIds = new WeakMap();
    this.nextTargetId = 0; this.cycleId = 0; this.owner = null; this.laserOwner = null;
  }

  capture(core: LaserV137CoreSnapshot): { frame: LaserVfxFrame; releases: LaserVfxRelease[]; reset: boolean } {
    const reset = this.owner !== core || (this.laserOwner !== null && this.laserOwner !== core.laser) ||
      (this.previous !== null && core.time < this.previous.time) ||
      core.prof !== "shooter" || core.shooterWeapon !== "laser" || core.state === "over" || core.state === "start";
    if (reset) this.reset();
    this.owner = core;
    this.laserOwner = core.laser;
    const active = core.prof === "shooter" && core.shooterWeapon === "laser" && core.state !== "over" && core.state !== "start";
    const state = core.laser;
    if (active && state.phase === "channel" && this.previous?.phase !== "channel") this.cycleId++;
    const laneFrom = (line: LaserV137Line, pulse?: PulseKind): LaserVfxLane => {
      const aim = line.lane === -1 || line.lane === 1 ? state.sideAims[line.lane] : state;
      const target = aim.target;
      if (target && !this.targetIds.has(target)) this.targetIds.set(target, ++this.nextTargetId);
      return { lane: line.lane ?? 0, x: line.x, y: line.y, x2: line.x2, y2: line.y2,
        width: line.width, focus: aim.focus,
        target: target && !target.dead ? { id: this.targetIds.get(target)!, x: target.x, y: target.y, radius: target.r } : null,
        contacts: state.contacts.filter(c => (c.lane ?? 0) === (line.lane ?? 0)).map(c => ({ x: c.x, y: c.y, target: c.target })),
        expectedPulse: pulse ?? (core.player.upCounts["熔断"] && aim.focus >= 1 ? "meltdown" : core.laserUpgrades.includes("collapse") ? "collapse" : "none") };
    };
    const frame: LaserVfxFrame = { time: core.time, cycleId: this.cycleId, phase: active ? state.phase : "idle",
      elapsed: state.phase === "channel" ? Math.max(0, state.total - state.remaining) : 0,
      duration: state.phase === "channel" ? state.total : this.previous?.duration ?? 1,
      lanes: active ? state.lines.filter(l => l.kind === "main").map(l => laneFrom(l)) : [] };
    const releases: LaserVfxRelease[] = [];
    if (active) for (const line of state.aux) {
      if (line.kind !== "pulse" || (line.pulse !== "collapse" && line.pulse !== "meltdown") || this.seenPulses.has(line)) continue;
      this.seenPulses.add(line);
      const at = core.time - Math.max(0, line.max - line.t);
      const previousLane = this.previous?.lanes.find(l => l.lane === (line.lane ?? 0));
      const beam = laneFrom(line, line.pulse);
      releases.push({ id: `${this.cycleId}:${line.lane ?? 0}:${at}`, at, kind: line.pulse,
        beam: { ...beam, focus: line.pulse === "meltdown" ? 1 : previousLane?.focus ?? beam.focus,
          target: previousLane?.target ?? beam.target, contacts: previousLane?.contacts ?? beam.contacts } });
    }
    if (active && this.previous?.phase === "channel" && frame.phase !== "channel") {
      for (const beam of this.previous.lanes) if (!releases.some(r => r.beam.lane === beam.lane)) {
        // No predicted gold release: missing authoritative pulse always becomes normal decay.
        releases.push({ id: `${this.cycleId}:${beam.lane}:end`, at: core.time, kind: "none", beam });
      }
    }
    this.previous = frame;
    return { frame, releases, reset };
  }
}
