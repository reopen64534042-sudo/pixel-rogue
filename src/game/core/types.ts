import type { DamageTypeId } from "../data/damageTypes";
export type Mode = "start" | "play" | "stats" | "pause" | "over";
export type Panel = "level" | "rest" | "box" | null;
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
  pierce: number;
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
}
export interface Talent {
  hidden?: number;
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
}
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
}
export interface Bullet extends Point {
  vx: number;
  vy: number;
  dmg: number;
  pierce: number;
  life: number;
  size: number;
  jumps: number;
  hitList: Enemy[];
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
  rest(): void;
  over(): void;
}
export const silentView: GameView = {
  reset() {},
  started() {},
  paused() {},
  stats() {},
  level() {},
  rest() {},
  over() {},
};
