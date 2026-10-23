export interface RunRecord {
  d: number;
  t: number;
  k: number;
  lv: number;
  w: number;
  up: Record<string, number>;
  dmg: Record<string, number>;
}
export type RecordStore = Pick<Storage, "getItem" | "setItem">;
export const RECORD_KEY = "pixelrogue_records";
function numericMap(value: unknown): value is Record<string, number> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    Object.values(value).every(
      (v) => typeof v === "number" && Number.isFinite(v),
    )
  );
}
function isRecord(value: unknown): value is RunRecord {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    ["d", "t", "k", "lv", "w"].every(
      (k) => typeof v[k] === "number" && Number.isFinite(v[k]),
    ) &&
    numericMap(v.up) &&
    numericMap(v.dmg)
  );
}
/** v1 is exactly the legacy array format. No run-resume state is persisted. */
export class StorageService {
  lastError: string | null = null;
  constructor(private readonly store?: RecordStore) {}
  private get storage() {
    return this.store ?? globalThis.localStorage;
  }
  read(): RunRecord[] {
    try {
      const raw = this.storage.getItem(RECORD_KEY);
      if (!raw) return [];
      const value: unknown = JSON.parse(raw);
      if (!Array.isArray(value) || !value.every(isRecord))
        throw new Error("战绩格式损坏，保留原数据");
      return value.slice(-50);
    } catch (error) {
      this.lastError = error instanceof Error ? error.message : String(error);
      return [];
    }
  }
  append(record: RunRecord): boolean {
    this.lastError = null;
    const previous = this.read();
    if (this.lastError) return false; // Do not overwrite damaged or inaccessible history.
    try {
      this.storage.setItem(
        RECORD_KEY,
        JSON.stringify([...previous, record].slice(-50)),
      );
      return true;
    } catch (error) {
      this.lastError = error instanceof Error ? error.message : String(error);
      return false;
    }
  }
}
