/** Generated sheets use fixed anchors and the existing simulation clock. */
import type { BossPixelPose } from "./BossPixelArt";
export const BOSS_FX_ATLAS = "boss-three-generated-fx";
export const BOSS_FX_FRAME_SIZE = 128;
export const BOSS_FX_CLIPS = {
  fire: { anchor: [12, 64], extent: 112 },
  stomp: { anchor: [64, 70], extent: 64 },
  nova: { anchor: [64, 70], extent: 64 },
  spikes: { anchor: [64, 112], extent: 46 },
  marks: { anchor: [64, 116], extent: 42 },
  chain: { anchor: [12, 64], extent: 112 },
} as const;
export type BossFxClip = keyof typeof BOSS_FX_CLIPS;

/** Head emission positions for the generated, shared-scale body poses. */
export function generatedBossHeadPosition(pose: BossPixelPose, index: number): { x: number; y: number } {
  const y: Record<BossPixelPose, number> = {
    idle: -4, crouch: 5, roar: -13, "walk-left": -4, "walk-right": -4,
    lunge: 7, impact: 4, stagger: 7,
  };
  return { x: [-17, -3, 13][index], y: y[pose] + (index === 1 ? -3 : 0) };
}
