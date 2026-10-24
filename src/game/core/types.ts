export type Mode = "start" | "play" | "stats" | "pause" | "over";
export type Panel = "level" | "rest" | "box" | null;
export type GameState = Mode | "levelup" | "report" | "swap";
export type WavePhase = "fight" | "collect" | "rest";
export type DamageSource =
  | "bullet"
  | "orbit"
  | "chain"
  | "meteor"
  | "explode"
  | "thorns"
  | "burn"
  | "melee";
export type DamageTotals = Record<DamageSource, number>;
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
}
export interface Gem extends Point {
  vx: number;
  vy: number;
  v: number;
  e?: boolean;
  auto?: boolean;
}
/** 宝箱（#15）：掉落在地等待拾取，波次结束时统一吸附加收，休整期开启 */
export interface Box extends Point {
  /** 波次结束后自动飞向玩家 */
  auto?: boolean;
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
}
export interface PlayerHitOptions {
  melee?: boolean;
  src?: Enemy;
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
