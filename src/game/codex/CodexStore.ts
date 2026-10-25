export const CODEX_KEY = "pixelrogue_codex";

export interface CodexTalentState {
  /** 历史最高持有等级 */
  max: number;
  /** 首次解锁时间戳；`0` 表示由战绩补档得出，无确切时间 */
  first: number;
}

export interface CodexEnemyState {
  kills: number;
  first: number;
}

/**
 * 图鉴存档 v1。
 *
 * 与战绩（`pixelrogue_records`）**互相独立**，不合并为单一 profile：
 * 战绩是「每局快照」数组，图鉴是「历史累计集合」，两者的损坏语义与清理策略不同。
 * 当前没有局内存档，本文件不承担任何续局职责。
 */
export interface CodexSaveV1 {
  v: 1;
  talents: Record<string, CodexTalentState>;
  enemies: Record<string, CodexEnemyState>;
}

export type CodexStorage = Pick<Storage, "getItem" | "setItem">;

export function emptyCodex(): CodexSaveV1 {
  return { v: 1, talents: {}, enemies: {} };
}

function isNonNegativeNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function isUnitMap<T>(
  value: unknown,
  check: (item: unknown) => item is T,
): value is Record<string, T> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    Object.values(value).every(check)
  );
}

function isTalentState(value: unknown): value is CodexTalentState {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return isNonNegativeNumber(v.max) && isNonNegativeNumber(v.first);
}

function isEnemyState(value: unknown): value is CodexEnemyState {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return isNonNegativeNumber(v.kills) && isNonNegativeNumber(v.first);
}

function isSave(value: unknown): value is CodexSaveV1 {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    v.v === 1 && isUnitMap(v.talents, isTalentState) && isUnitMap(v.enemies, isEnemyState)
  );
}

/**
 * 图鉴存档读写。
 *
 * 容错策略与 `StorageService` 一致：结构校验失败时**保留原数据并记录 `lastError`**，
 * 后续 `update` 立即中止，绝不用空档覆盖玩家已有进度。
 */
export class CodexStore {
  lastError: string | null = null;

  constructor(private readonly store?: CodexStorage) {}

  /** 纯 node 测试环境下没有 localStorage，降级为「存储不可用」而不是抛错。 */
  private get storage(): CodexStorage | null {
    if (this.store) return this.store;
    return typeof globalThis.localStorage === "undefined" ? null : globalThis.localStorage;
  }

  read(): CodexSaveV1 {
    this.lastError = null;
    const storage = this.storage;
    if (!storage) {
      this.lastError = "存储不可用";
      return emptyCodex();
    }
    try {
      const raw = storage.getItem(CODEX_KEY);
      if (!raw) return emptyCodex();
      const value: unknown = JSON.parse(raw);
      if (!isSave(value)) throw new Error("图鉴存档格式损坏，保留原数据");
      return { v: 1, talents: { ...value.talents }, enemies: { ...value.enemies } };
    } catch (error) {
      this.lastError = error instanceof Error ? error.message : String(error);
      return emptyCodex();
    }
  }

  /**
   * 读改写：读到损坏数据时立即中止，返回 false，原数据保持不变。
   * 调用点位于游戏主循环（波末同步），因此 `mutate` 的异常必须在此吞掉并记录——
   * 图鉴是旁路系统，不允许因自身异常打断 `updateWave`。
   */
  update(mutate: (state: CodexSaveV1) => void): boolean {
    const state = this.read();
    if (this.lastError) return false;
    try {
      mutate(state);
    } catch (error) {
      this.lastError = error instanceof Error ? error.message : String(error);
      return false;
    }
    return this.write(state);
  }

  private write(state: CodexSaveV1): boolean {
    const storage = this.storage;
    if (!storage) {
      this.lastError = "存储不可用";
      return false;
    }
    try {
      storage.setItem(CODEX_KEY, JSON.stringify(state));
      return true;
    } catch (error) {
      this.lastError = error instanceof Error ? error.message : String(error);
      return false;
    }
  }
}
