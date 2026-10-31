import type { CombatStatsSnapshot, Enemy, Point } from "../core/types";

/** 激光的节奏、几何与成长配置；伤害公式集中在 DamageMath / combatBalance。 */
export const LASER = {
  duration: 1,
  recharge: 0.3,
  width: 4,
  turnRate: 8,
  tick: 0.1,
  procInterval: 0.4,
  textInterval: 0.4,
  focusTime: 0.8,
  focusGrace: 0.15,
  xpPerSecond: 1,
  xpPerCycle: 1,
  lifeStealHpPerSecond: 0.02,
  afterglowLife: 0.25,
  afterglowInterval: 0.15,
  echoLife: 0.3,
  // 三束余辉 / 残像 / 脉冲各自保留原寿命，避免挤掉另一束的对象。
  auxCap: 24,
  escapeRange: 25,
  escapeArc: Math.PI * 0.85,
  escapeCooldown: 3,
  escapeKnock: 18,
  pressureKnock: 1.5,
  coolingDash: 0.5,
  recyclePerKill: 0.03,
  recycleCap: 0.15,
} as const;

/** 单位为主束有效照射秒数，多目标与附属光束均不加速。 */
export const LASER_XP: readonly (number | null)[] = [
  5, 9, 14, 20, 27, 35, 44, 54, 65, 77, 90, null,
];

export const LASER_UPGRADES = [
  { id: "wide", name: "扩束镜", desc: "所有主光束宽度 +50%", minLevel: 4 },
  { id: "long", name: "长焦镜", desc: "光束射程 +25%", minLevel: 4 },
  { id: "capacitor", name: "储能电容", desc: "每轮照射延长至 1.3 秒；单轮经验上限仍为 1 秒", minLevel: 4 },
  { id: "cooling", name: "快速回充", desc: "回充时间 0.3 → 0.2 秒", minLevel: 5 },
  { id: "stable", name: "稳束器", desc: "光束转向速度 +35%", minLevel: 5 },
  { id: "afterglow", name: "余辉轨迹", desc: "每 0.15 秒留下一段 0.25 秒低伤余辉，不提供武器经验或命中特效", minLevel: 5 },
  { id: "pierce", name: "透射镜", desc: "贯穿每个目标后保留伤害 80% → 90%", minLevel: 7 },
  { id: "triple", name: "三联激光", desc: "3 束激光各自索敌、独立转向，优先照射不同敌人；目标不足时可集火。每束 100% 伤害与完整射程，经验及触发上限共用", minLevel: 10 },
  { id: "collapse", name: "坍缩脉冲", desc: "每轮照射结束，沿当前方向额外释放一次贯穿脉冲", minLevel: 11 },
] as const;
export type LaserUpgradeId = (typeof LASER_UPGRADES)[number]["id"];

export type LaserLane = -1 | 0 | 1;

export interface LaserLine extends Point {
  x2: number;
  y2: number;
  width: number;
  kind: "main" | "afterglow" | "echo" | "pulse";
  /** 同一轮的主束 / 副束 1 / 副束 2；编号不限制空间方向。 */
  lane?: LaserLane;
  /** 只供绘制区分脉冲形态，不参与命中与伤害。 */
  pulse?: "collapse" | "meltdown" | "scatter";
  /** 附属光束固化的每秒原始伤害；主束由实际照射时间积算。 */
  dps: number;
  stats: Readonly<CombatStatsSnapshot>;
  t: number;
  max: number;
}

export interface LaserAim {
  angle: number;
  aimReady: boolean;
  target: Enemy | null;
  focus: number;
  focusMiss: number;
}

/** 主束瞄准态由自身持有，两个副束各持有自己的状态；没有同步副本。 */
export interface LaserState extends LaserAim {
  sideAims: Record<-1 | 1, LaserAim>;
  phase: "idle" | "channel" | "recharge";
  remaining: number;
  total: number;
  tickT: number;
  cycleXp: number;
  recycle: number;
  healBudget: number;
  heals: { at: number; amount: number }[];
  afterglowT: number;
  escapeCd: number;
  dashCoolingUsed: boolean;
  dps: number;
  stats: Readonly<CombatStatsSnapshot> | null;
  lines: LaserLine[];
  /** 当前主束真实相交点的只读表现快照；不参与结算。 */
  contacts: { x: number; y: number; target: boolean; lane?: LaserLane }[];
  aux: LaserLine[];
  pendingMain: Map<Enemy, number>;
  pendingAux: Map<Enemy, Map<Readonly<CombatStatsSnapshot>, number>>;
  procs: Map<Enemy, { next: number; crit: boolean }>;
  texts: Map<Enemy, { amount: number; crit: boolean; next: number }>;
}

function createLaserAim(): LaserAim {
  return { angle: 0, aimReady: false, target: null, focus: 0, focusMiss: 0 };
}

export function getLaserAim(state: LaserState, lane: LaserLane = 0): LaserAim {
  return lane === 0 ? state : state.sideAims[lane];
}

export function createLaserState(): LaserState {
  return {
    ...createLaserAim(),
    sideAims: { [-1]: createLaserAim(), [1]: createLaserAim() },
    phase: "idle", remaining: 0, total: 0, tickT: 0, cycleXp: 0,
    recycle: 0, healBudget: 0, heals: [], afterglowT: 0, escapeCd: 0,
    dashCoolingUsed: false, dps: 0, stats: null, lines: [], contacts: [], aux: [], pendingMain: new Map(),
    pendingAux: new Map(), procs: new Map(), texts: new Map(),
  };
}
