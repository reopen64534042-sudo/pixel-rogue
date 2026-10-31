import { BOSS, BOSS_ATTACKS } from "../data/boss";
import type { BossState } from "../core/types";
import type { BossPixelPose } from "./BossPixelArt";

export const BOSS_ATLAS = "boss-three-poses";
export const BOSS_PORTRAIT = "boss-three-portrait";
export const BOSS_FRAME = { width: 72, height: 56 } as const;

/** Fixed-step state is the animation clock, including while paused. */
export function bossPose(s: BossState, time: number): BossPixelPose {
  if (s.action === "intro") return s.actionT > BOSS.intro * 0.55 ? "crouch" : "roar";
  if (s.action === "transition") return "roar";
  if (s.action === "stagger") return "stagger";
  if (s.action === "dash") return "lunge";
  if (s.action === "windup") {
    const t = s.attack ? s.actionT / BOSS_ATTACKS[s.attack].windup : 1;
    return t > 0.28 || s.attack === "charge" ? "crouch" : "roar";
  }
  if (s.action === "cast") return s.attack === "spikes" ? "impact" : "roar";
  if (s.action === "recover") return s.actionT > BOSS.recover * 0.5 ? "impact" : "idle";
  return (["walk-left", "idle", "walk-right", "idle"] as const)[Math.floor(time * (s.phase === 3 ? 9 : 7)) % 4];
}
