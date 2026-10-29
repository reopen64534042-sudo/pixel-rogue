import { AudioService } from "../../services/AudioService";
import { StorageService } from "../../services/StorageService";
import { CodexStore, type CodexStorage } from "../codex/CodexStore";
import { CodexSystem } from "../codex/CodexSystem";
import { WORLD } from "../data/constants";
import { DEFAULT_KEYBINDS, type KeyBindings } from "../data/keybindings";
import { statBase } from "../data/stats";
import type { SpecialUpgradeId } from "../data/specialShot";
import {
  addText,
  applyBurnDot,
  applyBurnGroundDot,
  damagePlayer,
  hurtEnemy,
  killEnemy,
} from "./CombatSystem";
import type { AttributePoint } from "./AttributeSources";
import {
  attrPicksPerWave,
  grantAttrPicks,
  chooseAttr,
  openAttrPanel,
  refreshAttr,
  type AttrChoice,
} from "./AttributeSystem";
import { nearestEnemy, spawnEnemy } from "./EnemySystem";
import { updateMageElements } from "./ElementSystem";
import {
  interruptMageCast,
  triggerMirrorDecoy,
  triggerPhaseEscape,
  updateMageCasting,
} from "./MageSystem";
import { meleeSwing } from "./MeleeSystem";
import { gainSpecialXp } from "./SpecialSystem";
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
  legacyAvailTalents,
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
  MageCastPhase,
  MageDecoy,
  MageDomain,
  MageMeteor,
  Meteor,
  Missile,
  Mode,
  Panel,
  Particle,
  Player,
  Point,
  Profession,
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
  burnZones: {
    x: number;
    y: number;
    R: number;
    t: number;
    dps?: number;
    /** 导弹残留：每 0.5 秒把累计伤害合并成一次飘字 */
    showDamage?: boolean;
    tickT?: number;
    tickDmg?: number;
  }[] = [];
  /**
   * S2「贯穿轨迹」：子弹路径上留下的能量线。
   * 每个 zone 只对一个敌人结算一次（`hit` 记录），存活 0.6 秒。
   */
  trailZones: {
    x: number;
    y: number;
    R: number;
    t: number;
    dmg: number;
    hit: Enemy[];
    lifestealMul?: number;
  }[] = [];
  /** S2「疾行」：冲刺结束后的射速加成剩余时间（秒）。 */
  dashFireBoostT = 0;
  /** 「冲刺强射」：冲刺结束后所有射击变为强化箭的剩余时间（秒）。 */
  dashSpecialT = 0;
  /**
   * S2 射手「生存」槽的闪避窗口状态。
   *
   * 都放在 GameCore 而不是 Player：它们是**计时/一次性标记**，不是属性。
   * 放进 Player 会被 `recompute` 的 `Object.assign(statBase())` 抹掉，
   * 或者被迫进 RuntimeStateProtection 白名单——两者都会让「闪避后下一击」
   * 这类一次性语义在重算时产生歧义。
   */
  /** 「冷读」：闪避后的一次性必暴，命中即消费。 */
  dodgeNextCrit = false;
  /** 「余韵」：闪避后的一次性伤害倍率，用掉即重置为 1。 */
  dodgeNextDmg = 1;
  /** 「赌命」：闪避后的全必暴窗口剩余秒数（2s；生命 <30% 时为 4s）。 */
  dodgeProcT = 0;
  /** 「滞空」：闪避后的移速加成剩余秒数。 */
  dodgeBoostT = 0;
  /** S2「惊弓」：接触弹开的冷却剩余秒数。 */
  contactKnockCd = 0;
  /** S2「逆矢」：近身反击的冷却剩余秒数。 */
  counterCd = 0;
  /**
   * S2：本波是否已经发过节点天赋。
   *
   * 天赋改由「每 4 波 + 终局」的**节点精英**发放，一局 8 次。用每波一个开关
   * 保证同一波只发一次（该波有多只精英时，只有第一只算节点）。
   */
  waveTalentGiven = false;
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
  /** 导弹升级：独立飞行的追踪弹 */
  missiles: Missile[] = [];
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
   * #136：开局天赋尚未选定。为 true 期间 `step()` 冻结整个模拟
   * （选完天赋才开始游戏）；由 `chooseSlot` 成功后清除。
   */
  startTalentPending = false;
  /**
   * S1：本局已选的属性强化（来源，不是缓存）。`recompute` 每次由它重建
   * 属性修饰符——禁止在此基础上维护累加值，否则重算会重放两次。
   * 空数组时属性零贡献，行为与改动前完全一致。
   */
  attributePicks: AttributePoint[] = [];
  /**
   * S3：当前职业池。
   *
   * S2 只有射手，职业被硬编码；S3 起开局可选「射手 / 法师」，
   * 由 `startGame(prof)` 写入。`canOffer` 用它过滤职业卡。
   *
   * 战士（`"warrior"`）尚未实现，**没有对应的卡池**——开放选择前必须先有池子，
   * 否则玩家会选到一个空池职业。
   */
  prof: Profession = "shooter";
  /* —— S3 法师池运行态 ——
   *
   * 全部放 GameCore 而不是 Player：`recompute` 会用
   * `Object.assign(player, statBase())` 重建 Player，计时与标记类状态
   * 放进去会被抹掉。先例：射手池的 dodgeNextCrit / contactKnockCd。
   */
  /** 施法阶段：idle / windup（抬手，可打断）/ cast（收束，不可打断）。 */
  castPhase: MageCastPhase = "idle";
  /** 当前施法段的剩余时间（秒）。 */
  castT = 0;
  /** 施法间隔倒计时（秒）。 */
  castCd = 0;
  /** 本次法阵的落点（起手时固化）。 */
  castX = 0;
  castY = 0;
  /**
   * 站定判定：最后一次「玩家位置发生变化」的时刻（秒）。
   *
   * 判定看的是前摇**最后一段**（`steadyHoldRatio × 前摇总长`）是否静止，
   * 而不是整段前摇——玩家可以边跑边施法，在读数临近完成时急停吃加成。
   */
  mageLastMoveAt = -1e9;
  /** 上一帧玩家位置：用来检测「这一帧有没有移动」。 */
  magePrevX = 0;
  magePrevY = 0;
  /**
   * 开发者无敌（仅 DEV 作弊面板使用）。
   *
   * 消费点在 `damagePlayer` 的最前面，并用 `import.meta.env.DEV` 门控：
   * 生产构建下条件恒假、整段被 tree-shake。跨重开保留（属于开发设置，
   * 不是局内状态），`resetGame` 不重置它。
   */
  devInvincible = false;
  /**
   * 开发者复活（仅 DEV）：开启后死亡不结束本局，按当前波满血复活；
   * 天赋、属性、等级等构筑原样保留。跨重开保留（属于开发设置）。
   */
  devRevive = false;
  /** 充能条：每 MB.chargeFull 次成功施法满一次，满时结算循环轴。 */
  mageCharge = 0;
  /** 满充能触发后「三格全亮」的剩余时间（秒）——读条旁 1→2→3 的计数反馈。 */
  mageChargeFlashT = 0;
  /** 值型限时护盾现值（与既有层数制护盾是两套模型）。 */
  mageShield = 0;
  /** 值型限时护盾剩余时间（秒）。 */
  mageShieldT = 0;
  /** 值型护盾本次计时的总时长（秒）：绘制剩余时间弧的基准。 */
  mageShieldMaxT = 0;
  /** 「相位」冷却剩余秒数。 */
  magePhaseCd = 0;
  /** 「镜像」冷却剩余秒数。 */
  mageMirrorCd = 0;
  /** 「镜像」虚影剩余秒数（期间不可受击、无视碰撞、不能施法）。 */
  magePhaseT = 0;
  /** 「镜像」残影（吸引仇恨的诱饵）。 */
  mageDecoys: MageDecoy[] = [];
  /** 路线B「星陨」：待爆裂的陨星。 */
  mageMeteors: MageMeteor[] = [];
  /** 路线B「元素残域」：持续伤害领域。 */
  mageDomains: MageDomain[] = [];
  /** 路线B「星陨」的下一次落下倒计时（秒）。 */
  mageMeteorT = 0;
  /**
   * 双修/三修的元素补选期：选到卡后强制补选第二/第三个元素，
   * 选完才继续剩余的升级/宝箱链。
   */
  mageElementPickPending: "second" | "third" | null = null;
  /**
   * S1：本波剩余的可选次数（波次发放，波末消费）。为 0 时属性面板不出现。
   * 不进 parity 快照白名单：它只驱动面板流程，不参与任何数值计算。
   */
  attrPicks = 0;
  /**
   * 本波已经**发放**的属性选择次数（#134 方案 B）。
   *
   * 用来把单波新增额度压在 `ATTR_WAVE_GRANT_CAP` 以内——基础额度与宝箱折算
   * 两个来源共享同一个额度池。换波时清零（`startNextWave`）。
   * `attrPicks` 本身仍是累加的，未用完的次数照旧可以留到下次。
   */
  attrGrantedThisWave = 0;
  /** 当前展示的四格候选（输出/生存/续航/功能 各一个） */
  attrChoices: AttrChoice[] = [];
  /** 本「次选择」的刷新额度是否已用掉（每次选择各有一次，选完重置） */
  attrRefreshUsed = false;
  chainCd = 0;
  /** 射手职业被动：普通射击计数，每第 3 次触发强化箭 */
  shotCounter = 0;
  /** 强化箭等级/经验/已获得升级（一局内成长，resetGame 重置） */
  specialLevel = 1;
  specialXp = 0;
  specialUpgrades: SpecialUpgradeId[] = [];
  /** 激光升级的短寿命表现层 */
  lasers: { x1: number; y1: number; x2: number; y2: number; t: number }[] = [];
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
    cast: 0,
    element: 0,
    reaction: 0,
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
    cast: 0,
    element: 0,
    reaction: 0,
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
  /** 键位设置（v79）：GameUI 启动时从 localStorage 载入；resetGame 不重置。 */
  keybinds: KeyBindings = { ...DEFAULT_KEYBINDS };
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
  legacyAvailTalents = legacyAvailTalents.bind(this);
  canOffer = canOffer.bind(this);
  recompute = recompute.bind(this);
  rollPicks = rollPicks.bind(this);
  rollBoxPicks = rollBoxPicks.bind(this);
  rollOne = rollOne.bind(this);
  learnTalent = learnTalent.bind(this);
  openLevelPanel = openLevelPanel.bind(this);
  openBoxPanel = openBoxPanel.bind(this);
  openAttrPanel = openAttrPanel.bind(this);
  grantAttrPicks = grantAttrPicks.bind(this);
  refreshAttr = refreshAttr.bind(this);
  chooseAttr = chooseAttr.bind(this);
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
  // S3 法师池：施法状态机、元素状态、以及「脱离」槽的两个触发器。
  // 后两者由 CombatSystem.damagePlayer 调用——CombatSystem 不 import
  // MageSystem（避免运行时循环），统一走 GameCore 上的方法引用。
  updateMageCasting = updateMageCasting.bind(this);
  updateMageElements = updateMageElements.bind(this);
  interruptMageCast = interruptMageCast.bind(this);
  triggerPhaseEscape = triggerPhaseEscape.bind(this);
  triggerMirrorDecoy = triggerMirrorDecoy.bind(this);
  addText = addText.bind(this);
  damagePlayer = damagePlayer.bind(this);
  gainSpecialXp = gainSpecialXp.bind(this);
  update = update.bind(this);
  waveQuota = waveQuota.bind(this);
  startNextWave = startNextWave.bind(this);
  cardsOfTier = cardsOfTier.bind(this);
  enterRest = enterRest.bind(this);
  resetGame(prof: Profession = "shooter") {
    // S3：职业必须在重建 Player 之前确定——属性投影以 statBase(prof) 重建，
    // 法师的施法速度/施法距离来自职业 base。
    this.prof = prof;
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
      ...statBase(prof),
    };
    this.player.hp = this.player.maxhp;
    this.enemies = [];
    this.bullets = [];
    this.gems = [];
    this.potions = [];
    this.boxes = [];
    this.burnZones = [];
    this.trailZones = [];
    this.dashFireBoostT = 0;
    this.dashSpecialT = 0;
    this.dodgeNextCrit = false;
    this.dodgeNextDmg = 1;
    this.dodgeProcT = 0;
    this.dodgeBoostT = 0;
    this.contactKnockCd = 0;
    this.counterCd = 0;
    // S2：精英天赋发放（每波一次）
    this.waveTalentGiven = false;
    this.parts = [];
    this.texts = [];
    this.meteors = [];
    this.missiles = [];
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
    this.startTalentPending = false;
    // S3 法师池运行态归零
    this.castPhase = "idle";
    this.castT = 0;
    this.castCd = 0;
    this.castX = 0;
    this.castY = 0;
    this.mageLastMoveAt = -1e9;
    this.magePrevX = this.player.x;
    this.magePrevY = this.player.y;
    this.mageCharge = 0;
    this.mageChargeFlashT = 0;
    this.mageShield = 0;
    this.mageShieldT = 0;
    this.mageShieldMaxT = 0;
    this.magePhaseCd = 0;
    this.mageMirrorCd = 0;
    this.magePhaseT = 0;
    this.mageDecoys = [];
    this.mageMeteors = [];
    this.mageDomains = [];
    this.mageMeteorT = 0;
    this.mageElementPickPending = null;
    // S1：属性选择按波发放（本波次数在波末消费），新局从第 1 波的额度开始
    this.attributePicks = [];
    // #134：走统一入口，让「第 1 波基础额度」也受单波上限约束
    this.attrPicks = 0;
    this.attrGrantedThisWave = 0;
    this.grantAttrPicks(attrPicksPerWave(1));
    this.attrChoices = [];
    this.attrRefreshUsed = false;
    this.chainCd = 0;
    this.shotCounter = 0;
    this.specialLevel = 1;
    this.specialXp = 0;
    this.specialUpgrades = [];
    this.lasers = [];
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
      cast: 0,
      element: 0,
      reaction: 0,
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
  /**
   * 开局。
   *
   * @param prof 职业（S3 起可选射手 / 法师）。职业在 `resetGame(prof)` 里
   * 写定——`view.started()` 的 `openLevelPanel` 会立刻按 `this.prof` 过滤
   * 卡池，职业必须先定，否则第一批卡是按上一个职业抽的；Player 的
   * 施法速度/施法距离 base 也随职业重建。
   */
  startGame(prof?: Profession) {
    this.resetGame(prof ?? "shooter");
    this.state = "play";
    // S2 修订（用户反馈）：开局送 1 次天赋，让第 1 波起就有一次成长。
    // **必须在 view.started() 之前记账**：面板是 UI 在 started 回调里按
    // pendingLevels 打开的，写在后面会让回调读到 0、面板根本不弹
    //（已验证踩坑：测试全绿但功能未生效，靠截图才发现）。
    // 也不在这里直接调 openLevelPanel：那会走 rollPicks 消耗 Math.random，
    // 把基于种子的确定性测试与 parity 全部打乱。
    // 其余 7 次在 3/7/11/15/19/23/27 波末发放（见 WaveSystem.enterRest）。
    this.pendingLevels = 1;
    this.startTalentPending = true; // #136：选完天赋才开跑（step 冻结）
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
    // #136：开局天赋未选定时冻结整个模拟——选完天赋才开始游戏。
    // 局中升级/报告/熔炉面板的「非暂停」语义不变（v14 设计）。
    if (
      this.state === "play" &&
      !(this.startTalentPending && this.bpMode === "level")
    )
      this.update(dt);
  }
  showRestBar() {
    this.view.rest();
  }
  /**
   * DEV 复活：保留本局构筑（天赋/属性/等级），清场后从当前波重新开始。
   * 只由 `gameOver` 在 `devRevive` 开启时调用；不写战绩。
   */
  private devReviveRun() {
    const wave = Math.max(1, this.waveN);
    this.enemies = [];
    this.ebullets = [];
    this.bullets = [];
    this.gems = [];
    this.boxes = [];
    this.potions = [];
    this.meteors = [];
    this.burnZones = [];
    this.trailZones = [];
    this.mageMeteors = [];
    this.mageDomains = [];
    this.mageDecoys = [];
    this.parts = [];
    this.texts = [];
    this.slashes = [];
    this.bolts = [];
    this.castPhase = "idle";
    this.castT = 0;
    this.castCd = 0;
    this.mageMeteorT = 0;
    this.magePhaseT = 0;
    this.pendingLevels = 0;
    this.startTalentPending = false;
    this.bpMode = null;
    this.state = "play";
    this.wavePhase = "rest";
    this.waveN = wave - 1;
    this.player.hp = this.player.maxhp;
    this.player.hurtCd = Math.max(this.player.hurtCd, 1.5);
    this.addText(this.player.x, this.player.y - 26, "复活", "#57e86b", true);
    this.audio.beep(660, 0.18, "sine", 0.06, 300);
    this.startNextWave();
  }

  gameOver() {
    if (this.state === "over") return;
    // DEV-only：允许复活时拦截死亡，保留本局构筑并重开当前波。
    if (import.meta.env.DEV && this.devRevive) {
      this.devReviveRun();
      return;
    }
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
