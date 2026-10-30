import type { GameCore } from "./GameCore";
import {
  BOX_DROP_CAP,
  BOX_DROP_RATE,
  ELITE_BOX_DROP_RATE,
  ELITE_XP_STEP,
  WORLD,
  clamp,
  hash01,
} from "../data/constants";
import { DAMAGE_TYPES } from "../data/damageTypes";
import { KNOCK } from "../data/knockback";
import { WARRIOR_BALANCE } from "../data/warriorBalance";

/** 战士「裂甲」：近战命中叠层，第 3 层引爆；共享卡数值集中在此。 */
const LIE_JIA_MAX_STACKS = 3;
const LIE_JIA_BURST_MUL = 1.8;
const LIE_JIA_ARMOR_BREAK_PCT = 0.2;
const LIE_JIA_ARMOR_BREAK_T = 3;
import { calculateDamage } from "./DamageSystem";
import { getEnemyCombatStats, getPlayerCombatStats } from "./CombatStats";
import { elementDamageMultiplier } from "./ElementMath";
import type {
  DamageResult,
  Enemy,
  HitOptions,
  PlayerHitOptions,
} from "./types";
import { hasteCap } from "../data/talents";
import {
  FISSION_DAMAGE_MUL,
  FISSION_FRAGMENTS,
  FISSION_LIFE,
  FISSION_RANGE,
  FISSION_SPEED,
} from "../data/specialShot";
import {
  burnStackDps,
  scorchVulnMultiplier,
  frostFreezeDuration,
  shieldShockDamage,
} from "./DamageMath";

/** 真实伤害飘字：银白填色 + 冷蓝描边/外发光，优先于强化弹/暴击的金色 */
const TRUE_DAMAGE_COLOR = "#eaf7ff";
export const TRUE_DAMAGE_OUTLINE = "#38bdf8";

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
  const p = this.player;
  if (this.tutorialMode) this.tutorialHit = true;
  // §3.4 步骤 3：暴击判定留在编排层，掷骰条件与次数与旧路径一致。
  // PR #4 评审 P2：暴击率与倍率同源——弹丸命中优先读发射时快照的 critChance，
  // 其余路径读当前玩家；不新增随机调用、不改变命中执行顺序
  // S2：必暴来源统一在这里裁决——冷读（闪避后一次性）、赌命（闪避后窗口内全部）、
  // 处决（低血标记目标）。三者都只把 critChance 抬到 1，**掷骰次数不变**，
  // 因此不改变随机序列（parity 的种子 LCG 依赖调用次数恒定）。
  const forcedByDodge = this.dodgeNextCrit || this.dodgeProcT > 0;
  const executing =
    opts.specialHit === true &&
    (p.upCounts["处决"] || 0) > 0 &&
    e.markStacks > 0 &&
    e.hp <= e.maxhp * 0.2;
  // 连闪·锐势：冲刺后 2 秒内，战士近战暴击率/暴击伤害 +30%。
  const ruiShi =
    this.prof === "warrior" &&
    this.warriorLianShanT > 0 &&
    opts.form === "melee";
  const critChance =
    !opts.noCrit && (forcedByDodge || executing)
      ? 1
      : Math.min(
          1,
          (opts.attackerStats?.critChance ?? p.crit) +
            (ruiShi ? WARRIOR_BALANCE.lianShan.critBonus : 0),
        );
  let crit = false;
  if (!opts.noCrit && Math.random() < critChance) {
    crit = true;
  }
  // 冷读是「下一次命中」，命中即消费；赌命是窗口，不消费
  if (crit && this.dodgeNextCrit) this.dodgeNextCrit = false;
  // Issue #42 灼热易伤：灼烧目标受伤增加——条件天赋增伤折叠进 rawAmount
  //（§3.1：D_raw 已包含天赋效果）。该天赋不在 v8 严格对照集内（NOT_IN_V8），
  // 乘法顺序变化不影响 parity
  if (e.burnStacks > 0 && p.scorchVuln)
    dmg *= scorchVulnMultiplier(p);
  // 「贯穿标记」/「深痕」：标记只放大强化弹直接命中，每层 +15%。
  if (opts.specialHit && e.markStacks > 0) dmg *= 1 + 0.15 * e.markStacks;
  // S3 法师元素：受击方身上的元素状态带来的受击加成
  // （冻结 +10% 任意伤害 / 带凝冰 +8% 元素伤害 / 超导 +15% 雷电伤害）。
  // 射手路径上敌人永远没有元素状态 → 倍率为 1 → 不参与运算，逐位不变。
  const elemMul = elementDamageMultiplier(e, opts.type ?? "physical");
  if (elemMul !== 1) dmg *= elemMul;
  // 「余韵」：闪避后的一次性强化弹伤害加成，命中强化弹时消费
  if (opts.specialHit && this.dodgeNextDmg > 1) {
    dmg *= this.dodgeNextDmg;
    this.dodgeNextDmg = 1;
  }
  // 裂甲：本次命中是第 3 层时，本次伤害 +80%，随后破甲并清空层数。
  const lieJiaOwned =
    opts.form === "melee" &&
    dmg > 0 &&
    (p.upCounts["裂甲"] || 0) > 0;
  const lieJiaNext = lieJiaOwned
    ? Math.min(LIE_JIA_MAX_STACKS, (e.lieJiaStacks ?? 0) + 1)
    : 0;
  const lieJiaBurst =
    lieJiaOwned && lieJiaNext >= LIE_JIA_MAX_STACKS;
  if (lieJiaBurst) dmg *= LIE_JIA_BURST_MUL;
  // 处决的暴伤 +40% 走攻击方快照（与暴击率同源，避免第二次取属性）
  const baseStats = opts.attackerStats ?? getPlayerCombatStats(p);
  const attackerStats = executing
    ? {
        ...baseStats,
        critMultiplier: baseStats.critMultiplier + 0.4,
      }
    : baseStats;
  const effectiveAttackerStats = ruiShi
    ? {
        ...attackerStats,
        critMultiplier:
          attackerStats.critMultiplier + WARRIOR_BALANCE.lianShan.critBonus,
      }
    : attackerStats;
  // 战士职业底座：近战无视 30% 护甲。其他职业与伤害形式保持原状。
  const armorPen =
    this.prof === "warrior" && opts.form === "melee"
      ? WARRIOR_BALANCE.armorPen
      : 0;
  // §3.4 步骤 4：数值交给 DamageSystem。敌方离散命中用 round-min-one，
  // 与旧 Math.max(1, Math.round(dmg × 暴击倍率（含 #41 觉醒）× 易伤)) 一致
  const calc = calculateDamage(DAMAGE_TYPES, {
    rawAmount: dmg,
    type: opts.type ?? "physical",
    form: opts.form ?? "other",
    origin: opts.src ?? "hit",
    kind: "hit",
    precision: "round-min-one",
    isCritical: crit,
    attackerStats: effectiveAttackerStats,
    defenderStats: getEnemyCombatStats(e, armorPen),
  });
  let settled = calc.settledDamage;
  let trueDamage = 0;
  if (opts.trueFraction && opts.trueFraction > 0) {
    // 附带真实伤害是额外一层，不替换主伤害；同样吃暴击与增伤，但绕过减伤。
    const trueCalc = calculateDamage(DAMAGE_TYPES, {
      rawAmount: dmg * opts.trueFraction,
      type: "true",
      form: opts.form ?? "other",
      origin: opts.src ?? "hit",
      kind: "hit",
      precision: "round-min-one",
      isCritical: crit,
      attackerStats: effectiveAttackerStats,
      defenderStats: getEnemyCombatStats(e, armorPen),
    });
    trueDamage = trueCalc.settledDamage;
    settled += trueDamage;
  }
  dmg = settled;
  // v76 法师反应保护：目标满足反应条件、且这一发会击杀时，直伤最多留
  // 1 HP，让随后结算的反应完成击杀。只压低实际应用值；反应基数由调用方
  // 另行传入，不受本处影响（反应/连锁不得使用 lethalCap）。
  if (opts.lethalCap && e.hp > 1 && dmg >= e.hp) {
    dmg = e.hp - 1;
  }
  // 主伤害和附带的真实伤害分开显示：主数字保持原样式，真实部分用小号 +N 紧跟右侧。
  const mainIsTrue = opts.type === "true";
  const mainSpecial = opts.specialHit === true && !mainIsTrue;
  const mainDamage = trueDamage > 0 ? Math.max(0, dmg - trueDamage) : dmg;
  const mainText = this.addText(
    e.x,
    e.y - e.r - 2,
    mainDamage,
    // 居合斩优先用冰白主色（配专属双层描边，见 draw.ts）
    opts.iaiHit
      ? "#e8ffff"
      : mainIsTrue
        ? TRUE_DAMAGE_COLOR
        : opts.specialHit || crit
          ? "#ffd24a"
          : "#ffffff",
    crit,
    mainIsTrue,
    false,
    mainSpecial,
    crit,
    opts.iaiHit === true,
  );
  if (crit) {
    // 暴击火花：不推进随机数，按敌人 seed 给四向金色/白色短粒子。
    for (let i = 0; i < 4; i++) {
      const a = e.seed + (i * Math.PI) / 2;
      this.parts.push({
        x: e.x,
        y: e.y,
        vx: Math.cos(a) * 70,
        vy: Math.sin(a) * 70,
        life: 0.25,
        c: i % 2 === 0 ? "#ffd24a" : "#ffffff",
      });
    }
  }
  if (trueDamage > 0) {
    const subLabel = `+${trueDamage}`;
    // Press Start 2P 近似等宽：按字号估宽，给主数字和 +N 之间留 3px 空隙。
    const mainCharW = mainIsTrue ? (crit ? 16 : 12) : mainSpecial ? 9 : 8;
    const mainW = Math.max(8, String(mainDamage).length * mainCharW);
    const subW = subLabel.length * 8;
    this.addText(
      mainText.x + mainW / 2 + 3 + subW / 2,
      mainText.y,
      subLabel,
      TRUE_DAMAGE_COLOR,
      false,
      true,
      true,
    );
  }
  // 「贯穿标记」：只有强化弹直接命中才叠层，普通命中不叠。
  // 上限由「深痕」决定；标记常驻，不因换目标清空。
  if (opts.specialHit && (p.upCounts["贯穿标记"] || 0) > 0) {
    const cap = (p.upCounts["深痕"] || 0) > 0 ? 2 : 1;
    e.markStacks = Math.min(cap, e.markStacks + 1);
    e.markHits = 0;
  }
  const hpBefore = e.hp;
  e.hp -= dmg;
  e.flash = 0.08;
  // 裂甲：非引爆命中叠层；第 3 层命中已在上方加伤，这里清空并破甲。
  if (lieJiaOwned) {
    if (lieJiaBurst) {
      e.lieJiaStacks = 0;
      e.armorBreakT = LIE_JIA_ARMOR_BREAK_T;
      e.armorBreakPct = LIE_JIA_ARMOR_BREAK_PCT;
      this.addText(
        e.x,
        e.y - e.r - 12,
        "裂甲",
        "#ffb347",
        false,
        false,
        true,
      );
    } else {
      e.lieJiaStacks = lieJiaNext;
    }
  }
  if (opts.src) this.dmgBy[opts.src] = (this.dmgBy[opts.src] || 0) + dmg;
  if (this.player.lifesteal && !opts.noLifesteal)
    this.player.hp = Math.min(
      this.player.maxhp,
      this.player.hp + dmg * this.player.lifesteal * (opts.lifestealMul ?? 1),
    );
  if ((kx || ky) && !e.noKnock) {
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
        type: "lightning",
        form: "other",
      });
    }
    if (near.length) this.audio.beep(1200, 0.08, "sawtooth", 0.04, -600);
  }
  this.audio.beep(200 + Math.random() * 80, 0.04, "square", 0.025, -80);
  if (e.hp <= 0) {
    // 「裂变」：强化弹击杀时向附近敌人发射碎片；碎片是普通弹，不再触发裂变。
    if (opts.specialHit && this.specialUpgrades.includes("fission")) {
      const targets = this.enemies
        .filter(
          (o) =>
            o !== e &&
            !o.dead &&
            Math.hypot(o.x - e.x, o.y - e.y) <= FISSION_RANGE,
        )
        .slice(0, FISSION_FRAGMENTS);
      for (const target of targets) {
        const a = Math.atan2(target.y - e.y, target.x - e.x);
        this.bullets.push({
          x: e.x,
          y: e.y,
          vx: Math.cos(a) * FISSION_SPEED,
          vy: Math.sin(a) * FISSION_SPEED,
          dmg: dmg * FISSION_DAMAGE_MUL,
          pierce: 0,
          falloff: 1,
          life: FISSION_LIFE,
          size: 2,
          jumps: 0,
          hitList: [],
          stats: getPlayerCombatStats(p),
        });
      }
      if (targets.length) {
        for (let j = 0; j < 6; j++) {
          const a = (j / 6) * Math.PI * 2;
          this.parts.push({
            x: e.x,
            y: e.y,
            vx: Math.cos(a) * 90,
            vy: Math.sin(a) * 90,
            life: 0.25,
            c: "#ffd24a",
          });
        }
      }
    }
    this.killEnemy(e, opts.fromExplode);
  }
  // §3.5：结算伤害与实际生命损失分开，溢出部分不计入 effectiveHpLoss；
  // 击杀爆炸/掉落等副作用已在上方按原顺序执行，killed 与 lethal 同真
  return {
    ...calc,
    settledDamage: dmg,
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
  // Issue #82 图鉴：只登记类型与数量，不参与任何战斗计算。
  // 写普通字段 killLog（不依赖 CodexSystem），波末 / 局末由图鉴消费后清空。
  // 重构本函数时必须保留：删除后图鉴的敌人击杀数会静默归零（tests/codex.test.ts 会红）。
  const codexKey = e.elite ? `${e.type}_elite` : e.type;
  this.killLog[codexKey] = (this.killLog[codexKey] ?? 0) + 1;
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
      // S2 修订（用户反馈）：天赋**不再由精英死亡触发**。
      // 原实现是「打死节点精英才给」，等于把奖励放在苦战之后——玩家打精英时
      // 没有任何新能力，观感就是「刮痧」。现在改到 WaveSystem.enterRest：
      // 精英波的前一波结束时就发，让玩家带着新天赋去打精英。
      // 精英本身仍照常掉宝箱（下面的经验/掉落逻辑不变）。
      // #17：精英经验随波次成长，避免后期相对升级阈值贬值
      const eliteXp = 25 + (this.waveN - 1) * ELITE_XP_STEP;
      this.gems.push({ x: e.x, y: e.y, vx: 0, vy: 0, v: eliteXp, e: true });
      this.potions.push({ x: e.x + 8, y: e.y });
      this.shake = Math.min(this.shake + 5, 8);
      // 精英宝箱：2026-10-30 用户裁定改回概率掉落（50%），不再必掉。
      // 用确定性 pseudo-random，避免像 Math.random 那样推进 parity 随机序列。
      if (hash01(e.seed, this.waveN + 0.5) < ELITE_BOX_DROP_RATE)
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
  // 精英「分裂」词缀：死亡裂成两只非精英小一号本体，不产生额外掉落。
  if (e.elite && e.affix === "split") {
    for (let i = 0; i < 2 && this.enemies.length < 160; i++) {
      this.spawnEnemy(e.type);
      const child = this.enemies[this.enemies.length - 1];
      if (!child || child.elite) continue;
      child.maxhp = Math.max(1, Math.round(e.maxhp * 0.25));
      child.hp = child.maxhp;
      child.dmg = Math.max(1, Math.round(e.dmg * 0.45));
      child.speed = e.speed * 1.1;
      child.x = clamp(e.x + (i === 0 ? -14 : 14), 20, WORLD.w - 20);
      child.y = clamp(e.y + (i === 0 ? -8 : 8), 20, WORLD.h - 20);
      child.noDrop = true;
      child.xp = 0;
    }
    for (let i = 0; i < 12; i++) {
      const a = Math.random() * Math.PI * 2;
      this.parts.push({
        x: e.x,
        y: e.y,
        vx: Math.cos(a) * 100,
        vy: Math.sin(a) * 100,
        life: 0.4,
        c: "#ff8a2b",
      });
    }
  }
  // 裂胶史莱姆：先分裂再结算击杀爆炸，让范围伤害有机会连子体一起清掉。
  // 子体不占波次配额、不再分裂、不掉落，同屏数量仍受 160 上限约束。
  if (e.type === "splitter") {
    for (let i = 0; i < 2 && this.enemies.length < 160; i++) {
      this.spawnEnemy("splitling");
      const child = this.enemies[this.enemies.length - 1];
      if (!child || child.type !== "splitling") continue;
      child.x = clamp(e.x + (i === 0 ? -6 : 6), 20, WORLD.w - 20);
      child.y = clamp(e.y + (i === 0 ? -3 : 3), 20, WORLD.h - 20);
      child.maxhp = Math.max(1, Math.round(e.maxhp * 0.45));
      child.hp = child.maxhp;
      child.dmg = Math.max(1, Math.round(e.dmg * 0.5));
      child.speed = e.speed * 1.15;
      child.r = 3;
      child.xp = 0;
      child.noDrop = true;
    }
    for (let i = 0; i < 10; i++) {
      const a = Math.random() * Math.PI * 2;
      this.parts.push({
        x: e.x,
        y: e.y,
        vx: Math.cos(a) * 70,
        vy: Math.sin(a) * 70,
        life: 0.35,
        c: "#9dff9d",
      });
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
  trueDmg = false,
  small = false,
  specialDmg = false,
  critDmg = false,
  iaiDmg = false,
) {
  // 同位置叠字是玩家实机反馈的问题（伤害数字与机制标签互相盖住，两个都看不清）。
  // 生成时就按当前飘字错开：同一列（x 差 <18px）每撞到一条，新字上移 9px（最多 4 层）。
  // 只读现有飘字位置，不消耗随机数、不改变任何战斗数值；飘字本来就在上浮，
  // 因此错位在视觉上是一条「字往上排」的队列。
  let ny = y;
  if (!small) {
    for (let i = 0; i < 4; i++) {
      const clash = this.texts.some(
        (t) => Math.abs(t.x - x) < 18 && Math.abs(t.y - ny) < 8,
      );
      if (!clash) break;
      ny -= 9;
    }
  }
  const text = {
    x,
    y: ny,
    s: String(s),
    c,
    life: 0.7,
    vy: -22,
    big: !!big,
    ...(trueDmg ? { trueDmg: true } : {}),
    ...(specialDmg ? { specialDmg: true } : {}),
    ...(critDmg ? { critDmg: true } : {}),
    ...(iaiDmg ? { iaiDmg: true } : {}),
    ...(small ? { small: true } : {}),
  };
  this.texts.push(text);
  return this.texts[this.texts.length - 1];
}

export function damagePlayer(
  this: GameCore,
  dmg: number,
  opts: PlayerHitOptions = {},
): DamageResult {
  const p = this.player;
  const rawDmg = dmg;
  // 开发者无敌（仅 DEV）：作弊面板的开关，生产构建下 `import.meta.env.DEV`
  // 恒为 false，整段被 tree-shake，玩家侧没有任何影响。
  if (import.meta.env.DEV && this.devInvincible)
    return blockedHit(dmg, { dodged: true, shieldUsed: "none" });
  // S3 法师「镜像」虚影：虚影期间不可受击。
  // 放在最前面——虚影是「完全躲开」而不是「减伤」。
  if (this.magePhaseT > 0) {
    this.addText(p.x, p.y - 10, "虚影", "#c07bff");
    return blockedHit(dmg, { dodged: true, shieldUsed: "none" });
  }
  // 闪避本能: 完全无效化
  if (p.dodge > 0 && Math.random() < p.dodge) {
    this.addText(p.x, p.y - 10, "闪避!", "#4dff88");
    this.audio.beep(700, 0.06, "sine", 0.04, 200);
    // S2 射手「生存」槽：四种卡的窗口都在闪避成功这一刻开。
    // 这里只写窗口，不写属性——消费点在 hurtEnemy（必暴/增伤）与 PlayerSystem（移速）。
    if ((p.upCounts["冷读"] || 0) > 0) this.dodgeNextCrit = true;
    if ((p.upCounts["滞空"] || 0) > 0) {
      // 0.5 秒无敌走受击无敌计时（与受击后的无敌同一套语义）
      p.hurtCd = Math.max(p.hurtCd, 0.5);
      this.dodgeBoostT = 0.5;
    }
    // 冷读/滞空都装填下一发强化弹；余韵只是放大这一发。
    if ((p.upCounts["冷读"] || 0) > 0 || (p.upCounts["滞空"] || 0) > 0)
      this.specialLoaded = true;
    if ((p.upCounts["余韵"] || 0) > 0) this.dodgeNextDmg = 1.3;
    if ((p.upCounts["赌命"] || 0) > 0)
      this.dodgeProcT = p.hp <= p.maxhp * 0.3 ? 4 : 2;
    return blockedHit(dmg, { dodged: true, shieldUsed: "none" });
  }
  // S2「赌命」的代价：窗口内所有命中必暴，但受到的伤害 +25%
  if (this.dodgeProcT > 0 && (p.upCounts["赌命"] || 0) > 0) dmg *= 1.25;
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
    // Issue #43：护盾破碎反震（天然节拍 = 护盾 10s 充能）
    const targets = this.enemies.filter(
      (o) => !o.dead && Math.hypot(o.x - p.x, o.y - p.y) < 80,
    );
    for (const o of targets) {
      const d = Math.hypot(o.x - p.x, o.y - p.y) || 1;
      this.hurtEnemy(
        o,
        shieldShockDamage(p),
        ((o.x - p.x) / d) * KNOCK.shock,
        ((o.y - p.y) / d) * KNOCK.shock,
        { noCrit: true, src: "shock", type: "physical", form: "other" },
      );
    }
    if (targets.length) this.addText(p.x, p.y - 16, "反震!", "#ffd24a");
    this.addText(p.x, p.y - 10, "护盾抵挡!", "#57e6ff");
    this.audio.beep(980, 0.12, "sine", 0.06, -200);
    return blockedHit(dmg, { dodged: false, shieldUsed: "normal" });
  }
  // S3 法师「循环」轴的值型限时护盾：**按值吸收**，与上面的层数制护盾
  // （挡整伤）是两套模型。护盾归零后仍继续结算剩余伤害。
  if (this.mageShield > 0) {
    const absorbed = Math.min(this.mageShield, dmg);
    this.mageShield -= absorbed;
    dmg -= absorbed;
    // 只显示被护盾抵消的数值（青色），不再带「护盾」字样——
    // 玩家要的是「这一下被挡了多少」，前缀是噪音。
    this.addText(p.x, p.y - 10, String(Math.round(absorbed)), "#57e6ff");
    if (dmg <= 0)
      return blockedHit(rawDmg, { dodged: false, shieldUsed: "temporary" });
  }
  // S3 法师：受击打断抬手段（前摇）。收束段不可打断。
  this.interruptMageCast();
  // S3 法师「脱离」槽：相位（传送规避本次伤害）/ 镜像（残影 + 1 秒虚影）。
  if (this.triggerPhaseEscape())
    return blockedHit(rawDmg, { dodged: true, shieldUsed: "none" });
  this.triggerMirrorDecoy();
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
    attackerStats: opts.attackerStats ?? getEnemyCombatStats(opts.src),
    defenderStats: getPlayerCombatStats(p),
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
    this.hurtEnemy(
      opts.src,
      p.thorns,
      (-dx / kd) * KNOCK.thorns,
      (-dy / kd) * KNOCK.thorns,
      {
        noCrit: true,
        src: "thorns",
        type: "physical",
        form: "other",
      },
    );
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
 * §3.3/§5 灼烧与焦土共用的火系 DoT 结算：无副作用触发链——不取整、不保底、
 * 不暴击、不触发吸血/飘字/连锁/击退，记账到 dmgBy.burn；死亡判定由调用侧
 * 按原顺序执行（PR #2 三审：lethal 表示已达阈值，killed 恒为 false）。
 * 攻击方快照每帧读取当前玩家（与 DPS 的动态口径一致，见任务书 DoT 政策）。
 */
function applyFireDot(
  core: GameCore,
  e: Enemy,
  dps: number,
  dt: number,
): DamageResult {
  const calc = calculateDamage(DAMAGE_TYPES, {
    rawAmount: dps * dt,
    type: "fire",
    form: "other",
    origin: "burn",
    kind: "dot",
    precision: "preserve-float",
    isCritical: false,
    attackerStats: getPlayerCombatStats(core.player),
    defenderStats: getEnemyCombatStats(e),
  });
  const hpBefore = e.hp;
  e.hp -= calc.settledDamage;
  core.dmgBy.burn += calc.settledDamage;
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

/** 灼烧 DoT（EnemySystem 每帧调用）：DPS 来自施加时定值的 e.burnDps */
export function applyBurnDot(
  this: GameCore,
  e: Enemy,
  dt: number,
): DamageResult {
  return applyFireDot(this, e, e.burnDps, dt);
}

/**
 * 焦土燃烧地带 DoT（PR #4 评审 P1，Issue #45）：DPS 由 DamageMath.burnGroundDps
 * 按当前玩家逐帧计算，经 fire/dot/preserve-float 管线吃火抗与火系增伤；
 * 中性敌人数值与旧直算逐位一致。由 AttackSystem 每帧调用，死亡判定留在调用侧。
 */
export function applyBurnGroundDot(
  this: GameCore,
  e: Enemy,
  dps: number,
  dt: number,
): DamageResult {
  return applyFireDot(this, e, dps, dt);
}
