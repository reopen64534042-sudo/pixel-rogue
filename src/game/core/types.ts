import type { DamageTypeId } from "../data/damageTypes";
export type Mode = "start" | "play" | "stats" | "pause" | "over";
export type Panel = "level" | "rest" | "box" | "attr" | null;
export type GameState = Mode | "levelup" | "report" | "swap";
export type WavePhase = "fight" | "collect" | "rest";
export type DamageSource =
  | "bullet"
  | "reflect"
  | "shock"
  | "orbit"
  | "chain"
  | "meteor"
  | "explode"
  | "thorns"
  | "burn"
  | "melee";
export type DamageTotals = Record<DamageSource, number>;
/* ---------- Combat Foundation v1（S1 契约，未接入运行时战斗） ---------- */
/** 攻击方式：决定近战/远程增伤乘区适用范围；由技能显式指定，不按距离推断 */
export type AttackForm = "melee" | "ranged" | "other";
/** 结算方式：hit=离散命中；dot=持续伤害（固定 preserve-float 且不得暴击，运行时校验） */
export type DamageKind = "hit" | "dot";
/**
 * 结算精度（§3.3）。与 kind 正交：现有规则对敌方命中与玩家受击不同
 * （hurtEnemy 取整保底 1 点，damagePlayer 保留浮点），必须由调用方显式声明，
 * 不设默认值正是为了避免 S2 接入时静默选错语义。
 * round-min-one：末尾一次取整且正伤害保底 1 点（对齐 hurtEnemy 现行规则）。
 * preserve-float：保留浮点（玩家受击的浮点 HP 扣除习惯，UI 取整仅用于显示；dot 固定此值）。
 */
export type DamagePrecision = "round-min-one" | "preserve-float";
/** 按伤害属性索引的抗性映射，未声明视为 0；T 支持扩展注册表（如 frost） */
export type ResistanceMap<T extends string = DamageTypeId> = Partial<
  Record<T, number>
>;
/** 只读战斗属性快照：由 Player/Enemy 经适配器构造，不是另一个可变实体对象 */
export interface CombatStatsSnapshot<T extends string = DamageTypeId> {
  /** 统一攻击力。S1 计算不消费：rawAmount 已含技能系数，禁止再叠 ATK */
  attack: number;
  /** 物理护甲（physical 减伤策略使用） */
  defense: number;
  /** 暴击率与暴伤倍率由编排层判定使用；纯计算只按 isCritical 应用 critMultiplier */
  critChance: number;
  critMultiplier: number;
  /** 通用减伤（韧性）：physical/fire/lightning 生效，true 无视 */
  tough: number;
  resistances: ResistanceMap<T>;
  /** 增伤乘区（§3.1 同乘区加算、跨乘区乘算）：适配器先把同区来源聚合为单一数值，默认 0 */
  globalDamageBonus: number;
  typeDamageBonus: Partial<Record<T, number>>;
  formDamageBonus: Partial<Record<AttackForm, number>>;
  /** 技能额外增伤（不是技能自身系数），按 skillId 查找 */
  skillDamageBonus?: Readonly<Record<string, number>>;
}
/**
 * 伤害计算请求。泛型 T 绑定到所用注册表的属性 ID，扩展注册表（如 frost）
 * 天然获得编译期约束；运行时仍校验注册表成员关系。
 */
export interface DamageRequest<T extends string = DamageTypeId> {
  /** 技能已算好的原始伤害（含 player.damage 与天赋效果）；计算器禁止再乘攻击力 */
  rawAmount: number;
  type: T;
  form: AttackForm;
  /** 适配旧 DamageSource，用于伤害报告与专属增强；v1 为自由字符串 */
  origin: string;
  kind: DamageKind;
  /** 结算精度（§3.3）：hit 两种可选；dot 固定 preserve-float（运行时校验） */
  precision: DamagePrecision;
  skillId?: string;
  /** 机制元数据标签（area/projectile/dot 等），只表达事实，不自动参与乘伤 */
  tags?: readonly string[];
  attackerStats: Readonly<CombatStatsSnapshot<T>>;
  defenderStats: Readonly<CombatStatsSnapshot<T>>;
  /** 暴击已由编排层判定完成；纯计算不掷随机数 */
  isCritical: boolean;
}
export interface DamageCalculation {
  rawDamage: number;
  beforeMitigation: number;
  settledDamage: number;
  isCritical: boolean;
}
/**
 * S2 编排层在 DamageCalculation 上追加的应用结果。
 * dodged/shieldUsed/killed/preventedDeath 依赖护盾/免死等运行状态，
 * 不能由纯 DamageSystem 推断（§3.5）。
 */
export interface DamageResult extends DamageCalculation {
  /**
   * 按伤害封顶的实际损失量 = min(受击前 HP, max(0, settledDamage))；被闪避/
   * 次数盾抵挡时为 0。注意这是封顶后的伤害口径，不是不屈、治疗等保命/回复
   * 效果结算后的 HP 净变化（例：5 HP 受 20 伤触发不屈最终 HP=1，本字段为 5）。
   */
  effectiveHpLoss: number;
  dodged: boolean;
  shieldUsed: "none" | "temporary" | "normal";
  /** 伤害使目标 HP 降至 ≤ 0（达到致死阈值）；与死亡结算是否已执行无关 */
  lethal: boolean;
  /**
   * 死亡结算已执行：hurtEnemy/damagePlayer 内同步完成（与 lethal 同真）；
   * applyBurnDot 的死亡结算由调用侧（EnemySystem）随后按原顺序执行，
   * 因此其返回值恒为 false——到达阈值请读 lethal。
   */
  killed: boolean;
  preventedDeath: boolean;
}
export interface Point {
  x: number;
  y: number;
}
export interface Player extends Point {
  r: number;
  hp: number;
  lvl: number;
  xp: number;
  xpNext: number;
  fireCd: number;
  upCounts: Record<string, number>;
  picks: string[];
  maxhp: number;
  speed: number;
  projSpeed: number;
  /**
   * 攻击射程（px）：索敌半径与弹道最大飞行距离共用。
   * S1 之前是 `AttackSystem` 里的硬编码 130，现改为属性（base 130），
   * 供「射程」类属性成长与长弓/短弓改造；语义与 StatModel 的 attackRange 一致。
   */
  attackRange: number;
  damage: number;
  boltDmgMul: number;
  frostLv: number;
  scorchVuln: number;
  burnSpread: number;
  meteorGuided: number;
  burnGround: number;
  bladeReflect: number;
  fireRate: number;
  multishot: number;
  /**
   * 穿透次数（还能穿过几个敌人）。
   * 与 `pierceFalloff` 配对：每穿过一个目标，剩余伤害乘以该系数。
   */
  pierce: number;
  /**
   * 穿透衰减系数（S2）：每穿一个目标后剩余伤害的倍率。
   * v40 硬编码 0.85；射手职业被动把它改为 0.5（"第二目标 50%"），
   * 核心链 L1「穿透之矢」提升到 0.8、L2「弹道贯穿」提升到 1.0。
   */
  pierceFalloff: number;
  /** 「距离即收益」开关（0/1）：发射时按目标距离占射程的比例追加伤害。 */
  distanceDmg: number;
  /** 冲刺距离倍率（1 = 基础 280 px/s × 0.28s）。 */
  dashDistMul: number;
  area: number;
  crit: number;
  critMul: number;
  ricochet: number;
  slow: number;
  burn: number;
  chain: number;
  meteor: number;
  meteorT: number;
  thorns: number;
  lifesteal: number;
  explode: number;
  shieldMax: number;
  shield: number;
  shieldCd: number;
  dashLv: number;
  dashT: number;
  dashMax: number;
  dashCharges: number;
  dashRe: number;
  dashChargeLv: number;
  dx: number;
  dy: number;
  hasteLv: number;
  haste: number;
  hasteT: number;
  luck: number;
  magnet: number;
  regen: number;
  orbit: number;
  orbitDmg: number;
  orbA: number;
  hurtCd: number;
  dodge: number;
  tough: number;
  rageLv: number;
  rageT: number;
  barrierLv: number;
  tempShield: number;
  nd: number;
  ndUsed: boolean;
  explodeDmg: number;
  chainDmg: number;
  /* —— Combat Foundation S3-A 可配置战斗属性（全部可选、默认不写入）——
   * 字段命名与 CombatStatsSnapshot 一致；仅有数值来源（S3-B 批准后）时才出现，
   * 保证实体序列化形状与 v8/parity 逐字段对照一致（先例：Enemy.kx）。
   * 注意 p.damage 是攻击基线（已含天赋强化，进 rawAmount），不是 globalDamageBonus。 */
  /** 物理护甲（physical 减伤策略） */
  defense?: number;
  resistances?: ResistanceMap;
  globalDamageBonus?: number;
  typeDamageBonus?: Partial<Record<DamageTypeId, number>>;
  formDamageBonus?: Partial<Record<AttackForm, number>>;
  skillDamageBonus?: Readonly<Record<string, number>>;
}
export interface Talent {
  hidden?: number;
  /**
   * S2 退役标记：卡仍在表内（parity 的逐字段对照、图鉴 id、存档兼容都要它），
   * 但不进任何抽取池。
   *
   * 与 `hidden` 分开是必要的：`hidden` 是**原版就有**的语义（如「不屈」），
   * 熔炉在 S2 过渡期仍要按原样排除它；`retired` 只表示「被新体系取代」，
   * 熔炉继续认这些卡（见 `legacyAvailTalents`）。
   */
  retired?: number;
  n: string;
  ico: string;
  t: number;
  cat: string;
  d: string;
  max: number;
  mech?: number;
  req?: (p: Player) => boolean;
  pv: (p: Player) => string;
  f: (p: Player) => void;
  cur?: (p: Player) => string;
  // ---- S2 职业池 / 链 / 互斥 ----
  /** 职业池归属。不填视为「不属于任何职业池」（旧版通用卡）。 */
  prof?: Profession;
  /** 槽位轴名。同一槽位内的卡构成一条链，槽位由门控推导而来。 */
  slot?: string;
  /** 链的层级：1 开通（从无到有）、2 放大（从有到强）、3 转向（从强到变）。 */
  layer?: 1 | 2 | 3;
  /** 前置卡名：未持有该卡时本卡不进抽取池（混合式抽取的依赖侧）。 */
  requires?: string;
  /** 互斥卡名：持有其中任意一张时本卡不进池，反之亦然。 */
  excludes?: string[];
  /** 变体组：同一组在一局内只能取一张。与 excludes 的区别是组合规模可变（N 选 1）。 */
  variant?: string;
}
/** 职业标识。`common` 表示三职业共用池。 */
export type Profession = "shooter" | "mage" | "warrior" | "common";

export interface Enemy extends Point {
  type: string;
  spr: string;
  hp: number;
  maxhp: number;
  speed: number;
  dmg: number;
  r: number;
  xp: number;
  elite: boolean;
  flash: number;
  orbCd: number;
  slowT: number;
  slowF: number;
  burnT: number;
  burnDps: number;
  burnStacks: number;
  /** S2「猎杀标记」：同一目标累计命中次数（满 3 次转为标记层数）。 */
  markHits: number;
  /** 标记层数（0/1/2，上限由「深痕」决定）。 */
  markStacks: number;
  /** 标记维持计时：归零时清空累计与层数（换目标 5 秒未再命中）。 */
  markT: number;
  frostStacks: number;
  frozenT: number;
  frostImmuneT: number;
  seed: number;
  shootCd: number;
  fuse: number;
  noDrop: boolean;
  /**
   * 击退速度 (px/s)，由近战模块写入，每帧衰减。
   * 必须是可选字段：未发生击退时对象上不存在该属性，
   * 以保证敌人对象结构与 v8 逐字段对照一致。
   */
  kx?: number;
  ky?: number;
  dead?: boolean;
  /* —— Combat Foundation S3-A 可配置战斗属性（全部可选、默认不写入）——
   * EnemyConfig 同名字段存在时由 spawnEnemy 拷贝；防御/抗性作防守方，
   * 三个增伤乘区作攻击方（随发射时快照固化进 EnemyBullet.stats）。
   * 既有敌人配置不含这些键 → 对象形状与 v8/parity 对照一致。 */
  defense?: number;
  resistances?: ResistanceMap;
  tough?: number;
  globalDamageBonus?: number;
  typeDamageBonus?: Partial<Record<DamageTypeId, number>>;
  formDamageBonus?: Partial<Record<AttackForm, number>>;
  skillDamageBonus?: Readonly<Record<string, number>>;
}
export interface EnemyConfig {
  hp: number;
  speed: number;
  dmg: number;
  r: number;
  xp: number;
  spr: string;
  w0: number;
  wt: number;
  /* —— Combat Foundation S3-A：可选战斗属性，spawnEnemy 在存在时拷贝到实体 —— */
  defense?: number;
  resistances?: ResistanceMap;
  tough?: number;
  globalDamageBonus?: number;
  typeDamageBonus?: Partial<Record<DamageTypeId, number>>;
  formDamageBonus?: Partial<Record<AttackForm, number>>;
  skillDamageBonus?: Readonly<Record<string, number>>;
}
export interface Bullet extends Point {
  vx: number;
  vy: number;
  dmg: number;
  pierce: number;
  /** 每穿一个目标后的剩余伤害倍率（发射时从玩家属性固化）。 */
  falloff: number;
  life: number;
  size: number;
  jumps: number;
  hitList: Enemy[];
  /** 「贯穿轨迹」：>0 时在飞行路径上留下能量线（秒），沿途敌人受一次 15% 伤害。 */
  trail?: number;
  /** 轨迹投放节流计时（内部用）。 */
  trailT?: number;
  /** 「距离即收益」满档的暴击加成，发射时固化到暴击判定上。 */
  critBonus?: number;
  /**
   * 发射时攻击者快照（Combat Foundation S3-B 定稿接口）：
   * 与 EnemyBullet.stats 对称——增伤等攻击方属性按发射时固化，
   * 飞行中学习/修改天赋不回溯。可选字段保持旧对象形状。
   */
  stats?: Readonly<CombatStatsSnapshot>;
}
export interface EnemyBullet extends Point {
  vx: number;
  vy: number;
  dmg: number;
  r: number;
  life: number;
  /** Issue #49：被飞刃反弹后标记为友方，可命中敌人 */
  reflected?: boolean;
  /**
   * 发射时攻击者快照（Combat Foundation S2 · PR #2 评审 P2-3）：
   * 发射者可能在命中前死亡/移除，因此存快照而非敌人引用；必须可选，
   * 未携带时（如手工构造）对象结构与 v8 对照一致。
   */
  stats?: Readonly<CombatStatsSnapshot>;
}
export interface Gem extends Point {
  vx: number;
  vy: number;
  v: number;
  e?: boolean;
  auto?: boolean;
}
/** 宝箱（#15）：掉落在地等待拾取，波次结束时统一吸附加收，休整期开启 */
export interface BurnZone extends Point {
  R: number;
  t: number;
}
export interface Box extends Point {
  /** 波次结束后自动飞向玩家 */
  auto?: boolean;
  /** Issue #48：BOSS 掉落的特殊宝箱（+2 宝箱点数，不占普通掉落上限） */
  special?: boolean;
}
export interface Particle extends Point {
  vx: number;
  vy: number;
  life: number;
  c: string;
}
export interface FloatingText extends Point {
  s: string;
  c: string;
  life: number;
  vy: number;
  big: boolean;
}
export interface Meteor extends Point {
  t: number;
  R: number;
}
export interface Bolt {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  life: number;
}
/** 近战刀光（纯表现，不参与判定） */
export interface Slash extends Point {
  /** 中心方向（弧度） */
  a: number;
  /** 张角（弧度），2π 表示全向 */
  arc: number;
  /** 半径 */
  r: number;
  /** 剩余寿命 */
  life: number;
  /** 初始寿命，用于插值 */
  max: number;
  /** 颜色 */
  c: string;
}
export interface HitOptions {
  noCrit?: boolean;
  noChain?: boolean;
  src?: DamageSource;
  fromExplode?: boolean;
  /** Combat Foundation S2（§5）：伤害属性，缺省 physical；所有既有调用点均已显式声明 */
  type?: DamageTypeId;
  /** Combat Foundation S2（§5）：攻击方式，缺省 other */
  form?: AttackForm;
  /** 发射时攻击者快照（S3-B）：玩家弹丸命中按发射时属性结算；缺省读当前实体 */
  attackerStats?: Readonly<CombatStatsSnapshot>;
}
export interface PlayerHitOptions {
  melee?: boolean;
  src?: Enemy;
  /** Combat Foundation S2（§5）：伤害属性，缺省 physical（接触=physical/melee、弹幕=physical/ranged、自爆=fire/other） */
  type?: DamageTypeId;
  /** Combat Foundation S2（§5）：攻击方式，缺省 other */
  form?: AttackForm;
  /** 发射时/引爆时攻击者快照（PR #2 评审 P2-3）：优先于 opts.src 构造默认快照 */
  attackerStats?: Readonly<CombatStatsSnapshot>;
}
export interface Slot {
  u: Talent;
  used: boolean;
}
export interface GameView {
  reset(): void;
  started(): void;
  paused(paused: boolean): void;
  stats(open: boolean): void;
  level(): void;
  /** 属性四选一面板（S1）。与 level() 分开：卡片内容与快捷键数量都不同。 */
  attr(): void;
  rest(): void;
  over(): void;
}
export const silentView: GameView = {
  reset() {},
  started() {},
  paused() {},
  stats() {},
  level() {},
  attr() {},
  rest() {},
  over() {},
};
