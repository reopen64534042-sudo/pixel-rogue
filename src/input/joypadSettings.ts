/**
 * Issue #95 / D1：摇杆模式持久化（仅手机端会用到，PC 端不提供设置入口）。
 *
 * 存储与战绩、图鉴相互独立：键名 `pixelrogue_joypad`，v1。
 * 读损坏时**不覆盖**原数据，只回退默认值——与 StorageService 的既有策略一致。
 */
export type JoypadMode = "float" | "fixed";

export const JOYPAD_KEY = "pixelrogue_joypad";
export const JOYPAD_DEFAULT: JoypadMode = "float";

export type JoypadStore = Pick<Storage, "getItem" | "setItem">;

interface JoypadRecord {
  v: number;
  mode: JoypadMode;
}

function isMode(value: unknown): value is JoypadMode {
  return value === "float" || value === "fixed";
}

function isRecord(value: unknown): value is JoypadRecord {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  return record.v === 1 && isMode(record.mode);
}

export class JoypadSettings {
  lastError: string | null = null;

  constructor(private readonly store?: JoypadStore) {}

  private get storage(): JoypadStore | undefined {
    return this.store ?? (globalThis.localStorage as JoypadStore | undefined);
  }

  read(): JoypadMode {
    this.lastError = null;
    try {
      const raw = this.storage?.getItem(JOYPAD_KEY);
      if (!raw) return JOYPAD_DEFAULT;
      const value: unknown = JSON.parse(raw);
      // 未知版本视为损坏：不覆盖，按默认值运行
      if (!isRecord(value)) throw new Error("摇杆设置格式不兼容");
      return value.mode;
    } catch (error) {
      this.lastError = error instanceof Error ? error.message : String(error);
      return JOYPAD_DEFAULT;
    }
  }

  write(mode: JoypadMode): boolean {
    this.lastError = null;
    try {
      const record: JoypadRecord = { v: 1, mode };
      this.storage?.setItem(JOYPAD_KEY, JSON.stringify(record));
      return true;
    } catch (error) {
      this.lastError = error instanceof Error ? error.message : String(error);
      return false;
    }
  }
}
