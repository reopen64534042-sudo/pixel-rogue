import { hash01 } from "../data/constants";
import { statBase } from "../data/stats";
import { LEGACY_UPGRADES, RAMP, UPGRADES } from "../data/talents";
import type { GameCore } from "./GameCore";
import { chooseMageElement, mageElementPickSlots } from "./MageProgressionSystem";
import { applyOnAcquireEffect } from "./OnAcquireEffects";
import {
  captureRuntimeState,
  effectiveCaps,
  reconcileRuntimeToCaps,
  restoreRuntimeState,
} from "./RuntimeStateProtection";
import { attributeModifiers } from "./AttributeSources";
import { applyTalentStatProjection } from "./TalentStatSources";
import type { Talent } from "./types";
export function tierWeights(this: GameCore) {
  // S2：按**波次**分档（v40 按 player.lvl）。见 data/talents/common.ts 的 RAMP 注释。
  let w = RAMP[0].w;
  for (const r of RAMP) if (this.waveN >= r.min) w = r.w;
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

/**
 * 熔炉专用候选池（历史兼容）。
 *
 * v165 旧表已全部删除，本池为空；熔炉入口（`SWAP_ENTRY_ENABLED`）自 v60 关闭，
 * 保留函数只为既有 SwapSystem / melt 调用链与测试编译，不再提供可产出的旧卡。
 */
export function legacyAvailTalents(this: GameCore, t: number) {
  return LEGACY_UPGRADES.filter(
    (u) =>
      // v165 后 LEGACY_UPGRADES 为空；保留过滤逻辑供未来池复用
      !u.hidden &&
      (this.player.upCounts[u.n] || 0) < u.max &&
      (!u.req || u.req(this.player)) &&
      u.t === t,
  );
}

export function canOffer(this: GameCore, u: Talent) {
  // retired / hidden：v165 已删除旧表与退役卡，保留判定防御异常数据。
  if (u.hidden || u.retired) return false;
  if ((this.player.upCounts[u.n] || 0) >= u.max) return false;
  if (u.req && !u.req(this.player)) return false;
  // S2：职业池归属。`common` 或未填 prof 的卡不受职业限制
  //（旧表已整体 hidden，实际不会再进池）。
  if (u.prof && u.prof !== "common" && u.prof !== this.prof) return false;
  // 战士开局流派：另一流派的卡不进本局池。
  if (
    u.warriorStyle &&
    (this.prof !== "warrior" || this.warriorStyle !== u.warriorStyle)
  )
    return false;
  if (u.prof === "shooter" && (u.shooterWeapon ?? "charged") !== this.shooterWeapon) return false;
  const picks = this.player.picks;
  // S2 链式依赖（混合式抽取）：未持有前置时 L2/L3 不进池。
  if (u.requires && !picks.includes(u.requires)) return false;
  // S2 互斥：双向判定——本卡声明的排斥 + 别处声明排斥本卡的。
  // 双向是必须的：只在单侧写 excludes 会让「先抽到 B 后 A 仍可抽」漏网。
  if (u.excludes?.some((n) => picks.includes(n))) return false;
  if (
    picks.length > 0 &&
    UPGRADES.some((o) => o.excludes?.includes(u.n) && picks.includes(o.n))
  )
    return false;
  // S2 变体组（N 选 1）：同组已取过任意一张则本卡不进池。
  // 与 excludes 的差别是规模可变，且语义上不是「相互排斥」而是「同一格位的不同实现」。
  // S3 豁免：若玩家持有某张卡的 `variantBypass` 指向本组，则该组不再排他
  //（旧法师元素/双修已退役，通用逻辑保留给未来职业池）。
  if (
    u.variant &&
    !picks.some((n) => {
      const card = UPGRADES.find((o) => o.n === n);
      return card?.variantBypass === u.variant;
    }) &&
    UPGRADES.some((o) => o.variant === u.variant && picks.includes(o.n))
  )
    return false;
  return true;
}

export function recompute(this: GameCore) {
  const hpBefore = this.player.hp;
  // Combat Foundation S4-C C3-B/C3-C（D-C3-02/03/04/06）：重建前捕获有效
  // 上限协调面（shieldMax/dashChargeMax/hasteCap——hasteCap 零级哨兵见模块）
  // 与 RuntimeState 全量白名单快照（15 字段）——运行状态重算保留现值：
  // 盾层/恢复倒计时（R-2 修复）、狂热 Buff（R-3 修复）、冲刺充能/冷却/
  // 进行中冲刺（D-C3-06）、meteorT/tempShield/ndUsed/orbA/hurtCd/dx/dy
  // （R-4 修复）
  const capsBefore = effectiveCaps(this.player);
  const runtime = captureRuntimeState(this.player);
  Object.assign(this.player, statBase(this.prof));
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
  // Combat Foundation S4-C C1/C2-A/C2-B/C3-A/C3-B/C3-C：已迁移天赋卡（C1 纯 flat
  // 五张 + C2-A 全局伤害三张 + C2-B 乘法属性五张 + C3-A 生命 flat 两张 +
  // C3-B 护盾容量一张 + C3-C 等级型六张）的属性由权威来源表解析投影，不经
  // talent.f 累积（这些卡的 f 是空操作）——单一权威来源，重算幂等零重复叠加。
  // C3-A（契约 v1.2 §10.8）：persistent **必传**当前实例的持久来源
  // （potionMaxHpGrow），杜绝漏传静默按 0 重建 maxHp 的 R-1 复活路径
  // S1：属性强化作为第二个来源并入同一次解析——另起一次投影会互相抹
  applyTalentStatProjection(
    this.player,
    {
      potionMaxHpGrow: this.potionMaxHpGrow,
    },
    attributeModifiers(this.attributePicks),
    this.prof,
    this.warriorStyle,
  );
  // C3-B/C3-C：属性重建完成后原样回写全部运行状态（不恢复资源、不刷新
  // 倒计时、不重放获得时效果），再按「上限降低」方向协调——置换移除层级
  // 使 shieldMax/dashChargeMax/hasteCap 下降时向下夹紧（haste 部分降级不
  // 刷新 hasteT、末级移除清空 Buff）；上限升高或不变时为无操作
  restoreRuntimeState(this.player, runtime);
  reconcileRuntimeToCaps(this.player, capsBefore, effectiveCaps(this.player));
  this.player.hp = Math.max(1, Math.min(hpBefore, this.player.maxhp));
}

export function learnTalent(this: GameCore, u: Talent) {
  // max 校验保留；hidden 只影响卡池投放，不影响直接学习（测试/宝箱链路）
  if ((this.player.upCounts[u.n] || 0) >= u.max) return false;
  // C3-A：记录获得前等级（OnAcquireEffect 判定依据；在 upCounts 递增前捕获，
  // 契约 §8.5）。max 校验失败/满级路径在此早退，不产生任何来源或治疗副作用
  const lvBefore = this.player.upCounts[u.n] || 0;
  // 未迁移卡保持旧时序：f 先执行、记录在后（本批两张生命卡 f 已空操作，
  // 属性与治疗分别由投影与 OnAcquireEffects 承接——不可调换为「记录 → 所有 f」）
  u.f(this.player);
  this.player.upCounts[u.n] = lvBefore + 1;
  this.player.picks.push(u.n);
  // S4-C C1/C2/C3-A：学习后同步已迁移卡的权威属性投影（幂等，只取决于 picks
  // 与实例持久来源；persistent 必传，理由同 recompute 处注释）
  // S1：同理必须带上属性来源，否则学一张卡就把属性加点抹掉
  applyTalentStatProjection(
    this.player,
    {
      potionMaxHpGrow: this.potionMaxHpGrow,
    },
    attributeModifiers(this.attributePicks),
    this.prof,
    this.warriorStyle,
  );
  // C3-A：获得时效果在投影**之后**执行（生命之泉回满依赖新有效 maxhp）；
  // 仅对已登记卡生效（未登记 no-op），melt 输出卡路径经本函数自动复用，
  // recompute 绝不经过此处（D-C3-02/03：重算不得重放获得时效果）
  applyOnAcquireEffect(u.n, this.player, lvBefore);
  return true;
}
export function openLevelPanel(this: GameCore) {
  if (this.bpMode) return;
  this.bpMode = "level";
  // 法杖 Lv1/3/6：强制元素选择优先于普通三选一。
  if (this.mageElementPickPending) {
    const slots = mageElementPickSlots(this);
    if (slots.length) {
      this.slots = slots;
      this.view.level();
      return;
    }
    // 兜底：三个元素都已持有却仍挂着待选（异常状态）→ 清掉标记继续普通流程。
    this.mageElementPickPending = null;
  }
  const picks = this.rollPicks();
  if (!picks.length) {
    if (this.pendingLevels <= 0) {
      this.bpMode = null;
      this.slots = [];
      this.view.level();
      return;
    }
    // 法师旧卡池耗尽（删除旧元素/反应卡后只剩 6 张保留卡）。
    // 把剩余天赋次数转成属性点，避免空面板卡死。
    const n = this.pendingLevels;
    this.pendingLevels = 0;
    this.attributePoints += n * 2;
    this.bpMode = null;
    this.slots = [];
    this.addText(
      this.player.x,
      this.player.y - 22,
      `天赋已尽 · 属性点 +${n * 2}`,
      "#ffd24a",
    );
    if (this.boxPicks > 0) this.openBoxPanel();
    else this.view.rest();
    return;
  }
  this.slots = picks.map((u) => ({ u, used: false }));
  this.view.level();
}
export function refreshSlot(this: GameCore, index: number) {
  this.ensurePlay(); // Issue #34
  const slot = this.slots[index];
  if (this.state !== "play" || this.bpMode !== "level" || !slot || slot.used)
    return false;
  slot.used = true;
  // 同时排除当前卡：旧逻辑只排除另外两张，刷新有概率抽回原卡，
  // 玩家看到的就是「点了刷新但卡没变」。
  const next = this.rollOne([
    ...this.slots.filter((_, i) => i !== index).map((s) => s.u.n),
    slot.u.n,
  ]);
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
    return !u.retired && lv > 0 && lv < u.max;
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

  // ---- 法杖 Lv1/3/6：元素选择（不消耗天赋次数）----
  if (this.mageElementPickPending) {
    if (this.bpMode !== "level" || !chooseMageElement(this, slot.u.n))
      return false;
    this.audio.beep(880, 0.12, "square", 0.07, 300);
    this.bpMode = null;
    this.slots = [];
    // 一波内连升时，选完当前元素后还有排队的下一次元素选择。
    if (this.mageElementPickPending || this.pendingLevels > 0)
      this.openLevelPanel();
    else this.view.level();
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
  // #136：开局天赋选完即解除模拟冻结（对局中升级此标记本就为 false，无副作用）
  this.startTalentPending = false;
  this.audio.beep(880, 0.12, "square", 0.07, 300);
  this.bpMode = null;
  this.slots = [];
  if (this.pendingLevels > 0) this.openLevelPanel();
  else this.view.level();
  return true;
}

export function rollPicks(this: GameCore) {
  if (this.prof === "shooter" && this.shooterWeapon === "missile" && this.player.picks.length === 0) {
    return ["猎杀信标", "蜂巢弹舱", "离子战斗部"].flatMap(name => {
      const card = UPGRADES.find(u => u.n === name);
      return card && this.canOffer(card) ? [card] : [];
    });
  }
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
  // 射手首抽保底：第一次三选一必含「快速装填」（核心穿透/衰减起点）；
  // 特殊弹节奏固定每 4 发，快速/超载不再改变计数。
  // 只替换最后一个槽位、不额外消耗随机数。
  if (this.prof === "shooter" && this.player.picks.length === 0) {
    const core = UPGRADES.find((u) => u.n === (this.shooterWeapon === "laser" ? "锁相" : "快速装填"));
    if (core && this.canOffer(core) && !picks.some((u) => u.n === core.n)) {
      if (picks.length >= 3) picks[picks.length - 1] = core;
      else picks.push(core);
    }
  }
  // S2：删除「三选一里保证至少一个伤害系天赋」的硬保底（DMG_POOL）。
  // 理由：新体系的天赋**不提供伤害**（伤害来自属性成长与职业基础形态），
  // 这条保底会把清场类机制卡强行塞进每一次三选一，破坏取舍；
  // 且它会消耗一次随机抽签，改变抽取序列。
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
