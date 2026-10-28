import { AudioService } from "../../services/AudioService";
import { StorageService } from "../../services/StorageService";
import { CodexStore, type CodexStorage } from "../codex/CodexStore";
import { CodexSystem } from "../codex/CodexSystem";
import { WORLD } from "../data/constants";
import { statBase } from "../data/stats";
import {
  addText,
  applyBurnDot,
  applyBurnGroundDot,
  damagePlayer,
  hurtEnemy,
  killEnemy,
} from "./CombatSystem";
import type { AttributePoint } from "./AttributeSources";
import { nearestEnemy, spawnEnemy } from "./EnemySystem";
import { meleeSwing } from "./MeleeSystem";
import { update } from "./Simulation";
import {
  melt,
  openSwap,
  selectedCount,
  selectMaterial,
  setSwapTarget,
} from "./SwapSystem";
import {
  availTalents,
  canOffer,
  chooseSlot,
  learnTalent,
  openBoxPanel,
  openLevelPanel,
  pickTier,
  recompute,
  refreshSlot,
  rollBoxPicks,
  rollOne,
  rollPicks,
  tierWeights,
} from "./TalentSystem";
import type {
  Bolt,
  Box,
  Bullet,
  DamageTotals,
  Enemy,
  EnemyBullet,
  FloatingText,
  GameState,
  GameView,
  Gem,
  Meteor,
  Mode,
  Panel,
  Particle,
  Player,
  Point,
  Slash,
  Slot,
  WavePhase,
} from "./types";
import { silentView } from "./types";
import { cardsOfTier, enterRest, startNextWave, waveQuota } from "./WaveSystem";
export class GameCore {
  state: Mode = "start";
  player!: Player;
  enemies: Enemy[] = [];
  bullets: Bullet[] = [];
  ebullets: EnemyBullet[] = [];
  gems: Gem[] = [];
  potions: Point[] = [];
  boxes: Box[] = [];
  /** Issue #45：焦土燃烧地带 */
  burnZones: { x: number; y: number; R: number; t: number }[] = [];
  /** Issue #71：剩余宝箱点数转为经验 + 血包（无强化项时的兜底） */
  drainBoxPicks() {
    while (this.boxPicks > 0) {
      this.boxPicks--;
      this.player.xp += 8;
      this.potions.push({ x: this.player.x, y: this.player.y });
    }
    this.addText(
      this.player.x,
      this.player.y - 14,
      "剩余宝箱转为经验 + 血包",
      "#57e6ff",
    );
  }
  parts: Particle[] = [];
  texts: FloatingText[] = [];
  meteors: Meteor[] = [];
  bolts: Bolt[] = [];
  slashes: Slash[] = [];
  cam = { x: 0, y: 0 };
  time = 0;
  kills = 0;
  spawnCd = 1.2;
  shake = 0;
  hurtFlash = 0;
  pendingLevels = 0;
  /**
   * S1：本局已选的属性强化（来源，不是缓存）。`recompute` 每次由它重建
   * 属性修饰符——禁止在此基础上维护累加值，否则重算会重放两次。
   * 空数组时属性零贡献，行为与改动前完全一致。
   */
  attributePicks: AttributePoint[] = [];
  chainCd = 0;
  wavePhase: WavePhase = "fight";
  waveN = 1;
  quota = 20;
  spawnedThisWave = 0;
  /** 本波已由满血血包转化的最大生命点数（换波清零，加成本身永久保留） */
  potionGrow = 0;
  /**
   * Combat Foundation S4-C C3-A（D-C3-01）：满血血包永久 maxHp 成长的**实例级
   * 持久来源**（权威）。每波转化时累计，跨换波保留、仅 resetGame 重置；
   * 属性投影（TalentStatSources.applyTalentStatProjection）以本值参与 maxHp
   * 解析（base = statBase().maxhp + potionMaxHpGrow，只计一次）。Player 实体
   * 上的 maxhp 为兼容投影（转化处即时双写保持当帧读取行为），非持久来源。
   * 非 Player 字段：不进实体序列化（parity 快照不受影响，先例 potionGrow）。
   */
  potionMaxHpGrow = 0;
  /** 本波普通怪已掉落的宝箱数（精英宝箱不占此名额） */
  boxDropsThisWave = 0;
  /** 本波精英宝箱已贡献的强化点数（Issue #87：上限 ELITE_BOX_POINT_CAP，换波清零） */
  eliteBoxPointsThisWave = 0;
  /** 已拾取、待开启的宝箱数 */
  boxPicks = 0;
  dmgBy: DamageTotals = {
    bullet: 0,
    orbit: 0,
    chain: 0,
    meteor: 0,
    explode: 0,
    thorns: 0,
    burn: 0,
    shock: 0,
    melee: 0,
    reflect: 0,
  };
  private waveStartDamage: DamageTotals = {
    bullet: 0,
    orbit: 0,
    chain: 0,
    meteor: 0,
    explode: 0,
    thorns: 0,
    burn: 0,
    shock: 0,
    melee: 0,
    reflect: 0,
  };
  beginWaveReport() {
    this.waveStartDamage = { ...this.dmgBy };
  }
  waveDamage(): DamageTotals {
    const result = { ...this.dmgBy };
    for (const source of Object.keys(result) as (keyof DamageTotals)[])
      result[source] -= this.waveStartDamage[source];
    return result;
  }
  bpMode: Panel = null;
  swapUsedThisRest = false;
  swapOpen = false;
  slots: Slot[] = [];
  swTarget = 0;
  swSel: Record<string, number> = {};
  keys: Record<string, boolean> = {};
  /**
   * Issue #95：触控八向向量（取值只可能是 -1 / 0 / 1）。
   *
   * 刻意与 `keys` 分开：物理键盘的按下态和虚拟摇杆的当前方向必须能同时存在，
   * 合到同一张表里会互相覆盖（症状是松手后角色仍在走）。
   * 非触屏设备恒为 0，此时 `PlayerSystem` 走原键盘分支，行为与旧版逐字段一致。
   */
  moveX = 0;
  moveY = 0;
  /** Issue #95：触屏冲刺按住态，语义等同键盘空格（`keys[" "]`） */
  dashHeld = false;
  view: GameView = silentView;
  /** 图鉴：旁路观测状态，不参与模拟，也不在 parity 快照的字段白名单内 */
  codex!: CodexSystem;
  /**
   * 图鉴击杀计数（M4）：按**裸类型键**累计本局击杀（如 `slime`、`brute_elite`）。
   * 由 `CombatSystem.killEnemy` 写入，波末 / 局末由图鉴消费后清空。
   * 刻意做成普通字段而非图鉴 API —— 战斗系统因此完全不依赖 `CodexSystem`。
   */
  killLog: Record<string, number> = {};
  constructor(
    public audio = new AudioService(),
    public storage = new StorageService(),
    codexStore?: CodexStorage,
  ) {
    this.codex = new CodexSystem(new CodexStore(codexStore));
    this.codex.load();
    this.resetGame();
  }
  tierWeights = tierWeights.bind(this);
  pickTier = pickTier.bind(this);
  availTalents = availTalents.bind(this);
  canOffer = canOffer.bind(this);
  recompute = recompute.bind(this);
  rollPicks = rollPicks.bind(this);
  rollBoxPicks = rollBoxPicks.bind(this);
  rollOne = rollOne.bind(this);
  learnTalent = learnTalent.bind(this);
  openLevelPanel = openLevelPanel.bind(this);
  openBoxPanel = openBoxPanel.bind(this);
  refreshSlot = refreshSlot.bind(this);
  chooseSlot = chooseSlot.bind(this);
  openSwap = openSwap.bind(this);
  setSwapTarget = setSwapTarget.bind(this);
  selectedCount = selectedCount.bind(this);
  selectMaterial = selectMaterial.bind(this);
  melt = melt.bind(this);
  spawnEnemy = spawnEnemy.bind(this);
  nearestEnemy = nearestEnemy.bind(this);
  hurtEnemy = hurtEnemy.bind(this);
  killEnemy = killEnemy.bind(this);
  applyBurnDot = applyBurnDot.bind(this);
  applyBurnGroundDot = applyBurnGroundDot.bind(this);
  meleeSwing = meleeSwing.bind(this);
  addText = addText.bind(this);
  damagePlayer = damagePlayer.bind(this);
  update = update.bind(this);
  waveQuota = waveQuota.bind(this);
  startNextWave = startNextWave.bind(this);
  cardsOfTier = cardsOfTier.bind(this);
  enterRest = enterRest.bind(this);
  resetGame() {
    this.audio.cancelCues();
    this.player = {
      x: WORLD.w / 2,
      y: WORLD.h / 2,
      r: 4,
      hp: 100,
      lvl: 1,
      xp: 0,
      xpNext: 6,
      fireCd: 0,
      upCounts: {},
      picks: [],
      ...statBase(),
    };
    this.enemies = [];
    this.bullets = [];
    this.gems = [];
    this.potions = [];
    this.boxes = [];
    this.burnZones = [];
    this.parts = [];
    this.texts = [];
    this.meteors = [];
    this.bolts = [];
    this.slashes = [];
    this.ebullets = [];
    this.cam = { x: 0, y: 0 };
    this.time = 0;
    this.kills = 0;
    this.killLog = {};
    this.spawnCd = 1.2;
    this.shake = 0;
    this.hurtFlash = 0;
    this.pendingLevels = 0;
    this.chainCd = 0;
    this.wavePhase = "fight";
    this.waveN = 1;
    this.quota = this.waveQuota(1);
    this.spawnedThisWave = 0;
    this.potionGrow = 0;
    this.potionMaxHpGrow = 0; // C3-A：新游戏重置累计永久成长（D-C3-01/契约 §6 生命⑤）
    this.boxDropsThisWave = 0;
    this.eliteBoxPointsThisWave = 0;
    this.boxPicks = 0;
    this.dmgBy = {
      bullet: 0,
      orbit: 0,
      chain: 0,
      meteor: 0,
      explode: 0,
      shock: 0,
      reflect: 0,
      thorns: 0,
      burn: 0,
      melee: 0,
    };
    this.beginWaveReport();
    this.bpMode = null;
    this.swapUsedThisRest = false;
    this.swapOpen = false;
    this.swTarget = 0;
    this.swSel = {};
    this.slots = [];
    this.keys = {};
    this.moveX = 0;
    this.moveY = 0;
    this.dashHeld = false;
    this.statsFrom = "play";
    this.view.reset();
  }
  /**
   * Issue #95：写入触控方向。只接受八向量，防止上层误传模拟量
   * 悄悄改变移动规则（摇杆是离散八向，不是 360° 自由方向）。
   */
  setMoveAxis(x: number, y: number) {
    this.moveX = Math.max(-1, Math.min(1, Math.round(x)));
    this.moveY = Math.max(-1, Math.min(1, Math.round(y)));
  }
  /** Issue #95：触屏冲刺按住/松开 */
  setDashHeld(held: boolean) {
    this.dashHeld = held;
  }
  /** Issue #95：清空触控输入（失焦、切后台、进入非 play 状态时调用） */
  clearTouchInput() {
    this.moveX = 0;
    this.moveY = 0;
    this.dashHeld = false;
  }
  startGame() {
    this.resetGame();
    this.state = "play";
    this.view.started();
    this.audio.startCue();
  }
  togglePause() {
    if (this.state === "play") {
      this.state = "pause";
      this.view.paused(true);
    } else if (this.state === "pause") {
      this.state = "play";
      this.view.paused(false);
    }
  }
  /**
   * Issue #100：属性面板的来源层，决定关闭时回到哪里。
   * 从暂停进入的必须回暂停——玩家只是看一眼属性，返回却直接恢复战斗会挨打。
   * 该字段不进 parity 快照白名单，也不参与任何数值计算。
   */
  statsFrom: "play" | "pause" = "play";
  /** Issue #34：底部面板(Z:11/12)会压住属性面板(Z:10)——
   *  面板命令入口先自动关闭属性面板，保证底部面板按钮始终可用。 */
  ensurePlay() {
    // Issue #100：先复位来源，保持「面板命令强制回战斗态」的既有语义
    if (this.state === "stats") {
      this.statsFrom = "play";
      this.toggleStats();
    }
  }
  toggleStats() {
    if (this.state === "play") {
      this.statsFrom = "play";
      this.state = "stats";
      this.view.stats(true);
    } else if (this.state === "stats") {
      this.view.stats(false);
      if (this.statsFrom === "pause") {
        this.statsFrom = "play";
        this.state = "pause";
        this.view.paused(true);
      } else {
        this.state = "play";
      }
    }
  }
  /**
   * Issue #100：从暂停界面进入属性面板（触屏无 C 键时的唯一入口）。
   * 先收起暂停面板再开属性——`#ov-stats`(30) 低于 `#ov-pause`(60)，同时存在会被盖住。
   * @returns 是否进入成功（非暂停态直接拒绝）
   */
  openStatsFromPause(): boolean {
    if (this.state !== "pause") return false;
    this.statsFrom = "pause";
    this.state = "stats";
    this.view.paused(false);
    this.view.stats(true);
    return true;
  }
  get phase(): GameState {
    if (this.state !== "play") return this.state;
    if (this.bpMode === "level") return "levelup";
    if (this.wavePhase === "rest") return this.swapOpen ? "swap" : "report";
    return "play";
  }
  step(dt: number) {
    if (this.state === "play") this.update(dt);
  }
  showRestBar() {
    this.view.rest();
  }
  gameOver() {
    if (this.state === "over") return;
    this.state = "over";
    this.storage.append({
      d: Date.now(),
      t: Math.round(this.time),
      k: this.kills,
      lv: this.player.lvl,
      w: this.waveN,
      up: { ...this.player.upCounts },
      dmg: { ...this.dmgBy },
    });
    // 局末同步图鉴：与战绩写入同一收口，放在 append 之后避免影响其行为。
    if (this.codex.syncEnemies(this.killLog)) this.killLog = {};
    this.codex.syncTalents(this.player.upCounts);
    this.view.over();
    this.audio.overCue();
  }
}
