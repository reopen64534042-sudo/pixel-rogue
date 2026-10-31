import { PALETTE_HEX as P } from "../data/palette";

/** Same large color clusters and small face marks as sprites.ts; no baked texture. */
export const BOSS_PIXEL_SIZE = { width: 36, height: 28, scale: 2 } as const;
export const BOSS_PIXEL_POSES = ["idle", "crouch", "roar", "walk-left", "walk-right", "lunge", "impact", "stagger"] as const;
export type BossPixelPose = typeof BOSS_PIXEL_POSES[number];
export const BOSS_PIXEL_COLORS: Readonly<Record<string, string>> = {
  d: P.stoneDark, r: P.stoneRed, h: P.gold,
  f: P.fireOrange, c: P.iceCyan, b: P.iceDeep,
};

const BODY = [
  ".......rrrrrrrrrr.......",
  "....rrrrrrrrrrrrrrrr....",
  "..rrrrrrrrrrrrrrrrrrrr..",
  ".rrrrrrrrrrrrrrrrrrrrrr.",
  "rrrrrrrrrrrrrrrrrrrrrrrr",
  "rrrrrrrrrrrrrrrrrrrrrrrr",
  "rrrrrrrrrrrrrrrrrrrrrrrr",
  ".rrrrrddddddddddddrrrrr.",
  "..rrrrrddddddddddrrrrr..",
  "...rrrrrddddddddrrrrr...",
  "....rrrrddddddddrrrr....",
];
const TAIL = [
  "......hh",
  ".....rrr",
  ".....rr.",
  "....rr..",
  "..rrrr..",
  "rrrrr...",
  "rrr.....",
];
const FIRE = [
  ".h....h..",
  ".hh..hh..",
  "..fffff..",
  ".fffffff.",
  "fffdffdff",
  "fffffffff",
  ".fffffff.",
  "..fdddf..",
  "...fff...",
];
const FROST = [
  "....c....",
  "..c.c.c..",
  "..ccccc..",
  ".ccccccc.",
  "cccdcdccc",
  "ccccccccc",
  ".cccbccc.",
  "..ccbcc..",
  "...ccc...",
];
const THUNDER = [
  ".hh...h..",
  "..h..hh..",
  "..hhhhh..",
  ".hhhhhhh.",
  "hhhdhhdhh",
  "hhhhhhhhh",
  ".hhhhhhh.",
  "..hdddh..",
  "...hhh...",
];
const LEG = ["rrrr", "rrrr", "rrrr", "rrrr", "rrrr", "rrrr", "dddd"];
const BACK_LEG = ["rrr", "rrr", "ddd"];

function headBaseY(pose: BossPixelPose): number {
  if (pose === "crouch" || pose === "impact") return 9;
  if (pose === "roar") return 3;
  if (pose === "stagger") return 8;
  return pose === "lunge" ? 9 : 6;
}

/** Pixel-space offsets from the center of the shipped frame, shared by head VFX. */
export function bossPixelHeadPosition(pose: BossPixelPose, index: number): { x: number; y: number } {
  const { width, height, scale } = BOSS_PIXEL_SIZE;
  const row = headBaseY(pose) + (index === 1 ? -2 : 0) + (pose === "stagger" && index !== 1 ? 1 : 0);
  return { x: (8 + index * 10 - width / 2) * scale, y: (row + 5 - height / 2) * scale };
}

/** Frames share anatomy; only limb/head offsets and jaw marks change with the pose. */
export function bossPixelRows(pose: BossPixelPose): string[] {
  const rows = Array.from({ length: BOSS_PIXEL_SIZE.height }, () => Array<string>(BOSS_PIXEL_SIZE.width).fill("."));
  const stamp = (map: readonly string[], x: number, y: number) => {
    for (let iy = 0; iy < map.length; iy++) for (let ix = 0; ix < map[iy].length; ix++) {
      const ch = map[iy][ix], px = ix + x, py = iy + y;
      if (ch !== "." && px >= 0 && px < BOSS_PIXEL_SIZE.width && py >= 0 && py < BOSS_PIXEL_SIZE.height) rows[py][px] = ch;
    }
  };
  const compressed = pose === "crouch" || pose === "impact";
  const roar = pose === "roar";
  const stagger = pose === "stagger";
  const bodyY = compressed ? 14 : pose === "lunge" ? 11 : 12;
  stamp(TAIL, 28, bodyY - 1);
  stamp(BACK_LEG, 12, 23);
  stamp(BACK_LEG, 22, 23);
  stamp(BODY, 6, bodyY);
  // Two planted forelegs and two smaller rear legs; stepping swaps just the foreleg offsets.
  stamp(LEG, 6, pose === "walk-left" ? 20 : 21);
  stamp(LEG, 26, pose === "walk-right" ? 20 : 21);
  const headY = headBaseY(pose);
  const neck = ["rrrrr", "rrrrr", "rrrrr", "ddddd"];
  stamp(neck, 7, headY + 6);
  stamp(neck, 16, headY + 5);
  stamp(neck, 25, headY + 6);
  const heads = [FIRE, FROST, THUNDER];
  for (let i = 0; i < heads.length; i++) {
    const x = 4 + i * 10, y = headY + (i === 1 ? -2 : 0) + (stagger && i !== 1 ? 1 : 0);
    stamp(heads[i], x, y);
    if (roar || pose === "lunge") stamp(["ddddd", "ddddd"], x + 2, y + 6);
    if (stagger) stamp(["dd...dd"], x + 1, y + 4);
  }
  return rows.map(row => row.join(""));
}
