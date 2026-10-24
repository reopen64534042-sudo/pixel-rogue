import type { GameCore } from "./GameCore";
import {
  BOX_DROP_CAP,
  BOX_DROP_RATE,
  ELITE_XP_STEP,
  hash01,
} from "../data/constants";
import type { Enemy, HitOptions, PlayerHitOptions } from "./types";
import { hasteCap } from "../data/talents";
import {
  critMultiplier,
  burnStackDps,
  scorchVulnMultiplier,
  frostFreezeDuration,
  shieldShockDamage,
} from "./DamageMath";
export function hurtEnemy(
  this: GameCore,
  e: Enemy,
  dmg: number,
  kx = 0,
  ky = 0,
  opts: HitOptions = {},
) {
  if (e.dead || this.state !== "play") return;
  let crit = false;
  if (!opts.noCrit && Math.random() < this.player.crit) {
    crit = true;
    // Issue #41：致命一击满层觉醒
    dmg *= critMultiplier(this.player);
  }
  // Issue #42 灼热易伤：灼烧目标受伤增加
  if (e.burnStacks > 0 && this.player.scorchVuln)
    dmg *= scorchVulnMultiplier(this.player);
  dmg = Math.max(1, Math.round(dmg));
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
  // Issue #38：冰霜叠层 → 冰冻
  if (this.player.frostLv > 0 && (e.frostImmuneT || 0) <= 0) {
    e.frostStacks = (e.frostStacks || 0) + 1;
    if (e.frostStacks >= 3) {
      e.frozenT = frostFreezeDuration(this.player);
      e.frostImmuneT = 2.5;
      e.frostStacks = 0;
      this.addText(e.x, e.y - e.r - 6, "冰冻", "#9fe1ff");
      this.audio.beep(880, 0.1, "sine", 0.04, 300);
    }
  }
  // Issue #42：灼烧叠层（每层 10% 伤害/秒）
  if (this.player.burn) {
    e.burnStacks = Math.min(4, (e.burnStacks || 0) + 1);
    e.burnT = 2;
    e.burnDps = burnStackDps(this.player, e.burnStacks);
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
      });
    }
    if (near.length) this.audio.beep(1200, 0.08, "sawtooth", 0.04, -600);
  }
  this.audio.beep(200 + Math.random() * 80, 0.04, "square", 0.025, -80);
  if (e.hp <= 0) this.killEnemy(e, opts.fromExplode);
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
  // Issue #42 烈焰蔓延：灼烧敌人死亡时传播剩余层数
  if (p.burnSpread > 0 && e.burnStacks > 0) {
    const targets = this.enemies
      .filter(
        (o) => o !== e && !o.dead && Math.hypot(o.x - e.x, o.y - e.y) < 80,
      )
      .sort((a, b) => a.hp - b.hp)
      .slice(0, 1 + p.burnSpread);
    for (const o of targets) {
      o.burnStacks = Math.min(4, e.burnStacks);
      o.burnT = 2;
      this.addText(o.x, o.y - 10, "蔓延", "#ff9a3d");
    }
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
          { noChain: true, noCrit: true, fromExplode: true, src: "explode" },
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
) {
  const p = this.player;
  // 闪避本能: 完全无效化
  if (p.dodge > 0 && Math.random() < p.dodge) {
    this.addText(p.x, p.y - 10, "闪避!", "#4dff88");
    this.audio.beep(700, 0.06, "sine", 0.04, 200);
    return false;
  }
  // 壁垒: 临时护盾优先消耗
  if (p.tempShield > 0) {
    p.tempShield--;
    this.addText(p.x, p.y - 10, "壁垒抵挡!", "#ff9a3d");
    this.audio.beep(980, 0.12, "sine", 0.06, -200);
    return false;
  }
  if (p.shield > 0) {
    p.shield--;
    p.shieldCd = 10;
    p.hurtCd = 0.5;
    // Issue #43：护盾破碎反震（天然节拍 = 护盾 10s 充能）
    const targets = this.enemies.filter(
      (o) => !o.dead && Math.hypot(o.x - p.x, o.y - p.y) < 80,
    );
    for (const o of targets) {
      const d = Math.hypot(o.x - p.x, o.y - p.y) || 1;
      this.hurtEnemy(
        o,
        shieldShockDamage(p),
        ((o.x - p.x) / d) * 6,
        ((o.y - p.y) / d) * 6,
        { noCrit: true, src: "shock" },
      );
    }
    if (targets.length) this.addText(p.x, p.y - 16, "反震!", "#ffd24a");
    this.addText(p.x, p.y - 10, "护盾抵挡!", "#57e6ff");
    this.audio.beep(980, 0.12, "sine", 0.06, -200);
    return false;
  }
  dmg *= 1 - Math.min(0.6, p.tough); // 铁布衫减伤
  p.hurtCd = 0.6;
  p.hp -= dmg;
  if (opts.melee && p.thorns && opts.src) {
    const dx = p.x - opts.src.x,
      dy = p.y - opts.src.y,
      kd = Math.hypot(dx, dy) || 1;
    this.hurtEnemy(opts.src, p.thorns, (-dx / kd) * 4, (-dy / kd) * 4, {
      noCrit: true,
      src: "thorns",
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
      return false;
    }
    this.gameOver();
    return true;
  }
  return false;
}
