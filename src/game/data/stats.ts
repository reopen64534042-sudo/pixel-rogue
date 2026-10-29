import { MAGE_BALANCE } from "./mageBalance";
import type { Profession } from "../core/types";

/**
 * 职业基础形态（S3）。
 *
 * 以下字段按职业分叉，其余字段三职业共用：
 * - 射手：50 HP / 70 移速 / 13 攻击 / 130 索敌 / 2.2 发每秒；
 * - 法师：40 HP（v76 用户裁定） / 62 移速 / 11 攻击 / 150px 施法距离 / 1 / castCycle。
 *   法师的施法前摇与间隔都按「当前施法速度 ÷ 基础施法速度」同比缩放，
 *   因此属性「施法速度」对法师是从施法周期生效的。
 *
 * 为什么在这里分叉而不是在消费点硬编码：属性投影会用 `Object.assign`
 * 以本函数重建 Player，写在消费点会在每次 recompute 后失真；而职业在
 * `resetGame(prof)` 时就已确定，base 可以安全地按职业给出。
 */
export function statBase(prof: Profession = "shooter") {
  const mage = prof === "mage";
  return {
    // v76：法师基础生命 40（用户裁定）；护盾/回复按最大生命百分比结算，
    // 会随之下调。射手保持 50。
    maxhp: mage ? 40 : 50,
    speed: mage ? 62 : 70,
    projSpeed: 260,
    // S1：攻击射程从 AttackSystem 的硬编码 130 提为属性（base 130，数值不变）
    attackRange: mage ? MAGE_BALANCE.castRange : 130,
    damage: mage ? 11 : 13,
    boltDmgMul: 1,
    frostLv: 0,
    scorchVuln: 0,
    burnSpread: 0,
    meteorGuided: 0,
    burnGround: 0,
    bladeReflect: 0,
    // 法师：1 / 0.55s 施法周期 ≈ 1.82 次/秒（MageSystem 按此值缩放前摇与间隔）
    fireRate: mage ? 1 / MAGE_BALANCE.castCycle : 2.2,
    multishot: 1,
    pierce: 0,
    // S2：穿透衰减系数从 ProjectileSystem 的硬编码 0.85 提为属性。
    // **射手基础 0.5**（职业被动「第二目标 50%」）。这是 S2 的临时落点：
    // S2 只有射手一个职业，把基础值直接写成 0.5 最简单；S3 引入三职业后
    // 应改为 `applyTalentStatProjection` 的职业 base 参数，而不是改这里。
    pierceFalloff: 0.5,
    // S2：「距离即收益」开关与冲刺距离倍率；默认无效果
    distanceDmg: 0,
    dashDistMul: 1,
    area: 1,
    crit: 0.05,
    critMul: 2,
    ricochet: 0,
    slow: 0,
    burn: 0,
    chain: 0,
    meteor: 0,
    meteorT: 4,
    thorns: 0,
    lifesteal: 0,
    explode: 0,
    shieldMax: 0,
    shield: 0,
    shieldCd: 0,
    // #137：开局自带基础冲刺（docs/talent-pool-design-rules.md 前提共识：
    // 三职业共享基础动作 冲刺/受伤/拾取）。机动轴卡（充能/距离）在其上增强
    dashLv: 1,
    dashT: -1,
    dashMax: 2.4,
    dashCharges: 1,
    dashRe: 0,
    dashChargeLv: 0,
    dx: 1,
    dy: 0,
    hasteLv: 0,
    haste: 0,
    hasteT: 0,
    luck: 0,
    magnet: 36,
    regen: 0,
    orbit: 0,
    orbitDmg: 7,
    orbA: 0,
    hurtCd: 0,
    dodge: 0,
    tough: 0,
    rageLv: 0,
    rageT: 0,
    barrierLv: 0,
    tempShield: 0,
    nd: 0,
    ndUsed: false,
    explodeDmg: 0,
    chainDmg: 0,
  };
}
