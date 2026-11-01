import type { GameCore } from '../game/core/GameCore';
import { domainSnapshot } from '../game/core/DomainSystem';
import { domainDamage, domainFieldDamage, domainWeaponMultiplier, domainCurrentHpDamage } from '../game/core/DamageMath';
import { playerMoveSpeed } from '../game/core/PlayerSystem';
import { DOMAIN, DOMAIN_UPGRADES, DOMAIN_UNLOCK_LEVELS, domainXpNext, domainHas, domainUpgrade } from '../game/data/domain';
import { DOMAIN_DAMAGE } from '../game/data/combatBalance';
import { levelGrowthSteps, levelGrowthSummary } from '../game/data/levelGrowth';
import { DOMAIN_VALUE_GAINS, ATTRIBUTE_CAPS } from '../game/data/attributeBalance';
import { DOMAIN_TALENTS } from '../game/data/talents/domain';
import { fmtHp } from '../game/data/constants';

type Row=readonly [string,string|number];
const icons:Readonly<Record<string,string>>={
  '基础伤害':'⚔️','领域值':'🔮','领域效果倍率':'🌌','武器伤害倍率':'⚔️','全局增伤':'✴️','施法间隔':'⏱️','暴击率':'🎯','暴击伤害':'💥',
  '领域牵引':'🧲','收拢牵引':'🌀','黑洞牵引':'🌑','黑洞巡游':'🧭','领域减速':'⌛','黑洞减速':'⌛',
  '生命':'❤️','护甲':'🪨','通用减伤':'🛡️','闪避':'💨','引力护盾':'🛡️','护盾剩余':'⏳',
  '生命回复':'💚','吸血属性':'🦷','爆发吸血效率':'🩸','单次吸血上限':'🩸','单次总回复上限':'💚','质量虹吸':'💠',
  '当前移速':'👟','施法距离':'📏','范围倍率':'🌐','领域半径':'🌐','领域最长持续':'⏳','收拢时长':'⏱️',
  '人物等级':'📈','当前波次':'🌊','场内领域':'🔮','当前阶段':'🔄','收拢锁定':'🎯','黑洞剩余':'⏳','坍缩锁剩余':'🔒','已用退款':'♻️',
  '领域每跳伤害':'🔮','跳伤间隔':'⏱️','空间斩伤害':'⚔️','连斩间隔':'⏱️','无量空处':'♾️','信息灌注':'🧠','普通首段停滞':'💫','过载恢复间隔':'⏳',
  '形成主爆发':'💥','附带真伤':'💠','生命压缩比例':'🌀','生命压缩上限':'📏','持续跳伤':'🔁','黑洞半径':'🌑','基础持续':'⏳','击杀续时':'🔁','黑洞斩击':'⚔️','护甲穿透':'🪓','结束爆发':'💥',
  '数值说明':'📖','领域落点':'🎯','合成锁定':'🎯','领域重叠':'🔗','伤害分量':'⚔️','控制抗性':'🛡️','共享递减':'📉','吸血与虹吸':'💠',
  '武器经验':'📘','升级生效':'⬆️','武器成长':'📈','下一级武器倍率':'⬆️','人物每级':'🌱','等级累计':'🌿','领域值强化':'🔮','脚下指示':'🔹',
};
const label=(name:string,icon=icons[name]??'✦')=>`<span class="stat-icon" aria-hidden="true">${icon}</span><span>${name}</span>`;
const rows=(items:readonly Row[])=>items.map(([k,v])=>{
  const dim=v==='—'||v==='未学习'||v==='未解锁'||/^Lv\.\d+ 解锁$/.test(String(v));
  return `<div class="row${dim?' dim':''}"><span class="k">${label(k)}</span><span class="v">${v}</span></div>`;
}).join('');
const put=(id:string,items:readonly Row[])=>{const el=document.getElementById(id);if (el) el.innerHTML=rows(items);};
const show=(id:string)=>{const el=document.getElementById(id);if (el) {el.hidden=false;el.style.display='';}return el;};
const f=(n:number)=>n.toFixed(1),pct=(n:number)=>`${f(n*100)}%`;

/** C panel consumes the same pure formula/snapshots as live Domain settlement. */
export function buildDomainStats(c:GameCore) {
  const p=c.player,d=c.domain,next=domainSnapshot(c),hole=d.blackHole,s=hole?.stats??next;
  const slash=domainUpgrade(next,'slash'),voidActive=domainUpgrade(next,'void'),holeSlash=domainUpgrade(s,'slash');
  const shield=domainHas(next,'引力护盾');
  put('stat-combat',[
    ['基础伤害',f(p.damage)],['领域值',p.domainValue??DOMAIN.valueBase],
    ['领域效果倍率',`×${next.M.toFixed(2)}`],['武器伤害倍率',`×${next.power.toFixed(2)}`],
    ['全局增伤',pct(p.globalDamageBonus??0)],['施法间隔',`${Math.max(DOMAIN.deploy,DOMAIN.castInterval/(p.fireRate*.55)).toFixed(2)} s`],
    ['暴击率',pct(p.crit)],['暴击伤害',`×${p.critMul.toFixed(2)}`],
  ]);
  put('stat-knockback',[
    ['领域牵引',`${f(next.fieldPull)} px/s`],['收拢牵引',`${f(next.collapsePull)} px/s`],
    ['黑洞牵引',`${f(s.holePull)} px/s`],['黑洞巡游',`${f(s.holeMove)} px/s`],
    ['领域减速',pct(next.fieldSlow)],['黑洞减速',pct(s.holeSlow)],
  ]);
  put('stat-defense',[
    ['生命',fmtHp(p.hp,p.maxhp)],['护甲',f(p.defense??0)],['通用减伤',pct(p.tough)],['闪避',pct(p.dodge)],
    ['引力护盾',shield?`${f(d.shield)} / ${f(p.maxhp*DOMAIN.shieldCap)}`:'未学习'],
    ['护盾剩余',shield?`${f(Math.max(0,d.shieldUntil-c.time))} s`:'—'],
  ]);
  put('stat-sustain',[
    ['生命回复',`${f(p.regen)} /s`],['吸血属性',pct(p.lifesteal)],
    ['爆发吸血效率',pct(DOMAIN_DAMAGE.lifesteal)],['单次吸血上限',`${f(p.maxhp*DOMAIN_DAMAGE.lifestealCap)} HP`],
    ['单次总回复上限',`${f(p.maxhp*DOMAIN_DAMAGE.healingCap)} HP`],['质量虹吸',domainHas(next,'质量虹吸')?'已学习':'未学习'],
  ]);
  put('stat-utility',[
    ['当前移速',`${f(playerMoveSpeed(c))} px/s`],['施法距离',`${f(p.attackRange)} px`],
    ['范围倍率',`×${p.area.toFixed(2)}`],['领域半径',`${f(next.fieldR)} px`],
    ['领域最长持续',`${f(next.fieldLife)} s`],['收拢时长',`${DOMAIN.collapse} s`],
  ]);
  put('stat-info',[
    ['人物等级',p.lvl],['当前波次',c.waveN],
    ['场内领域',`${d.fields.length} / 3`],['当前阶段',d.collapse?'收拢中':d.deployment?'部署中':hole?'黑洞持续':'围猎就绪'],
    ['收拢锁定',d.collapse?(d.collapse.target?(d.collapse.target.boss?'Boss':'普通目标'):'最后落点'):'—'],
    ['黑洞剩余',hole?`${f(Math.max(0,hole.life-hole.age))} s`:'—'],
    ['坍缩锁剩余',`${f(Math.max(0,d.collapseLockedUntil-c.time))} s`],['已用退款',`${f(d.refundUsed)} / ${f(DOMAIN.refundCap)} s`],
  ]);
  show('stat-weapon');show('stat-special');show('stat-special-upgrades');show('stat-special-rules');
  const title=show('stat-special-title');if (title) title.textContent='坍缩领域';
  put('stat-special',[
    ['领域每跳伤害',f(domainFieldDamage(next))],['跳伤间隔',`${DOMAIN.fieldTick} s`],
    ['空间斩伤害',slash?f(domainDamage(next,'fieldSlash')):`Lv.${DOMAIN_UNLOCK_LEVELS.slash} 解锁`],
    ['连斩间隔',slash?`${DOMAIN.fieldSlash} s`:'—'],
    ['无量空处',voidActive?'已解锁':`Lv.${DOMAIN_UNLOCK_LEVELS.void} 解锁`],
    ['信息灌注',voidActive?`${(DOMAIN.infoBuild/next.M).toFixed(2)} s`:'—'],
    ['普通首段停滞',voidActive?`${f(Math.min(DOMAIN.ccCap,DOMAIN.infoHold*next.M))} s`:'—'],
    ['过载恢复间隔',voidActive?`${DOMAIN.infoRecovery} s`:'—'],
  ]);
  show('stat-special-status');
  const statusTitle=show('stat-special-status-title');
  if (statusTitle) statusTitle.textContent=hole?'当前黑洞':'黑洞预览（捕获0）';
  put('stat-special-status-list',[
    ['形成主爆发',f(domainDamage(s,'birth'))],['附带真伤',f(domainDamage(s,'true'))],
    ['生命压缩比例',pct(DOMAIN_DAMAGE.currentHp*s.M)],['生命压缩上限',f(domainCurrentHpDamage(s,Number.MAX_VALUE))],
    ['持续跳伤',f(domainDamage(s,'holeTick'))],['跳伤间隔',`${DOMAIN.holeTick} s`],
    ['黑洞半径',`${f(s.holeR)} px`],['基础持续',`${f(s.holeLife)} s`],
    ['黑洞剩余',hole?`${f(Math.max(0,hole.life-hole.age))} s`:'—'],['击杀续时',hole?`${f(hole.extension)} s`:'—'],
    ['黑洞斩击',holeSlash?f(domainDamage(s,'holeSlash')):'未解锁'],['连斩间隔',holeSlash?`${DOMAIN.holeSlash} s`:'—'],
    ['护甲穿透',pct(s.armorPen)],['结束爆发',domainUpgrade(s,'terminal')?f(domainDamage(s,'terminal')):'未解锁'],
  ]);
  const need=domainXpNext(d.level),progress=document.getElementById('stat-special-progress');
  const percent=need?Math.max(0,Math.min(100,d.xp/need*100)):100;
  const xpText=need?`${d.xp} / ${need} 次有效黑洞`:'已满级';
  if (progress) progress.innerHTML=`<div class="weapon-progress-label"><strong>Lv.${d.level} / ${DOMAIN.maxLevel}</strong><span>${xpText}</span></div><div class="weapon-progress-track" role="progressbar" aria-label="领域武器升级进度" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${percent.toFixed(1)}" aria-valuetext="${xpText}"><div class="weapon-progress-fill" style="width:${percent}%"></div></div><p class="stats-help">黑洞落地爆发实际命中才记经验，每次最多1点。</p>`;
  const upgrades=DOMAIN_UPGRADES.filter(u=>d.upgrades.includes(u.id));
  const upTitle=document.getElementById('stat-special-upgrades-title');if (upTitle) upTitle.textContent=`当前升级（${upgrades.length}/${DOMAIN_UPGRADES.length}）`;
  const upList=document.getElementById('stat-special-upgrades-list');if (upList) upList.innerHTML=upgrades.length?
    upgrades.map(u=>`<div class="special-upgrade"><span class="su-name">${label(u.name,'🔮')}</span><span class="su-desc">${u.desc}</span></div>`).join(''):`<div class="special-upgrade-empty">Lv.2–3 先获得基础升级；Lv.${DOMAIN_UNLOCK_LEVELS.slash} 斩击领域；Lv.${DOMAIN_UNLOCK_LEVELS.void} 无量空处；其余等级继续获得升级，满级全拿</div>`;
  put('stat-special-rules-list',[
    ['数值说明','伤害显示减伤前数值，未计算暴击或目标条件增幅。普通领域显示下一次施放的数值；黑洞存在时显示当前黑洞，否则按捕获0个目标预览。'],
    ['领域落点',`瞄准施法范围内最近敌人，保留${DOMAIN.deploy}s部署提前量；落地后固定，吸入途中和中心都持续伤害。`],
    ['合成锁定',`三领域在${DOMAIN.collapse}s内向锁定目标收拢：范围内可攻击Boss优先，其次捕获目标，再选最近敌人。目标失效才重选，无目标保留最后落点。`],
    ['领域重叠',`普通跳伤最多两份，第一份100%、第二份${pct(DOMAIN_DAMAGE.overlap)}；第二片持有引力汇流时提高到${pct(DOMAIN_DAMAGE.confluenceOverlap)}。普通领域连斩同轮按目标去重。`],
    ['黑洞巡游','形成后缓慢追向附近密集怪群，伤害与牵引使用实际位置；移动不重复形成爆发或刷新寿命。'],
    ['伤害分量','形成主爆发与空间斩可暴击；附带真伤、生命压缩、持续跳伤及结束爆发不暴击。生命压缩属于引力伤害，受目标减伤与无敌规则影响。'],
    ['无量空处',`Lv.${DOMAIN_UNLOCK_LEVELS.void}解锁后，约${(DOMAIN.infoBuild/next.M).toFixed(2)}s灌注→${f(Math.min(DOMAIN.ccCap,DOMAIN.infoHold*next.M))}s首段过载；暂停自主行动与领域牵引，恢复后继续吸入，至少${DOMAIN.infoRecovery}s再灌注间隔，重叠不加速灌注。`],
    ['控制抗性','精英基础牵引与硬控时长减半；Boss硬控免疫、减速半效。绝对引力可让精英牵引全效，只在Boss追逐时开放30%收拢/黑洞牵引。'],
    ['共享递减','同一步申请合并；100% → 50% → 25%，第三次后立即阻止新申请，到全部领域硬控结束后再免疫 2s'],
    ['吸血与虹吸',`只有形成主爆发按吸血属性的${pct(DOMAIN_DAMAGE.lifesteal)}效率回复，每次最多${pct(DOMAIN_DAMAGE.lifestealCap)}最大生命；与质量虹吸合计最多${pct(DOMAIN_DAMAGE.healingCap)}最大生命。`],
    ['武器经验','黑洞形成落地的爆发实际命中至少一个目标后+1经验；同次命中多人仍只记1点。空落、普通领域、后续跳伤/连斩/终末/余烬不给经验；击杀也计数，无敌挡住不计'],
    ['升级生效','形成爆发全部结算后获得经验；升级作用于之后创建的领域/黑洞，当前黑洞保留形成时的数值'],
    ['武器成长',`Lv.1–4倍率${[1,2,3,4].map(level=>`×${domainWeaponMultiplier(level).toFixed(2)}`).join(' / ')}；Lv.${DOMAIN_DAMAGE.earlyPowerRecoveryLevel}起回到每级+${pct(DOMAIN_DAMAGE.levelGain)}的原曲线，满级×${domainWeaponMultiplier(DOMAIN.maxLevel).toFixed(2)}。Lv.${DOMAIN_UNLOCK_LEVELS.slash}连斩、Lv.${DOMAIN_UNLOCK_LEVELS.void}无量；新实体应用新快照`],
    ['下一级武器倍率',d.level<DOMAIN.maxLevel?`Lv.${d.level+1} ×${domainWeaponMultiplier(d.level+1).toFixed(2)}，同时获得一项升级`:'已满级'],
    ['人物每级',levelGrowthSummary(c.prof,1,c.mageWeapon)],
    ['等级累计',levelGrowthSteps(p.lvl)>0?`${levelGrowthSummary(c.prof,levelGrowthSteps(p.lvl),c.mageWeapon)}（上限前的等级来源）`:'—'],
    ['领域值强化',`白/绿/紫/金：${DOMAIN_VALUE_GAINS.map(v=>`+${v}`).join(' / ')}，与等级成长合计上限${ATTRIBUTE_CAPS.domainValue}；独立增强伤害、牵引、控制和辅助。`],
    ['脚下指示','自上而下为冲刺充能、领域数量、武器经验。领域与黑洞的详细状态可在本面板查看。'],
  ]);
  const learned=DOMAIN_TALENTS.filter(u=>p.picks.includes(u.n));
  const talentTitle=document.getElementById('stat-talents-title');if (talentTitle) talentTitle.textContent=`已学领域天赋 · ${learned.length} 项`;
  const talents=document.getElementById('talent-list');if (talents) talents.innerHTML=learned.length?
    learned.map(u=>`<div class="special-upgrade"><span class="su-name">${label(u.n,u.ico)}</span><span class="su-desc">${u.d}</span></div>`).join(''):'<div class="talent-empty">暂未习得领域天赋</div>';
}
