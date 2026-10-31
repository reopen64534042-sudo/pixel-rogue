import type { CombatStatsSnapshot, Enemy } from "../core/types";

export const MISSILE = {
  reload: 1.1, eject: 0.12, ignite: 0.18, ejectSpeed: 90, turnRate: 7.5,
  mainRadius: 28, microRadius: 12, resonanceRadius: 14, microSpeed: 1.2,
  life: 2.4, pathRange: 1.6, mainHitRadius: 2, microHitRadius: 1,
  twinDelay: 0.08, microDelay: 0.05, cycle: 3, microCount: 3,
  beaconLife: 6, decodeThreshold: 3, decodeCost: 2, pursuitCooldown: 1.5,
  ammoCap: 3, chargeLife: 8, chargeThreshold: 3, chargeCost: 2,
  arcRange: 0.35, arcRoots: 2, escapeRange: 24, escapeArc: Math.PI * 2 / 3,
  escapeKnock: 12, escapeCooldown: 3.5, mainKnock: 10, microKnock: 3,
  dashReload: 0.65, armorWindow: 0.35, clearedBullets: 2,
  groundLife: 1.6, groundTick: 0.2, groundRadius: 0.55, trailLife: 0.24,
  healHpPerSecond: 0.02,
} as const;

export const MISSILE_XP: readonly (number | null)[] = [4, 7, 11, 16, 22, 29, 37, 46, 56, 67, 79, null];
export const MISSILE_UPGRADES = [
  { id: "radius", name: "扩容战斗部", minLevel: 4, desc: "主弹、小弹与共振半径 +20%" },
  { id: "range", name: "远程火控", minLevel: 4, desc: "索敌射程 +20%，路径预算与电弧距离同步增长" },
  { id: "vector", name: "矢量喷口", minLevel: 4, desc: "所有制导弹转向速度 +35%" },
  { id: "motor", name: "助推发动机", minLevel: 5, desc: "所有制导弹巡航速度 +25%" },
  { id: "eject", name: "快速出舱", minLevel: 5, desc: "出舱时间 0.12 → 0.08 秒" },
  { id: "reload", name: "自动装填机", minLevel: 5, desc: "装填间隔缩短 15%" },
  { id: "liner", name: "高密度衬层", minLevel: 7, desc: "基础主弹及其派生参考伤害 +12%" },
  { id: "twin", name: "双联挂架", minLevel: 10, desc: "每轮错时发射 2 枚主弹，各 65% 伤害；经验与派生预算共用" },
  { id: "pressure", name: "重型增压弹", minLevel: 11, desc: "每第 3 轮主弹伤害 ×1.35、半径 ×1.15，不倍增附属输出" },
] as const;
export type MissileUpgradeId = (typeof MISSILE_UPGRADES)[number]["id"];
export const MISSILE_TALENT_NAMES = ["猎杀信标", "弱点破译", "终结指令", "蜂巢弹舱", "分导协同", "蜂群回收", "离子战斗部", "电弧接力", "过载共振", "惯性装填", "近炸保险", "弹幕掩护", "余烬滞留", "应急装甲"] as const;
export type MissileTalentName = (typeof MISSILE_TALENT_NAMES)[number];
export type MissileSource = "main" | "swarm" | "recovered" | "pursuit";
export type MissileVisual = "heavy" | "micro" | "ion";

/** Shared mutable bookkeeping belongs to one volley; all offensive values are launch snapshots. */
export interface MissileVolley {
  id: number; damage: number; stats: Readonly<CombatStatsSnapshot>; lifesteal: number;
  traits: Readonly<Record<MissileTalentName, boolean>>;
  range: number; mainRadius: number; microRadius: number; resonanceRadius: number;
  speed: number; turn: number; eject: number; twin: boolean; ion: boolean; pressure: boolean;
  critical: boolean; xpGiven: boolean; contactUsed: boolean; arcUsed: boolean; chaseUsed: boolean;
  cleared: number; charged: Set<Enemy>; arcVisited: Set<Enemy>; roots: Enemy[];
}
export interface GuidedMissile {
  x: number; y: number; angle: number; target: Enemy | null; born: number; age: number;
  pathLeft: number; volley: MissileVolley; source: MissileSource; radius: number; alive: boolean;
  trail: { x: number; y: number; at: number }[];
}
export interface PendingMissile {
  at: number; volley: MissileVolley; source: "main" | "swarm" | "recovered"; slot: number;
}
export interface MissileGround {
  x: number; y: number; radius: number; dps: number; born: number; until: number;
  stats: Readonly<CombatStatsSnapshot>;
}
export interface MissileWeaponState {
  level: number; xp: number; upgrades: MissileUpgradeId[]; rounds: number; nextId: number;
  reload: number; reloadTotal: number; armorUntil: number; dashUsed: boolean;
  ammo: number; reservedAmmo: number; chaseUntil: number; escapeUntil: number;
  beacon: Enemy | null; beaconUntil: number; decode: number;
  charges: Map<Enemy, { count: number; until: number }>;
  flights: GuidedMissile[]; pending: PendingMissile[]; grounds: MissileGround[];
  groundTick: number; groundDamage: Map<Enemy, Map<Readonly<CombatStatsSnapshot>, number>>;
  heals: { at: number; amount: number }[]; lastVolley: MissileVolley | null;
  launches: { x: number; y: number; angle: number; at: number; micro: boolean }[];
  impacts: { x: number; y: number; at: number; radius: number; look: MissileVisual }[];
  arcs: { x: number; y: number; x2: number; y2: number; at: number }[];
  escapes: { x: number; y: number; angle: number; at: number }[];
}
export function createMissileState(): MissileWeaponState {
  return { level: 1, xp: 0, upgrades: [], rounds: 0, nextId: 0, reload: 0, reloadTotal: MISSILE.reload,
    armorUntil: 0, dashUsed: false, ammo: 0, reservedAmmo: 0, chaseUntil: 0, escapeUntil: 0,
    beacon: null, beaconUntil: 0, decode: 0, charges: new Map(), flights: [], pending: [], grounds: [],
    groundTick: 0, groundDamage: new Map(), heals: [], lastVolley: null, launches: [], impacts: [], arcs: [], escapes: [] };
}
