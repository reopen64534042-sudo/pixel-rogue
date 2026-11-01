import type {Talent} from '../../core/types';
import {DOMAIN_UNLOCK_LEVELS} from '../domain';
type Card=Omit<Talent,'t'|'max'|'f'|'prof'|'mageWeapon'|'pv'>;
const cards:Card[]=[
  {n:'引力核心',ico:'🔮',cat:'核心',slot:'领域核心',layer:1,d:'收拢捕获质量：黑洞攻击力伤害基础 +8%，每个不同捕获目标再 +2%，最多 +30%；不放大生命压缩'},
  {n:'坍缩理论',ico:'🌀',cat:'核心',slot:'领域核心',layer:2,requires:'引力核心',d:'需引力核心。黑洞持续 +0.4 秒，收拢与黑洞牵引 +25%；可继续进阶禁锢'},
  {n:'静滞增幅',ico:'✦',cat:'输出',slot:'领域增幅',layer:1,requiresDomainUpgrade:'void',d:`需武器Lv.${DOMAIN_UNLOCK_LEVELS.void}无量空处。对正在信息过载的目标，领域与黑洞攻击力伤害 +20%；不放大生命压缩，Boss因硬控免疫不享受此加成`},
  {n:'裂界增幅',ico:'⚔️',cat:'输出',slot:'领域增幅',layer:1,requiresDomainUpgrade:'slash',d:`需武器Lv.${DOMAIN_UNLOCK_LEVELS.slash}斩击领域。普通领域与黑洞的斩击伤害 +25%，斩击频率保持不变`},
  {n:'禁锢',ico:'⛓️',cat:'控制',slot:'领域转向',layer:3,requires:'坍缩理论',d:'需坍缩理论。收拢开始对捕获目标定身，仍可攻击并受牵引；收拢与黑洞牵引 +20%；Boss免疫定身，同时过载时服从无量停滞'},
  {n:'引力护盾',ico:'🛡️',cat:'生存',slot:'领域生存',layer:1,d:'捕获至少一目标后，收拢获得按领域值增强的数值盾，持续 3 秒，最终最多 15% 最大生命；刷新不累加'},
  {n:'逃逸速度',ico:'💨',cat:'机动',slot:'领域机动',layer:1,d:'收拢开始后 1.5 秒移速提高，基础 +20%，受领域值增强；不叠加倍率'},
  {n:'质量回收',ico:'♻️',cat:'循环',slot:'领域增幅',layer:1,d:'普通领域或领域斩击击杀返还施法冷却，基础每次 0.1 秒，受领域值增强，每轮最终最多 0.3 秒；不缩部署与坍缩锁'},
  {n:'重力碾压',ico:'⬇️',cat:'破甲',slot:'领域增幅',layer:1,d:'黑洞及其派生的引力伤害无视剩余护甲的 30%；不重复增幅真伤'},
  {n:'绝对引力',ico:'🧲',cat:'控制',slot:'领域增幅',layer:1,d:'精英牵引全效；Boss 普通移动时承受 30% 收拢/黑洞牵引，黑洞攻击力伤害对 Boss +10%；不干扰出招或解除硬控免疫'},
  {n:'回响奇点',ico:'🔁',cat:'循环',slot:'领域增幅',layer:1,d:'黑洞形成、跳伤或黑洞斩击每击杀一目标，持续 +0.08 秒，单个最多 +0.4 秒；余烬/终末不续时'},
  {n:'视界共振',ico:'🔗',cat:'循环',slot:'领域增幅',layer:1,d:'黑洞存在时新落地的普通领域牵引 +30%、持续 +0.5 秒；加成在落地时确定'},
  {n:'质量聚焦',ico:'🎯',cat:'输出',slot:'领域增幅',layer:1,d:'普通领域半径 −15%，黑洞形成的引力主爆发 +25%；不放大真伤、生命压缩、跳伤或斩击'},
  {n:'奇点步',ico:'🌌',cat:'机动',slot:'领域机动',layer:1,d:'成功冲刺时在起点留下 0.6 秒小涡流，冷却 4 秒；只有牵引，不参与三领域、不伤害或提供武器经验'},
  {n:'质量虹吸',ico:'💠',cat:'续航',slot:'领域生存',layer:1,d:'黑洞形成实际命中后按不同目标数回复生命，受领域值增强；与该次主爆发吸血合计最多回复 5% 最大生命，Boss 正常计数'},
];
export const DOMAIN_TALENTS:Talent[]=cards.map(card=>({...card,prof:'mage',mageWeapon:'domain',t:0,max:1,f:()=>{},pv:()=>card.d}));
