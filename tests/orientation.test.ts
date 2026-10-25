import { describe, expect, it } from "vitest";
import { isPortraitSize } from "../src/ui/OrientationGate";

/**
 * Issue #96（M2-1）：竖屏引导闸门的判定谓词。
 * 行为链路（遮罩显隐 + 自动暂停 + 不自动恢复）由浏览器用例覆盖，
 * 这里只钉住「什么算竖屏」这个纯判断。
 */
describe("portrait detection", () => {
  it("treats taller-than-wide as portrait", () => {
    expect(isPortraitSize({ width: 390, height: 844 })).toBe(true);
    expect(isPortraitSize({ width: 91, height: 92 })).toBe(true);
  });

  it("treats wider-than-tall as landscape", () => {
    expect(isPortraitSize({ width: 844, height: 390 })).toBe(false);
    expect(isPortraitSize({ width: 1920, height: 1080 })).toBe(false);
  });

  it("treats a square viewport as landscape (不拦正方形，避免误伤桌面窗口)", () => {
    expect(isPortraitSize({ width: 600, height: 600 })).toBe(false);
  });
});
