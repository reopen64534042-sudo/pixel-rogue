/**
 * 键位设置（v79）。
 *
 * 只允许改游戏内动作键；方向键、Esc 与数字 1-4 是固定保留键：
 * - 方向键始终可以移动（改键后的主键是额外的一套）；
 * - Esc 始终用于关闭覆盖层/暂停；
 * - 1-4 是升级/属性面板的快捷选卡；
 * - M（静音）、R（死亡后重开）、F2（DEV 面板）不参与改键。
 *
 * 存储键 `pixelrogue_keys`，v1；读不到/损坏/冲突时回退默认，
 * 不覆盖原存储（只有玩家在设置里保存时才写回）。
 */
export type KeyAction =
  | "up"
  | "down"
  | "left"
  | "right"
  | "dash"
  | "pause"
  | "stats"
  | "nextWave";

export type KeyBindings = Record<KeyAction, string>;

export const KEY_ACTIONS: readonly { action: KeyAction; label: string }[] = [
  { action: "up", label: "向上" },
  { action: "down", label: "向下" },
  { action: "left", label: "向左" },
  { action: "right", label: "向右" },
  { action: "dash", label: "冲刺" },
  { action: "pause", label: "暂停" },
  { action: "stats", label: "角色属性" },
  { action: "nextWave", label: "下一波" },
];

export const DEFAULT_KEYBINDS: KeyBindings = {
  up: "w",
  down: "s",
  left: "a",
  right: "d",
  dash: " ",
  pause: "p",
  stats: "c",
  nextWave: "f",
};

export const KEY_STORE = "pixelrogue_keys";

const RESERVED = new Set([
  "escape",
  "f1",
  "f2",
  "tab",
  "arrowup",
  "arrowdown",
  "arrowleft",
  "arrowright",
  "1",
  "2",
  "3",
  "4",
  // 固定系统快捷键，避免与改键后的动作双重触发。
  // 注意：教程里的 F「下一步」是固定键，但正式游戏的「下一波」可改键；
  // 教程模式会先消费 F，不会误触下一波。
  "m",
  "r",
]);

/** 统一按键名：Phaser/浏览器事件都用小写 key；空格保留单空格。 */
export function normalizeKey(key: string): string {
  return key.toLowerCase();
}

export function isBindableKey(key: string): boolean {
  const k = normalizeKey(key);
  // 功能键（F1-F12）留给浏览器/DEV，不在游戏内改键。
  return k.length > 0 && !RESERVED.has(k) && !/^f\d{1,2}$/.test(k);
}

export function keyLabel(key: string): string {
  const k = normalizeKey(key);
  if (k === " ") return "空格";
  if (k === "escape") return "Esc";
  if (k === "arrowup") return "↑";
  if (k === "arrowdown") return "↓";
  if (k === "arrowleft") return "←";
  if (k === "arrowright") return "→";
  if (k.length === 1) return k.toUpperCase();
  return k.charAt(0).toUpperCase() + k.slice(1);
}

export function findKeyConflict(
  bindings: KeyBindings,
  key: string,
  except: KeyAction,
): KeyAction | null {
  const k = normalizeKey(key);
  for (const { action } of KEY_ACTIONS) {
    if (action !== except && bindings[action] === k) return action;
  }
  return null;
}

export function loadKeyBindings(): KeyBindings {
  const defaults = { ...DEFAULT_KEYBINDS };
  try {
    if (typeof localStorage === "undefined") return defaults;
    const raw = localStorage.getItem(KEY_STORE);
    if (!raw) return defaults;
    const data = JSON.parse(raw) as {
      v?: number;
      bindings?: Partial<Record<KeyAction, string>>;
    };
    if (data?.v !== 1 || !data.bindings) return defaults;
    const loaded = { ...DEFAULT_KEYBINDS };
    for (const { action } of KEY_ACTIONS) {
      const candidate = data.bindings[action];
      if (typeof candidate !== "string") continue;
      const key = normalizeKey(candidate);
      if (isBindableKey(key)) loaded[action] = key;
    }
    // v128 新增「下一波」：旧存档没有该字段时默认 F；若 F 已被玩家
    // 绑给其他动作，自动换一个空闲键，避免整组回退丢掉自定义键位。
    const savedNext = data.bindings.nextWave;
    if (
      typeof savedNext !== "string" ||
      !isBindableKey(normalizeKey(savedNext))
    ) {
      const used = new Set(
        KEY_ACTIONS.filter(({ action }) => action !== "nextWave").map(
          ({ action }) => loaded[action],
        ),
      );
      if (used.has(loaded.nextWave)) {
        const fallback = ["f", "g", "h", "j", "k", "v", "b", "n"].find(
          (k) => !used.has(k),
        );
        if (fallback) loaded.nextWave = fallback;
      }
    }
    const values = KEY_ACTIONS.map(({ action }) => loaded[action]);
    // 旧数据/手改数据可能出现重复键：整组回退，避免两个动作抢一个键。
    if (new Set(values).size !== values.length) return defaults;
    return loaded;
  } catch {
    return defaults;
  }
}

export function saveKeyBindings(bindings: KeyBindings): void {
  try {
    if (typeof localStorage === "undefined") return;
    localStorage.setItem(
      KEY_STORE,
      JSON.stringify({ v: 1, bindings: { ...bindings } }),
    );
  } catch {
    // 隐私模式/存储不可用：本次会话仍使用内存中的设置
  }
}
