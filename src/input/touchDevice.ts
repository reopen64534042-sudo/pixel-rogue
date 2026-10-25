/**
 * Issue #95 / D5：移动端判定。
 *
 * 判定原则是「宁可漏判，不可误判」——把 PC 误识别成手机会直接毁掉键鼠手感。
 * 因此同时要求三个条件，缺一不可：
 * 1. `pointer: coarse`：**主**指针是手指（触屏笔记本的主指针是鼠标，为 fine，不会命中）；
 * 2. `hover: none`：主指针没有悬停能力（触屏笔记本/鼠标设备为 `hover: hover`）；
 * 3. `maxTouchPoints > 0`：确实存在触点（排除某些桌面浏览器对媒体查询的模拟）。
 *
 * 判定在启动时一次性完成，运行期不随事件切换：
 * 触屏笔记本用户用鼠标点击不会突然弹出摇杆，反过来也不会因一次触摸而永久改变布局。
 */
export interface TouchProbe {
  matchMedia?: (query: string) => { matches: boolean };
  maxTouchPoints?: number;
}

export function isTouchPrimary(probe: TouchProbe): boolean {
  const coarse = probe.matchMedia?.("(pointer: coarse)")?.matches ?? false;
  const noHover = probe.matchMedia?.("(hover: none)")?.matches ?? false;
  const points = probe.maxTouchPoints;
  const hasTouch = points === undefined ? true : points > 0;
  return coarse && noHover && hasTouch;
}

/**
 * 开发/联调用的强制开关：`?touch=1` 强制触屏、`?touch=0` 强制非触屏。
 * 生产构建里 `import.meta.env.DEV` 为 false，本分支被摇树消除，线上无法开启。
 */
export function devTouchOverride(search: string): boolean | null {
  if (!import.meta.env.DEV) return null;
  const match = /[?&]touch=(0|1)\b/.exec(search);
  if (!match) return null;
  return match[1] === "1";
}

export function resolveTouchMode(
  probe: TouchProbe,
  search = "",
): boolean {
  const override = devTouchOverride(search);
  return override ?? isTouchPrimary(probe);
}
