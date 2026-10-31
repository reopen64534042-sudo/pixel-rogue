import type { MissileArcPose, MissileChargePose, MissileFlightPose, MissileImpactPose, MissileLaunchPose, MissileLook, MissileVfxSnapshot } from "./MissileVfxPlayer";
import { MISSILE_VFX as FX } from "../../../data/missileVfx";

/** Deterministic artwork choreography, not weapon simulation or balance evidence. */
export const MISSILE_DEMO_CASES = [
  { id: "heavy", title: "重型导弹 · 完整周期", note: "侧向出舱 → 点火加速 → 弧线制导 → 分层爆破" },
  { id: "turn", title: "制导转向 · 重索敌示意", note: "弹体随轨迹转向，烟迹保留旧位置；这里展示素材转弯能力" },
  { id: "twin", title: "双联挂架 · 错时出舱", note: "两侧短促发射；每枚导弹都有独立爆心与消散" },
  { id: "swarm", title: "蜂群齐射 · 主弹与微型弹", note: "厚重主弹与六枚小弹分配火力；小弹使用独立轮廓和小爆炸" },
  { id: "ion", title: "离子命中 · 电弧与共振", note: "离子弹体、电弧接力与独立共振形态；目标预存电荷的素材示意" },
  { id: "combined", title: "组合效果 · 画面密度检查", note: "双主弹、小弹、离子与烟尘叠加，检查原尺寸下的可读性" },
] as const;
export type MissileDemoId = (typeof MISSILE_DEMO_CASES)[number]["id"];
export const MISSILE_DEMO_SECONDS = 2.8;
const baseTargetA = { x: 320, y: 128 }, baseTargetB = { x: 368, y: 174 }, baseTargetC = { x: 370, y: 81 };

interface DemoLaunch { start: number; duration: number; side: number; look: MissileLook; target: { x: number; y: number }; bend?: number; }
function position(shot: DemoLaunch, age: number) {
  const u = Math.max(0, Math.min(1, age / shot.duration));
  const speed = 0.15 * u + 0.85 * u * u;
  const start = { x: 124, y: 148 + shot.side * 5 };
  const bend = shot.bend ?? shot.side * 55;
  return { x: start.x + (shot.target.x - start.x) * speed,
    y: start.y + (shot.target.y - start.y) * speed + Math.sin(Math.PI * speed) * bend };
}
export function sampleMissileDemo(id: MissileDemoId, seconds: number) {
  const t = Math.max(0, seconds);
  const targetA = baseTargetA, targetB = id === "ion" ? { x: 378, y: 138 } : baseTargetB;
  const targetC = id === "ion" ? { x: 354, y: 102 } : id === "combined" ? { x: 344, y: 145 } : baseTargetC;
  const launches: DemoLaunch[] = [{ start: 0.25, duration: 0.95, side: -1, look: id === "ion" ? "ion" : "heavy", target: targetA }];
  if (id === "turn") launches[0] = { ...launches[0], duration: 1.2, target: targetB, bend: -100 };
  if (id === "twin" || id === "combined") launches.push({ start: 0.39, duration: 0.98, side: 1, look: id === "combined" ? "ion" : "heavy", target: targetB });
  if (id === "swarm" || id === "combined") for (let i = 0; i < 6; i++) launches.push({ start: 0.36 + i * 0.055,
    duration: 0.86 + i % 2 * 0.07, side: i % 2 ? 1 : -1, look: "micro", target: [targetA, targetB, targetC][i % 3], bend: (i - 2.5) * 24 });
  const snapshot: MissileVfxSnapshot = { flights: [], launches: [], impacts: [], arcs: [] };
  const flights: MissileFlightPose[] = [], puffs: MissileLaunchPose[] = [];
  const impacts: MissileImpactPose[] = [], arcs: MissileArcPose[] = [], charges: MissileChargePose[] = [];
  for (const shot of launches) {
    const age = t - shot.start, start = position(shot, 0), hit = position(shot, shot.duration);
    if (age >= 0 && age < 0.31) puffs.push({ ...start, angle: shot.side * 0.5, age, micro: shot.look === "micro" });
    if (age >= 0 && age < shot.duration) {
      const p = position(shot, age), before = position(shot, Math.max(0, age - 0.005)), after = position(shot, age + 0.005);
      flights.push({ ...p, age, ejectDuration: 0.12, igniteDuration: 0.18, look: shot.look,
        angle: Math.atan2(after.y - before.y, after.x - before.x),
        trail: Array.from({ length: 9 }, (_, i) => { const ago = (8 - i) * 0.025; return { ...position(shot, Math.max(0, age - ago)), age: ago }; }) });
    }
    const impactAge = age - shot.duration;
    if (impactAge >= 0 && impactAge < 0.69) impacts.push({ ...hit, age: impactAge, radius: shot.look === "micro" ? 12 : 28, look: shot.look });
    if (shot.look === "ion") {
      const linkAge = impactAge - 0.035;
      const relayTarget = shot.target === targetB ? targetA : targetB;
      if (linkAge >= 0 && linkAge < FX.arcLife) arcs.push({ ...shot.target, x2: targetC.x, y2: targetC.y, age: linkAge });
      if (linkAge >= 0.055 && linkAge < FX.arcLife + 0.055) arcs.push({ ...targetC, x2: relayTarget.x, y2: relayTarget.y, age: linkAge - 0.055, relay: true });
      // Preset charge history is deliberately an art scenario, not simulated combat evidence.
      if (t >= 0.2) {
        const lastGain = linkAge >= 0 ? shot.start + shot.duration + 0.035 : t >= 0.65 ? 0.65 : 0.2;
        charges.push({ ...targetC, radius: 4, count: linkAge >= 0 ? 1 : t >= 0.65 ? 2 : 1,
          age: t - lastGain, remaining: 8 - (t - lastGain) });
      }
      if (impactAge >= 0) charges.push({ ...shot.target, radius: 4, count: 1, age: impactAge, remaining: 8 - impactAge });
      if (linkAge >= 0 && linkAge < 0.69) impacts.push({ ...targetC, age: linkAge, radius: 14, look: "ion", kind: "resonance" });
    }
  }
  snapshot.flights = flights; snapshot.launches = puffs; snapshot.impacts = impacts; snapshot.arcs = arcs;
  snapshot.charges = charges;
  return { snapshot, player: { x: 112, y: 148 }, targets: [targetA, targetB, targetC] };
}
