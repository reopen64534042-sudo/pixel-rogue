import { clearBossTransient } from "./BossSystem";
import { createLaserState, type LaserUpgradeId } from "../data/laser";
import { createMissileState } from "../data/missile";
import { createDomainState } from '../data/domain';
import { createDomainTutorialProgress } from '../data/domainTutorial';
import { clearDomainTransient, devSetDomainLevel } from './DomainSystem';
import { clearMissileTransient, devSetMissileLevel, missileDash } from "./MissileSystem";
import { devSetLaserLevel, laserDash } from "./LaserSystem";
import { AudioService } from "../../services/AudioService";
import { StorageService } from "../../services/StorageService";
import { CodexStore, type CodexStorage } from "../codex/CodexStore";
import { CodexSystem } from "../codex/CodexSystem";
import { WORLD } from "../data/constants";
import { DEFAULT_KEYBINDS, type KeyBindings } from "../data/keybindings";
import { statBase } from "../data/stats";
import type { SpecialUpgradeId } from "../data/specialShot";
import type {
  MageElement,
  MageUpgradeId,
  MageReactionId,
  MageSuit,
} from "../data/elementalMage";
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
  devConfigureElementalMage,
  devSetStaffLevel,
} from "./MageProgressionSystem";
import {
  interruptMageCast,
  triggerMirrorDecoy,
  triggerPhaseEscape,
  updateMageCasting,
} from "./MageSystem";
import { meleeSwing } from "./MeleeSystem";
import { devSetSpecialLevel, gainSpecialXp } from "./SpecialSystem";
import {
  warriorDashDamage,
  warriorLeap,
  warriorLianShanDash,
} from "./WarriorSystem";
import type { WarriorLeapState } from "./WarriorSystem";
import {
  advanceTutorial,
  finishTutorial,
  noteTutorialStatsOpened,
  startTutorial,
  updateTutorial,
} from "./TutorialSystem";
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
  BossState,
  BossHazard,
  BossStrike,
  BossImpact,
  Bolt,
  Box,
  Bullet,
  DamageCause,
  DamageSource,
  DamageTakenEvent,
  DamageTotals,
  Enemy,
  EnemyBullet,
  EnemyVisualEvent,
  EliteAffix,
  FloatingText,
  GameState,
  GameView,
  Gem,
  MageCastPhase,
  MageDecoy,
  Meteor,
  Missile,
  Mode,
  Panel,
  Particle,
  Player,
  Point,
  Profession,
  RunSummary,
  Slash,
  Slot,
  WavePhase,
  WarriorStyle,
  ShooterWeapon,
  MageWeapon,
} from "./types";
import { silentView } from "./types";
import { cardsOfTier, enterRest, startNextWave, waveQuota } from "./WaveSystem";
function emptyMageDamage() {
  return {
    body: 0,
    echo: 0,
    refract: 0,
    shadow: 0,
    shatter: 0,
    reaction: {
      quench: 0,
      melt: 0,
      overload: 0,
      blaze: 0,
      superconduct: 0,
      frostbind: 0,
    } as Record<MageReactionId, number>,
  };
}

export class GameCore {
  state: Mode = "start";
  player!: Player;
  enemies: Enemy[] = [];
  enemyVisualEvents: EnemyVisualEvent[] = [];
  bossState: BossState | null = null;
  bossHazards: BossHazard[] = [];
  /** Boss/minion shared hostile ground. Legacy name remains an alias for previews. */
  get hazards(): BossHazard[] { return this.bossHazards; }
  set hazards(value: BossHazard[]) { this.bossHazards = value; }
  enemySlowT = 0;
  /** Records species-slot affixes even if an earlier elite dies before the next spawn. */
  waveEliteAffixes: EliteAffix[] = [];
  bossStrikes: BossStrike[] = [];
  bossImpacts: BossImpact[] = [];
  bossSlowT = 0;
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
  /** 织网蛛蛛网：arm 为落点预警剩余时间，t 为生效剩余时间。 */
  webZones: {
    x: number;
    y: number;
    R: number;
    t: number;
    arm: number;
  }[] = [];
  /** S2「疾行」：冲刺结束后的射速加成剩余时间（秒）。 */
  dashFireBoostT = 0;
  /** 「装填」：下一发必为强化弹（闪避/冲刺/接触装填）。 */
  specialLoaded = false;
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
   * 射手动态难度：本局属性选择相对同级期望品质的累计偏离。
   * 永久累计，可为负；难度档案只把正偏离转成 DR，低于期望不返利。
   */
  qualityScore = 0;
  /**
   * S3：当前职业池。
   *
   * S2 只有射手，职业被硬编码；S3 起开局可选「射手 / 法师」，
   * 由 `startGame(prof)` 写入。`canOffer` 用它过滤职业卡。
   *
   * 战士（`"warrior"`）自 v99 起接入基础可玩池（核心/入场/共享 13 张）。
   */
  prof: Profession = "shooter";
  /** 战士开局流派；非战士恒为 katana。 */
  warriorStyle: WarriorStyle = "katana";
  shooterWeapon: ShooterWeapon = "charged";
  mageWeapon: MageWeapon = 'arcane';
  domain = createDomainState();
  missile = createMissileState();
  laser = createLaserState();
  laserLevel = 1;
  laserXp = 0;
  laserUpgrades: LaserUpgradeId[] = [];
  /** 流层数与计时（战士核心链；放 GameCore，避免 recompute 抹掉）。 */
  warriorFlowStacks = 0;
  warriorFlowT = 0;
  /** 每 3 次挥砍中的第 3 次为重斩。 */
  warriorSwingCount = 0;
  /** 大剑起手 / 坠落中的落点与攻击快照；空值表示可以自由行动。 */
  warriorLeapState: WarriorLeapState | null = null;
  /**
   * 连斩链计数（#179）。用户裁决「最多连 3 次」：达到上限后必须走完一次
   * 正常攻击间隔才能重新掷概率。放 GameCore 而非 Player——recompute 会重建
   * Player 字段，运行时状态放那儿会被抹掉。
   */
  warriorChainCount = 0;
  /**
   * 「居合」的势层数 / 距离余量 / L2 攻速窗口（太刀专属链）。
   *
   * 势只增不减：走路积攒，**满层才触发居合斩**并清零。这样零碎积累不会被
   * 单次挥砍浪费（实测两次挥砍之间只移动 27px，若挥砍就倾泻则永远停在 0–1 层）。
   * 与 warriorFlowStacks 一样放 GameCore——recompute 会重建 Player 字段。
   */
  warriorIaiStacks = 0;
  warriorIaiDist = 0;
  warriorIaiHasteT = 0;
  /** 剑气 / 斩浪表现层（直线，寿命很短）。 */
  warriorQi: {
    x1: number;
    y1: number;
    x2: number;
    y2: number;
    t: number;
    max: number;
    c: string;
    /** qi=剑气直线；dash=斩浪路径；slam=跃击落地冲击波环。 */
    kind: "dash" | "qi" | "slam";
  }[] = [];
  /** 剑气/裂地：重斩后脱离角色向前或四斜向移动的波面。 */
  warriorWaves: {
    kind: "qi" | "fissure";
    x: number;
    y: number;
    vx: number;
    vy: number;
    angle: number;
    t: number;
    max: number;
    /** 沿飞行方向的半宽 / 垂直方向的半高（与敌人身体半径相加）。 */
    halfW: number;
    halfH: number;
    dmg: number;
    /** 命中瞬间的位移 px（hurtEnemy 的 kx/ky 口径）。 */
    knock: number;
    stun: number;
    scale: number;
    /** 每个波面（裂地四道共享）已命中的敌人。 */
    hit: Enemy[];
  }[] = [];
  /** 斩浪的起跳点（冲刺结束时结算路径伤害）。 */
  warriorDashFromX: number | null = null;
  warriorDashFromY: number | null = null;
  /** 残心：冲刺后的下一刀残影追击窗口。 */
  warriorResolveT = 0;
  /** 残心·残影追击：延迟触发的第二刀。 */
  warriorEchoes: {
    t: number;
    angle: number;
    spread: number;
    radius: number;
    dmg: number;
    spin: boolean;
  }[] = [];
  /** 强袭：跃击落地后的攻速窗口。 */
  warriorLeapHasteT = 0;
  /** 三段斩：当前冲刺段（0 短冲扇斩 / 1 中冲旋斩 / 2 远冲跃击）。 */
  warriorTriDashStage = 0;
  /** 本次冲刺是否由三段斩接管（用于结束帧结算末尾攻击）。 */
  warriorTriDashActive = false;
  /** 三段斩：3 个独立冲刺槽的剩余充能时间；0 = 可用。 */
  warriorTriSlotRe: [number, number, number] = [0, 0, 0];
  /** 冲刺后移速爆发的剩余时间（战士基础机制，见 PlayerSystem 的 boost 乘区）。 */
  warriorDashBoostT = 0;
  /** 连闪·锐势：冲刺后 2 秒的暴击率/暴击伤害窗口（太刀）。 */
  warriorLianShanT = 0;
  /** 连闪·大剑特化：冲刺后 2 秒内下一刀视为重斩的窗口。 */
  warriorHeavyReadyT = 0;
  /** 三段斩第三段跃击：落地后的额外无敌时间。 */
  warriorLeapInvulnT = 0;
  /** 血偿：受伤后的挥砍增伤层数与剩余时间。 */
  warriorBloodDebtStacks = 0;
  warriorBloodDebtT = 0;
  /** 教程核心步骤：是否已经打出过重斩。 */
  tutorialHeavyDone = false;
  /** 新手教程（v83）：练习场标记与分步状态 */
  tutorialMode = false;
  tutorialStep = 0;
  /** 当前步骤条件已满足：UI 显示「下一步」，由玩家点击推进 */
  tutorialStepReady = false;
  tutorialProf: Profession | null = null;
  tutorialStartX = 0;
  tutorialStartY = 0;
  tutorialDashed = false;
  tutorialHit = false;
  tutorialProfDone = false;
  /** 射手教程第 3 步：已命中的强化弹次数 */
  tutorialSpecialHits = 0;
  /** 教程第 1 步：按过任意移动键（不再等走满距离） */
  tutorialMoved = false;
  tutorialGemPicked = false;
  tutorialGemSpawned = false;
  tutorialDomain = createDomainTutorialProgress();
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
  /* —— 元素法师 v2：法杖成长与轮盘 ——
   *
   * 元素/反应/法杖等级是**职业成长**，不放 Player.upCounts：upCounts 是
   * 每 4 波三选一的天赋卡计数器，混用会让旧卡与元素进度互相污染。
   * 全部放 GameCore，与充能/相位/镜像一致，且 recompute 不会抹掉。
   */
  /** 已获得元素，按获得顺序（最多 3 个）。 */
  mageElements: MageElement[] = [];
  /** 法杖等级 1–12（独立于玩家等级）。 */
  mageStaffLevel = 1;
  /** 当前法杖等级已累计经验。 */
  mageStaffXp = 0;
  /** 当前轮盘索引（指向 mageElements）。 */
  mageWheelIndex = 0;
  /** 当前元素阶段内已完成成功施法次数（0–3）。 */
  mageCastsInPhase = 0;
  /** 本局套装：第二元素获得后确定。 */
  mageSuit: MageSuit | null = null;
  /** 已领悟的配对反应（Lv3 一条，Lv6 随机一条）。 */
  mageReactionIds: MageReactionId[] = [];
  /** 与 mageReactionIds 对齐的解锁法杖等级；DEV 直接配装时为 0。 */
  mageReactionUnlockLevels: number[] = [];
  /** 与 mageElements 对齐的元素选择等级；DEV 直接配装时为空。 */
  mageElementPickLevels: number[] = [];
  /** 普通/稀有/史诗池已获得项。 */
  mageUpgrades: MageUpgradeId[] = [];
  /**
   * 元素棱镜：第 4 次成功施法留下，下一次（或史诗下两次）本体法阵折射。
   * 负责存储位置、剩余时间、记录元素、剩余折射次数与折射预算。
   */
  magePrism: {
    x: number;
    y: number;
    t: number;
    maxT: number;
    element: MageElement;
    charges: number;
    budget: number;
  } | null = null;
  /** 技能 VFX 的只读表现事件；每个固定步重建，供渲染层采样。 */
  mageVisualEvents: {
    kind: "body" | "echo" | "refract" | "shadow" | "burst";
    at: number;
    element: MageElement;
    x: number;
    y: number;
    radius: number;
    source?: { x: number; y: number };
  }[] = [];
  /** 休整面板的法师细分伤害；不并入通用 dmgBy，避免双重计数。 */
  mageDmgBy = emptyMageDamage();
  private mageWaveStartDmgBy = emptyMageDamage();
  /** 棱镜折射的纯表现事件：从棱镜射向落点的光束与命中闪光。 */
  magePrismBeams: {
    x: number;
    y: number;
    points: { x: number; y: number }[];
    /** 当前法阵元素（伤害/状态按它结算）。 */
    element: MageElement;
    /** 棱镜记录元素（水晶颜色；终极震爆的标记）。 */
    stored: MageElement;
    t: number;
    maxT: number;
  }[] = [];
  /** 回响法阵：延迟 0.3 秒的第二次伤害，不施加状态/不触发反应。 */
  mageEchoes: {
    x: number;
    y: number;
    t: number;
    maxT: number;
    R: number;
    damage: number;
    element: MageElement;
  }[] = [];
  /** 分影齐射冷却与左右残影表现。 */
  mageShadowCd = 0;
  mageShadows: {
    side: -1 | 1;
    t: number;
    maxT: number;
    element: MageElement;
  }[] = [];
  /**
   * 法杖 Lv1/3/6 的强制元素选择：待选第几元素。
   * 复用旧补选面板的 slots 展示，但不消耗天赋次数。
   */
  mageElementPickPending: "first" | "second" | "third" | null = null;
  /** 一波内连升 Lv3/Lv6 时已触发的元素选择，休整时在 pending 之后依次处理。 */
  mageElementPickQueue: ("second" | "third")[] = [];
  /**
   * S1/v139：本次休整可用的属性消费额度（波次 + 成长徽记）。为 0 时属性面板不出现。
   * 不进 parity 快照白名单：它只驱动面板流程，不参与任何数值计算。
   */
  attrPicks = 0;
  /** 升级获得的属性点池（v139）：每级 +2，休整时按额度消费。 */
  attributePoints = 0;
  /** 普通宝箱的品质祝福层数（v139，最多 2 层）。 */
  attrQualityBoosts = 0;
  /** 已发放里程碑属性额度的波次（4/8/12…，防止面板重入重复发）。 */
  attrMilestoneWave = 0;
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
  /** 射手职业被动：普通射击计数，每第 3 次触发强化弹 */
  shotCounter = 0;
  /** 「过载」：已触发的强化弹次数（只计强化弹触发，不计弹丸数）。 */
  specialShotCount = 0;
  /** 强化弹等级/经验/已获得升级（一局内成长，resetGame 重置） */
  specialLevel = 1;
  specialXp = 0;
  specialUpgrades: SpecialUpgradeId[] = [];
  /** 激光升级的短寿命表现层 */
  lasers: { x1: number; y1: number; x2: number; y2: number; t: number }[] = [];
  wavePhase: WavePhase = "fight";
  waveN = 1;
  quota = 20;
  spawnedThisWave = 0;
  /** 本波主题首次出现时的保底怪；消费一次后清空。 */
  themeGuarantee: string | null = null;
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
  /** 本波普通怪已掉落的成长徽记数（精英普通宝箱不占此名额） */
  boxDropsThisWave = 0;
  /** 历史精英宝箱点数（当前不再投放，保留给后续 Boss 强化宝箱） */
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
    iai: 0,
    qi: 0,
    fissure: 0,
    tri: 0,
    reflect: 0,
    cast: 0,
    element: 0,
    reaction: 0,
    laser: 0,
    missileMain: 0, missileSwarm: 0, missileArc: 0, missileBurn: 0,
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
    iai: 0,
    qi: 0,
    fissure: 0,
    tri: 0,
    reflect: 0,
    cast: 0,
    element: 0,
    reaction: 0,
    laser: 0,
    missileMain: 0, missileSwarm: 0, missileArc: 0, missileBurn: 0,
  };
  beginWaveReport() {
    this.waveStartDamage = { ...this.dmgBy };
    this.mageWaveStartDmgBy = {
      ...this.mageDmgBy,
      reaction: { ...this.mageDmgBy.reaction },
    };
  }
  waveDamage(): DamageTotals {
    const result = { ...this.dmgBy };
    for (const source of Object.keys(result) as (keyof DamageTotals)[])
      result[source] = (result[source] ?? 0) - (this.waveStartDamage[source] ?? 0);
    return result;
  }
  waveMageDamage() {
    const result = emptyMageDamage();
    for (const key of ["body", "echo", "refract", "shadow", "shatter"] as const)
      result[key] = this.mageDmgBy[key] - this.mageWaveStartDmgBy[key];
    for (const id of Object.keys(result.reaction) as MageReactionId[])
      result.reaction[id] =
        this.mageDmgBy.reaction[id] - this.mageWaveStartDmgBy.reaction[id];
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
  /* ---- v147 死亡总结运行统计：只服务局末回顾，不参与战斗数值 ---- */
  runDamageTaken = 0;
  runDamageTakenByCause: Record<DamageCause, number> = {
    contact: 0,
    projectile: 0,
    explosion: 0,
    dot: 0,
    unknown: 0,
  };
  runRecentHits: DamageTakenEvent[] = [];
  runHighestHit: { amount: number; source: DamageSource } = {
    amount: 0,
    source: "melee",
  };
  runEliteKills = 0;
  runBossKills = 0;
  runSummary: RunSummary | null = null;
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
  warriorLeap = warriorLeap.bind(this);
  warriorDashDamage = warriorDashDamage.bind(this);
  warriorLianShanDash = warriorLianShanDash.bind(this);
  // S3 法师池：施法状态机、元素状态、以及「脱离」槽的两个触发器。
  // 后两者由 CombatSystem.damagePlayer 调用——CombatSystem 不 import
  // MageSystem（避免运行时循环），统一走 GameCore 上的方法引用。
  updateMageCasting = updateMageCasting.bind(this);
  updateMageElements = updateMageElements.bind(this);
  devSetStaffLevel = devSetStaffLevel.bind(this);
  devConfigureElementalMage = devConfigureElementalMage.bind(this);
  interruptMageCast = interruptMageCast.bind(this);
  triggerPhaseEscape = triggerPhaseEscape.bind(this);
  triggerMirrorDecoy = triggerMirrorDecoy.bind(this);
  startTutorial = startTutorial.bind(this);
  updateTutorial = updateTutorial.bind(this);
  advanceTutorial = advanceTutorial.bind(this);
  finishTutorial = finishTutorial.bind(this);
  addText = addText.bind(this);
  damagePlayer = damagePlayer.bind(this);
  gainSpecialXp = gainSpecialXp.bind(this);
  devSetSpecialLevel = devSetSpecialLevel.bind(this);
  devSetLaserLevel = devSetLaserLevel.bind(this);
  devSetMissileLevel = devSetMissileLevel.bind(this);
  devSetDomainLevel = devSetDomainLevel.bind(this);
  clearDomainTransient() { clearDomainTransient(this); }
  missileDash = missileDash.bind(this);
  clearMissileTransient(clearInventory = false) { clearMissileTransient(this, clearInventory); }
  /** 返回开始页的 Boss 清理命令，UI 不直接改危险区或敌人字段。 */
  clearBossEncounter() {
    clearBossTransient(this);
    this.enemyVisualEvents = [];
    this.enemies = this.enemies.filter((e) => !e.boss && !e.bossSummon);
  }
  resetMissileWeapon() { this.missile = createMissileState(); }
  laserDash = laserDash.bind(this);
  update = update.bind(this);
  waveQuota = waveQuota.bind(this);
  startNextWave = startNextWave.bind(this);
  cardsOfTier = cardsOfTier.bind(this);
  enterRest = enterRest.bind(this);
  resetGame(
    prof: Profession = "shooter",
    warriorStyle: WarriorStyle = "katana",
    shooterWeapon: ShooterWeapon = "charged",
    mageWeapon: MageWeapon = 'arcane',
  ) {
    // S3：职业必须在重建 Player 之前确定——属性投影以 statBase(prof) 重建，
    // 法师的施法速度/施法距离与战士的武器形态来自职业 base。
    this.prof = prof;
    this.audio.stopDomainAudio();
    this.mageWeapon = prof === 'mage' ? mageWeapon : 'arcane';
    this.domain = createDomainState();
    this.shooterWeapon = prof === "shooter" ? shooterWeapon : "charged";
    this.missile = createMissileState();
    this.laser = createLaserState();
    this.laserLevel = 1;
    this.laserXp = 0;
    this.laserUpgrades = [];
    this.warriorStyle =
      prof === "warrior" ? warriorStyle : "katana";
    this.audio.cancelCues();
    this.tutorialMode = false;
    this.tutorialStep = 0;
    this.tutorialStepReady = false;
    this.tutorialProf = null;
    this.tutorialDashed = false;
    this.tutorialHit = false;
    this.tutorialProfDone = false;
    this.tutorialSpecialHits = 0;
    this.tutorialMoved = false;
    this.tutorialHeavyDone = false;
    this.tutorialGemPicked = false;
    this.tutorialGemSpawned = false;
    this.tutorialDomain = createDomainTutorialProgress();
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
      ...statBase(prof, this.warriorStyle, this.mageWeapon),
    };
    this.player.hp = this.player.maxhp;
    clearBossTransient(this);
    this.enemyVisualEvents = [];
    this.enemies = [];
    this.bullets = [];
    this.gems = [];
    this.potions = [];
    this.boxes = [];
    this.burnZones = [];
    this.trailZones = [];
    this.webZones = [];
    this.waveEliteAffixes = [];
    this.dashFireBoostT = 0;
    this.specialLoaded = false;
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
    this.runDamageTaken = 0;
    this.runDamageTakenByCause = {
      contact: 0,
      projectile: 0,
      explosion: 0,
      dot: 0,
      unknown: 0,
    };
    this.runRecentHits = [];
    this.runHighestHit = { amount: 0, source: "melee" };
    this.runEliteKills = 0;
    this.runBossKills = 0;
    this.runSummary = null;
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
    this.mageCharge = 0;
    this.mageChargeFlashT = 0;
    this.mageShield = 0;
    this.mageShieldT = 0;
    this.mageShieldMaxT = 0;
    this.magePhaseCd = 0;
    this.mageMirrorCd = 0;
    this.magePhaseT = 0;
    this.mageDecoys = [];
    this.mageElements = [];
    this.mageStaffLevel = 1;
    this.mageStaffXp = 0;
    this.mageWheelIndex = 0;
    this.mageCastsInPhase = 0;
    this.mageSuit = null;
    this.mageReactionIds = [];
    this.mageReactionUnlockLevels = [];
    this.mageElementPickLevels = [];
    this.mageUpgrades = [];
    this.magePrism = null;
    this.magePrismBeams = [];
    this.mageVisualEvents = [];
    this.mageEchoes = [];
    this.mageShadowCd = 0;
    this.mageShadows = [];
    this.mageElementPickPending = prof === "mage" && this.mageWeapon === "arcane" ? "first" : null;
    this.mageElementPickQueue = [];
    this.warriorFlowStacks = 0;
    this.warriorFlowT = 0;
    this.warriorSwingCount = 0;
    this.warriorLeapState = null;
    this.warriorChainCount = 0;
    this.warriorIaiStacks = 0;
    this.warriorIaiDist = 0;
    this.warriorIaiHasteT = 0;
    this.warriorQi = [];
    this.warriorWaves = [];
    this.warriorDashFromX = null;
    this.warriorDashFromY = null;
    this.warriorResolveT = 0;
    this.warriorEchoes = [];
    this.warriorLeapHasteT = 0;
    this.warriorTriDashStage = 0;
    this.warriorTriDashActive = false;
    this.warriorTriSlotRe = [0, 0, 0];
    this.warriorDashBoostT = 0;
    this.warriorLianShanT = 0;
    this.warriorHeavyReadyT = 0;
    this.warriorLeapInvulnT = 0;
    this.warriorBloodDebtStacks = 0;
    this.warriorBloodDebtT = 0;
    this.tutorialHeavyDone = false;
    // S1：属性选择按波发放（本波次数在波末消费），新局从第 1 波的额度开始
    this.attributePicks = [];
    this.attributePoints = 0;
    this.attrQualityBoosts = 0;
    this.attrMilestoneWave = 0;
    this.qualityScore = 0;
    // #134：走统一入口，让「第 1 波基础额度」也受单波上限约束
    this.attrPicks = 0;
    this.attrGrantedThisWave = 0;
    this.grantAttrPicks(attrPicksPerWave(1));
    this.attrChoices = [];
    this.attrRefreshUsed = false;
    this.chainCd = 0;
    this.shotCounter = 0;
    this.specialShotCount = 0;
    this.specialLevel = 1;
    this.specialXp = 0;
    this.specialUpgrades = [];
    this.lasers = [];
    this.wavePhase = "fight";
    this.waveN = 1;
    this.quota = this.waveQuota(1);
    this.spawnedThisWave = 0;
    this.themeGuarantee = null;
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
    iai: 0,
    qi: 0,
    fissure: 0,
    tri: 0,
      cast: 0,
      element: 0,
      reaction: 0,
      laser: 0,
      missileMain: 0, missileSwarm: 0, missileArc: 0, missileBurn: 0,
    };
    this.mageDmgBy = emptyMageDamage();
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
  startGame(
    prof?: Profession,
    warriorStyle?: WarriorStyle,
    shooterWeapon?: ShooterWeapon,
    mageWeapon?: MageWeapon,
  ) {
    this.resetGame(prof ?? "shooter", warriorStyle, shooterWeapon, mageWeapon);
    if (this.prof === 'mage' && this.mageWeapon === 'domain') this.audio.warmDomain();
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
      noteTutorialStatsOpened(this);
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
    noteTutorialStatsOpened(this);
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
    // 每个固定步换新数组，渲染层按引用去重，不会重播上一帧事件。
    this.mageVisualEvents = [];
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
    clearDomainTransient(this);
    clearMissileTransient(this, true);
    this.laser = createLaserState();
    this.warriorLeapState = null;
    const wave = Math.max(1, this.waveN);
    clearBossTransient(this);
    this.enemyVisualEvents = [];
    this.enemies = [];
    this.ebullets = [];
    this.bullets = [];
    this.gems = [];
    this.boxes = [];
    this.potions = [];
    this.meteors = [];
    this.burnZones = [];
    this.trailZones = [];
    this.webZones = [];
    this.mageDecoys = [];
    this.magePrism = null;
    this.magePrismBeams = [];
    this.mageEchoes = [];
    this.mageShadowCd = 0;
    this.mageShadows = [];
    this.parts = [];
    this.texts = [];
    this.slashes = [];
    this.bolts = [];
    this.castPhase = "idle";
    this.castT = 0;
    this.castCd = 0;
    this.magePhaseT = 0;
    this.pendingLevels = 0;
    this.startTalentPending = false;
    this.warriorTriDashActive = false;
    this.warriorTriSlotRe = [0, 0, 0];
    this.warriorHeavyReadyT = 0;
    this.warriorLeapInvulnT = 0;
    this.warriorBloodDebtStacks = 0;
    this.warriorBloodDebtT = 0;
    this.warriorWaves = [];
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

  /**
   * DEV：清空已学天赋并重算属性。
   * 保留：属性加点、等级/经验、强化箭等级与升级、血包永久成长。
   * 清掉：picks/upCounts 与依赖天赋的运行态（护盾/充能/陨星/残域/法阵读条）。
   */
  devClearTalents() {
    clearDomainTransient(this);
    clearMissileTransient(this, true);
    this.laser = createLaserState();
    this.warriorLeapState = null;
    const p = this.player;
    // 原地清空，避免任何持有 upCounts/picks 引用的系统读到旧对象。
    for (const key of Object.keys(p.upCounts)) delete p.upCounts[key];
    p.picks.length = 0;
    p.shield = 0;
    p.shieldCd = 0;
    p.rageT = 0;
    p.hasteT = 0;
    this.dashFireBoostT = 0;
    this.specialLoaded = false;
    this.castPhase = "idle";
    this.castT = 0;
    this.castCd = 0;
    this.mageCharge = 0;
    this.mageChargeFlashT = 0;
    this.mageShield = 0;
    this.mageShieldT = 0;
    this.mageShieldMaxT = 0;
    this.mageDecoys = [];
    this.magePhaseT = 0;
    this.magePrism = null;
    this.magePrismBeams = [];
    this.mageEchoes = [];
    this.mageShadowCd = 0;
    this.mageShadows = [];
    this.warriorFlowStacks = 0;
    this.warriorFlowT = 0;
    this.warriorSwingCount = 0;
    this.warriorChainCount = 0;
    this.warriorIaiStacks = 0;
    this.warriorIaiDist = 0;
    this.warriorIaiHasteT = 0;
    this.warriorQi = [];
    this.warriorWaves = [];
    this.warriorDashFromX = null;
    this.warriorDashFromY = null;
    this.warriorResolveT = 0;
    this.warriorEchoes = [];
    this.warriorLeapHasteT = 0;
    this.warriorTriDashStage = 0;
    this.warriorTriDashActive = false;
    this.warriorTriSlotRe = [0, 0, 0];
    this.warriorDashBoostT = 0;
    this.warriorLianShanT = 0;
    this.warriorHeavyReadyT = 0;
    this.warriorLeapInvulnT = 0;
    this.warriorBloodDebtStacks = 0;
    this.warriorBloodDebtT = 0;
    this.recompute();
    this.addText(p.x, p.y - 26, "已清空天赋", "#ffd24a", true);
  }

  gameOver() {
    clearDomainTransient(this);
    this.clearBossEncounter();
    clearMissileTransient(this, true);
    this.laser = createLaserState();
    this.warriorLeapState = null;
    if (this.state === "over") return;    // DEV-only：允许复活时拦截死亡，保留本局构筑并重开当前波。
    if (import.meta.env.DEV && this.devRevive) {
      this.devReviveRun();
      return;
    }
    this.state = "over";
    this.enemyVisualEvents = [];
    const p = this.player;
    const totalDamage = Object.values(this.dmgBy).reduce(
      (sum, value) => sum + value,
      0,
    );
    this.runSummary = {
      time: this.time,
      wave: this.waveN,
      level: p.lvl,
      kills: this.kills,
      totalDamage,
      damageBySource: { ...this.dmgBy },
      damageTaken: this.runDamageTaken,
      damageTakenByCause: { ...this.runDamageTakenByCause },
      recentHits: this.runRecentHits.slice(),
      death: this.runRecentHits.length
        ? { ...this.runRecentHits[this.runRecentHits.length - 1] }
        : null,
      highestHit: { ...this.runHighestHit },
      eliteKills: this.runEliteKills,
      bossKills: this.runBossKills,
      talents: p.picks.slice(),
      upCounts: { ...p.upCounts },
      attributePicks: this.attributePicks.map(({ stat, value }) => ({
        stat,
        value,
      })),
    };
    this.storage.append({
      d: Date.now(),
      t: Math.round(this.time),
      k: this.kills,
      lv: p.lvl,
      w: this.waveN,
      up: { ...p.upCounts },
      dmg: { ...this.dmgBy },
    });
    // 局末同步图鉴：与战绩写入同一收口，放在 append 之后避免影响其行为。
    if (this.codex.syncEnemies(this.killLog)) this.killLog = {};
    this.codex.syncTalents(this.player.upCounts);
    this.view.over();
    this.audio.overCue();
  }
}
