/**
 * 新手教程完成记录（v83）。
 *
 * 每个职业首次选择时自动进入练习场；法杖沿用 mage 键，领域使用 mage:domain，
 * 完成或跳过只标记对应教程已看，
 * 之后选择职业直接正式开局。开始界面的「新手教程」入口不受此限制，可重看。
 *
 * 存储键 `pixelrogue_tutorial_v1`：{ v: 1, seen: { shooter: true, ... } }。
 * 读不到/损坏时回退未看，不覆盖原数据（只有完成/跳过时才写回）。
 */
import type { MageWeapon } from "../core/types";

const KEY = "pixelrogue_tutorial_v1";

/** 教程按钮的默认快捷键：F 下一步 / 开始正式战斗，X 跳过；与自定义动作键冲突时动作键优先。 */
export const TUTORIAL_NEXT_KEY = "f";
export const TUTORIAL_SKIP_KEY = "x";

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

/** Legacy mage completion belongs to the staff; domain has its own marker. */
function tutorialKey(prof: string, mageWeapon: MageWeapon): string {
  return prof === "mage" && mageWeapon === "domain" ? "mage:domain" : prof;
}

export function tutorialSeen(prof: string, mageWeapon: MageWeapon = "arcane"): boolean {
  return readSeen()[tutorialKey(prof, mageWeapon)] === true;
}

export function markTutorialSeen(prof: string, mageWeapon: MageWeapon = "arcane"): void {
  try {
    if (typeof localStorage === "undefined") return;
    const seen = readSeen();
    seen[tutorialKey(prof, mageWeapon)] = true;
    localStorage.setItem(KEY, JSON.stringify({ v: 1, seen }));
  } catch {
    // 隐私模式/存储不可用：本次会话仍可完成教程，只是不记住
  }
}
