import { MISSILE as M, MISSILE_UPGRADES, MISSILE_XP } from "../data/missile";
import type { GuidedMissile, MissileVolley } from "../data/missile";
import { MISSILE_DAMAGE as MD } from "../data/combatBalance";
import { missileArcDamage, missileBlastDamage, missileBurnDps, missileDecodeDamage,
  missileDotAmount, missileGroundPower, missileHealing, missileResonanceDamage } from "./DamageMath";
import type { GameCore } from "./GameCore";
import type { CombatStatsSnapshot, DamageSource, Enemy, Point } from "./types";

function auxiliary(core: GameCore, enemy: Enemy, raw: number, volley: MissileVolley,
  type: "physical" | "lightning" | "true", src: DamageSource, origin?: Point) {
  return core.hurtEnemy(enemy, raw, 0, 0, { type, src, origin, form: "ranged", noCrit: true,
    noOnHit: true, noChain: true, noLifesteal: true, fromExplode: true, attackerStats: volley.stats });
}

function gainXp(core: GameCore, volley: MissileVolley) {
  if (volley.xpGiven) return;
  volley.xpGiven = true;
  if (core.tutorialMode) {
    if (core.tutorialStep === 3) core.tutorialSpecialHits++;
    return;
  }
  const s = core.missile;
  if (s.level >= MISSILE_XP.length) return;
  s.xp++;
  const need = MISSILE_XP[s.level - 1];
  if (need === null || s.xp < need) return;
  s.xp -= need; s.level++;
  if (s.level >= 4) {
    const pool = MISSILE_UPGRADES.filter(u => u.minLevel <= s.level && !s.upgrades.includes(u.id));
    if (!pool.length) throw new Error(`Missile upgrade pool empty at level ${s.level}`);
    const upgrade = pool[Math.floor(Math.random() * pool.length)];
    s.upgrades.push(upgrade.id);
    core.addText(core.player.x, core.player.y - 28, upgrade.name, "#ffd24a", true);
  } else core.addText(core.player.x, core.player.y - 24, `导弹 Lv.${s.level}`, "#ffd24a");
  if (s.level === MISSILE_XP.length) s.xp = 0;
}

function heal(core: GameCore, loss: number, volley: MissileVolley) {
  const s = core.missile, p = core.player;
  s.heals = s.heals.filter(h => core.time - h.at < 1);
  const budget = Math.max(0, p.maxhp * M.healHpPerSecond - s.heals.reduce((n, h) => n + h.amount, 0));
  const amount = Math.min(budget, Math.max(0, p.maxhp - p.hp), missileHealing(loss, volley.lifesteal));
  if (amount > 0) { p.hp += amount; s.heals.push({ at: core.time, amount }); }
}

function impact(core: GameCore, x: number, y: number, radius: number, ion: boolean, micro = false, resonance = false) {
  core.missile.impacts.push({ x, y, at: core.time, radius, look: micro ? "micro" : ion ? "ion" : "heavy",
    ...(resonance ? { kind: "resonance" as const } : {}) });
}

/** Charge only direct ion contacts/arc targets, once per target/volley. Discharges are terminal. */
function charge(core: GameCore, e: Enemy, v: MissileVolley, bursts: { x: number; y: number }[]) {
  if (!v.traits["过载共振"] || v.charged.has(e) || e.dead) return;
  v.charged.add(e);
  const old = core.missile.charges.get(e);
  let count = (old && old.until > core.time ? old.count : 0) + 1;
  if (count >= M.chargeThreshold) { count -= M.chargeCost; bursts.push({ x: e.x, y: e.y }); }
  core.missile.charges.set(e, { count, until: core.time + M.chargeLife });
}

function arcs(core: GameCore, x: number, y: number, hits: readonly Enemy[], v: MissileVolley,
  bursts: { x: number; y: number }[]) {
  for (const e of hits) v.arcVisited.add(e);
  const next = (px: number, py: number) => core.enemies.filter(e => !e.dead && !v.arcVisited.has(e) &&
    Math.hypot(e.x - px, e.y - py) <= v.range * M.arcRange)
    .sort((a, b) => Math.hypot(a.x - px, a.y - py) - Math.hypot(b.x - px, b.y - py))[0];
  // Reserve both roots before relaying, so a relay cannot consume the other branch's root.
  const roots: Enemy[] = [];
  for (let i = 0; i < M.arcRoots; i++) { const e = next(x, y); if (!e) break; v.arcVisited.add(e); roots.push(e); }
  const hit = (px: number, py: number, e: Enemy, relay: boolean) => {
    const result = auxiliary(core, e, missileArcDamage(v.damage, relay), v, "lightning", "missileArc", { x: px, y: py });
    if (!result || result.effectiveHpLoss <= 0) return;
    core.missile.arcs.push({ x: px, y: py, x2: e.x, y2: e.y, at: core.time, ...(relay ? { relay: true } : {}) });
    charge(core, e, v, bursts);
  };
  for (const e of roots) {
    hit(x, y, e, false);
    if (!v.traits["电弧接力"]) continue;
    const target = next(e.x, e.y);
    if (target) { v.arcVisited.add(target); hit(e.x, e.y, target, true); }
  }
}

export interface MissilePursuit { x: number; y: number; target: Enemy; volley: MissileVolley; }

/** Sole entry for one projectile's detonation. Every hit still goes through CombatSystem. */
export function detonateMissile(core: GameCore, p: GuidedMissile, direct: Enemy): MissilePursuit | null {
  const s = core.missile, v = p.volley, main = p.source === "main";
  const micro = p.source === "swarm" || p.source === "recovered";
  const ion = main && v.ion;
  const beacon = s.beaconUntil > core.time ? s.beacon : null;
  const hits = core.enemies.filter(e => !e.dead && (e === direct || Math.hypot(e.x - p.x, e.y - p.y) <= p.radius + e.r))
    .sort((a, b) => a === b ? 0 : a === direct ? -1 : b === direct ? 1 : Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y));
  const fraction = main ? v.twin ? MD.twin : 1 : p.source === "swarm" ? MD.swarm : p.source === "recovered" ? MD.recovered : MD.pursuit;
  const firstContact = main && !v.contactUsed;
  if (firstContact) v.contactUsed = true;
  let killedBeacon = false, killedAny = false, effective = false;
  const bursts: { x: number; y: number }[] = [];
  impact(core, p.x, p.y, p.radius, ion, micro);
  for (const e of hits) {
    if (e.dead) continue;
    const distance = Math.hypot(e.x - p.x, e.y - p.y);
    const raw = missileBlastDamage(v.damage, fraction, Math.max(0, distance - e.r), p.radius,
      main && v.pressure, main && e === beacon && v.traits["猎杀信标"], e === direct);
    const knock = main ? M.mainKnock : micro ? M.microKnock : 0;
    const result = core.hurtEnemy(e, raw, distance ? (e.x - p.x) / distance * knock : 0,
      distance ? (e.y - p.y) / distance * knock : 0, {
        src: micro ? "missileSwarm" : "missileMain", type: ion ? "lightning" : "physical", form: "ranged",
        origin: p,
        noCrit: !main, critical: main ? v.critical : undefined,
        noOnHit: !(firstContact && e === direct), noChain: !(firstContact && e === direct),
        noLifesteal: true, fromExplode: true, attackerStats: v.stats,
      });
    if (!result) continue;
    if (result.effectiveHpLoss > 0) { effective = true; if (main) { gainXp(core, v); heal(core, result.effectiveHpLoss, v); } }
    killedAny ||= result.killed;
    if (e === beacon && result.killed) killedBeacon = true;
  }
  // Read the pre-impact beacon above; establish/refresh after damage, never retroactively boost it.
  if (firstContact && v.traits["猎杀信标"] && !direct.dead) {
    if (s.beacon !== direct || s.beaconUntil <= core.time) s.decode = 0;
    s.beacon = direct; s.beaconUntil = core.time + M.beaconLife;
    if (v.traits["弱点破译"]) {
      s.decode++;
      if (s.decode >= M.decodeThreshold) {
        s.decode -= M.decodeCost;
        const result = auxiliary(core, direct, missileDecodeDamage(v.damage), v, "true", "missileMain");
        if (result?.killed) { killedAny = true; killedBeacon = true; }
      }
    }
  }
  if (main && ion && effective) {
    charge(core, direct, v, bursts);
    if (!v.arcUsed) { v.arcUsed = true; arcs(core, p.x, p.y, hits, v, bursts); }
  }
  for (const burst of bursts) {
    impact(core, burst.x, burst.y, v.resonanceRadius, true, false, true);
    for (const e of core.enemies) {
      if (e.dead) continue;
      const d = Math.max(0, Math.hypot(e.x - burst.x, e.y - burst.y) - e.r);
      if (d <= v.resonanceRadius) auxiliary(core, e,
        missileBlastDamage(missileResonanceDamage(v.damage), 1, d, v.resonanceRadius, false, false), v, "lightning", "missileArc", burst);
    }
  }
  if (main && v.traits["余烬滞留"]) s.grounds.push({ x: p.x, y: p.y,
    radius: v.mainRadius * M.groundRadius, dps: missileBurnDps(v.damage), born: core.time,
    until: core.time + M.groundLife, stats: v.stats });
  if (main && v.traits["弹幕掩护"]) {
    core.ebullets = core.ebullets.filter(b => {
      if (b.reflected || v.cleared >= M.clearedBullets || Math.hypot(b.x - p.x, b.y - p.y) > p.radius + b.r) return true;
      v.cleared++; return false;
    });
  }
  if (p.source === "swarm" && killedAny && v.traits["蜂群回收"]) s.ammo = Math.min(M.ammoCap, s.ammo + 1);
  if (main && killedBeacon && v.traits["终结指令"] && !v.chaseUsed && core.time >= s.chaseUntil) {
    const target = core.enemies.filter(e => !e.dead && Math.hypot(e.x - p.x, e.y - p.y) <= v.range)
      .sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y))[0];
    if (target) {
      v.chaseUsed = true; s.chaseUntil = core.time + M.pursuitCooldown;
      s.beacon = target; s.beaconUntil = core.time + M.beaconLife; s.decode = Math.min(1, s.decode);
      return { x: p.x, y: p.y, target, volley: v };
    }
  }
  return null;
}

/** Integrate highest overlapping offensive ground power; settle float damage on shared ticks. */
export function updateMissileGround(core: GameCore, dt: number) {
  const s = core.missile;
  for (const e of core.enemies) {
    if (e.dead) continue;
    let best: (typeof s.grounds)[number] | null = null, amount = 0, power = -Infinity;
    for (const ground of s.grounds) {
      const active = Math.max(0, Math.min(core.time, ground.until) - Math.max(core.time - dt, ground.born));
      if (active <= 0 || Math.hypot(e.x - ground.x, e.y - ground.y) > ground.radius + e.r) continue;
      const candidate = missileGroundPower(missileDotAmount(ground.dps, active), ground.stats);
      if (candidate > power) { best = ground; power = candidate; amount = missileDotAmount(ground.dps, active); }
    }
    if (best) {
      const byStats = s.groundDamage.get(e) ?? new Map<Readonly<CombatStatsSnapshot>, number>();
      byStats.set(best.stats, (byStats.get(best.stats) ?? 0) + amount); s.groundDamage.set(e, byStats);
    }
  }
  const expired = s.grounds.some(g => g.until <= core.time);
  s.grounds = s.grounds.filter(g => g.until > core.time);
  s.groundTick += dt;
  if (s.groundTick + 1e-9 < M.groundTick && !expired) return;
  s.groundTick = 0;
  for (const [e, byStats] of s.groundDamage) for (const [stats, raw] of byStats) {
    if (e.dead) break;
    core.hurtEnemy(e, raw, 0, 0, { src: "missileBurn", type: "fire", form: "ranged", kind: "dot", continuous: true,
      noCrit: true, noOnHit: true, noChain: true, noLifesteal: true, fromExplode: true, attackerStats: stats });
  }
  s.groundDamage.clear();
}
