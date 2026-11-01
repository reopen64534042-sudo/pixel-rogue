import type {CombatStatsSnapshot,Enemy,Point} from '../core/types';
import type {DomainSoundId} from './domainAudio';
import {ATTRIBUTE_CAPS} from './attributeBalance';

export const DOMAIN={
  castInterval:.9,deploy:.25,collapse:.35,collapseLock:2.5,
  fieldRadius:50,fieldLife:3,fieldTick:.25,fieldSlow:.30,fieldPull:40,
  holeRadius:55,holeLife:1,holeTick:.2,holeSlow:.50,holePullMul:2.2,
  fieldSlash:.1,holeSlash:.1,slashNumberPeriod:.3,slashSoundPeriod:.12,slashTrailLife:.09,voidTitleGap:1.2,
  infoBuild:.2,infoHold:.9,infoRecovery:.8,infoDecay:.35,
  holeMove:24,holeSeekRange:240,holeRetarget:.2,holeSwitchMargin:16,root:1,
  ccCap:1.2,slowCap:.75,ccReset:3,ccImmunity:2,
  ccDiminishing:[1,.5,.25] as const,
  valueBase:100,valueCap:ATTRIBUTE_CAPS.domainValue,shieldLife:3,shieldCap:.15,
  escapeLife:1.5,escapeBase:.2,refundPerKill:.1,refundCap:.3,
  dashCooldown:4,dashLife:.6,dashRadius:30,
  remnantLife:1.2,echoPerKill:.08,echoCap:.4,
  maxLevel:12,
} as const;
/** Per-level successful black-hole formation hits, not cumulative totals. */
export const DOMAIN_XP=[8,12,18,24,32,42,54,68,84,102,122] as const;
export const DOMAIN_UNLOCK_LEVELS={slash:4,void:5} as const;
export const DOMAIN_UPGRADE_STATS={
  radius:1.15,pull:1.25,duration:.6,extensionRadius:1.15,extensionSlow:.05,
  horizonRadius:1.1,horizonSlow:.1,confluencePull:1.5,
} as const;
export const DOMAIN_MILESTONES=[
  {id:'slash',name:'斩击领域',minLevel:DOMAIN_UNLOCK_LEVELS.slash,desc:'固定解锁：领域与黑洞每 0.1 秒斩击域内所有敌人，每个命中目标身上连续出现刀光；重叠目标同轮一刀，数字按 0.3 秒合并，不限制目标数'},
  {id:'void',name:'无量空处',minLevel:DOMAIN_UNLOCK_LEVELS.void,desc:'固定解锁：展开深空领域，信息灌满后目标连续过载停滞，期间暂停自主行动和领域牵引，恢复后继续吸入；附加信息侵蚀伤害，共享递减/Boss 硬控免疫保留'},
] as const;
export const DOMAIN_RANDOM_UPGRADES=[
  {id:'radius',name:'奇点半径',minLevel:2,desc:'普通领域与黑洞半径 +15%'},
  {id:'pull',name:'引力增幅',minLevel:2,desc:'普通领域与黑洞牵引 +25%，黑洞巡游速度 24 → 30px/s'},
  {id:'duration',name:'视界扩张',minLevel:6,desc:'黑洞持续 +0.6 秒，基础 1.0 → 1.6 秒'},
  {id:'projection',name:'质量投射',minLevel:6,desc:'领域、连斩与黑洞攻击力伤害 +20%，不放大生命压缩'},
  {id:'extension',name:'领域延展',minLevel:3,desc:'领域半径 +15%，减速 +5 个百分点'},
  {id:'horizon',name:'事件视界',minLevel:6,desc:'普通领域与黑洞减速 +10 个百分点，黑洞半径 +10%'},
  {id:'ember',name:'奇点余烬',minLevel:7,desc:'自然结束留下 1.2 秒、40% 跳伤与牵引的余烬'},
  {id:'confluence',name:'引力汇流',minLevel:9,desc:'收拢牵引 ×1.5；重叠领域的第二份跳伤由 60% 提至 80%，连斩仍去重，始终三领域坍缩'},
  {id:'terminal',name:'终末奇点',minLevel:11,desc:'自然结束追加 120% 攻击引力爆发，不暴击'},
] as const;
export const DOMAIN_UPGRADES=[...DOMAIN_MILESTONES,...DOMAIN_RANDOM_UPGRADES] as const;
export type DomainUpgradeId=typeof DOMAIN_UPGRADES[number]['id'];
export const DOMAIN_TALENT_NAMES=['引力核心','坍缩理论','静滞增幅','裂界增幅','禁锢','引力护盾','逃逸速度',
  '质量回收','重力碾压','绝对引力','回响奇点','视界共振','质量聚焦','奇点步','质量虹吸'] as const;
export type DomainTalentName=typeof DOMAIN_TALENT_NAMES[number];

/** Per-entity immutable combat/art snapshot; never reads live upgrades after birth. */
export interface DomainSnapshot {
  damage:number;level:number;power:number;M:number;B:number;F:number;range:number;
  fieldR:number;fieldLife:number;fieldSlow:number;fieldPull:number;
  holeR:number;holeLife:number;holeSlow:number;holePull:number;holeMove:number;collapsePull:number;
  armorPen:number;cards:readonly DomainTalentName[];upgrades:readonly DomainUpgradeId[];
  attacker:Readonly<CombatStatsSnapshot>;
}
export interface GravityField extends Point {
  id:number;age:number;life:number;tick:number;stats:DomainSnapshot;
  fromX:number;fromY:number;
}
export interface DomainHole extends Point {
  id:number;age:number;life:number;tick:number;slash:number;pulse:number;
  extension:number;stats:DomainSnapshot;
  seek?:Point&{target:Enemy;nextAt:number};
}
export interface DomainResidual extends Point {
  id:number;age:number;life:number;tick:number;stats:DomainSnapshot;
}
export interface DomainVortex extends Point {
  age:number;life:number;M:number;
}
export interface DomainEffect extends Point {
  id:number;kind:'birth'|'terminal'|'slash'|'voidExpansion'|'stun'|'overload'|'bind'|'shield'|'siphon';
  age:number;life:number;radius:number;target?:Enemy;angle?:number;
}
export interface DomainWeaponState {
  level:number;xp:number;upgrades:DomainUpgradeId[];
  nextId:number;castCd:number;
  deployment:(Point&{age:number})|null;
  fields:GravityField[];
  /** Current fixed-step walking constraints; external knockback/committed dashes are separate. */
  fieldPullCenters:Map<Enemy,Point>;
  /** Focus is independent of the captured list used for control, shields and mass. */
  collapse:(Point&{age:number;fromAge:number;target:Enemy|null;targets:Enemy[];stats:DomainSnapshot})|null;
  collapseLockedUntil:number;blackHole:DomainHole|null;remnant:DomainResidual|null;vortex:DomainVortex|null;
  fieldSlash:number;slashSequence:number;refundUsed:number;
  slashNumbers:Map<Enemy,{amount:number;x:number;y:number;until:number}>;
  voidTitleAt:number;
  shield:number;shieldUntil:number;escapeUntil:number;escapeBonus:number;dashReadyAt:number;hurtUntil:number;
  effects:DomainEffect[];soundAt:Map<DomainSoundId,number>;
}
export function createDomainState():DomainWeaponState {
  return {level:1,xp:0,upgrades:[],nextId:1,castCd:0,deployment:null,fields:[],fieldPullCenters:new Map(),collapse:null,
    collapseLockedUntil:0,blackHole:null,remnant:null,vortex:null,fieldSlash:0,slashSequence:0,refundUsed:0,
    slashNumbers:new Map(),voidTitleAt:-1000,
    shield:0,shieldUntil:0,escapeUntil:0,escapeBonus:0,dashReadyAt:0,hurtUntil:0,effects:[],soundAt:new Map()};
}
export const domainHas=(s:DomainSnapshot,name:DomainTalentName)=>s.cards.includes(name);
export const domainUpgrade=(s:DomainSnapshot,id:DomainUpgradeId)=>s.upgrades.includes(id);
export const domainXpNext=(level:number)=>level>=DOMAIN.maxLevel?0:DOMAIN_XP[Math.max(0,level-1)];
