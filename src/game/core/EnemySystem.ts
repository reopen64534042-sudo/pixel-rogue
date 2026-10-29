import { WORLD, clamp } from "../data/constants";
import { enemyWeight, ETYPES } from "../data/enemies";
import { getEnemyCombatStats, getPlayerCombatStats } from "./CombatStats";
import { professionPierce } from "./AttributeSources";
import { boltDamage } from "./DamageMath";
import { resolveEnemyAttackBonuses, resolveEnemyDefense, resolveEnemySpawnStats } from "./EnemyStatSources";
import type { GameCore } from "./GameCore";
import { applyKnockback } from "./MeleeSystem";
import type { Enemy } from "./types";
export function spawnEnemy(
  this: GameCore,
  forceType?: string | null,
  elite = false,
) {
  let type = forceType;
  if (!type) {
    // 按波次解锁 + 权重抽取
    const unlocked = Object.keys(ETYPES).filter(
      (k) => this.waveN >= ETYPES[k].w0,
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
  // 防御属性只在生成时解析一次；伤害/快照路径继续读取实体字段。
  const defenseStats = resolveEnemyDefense(T, this.waveN);
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
    playerLevel: this.player.lvl,
    elite,
    speedJitter,
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
    elite: !!elite,
    flash: 0,
    orbCd: 0,
    slowT: 0,
    slowF: 0,
    burnT: 0,
    burnDps: 0,
    burnStacks: 0,
    // S2「猎杀标记」：标记是敌人的属性，不是玩家的——同一目标才累计
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
    ...resolveEnemyAttackBonuses(T),
  });
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
    if (e.dead || e === exclude) continue;
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
  // ---- 敌人 AI ----
  for (let i = this.enemies.length - 1; i >= 0; i--) {
    const e = this.enemies[i];
    if (e.dead) {
      this.enemies.splice(i, 1);
      continue;
    }
    e.flash -= dt;
    e.orbCd -= dt;
    e.slowT -= dt;
    // 击退位移（近战模块写入，先于 AI 移动结算）
    applyKnockback(e, dt);
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
    // S2「猎杀标记」维持：换目标 5 秒内未再命中则清空累计与层数。
    // 递减放在这里（敌人自己的状态），不引入新的随机调用。
    if (e.markT > 0) {
      e.markT -= dt;
      if (e.markT <= 0) {
        e.markHits = 0;
        e.markStacks = 0;
      }
    }
    // 灼烧：数值经 applyBurnDot（fire/dot/preserve-float）结算，表现与死亡判定留在本处
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
    if (e.frozenT > 0) {
      e.frozenT -= dt;
      continue;
    }
    let a = Math.atan2(p.y - e.y, p.x - e.x);
    if (e.type === "bat") a += Math.sin(this.time * 6 + e.seed) * 0.5;
    const spd = e.speed * (e.slowT > 0 ? 1 - e.slowF : 1);
    if (e.type === "shooter") {
      // 远程: 远则靠近、近则后撤、中距离横向游走并射击
      const d = Math.hypot(p.x - e.x, p.y - e.y);
      let mvx = 0,
        mvy = 0;
      if (d > 150) {
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
        e.shootCd = 2.0;
        this.ebullets.push({
          x: e.x,
          y: e.y,
          vx: Math.cos(a) * 95,
          vy: Math.sin(a) * 95,
          dmg: e.dmg,
          r: 2,
          life: 4,
          // 发射时攻击者快照：发射者可能在命中前死亡/移除，不依赖存活引用
          stats: getEnemyCombatStats(e),
        });
        this.audio.beep(340, 0.08, "square", 0.03, -60);
      }
    } else if (e.type === "bomber") {
      // 特殊: 高速逼近 → 引爆 (0.5s 预警闪烁)
      if (!e.fuse) {
        e.x += Math.cos(a) * spd * dt;
        e.y += Math.sin(a) * spd * dt;
        if (Math.hypot(p.x - e.x, p.y - e.y) < 26) {
          e.fuse = 0.5;
          this.audio.beep(220, 0.2, "sawtooth", 0.05, 200);
        }
      } else {
        e.fuse -= dt;
        if (e.fuse <= 0) {
          const d2p = Math.hypot(p.x - e.x, p.y - e.y);
          if (d2p < 38 + p.r && p.hurtCd <= 0 && p.dashT <= 0)
            this.damagePlayer(e.dmg, {
              type: "fire",
              form: "other",
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
    } else {
      e.x += Math.cos(a) * spd * dt;
      e.y += Math.sin(a) * spd * dt;
    }
    e.x = clamp(e.x, 20, WORLD.w - 20);
    e.y = clamp(e.y, 20, WORLD.h - 20);
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
        this.addText(p.x, p.y - 12, "惊弓", "#57e6ff");
        this.audio.beep(520, 0.08, "square", 0.04, 260);
      }
      if ((p.upCounts["逆矢"] || 0) > 0 && this.counterCd <= 0) {
        const a = Math.atan2(e.y - p.y, e.x - p.x);
        this.bullets.push({
          x: p.x,
          y: p.y - 3,
          vx: Math.cos(a) * p.projSpeed,
          vy: Math.sin(a) * p.projSpeed,
          dmg: boltDamage(p) * 2,
          pierce: p.pierce + professionPierce(this.prof),
          falloff: p.pierceFalloff,
          life: p.attackRange / p.projSpeed,
          size: 2 * p.area,
          jumps: 0,
          hitList: [],
          stats: getPlayerCombatStats(p),
        });
        this.counterCd = 3;
        this.addText(p.x, p.y - 12, "逆矢", "#ffd24a");
      }
      if (p.hurtCd <= 0 && p.dashT <= 0) {
        const hit = this.damagePlayer(e.dmg, {
          melee: true,
          src: e,
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
      const dx = b.x - a.x,
        dy = b.y - a.y;
      const rr = a.r + b.r,
        d2 = dx * dx + dy * dy;
      if (d2 > 0.01 && d2 < rr * rr) {
        const d = Math.sqrt(d2),
          push = ((rr - d) / d) * 0.3;
        a.x -= dx * push;
        a.y -= dy * push;
        b.x += dx * push;
        b.y += dy * push;
      }
    }
  }
}
