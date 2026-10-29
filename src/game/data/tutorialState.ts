/**
 * 新手教程完成记录（v83）。
 *
 * 每个职业首次选择时自动进入练习场；完成或跳过后标记该职业已看，
 * 之后选择职业直接正式开局。开始界面的「新手教程」入口不受此限制，可重看。
 *
 * 存储键 `pixelrogue_tutorial_v1`：{ v: 1, seen: { shooter: true, ... } }。
 * 读不到/损坏时回退未看，不覆盖原数据（只有完成/跳过时才写回）。
 */
const KEY = "pixelrogue_tutorial_v1";

function readSeen(): Record<string, boolean> {
  try {
    if (typeof localStorage === "undefined") return {};
    const raw = localStorage.getItem(KEY);
    if (!raw) return {};
    const data = JSON.parse(raw) as {
      v?: number;
      seen?: Record<string, boolean>;
    };
    if (data?.v !== 1 || !data.seen || typeof data.seen !== "object") return {};
    return data.seen;
  } catch {
    return {};
  }
}

export function tutorialSeen(prof: string): boolean {
  return readSeen()[prof] === true;
}

export function markTutorialSeen(prof: string): void {
  try {
    if (typeof localStorage === "undefined") return;
    const seen = readSeen();
    seen[prof] = true;
    localStorage.setItem(KEY, JSON.stringify({ v: 1, seen }));
  } catch {
    // 隐私模式/存储不可用：本次会话仍可完成教程，只是不记住
  }
}
