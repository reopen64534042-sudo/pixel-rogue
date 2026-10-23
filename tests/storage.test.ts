import { describe, it, expect } from "vitest";
import {
  StorageService,
  RECORD_KEY,
  type RunRecord,
} from "../src/services/StorageService";
const record: RunRecord = {
  d: 1,
  t: 123,
  k: 7,
  lv: 2,
  w: 1,
  up: { 磨刃: 1 },
  dmg: { bullet: 77 },
};
describe("legacy battle history", () => {
  it("reads original records without changing their schema and keeps last 50", () => {
    let raw = JSON.stringify(
      Array.from({ length: 50 }, (_, i) => ({ ...record, d: i })),
    );
    const storage = new StorageService({
      getItem: (key) => (key === RECORD_KEY ? raw : null),
      setItem: (key, value) => {
        expect(key).toBe(RECORD_KEY);
        raw = value;
      },
    });
    expect(storage.read()[0]).toEqual({ ...record, d: 0 });
    expect(storage.append({ ...record, d: 99 })).toBe(true);
    const result = storage.read();
    expect(result).toHaveLength(50);
    expect(result[0].d).toBe(1);
    expect(result[49].d).toBe(99);
    expect(Object.keys(JSON.parse(raw)[0])).toEqual([
      "d",
      "t",
      "k",
      "lv",
      "w",
      "up",
      "dmg",
    ]);
  });
  it("never overwrites corrupted or incompatible history", () => {
    for (const raw of ["{bad", "{}", "[null]", '[{"d":1}]']) {
      let writes = 0;
      const storage = new StorageService({
        getItem: () => raw,
        setItem: () => {
          writes++;
        },
      });
      expect(storage.read()).toEqual([]);
      expect(storage.append(record)).toBe(false);
      expect(storage.lastError).toBeTruthy();
      expect(writes).toBe(0);
    }
  });
  it("denied reads and full quotas do not throw", () => {
    const denied = new StorageService({
      getItem: () => {
        throw new Error("denied");
      },
      setItem: () => {
        throw new Error("denied");
      },
    });
    expect(denied.append(record)).toBe(false);
    expect(denied.lastError).toBe("denied");
    const full = new StorageService({
      getItem: () => null,
      setItem: () => {
        throw new Error("quota");
      },
    });
    expect(full.append(record)).toBe(false);
    expect(full.lastError).toBe("quota");
  });
});
