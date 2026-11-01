import { BOSS } from "../data/boss";
import { BOSS_DAMAGE } from "../data/combatBalance";
import { ELITE_XP_STEP } from "../data/constants";
import type { DamageTypeId } from "../data/damageTypes";
import type { LaserLane } from "../data/laser";
import type { Enemy, Player, Point } from "./types";
import { LASER_DAMAGE as LD, MISSILE_DAMAGE as MD } from "../data/combatBalance";
import { COMBAT_BALANCE as CB } from "../data/combatBalance";
import { ENEMY_SKILL_DAMAGE } from "../data/combatBalance";
import { CONDITIONAL_DAMAGE as CD } from "../data/combatBalance";
import { WARRIOR_BALANCE } from "../data/warriorBalance";
import { LEGACY_DAMAGE as OLD } from "../data/combatBalance";
import { MAGE_BALANCE as MB } from "../data/mageBalance";
import { ELEMENTAL_MAGE, MAGE_ELEMENTS, type MageBeatKind, type MageElement } from "../data/elementalMage";
import {
  CURRENT_HP_DAMAGE_FRACTION, MAX_HP_DAMAGE_FRACTION, HP_DAMAGE_CAP_MUL, TRUE_DAMAGE_MUL,
  LASER_DAMAGE_MUL, MISSILE_DAMAGE_MUL, MISSILE_BURN_DPS_MUL, FISSION_DAMAGE_MUL,
  ENHANCED_NORMAL_DAMAGE_FRACTION, OVERLOAD_DAMAGE_MUL,
} from "../data/specialShot";

export const projectileTrailDamage = (damage: number) => damage * OLD.trail;
export const ricochetDamage = (damage: number) => damage * OLD.ricochet;
export const fissionDamage = (damage: number) => damage * FISSION_DAMAGE_MUL;
export const legacyChainDamage = (damage: number, bonus: number) => damage * (OLD.chain + bonus);
export const killExplosionDamage = (p: Pick<Player, "damage" | "explode" | "explodeDmg">) =>
  (p.damage * OLD.explodePerAttack + p.explode * OLD.explodePerLevel) * (1 + p.explodeDmg);
export const thornsDamage = (p: Pick<Player, "damage" | "thorns" | "upCounts">) =>
  p.thorns + ((p.upCounts["荆棘重铠"] || 0) > 0 ? p.damage * WARRIOR_BALANCE.counterChain.thornsMeleeMul : 0);
export const reflectedProjectileDamage = (damage: number, attack: number) =>
  damage + attack * WARRIOR_BALANCE.antiRanged.reflectMeleeMul;
export function orbitDamage(p: Pick<Player, "damage" | "orbitDmg">, warrior: boolean): number {
  return warrior ? p.damage * WARRIOR_BALANCE.antiRanged.dmgMul : p.orbitDmg + p.damage * OLD.orbitPerAttack;
}
export function projectileHitDamage(base: number, hp: number, maxhp: number,
  currentHp: boolean, maxHp: boolean, trueDamage: boolean): number {
  let damage = base;
  if (currentHp) damage += Math.min(hp * CURRENT_HP_DAMAGE_FRACTION, base * HP_DAMAGE_CAP_MUL);
  if (maxHp) damage += Math.min(maxhp * MAX_HP_DAMAGE_FRACTION, base * HP_DAMAGE_CAP_MUL);
  if (trueDamage) damage *= TRUE_DAMAGE_MUL;
  return damage;
}
export function projectilePierceDamage(damage: number, falloff: number, launch?: number, floor?: number): number {
  const reduced = damage * falloff;
  return floor && launch !== undefined ? Math.max(reduced, launch * floor) : reduced;
}
export const legacyLaserDamage = (damage: number, trueDamage: boolean) =>
  damage * LASER_DAMAGE_MUL * (trueDamage ? TRUE_DAMAGE_MUL : 1);
export const legacyMissileDamage = (damage: number) => damage * MISSILE_DAMAGE_MUL;
export const legacyMissileGroundDps = (damage: number) => damage * MISSILE_BURN_DPS_MUL;
export const shooterBaseDamage = (p: Pick<Player, "damage" | "boltDmgMul">, distance: number) => boltDamage(p) * distance;
export const shooterLaunchDamage = (damage: number, copy: number, volley: number) => damage * copy * volley;
export const mageRefractedBase = (base: number, share: number) => base * share;
export const enemyContactDamage = (attack: number, charging: boolean, aura: number) =>
  (charging ? attack * OLD.chargeContact : attack) * aura;
export const enemyAttackDamage = (attack: number, aura: number, multiplier = 1) => attack * multiplier * aura;
export const counterShotDamage = (p: Pick<Player, "damage" | "boltDmgMul">, multiplier: number) =>
  chargedShotDamage(boltDamage(p) * OLD.counterShot, multiplier);
export function shooterShotDamage(base: number, specialBase: number, special: boolean, enhanced: boolean, overloaded: boolean): number {
  let damage = special ? specialBase : base;
  if (enhanced) damage = base + specialBase * ENHANCED_NORMAL_DAMAGE_FRACTION;
  if (overloaded) damage *= OVERLOAD_DAMAGE_MUL;
  return damage;
}
export function shooterDistanceBonus(ratio: number): { damage: number; crit: number; pierce: number } {
  if (ratio >= 0.92) return { damage: 1.25, crit: 0.1, pierce: 1 };
  return { damage: ratio >= 0.75 ? 1.15 : ratio >= 0.5 ? 1.05 : 1, crit: 0, pierce: 0 };
}

export const mageElementDamageBase = (attack: number) => attack * MB.elementBaseMul;
export const mageDirectHitDamage = (base: number, upgrade: number, element: MageElement, fraction = 1) =>
  base * MB.directDamageMul * upgrade * MAGE_ELEMENTS[element].damageMul * fraction;
export function mageReactionRawDamage(base: number, multiplier: number, state: number, upgrades: number,
  pairedBonus: number | undefined, cardMul = 1): number {
  let amount = base * multiplier * state * upgrades;
  if (pairedBonus !== undefined) amount *= pairedBonus;
  return amount * cardMul;
}
export const mageChainDamage = (base: number, mul = 1) => base * ELEMENTAL_MAGE.chain.damageMul * mul;
export const mageBurnDamage = (base: number, layers: number) => layers * ELEMENTAL_MAGE.burn.damagePerLayer * base;
/** 元素大法师 4 拍伤害倍率：副 0.8 / 主基础 1.3 / 主强 1.6；未觉醒返回 1。 */
export const mageBeatDamageMul = (kind: MageBeatKind | null): number =>
  kind === "sub"
    ? ELEMENTAL_MAGE.grandmaster.subDamageMul
    : kind === "main"
      ? ELEMENTAL_MAGE.grandmaster.mainDamageMul
      : kind === "mainStrong"
        ? ELEMENTAL_MAGE.grandmaster.mainStrongDamageMul
        : 1;

export const warriorWaveDamage = (attack: number, kind: "qi" | "fissure") =>
  attack * WARRIOR_BALANCE.energyWaves[kind].dmgMul;
export const warriorWaveHitDamage = (damage: number, fissure: boolean, armorBroken: boolean) =>
  damage * (fissure && armorBroken ? 1 + WARRIOR_BALANCE.energyWaves.fissure.armorBonus : 1);
export const warriorLeapDamage = (attack: number, tri: boolean) =>
  attack * (tri ? WARRIOR_BALANCE.triDash.leapDmgMul : WARRIOR_BALANCE.leapDamageMul);
export const warriorTriDamage = (attack: number, stage: number, spin: boolean) =>
  attack * (stage === 0 ? WARRIOR_BALANCE.triDash.dmgMul1
    : spin ? WARRIOR_BALANCE.triDash.dmgMul3 : WARRIOR_BALANCE.triDash.dmgMul2);
export const warriorDashDamage = (attack: number) => attack * WARRIOR_BALANCE.dashDamageMul;
export const warriorEchoDamage = (damage: number) => damage * WARRIOR_BALANCE.resolveEchoMul;
export const warriorFlowDamageMultiplier = (stacks: number, owned: boolean) =>
  owned ? 1 + WARRIOR_BALANCE.flow.dmgPerStack * stacks : 1;
export function warriorResolvedDamage(base: number, heavy: boolean, breakout: boolean,
  iaiCap: number | null, flow: number, consume: boolean): number {
  return base * (heavy ? WARRIOR_BALANCE.heavyDamageMul : 1) * (breakout ? WARRIOR_BALANCE.breakoutDamageMul : 1)
    * (iaiCap === null ? 1 : 1 + WARRIOR_BALANCE.iai.perStack * iaiCap) * flow
    * (consume ? 1 + WARRIOR_BALANCE.flow.iaiConsumeBonus : 1);
}

export function bloodDebtDamage(damage: number, stacks: number): number {
  return damage * (1 + WARRIOR_BALANCE.counterChain.bloodDebtPerStack * stacks);
}

export const markedShotDamage = (damage: number, stacks: number) =>
  damage * (1 + CD.specialMarkPerStack * stacks);
export const armorBreakBurstDamage = (damage: number) => damage * CD.armorBreakBurstMul;
export const gambleIncomingDamage = (damage: number) => damage * CD.gambleIncoming;

/** 离散命中按主/真实分组取整，连续命中不取整；保持旧乘法分组与保底规则。 */
export function enemyHitTakenDamage(
  damage: number,
  trueDamage: number,
  enemyMultiplier: number,
  bossMultiplier: number,
  continuous: boolean,
): { settledDamage: number; trueDamage: number } {
  const multiplier = enemyMultiplier * bossMultiplier;
  if (multiplier === 1) return { settledDamage: damage, trueDamage };
  const mainPart = trueDamage > 0 ? Math.max(0, damage - trueDamage) : damage;
  const taken = (value: number) => value <= 0 ? 0 : continuous
    ? value * multiplier
    : Math.max(1, Math.round(value * multiplier));
  const main = taken(mainPart);
  const extra = taken(trueDamage);
  return { settledDamage: main + extra, trueDamage: extra };
}

/** 旧 DoT 使用左结合浮点乘法，不能折叠为预乘倍率而改变浮点结果。 */
export function enemyDotTakenDamage(damage: number, enemyMultiplier: number, bossMultiplier: number): number {
  return damage * enemyMultiplier * bossMultiplier;
}

export function enemySkillDamage(attack: number, skill: keyof typeof ENEMY_SKILL_DAMAGE, aura = 1, seconds = 1): number {
  return attack * ENEMY_SKILL_DAMAGE[skill] * aura * seconds;
}

/** Directional guard affects direct non-true damage; DoT has no incoming direction. */
export function enemyGuardMultiplier(e: Enemy, origin: Readonly<Point>, type: DamageTypeId, kind: "hit" | "dot"): number {
  const g = e.guard;
  if (!g || g.downT > 0 || type === "true" || kind === "dot") return 1;
  const dx = origin.x - e.x, dy = origin.y - e.y;
  if (dx * dx + dy * dy < 1e-8) return 1;
  const angle = Math.atan2(dy, dx);
  const delta = Math.atan2(Math.sin(angle - g.angle), Math.cos(angle - g.angle));
  return Math.abs(delta) <= g.arc / 2 ? g.mul : 1;
}
import { DOMAIN_DAMAGE as DD } from "../data/combatBalance";
import { DOMAIN, domainHas, domainUpgrade, type DomainSnapshot } from "../data/domain";

/**
 * DamageMath —— 技能/派生 raw 伤害与最终承伤精度的纯函数计算层。
 *
 * 对齐 docs/pixel-rogue-combat-foundation-v1.md 设计原则 5：
 * - 纯函数：不引用 GameCore / Phaser / DOM，不产生随机数，不修改 HP（副作用归 CombatSystem 编排）。
 * - 公共系数来自 combatBalance；既有职业配置保留其参数所有权，不复制第二套数值。
 * - DamageSystem 负责四乘区/暴击/属性防御，本层形成 raw 和明确的最终精度政策；
 *   系统层只编排目标、时序、状态与触发权限。
 * - 天赋卡 pv/cur 与本文件共享公式，避免展示与结算漂移。
 *
 * 由 Issue #38-#45 平衡批次引入（用户已批准）。
 */

/** 魔弹：基础伤害 × 魔弹特化倍率（Issue #25；规范 §3.1 保留现有嵌入） */
export function boltDamage(p: Pick<Player, "damage" | "boltDmgMul">) {
  return p.damage * p.boltDmgMul;
}

/** 射手强化弹：基础魔弹伤害 × 当前等级倍率 */
export function chargedShotDamage(base: number, mul: number) {
  return base * mul;
}

/** 暴击倍率：含致命一击满层觉醒（Issue #41） */
export function critMultiplier(p: Pick<Player, "critMul" | "upCounts">) {
  return (
    p.critMul +
    ((p.upCounts["致命一击"] || 0) >= CB.critMaxLevel
      ? CB.critAwakeningCritMulBonus
      : 0)
  );
}

/** 陨星单发伤害（Issue #45 重做：×3 基础系数） */
export function meteorDamage(p: Pick<Player, "damage" | "meteor">) {
  return p.damage * CB.meteorBase + p.meteor * CB.meteorPerLevel;
}

/** 护盾破碎反震（Issue #43）；碎盾反震传入自己的 250% 系数。 */
export function shieldShockDamage(
  p: Pick<Player, "damage">,
  mul = CB.shieldShock,
) {
  return p.damage * mul;
}

/** 灼烧：每层 DPS = 全局伤害 × 10%（Issue #42 叠层制） */
export function burnStackDps(p: Pick<Player, "damage">, stacks: number) {
  return stacks * p.damage * CB.burnDpsPerStack;
}

/** 灼热易伤：灼烧目标受伤倍率（Issue #42，用户授权的规范扩展） */
export function scorchVulnMultiplier(p: Pick<Player, "scorchVuln">) {
  return 1 + p.scorchVuln;
}

/** 焦土燃烧：燃烧地带每秒伤害（Issue #45） */
export function burnGroundDps(p: Pick<Player, "damage">) {
  return p.damage * CB.burnGroundDps;
}

/** 冰冻时长：0.4 + 0.2 × 冰霜等级（Issue #38 重做） */
export function frostFreezeDuration(p: Pick<Player, "frostLv">) {
  return CB.frostFreezeBase + CB.frostFreezePerLevel * p.frostLv;
}

/** 多弹道动态散布：near = 目标检测半径内敌人数（Issue #36） */
export function multishotSpread(near: number) {
  return (
    CB.spreadMin +
    (CB.spreadMax - CB.spreadMin) *
      Math.min(1, (near - 1) / CB.spreadRampTargets)
  );
}

/** 激光输出速率：战斗与属性面板共用，临时狂热 / 战意在这里计入。 */
export function laserOutputRate(p: Pick<Player, "fireRate" | "haste" | "rageT" | "rageLv">) {
  return p.fireRate * (1 + p.haste * 0.1 + (p.rageT > 0 ? 0.2 * p.rageLv : 0));
}

/** 激光攻速只缩放 DPS；不缩放结算/暴击/命中特效的时间窗。 */
export function laserDps(p: Pick<Player, "damage" | "boltDmgMul" | "fireRate" | "haste" | "rageT" | "rageLv">, level: number) {
  const rate = laserOutputRate(p);
  return boltDamage(p) * rate * LD.dpsPerAttack * (1 + (level - 1) * LD.dpsPerLevel);
}

export function laserFocusMultiplier(focus: number) {
  return 1 + Math.max(0, Math.min(1, focus)) * LD.focusBonus;
}

export function laserPierceRetention(lens: boolean, polar: boolean) {
  return Math.min(LD.maxPierce, (lens ? LD.lensPierce : LD.pierce) + (polar ? LD.polarBonus : 0));
}

export function laserPierceMultiplier(retention: number, targetIndex: number) {
  return retention ** Math.max(0, targetIndex);
}

export function laserExposureDamage(dps: number, seconds: number, falloff = 1, focus = 1) {
  return dps * seconds * falloff * focus;
}

export function laserLaneDamage(damage: number, lane: LaserLane) {
  return lane === 0 ? damage : damage * LD.tripleSideMul;
}

export function laserAuxDps(dps: number, kind: "afterglow" | "echo") {
  return dps * (kind === "afterglow" ? LD.afterglowDps : LD.echoDps);
}

export function laserPulseDamage(p: Pick<Player, "damage" | "boltDmgMul">, meltdown: boolean, collapse: boolean) {
  return boltDamage(p) * ((meltdown ? LD.meltdown : 0) + (collapse ? LD.collapse : 0));
}

export function laserEscapeDamage(p: Pick<Player, "damage" | "boltDmgMul">) {
  return boltDamage(p) * LD.escape;
}

export function laserIncomingDamage(damage: number) {
  return damage * LD.rechargeDefense;
}

export function missileBaseDamage(p: Pick<Player, "damage" | "boltDmgMul">, level: number, liner: boolean) {
  return boltDamage(p) * MD.base * (1 + (level - 1) * MD.perLevel) * (liner ? MD.liner : 1);
}
export function missileBlastDamage(base: number, fraction: number, distance: number, radius: number,
  pressure: boolean, beacon: boolean, direct = false) {
  const falloff = direct ? 1 : 1 - MD.edgeLoss * Math.max(0, Math.min(1, distance / radius));
  return base * fraction * (pressure ? MD.pressure : 1) * (beacon ? MD.beacon : 1) * falloff;
}
export const missileDecodeDamage = (base: number) => base * MD.decode;
export const missileArcDamage = (base: number, relay: boolean) => base * MD.arc * (relay ? MD.relay : 1);
export const missileResonanceDamage = (base: number) => base * MD.resonance;
export const missileBurnDps = (base: number) => base * MD.burn;
export const missileDotAmount = (dps: number, seconds: number) => dps * seconds;
export const missileHealing = (loss: number, lifesteal: number) => loss * lifesteal * MD.lifesteal;
export const missileIncomingDamage = (damage: number) => damage * MD.armor;

/**
 * 第二元素的进攻增伤倍率。
 *
 * 反应伤害仍以触发元素走统一受击管线（抗性/克制方向由触发元素决定）；
 * 该倍率把配对的另一元素的 typeDamageBonus 也计入，避免“双元素反应只吃
 * 单一元素加成”。globalDamageBonus 仍由 hurtEnemy 只乘一次。
 */
export function typeBonusMultiplier(
  bonus: Partial<Record<DamageTypeId, number>> | undefined,
  type: DamageTypeId,
): number {
  return 1 + (bonus?.[type] ?? 0);
}
/** All overlapping grounds have the same defender/fire mitigation; compare offensive power only. */
export function missileGroundPower(dps: number, stats: import("./types").CombatStatsSnapshot) {
  const fire = Object.hasOwn(stats.typeDamageBonus, "fire") ? stats.typeDamageBonus.fire ?? 0 : 0;
  const ranged = Object.hasOwn(stats.formDamageBonus, "ranged") ? stats.formDamageBonus.ranged ?? 0 : 0;
  return dps * (1 + stats.globalDamageBonus) * (1 + fire) * (1 + ranged);
}

/** Boss 技能只在纯计算层形成 rawAmount；调用方仍走统一受击管线。 */
export function bossAttackDamage(attack: number, move: keyof typeof BOSS_DAMAGE): number {
  return attack * BOSS_DAMAGE[move];
}
export function bossRewardXp(wave: number, xpMul: number): number {
  return Math.round((25 + (wave - 1) * ELITE_XP_STEP) * BOSS.reward.xpMul * xpMul);
}

/** 地面伤害按固定 tick 积分；冰面首版只减速。 */
export function bossGroundTickDamage(attack: number, kind: "fire" | "frost"): number {
  return bossAttackDamage(attack, kind === "fire" ? "fireGround" : "frostGround") * BOSS.hazard.tick;
}

export const domainProjectionMultiplier=(s:DomainSnapshot)=>domainUpgrade(s,'projection')?DD.projection:1;
export function domainBlackHoleMultiplier(s:DomainSnapshot,captured:number,boss=false) {
  return (domainHas(s,'引力核心') ? 1+Math.min(DD.coreCap,DD.coreBase+DD.corePerTarget*captured) : 1)
    * domainProjectionMultiplier(s)
    * (boss && domainHas(s,'绝对引力') ? DD.boss : 1);
}
export function domainWeaponMultiplier(level:number) {
  const levels=Math.max(0,Math.min(DOMAIN.maxLevel,level)-1);
  const earlyPenalty=DD.earlyPowerPenalty*Math.max(0,1-levels/(DD.earlyPowerRecoveryLevel-1));
  return 1+levels*DD.levelGain-earlyPenalty;
}
export const domainStasisMultiplier=(s:DomainSnapshot,stunned:boolean)=>stunned && domainHas(s,'静滞增幅')?DD.stasisEnhance:1;
export function domainFieldDamage(s:DomainSnapshot,stunned=false) {
  return s.damage*s.power*s.M*(DD.field+(domainUpgrade(s,'void')?DD.information:0))*domainProjectionMultiplier(s)*domainStasisMultiplier(s,stunned);
}
export function domainDamage(s:DomainSnapshot,kind:'birth'|'true'|'holeTick'|'fieldSlash'|'holeSlash'|'terminal',boss=false,stunned=false) {
  const bonus=kind==='fieldSlash'?domainProjectionMultiplier(s):s.B*(boss && domainHas(s,'绝对引力')?DD.boss:1);
  const slash=(kind==='fieldSlash'||kind==='holeSlash') && domainHas(s,'裂界增幅')?DD.slashEnhance:1;
  const coefficient=kind==='fieldSlash'?DD.fieldSlashDps*DOMAIN.fieldSlash
    :kind==='holeSlash'?DD.holeSlashDps*DOMAIN.holeSlash:DD[kind];
  return s.damage*s.power*s.M*coefficient*bonus*(kind==='birth'?s.F:1)*slash*domainStasisMultiplier(s,stunned);
}
/** HP ratio stays 4%; the attack-based ceiling grows with weapon power. */
export const domainCurrentHpDamage=(s:DomainSnapshot,hp:number)=>Math.min(hp*DD.currentHp,s.damage*s.power*DD.currentHpCap)*s.M;
export const domainOverlapDamage=(first:number,second:number,confluence=false)=>first+second*(confluence?DD.confluenceOverlap:DD.overlap);
export const domainEmberDamage=(damage:number)=>damage*DD.ember;
export function domainTickDamage(s:DomainSnapshot,seconds:number,boss=false,remnant=false,stunned=false) {
  const raw=domainDamage(s,'holeTick',boss,stunned)*seconds/DOMAIN.holeTick;
  return remnant?domainEmberDamage(raw):raw;
}
export function domainFieldPower(s:DomainSnapshot,stunned=false) {
  return domainAttackPower(s,domainFieldDamage(s,stunned));
}
export function domainAttackPower(s:DomainSnapshot,raw:number) {
  return raw*(1+s.attacker.globalDamageBonus)*(1+(s.attacker.typeDamageBonus.gravity??0))
    *(1+(s.attacker.formDamageBonus.other??0));
}
export const domainPrimaryHealing=(loss:number,lifesteal:number,maxhp:number)=>Math.min(loss*lifesteal*DD.lifesteal,maxhp*DD.lifestealCap);
export const domainSiphonHealing=(s:DomainSnapshot,count:number,maxhp:number)=>Math.min(DD.healingCap,DD.siphonBase+DD.siphonTarget*count)*s.M*maxhp;
export const domainHealingCap=(maxhp:number)=>maxhp*DD.healingCap;
