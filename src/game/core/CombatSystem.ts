import type { GameCore } from "./GameCore";
import {
  BOX_DROP_CAP,
  BOX_DROP_RATE,
  ELITE_XP_STEP,
  hash01,
} from "../data/constants";
import { DAMAGE_TYPES } from "../data/damageTypes";
import { calculateDamage } from "./DamageSystem";
import type {
  CombatStatsSnapshot,
  DamageResult,
  Enemy,
  HitOptions,
  Player,
  PlayerHitOptions,
} from "./types";
import { hasteCap } from "../data/talents";

/**
 * Combat Foundation S2 只读适配器（§4）：实体 → CombatStatsSnapshot。
 * 快照不是另一个可变实体对象，每次结算按需构造；S2 增伤/护甲/抗性全为 0，
 * 数值上与旧直算路径逐位一致，S3 才引入非零来源。
 */
function playerCombatStats(p: Player): CombatStatsSnapshot {
  return {
    attack: p.damage,
    defense: 0,
    critChance: p.crit,
    critMultiplier: p.critMul,
    tough: p.tough,
    resistances: {},
    globalDamageBonus: 0,
    typeDamageBonus: {},
    formDamageBonus: {},
  };
}

/**
 * 敌人快照：S2 全为默认零值。导出供 EnemySystem 在敌人发射弹丸时做
 * 发射时快照（发射者可能在命中前死亡/移除，不依赖存活的敌人引用）。
 */
export function enemyCombatStats(e?: Enemy): CombatStatsSnapshot {
  return {
    attack: e ? e.dmg : 0,
    defense: 0,
    critChance: 0,
    critMultiplier: 1,
    tough: 0,
    resistances: {},
    globalDamageBonus: 0,
    typeDamageBonus: {},
    formDamageBonus: {},
  };
}

/** §3.5：被闪避/护盾完全抵挡的命中——未进入数值计算，结算与实际损失均为 0 */
function blockedHit(
  raw: number,
  blocked: { dodged: boolean; shieldUsed: DamageResult["shieldUsed"] },
): DamageResult {
  return {
    rawDamage: raw,
    beforeMitigation: 0,
    settledDamage: 0,
    isCritical: false,
    effectiveHpLoss: 0,
    lethal: false,
    killed: false,
    preventedDeath: false,
    ...blocked,
  };
}

export function hurtEnemy(
  this: GameCore,
  e: Enemy,
  dmg: number,
  kx = 0,
  ky = 0,
  opts: HitOptions = {},
): DamageResult | undefined {
  if (e.dead || this.state !== "play") return undefined;
  // §3.4 步骤 3：暴击判定留在编排层，掷骰条件与次数与旧路径一致
  let crit = false;
  if (!opts.noCrit && Math.random() < this.player.crit) {
    crit = true;
  }
  // §3.4 步骤 4：数值交给 DamageSystem。敌方离散命中用 round-min-one，
  // 与旧 Math.max(1, Math.round(dmg × 暴击倍率)) 逐位一致
  const calc = calculateDamage(DAMAGE_TYPES, {
    rawAmount: dmg,
    type: opts.type ?? "physical",
    form: opts.form ?? "other",
    origin: opts.src ?? "hit",
    kind: "hit",
    precision: "round-min-one",
    isCritical: crit,
    attackerStats: playerCombatStats(this.player),
    defenderStats: enemyCombatStats(e),
  });
  dmg = calc.settledDamage;
  const hpBefore = e.hp;
  e.hp -= dmg;
  e.flash = 0.08;
  if (opts.src) this.dmgBy[opts.src] = (this.dmgBy[opts.src] || 0) + dmg;
  if (this.player.lifesteal)
    this.player.hp = Math.min(
      this.player.maxhp,
      this.player.hp + dmg * this.player.lifesteal,
    );
  this.addText(e.x, e.y - e.r - 2, dmg, crit ? "#ffd24a" : "#ffffff", crit);
  if (kx || ky) {
    e.x += kx;
    e.y += ky;
  }
  if (this.player.slow) {
    e.slowT = 1.2;
    e.slowF = this.player.slow;
  }
  if (this.player.burn) {
    e.burnT = 2;
    e.burnDps = this.player.damage * 0.3 * this.player.burn;
  }
  if (this.player.chain > 0 && this.chainCd <= 0 && !opts.noChain) {
    this.chainCd = 0.6;
    const near = this.enemies
      .filter(
        (o) => o !== e && !o.dead && Math.hypot(o.x - e.x, o.y - e.y) < 90,
      )
      .slice(0, this.player.chain);
    let px = e.x,
      py = e.y;
    for (const o of near) {
      this.bolts.push({ x1: px, y1: py, x2: o.x, y2: o.y, life: 0.15 });
      px = o.x;
      py = o.y;
      this.hurtEnemy(o, dmg * (0.7 + this.player.chainDmg), 0, 0, {
        noChain: true,
        noCrit: true,
        src: "chain",
        type: "lightning",
        form: "other",
      });
    }
    if (near.length) this.audio.beep(1200, 0.08, "sawtooth", 0.04, -600);
  }
  this.audio.beep(200 + Math.random() * 80, 0.04, "square", 0.025, -80);
  if (e.hp <= 0) this.killEnemy(e, opts.fromExplode);
  // §3.5：结算伤害与实际生命损失分开，溢出部分不计入 effectiveHpLoss；
  // 击杀爆炸/掉落等副作用已在上方按原顺序执行，killed 与 lethal 同真
  return {
    ...calc,
    effectiveHpLoss: Math.min(hpBefore, dmg),
    dodged: false,
    shieldUsed: "none",
    lethal: e.hp <= 0,
    killed: e.hp <= 0,
    preventedDeath: false,
  };
}

export function killEnemy(this: GameCore, e: Enemy, fromExplode?: boolean) {
  if (e.dead) return;
  e.dead = true;
  this.kills++;
  const p = this.player;
  // 击杀狂热
  if (p.hasteLv) {
    p.haste = Math.min(hasteCap(p.hasteLv), p.haste + 1);
    p.hasteT = 2 + p.hasteLv;
  }
  // 掉落 (自爆虫自毁不掉落)
  if (!e.noDrop) {
    if (e.elite) {
      // #17：精英经验随波次成长，避免后期相对升级阈值贬值
      const eliteXp = 25 + (this.waveN - 1) * ELITE_XP_STEP;
      this.gems.push({ x: e.x, y: e.y, vx: 0, vy: 0, v: eliteXp, e: true });
      this.potions.push({ x: e.x + 8, y: e.y });
      this.shake = Math.min(this.shake + 5, 8);
      // #17：精英必掉宝箱，且不占用普通怪名额
      // Issue #48：BOSS 掉落特殊宝箱（不计入普通怪 BOX_DROP_CAP）
      this.boxes.push({ x: e.x - 8, y: e.y, special: true });
    } else {
      const v = e.xp * (Math.random() < p.luck * 0.07 ? 2 : 1);
      this.gems.push({
        x: e.x,
        y: e.y,
        vx: (Math.random() - 0.5) * 30,
        vy: (Math.random() - 0.5) * 30,
        v,
      });
      if (Math.random() < 0.02 + p.luck * 0.01)
        this.potions.push({ x: e.x, y: e.y });
      // #15：普通怪按确定性伪随机掉宝箱，每波上限 BOX_DROP_CAP。
      // 这里必须用 hash01 而不是 Math.random —— 后者会推进随机序列，
      // 让 parity 的确定性模拟在后续所有随机点分叉。
      if (
        this.boxDropsThisWave < BOX_DROP_CAP &&
        hash01(e.seed, this.waveN) < BOX_DROP_RATE
      ) {
        this.boxDropsThisWave++;
        this.boxes.push({ x: e.x, y: e.y });
      }
    }
  }
  // 击杀爆炸
  if (p.explode && !fromExplode) {
    const R = (26 + p.explode * 6) * p.area;
    for (const o of this.enemies) {
      if (o === e || o.dead) continue;
      const dx = o.x - e.x,
        dy = o.y - e.y;
      if (dx * dx + dy * dy < R * R)
        this.hurtEnemy(
          o,
          (p.damage * 0.5 + p.explode * 2) * (1 + p.explodeDmg),
          0,
          0,
          {
            noChain: true,
            noCrit: true,
            fromExplode: true,
            src: "explode",
            type: "fire",
            form: "other",
          },
        );
    }
    for (let i = 0; i < 10; i++) {
      const a = Math.random() * Math.PI * 2;
      this.parts.push({
        x: e.x,
        y: e.y,
        vx: Math.cos(a) * 120,
        vy: Math.sin(a) * 120,
        life: 0.35,
        c: "#ff9a3d",
      });
    }
  }
  for (let i = 0; i < (e.elite ? 20 : 7); i++) {
    this.parts.push({
      x: e.x,
      y: e.y,
      vx: (Math.random() - 0.5) * 90,
      vy: (Math.random() - 0.5) * 90,
      life: 0.4 + Math.random() * 0.3,
      c: e.elite ? "#ffe14a" : "#4dd44d",
    });
  }
  this.audio.beep(
    e.elite ? 120 : 160,
    e.elite ? 0.3 : 0.08,
    "sawtooth",
    0.04,
    -100,
  );
}

export function addText(
  this: GameCore,
  x: number,
  y: number,
  s: string | number,
  c: string,
  big = false,
) {
  this.texts.push({ x, y, s: String(s), c, life: 0.7, vy: -22, big: !!big });
}

export function damagePlayer(
  this: GameCore,
  dmg: number,
  opts: PlayerHitOptions = {},
): DamageResult {
  const p = this.player;
  // 闪避本能: 完全无效化
  if (p.dodge > 0 && Math.random() < p.dodge) {
    this.addText(p.x, p.y - 10, "闪避!", "#4dff88");
    this.audio.beep(700, 0.06, "sine", 0.04, 200);
    return blockedHit(dmg, { dodged: true, shieldUsed: "none" });
  }
  // 壁垒: 临时护盾优先消耗
  if (p.tempShield > 0) {
    p.tempShield--;
    this.addText(p.x, p.y - 10, "壁垒抵挡!", "#ff9a3d");
    this.audio.beep(980, 0.12, "sine", 0.06, -200);
    return blockedHit(dmg, { dodged: false, shieldUsed: "temporary" });
  }
  if (p.shield > 0) {
    p.shield--;
    p.shieldCd = 10;
    p.hurtCd = 0.5;
    this.addText(p.x, p.y - 10, "护盾抵挡!", "#57e6ff");
    this.audio.beep(980, 0.12, "sine", 0.06, -200);
    return blockedHit(dmg, { dodged: false, shieldUsed: "normal" });
  }
  // §3.4 步骤 4：玩家受击固定 preserve-float（§3.3 浮点扣血，UI 取整仅显示）；
  // tough 经通用减伤乘区生效，S2 其余乘区全为 1。
  // 攻击者上下文优先用发射时快照（弹丸），其次接触敌人（opts.src）
  const calc = calculateDamage(DAMAGE_TYPES, {
    rawAmount: dmg,
    type: opts.type ?? "physical",
    form: opts.form ?? "other",
    origin: opts.src ? "contact" : "enemy",
    kind: "hit",
    precision: "preserve-float",
    isCritical: false,
    attackerStats: opts.attackerStats ?? enemyCombatStats(opts.src),
    defenderStats: playerCombatStats(p),
  });
  dmg = calc.settledDamage;
  const hpBefore = p.hp;
  p.hurtCd = 0.6;
  p.hp -= dmg;
  // 不屈会在下方把 HP 拉回 1，致死阈值必须先于该重置捕获（§3.5：lethal 与死亡结算解耦）
  const lethal = p.hp <= 0;
  const applied = (killed: boolean, preventedDeath = false): DamageResult => ({
    ...calc,
    effectiveHpLoss: Math.min(hpBefore, dmg),
    dodged: false,
    shieldUsed: "none",
    lethal,
    killed,
    preventedDeath,
  });
  if (opts.melee && p.thorns && opts.src) {
    const dx = p.x - opts.src.x,
      dy = p.y - opts.src.y,
      kd = Math.hypot(dx, dy) || 1;
    this.hurtEnemy(opts.src, p.thorns, (-dx / kd) * 4, (-dy / kd) * 4, {
      noCrit: true,
      src: "thorns",
      type: "physical",
      form: "other",
    });
  }
  if (p.haste > 0) {
    const lost = Math.min(p.haste, 2);
    p.haste -= lost;
    this.addText(p.x, p.y - 16, "狂热-" + lost, "#ff9a3d");
  }
  if (p.rageLv) p.rageT = 3; // 战意沸腾
  this.hurtFlash = 0.35;
  this.shake = Math.min(this.shake + 3, 6);
  this.addText(p.x, p.y - 10, "-" + Math.round(dmg), "#ff5b5b");
  this.audio.beep(110, 0.15, "sawtooth", 0.08, -40);
  if (p.hp <= 0) {
    // 不屈: 每波一次免死
    if (p.nd && !p.ndUsed) {
      p.ndUsed = true;
      p.hp = 1;
      this.addText(p.x, p.y - 16, "不屈!!", "#ffd24a", true);
      this.audio.beep(1046, 0.3, "square", 0.08, 200);
      return applied(false, true);
    }
    this.gameOver();
    return applied(true);
  }
  return applied(false);
}

/**
 * §3.3/§5 灼烧 DoT 入口：无副作用触发链——不取整、不保底、不暴击、
 * 不触发吸血/飘字/连锁/击退。由 EnemySystem 每帧调用，燃烧粒子等表现
 * 留在调用侧，死亡判定也由调用侧按原顺序执行。
 */
export function applyBurnDot(
  this: GameCore,
  e: Enemy,
  dt: number,
): DamageResult {
  const calc = calculateDamage(DAMAGE_TYPES, {
    rawAmount: e.burnDps * dt,
    type: "fire",
    form: "other",
    origin: "burn",
    kind: "dot",
    precision: "preserve-float",
    isCritical: false,
    attackerStats: playerCombatStats(this.player),
    defenderStats: enemyCombatStats(e),
  });
  const hpBefore = e.hp;
  e.hp -= calc.settledDamage;
  this.dmgBy.burn += calc.settledDamage;
  // PR #2 三审：死亡结算由 EnemySystem 按原顺序随后执行（粒子/击杀/随机数顺序
  // 不变），返回时尚未完成——lethal 表示已达致死阈值，killed 恒为 false
  return {
    ...calc,
    effectiveHpLoss: Math.min(hpBefore, calc.settledDamage),
    dodged: false,
    shieldUsed: "none",
    lethal: e.hp <= 0,
    killed: false,
    preventedDeath: false,
  };
}
