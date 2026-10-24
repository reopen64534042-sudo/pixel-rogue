import { AudioService } from "../../services/AudioService";
import { StorageService } from "../../services/StorageService";
import { WORLD } from "../data/constants";
import { statBase } from "../data/stats";
import {
  addText,
  applyBurnDot,
  damagePlayer,
  hurtEnemy,
  killEnemy,
} from "./CombatSystem";
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
  chainCd = 0;
  wavePhase: WavePhase = "fight";
  waveN = 1;
  quota = 20;
  spawnedThisWave = 0;
  /** 本波已由满血血包转化的最大生命点数（换波清零，加成本身永久保留） */
  potionGrow = 0;
  /** 本波普通怪已掉落的宝箱数（精英宝箱不占此名额） */
  boxDropsThisWave = 0;
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
  view: GameView = silentView;
  constructor(
    public audio = new AudioService(),
    public storage = new StorageService(),
  ) {
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
    this.boxDropsThisWave = 0;
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
    this.view.reset();
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
  /** Issue #34：底部面板(Z:11/12)会压住属性面板(Z:10)——
   *  面板命令入口先自动关闭属性面板，保证底部面板按钮始终可用。 */
  ensurePlay() {
    if (this.state === "stats") this.toggleStats();
  }
  toggleStats() {
    if (this.state === "play") {
      this.state = "stats";
      this.view.stats(true);
    } else if (this.state === "stats") {
      this.state = "play";
      this.view.stats(false);
    }
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
    this.view.over();
    this.audio.overCue();
  }
}
