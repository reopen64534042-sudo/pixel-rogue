import { DOMAIN as C, DOMAIN_UPGRADE_STATS as U, DOMAIN_TALENT_NAMES, DOMAIN_MILESTONES, DOMAIN_RANDOM_UPGRADES, createDomainState, domainHas, domainUpgrade, domainXpNext,
  type DomainEffect, type DomainHole, type DomainSnapshot, type DomainTalentName, type GravityField } from '../data/domain';
import { DOMAIN_UPGRADE_AUDIO, type DomainSoundId } from '../data/domainAudio';
import { DOMAIN_DAMAGE } from '../data/combatBalance';
import { PLAYER_ATTACK_PROFILES as PA } from '../data/attackProfiles';
import { WORLD, clamp } from '../data/constants';
import { getPlayerCombatStats } from './CombatStats';
import { bossInvulnerable } from './BossSystem';
import { domainBlackHoleMultiplier, domainCurrentHpDamage, domainDamage, domainTickDamage, domainFieldDamage, domainFieldPower, domainWeaponMultiplier, domainAttackPower,
  domainHealingCap, domainOverlapDamage, domainPrimaryHealing, domainSiphonHealing } from './DamageMath';
import type { GameCore } from './GameCore';
import type { Enemy, Point } from './types';

export const isDomain=(c:GameCore)=>c.prof==='mage' && c.mageWeapon==='domain';
const valid=(e:Enemy)=>!e.dead && e.burrowState===undefined;
const near=(e:Point,p:Point,r:number)=>Math.hypot(e.x-p.x,e.y-p.y)<=r;
const domainStunned=(c:GameCore,e:Enemy)=>!e.boss && (e.domainStunUntil??0)>c.time;
export const domainFieldRadius=(c:GameCore,f:GravityField)=>f.stats.fieldR*(c.domain.collapse?Math.max(.1,1-c.domain.collapse.age/C.collapse):1);

export function domainSnapshot(c:GameCore,captured=0):DomainSnapshot {
  const p=c.player, cards=DOMAIN_TALENT_NAMES.filter(n=>p.picks.includes(n)), upgrades=[...c.domain.upgrades];
  const has=(n:DomainTalentName)=>cards.includes(n), up=(id:typeof upgrades[number])=>upgrades.includes(id);
  const M=clamp(p.domainValue??100,100,C.valueCap)/100;
  const pull=C.fieldPull*M, theory=has('坍缩理论')?1.25:1, binding=has('禁锢')?1.2:1;
  const s:DomainSnapshot={damage:p.damage,level:c.domain.level,power:domainWeaponMultiplier(c.domain.level),M,B:1,F:has('质量聚焦')?DOMAIN_DAMAGE.focus:1,range:p.attackRange,
    fieldR:C.fieldRadius*p.area*(up('radius')?U.radius:1)*(up('extension')?U.extensionRadius:1)*(has('质量聚焦')?.85:1),
    fieldLife:C.fieldLife+(has('视界共振') && c.domain.blackHole?.life ? .5:0),
    fieldSlow:Math.min(C.slowCap,(C.fieldSlow+(up('extension')?U.extensionSlow:0)+(up('horizon')?U.horizonSlow:0))*M),
    fieldPull:pull*(up('pull')?U.pull:1)*(has('视界共振') && c.domain.blackHole?1.3:1),
    holeR:C.holeRadius*p.area*(up('radius')?U.radius:1)*(up('horizon')?U.horizonRadius:1),
    holeLife:C.holeLife+(up('duration')?U.duration:0)+(has('坍缩理论')?.4:0),
    holeSlow:Math.min(C.slowCap,(C.holeSlow+(up('horizon')?U.horizonSlow:0))*M),
    holePull:pull*C.holePullMul*theory*binding*(up('pull')?U.pull:1),
    holeMove:C.holeMove*(up('pull')?U.pull:1),
    collapsePull:pull*1.6*theory*binding*(up('confluence')?U.confluencePull:1),
    armorPen:has('重力碾压')?DOMAIN_DAMAGE.armorPen:0,cards,upgrades,attacker:getPlayerCombatStats(p)};
  s.B=domainBlackHoleMultiplier(s,captured);
  return s;
}
export function domainSound(c:GameCore,id:DomainSoundId,gap=.08) {
  if ((c.domain.soundAt.get(id)??-Infinity)>c.time-gap) return;
  c.domain.soundAt.set(id,c.time);c.audio.domainSound(id);
}
function effect(c:GameCore,kind:DomainEffect['kind'],p:Point,radius:number,life=.3,target?:Enemy) {
  const event:DomainEffect={x:p.x,y:p.y,id:c.domain.nextId++,kind,age:0,life,radius,target,
    angle:c.domain.slashSequence++*2.39996};
  c.domain.effects.push(event);
  return event;
}
function announceVoid(c:GameCore,p:Point,s:DomainSnapshot,radius=s.fieldR) {
  if (!domainUpgrade(s,'void')) return;
  effect(c,'voidExpansion',p,radius,.6);
  if (c.time-c.domain.voidTitleAt<C.voidTitleGap) return;
  c.domain.voidTitleAt=c.time;
  const text=c.addText(p.x,p.y-radius-7,'无量空处','#9fe1ff',true);
  text.life=.65;text.vy=-7;
}
function slashSound(c:GameCore) {
  const ids=['slash-a','slash-b','slash-c'] as const;
  const previous=Math.max(...ids.map(id=>c.domain.soundAt.get(id)??-1000));
  if (c.time-previous<C.slashSoundPeriod) return;
  domainSound(c,ids[c.domain.slashSequence%3],0);
}
function emitSlashNumber(c:GameCore,e:Enemy) {
  const number=c.domain.slashNumbers.get(e);
  if (!number) return;
  c.domain.slashNumbers.delete(e);
  if (number.amount<=0) return;
  const text=c.addText(number.x,number.y,Math.max(1,Math.round(number.amount)),'#e8e8f0');
  text.domainDmg='slash';text.domainMaxLife=.32;text.life=.32;
}
function flushSlashNumbers(c:GameCore) {
  for (const [e,number] of c.domain.slashNumbers)
    if (e.dead || c.time+1e-8>=number.until) emitSlashNumber(c,e);
}
export function clearDomainTransient(c:GameCore,preservePresentation=false) {
  const old=c.domain;
  c.domain={...createDomainState(),level:old.level,xp:old.xp,upgrades:old.upgrades,nextId:old.nextId};
  if (preservePresentation) c.domain.effects=old.effects;
  for (const e of c.enemies) {
    delete e.domainStunUntil;delete e.domainRootUntil;delete e.domainCcLevel;delete e.domainCcResetAt;
    delete e.domainImmuneUntil;delete e.domainPulseAt;delete e.domainInside;delete e.domainSlowF;
    delete e.domainDamageAt;delete e.domainDamageUntil;
    delete e.domainInfo;delete e.domainOverloadReadyAt;
  }
  if (preservePresentation) c.audio.setDomainAmbient(null);else c.audio.stopDomainAudio();
}
function levelUp(c:GameCore) {
  c.domain.level++;
  const milestone=DOMAIN_MILESTONES.find(u=>u.minLevel===c.domain.level);
  const pool=milestone?[milestone]:DOMAIN_RANDOM_UPGRADES.filter(u=>u.minLevel<=c.domain.level && !c.domain.upgrades.includes(u.id));
  if (!pool.length) return;
  const u=milestone??pool[Math.floor(Math.random()*pool.length)];
  c.domain.upgrades.push(u.id);
  c.addText(c.player.x,c.player.y-24,u.name,'#b05cff',true);
  domainSound(c,DOMAIN_UPGRADE_AUDIO[u.name]);
}
export function devSetDomainLevel(this:GameCore,level:number) {
  if (!isDomain(this)) return;
  clearDomainTransient(this);this.domain.level=1;this.domain.xp=0;this.domain.upgrades=[];
  const target=clamp(Math.floor(level),1,C.maxLevel);
  while (this.domain.level<target) levelUp(this);
}
/** Called once after a black-hole formation burst actually damages at least one target. */
function gainBlackHoleHitXp(c:GameCore) {
  if (c.tutorialMode) return;
  const s=c.domain;
  if (s.level>=C.maxLevel) return;
  s.xp++;
  while (s.level<C.maxLevel && s.xp>=domainXpNext(s.level)) {
    s.xp-=domainXpNext(s.level);levelUp(c);
  }
}
/** Nearest live target wins each cast; existing fields never offset or reserve its landing. */
function selectLanding(c:GameCore):Point|null {
  const p=c.player,target=c.nearestEnemy(p.x,p.y,p.attackRange);
  if (!target) return null;
  // Keep the existing deployment lead, clamped to the world and cast range.
  const dx=clamp(target.x+(target.vx??0)*C.deploy,20,WORLD.w-20)-p.x;
  const dy=clamp(target.y+(target.vy??0)*C.deploy,20,WORLD.h-20)-p.y;
  const distance=Math.hypot(dx,dy),scale=distance>p.attackRange?p.attackRange/distance:1;
  return {x:p.x+dx*scale,y:p.y+dy*scale};
}

function canFocusCollapse(c:GameCore,e:Enemy,range:number):boolean {
  return valid(e) && e.hp>0 && !bossInvulnerable(c,e) && near(e,c.player,range);
}
/** Boss first, then captured enemies, then other nearby enemies; nearest wins each tier. */
function selectCollapseTarget(c:GameCore,targets:readonly Enemy[],range:number):Enemy|null {
  const captured=new Set(targets);
  let target:Enemy|null=null,priority=Infinity,distance=Infinity;
  for (const e of c.enemies) {
    if (!canFocusCollapse(c,e,range)) continue;
    const rank=e.boss?0:captured.has(e)?1:2,dist=Math.hypot(e.x-c.player.x,e.y-c.player.y);
    if (rank<priority || rank===priority && dist<distance) {target=e;priority=rank;distance=dist;}
  }
  return target;
}
/** Follow a valid lock; only losing it permits reselection, without extending collapse time. */
function updateCollapseFocus(c:GameCore) {
  const collapse=c.domain.collapse;
  if (!collapse) return;
  if (!collapse.target || !c.enemies.includes(collapse.target) || !canFocusCollapse(c,collapse.target,collapse.stats.range)) {
    const target=selectCollapseTarget(c,collapse.targets,collapse.stats.range);
    if (target) {
      collapse.fromAge=collapse.age;
      for (const f of c.domain.fields) {f.fromX=f.x;f.fromY=f.y;}
    }
    collapse.target=target;
  }
  if (collapse.target) {collapse.x=collapse.target.x;collapse.y=collapse.target.y;}
  // With no target, x/y retain the last legal position (or the initial centroid).
}

type CcRequest={stun:number;root:number};
function request(cc:Map<Enemy,CcRequest>,e:Enemy,kind:keyof CcRequest,base:number,M:number) {
  if (e.boss || !valid(e)) return;
  const r=cc.get(e)??{stun:0,root:0};
  r[kind]=Math.max(r[kind],Math.min(C.ccCap,base*M)*(e.elite?.5:1));cc.set(e,r);
}
function applyCc(c:GameCore,cc:Map<Enemy,CcRequest>) {
  for (const [e,r] of cc) {
    if (!valid(e) || (e.domainImmuneUntil??0)>c.time) continue;
    const level=e.domainCcLevel??0, mul=C.ccDiminishing[level];
    if (!r.stun && !r.root) continue;
    const stunEnd=r.stun?Math.max(e.domainStunUntil??0,c.time+r.stun*mul):e.domainStunUntil??0;
    const rootEnd=r.root?Math.max(e.domainRootUntil??0,c.time+r.root*mul):e.domainRootUntil??0;
    if (stunEnd<=(e.domainStunUntil??0) && rootEnd<=(e.domainRootUntil??0)) continue;
    e.domainStunUntil=stunEnd;e.domainRootUntil=rootEnd;
    if (r.stun) {e.domainOverloadReadyAt=stunEnd+C.infoRecovery;e.domainInfo=0;}
    e.domainCcResetAt=c.time+C.ccReset;
    if (level===2) e.domainImmuneUntil=Math.max(e.domainStunUntil??0,e.domainRootUntil??0)+C.ccImmunity;
    else e.domainCcLevel=(level+1) as 1|2;
    effect(c,r.stun?'overload':'bind',e,e.r+5,.35,e);
    domainSound(c,r.stun?'void-stun':'binding-lock',.18);
  }
}
/** One information load per target, even when several fields/the hole overlap. */
function information(c:GameCore,dt:number,cc:Map<Enemy,CcRequest>) {
  const d=c.domain;
  for (const e of c.enemies) {
    if (!valid(e) || e.boss) {e.domainInfo=0;continue;}
    let M=0;
    if (!d.collapse) for (const f of d.fields)
      if (domainUpgrade(f.stats,'void') && near(e,f,f.stats.fieldR)) M=Math.max(M,f.stats.M);
    if (d.collapse && domainUpgrade(d.collapse.stats,'void') && d.collapse.targets.includes(e)) M=Math.max(M,d.collapse.stats.M);
    const h=d.blackHole;
    if (h && domainUpgrade(h.stats,'void') && near(e,h,h.stats.holeR)) M=Math.max(M,h.stats.M);
    if (!M) {e.domainInfo=Math.max(0,(e.domainInfo??0)-dt/C.infoDecay);continue;}
    if ((e.domainStunUntil??0)>c.time || (e.domainImmuneUntil??0)>c.time || (e.domainOverloadReadyAt??0)>c.time) {e.domainInfo=0;continue;}
    e.domainInfo=Math.min(1,(e.domainInfo??0)+dt*M/C.infoBuild);
    if (e.domainInfo>=1-1e-8) {
      request(cc,e,'stun',C.infoHold,M);e.domainInfo=0;
      e.domainOverloadReadyAt=c.time+C.infoBuild;
    }
  }
}
function echo(c:GameCore,h:DomainHole,killed:boolean) {
  if (!killed || !domainHas(h.stats,'回响奇点')) return;
  const add=Math.min(C.echoPerKill,C.echoCap-h.extension);
  if (add<=0) return;
  h.extension+=add;h.life+=add;domainSound(c,'echo-singularity',.2);
}
function hit(c:GameCore,e:Enemy,s:DomainSnapshot,amount:number,kind:'dot'|'slash'|'terminal',hole=false,origin?:Point) {
  const profile=kind==='terminal'?PA.domainTerminal:kind==='slash'
    ?hole?PA.domainHoleSlash:PA.domainFieldSlash:hole?PA.domainHole:PA.domainField;
  const result=c.hurtEnemy(e,amount,0,0,{src:'domain',...profile,continuous:true,
    kind:kind==='dot'?'dot':'hit',attackerStats:s.attacker,noCrit:kind!=='slash',noOnHit:true,
    noChain:true,noLifesteal:true,silent:kind==='dot'||kind==='slash',silentSound:true,noFlash:kind==='slash',
    armorPen:hole?s.armorPen:0,domainHit:kind==='dot'?undefined:kind,origin});
  if (kind==='dot' && !hole && result && result.effectiveHpLoss>0) {
    e.domainDamageAt=c.time;
    e.domainDamageUntil=c.time+.65;
  }
  if (c.tutorialMode && result && result.effectiveHpLoss>0) {
    const progress=c.tutorialDomain;
    if (kind==='dot' && !hole && c.time>progress.lastFieldHitAt+1e-8) {
      progress.fieldTicks++;progress.lastFieldHitAt=c.time;
    }
    if (kind==='slash' && c.time>progress.lastSlashHitAt+1e-8) {
      progress.slashTicks++;progress.lastSlashHitAt=c.time;
    }
  }
  return result;
}
function refund(c:GameCore,s:DomainSnapshot,killed:boolean) {
  if (!killed || !domainHas(s,'质量回收')) return;
  const add=Math.min(C.refundPerKill*s.M,C.refundCap-c.domain.refundUsed);
  if (add<=0) return;
  c.domain.refundUsed+=add;c.domain.castCd=Math.max(0,c.domain.castCd-add);
  domainSound(c,'mass-recycle',.2);
}
function slash(c:GameCore,e:Enemy,s:DomainSnapshot,h?:DomainHole,origin?:Point) {
  const result=hit(c,e,s,domainDamage(s,h?'holeSlash':'fieldSlash',!!e.boss,domainStunned(c,e)),'slash',!!h,h??origin);
  if (!result || c.state!=='play') return;
  if (result.settledDamage>0) {
    // Every accepted hit owns its cut, including the killing hit. No decorative empty-space cuts.
    const cut=effect(c,'slash',e,Math.min(24,Math.max(10,e.r+5)),C.slashTrailLife,e);
    cut.angle=(Math.round(c.time/C.fieldSlash)+Math.floor(e.seed))%2?.55:-.55;
    const number=c.domain.slashNumbers.get(e)??{amount:0,x:e.x,y:e.y-e.r-2,until:c.time+C.slashNumberPeriod};
    number.amount+=result.settledDamage;number.x=e.x;number.y=e.y-e.r-2;
    c.domain.slashNumbers.set(e,number);
    if (result.killed) emitSlashNumber(c,e);
  }
  if (h) echo(c,h,result.killed);else refund(c,s,result.killed);
}
function fieldSlashVolley(c:GameCore) {
  const selected=new Map<Enemy,{stats:DomainSnapshot;power:number;origin:Point}>();
  for (const f of c.domain.fields) if (domainUpgrade(f.stats,'slash')) {
    const radius=domainFieldRadius(c,f);
    for (const e of c.enemies) if (valid(e) && near(e,f,radius)) {
      const power=domainAttackPower(f.stats,domainDamage(f.stats,'fieldSlash',!!e.boss,domainStunned(c,e)));
      const old=selected.get(e);
      if (!old || power>old.power) selected.set(e,{stats:f.stats,power,origin:f});
    }
  }
  for (const [e,entry] of selected) slash(c,e,entry.stats,undefined,entry.origin);
  if (selected.size) slashSound(c);
}
function startCollapse(c:GameCore,cc:Map<Enemy,CcRequest>) {
  const d=c.domain,s=domainSnapshot(c),point={x:d.fields.reduce((v,f)=>v+f.x,0)/3,y:d.fields.reduce((v,f)=>v+f.y,0)/3};
  const targets=c.enemies.filter(e=>valid(e) && d.fields.some(f=>near(e,f,f.stats.fieldR)));
  const target=selectCollapseTarget(c,targets,s.range);
  d.collapse={x:target?.x??point.x,y:target?.y??point.y,age:0,fromAge:0,target,targets,stats:s};
  d.collapseLockedUntil=c.time+C.collapseLock;d.refundUsed=0;
  for (const f of d.fields) {f.fromX=f.x;f.fromY=f.y;}
  domainSound(c,'triangle-close');domainSound(c,'collapse-in');
  if (domainHas(s,'禁锢')) for (const e of targets) request(cc,e,'root',C.root,s.M);
  if (domainHas(s,'引力护盾') && targets.length) {
    const shield=Math.min(C.shieldCap,Math.min(.15,.05+targets.length*.01)*s.M)*c.player.maxhp;
    d.shield=Math.max(d.shield,shield);d.shieldUntil=c.time+C.shieldLife;
    effect(c,'shield',c.player,18,.4);domainSound(c,'gravity-shield');
  }
  if (domainHas(s,'逃逸速度')) {d.escapeUntil=c.time+C.escapeLife;d.escapeBonus=C.escapeBase*s.M;domainSound(c,'escape-boost');}
  if (domainHas(s,'坍缩理论')) domainSound(c,'collapse-theory',.3);
  if (domainHas(s,'引力核心') && targets.length) domainSound(c,'gravity-core');
  if (domainUpgrade(s,'confluence')) domainSound(c,'upgrade-confluence',.3);
}
function birth(c:GameCore) {
  const d=c.domain,collapse=d.collapse!;
  const s=domainSnapshot(c,collapse.targets.length);
  const h:DomainHole={x:collapse.x,y:collapse.y,id:d.nextId++,age:0,life:s.holeLife,tick:0,slash:0,pulse:0,extension:0,stats:s};
  d.fields=[];d.collapse=null;d.blackHole=h;
  let primaryLoss=0,count=0,critical=false,bossHit=false;
  for (const e of c.enemies) {
    if (!valid(e) || !near(e,h,s.holeR) || bossInvulnerable(c,e)) continue;
    const stunned=domainStunned(c,e);
    const result=c.hurtEnemy(e,domainDamage(s,'birth',!!e.boss,stunned),0,0,{src:'domain',...PA.domainBirth,continuous:true,
      attackerStats:s.attacker,noOnHit:true,noChain:true,noLifesteal:true,silentSound:true,armorPen:s.armorPen,domainHit:'collapse',origin:h,
      components:[{rawAmount:domainDamage(s,'true',!!e.boss,stunned),type:PA.domainTrue.type,skillId:PA.domainTrue.skillId,inheritBonuses:true},
        {rawAmount:domainCurrentHpDamage(s,e.hp),type:PA.domainCompression.type,skillId:PA.domainCompression.skillId,inheritBonuses:false}]});
    if (!result) continue;
    if (c.domain!==d || c.state!=='play') return;
    primaryLoss+=result.primaryHpLoss??0;if (result.effectiveHpLoss>0) count++;
    bossHit ||=!!e.boss && result.effectiveHpLoss>0;
    critical ||=result.isCritical;echo(c,h,result.killed);
  }
  const steal=domainPrimaryHealing(primaryLoss,c.player.lifesteal,c.player.maxhp);
  const siphon=count && domainHas(s,'质量虹吸')?domainSiphonHealing(s,count,c.player.maxhp):0;
  const heal=Math.min(domainHealingCap(c.player.maxhp),steal+siphon,c.player.maxhp-c.player.hp);
  if (heal>0) {c.player.hp+=heal;if (siphon) {effect(c,'siphon',c.player,20,.4);domainSound(c,'mass-siphon');}}
  effect(c,'birth',h,s.holeR,.45);c.shake=Math.min(6,c.shake+3);
  announceVoid(c,h,s,s.holeR);
  domainSound(c,'blackhole-impact');
  const layers:DomainSoundId[]=[];
  if (critical) layers.push('critical-impact');
  else if (count) layers.push('true-tear');
  if (domainHas(s,'质量聚焦')) layers.push('mass-focus');
  if (bossHit && domainHas(s,'绝对引力')) layers.push('absolute-gravity');
  if (count && domainHas(s,'重力碾压')) layers.push('gravity-crush');
  for (const layer of layers.slice(0,2)) domainSound(c,layer);
  // Award after all formation hits: kills count, crowds count once, and this hole keeps its snapshot.
  if (count>0) {
    if (c.tutorialMode) c.tutorialDomain.collapseHit=true;
    gainBlackHoleHitXp(c);
  }
}
/** Follow a dense nearby group with a bounded speed; never teleport or repeat the birth hit. */
function moveHole(c:GameCore,h:DomainHole,dt:number) {
  if (!h.seek || h.seek.target.dead || c.time>=h.seek.nextAt) {
    const candidates=c.enemies.filter(e=>valid(e) && !bossInvulnerable(c,e) && near(e,h,C.holeSeekRange));
    if (!candidates.length) {h.seek=undefined;return;}
    const previous=h.seek?.target;
    const ordered=previous && candidates.includes(previous)?[previous,...candidates.filter(e=>e!==previous)]:candidates;
    let best: {target:Enemy;x:number;y:number;count:number;distance:number}|undefined;
    for (const target of ordered) {
      const group=candidates.filter(e=>near(e,target,h.stats.holeR));
      const x=group.reduce((sum,e)=>sum+e.x,0)/group.length,y=group.reduce((sum,e)=>sum+e.y,0)/group.length;
      const distance=Math.hypot(x-h.x,y-h.y);
      if (!best || group.length>best.count || (group.length===best.count && distance+C.holeSwitchMargin<best.distance))
        best={target,x,y,count:group.length,distance};
    }
    if (best) h.seek={target:best.target,x:best.x,y:best.y,nextAt:c.time+C.holeRetarget};
  }
  if (!h.seek) return;
  const dx=h.seek.x-h.x,dy=h.seek.y-h.y,distance=Math.hypot(dx,dy);
  if (distance<=1e-8) return;
  const step=Math.min(distance,h.stats.holeMove*dt);
  h.x=clamp(h.x+dx/distance*step,20,WORLD.w-20);
  h.y=clamp(h.y+dy/distance*step,20,WORLD.h-20);
}
function tickHole(c:GameCore,h:DomainHole,amount:number,remnant=false) {
  for (const e of c.enemies) if (valid(e) && near(e,h,h.stats.holeR)) {
    if (c.state!=='play') return;
    const raw=domainTickDamage(h.stats,amount,!!e.boss,remnant,domainStunned(c,e));
    const result=hit(c,e,h.stats,raw,'dot',true);
    if (!remnant && result) echo(c,h,result.killed);
  }
}
function endHole(c:GameCore,h:DomainHole) {
  const s=h.stats;
  if (domainUpgrade(s,'terminal')) {
    for (const e of c.enemies) if (valid(e) && near(e,h,s.holeR)) hit(c,e,s,domainDamage(s,'terminal',!!e.boss,domainStunned(c,e)),'terminal',true,h);
    effect(c,'terminal',h,s.holeR,.4);domainSound(c,'terminal-impact');
  } else domainSound(c,'blackhole-release');
  if (domainUpgrade(s,'ember')) c.domain.remnant={x:h.x,y:h.y,id:c.domain.nextId++,age:0,life:C.remnantLife,tick:0,stats:s};
  c.domain.blackHole=null;
}
/** One strongest legal pull per enemy per fixed step, with captured convergence priority. */
function pullEnemies(c:GameCore,dt:number) {
  const d=c.domain;
  for (const e of c.enemies) {
    if (!valid(e)) continue;
    let best:{point:Point;force:number;kind:'field'|'hole'|'collapse'|'other'}|null=null,slow=0;
    const consider=(p:Point,force:number,s:DomainSnapshot|null,kind:'field'|'hole'|'collapse'|'other')=>{
      const absolute=s && domainHas(s,'绝对引力');
      const resistance=e.boss ? ((kind==='hole'||kind==='collapse') && absolute && c.bossState?.action==='chase'?.3:0)
        : e.elite ? (absolute?1:.5) : 1;
      const power=force*resistance;
      if (power>0 && (!best || power>best.force)) best={point:p,force:power,kind};
    };
    for (const f of d.fields) if (!d.collapse && near(e,f,f.stats.fieldR)) {slow=Math.max(slow,f.stats.fieldSlow);consider(f,f.stats.fieldPull,f.stats,'field');}
    const h=d.blackHole;
    if (h && near(e,h,h.stats.holeR)) {slow=Math.max(slow,h.stats.holeSlow);consider(h,h.stats.holePull,h.stats,'hole');}
    const r=d.remnant;
    if (r && near(e,r,r.stats.holeR)) consider(r,r.stats.holePull*.4,r.stats,'hole');
    const v=d.vortex;
    if (v && near(e,v,C.dashRadius)) consider(v,C.fieldPull*v.M,null,'other');
    const collapse=d.collapse;
    if (collapse && collapse.targets.includes(e)) {
      best=null;consider(collapse,collapse.stats.collapsePull,collapse.stats,'collapse');
    }
    e.domainSlowF=slow*(e.boss?.5:1);
    // Information overload must visibly hold the target; attraction resumes on recovery.
    // Keep slow bookkeeping and Boss resistance independent of the hard-control state.
    if (best && !domainStunned(c,e)) {
      const chosen=best as {point:Point;force:number;kind:'field'|'hole'|'collapse'|'other'};
      const dx=chosen.point.x-e.x,dy=chosen.point.y-e.y,distance=Math.hypot(dx,dy);
      if (distance>0) {const step=Math.min(distance,chosen.force*dt),margin=e.boss?30:20;
        e.x=clamp(e.x+dx/distance*step,margin,WORLD.w-margin);e.y=clamp(e.y+dy/distance*step,margin,WORLD.h-margin);}
      if (chosen.kind==='field' && !e.boss)
        d.fieldPullCenters.set(e,{x:chosen.point.x,y:chosen.point.y});
    }
  }
}
/** Keep tangential/inward AI walking, but do not let it undo this step's field attraction. */
export function constrainDomainWalking(c:GameCore,e:Enemy,fromX:number,fromY:number) {
  if (!isDomain(c)) return;
  const center=c.domain.fieldPullCenters.get(e);
  if (!center) return;
  const before=Math.hypot(fromX-center.x,fromY-center.y);
  const dx=e.x-center.x,dy=e.y-center.y,after=Math.hypot(dx,dy);
  if (after>before && after>0) {
    e.x=center.x+dx/after*before;
    e.y=center.y+dy/after*before;
  }
}
export function domainDash(c:GameCore) {
  if (!isDomain(c) || !c.player.picks.includes('奇点步') || c.time<c.domain.dashReadyAt) return;
  c.domain.vortex={x:c.player.x,y:c.player.y,age:0,life:C.dashLife,M:domainSnapshot(c).M};
  c.domain.dashReadyAt=c.time+C.dashCooldown;domainSound(c,'singularity-step');
}
export function updateDomain(this:GameCore,dt:number) {
  if (!isDomain(this)) return;
  const d=this.domain;
  d.fieldPullCenters.clear();
  for (const f of d.effects) f.age+=dt;
  d.effects=d.effects.filter(f=>f.age<f.life);
  flushSlashNumbers(this);
  if (this.wavePhase!=='fight') return;
  const cc=new Map<Enemy,CcRequest>();
  for (const e of this.enemies) {
    if ((e.domainImmuneUntil??0)>0 && this.time>=e.domainImmuneUntil!) {e.domainImmuneUntil=0;e.domainCcLevel=0;}
    else if (!(e.domainImmuneUntil??0) && this.time>=(e.domainCcResetAt??Infinity)) e.domainCcLevel=0;
    e.domainSlowF=0;
  }
  d.castCd=Math.max(0,d.castCd-dt);
  if (this.time>=d.shieldUntil) d.shield=0;
  d.shield=Math.min(d.shield,this.player.maxhp*C.shieldCap);
  if (d.vortex && (d.vortex.age+=dt)>=d.vortex.life) d.vortex=null;
  const remnant=d.remnant;
  if (remnant) {
    const step=Math.min(dt,Math.max(0,remnant.life-remnant.age));remnant.age+=step;remnant.tick+=step;
    if (remnant.tick>=C.holeTick-1e-8 || remnant.age>=remnant.life-1e-8) {
      tickHole(this,{...remnant,slash:0,pulse:0,extension:0},remnant.tick,true);remnant.tick=0;
    }
    if (remnant.age>=remnant.life-1e-8) d.remnant=null;
  }
  const h=d.blackHole;
  if (this.domain!==d || this.state!=='play') return;
  if (h) {
    const step=Math.min(dt,Math.max(0,h.life-h.age));h.age+=step;h.tick+=step;h.slash+=step;h.pulse+=step;
    moveHole(this,h,step);
    if (h.tick>=C.holeTick-1e-8 || h.age>=h.life-1e-8) {tickHole(this,h,h.tick);h.tick=0;}
    if (domainUpgrade(h.stats,'slash') && h.slash>=C.holeSlash-1e-8) {
      h.slash-=C.holeSlash;let n=0;
      for (const e of this.enemies) if (valid(e) && near(e,h,h.stats.holeR)) {slash(this,e,h.stats,h);n++;}
      if (n) slashSound(this);
    }
    if (h.age>=h.life-1e-8) endHole(this,h);
  }
  if (this.domain!==d || this.state!=='play') return;
  if (d.collapse) {
    d.collapse.age+=dt;
    updateCollapseFocus(this);
    pullEnemies(this,dt);
    // Pull from another active source may move the focus: align visuals and birth after it.
    updateCollapseFocus(this);
    const remaining=C.collapse-d.collapse.fromAge;
    const t=remaining>1e-8?clamp((d.collapse.age-d.collapse.fromAge)/remaining,0,1):1,ease=t*t*(3-2*t);
    for (const f of d.fields) {f.x=f.fromX+(d.collapse.x-f.fromX)*ease;f.y=f.fromY+(d.collapse.y-f.fromY)*ease;}
    if (d.collapse.age>=C.collapse-1e-8) birth(this);
  } else {
    let landed:GravityField|null=null;
    if (d.deployment) {
      d.deployment.age+=dt;
      if (d.deployment.age>=C.deploy-1e-8) {
        const pos=d.deployment;
        if (d.fields.length>=3) d.fields.shift();
        const stats=domainSnapshot(this);
        landed={x:pos.x,y:pos.y,fromX:pos.x,fromY:pos.y,id:d.nextId++,age:0,life:stats.fieldLife,tick:C.fieldTick,stats};
        d.fields.push(landed);d.deployment=null;domainSound(this,'field-link');
        announceVoid(this,landed,stats);
        if (stats.fieldLife>C.fieldLife) domainSound(this,'horizon-resonance');
      }
    }
    for (const f of d.fields) if (f!==landed) {f.age+=dt;f.tick+=Math.min(dt,Math.max(0,f.life-f.age+dt));}
    for (const e of this.enemies) if (valid(e)) {
      const stunned=domainStunned(this,e);
      const fields=d.fields.filter(f=>f.age<=f.life+1e-8 && near(e,f,f.stats.fieldR))
        .sort((a,b)=>domainFieldPower(b.stats,stunned)-domainFieldPower(a.stats,stunned)||a.id-b.id);
      for (let i=0;i<Math.min(2,fields.length);i++) {
        const f=fields[i];if (f.tick<C.fieldTick-1e-8) continue;
        const raw=i===0?domainFieldDamage(f.stats,stunned):domainOverlapDamage(0,domainFieldDamage(f.stats,stunned),domainUpgrade(f.stats,'confluence'));
        refund(this,f.stats,hit(this,e,f.stats,raw,'dot')?.killed??false);
      }
    }
    for (const f of d.fields) if (f.tick>=C.fieldTick-1e-8) f.tick-=C.fieldTick;
    if (this.domain!==d || this.state!=='play') return;
    d.fields=d.fields.filter(f=>f.age<f.life-1e-8);
    if (!d.deployment && d.fields.length===3 && this.time>=d.collapseLockedUntil) startCollapse(this,cc);
    if (!d.collapse && !d.deployment && d.castCd<=0) {
      const point=selectLanding(this);
      if (point) {d.deployment={...point,age:0};d.castCd=Math.max(C.deploy,C.castInterval/(this.player.fireRate/C.baseFireRate));domainSound(this,'field-deploy');}
    }
    pullEnemies(this,dt);
  }
  // Keep cutting while the three fields converge; the radius follows the real shrinking field.
  d.fieldSlash+=dt;
  if (d.fieldSlash>=C.fieldSlash-1e-8) {
    d.fieldSlash=Math.max(0,d.fieldSlash-C.fieldSlash);fieldSlashVolley(this);
  }
  information(this,dt,cc);
  applyCc(this,cc);
}
