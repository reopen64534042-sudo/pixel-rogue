import type { EnemyConfig } from "../core/types";
export const ETYPES: Record<string, EnemyConfig> = {
  slime: {
    hp: 14,
    speed: 30,
    dmg: 8,
    r: 4,
    xp: 1,
    spr: "slime",
    w0: 1,
    wt: 40,
  },
  bat: { hp: 9, speed: 62, dmg: 6, r: 3, xp: 1, spr: "bat", w0: 3, wt: 18 },
  brute: {
    hp: 65,
    speed: 20,
    dmg: 15,
    r: 7,
    xp: 3,
    spr: "brute",
    w0: 5,
    wt: 12,
  },
  shooter: {
    hp: 16,
    speed: 38,
    dmg: 10,
    r: 4,
    xp: 2,
    spr: "shooter",
    w0: 6,
    wt: 16,
  }, // 远程: 保持距离射击
  bomber: {
    hp: 12,
    speed: 72,
    dmg: 16,
    r: 4,
    xp: 2,
    spr: "bomber",
    w0: 8,
    wt: 14,
  }, // 特殊: 自爆
};
