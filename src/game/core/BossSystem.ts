import { BOSS, BOSS_ATTACKS, BOSS_PHASES, BOSS_STOMP_RADIUS, THREE_HEADED_BEAST } from "../data/boss";
import { WORLD, clamp } from "../data/constants";
import type { DamageTypeId } from "../data/damageTypes";
import { bossAttackDamage, bossGroundTickDamage, bossRewardXp } from "./DamageMath";
import { frostSlowFactor } from "./ElementMath";
import type { GameCore } from "./GameCore";
import type { BossAttackId, BossPhase, BossState, Enemy, Point } from "./types";

export function clearBossTransient(core: GameCore): void {
  core.bossState = null;
  core.bossHazards = [];
  core.bossStrikes = [];
  core.bossImpacts = [];
  core.bossSlowT = 0;
}

export function bossInvulnerable(core: GameCore, e: Enemy): boolean {
  return !!e.boss && core.bossState?.enemy === e && core.bossState.action === "transition";
}

export function bossDamageTakenMultiplier(core: GameCore, e: Enemy): number {
  return e.boss && core.bossState?.enemy === e && core.bossState.action === "stagger"
    ? bossAttackDamage(1, "vulnerability") : 1;
}

function cooldowns(): BossState["cooldowns"] {
  return { stomp: 0, charge: 0, breath: 0, nova: 0, spikes: 0, marks: 0, chain: 0 };
}

export function spawnBoss(core: GameCore): void {
  clearBossTransient(core);
  const e = core.spawnEnemy("boss_three");
  const a = Math.atan2(WORLD.h / 2 - core.player.y, WORLD.w / 2 - core.player.x);
  e.x = clamp(core.player.x + Math.cos(a) * BOSS.spawnDistance, BOSS.margin, WORLD.w - BOSS.margin);
  e.y = clamp(core.player.y + Math.sin(a) * BOSS.spawnDistance, BOSS.margin, WORLD.h - BOSS.margin);
  e.speed = THREE_HEADED_BEAST.speed; // Boss 不采用普通敌人的随机移速抖动。
  e.xp = bossRewardXp(core.waveN, e.xpMul ?? 1);
  e.boss = true;
  e.noKnock = true;
  core.bossState = {
    enemy: e, phase: 1, action: "intro", actionT: BOSS.intro,
    attack: null, lastAttack: null, cooldowns: cooldowns(), angle: a + Math.PI,
    targets: [], farT: 0, enraged: false, dashHit: false, summonedThrough: 1,
    castRepeats: 0, castTickT: 0,
  };
  core.shake = Math.max(core.shake, 2);
  core.audio.beep(65, 0.5, "sawtooth", 0.07, -25);
  core.addText(e.x, e.y - 28, BOSS.name, "#ff8c3a", true);
}

/** 直伤和各 DoT 扣血后立即检查；同一帧后续命中也会受到转换无敌保护。 */
export function syncBossPhase(core: GameCore, e: Enemy): void {
  const s = core.bossState;
  if (!e.boss || !s || s.enemy !== e || e.dead || e.hp <= 0) return;
  const ratio = e.hp / e.maxhp;
  const phase: BossPhase = ratio <= BOSS.thresholds[1] ? 3 : ratio <= BOSS.thresholds[0] ? 2 : 1;
  if (phase <= s.phase) return;
  s.phase = phase;
  s.action = "transition";
  s.actionT = BOSS.transition;
  s.attack = null;
  s.lastAttack = null;
  s.targets = [];
  s.castRepeats = 0;
  s.castTickT = 0;
  s.cooldowns = cooldowns();
  core.ebullets = core.ebullets.filter((b) => b.reflected);
  core.bossHazards = [];
  core.bossStrikes = [];
  core.bossImpacts = [];
  core.bossSlowT = 0;
  core.shake = Math.max(core.shake, 3);
  core.addText(e.x, e.y - 28, `${BOSS_PHASES[phase].name} · 苏醒`, BOSS_PHASES[phase].color, true);
  core.audio.beep(85, 0.35, "sawtooth", 0.07, 45);
}

function summon(core: GameCore, s: BossState): void {
  // 跨越两个阈值只进入最终阶段，只召唤最终阶段的随从。
  if (s.phase <= s.summonedThrough) return;
  s.summonedThrough = s.phase;
  for (let i = 0; i < BOSS.summons; i++) {
    const e = core.spawnEnemy(s.phase === 2 ? "bat" : "charger");
    const a = s.angle + (i === 0 ? -Math.PI / 2 : Math.PI / 2);
    e.x = clamp(s.enemy.x + Math.cos(a) * 48, BOSS.margin, WORLD.w - BOSS.margin);
    e.y = clamp(s.enemy.y + Math.sin(a) * 48, BOSS.margin, WORLD.h - BOSS.margin);
    e.noDrop = true;
    e.xp = 0;
    e.bossSummon = true;
  }
}

function ready(s: BossState, id: BossAttackId): boolean {
  return s.cooldowns[id] <= 0 && s.lastAttack !== id;
}

function chooseAttack(s: BossState, distance: number): BossAttackId | null {
  if (distance < BOSS.closeDistance && ready(s, "stomp")) return "stomp";
  if (distance > BOSS.chargePriorityDistance && ready(s, "charge")) return "charge";
  const stageAttack = BOSS_PHASES[s.phase].attacks.find((id) => ready(s, id) &&
    (id === "marks" || distance <= (id === "breath" ? BOSS.breath.radius :
      id === "nova" ? BOSS.nova.secondRadius : id === "spikes" ? BOSS.spikes.spacing * BOSS.spikes.count + BOSS.spikes.radius : BOSS.chain.length)));
  if (stageAttack) return stageAttack;
  if (distance >= BOSS.chargeMinDistance && ready(s, "charge")) return "charge";
  return null;
}

function startAttack(core: GameCore, s: BossState, attack: BossAttackId): void {
  s.attack = attack;
  s.lastAttack = attack;
  s.action = "windup";
  s.actionT = BOSS_ATTACKS[attack].windup;
  s.angle = Math.atan2(core.player.y - s.enemy.y, core.player.x - s.enemy.x);
  s.targets = [];
  s.castRepeats = 0;
  s.castTickT = 0;
  s.cooldowns[attack] = attack === "charge" ? BOSS.charge.cooldowns[s.phase - 1] : BOSS_ATTACKS[attack].cooldown;
  if (attack === "spikes") {
    for (let i = 1; i <= BOSS.spikes.count; i++) {
      const target = {
        x: clamp(s.enemy.x + Math.cos(s.angle) * BOSS.spikes.spacing * i, BOSS.margin, WORLD.w - BOSS.margin),
        y: clamp(s.enemy.y + Math.sin(s.angle) * BOSS.spikes.spacing * i, BOSS.margin, WORLD.h - BOSS.margin),
      };
      s.targets.push(target);
      const windup = s.actionT + (i - 1) * BOSS.spikes.stagger;
      core.bossStrikes.push({ ...target, attack: "spikes", windup, innerR: 0, r: BOSS.spikes.radius, t: windup,
        dmg: bossAttackDamage(s.enemy.dmg, "spikes"), type: "frost" });
    }
  } else if (attack === "marks") {
    queueMarks(core, s);
  }
  core.audio.beep(180, 0.12, "triangle", 0.035, 40);
}

function queueMarks(core: GameCore, s: BossState): void {
  const angle = Math.atan2(core.player.y - s.enemy.y, core.player.x - s.enemy.x);
  s.targets = [];
  for (let i = 0; i < BOSS.marks.count; i++) {
    const offset = (i - (BOSS.marks.count - 1) / 2) * BOSS.marks.offset;
    const target = {
      x: clamp(core.player.x - Math.sin(angle) * offset, BOSS.margin, WORLD.w - BOSS.margin),
      y: clamp(core.player.y + Math.cos(angle) * offset, BOSS.margin, WORLD.h - BOSS.margin),
    };
    s.targets.push(target);
    core.bossStrikes.push({ ...target, attack: "marks", windup: BOSS_ATTACKS.marks.windup, innerR: 0,
      r: BOSS.marks.radius, t: BOSS_ATTACKS.marks.windup, dmg: bossAttackDamage(s.enemy.dmg, "marks"), type: "lightning" });
  }
}

export function bossLineContains(origin: Point, angle: number, point: Point, length: number, width: number): boolean {
  const dx = point.x - origin.x, dy = point.y - origin.y;
  const along = dx * Math.cos(angle) + dy * Math.sin(angle);
  const across = Math.abs(-dx * Math.sin(angle) + dy * Math.cos(angle));
  return along >= 0 && along <= length && across <= width / 2;
}

/** 所有 Boss 伤害先通过同一受击门禁，再委托现有 damagePlayer。 */
function hitPlayer(core: GameCore, s: BossState, damage: number, type: DamageTypeId, dot = false): boolean {
  const p = core.player;
  if (core.state !== "play" || core.bossState !== s || s.enemy.dead || s.action === "transition" || p.hurtCd > 0 || p.dashT > 0) return false;
  const hit = core.damagePlayer(damage, {
    src: s.enemy, type, form: type === "physical" ? "melee" : "other",
    melee: type === "physical",
    cause: dot ? "dot" : "explosion", kind: dot ? "dot" : "hit",
  });
  return core.bossState === s && core.state === "play" && !s.enemy.dead &&
    !hit.dodged && !hit.preventedDeath && hit.effectiveHpLoss > 0;
}

function circleContains(core: GameCore, target: Point, r: number): boolean {
  return Math.hypot(core.player.x - target.x, core.player.y - target.y) <= r;
}

function addHazard(core: GameCore, s: BossState, kind: "fire" | "frost", at: Point, r: number): void {
  if (core.bossState !== s || s.enemy.dead || s.action === "transition") return;
  if (core.bossHazards.length >= BOSS.hazard.max) core.bossHazards.shift();
  core.bossHazards.push({
    kind, ...at, r, t: BOSS.hazard.duration, tickT: BOSS.hazard.tick,
    dmg: bossGroundTickDamage(s.enemy.dmg, kind),
    slowF: kind === "frost" ? BOSS.hazard.slow : 0,
  });
}

function recover(s: BossState): void {
  s.action = "recover";
  s.actionT = BOSS.recover;
}

function impact(core: GameCore, s: BossState, attack: NonNullable<BossState["attack"]>, at: Point = s.enemy,
  r = 0, innerR = 0, points: Point[] = []): void {
  if (core.bossState !== s || s.enemy.dead || s.action === "transition") return;
  if (core.bossImpacts.length >= 24) core.bossImpacts.shift();
  const max = attack === "spikes" ? 0.85 : attack === "breath" ? 0.38 : 0.55;
  core.bossImpacts.push({ x: at.x, y: at.y, attack, phase: s.phase, angle: s.angle, r, innerR, t: max, max, points });
}

function cast(s: BossState, duration: number): void {
  s.action = "cast";
  s.actionT = duration;
}

function resolveBreath(core: GameCore, s: BossState): void {
  const e = s.enemy, p = core.player;
  const dx = p.x - e.x, dy = p.y - e.y;
  const a = Math.atan2(Math.sin(Math.atan2(dy, dx) - s.angle), Math.cos(Math.atan2(dy, dx) - s.angle));
  if (Math.hypot(dx, dy) <= BOSS.breath.radius && Math.abs(a) <= BOSS.breath.arc / 2)
    hitPlayer(core, s, bossAttackDamage(e.dmg, "breath"), "fire");
  impact(core, s, "breath", e, BOSS.breath.radius);
}

function resolveAttack(core: GameCore, s: BossState): void {
  const e = s.enemy, p = core.player;
  const attack = s.attack;
  if (!attack) return;
  if (attack === "charge") {
    s.action = "dash";
    s.actionT = BOSS.charge.duration;
    s.dashHit = false;
    core.audio.beep(70, 0.25, "sawtooth", 0.06, 40);
    return;
  }
  if (attack === "stomp") {
    if (circleContains(core, e, BOSS_STOMP_RADIUS)) hitPlayer(core, s, bossAttackDamage(e.dmg, "stomp"), "physical");
    impact(core, s, "stomp", e, BOSS_STOMP_RADIUS);
  }
  if (attack === "breath") {
    resolveBreath(core, s);
    for (const d of BOSS.breath.groundDistances) addHazard(core, s, "fire", {
      x: clamp(e.x + Math.cos(s.angle) * d, BOSS.margin, WORLD.w - BOSS.margin),
      y: clamp(e.y + Math.sin(s.angle) * d, BOSS.margin, WORLD.h - BOSS.margin),
    }, BOSS.hazard.radius);
  }
  if (attack === "nova") {
    const d = Math.hypot(p.x - e.x, p.y - e.y);
    if (d >= BOSS.nova.innerRadius && d <= BOSS.nova.radius && hitPlayer(core, s, bossAttackDamage(e.dmg, "nova"), "frost"))
      core.bossSlowT = BOSS.slowDuration;
    impact(core, s, "nova", e, BOSS.nova.radius, BOSS.nova.innerRadius);
    if (core.bossState === s && s.action !== "transition") {
      core.bossStrikes.push({ x: e.x, y: e.y, attack: "nova", r: BOSS.nova.secondRadius,
        innerR: BOSS.nova.secondInnerRadius, windup: BOSS.nova.repeatDelay, t: BOSS.nova.repeatDelay,
        dmg: bossAttackDamage(e.dmg, "nova"), type: "frost" });
    }
  }
  if (attack === "chain") {
    // 随从作为导电节点：主线命中玩家 100%；主线命中随从时可向 100px 内玩家跳跃 60%。
    let points: Point[] = [];
    if (bossLineContains(e, s.angle, p, BOSS.chain.length, BOSS.chain.width)) {
      hitPlayer(core, s, bossAttackDamage(e.dmg, "chain"), "lightning");
    } else {
      const relay = core.enemies.find((o) => !o.dead && o.bossSummon &&
        bossLineContains(e, s.angle, o, BOSS.chain.length, BOSS.chain.width + o.r * 2) &&
        Math.hypot(o.x - p.x, o.y - p.y) <= BOSS.chain.jumpRange);
      if (relay) {
        points = [{ x: relay.x, y: relay.y }, { x: p.x, y: p.y }];
        hitPlayer(core, s, bossAttackDamage(e.dmg, "chainJump"), "lightning");
      }
    }
    impact(core, s, "chain", e, BOSS.chain.length, 0, points);
  }
  if (core.bossState !== s || e.dead || s.action !== "windup") return;
  if (attack === "breath") {
    cast(s, BOSS.breath.duration);
    s.castRepeats = BOSS.breath.repeats;
    s.castTickT = BOSS.breath.tick;
  } else if (attack === "nova") cast(s, BOSS.nova.repeatDelay);
  else if (attack === "spikes") cast(s, (BOSS.spikes.count - 1) * BOSS.spikes.stagger);
  else if (attack === "marks") {
    cast(s, (BOSS.marks.salvos - 1) * (BOSS_ATTACKS.marks.windup + BOSS.marks.salvoGap));
    s.castRepeats = BOSS.marks.salvos - 1;
    s.castTickT = BOSS.marks.salvoGap;
  } else recover(s);
  core.shake = Math.max(core.shake, attack === "stomp" ? 3 : 2);
  core.audio.beep(attack === "chain" ? 1200 : 80, 0.18, "sawtooth", 0.055, -45);
}

function updateHazards(core: GameCore, s: BossState, dt: number): void {
  for (const strike of core.bossStrikes) {
    strike.t -= dt;
    if (strike.t <= 0) {
      const d = Math.hypot(core.player.x - strike.x, core.player.y - strike.y);
      if (d >= strike.innerR && d <= strike.r) {
        const hit = hitPlayer(core, s, strike.dmg, strike.type);
        if (hit && strike.attack === "nova") core.bossSlowT = BOSS.slowDuration;
      }
      impact(core, s, strike.attack, strike, strike.r, strike.innerR);
      if (strike.attack === "spikes") addHazard(core, s, "frost", strike, strike.r);
      core.shake = Math.max(core.shake, strike.attack === "marks" ? 2.4 : 1.8);
      core.audio.beep(strike.attack === "marks" ? 1500 : 240, 0.1, "triangle", 0.035, -160);
    }
    if (core.bossState !== s || core.state !== "play" || s.action === "transition") return;
  }
  core.bossStrikes = core.bossStrikes.filter((strike) => strike.t > 0);
  for (const h of core.bossHazards) {
    h.t -= dt;
    h.tickT -= dt;
    if (h.tickT <= 0 && h.t >= -1e-8) {
      h.tickT += BOSS.hazard.tick;
      if (circleContains(core, h, h.r) && h.dmg > 0) hitPlayer(core, s, h.dmg, h.kind, true);
      if (core.bossState !== s || core.state !== "play" || s.action === "transition") return;
    }
  }
  core.bossHazards = core.bossHazards.filter((h) => h.t > 0);
}

export function updateBosses(core: GameCore, dt: number): boolean {
  const s = core.bossState;
  if (!s || s.enemy.dead) return false;
  for (const v of core.bossImpacts) v.t -= dt;
  core.bossImpacts = core.bossImpacts.filter((v) => v.t > 0);
  const e = s.enemy;
  syncBossPhase(core, e);
  core.bossSlowT = Math.max(0, core.bossSlowT - dt);
  updateHazards(core, s, dt);
  if (core.bossState !== s || core.state !== "play") return true;
  e.flash = Math.max(0, e.flash - dt);
  e.orbCd -= dt;
  e.slowT = Math.max(0, e.slowT - dt);
  if (e.armorBreakT) e.armorBreakT = Math.max(0, e.armorBreakT - dt);
  if (e.burnT > 0) {
    e.burnT -= dt;
    core.applyBurnDot(e, dt);
    if (e.hp <= 0) { core.killEnemy(e); return false; }
  } else e.burnStacks = 0;
  for (const id of Object.keys(s.cooldowns) as BossAttackId[]) s.cooldowns[id] = Math.max(0, s.cooldowns[id] - dt);
  const distance = Math.hypot(core.player.x - e.x, core.player.y - e.y);
  const moveX = e.x, moveY = e.y;
  if (core.prof === "mage") { e.vx = 0; e.vy = 0; }
  if (distance > BOSS.enrageDistance) s.farT += dt;
  else s.farT = 0;
  if (s.farT >= BOSS.enrageTime) s.enraged = true;
  if (distance < BOSS.enrageEndDistance) s.enraged = false;
  s.actionT -= dt;
  if (s.action === "intro" || s.action === "transition") {
    if (s.actionT <= 0) {
      if (s.action === "transition") summon(core, s);
      s.action = "chase";
      s.actionT = BOSS.actionInterval * (s.phase === 3 ? BOSS.finalIntervalMul : 1);
    }
  } else if (s.action === "windup") {
    if (s.actionT <= 0) resolveAttack(core, s);
  } else if (s.action === "cast") {
    s.castTickT -= dt;
    if (s.castRepeats > 0 && s.castTickT <= 0) {
      s.castRepeats--;
      if (s.attack === "breath") {
        resolveBreath(core, s);
        s.castTickT += BOSS.breath.tick;
      } else if (s.attack === "marks") {
        queueMarks(core, s);
        s.castTickT += BOSS_ATTACKS.marks.windup + BOSS.marks.salvoGap;
      }
    }
    if (core.bossState !== s || core.state !== "play") return true;
    if (s.action === "cast" && s.actionT <= 0) recover(s);
  } else if (s.action === "dash") {
    const x0 = e.x, y0 = e.y;
    const step = BOSS.charge.speed * Math.min(dt, Math.max(0, s.actionT + dt));
    e.x = clamp(x0 + Math.cos(s.angle) * step, BOSS.margin, WORLD.w - BOSS.margin);
    e.y = clamp(y0 + Math.sin(s.angle) * step, BOSS.margin, WORLD.h - BOSS.margin);
    if (!s.dashHit && bossLineContains({ x: x0 - Math.cos(s.angle) * e.r, y: y0 - Math.sin(s.angle) * e.r },
      s.angle, core.player, step + e.r * 2, (e.r + core.player.r) * 2)) {
      s.dashHit = true;
      hitPlayer(core, s, bossAttackDamage(e.dmg, "charge"), "physical");
    }
    if (core.bossState !== s || core.state !== "play") return true;
    if (s.action !== "dash") return false;
    if (s.actionT <= 1e-8 || e.x <= BOSS.margin || e.x >= WORLD.w - BOSS.margin || e.y <= BOSS.margin || e.y >= WORLD.h - BOSS.margin) {
      s.action = "stagger";
      s.actionT = BOSS.charge.stagger;
      impact(core, s, "charge", e, 55);
      core.addText(e.x, e.y - 24, "硬直 · 易伤", "#ffd24a");
      core.shake = Math.max(core.shake, 2);
    }
  } else if (s.action === "recover" || s.action === "stagger") {
    if (s.actionT <= 0) {
      s.action = "chase";
      s.actionT = BOSS.actionInterval * (s.phase === 3 ? BOSS.finalIntervalMul : 1);
      s.attack = null;
    }
  } else {
    const attack = s.actionT <= 0 ? chooseAttack(s, distance) : null;
    if (attack) startAttack(core, s, attack);
    else if (distance > e.r + core.player.r) {
      s.angle = Math.atan2(core.player.y - e.y, core.player.x - e.x);
      const slow = (1 - (e.slowT > 0 ? e.slowF : 0) * BOSS.slowEffectMul) *
        (1 - frostSlowFactor(e) * BOSS.slowEffectMul);
      const speed = e.speed * slow * (1 - (e.domainSlowF ?? 0)) * (s.phase === 3 ? BOSS.finalSpeedMul : 1) * (s.enraged ? BOSS.enrageSpeedMul : 1);
      e.x = clamp(e.x + Math.cos(s.angle) * speed * dt, BOSS.margin, WORLD.w - BOSS.margin);
      e.y = clamp(e.y + Math.sin(s.angle) * speed * dt, BOSS.margin, WORLD.h - BOSS.margin);
    }
  }
  if (core.prof === "mage" && dt > 0) {
    e.vx = (e.x - moveX) / dt;
    e.vy = (e.y - moveY) / dt;
  }
  return core.state !== "play";
}
