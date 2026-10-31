import { MISSILE as M, MISSILE_TALENT_NAMES, MISSILE_UPGRADES, MISSILE_XP, createMissileState } from "../data/missile";
import type { GuidedMissile, MissileSource, MissileTalentName, MissileUpgradeId, MissileVolley, PendingMissile } from "../data/missile";
import { MISSILE_NOSE } from "../data/missileGeometry";
import { MISSILE_VFX } from "../data/missileVfx";
import { MISSILE_DAMAGE as MD } from "../data/combatBalance";
import { WORLD } from "../data/constants";
import { statBase } from "../data/stats";
import { getPlayerCombatStats } from "./CombatStats";
import { laserOutputRate, missileBaseDamage } from "./DamageMath";
import { detonateMissile, updateMissileGround } from "./MissileCombat";
import type { GameCore } from "./GameCore";
import type { Enemy } from "./types";

export const missileUpgrade = (core: GameCore, id: MissileUpgradeId) => core.missile.upgrades.includes(id);
export const missileRange = (core: GameCore) => core.player.attackRange * (missileUpgrade(core, "range") ? MD.rangeUpgrade : 1);
export const missileRadius = (core: GameCore) => M.mainRadius * core.player.area * (missileUpgrade(core, "radius") ? MD.radiusUpgrade : 1);
export const missileReload = (core: GameCore) => M.reload * statBase("shooter").fireRate / laserOutputRate(core.player) * (missileUpgrade(core, "reload") ? MD.reload : 1);
export const missileDamage = (core: GameCore) => missileBaseDamage(core.player, core.missile.level, missileUpgrade(core, "liner"));
export const missileHas = (core: GameCore, name: MissileTalentName) => (core.player.upCounts[name] ?? 0) > 0;

/** Preserve progression and banked ammunition; discard every transient object/reference. */
export function clearMissileTransient(core: GameCore, clearInventory = false, finishVisuals = false) {
  const old = core.missile;
  core.missile = { ...createMissileState(), level: old.level, xp: old.xp, upgrades: [...old.upgrades],
    rounds: old.rounds, nextId: old.nextId, ammo: clearInventory ? 0 : old.ammo,
    heals: clearInventory ? [] : old.heals, chaseUntil: clearInventory ? 0 : old.chaseUntil,
    escapeUntil: clearInventory ? 0 : old.escapeUntil,
    impacts: finishVisuals ? old.impacts : [], launches: finishVisuals ? old.launches : [],
    arcs: finishVisuals ? old.arcs : [], escapes: finishVisuals ? old.escapes : [] };
}

function nearest(core: GameCore, x: number, y: number, range: number, excluded = new Set<Enemy>()) {
  let best: Enemy | null = null, distance = range;
  for (const e of core.enemies) {
    if (e.dead || excluded.has(e)) continue;
    const d = Math.hypot(e.x - x, e.y - y);
    if (d <= distance) { distance = d; best = e; }
  }
  return best;
}

function beginVolley(core: GameCore, target: Enemy) {
  const s = core.missile, p = core.player;
  s.rounds++;
  const third = s.rounds % M.cycle === 0;
  const traits = Object.fromEntries(MISSILE_TALENT_NAMES.map(name => [name, missileHas(core, name)])) as Record<MissileTalentName, boolean>;
  const area = p.area * (missileUpgrade(core, "radius") ? MD.radiusUpgrade : 1);
  const v: MissileVolley = {
    id: ++s.nextId, damage: missileDamage(core), stats: getPlayerCombatStats(p), lifesteal: p.lifesteal, traits,
    range: missileRange(core), mainRadius: M.mainRadius * area, microRadius: M.microRadius * area,
    resonanceRadius: M.resonanceRadius * area, speed: p.projSpeed * (missileUpgrade(core, "motor") ? MD.motor : 1),
    turn: M.turnRate * (missileUpgrade(core, "vector") ? MD.vector : 1),
    eject: missileUpgrade(core, "eject") ? MD.fastEject : M.eject, twin: missileUpgrade(core, "twin"),
    ion: third && traits["离子战斗部"], pressure: third && missileUpgrade(core, "pressure"),
    critical: Math.random() < p.crit, xpGiven: false, contactUsed: false, arcUsed: false, chaseUsed: false,
    cleared: 0, charged: new Set(), arcVisited: new Set(), roots: [target],
  };
  if (v.twin) {
    const beacon = s.beacon === target && s.beaconUntil > core.time;
    v.roots.push(beacon ? target : nearest(core, p.x, p.y, v.range, new Set([target])) ?? target);
  }
  s.lastVolley = v;
  s.reload = s.reloadTotal = missileReload(core); s.dashUsed = false;
  s.armorUntil = traits["应急装甲"] ? core.time + s.reloadTotal * M.armorWindow : 0;
  s.pending.push({ at: core.time, volley: v, source: "main", slot: 0 });
  if (v.twin) s.pending.push({ at: core.time + M.twinDelay, volley: v, source: "main", slot: 1 });
  if (third && traits["蜂巢弹舱"]) {
    for (let i = 0; i < M.microCount; i++) s.pending.push({ at: core.time + (i + 1) * M.microDelay, volley: v, source: "swarm", slot: i });
    const reserve = traits["蜂群回收"] ? Math.max(0, s.ammo - s.reservedAmmo) : 0;
    s.reservedAmmo += reserve;
    for (let i = 0; i < reserve; i++) s.pending.push({ at: core.time + (i + 1 + M.microCount) * M.microDelay, volley: v, source: "recovered", slot: i });
  }
}

function smallTarget(core: GameCore, v: MissileVolley, x: number, y: number, range: number, self?: GuidedMissile) {
  const primary = v.roots.find(e => !e.dead && Math.hypot(e.x - x, e.y - y) <= range);
  if (!v.traits["分导协同"]) return primary ?? nearest(core, x, y, range);
  const reserved = new Set(core.missile.flights.filter(p => p !== self && p.alive && p.source !== "main" && p.target && !p.target.dead).map(p => p.target as Enemy));
  const covered = new Set(core.enemies.filter(e => v.roots.some(root => !root.dead && Math.hypot(e.x - root.x, e.y - root.y) <= v.mainRadius + e.r)));
  const outside = new Set([...reserved, ...covered]);
  return nearest(core, x, y, range, outside) ?? nearest(core, x, y, range, reserved) ?? primary ?? nearest(core, x, y, range);
}

function launch(core: GameCore, v: MissileVolley, source: MissileSource, target: Enemy, x: number, y: number, side: number) {
  const main = source === "main", micro = source === "swarm" || source === "recovered";
  const desired = Math.atan2(target.y - y, target.x - x);
  const radius = main ? v.mainRadius * (v.pressure ? MD.pressureRadius : 1) : micro ? v.microRadius : v.mainRadius * MD.pursuitRadius;
  const angle = desired + side * 0.35;
  core.missile.flights.push({ x, y, angle, target, born: core.time, age: 0,
    pathLeft: M.pathRange * v.range + radius, volley: v, source, radius, alive: true,
    trail: [{ x, y, at: core.time }] });
  core.missile.launches.push({ x, y, angle, at: core.time, micro });
  if (main) core.audio.beep(160, 0.09, "sawtooth", 0.025, 200);
}

function release(core: GameCore, q: PendingMissile) {
  const v = q.volley, p = core.player;
  const root = v.roots[q.slot];
  const target = q.source === "main" ? (root && !root.dead && Math.hypot(root.x - p.x, root.y - p.y) <= v.range ? root : null) ?? nearest(core, p.x, p.y, v.range)
    : smallTarget(core, v, p.x, p.y, v.range);
  if (q.source === "recovered") core.missile.reservedAmmo = Math.max(0, core.missile.reservedAmmo - 1);
  if (!target) return;
  if (q.source === "recovered") { if (core.missile.ammo <= 0) return; core.missile.ammo--; }
  const side = q.source === "main" ? q.slot === 0 ? (v.id % 2 ? -1 : 1) : (v.id % 2 ? 1 : -1) : q.slot % 2 ? 1 : -1;
  const a = Math.atan2(target.y - (p.y - 3), target.x - p.x), perp = a + Math.PI / 2;
  launch(core, v, q.source, target, p.x + Math.cos(perp) * 5 * side, p.y - 3 + Math.sin(perp) * 5 * side, side);
}

function sweptHit(x: number, y: number, x2: number, y2: number, e: Enemy, radius: number): number | null {
  const ox = x - e.x, oy = y - e.y, r = e.r + radius;
  const c = ox * ox + oy * oy - r * r;
  if (c <= 0) return 0;
  const dx = x2 - x, dy = y2 - y, a = dx * dx + dy * dy;
  if (a <= 0) return null;
  const b = 2 * (ox * dx + oy * dy), discriminant = b * b - 4 * a * c;
  if (discriminant < 0) return null;
  const t = (-b - Math.sqrt(discriminant)) / (2 * a);
  return t >= 0 && t <= 1 ? t : null;
}

function advance(core: GameCore, p: GuidedMissile, dt: number) {
  const v = p.volley, micro = p.source === "swarm" || p.source === "recovered";
  const elapsed = Math.max(0, Math.min(dt, core.time - p.born - p.age, M.life - p.age));
  if (elapsed <= 0) return;
  if (!p.target || p.target.dead || !core.enemies.includes(p.target)) {
    p.target = micro ? smallTarget(core, v, p.x, p.y, Math.min(v.range, p.pathLeft), p)
      : nearest(core, p.x, p.y, Math.min(v.range, p.pathLeft));
  }
  const nose = micro ? MISSILE_NOSE.micro : MISSILE_NOSE.main;
  const x1 = p.x + Math.cos(p.angle) * nose, y1 = p.y + Math.sin(p.angle) * nose;
  const oldX = p.x, oldY = p.y;
  if (p.target && p.age + elapsed > v.eject) {
    const desired = Math.atan2(p.target.y - p.y, p.target.x - p.x);
    const difference = Math.atan2(Math.sin(desired - p.angle), Math.cos(desired - p.angle));
    const turn = v.turn * Math.min(elapsed, p.age + elapsed - v.eject);
    p.angle += Math.max(-turn, Math.min(turn, difference));
  }
  const acceleration = Math.max(0, Math.min(1, (p.age + elapsed / 2 - v.eject) / M.ignite));
  const cruise = v.speed * (micro ? M.microSpeed : 1);
  const speed = M.ejectSpeed + (cruise - M.ejectSpeed) * acceleration;
  let travel = Math.min(speed * elapsed, p.pathLeft);
  const dx = Math.cos(p.angle), dy = Math.sin(p.angle);
  const edgeX = dx > 0 ? (WORLD.w - p.x) / dx : dx < 0 ? -p.x / dx : Infinity;
  const edgeY = dy > 0 ? (WORLD.h - p.y) / dy : dy < 0 ? -p.y / dy : Infinity;
  travel = Math.max(0, Math.min(travel, edgeX, edgeY));
  p.x += dx * travel; p.y += dy * travel; p.pathLeft -= travel; p.age += elapsed;
  const x2 = p.x + dx * nose, y2 = p.y + dy * nose;
  let target: Enemy | null = null, first = Infinity;
  for (const e of core.enemies) if (!e.dead) {
    const t = sweptHit(x1, y1, x2, y2, e, micro ? M.microHitRadius : M.mainHitRadius);
    if (t !== null && t < first) { first = t; target = e; }
  }
  if (target) {
    p.x = x1 + (x2 - x1) * first; p.y = y1 + (y2 - y1) * first; p.alive = false;
    const pursuit = detonateMissile(core, p, target);
    if (pursuit) launch(core, pursuit.volley, "pursuit", pursuit.target, pursuit.x, pursuit.y, 0);
    return;
  }
  p.trail.push({ x: p.x, y: p.y, at: core.time });
  p.trail = p.trail.filter(point => core.time - point.at < M.trailLife).slice(-12);
  if (p.age + 1e-9 >= M.life || p.pathLeft <= 1e-9 || travel < speed * elapsed - 1e-9 ||
      (p.x === oldX && p.y === oldY)) {
    p.alive = false; core.missile.launches.push({ x: p.x, y: p.y, angle: p.angle, at: core.time, micro });
  }
}

function escape(core: GameCore) {
  const s = core.missile, p = core.player;
  if (!missileHas(core, "近炸保险") || core.time < s.escapeUntil) return;
  const target = nearest(core, p.x, p.y, M.escapeRange);
  if (!target) return;
  const angle = Math.atan2(target.y - p.y, target.x - p.x);
  s.escapeUntil = core.time + M.escapeCooldown;
  s.escapes.push({ x: p.x, y: p.y, angle, at: core.time });
  for (const e of core.enemies) {
    if (e.dead || e.noKnock) continue;
    const dx = e.x - p.x, dy = e.y - p.y, d = Math.hypot(dx, dy);
    const a = d ? Math.atan2(dy, dx) : angle;
    if (d > M.escapeRange + e.r || Math.abs(Math.atan2(Math.sin(a - angle), Math.cos(a - angle))) > M.escapeArc / 2) continue;
    e.x = Math.max(e.r, Math.min(WORLD.w - e.r, e.x + Math.cos(a) * M.escapeKnock));
    e.y = Math.max(e.r, Math.min(WORLD.h - e.r, e.y + Math.sin(a) * M.escapeKnock));
  }
}

export function updateMissile(this: GameCore, dt: number) {
  if (this.prof !== "shooter" || this.shooterWeapon !== "missile") return;
  const s = this.missile;
  s.launches = s.launches.filter(e => this.time - e.at < 0.3);
  s.impacts = s.impacts.filter(e => this.time - e.at < 0.69);
  s.arcs = s.arcs.filter(e => this.time - e.at < MISSILE_VFX.arcLife);
  s.escapes = s.escapes.filter(e => this.time - e.at < 0.25);
  s.heals = s.heals.filter(h => this.time - h.at < 1);
  for (const [enemy, charge] of s.charges) if (enemy.dead || charge.until <= this.time) s.charges.delete(enemy);
  if (s.beacon?.dead || s.beaconUntil <= this.time) { s.beacon = null; s.decode = 0; }
  if (!this.tutorialMode && this.wavePhase !== "fight") return;
  s.reload = Math.max(0, s.reload - dt);
  if (s.reload <= 1e-9) {
    const marked = s.beacon && !s.beacon.dead && Math.hypot(s.beacon.x - this.player.x, s.beacon.y - this.player.y) <= missileRange(this) ? s.beacon : null;
    const target = marked ?? nearest(this, this.player.x, this.player.y, missileRange(this));
    if (target) beginVolley(this, target);
  }
  const ready = s.pending.filter(q => q.at <= this.time + 1e-9);
  s.pending = s.pending.filter(q => q.at > this.time + 1e-9);
  for (const q of ready) release(this, q);
  // New pursuit missiles are appended for the next fixed step, not recursively advanced now.
  for (const flight of [...s.flights]) if (flight.alive) advance(this, flight, dt);
  s.flights = s.flights.filter(p => p.alive);
  if (this.state !== "play") return;
  updateMissileGround(this, dt);
  escape(this);
  if (s.beacon?.dead) { s.beacon = null; s.decode = 0; }
  for (const enemy of s.charges.keys()) if (enemy.dead) s.charges.delete(enemy);
}

export function missileDash(this: GameCore) {
  if (this.prof !== "shooter" || this.shooterWeapon !== "missile" || !missileHas(this, "惯性装填")) return;
  const s = this.missile;
  if (s.reload > 0 && !s.dashUsed) { s.reload *= M.dashReload; s.dashUsed = true; }
}

export function devSetMissileLevel(this: GameCore, level: number) {
  if (!Number.isFinite(level)) return;
  clearMissileTransient(this, true);
  const s = this.missile;
  s.level = Math.max(1, Math.min(MISSILE_XP.length, Math.floor(level))); s.xp = 0; s.upgrades = [];
  for (let lv = 4; lv <= s.level; lv++) {
    const next = MISSILE_UPGRADES.find(u => u.minLevel <= lv && !s.upgrades.includes(u.id));
    if (!next) throw new Error(`Missile upgrade pool empty at DEV level ${lv}`);
    s.upgrades.push(next.id);
  }
}
