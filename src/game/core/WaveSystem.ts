import { UPGRADES } from "../data/talents";
import { clearMissileTransient } from "./MissileSystem";
import { waveTheme } from "../data/enemies";
import { shieldRebuildSeconds } from "../data/warriorBalance";
import { resolveDifficulty } from "../data/difficulty";
import { attrPicksPerWave } from "./AttributeSystem";
import type { GameCore } from "./GameCore";
export function waveQuota(this: GameCore, n: number) {
  return Math.min(150, 20 + (n - 1) * 10);
}

/** 每波精英数量：4/8/12… 至少 1；12 波起 2、20 波起 3。 */
export function eliteQuotaForWave(n: number): number {
  return n >= 20 ? 3 : n >= 12 ? 2 : n % 4 === 0 ? 1 : 0;
}

export function startNextWave(this: GameCore) {
  this.ensurePlay(); // Issue #34
  if (
    this.state !== "play" ||
    this.wavePhase !== "rest" ||
    this.pendingLevels > 0
  )
    return false;
  this.bpMode = null;
  this.swapOpen = false;
  this.swTarget = 0;
  this.swSel = {};
  this.waveN++;
  const theme = waveTheme(this.waveN);
  this.themeGuarantee = theme.signature ?? null;
  // S2：每波重置节点天赋开关（同一波多只精英只发一次）
  this.waveTalentGiven = false;
  // S1：属性次数按波发放，波末消费
  // #134：换波清零单波额度，再走统一入口（基础额度与宝箱共享同一个 3 次上限）
  this.attrGrantedThisWave = 0;
  this.grantAttrPicks(attrPicksPerWave(this.waveN));
  this.beginWaveReport();
  this.quota = this.waveQuota(this.waveN);
  this.spawnedThisWave = 0;
  this.webZones = [];
  this.potionGrow = 0; // 血包转化计数每波重置，已获得的生命上限永久保留
  this.boxDropsThisWave = 0; // 宝箱掉落名额每波重置
  this.eliteBoxPointsThisWave = 0; // Issue #87：精英宝箱点数上限每波重置
  this.spawnCd = 1.2;
  this.wavePhase = "fight";
  this.state = "play";
  this.player.tempShield = this.player.barrierLv; // 壁垒: 每波临时护盾
  // 大剑护盾链：铁壁每波至少给 1 层护盾，额外层数靠充能补。
  if ((this.player.upCounts["铁壁"] || 0) > 0) {
    this.player.shield = Math.max(1, this.player.shield);
    this.player.shieldCd = shieldRebuildSeconds(this.player.upCounts);
  }
  this.player.ndUsed = false; // 不屈战魂: 每波重置
  this.warriorBloodDebtStacks = 0;
  this.warriorBloodDebtT = 0;
  this.swapUsedThisRest = false;
  const difficulty = resolveDifficulty(
    this.prof,
    this.waveN,
    this.qualityScore,
  );
  const difficultyText =
    difficulty.totalDr > 0.001
      ? ` · 难度减伤 ${Math.round(difficulty.totalDr * 100)}%`
      : "";
  this.addText(
    this.player.x,
    this.player.y - 18,
    `WAVE ${this.waveN} · ${theme.name}${difficultyText}`,
    "#ff5b5b",
    true,
  );
  this.audio.beep(160, 0.25, "sawtooth", 0.07, 60);
  return true;
}

export function cardsOfTier(this: GameCore, t: number) {
  let v = 0;
  for (const [n, lv] of Object.entries(this.player.upCounts)) {
    const u = UPGRADES.find((u) => u.n === n);
    if (u && u.t === t) v += lv;
  }
  return v;
}

export function enterRest(this: GameCore) {
  // 图鉴同步：放在两个早退之前，保证升级 / 宝箱面板还没走完时，本次进度也已记录。
  // 击杀记录只在消费成功后才清空；存储损坏时保留原数据，待下次同步重试。
  if (this.codex.syncEnemies(this.killLog)) this.killLog = {};
  this.codex.syncTalents(this.player.upCounts);
  this.wavePhase = "rest";
  this.bpMode = "rest";
  this.swapUsedThisRest = false;
  // S2 修订（用户反馈）：天赋改在**精英波的前一波结束**时发放。
  // 精英波是 4/8/12/16/20/24/28，所以在 3/7/11/15/19/23/27 波末给，
  // 让玩家**带着新天赋去打精英**（原实现是打死精英才给，奖励落在苦战之后）。
  // 开局另送 1 次（GameCore.startGame），一局仍是 8 次。
  // waveTalentGiven 防止 enterRest 因面板链早退后再次进入时重复发放
  //（waveN 在波末期间不变，没有这个开关会无限发）。
  if (this.waveN % 4 === 3 && !this.waveTalentGiven) {
    this.waveTalentGiven = true;
    this.pendingLevels++;
    this.addText(this.player.x, this.player.y - 26, "天赋 +1", "#ffd24a");
  }
  // S2：宝箱改为「属性选择次数」。
  // 天赋已是一次性获得（max=1），原来的「宝箱强化已学天赋」没有对象可强化，
  // 且 rollBoxPicks 的 `lv > 0 && lv < max` 会恒假——不报错，只会静默退化成
  // 「转经验 + 血包」（Issue #71 兜底）。在属性阶段之前折算，属性面板一次拿到
  // 全部次数，休整链保持「属性 → 天赋 → 报告」三步。
  if (this.boxPicks > 0) {
    // #134：宝箱也走统一入口，受单波额度约束（基础 + 宝箱合计 ≤ 3）
    const granted = this.grantAttrPicks(this.boxPicks);
    const lost = this.boxPicks - granted;
    this.addText(
      this.player.x,
      this.player.y - 20,
      lost > 0 ? `宝箱 +${granted} 次属性（本波已满）` : `宝箱 +${granted} 次属性`,
      "#ffd24a",
    );
    this.boxPicks = 0;
  }
  // v139：精英波（4/8/12/16/20/24/28）额外给 1 次属性消费额度，
  // 让升级点有出口、不长期堆积；额度与精英刷新规则共用同一函数。
  if (
    eliteQuotaForWave(this.waveN) > 0 &&
    this.attrMilestoneWave !== this.waveN
  ) {
    this.attrMilestoneWave = this.waveN;
    this.attrPicks += 1;
    this.addText(
      this.player.x,
      this.player.y - 24,
      `精英波 · 属性额度 +1`,
      "#ffd24a",
    );
  }
  // Issue #67：休整面板依次执行——升级 → 宝箱 → 报告/置换
  // S1：属性选择排在最前（高频低决策的先做，且它可能要连选多次）
  if (this.attributePoints > 0 && this.attrPicks > 0) {
    this.bpMode = null;
    this.openAttrPanel();
    return;
  }
  if (this.pendingLevels > 0) {
    this.bpMode = null;
    this.openLevelPanel();
    return;
  }
  if (this.boxPicks > 0) {
    this.bpMode = null;
    this.openBoxPanel();
    return;
  }
  this.showRestBar();
}

export function updateWave(this: GameCore, dt: number) {
  // v83：教程练习场冻结波次，不刷怪、不结算、不进入休整。
  if (this.tutorialMode) return;
  // ---- 波次推进: 刷满配额且全部清空才算过波 ----
  if (this.wavePhase === "fight") {
    if (this.spawnedThisWave < this.quota) {
      this.spawnCd -= dt;
      if (this.spawnCd <= 0 && this.enemies.length < 160) {
        this.spawnCd = Math.max(0.32, 1.2 - this.waveN * 0.07);
        // Issue #48：12 波起每波 2 只 BOSS，20 波起 3 只（此前每 4 波 1 只）
        const eliteQuota = eliteQuotaForWave(this.waveN);
        const isElite = this.spawnedThisWave < eliteQuota;
        if (isElite) {
          this.spawnEnemy("brute", true);
          this.spawnedThisWave++;
        } else {
          const batch = this.waveN >= 5 ? 2 : 1;
          for (let i = 0; i < batch && this.spawnedThisWave < this.quota; i++) {
            // 波次主题首次出现时，先保证刷出一只主题怪；之后回到权重抽取。
            const forced = this.themeGuarantee;
            this.spawnEnemy(forced ?? undefined);
            this.themeGuarantee = null;
            this.spawnedThisWave++;
          }
        }
      }
    } else if (this.enemies.length === 0 && !this.warriorLeapState) {
      // 本波怪清空 → 收尾: 先吸经验球、选完升级，再收宝箱，最后休整
      this.wavePhase = "collect";
      if (this.prof === "shooter" && this.shooterWeapon === "missile") clearMissileTransient(this, false, true);
      this.gems.forEach((g) => (g.auto = true));
      this.boxes.forEach((b) => (b.auto = true)); // 未拾取的宝箱自动飞向玩家
      this.audio.beep(520, 0.2, "triangle", 0.06, 180);
    }
  } else if (this.wavePhase === "collect") {
    // Issue #67：经验球与宝箱收齐即进休整（升级/宝箱面板在休整中依次执行）
    if (this.gems.length === 0 && this.boxes.length === 0) this.enterRest();
  }
}
