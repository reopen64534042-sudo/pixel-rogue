import { BOSS } from "../data/boss";
import type { BossHazard } from "./types";
import type { GameCore } from "./GameCore";
import { getEnemyCombatStats } from "./CombatStats";
import { HOSTILE_ATTACK_PROFILES as HA } from "../data/attackProfiles";

/** One pool for Boss and minion ground. Replace oldest at the shared four-zone cap. */
export function addHostileHazard(core: GameCore, hazard: BossHazard): void {
  if (core.hazards.length >= BOSS.hazard.max) core.hazards.shift();
  const profile = hazard.attackProfile ?? (hazard.kind === "fire" ? HA.groundFire
    : hazard.kind === "frost" ? HA.groundFrost : HA.groundLightning);
  core.hazards.push({ ...hazard, attackProfile: profile, hostile: true,
    stats: hazard.stats ?? getEnemyCombatStats(hazard.source) });
}

export function updateHostileHazards(core: GameCore, dt: number): boolean {
  for (const h of core.hazards) {
    h.t -= dt;
    h.tickT -= dt;
    if (h.tickT <= 1e-8 && h.t >= -1e-8) {
      h.tickT += h.interval ?? BOSS.hazard.tick;
      const p = core.player;
      if (h.source?.boss && (h.source.dead || core.bossState?.action === "transition")) continue;
      if (h.dmg > 0 && p.hurtCd <= 0 && p.dashT <= 0 && Math.hypot(p.x - h.x, p.y - h.y) <= h.r) {
        core.damagePlayer(h.dmg, { src: h.source, attackerStats: h.stats,
          ...(h.attackProfile ?? (h.kind === "fire" ? HA.groundFire
            : h.kind === "frost" ? HA.groundFrost : HA.groundLightning)),
          cause: "dot", kind: "dot" });
        if (core.state !== "play") return true;
      }
    }
  }
  core.hazards = core.hazards.filter(h => h.t > 0);
  return false;
}
