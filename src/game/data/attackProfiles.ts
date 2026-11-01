import type { AttackProfile, BossAttackId, EnemyActionKind } from "../core/types";

/** 保留 v172 的分类；新增行动必须同时声明伤害属性、攻击形式和技能键。 */
export const ENEMY_ATTACK_PROFILES = {
  lob: { type: "fire", form: "ranged", skillId: "enemy:lob" },
  thrust: { type: "physical", form: "melee", skillId: "enemy:thrust" },
  tether: { type: "lightning", form: "ranged", skillId: "enemy:tether" },
  stomp: { type: "physical", form: "melee", skillId: "enemy:stomp" },
  gaze: { type: "lightning", form: "ranged", skillId: "enemy:gaze" },
  collapse: { type: "lightning", form: "ranged", skillId: "enemy:collapse" },
  sonic: { type: "physical", form: "melee", skillId: "enemy:sonic" },
} as const satisfies Record<Exclude<EnemyActionKind, "blink">, AttackProfile>;

/** 元素范围技继续为 other；物理招式继续为 melee，分类不再根据 type 推断。 */
export const BOSS_ATTACK_PROFILES = {
  stomp: { type: "physical", form: "melee", skillId: "boss:stomp" },
  charge: { type: "physical", form: "melee", skillId: "boss:charge" },
  breath: { type: "fire", form: "other", skillId: "boss:breath" },
  nova: { type: "frost", form: "other", skillId: "boss:nova" },
  spikes: { type: "frost", form: "other", skillId: "boss:spikes" },
  marks: { type: "lightning", form: "other", skillId: "boss:marks" },
  chain: { type: "lightning", form: "other", skillId: "boss:chain" },
} as const satisfies Record<BossAttackId, AttackProfile>;

/** 所有现有玩家伤害路径；技能身份与统计 src、伤害属性分别声明。 */
export const PLAYER_ATTACK_PROFILES = {
  bullet: { type: "physical", form: "ranged", skillId: "charged:bullet" },
  chargedBullet: { type: "physical", form: "ranged", skillId: "charged:special" },
  fission: { type: "physical", form: "ranged", skillId: "charged:fission" },
  counterShot: { type: "physical", form: "ranged", skillId: "charged:counter" },
  trail: { type: "physical", form: "ranged", skillId: "charged:trail" },
  reflect: { type: "physical", form: "ranged", skillId: "common:reflect" },
  orbit: { type: "physical", form: "other", skillId: "common:orbit" },
  warriorOrbit: { type: "physical", form: "melee", skillId: "warrior:orbit" },
  meteor: { type: "fire", form: "other", skillId: "common:meteor" },
  legacyLaser: { type: "physical", form: "other", skillId: "charged:legacyLaser" },
  legacyMissile: { type: "physical", form: "other", skillId: "charged:legacyMissile" },
  laserMain: { type: "physical", form: "ranged", skillId: "laser:main" },
  laserAux: { type: "physical", form: "ranged", skillId: "laser:auxiliary" },
  laserPulse: { type: "physical", form: "ranged", skillId: "laser:pulse" },
  laserScatter: { type: "physical", form: "ranged", skillId: "laser:scatter" },
  missileMain: { type: "physical", form: "ranged", skillId: "missile:main" },
  missileSwarm: { type: "physical", form: "ranged", skillId: "missile:swarm" },
  missileArc: { type: "lightning", form: "ranged", skillId: "missile:arc" },
  missileDecode: { type: "true", form: "ranged", skillId: "missile:decode" },
  missileResonance: { type: "lightning", form: "ranged", skillId: "missile:resonance" },
  missileBurn: { type: "fire", form: "ranged", skillId: "missile:burn" },
  mageBody: { type: "fire", form: "other", skillId: "mage:body" },
  mageRefract: { type: "fire", form: "other", skillId: "mage:refract" },
  mageChain: { type: "lightning", form: "other", skillId: "mage:chain" },
  mageReaction: { type: "fire", form: "other", skillId: "mage:reaction" },
  mageBurn: { type: "fire", form: "other", skillId: "mage:burn" },
  katanaSwing: { type: "physical", form: "melee", skillId: "katana:swing" },
  greatswordSwing: { type: "physical", form: "melee", skillId: "greatsword:swing" },
  warriorIai: { type: "physical", form: "melee", skillId: "warrior:iai" },
  warriorTri: { type: "physical", form: "melee", skillId: "warrior:tri" },
  warriorLeap: { type: "physical", form: "melee", skillId: "warrior:leap" },
  warriorEcho: { type: "physical", form: "melee", skillId: "warrior:echo" },
  warriorDash: { type: "physical", form: "melee", skillId: "warrior:dash" },
  qi: { type: "physical", form: "melee", skillId: "warrior:qi" },
  fissure: { type: "physical", form: "melee", skillId: "warrior:fissure" },
  domainField: { type: "gravity", form: "other", skillId: "domain:field" },
  domainHole: { type: "gravity", form: "other", skillId: "domain:hole" },
  domainFieldSlash: { type: "gravity", form: "other", skillId: "domain:fieldSlash" },
  domainHoleSlash: { type: "gravity", form: "other", skillId: "domain:holeSlash" },
  domainTerminal: { type: "gravity", form: "other", skillId: "domain:terminal" },
  domainBirth: { type: "gravity", form: "other", skillId: "domain:birth" },
  domainTrue: { type: "true", form: "other", skillId: "domain:true" },
  domainCompression: { type: "gravity", form: "other", skillId: "domain:compression" },
  chain: { type: "lightning", form: "other", skillId: "common:chain" },
  burn: { type: "fire", form: "other", skillId: "common:burn" },
  ground: { type: "fire", form: "other", skillId: "common:ground" },
  explode: { type: "fire", form: "other", skillId: "common:explode" },
  shock: { type: "physical", form: "melee", skillId: "warrior:shieldShock" },
  thorns: { type: "physical", form: "other", skillId: "warrior:thorns" },
} as const satisfies Record<string, AttackProfile>;

export const HOSTILE_ATTACK_PROFILES = {
  projectile: { type: "physical", form: "ranged", skillId: "enemy:projectile" },
  contact: { type: "physical", form: "melee", skillId: "enemy:contact" },
  chargeContact: { type: "physical", form: "melee", skillId: "enemy:chargeContact" },
  bomber: { type: "fire", form: "other", skillId: "enemy:bomber" },
  eliteNova: { type: "frost", form: "other", skillId: "enemy:eliteNova" },
  groundFire: { type: "fire", form: "other", skillId: "enemy:ground:fire" },
  groundFrost: { type: "frost", form: "other", skillId: "enemy:ground:frost" },
  groundLightning: { type: "lightning", form: "other", skillId: "enemy:ground:lightning" },
} as const satisfies Record<string, AttackProfile>;

/** 元素轮盘/离子弹头/真伤升级只改变明确的 type，不推断 form 或技能身份。 */
export function withDamageType<P extends Readonly<AttackProfile>, T extends AttackProfile["type"]>(
  profile: P,
  type: T,
): Omit<P, "type"> & { readonly type: T } {
  return { ...profile, type };
}
