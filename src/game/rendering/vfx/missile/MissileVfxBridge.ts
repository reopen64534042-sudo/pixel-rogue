import type { GameCore } from "../../../core/GameCore";
import { MISSILE } from "../../../data/missile";
import type { MissileVfxSnapshot } from "./MissileVfxPlayer";

/** Only actual projectiles and authoritative impact/link events, never demo trajectories. */
export function captureMissileVfx(core: GameCore): MissileVfxSnapshot {
  const s = core.missile;
  return {
    flights: s.flights.map(p => ({ x: p.x, y: p.y, angle: p.angle, age: p.age,
      ejectDuration: p.volley.eject, igniteDuration: MISSILE.ignite,
      look: p.source === "swarm" || p.source === "recovered" ? "micro" : p.source === "main" && p.volley.ion ? "ion" : "heavy",
      trail: p.trail.map(point => ({ x: point.x, y: point.y, age: core.time - point.at })) })),
    launches: s.launches.map(e => ({ ...e, age: core.time - e.at })),
    impacts: s.impacts.map(e => ({ ...e, age: core.time - e.at })),
    arcs: s.arcs.map(e => ({ ...e, age: core.time - e.at })),
    charges: [...s.charges].filter(([e, c]) => !e.dead && c.until > core.time).map(([e, c]) => ({
      x: e.x, y: e.y, radius: e.r, count: c.count,
      age: Math.max(0, core.time - (c.until - MISSILE.chargeLife)), remaining: c.until - core.time,
    })),
  };
}
