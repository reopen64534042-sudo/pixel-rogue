import { hash01 } from "../data/constants";
import { statBase } from "../data/stats";
import { DMG_POOL, RAMP, UPGRADES } from "../data/talents";
import type { GameCore } from "./GameCore";
import type { Talent } from "./types";
export function tierWeights(this: GameCore) {
  let w = RAMP[0].w;
  for (const r of RAMP) if (this.player.lvl >= r.min) w = r.w;
  return w;
}

export function pickTier(this: GameCore, w: number[]) {
  let s = Math.random() * (w[0] + w[1] + w[2] + w[3]);
  for (let i = 0; i < 4; i++) {
    if (s < w[i]) return i;
    s -= w[i];
  }
  return 0;
}

export function availTalents(this: GameCore, t: number) {
  return UPGRADES.filter((u) => this.canOffer(u) && u.t === t);
}

export function canOffer(this: GameCore, u: Talent) {
  return (
    !u.hidden &&
    (this.player.upCounts[u.n] || 0) < u.max &&
    (!u.req || u.req(this.player))
  );
}

export function recompute(this: GameCore) {
  const hpBefore = this.player.hp;
  Object.assign(this.player, statBase());
  // Combat Foundation S3-B：statBase 不含可选战斗属性键，Object.assign 不会清除
  // 残留值——磐石/元素亲和等增量型天赋重放前必须清键，否则在旧值上叠加
  for (const key of [
    "defense",
    "resistances",
    "globalDamageBonus",
    "typeDamageBonus",
    "formDamageBonus",
    "skillDamageBonus",
  ] as const)
    delete this.player[key];
  for (const n of this.player.picks) {
    const talent = UPGRADES.find((u) => u.n === n);
    if (!talent) throw new Error(`未知天赋: ${n}`);
    talent.f(this.player);
  }
  this.player.hp = Math.max(1, Math.min(hpBefore, this.player.maxhp));
}

export function learnTalent(this: GameCore, u: Talent) {
  // max 校验保留；hidden 只影响卡池投放，不影响直接学习（测试/宝箱链路）
  if ((this.player.upCounts[u.n] || 0) >= u.max) return false;
  u.f(this.player);
  this.player.upCounts[u.n] = (this.player.upCounts[u.n] || 0) + 1;
  this.player.picks.push(u.n);
  return true;
}
export function openLevelPanel(this: GameCore) {
  if (this.bpMode) return;
  this.bpMode = "level";
  this.slots = this.rollPicks().map((u) => ({ u, used: false }));
  this.view.level();
}
export function refreshSlot(this: GameCore, index: number) {
  this.ensurePlay(); // Issue #34
  const slot = this.slots[index];
  if (this.state !== "play" || this.bpMode !== "level" || !slot || slot.used)
    return false;
  slot.used = true;
  const next = this.rollOne(
    this.slots.filter((_, i) => i !== index).map((s) => s.u.n),
  );
  if (next) slot.u = next;
  this.view.level();
  this.audio.beep(500, 0.06, "square", 0.04, 150);
  return true;
}
/**
 * 宝箱候选（#15 方案 C）：只从**已学且未满级**的天赋里抽 3 个不同项。
 * 用确定性伪随机而非 Math.random —— 开箱可能发生在 parity 模拟的采集阶段，
 * 消耗随机数会让后续对照分叉。
 */
export function rollBoxPicks(this: GameCore) {
  const pool = UPGRADES.filter((u) => {
    const lv = this.player.upCounts[u.n] || 0;
    return lv > 0 && lv < u.max;
  });
  const picks: Talent[] = [];
  const seed = this.kills * 7.77 + this.waveN * 3.13;
  while (picks.length < 3 && pool.length) {
    const idx = Math.floor(hash01(seed, picks.length * 17.3) * pool.length);
    picks.push(pool.splice(idx, 1)[0]);
  }
  return picks;
}
export function openBoxPanel(this: GameCore) {
  if (this.bpMode) return;
  const picks = this.rollBoxPicks();
  if (!picks.length) {
    // Issue #71：无可强化项（一个都没学，或全部满级）→ 全部剩余点数转为经验 + 血包
    this.drainBoxPicks();
    if (this.wavePhase === "rest") this.view.rest();
    return;
  }
  this.bpMode = "box";
  this.slots = picks.map((u) => ({ u, used: false }));
  this.view.level();
}
export function chooseSlot(this: GameCore, index: number) {
  this.ensurePlay(); // Issue #34
  const slot = this.slots[index];
  if (this.state !== "play" || !slot) return false;

  // ---- 宝箱：强化已学天赋 ----
  if (this.bpMode === "box") {
    if (this.boxPicks <= 0 || !this.learnTalent(slot.u)) return false;
    this.boxPicks--;
    this.audio.beep(880, 0.12, "square", 0.07, 300);
    if (this.boxPicks > 0) {
      this.slots = this.rollBoxPicks().map((u) => ({ u, used: false }));
      // Issue #71：重抽为空（可强化项耗尽）→ 剩余点数转为经验+血包并收尾
      if (!this.slots.length) {
        this.drainBoxPicks();
        this.bpMode = null;
        this.slots = [];
      }
    } else {
      this.bpMode = null;
      this.slots = [];
    }
    this.view.level();
    return true;
  }

  // ---- 升级：三选一 ----
  if (
    this.bpMode !== "level" ||
    this.pendingLevels <= 0 ||
    !this.learnTalent(slot.u)
  )
    return false;
  this.pendingLevels--;
  this.audio.beep(880, 0.12, "square", 0.07, 300);
  if (this.pendingLevels > 0)
    this.slots = this.rollPicks().map((u) => ({ u, used: false }));
  else {
    this.bpMode = null;
    this.slots = [];
  }
  this.view.level();
  return true;
}

export function rollPicks(this: GameCore) {
  const avail = UPGRADES.filter(this.canOffer);
  const w = this.tierWeights();
  const picks: Talent[] = [];
  for (let i = 0; i < 3; i++) {
    let cand = null;
    // 按稀有度权重抽档位，档内随机；该档抽空则重抽
    for (let tries = 0; tries < 12 && !cand; tries++) {
      const t = this.pickTier(w);
      const pool = avail.filter((u) => u.t === t && !picks.includes(u));
      if (pool.length) cand = pool[Math.floor(Math.random() * pool.length)];
    }
    if (!cand) {
      const rest = avail.filter((u) => !picks.includes(u));
      if (!rest.length) break;
      cand = rest[Math.floor(Math.random() * rest.length)];
    }
    picks.push(cand);
  }
  // 三选一里保证至少一个伤害系天赋（遵守稀有度权重，低级优先——修复低等级刷出传奇的bug）
  if (picks.length === 3 && !picks.some((u) => DMG_POOL.includes(u.n))) {
    const dpool = avail.filter(
      (u) => DMG_POOL.includes(u.n) && !picks.includes(u),
    );
    if (dpool.length) {
      const w = this.tierWeights();
      let cand = null;
      for (let tries = 0; tries < 12 && !cand; tries++) {
        const t = this.pickTier(w);
        const pool = dpool.filter((u) => u.t === t);
        if (pool.length) cand = pool[Math.floor(Math.random() * pool.length)];
      }
      if (!cand) cand = dpool.sort((a, b) => a.t - b.t)[0];
      picks[Math.floor(Math.random() * 3)] = cand;
    }
  }
  return picks;
}

export function rollOne(this: GameCore, exclude: string[]) {
  const avail = UPGRADES.filter(
    (u) => this.canOffer(u) && !exclude.includes(u.n),
  );
  if (!avail.length) return null;
  const w = this.tierWeights();
  for (let tries = 0; tries < 12; tries++) {
    const t = this.pickTier(w);
    const pool = avail.filter((u) => u.t === t);
    if (pool.length) return pool[Math.floor(Math.random() * pool.length)];
  }
  return avail[Math.floor(Math.random() * avail.length)];
}
