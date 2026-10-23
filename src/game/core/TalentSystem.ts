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
    (this.player.upCounts[u.n] || 0) < u.max && (!u.req || u.req(this.player))
  );
}

export function recompute(this: GameCore) {
  const hpBefore = this.player.hp;
  Object.assign(this.player, statBase());
  for (const n of this.player.picks) {
    const talent = UPGRADES.find((u) => u.n === n);
    if (!talent) throw new Error(`未知天赋: ${n}`);
    talent.f(this.player);
  }
  this.player.hp = Math.max(1, Math.min(hpBefore, this.player.maxhp));
}

export function learnTalent(this: GameCore, u: Talent) {
  if (!this.canOffer(u)) return false;
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
export function chooseSlot(this: GameCore, index: number) {
  const slot = this.slots[index];
  if (
    this.state !== "play" ||
    this.bpMode !== "level" ||
    this.pendingLevels <= 0 ||
    !slot ||
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
