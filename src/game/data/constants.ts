export const W = 480,
  H = 270;
export const VIEW = { w: W, h: H };
export const WORLD = { w: 1392, h: 1040 };
export const clamp = (v: number, a: number, b: number) =>
  Math.max(a, Math.min(b, v));
export function fmtTime(t: number) {
  const m = Math.floor(t / 60),
    s = Math.floor(t % 60);
  return m + ":" + String(s).padStart(2, "0");
}
