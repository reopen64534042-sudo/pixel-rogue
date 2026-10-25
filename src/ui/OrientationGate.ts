import type { GameCore } from "../game/core/GameCore";
import { element } from "./dom";

/** 竖屏判定：宽高直接比较，不依赖媒体查询在不同浏览器上的实现差异 */
export function isPortraitSize(size: { width: number; height: number }): boolean {
  return size.height > size.width;
}

/**
 * Issue #96（M2-1）：竖屏引导闸门（D2 定为强制横屏）。
 *
 * 设计取舍：
 * - **只在触屏设备启用**——桌面把窗口拉窄不该被遮罩拦住；
 * - 进入竖屏时若正在战斗，顺手暂停：屏幕只剩 390×219 的一条窄带，继续跑模拟等于让玩家挨打；
 * - **不在旋转回横屏时自动恢复**：玩家可能正在看暂停里的信息，自动恢复会突然开打。
 *   闸门只负责收起遮罩，恢复交给玩家点「继续战斗」；
 * - 只在朝向真正翻转时动作，避免 `resize` 抖动反复触发暂停。
 */
export class OrientationGate {
  private readonly overlay: HTMLElement;
  private portrait = false;

  constructor(
    private readonly core: GameCore,
    private readonly enabled: boolean,
  ) {
    this.overlay = element("ov-orient");
    if (!this.enabled) return;
    this.apply();
    window.addEventListener("resize", this.apply);
    window.addEventListener("orientationchange", this.apply);
  }

  get active(): boolean {
    return this.enabled;
  }

  /** 当前是否被竖屏遮罩拦截（供测试与调试读取） */
  get blocked(): boolean {
    return this.portrait;
  }

  private apply = () => {
    const portrait = isPortraitSize({
      width: window.innerWidth,
      height: window.innerHeight,
    });
    if (portrait === this.portrait) return;
    this.portrait = portrait;
    this.overlay.classList.toggle("hidden", !portrait);
    if (portrait && this.core.state === "play") this.core.togglePause();
  };

  dispose() {
    if (!this.enabled) return;
    window.removeEventListener("resize", this.apply);
    window.removeEventListener("orientationchange", this.apply);
  }
}
