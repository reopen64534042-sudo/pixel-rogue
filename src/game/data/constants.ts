export const W = 480,
  H = 270;
export const VIEW = { w: W, h: H };
export const WORLD = { w: 1392, h: 1040 };
/** 满血拾取血包转化为最大生命的每波上限（加成本身永久保留，不设总上限） */
export const POTION_GROW_CAP = 10;
export const clamp = (v: number, a: number, b: number) =>
  Math.max(a, Math.min(b, v));
export function fmtTime(t: number) {
  const m = Math.floor(t / 60),
    s = Math.floor(t % 60);
  return m + ":" + String(s).padStart(2, "0");
}
