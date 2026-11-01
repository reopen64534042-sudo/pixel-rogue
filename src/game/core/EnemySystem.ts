import { WORLD, clamp, hash01 } from "../data/constants";
import {
  BURROWER,
  CHARGER_CHARGE,
  DRUMMER_AURA,
  ELITE_AFFIX_FROM,
  ELITE_AFFIXES,
  ELITE_NOVA,
  WEB_ZONE,
  enemyWeight,
  ETYPES,
  BULWARK_GUARD,
  ELITE_DRUMMER_AURA,
} from "../data/enemies";
import { interruptEnemyAction, updateEnemyBehavior } from "./EnemyBehaviors";
import { emitEnemyVisual } from "./EnemyVisualEvents";
import { ELEMENTAL_MAGE } from "../data/elementalMage";
import { resolveDifficulty } from "../data/difficulty";
import { getEnemyCombatStats, getPlayerCombatStats } from "./CombatStats";
import { professionPierce } from "./AttributeSources";
import { boltDamage, chargedShotDamage } from "./DamageMath";
import { getSpecialLevelStats } from "../data/specialShot";
import { frostSlowFactor, isFrostLocked, isFrozen, isParalyzed } from "./ElementMath";
import { resolveEnemyAttackBonuses, resolveEnemyDefense, resolveEnemySpawnStats } from "./EnemyStatSources";
import type { GameCore } from "./GameCore";
import { applyKnockback } from "./MeleeSystem";
import { constrainDomainWalking } from './DomainSystem';
import type { Enemy, MageDecoy } from "./types";

/**
 * 战鼓手光环：每帧按位置动态计算，不写回敌人字段（避免旧怪种对象形状变化）。
 * 多个战鼓手不叠加；被冻结/定身的鼓手不提供光环。
 */
function drummerAura(
  e: Enemy,
  drummers: readonly Enemy[],
): { speed: number; dmg: number } {
  let speed = 1, dmg = 1;
  for (const d of drummers) {
    if (d === e) continue;
    const dx = d.x - e.x;
    const dy = d.y - e.y;
    const aura = d.type === "drummer_elite" ? ELITE_DRUMMER_AURA : DRUMMER_AURA;
    if (dx * dx + dy * dy <= aura.radius * aura.radius) {
      speed = Math.max(speed, aura.speedMul);
      dmg = Math.max(dmg, aura.dmgMul);
    }
  }
  return { speed, dmg };
}

/** 麻痹：敌人下一次行动冷却 ×1.3（攻击间隔 +30%）。 */
function paraActionMul(e: Enemy): number {
  return isParalyzed(e) ? 1 + ELEMENTAL_MAGE.paralyze.attackSlow : 1;
}

export function spawnEnemy(
  this: GameCore,
  forceType?: string | null,
  elite = false,
) {
  let type = forceType;
  if (!type) {
    // 按波次解锁 + 权重抽取
    const unlocked = Object.keys(ETYPES).filter(
      (k) => !ETYPES[k].eliteOnly && this.waveN >= ETYPES[k].w0 && enemyWeight(k, this.waveN) > 0,
    );
    let total = 0;
    for (const k of unlocked) total += enemyWeight(k, this.waveN);
    let roll = Math.random() * total;
    for (const k of unlocked) {
      roll -= enemyWeight(k, this.waveN);
      if (roll <= 0) {
        type = k;
        break;
      }
    }
    if (!type) type = "slime";
  }
  const T = ETYPES[type];
  elite ||= T.eliteOnly === true;
  const difficulty = resolveDifficulty(
    this.prof,
    this.waveN,
    this.qualityScore,
  );
  // 防御属性只在生成时解析一次；伤害/快照路径继续读取实体字段。
  const defenseStats = resolveEnemyDefense(
    T,
    this.waveN,
    difficulty.armorAdd,
  );
  // 在世界内、远离玩家的位置生成
  let sx = this.player.x,
    sy = this.player.y;
  for (let tries = 0; tries < 5; tries++) {
    const a = Math.random() * Math.PI * 2;
    sx = clamp(this.player.x + Math.cos(a) * 300, 30, WORLD.w - 30);
    sy = clamp(this.player.y + Math.sin(a) * 300, 30, WORLD.h - 30);
    if (Math.hypot(sx - this.player.x, sy - this.player.y) > 150) break;
  }
  const speedJitter = 0.9 + Math.random() * 0.2;
  const spawnStats = resolveEnemySpawnStats(T, {
    wave: this.waveN,
    elite,
    speedJitter,
    hpMul: difficulty.hpMul,
    attackMul: difficulty.attackMul,
  });
  this.enemies.push({
    type,
    spr: T.spr,
    x: sx,
    y: sy,
    hp: spawnStats.maxHp,
    maxhp: spawnStats.maxHp,
    speed: spawnStats.moveSpeed,
    dmg: spawnStats.attack,
    r: T.r * (elite ? 1.8 : 1),
    xp: elite ? 25 : T.xp,
    ...(difficulty.xpMul !== 1 ? { xpMul: difficulty.xpMul } : {}),
    elite: !!elite,
    flash: 0,
    orbCd: 0,
    slowT: 0,
    slowF: 0,
    burnT: 0,
    burnDps: 0,
    burnStacks: 0,
    // 「贯穿标记」：标记是敌人的属性，不是玩家的——同一目标才累计
    markHits: 0,
    markStacks: 0,
    markT: 0,
    frostStacks: 0,
    frozenT: 0,
    frostImmuneT: 0,
    seed: Math.random() * 10,
    shootCd: 1 + Math.random() * 1.5,
    fuse: 0,
    noDrop: false,
    // S4-D1：防御侧三项经 StatModel 权威解析；缺省配置仍不物化键。
    ...(defenseStats.defense !== undefined
      ? { defense: defenseStats.defense }
      : {}),
    ...(defenseStats.resistances !== undefined
      ? { resistances: { ...defenseStats.resistances } }
      : {}),
    ...(defenseStats.tough !== undefined
      ? { tough: defenseStats.tough }
      : {}),
    ...(difficulty.damageTakenMul !== 1
      ? { damageTakenMul: difficulty.damageTakenMul }
      : {}),
    ...resolveEnemyAttackBonuses(T),
  });
  const spawned = this.enemies[this.enemies.length - 1];
  if (T.behavior === "bulwark") spawned.guard = {
    angle: Math.atan2(this.player.y - sy, this.player.x - sx), ...BULWARK_GUARD, downT: 0,
  };
  if (elite && this.waveN >= ELITE_AFFIX_FROM) {
    // 用生成 seed 做确定性抽取，避免多消耗一次 Math.random 打乱既有序列。
    const roll = hash01(spawned.seed, this.waveN + 0.37);
    const used = new Set(this.waveEliteAffixes);
    const first = Math.floor(roll * ELITE_AFFIXES.length);
    spawned.affix = ELITE_AFFIXES[first];
    for (let offset = 0; offset < ELITE_AFFIXES.length; offset++) {
      const affix = ELITE_AFFIXES[(first + offset) % ELITE_AFFIXES.length];
      if (!used.has(affix)) { spawned.affix = affix; break; }
    }
    this.waveEliteAffixes.push(spawned.affix);
  }
  return spawned;
}

export function nearestEnemy(
  this: GameCore,
  x: number,
  y: number,
  maxD: number,
  exclude?: Enemy,
) {
  let best = null,
    bd = maxD * maxD;
  for (const e of this.enemies) {
    if (e.dead || e === exclude || e.burrowState !== undefined) continue;
    const dx = e.x - x,
      dy = e.y - y,
      d = dx * dx + dy * dy;
    if (d < bd) {
      bd = d;
      best = e;
    }
  }
  return best;
}

export function updateEnemies(this: GameCore, dt: number) {
  const p = this.player;
  // 蛛网先走计时；即使场上没有织网蛛，已有网也按剩余时间自然消失。
  for (let i = this.webZones.length - 1; i >= 0; i--) {
    const z = this.webZones[i];
    z.t -= dt;
    if (z.arm > 0) z.arm = Math.max(0, z.arm - dt);
    if (z.t <= 0) this.webZones.splice(i, 1);
  }
  const drummers = this.enemies.filter(
    (d) =>
      (d.type === "drummer" || d.type === "drummer_elite") &&
      !d.dead &&
      d.frozenT <= 0 &&
      !isFrozen(d) &&
      !isFrostLocked(d) && (d.type !== "drummer_elite" || ((d.stunT ?? 0) <= 0 && (d.domainStunUntil ?? 0) <= this.time)),
  );
  // ---- 敌人 AI ----
  for (let i = this.enemies.length - 1; i >= 0; i--) {
    const e = this.enemies[i];
    if (e.dead) {
      this.enemies.splice(i, 1);
      continue;
    }
    // Boss 的移动、持续状态与攻击由独立固定步系统推进。
    if (e.boss) continue;
    e.flash -= dt;
    e.orbCd -= dt;
    e.slowT -= dt;
    if (e.armorBreakT) e.armorBreakT = Math.max(0, e.armorBreakT - dt);
    // 击退位移（近战模块写入，先于 AI 移动结算）
    applyKnockback(e, dt);
    // S5：陨星/法阵的落点提前量必须用**敌人真实速度**——旧实现假设
    // 「朝玩家移动」，射手后撤/横移时落点会落在玩家与敌人中间，永远打空。
    // 先归零，只有真正移动的分支在下面写回；冻结/死亡的敌人保持 0。
    // 仅法师路径物化，射手路径的敌人对象形状不变（parity 逐字段对照）。
    if (this.prof === "mage") {
      e.vx = 0;
      e.vy = 0;
    }
    const moveX0 = e.x;
    const moveY0 = e.y;
    const committedCharge=e.chargeState==='dash';
    // 表现层：精英滴熔岩、火囊虫奔袭掉火星。
    // 刻意用确定性相位而非 Math.random —— 后者会错开随机序列，破坏 parity 对照。
    if (e.elite && Math.sin(this.time * 7 + e.seed * 13) > 0.97) {
      this.parts.push({
        x: e.x + Math.sin(e.seed * 31) * 5,
        y: e.y + 4,
        vx: 0,
        vy: 42,
        life: 0.7,
        c: "#ff6a2b",
      });
    }
    if (
      e.type === "bomber" &&
      !e.fuse &&
      Math.sin(this.time * 23 + e.seed * 11) > 0.93
    ) {
      this.parts.push({
        x: e.x,
        y: e.y + 2,
        vx: 0,
        vy: -18,
        life: 0.25,
        c: "#ff8a2b",
      });
    }
    // 「贯穿标记」为常驻标记；markT/markHits 仅保留给旧存档与实体形状。
    if (e.burnT > 0) {
      e.burnT -= dt;
      this.applyBurnDot(e, dt);
      if (Math.random() < dt * 8)
        this.parts.push({
          x: e.x,
          y: e.y,
          vx: (Math.random() - 0.5) * 20,
          vy: -30,
          life: 0.3,
          c: "#ff9a3d",
        });
      if (e.hp <= 0) {
        this.killEnemy(e);
        continue;
      }
    } else if (e.burnStacks) {
      e.burnStacks = 0;
    }
    // Issue #38：冰冻定身（仍可受伤害/灼烧）
    e.frostImmuneT = Math.max(0, e.frostImmuneT - dt);
    if (e.action && (e.frozenT > 0 || isFrozen(e) || isFrostLocked(e) ||
      (e.stunT ?? 0) > 0 || (e.domainStunUntil ?? 0) > this.time)) interruptEnemyAction(e);
    if (e.frozenT > 0) {
      e.frozenT -= dt;
      continue;
    }
    // 元素法师：冻结（凝冰满层）与霜牢都定身。计时由
    // ElementSystem.updateMageElements 推进，这里只判定。
    if (isFrozen(e)) continue;
    if (isFrostLocked(e)) continue;
    // v128 大剑三段斩：通用眩晕。可选字段只在被震地命中时物化，
    // 射手/法师路径不出现该键；眩晕期间跳过整段 AI（仍可受击）。
    if (e.stunT !== undefined) {
      if (e.stunT > 0) {
        e.stunT -= dt;
        if (e.stunT > 0) continue;
      }
      delete e.stunT;
    }
    // S3 法师「镜像」残影：存在残影时敌人改攻残影（吸引仇恨）。
    if ((e.domainStunUntil??0)>this.time) continue;
    // 残影不存在时下面的目标点仍是玩家，射手路径逐位不变。
    let targetX = p.x;
    let targetY = p.y;
    let decoy: MageDecoy | null = null;
    if (this.mageDecoys.length) {
      let bestD = Infinity;
      for (const d of this.mageDecoys) {
        const dist = Math.hypot(d.x - e.x, d.y - e.y);
        if (dist < bestD) {
          bestD = dist;
          decoy = d;
        }
      }
      if (decoy) {
        targetX = decoy.x;
        targetY = decoy.y;
      }
    }
    let a = Math.atan2(targetY - e.y, targetX - e.x);
    if (e.type === "bat") a += Math.sin(this.time * 6 + e.seed) * 0.5;
    const aura = drummerAura(e, drummers);
    if ((e.rallyUntil ?? 0) > this.time) aura.speed = Math.max(aura.speed, ELITE_DRUMMER_AURA.speedMul);
    // 精英词缀：召唤蝙蝠 / 冰霜新星；分裂在 killEnemy 结算。
    if (e.elite && e.affix) {
      if (e.affix === "summon") {
        e.affixT = (e.affixT ?? 3.2) - dt;
        if (e.affixT <= 0) {
          const livingBats = this.enemies.filter(
            (o) => !o.dead && o.type === "bat",
          ).length;
          if (livingBats < 12) {
            for (let i = 0; i < 2 && this.enemies.length < 160; i++) {
              this.spawnEnemy("bat");
              const bat = this.enemies[this.enemies.length - 1];
              bat.x = clamp(e.x + (i === 0 ? -12 : 12), 24, WORLD.w - 24);
              bat.y = clamp(e.y + 8, 24, WORLD.h - 24);
              bat.maxhp = Math.max(1, Math.round(bat.maxhp * 0.7));
              bat.hp = bat.maxhp;
              bat.noDrop = true;
              bat.xp = 0;
            }
            this.addText(e.x, e.y - e.r - 12, "召唤", "#b05cff");
            emitEnemyVisual(this, e, "summon", e, 26);
            this.audio.beep(520, 0.12, "triangle", 0.05, 120);
          }
          e.affixT = 5 * paraActionMul(e);
        }
      } else if (e.affix === "nova") {
        if ((e.novaT ?? 0) > 0) {
          e.novaT = (e.novaT ?? 0) - dt;
          if (e.novaT <= 0) {
            emitEnemyVisual(this, e, "nova", e, ELITE_NOVA.radius);
            const hit =
              Math.hypot(p.x - e.x, p.y - e.y) < ELITE_NOVA.radius;
            if (hit)
              this.damagePlayer(e.dmg * ELITE_NOVA.damageMul * aura.dmg, {
                type: "frost",
                form: "other",
                src: e,
                cause: "explosion",
              });
            for (let i = 0; i < 18; i++) {
              const na = (i / 18) * Math.PI * 2;
              this.parts.push({
                x: e.x,
                y: e.y,
                vx: Math.cos(na) * 120,
                vy: Math.sin(na) * 120,
                life: 0.4,
                c: "#57e6ff",
              });
            }
            this.addText(e.x, e.y - e.r - 12, "冰霜新星", "#57e6ff");
            this.audio.beep(220, 0.2, "sine", 0.06, -40);
          }
        } else {
          e.affixT = (e.affixT ?? 3.5) - dt;
          if (
            e.affixT <= 0 &&
            Math.hypot(p.x - e.x, p.y - e.y) < ELITE_NOVA.triggerRange
          ) {
            e.novaT = ELITE_NOVA.windup;
            e.affixT = ELITE_NOVA.cooldown * paraActionMul(e);
            this.audio.beep(320, 0.1, "square", 0.04, 40);
          }
        }
      }
    }
    // 元素法师：凝冰每层减速、麻痹降低移速。
    // 射手路径上两个因子恒为 1 → 乘 1 精确，数值逐位不变。
    const domainMove=(e.domainRootUntil??0)>this.time ? 0 : 1-(e.domainSlowF??0);
    const spd =
      e.speed *
      aura.speed *
      (e.slowT > 0 ? 1 - e.slowF : 1) *
      (1 - frostSlowFactor(e)) *
      (isParalyzed(e) ? 1 - ELEMENTAL_MAGE.paralyze.moveSlow : 1) * domainMove;
    if (updateEnemyBehavior(this, e, { x: targetX, y: targetY }, spd, aura.dmg, dt)) {
      if (this.state !== "play") return true;
    } else if (e.type === "shooter") {
      // 远程: 远则靠近、近则后撤、中距离横向游走并射击
      // S3：距离改用当前目标（默认玩家；存在镜像残影时是残影），
      // 无残影时 target 就是玩家，行为与旧版逐位一致。
      const d = Math.hypot(targetX - e.x, targetY - e.y);
      // #180 残局收拢：场上只剩少量敌人时，远程怪不再游走风筝，改为主动靠近。
      // 否则近战职业清到剩几只 shooter 会陷入「满地图追」的垃圾时间。
      //
      // 阈值 12 是实测定的（v110）：第 4 波「最后 6–12 只分散射击」这段的耗时与
      // DPS 无关，是纯跑图成本，所以伤害/攻速/扇形怎么调都被它淹没。对照数据
      // （同条件单次运行）：阈值 5 → 波 4 102s；阈值 12 → 85.8s（−16s）。
      // 而同期测得的「扇形 100°→130°」只有 −1～2s（噪声内，因为 meleeSwing
      // 本来就是扇形内全命中、无目标上限，贴脸时 100° 已覆盖实际命中范围）。
      const fewLeft = this.enemies.filter((x) => !x.dead).length <= 12;
      let mvx = 0,
        mvy = 0;
      if (fewLeft) {
        if (d > 60) {
          mvx = Math.cos(a);
          mvy = Math.sin(a);
        }
      } else if (d > 150) {
        mvx = Math.cos(a);
        mvy = Math.sin(a);
      } else if (d < 90) {
        mvx = -Math.cos(a);
        mvy = -Math.sin(a);
      } else {
        mvx = -Math.sin(a) * Math.sin(this.time * 1.5 + e.seed) * 0.7;
        mvy = Math.cos(a) * Math.sin(this.time * 1.5 + e.seed) * 0.7;
      }
      e.x += mvx * spd * dt;
      e.y += mvy * spd * dt;
      e.shootCd -= dt;
      if (e.shootCd <= 0 && d < 210) {
        // 元素法师：麻痹使攻击间隔 +30%。
        e.shootCd = 2.0 * paraActionMul(e);
        this.ebullets.push({
          x: e.x,
          y: e.y,
          vx: Math.cos(a) * 95,
          vy: Math.sin(a) * 95,
          dmg: e.dmg * aura.dmg,
          r: 2,
          life: 4,
          // 发射时攻击者快照：发射者可能在命中前死亡/移除，不依赖存活引用
          stats: getEnemyCombatStats(e),
        });
        emitEnemyVisual(this, e, "shot", e, 12, a);
        this.audio.beep(340, 0.08, "square", 0.03, -60);
      }
    } else if (e.type === "bomber") {
      // 特殊: 高速逼近 → 引爆 (0.5s 预警闪烁)
      if (!e.fuse) {
        e.x += Math.cos(a) * spd * dt;
        e.y += Math.sin(a) * spd * dt;
        if (Math.hypot(targetX - e.x, targetY - e.y) < 26) {
          e.fuse = 0.5;
          this.audio.beep(220, 0.2, "sawtooth", 0.05, 200);
        }
      } else {
        e.fuse -= dt;
        if (e.fuse <= 0) {
          emitEnemyVisual(this, e, "explosion", e, 38 + p.r);
          const d2p = Math.hypot(p.x - e.x, p.y - e.y);
          if (
            d2p < 38 + p.r &&
            p.hurtCd <= 0 &&
            p.dashT <= 0 &&
            this.warriorLeapInvulnT <= 0 &&
            this.warriorLeapState?.triStage3 !== true
          )
            this.damagePlayer(e.dmg * aura.dmg, {
              type: "fire",
              form: "other",
              src: e,
              cause: "explosion",
              attackerStats: getEnemyCombatStats(e),
            });
          for (let j = 0; j < 12; j++) {
            const an = Math.random() * Math.PI * 2;
            this.parts.push({
              x: e.x,
              y: e.y,
              vx: Math.cos(an) * 130,
              vy: Math.sin(an) * 130,
              life: 0.4,
              c: "#ff9a3d",
            });
          }
          this.shake = Math.min(this.shake + 3, 6);
          this.audio.beep(80, 0.3, "sawtooth", 0.08, -30);
          e.noDrop = true;
          e.hp = 0;
          this.killEnemy(e);
          continue;
        }
      }
    } else if (e.type === "drummer") {
      // 战鼓手：保持 90–150px 的中后距离，不贴脸；光环在 spd/伤害结算时读取。
      const d = Math.hypot(targetX - e.x, targetY - e.y);
      let mvx = 0;
      let mvy = 0;
      if (d > 150) {
        mvx = Math.cos(a);
        mvy = Math.sin(a);
      } else if (d < 90) {
        mvx = -Math.cos(a);
        mvy = -Math.sin(a);
      } else {
        mvx = -Math.sin(a) * Math.sin(this.time * 1.8 + e.seed) * 0.6;
        mvy = Math.cos(a) * Math.sin(this.time * 1.8 + e.seed) * 0.6;
      }
      e.x += mvx * spd * dt;
      e.y += mvy * spd * dt;
      // 鼓点火星：确定性相位，避免推进 parity 的随机序列。
      if (Math.sin(this.time * 5 + e.seed * 17) > 0.93) {
        this.parts.push({
          x: e.x,
          y: e.y - 4,
          vx: (Math.sin(e.seed * 7) * 8) | 0,
          vy: -16,
          life: 0.3,
          c: "#ffd24a",
        });
      }
    } else if (e.type === "burrower") {
      // 掘地虫：追近 → 下沉 → 地下突进 → 地面预警 → 钻出。钻地期间不参与自动索敌与接触伤害。
      if (e.burrowCd === undefined) e.burrowCd = 1.2 + Math.random() * 1.2;
      if (e.burrowState === "dive") {
        e.burrowT = (e.burrowT ?? 0) - dt;
        if (e.burrowT <= 0) {
          e.burrowState = "under";
          e.burrowT = BURROWER.under;
        }
        this.parts.push({
          x: e.x + (Math.random() - 0.5) * 8,
          y: e.y + 3,
          vx: 0,
          vy: -18,
          life: 0.3,
          c: "#5a3a20",
        });
      } else if (e.burrowState === "under") {
        const d = Math.hypot(targetX - e.x, targetY - e.y);
        if (d > 1) {
          e.x += ((targetX - e.x) / d) * BURROWER.underSpeed * dt * domainMove;
          e.y += ((targetY - e.y) / d) * BURROWER.underSpeed * dt * domainMove;
        }
        e.burrowT = (e.burrowT ?? 0) - dt;
        if (Math.random() < dt * 12)
          this.parts.push({
            x: e.x + (Math.random() - 0.5) * 8,
            y: e.y + 2,
            vx: 0,
            vy: -10,
            life: 0.25,
            c: "#5a3a20",
          });
        if (e.burrowT <= 0) {
          e.burrowState = "surface";
          e.burrowT = BURROWER.surface;
          this.audio.beep(140, 0.08, "square", 0.03, -30);
        }
      } else if (e.burrowState === "surface") {
        e.burrowT = (e.burrowT ?? 0) - dt;
        if (e.burrowT <= 0) {
          e.burrowState = undefined;
          e.burrowT = 0;
          e.burrowCd = BURROWER.cooldown * paraActionMul(e);
          emitEnemyVisual(this, e, "emerge", e, 24);
          this.audio.beep(90, 0.12, "sawtooth", 0.04, 20);
          for (let i = 0; i < 8; i++) {
            const dustA = (i / 8) * Math.PI * 2;
            this.parts.push({
              x: e.x,
              y: e.y,
              vx: Math.cos(dustA) * 55,
              vy: Math.sin(dustA) * 55 - 8,
              life: 0.35,
              c: "#5a3a20",
            });
          }
        }
      } else {
        e.burrowCd = Math.max(0, (e.burrowCd ?? 0) - dt);
        const d = Math.hypot(targetX - e.x, targetY - e.y);
        if (
          e.burrowCd <= 0 &&
          d > BURROWER.rangeMin &&
          d < BURROWER.rangeMax
        ) {
          e.burrowState = "dive";
          e.burrowT = BURROWER.dive;
          this.audio.beep(180, 0.08, "sine", 0.03, -60);
        } else {
          e.x += Math.cos(a) * spd * dt;
          e.y += Math.sin(a) * spd * dt;
        }
      }
    } else if (e.type === "spinner") {
      // 织网蛛：保持中距离，向当前目标脚下吐网；先预警，后生效。
      if (e.webCd === undefined) e.webCd = 1.4 + Math.random() * 1.2;
      e.webCd = Math.max(0, e.webCd - dt);
      const d = Math.hypot(targetX - e.x, targetY - e.y);
      let mvx = 0;
      let mvy = 0;
      if (d > 170) {
        mvx = Math.cos(a);
        mvy = Math.sin(a);
      } else if (d < 100) {
        mvx = -Math.cos(a);
        mvy = -Math.sin(a);
      } else {
        mvx = -Math.sin(a) * Math.sin(this.time * 1.6 + e.seed) * 0.5;
        mvy = Math.cos(a) * Math.sin(this.time * 1.6 + e.seed) * 0.5;
      }
      e.x += mvx * spd * dt;
      e.y += mvy * spd * dt;
      if (
        e.webCd <= 0 &&
        d < WEB_ZONE.range &&
        this.webZones.length < WEB_ZONE.max
      ) {
        this.webZones.push({
          x: targetX,
          y: targetY,
          R: WEB_ZONE.radius,
          t: WEB_ZONE.arm + WEB_ZONE.duration,
          arm: WEB_ZONE.arm,
        });
        e.webCd = WEB_ZONE.cooldown * paraActionMul(e);
        emitEnemyVisual(this, e, "web", e, 12, a);
        this.audio.beep(260, 0.08, "triangle", 0.03, -30);
      }
    } else if (e.type === "charger") {
      // 角兽：追近 → 0.6s 红线预警 → 0.5s 直线冲锋 → 撞墙/结束硬直 1.2s。
      // 冲锋方向在预警开始时锁定，玩家可以靠侧移或冲刺躲开。
      if (e.chargeCd === undefined) e.chargeCd = 0.9 + Math.random() * 1.2;
      if (e.chargeState === "windup") {
        e.chargeT = (e.chargeT ?? 0) - dt;
        if (e.chargeT <= 0) {
          e.chargeState = "dash";
          e.chargeT = CHARGER_CHARGE.dash;
          this.audio.beep(90, 0.18, "sawtooth", 0.06, 80);
        }
      } else if (e.chargeState === "dash") {
        const dx = e.chargeDx ?? 0;
        const dy = e.chargeDy ?? 0;
        const step = CHARGER_CHARGE.speed * dt * domainMove;
        const nx = e.x + dx * step;
        const ny = e.y + dy * step;
        e.chargeT = (e.chargeT ?? 0) - dt;
        const hitWall =
          nx < 20 || nx > WORLD.w - 20 || ny < 20 || ny > WORLD.h - 20;
        e.x = clamp(nx, 20, WORLD.w - 20);
        e.y = clamp(ny, 20, WORLD.h - 20);
        if (hitWall || e.chargeT <= 0) {
          e.chargeState = "stun";
          emitEnemyVisual(this, e, "charge", e, 24, Math.atan2(e.chargeDy ?? 0, e.chargeDx ?? 1));
          e.chargeT = CHARGER_CHARGE.stun;
          e.chargeCd = CHARGER_CHARGE.cooldown * paraActionMul(e);
          this.shake = Math.min(this.shake + 1.5, 6);
          this.audio.beep(70, 0.2, "square", 0.05, -40);
          for (let i = 0; i < 6; i++) {
            const dustA = Math.PI + dx * (i / 6);
            this.parts.push({
              x: e.x - dx * 4,
              y: e.y - dy * 4,
              vx: Math.cos(dustA) * 45,
              vy: Math.sin(dustA) * 45 - 10,
              life: 0.35,
              c: "#c05050",
            });
          }
        }
      } else if (e.chargeState === "stun") {
        e.chargeT = (e.chargeT ?? 0) - dt;
        if (e.chargeT <= 0) {
          e.chargeState = undefined;
          e.chargeT = 0;
        }
      } else {
        e.chargeCd = Math.max(0, (e.chargeCd ?? 0) - dt);
        const d = Math.hypot(targetX - e.x, targetY - e.y);
        if (e.chargeCd <= 0 && d > 50 && d < 230) {
          e.chargeState = "windup";
          e.chargeT = CHARGER_CHARGE.windup;
          e.chargeDx = Math.cos(a);
          e.chargeDy = Math.sin(a);
          this.audio.beep(150, 0.1, "square", 0.04, 60);
        } else {
          e.x += Math.cos(a) * spd * dt;
          e.y += Math.sin(a) * spd * dt;
        }
      }
    } else {
      e.x += Math.cos(a) * spd * dt;
      e.y += Math.sin(a) * spd * dt;
    }
    e.x = clamp(e.x, 20, WORLD.w - 20);
    e.y = clamp(e.y, 20, WORLD.h - 20);
    if (!committedCharge) constrainDomainWalking(this,e,moveX0,moveY0);
    if (this.prof === "mage") {
      e.vx = (e.x - moveX0) / dt;
      e.vy = (e.y - moveY0) / dt;
    }
    // 接触伤害
    const dx = p.x - e.x,
      dy = p.y - e.y,
      rr = e.r + p.r;
    if (dx * dx + dy * dy < rr * rr) {
      // S2 射手「脱离」槽：被贴身的自救手段。两者的共同前提是「接触」，
      // 但效果不同——惊弓把玩家推离（保距离），逆矢原地反击（换伤害）。
      // 都不消耗随机数，只写冷却，所以不改变 parity 的随机序列。
      const dist = Math.hypot(dx, dy) || 1;
      if ((p.upCounts["惊弓"] || 0) > 0 && this.contactKnockCd <= 0) {
        p.x = clamp(p.x + (dx / dist) * 40, 24, WORLD.w - 24);
        p.y = clamp(p.y + (dy / dist) * 40, 24, WORLD.h - 24);
        this.contactKnockCd = 3;
        // 惊弓的弹开同时装填下一发强化弹，形成「被贴身反而更强」的节奏。
        this.specialLoaded = true;
        this.addText(p.x, p.y - 12, "惊弓", "#57e6ff");
        this.audio.beep(520, 0.08, "square", 0.04, 260);
      }
      if ((p.upCounts["逆矢"] || 0) > 0 && this.counterCd <= 0) {
        const a = Math.atan2(e.y - p.y, e.x - p.x);
        const specialStats = getSpecialLevelStats(this.specialLevel);
        this.bullets.push({
          x: p.x,
          y: p.y - 3,
          vx: Math.cos(a) * p.projSpeed,
          vy: Math.sin(a) * p.projSpeed,
          dmg: chargedShotDamage(boltDamage(p) * 1.5, specialStats.mul),
          pierce:
            p.pierce +
            professionPierce(this.prof) +
            specialStats.pierceBonus,
          falloff: p.pierceFalloff,
          life: specialStats.infiniteFlight
            ? Number.POSITIVE_INFINITY
            : p.attackRange / p.projSpeed,
          size: 2 * p.area,
          jumps: 0,
          hitList: [],
          trail: (p.upCounts["贯穿轨迹"] || 0) > 0 ? 0.6 : 0,
          special: true,
          stats: getPlayerCombatStats(p),
        });
        this.counterCd = 3;
        this.addText(p.x, p.y - 12, "逆矢", "#ffd24a");
      }
      // S3 法师「镜像」虚影期间无视碰撞：不结算接触伤害。
      // 角兽撞墙硬直时不结算接触伤害，给玩家一个安全的惩罚窗口。
      const chargerStunned =
        e.type === "charger" && e.chargeState === "stun";
      const burrowerHidden =
        e.type === "burrower" && e.burrowState !== undefined;
      if (
        !chargerStunned &&
        !burrowerHidden &&
        p.hurtCd <= 0 &&
        p.dashT <= 0 &&
        this.warriorLeapInvulnT <= 0 &&
        this.warriorLeapState?.triStage3 !== true &&
        this.magePhaseT <= 0
      ) {
        const contactDmg =
          (e.type === "charger" && e.chargeState === "dash"
            ? e.dmg * 1.3
            : e.dmg) * aura.dmg;
        const hit = this.damagePlayer(contactDmg, {
          melee: true,
          src: e,
          cause: "contact",
          type: "physical",
          form: "melee",
        });
        if (hit.killed) return true;
      }
    }
  }
  // 敌人分离
  for (let i = 0; i < this.enemies.length; i++) {
    for (let j = i + 1; j < this.enemies.length; j++) {
      const a = this.enemies[i],
        b = this.enemies[j];
      if (a.boss || b.boss) continue;
      const dx = b.x - a.x,
        dy = b.y - a.y;
      const rr = a.r + b.r,
        d2 = dx * dx + dy * dy;
      if (d2 > 0.01 && d2 < rr * rr) {
        const d = Math.sqrt(d2),
          push = ((rr - d) / d) * 0.3;
        if (!a.noKnock && !isFrostLocked(a)) {
          a.x -= dx * push;
          a.y -= dy * push;
        }
        if (!b.noKnock && !isFrostLocked(b)) {
          b.x += dx * push;
          b.y += dy * push;
        }
      }
    }
  }
}
