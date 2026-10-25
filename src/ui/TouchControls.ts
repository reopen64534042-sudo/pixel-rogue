import type { GameCore } from "../game/core/GameCore";
import { JOYPAD, Joypad, knobOffset, type JoypadMode } from "../input/joystick";
import { JoypadSettings } from "../input/joypadSettings";
import { resolveTouchMode } from "../input/touchDevice";
import { element } from "./dom";

/**
 * Issue #95：触控操作层（八向摇杆 + 冲刺键 + 摇杆模式设置）。
 *
 * 分层原则：
 * - **纯逻辑**在 `src/input/joystick.ts`（可 Vitest 覆盖）；
 * - 本文件只做 DOM 绑定、坐标换算与每帧同步，不实现任何游戏规则；
 * - 移动结果一律通过 `core.setMoveAxis / setDashHeld` 写入，绝不直接改 `core.keys`
 *   （与物理键盘同表会互相覆盖，症状是松手后角色仍在走）。
 *
 * 非触屏设备（判定见 `touchDevice.ts`）整个层不启用：不绑事件、不渲染控件。
 */
export class TouchControls {
  private readonly joy = new Joypad();
  private readonly settings = new JoypadSettings();
  private readonly layer: HTMLElement;
  private readonly base: HTMLElement;
  private readonly knob: HTMLElement;
  private readonly dash: HTMLButtonElement;
  private readonly dashCount: HTMLElement;
  private readonly settingsOverlay: HTMLElement;
  private readonly modeButtons: Record<JoypadMode, HTMLButtonElement>;
  private readonly modeDesc: HTMLElement;
  private enabled = false;
  private dashHold = false;
  private dashPulseUntil = 0;
  private dashPointer: number | null = null;
  private radius = 40;
  private bounds: { width: number; height: number } | null = null;

  constructor(
    private readonly core: GameCore,
    private readonly canvas: HTMLCanvasElement,
  ) {
    this.layer = element("touch-layer");
    this.base = element("joy-base");
    this.knob = element("joy-knob");
    this.dash = element("btn-dash") as HTMLButtonElement;
    this.dashCount = element("dash-count");
    this.settingsOverlay = element("ov-input");
    this.modeDesc = element("joy-mode-desc");
    this.modeButtons = {
      float: element("joy-mode-float") as HTMLButtonElement,
      fixed: element("joy-mode-fixed") as HTMLButtonElement,
    };
    this.enabled = resolveTouchMode(
      {
        matchMedia: (query: string) => window.matchMedia(query),
        maxTouchPoints: navigator.maxTouchPoints,
      },
      location.search,
    );
    if (!this.enabled) return;
    this.joy.mode = this.settings.read();
    this.layer.classList.remove("hidden");
    // 供样式区分触屏档（缩小/放大既有控件用），不影响任何规则
    document.getElementById("stage")?.classList.add("touch-mode");
    this.bind();
    this.layout();
    this.renderMode();
  }

  /** 是否启用触控层（非触屏设备为 false，此时所有方法均为空操作） */
  get active(): boolean {
    return this.enabled;
  }

  private bind() {
    this.canvas.addEventListener("pointerdown", this.onJoystickDown);
    this.canvas.addEventListener("pointermove", this.onJoystickMove);
    this.canvas.addEventListener("pointerup", this.onJoystickUp);
    this.canvas.addEventListener("pointercancel", this.onJoystickCancel);
    this.dash.addEventListener("pointerdown", this.onDashDown);
    this.dash.addEventListener("pointerup", this.onDashUp);
    this.dash.addEventListener("pointercancel", this.onDashUp);
    this.dash.addEventListener("pointerleave", this.onDashUp);
    for (const mode of ["float", "fixed"] as const)
      this.modeButtons[mode].onclick = () => this.setMode(mode);
    element("btn-input-close").onclick = () => this.closeSettings();
    // 「设置 · 敬请期待」在手机端转为可用的操作设置入口；PC 端保持禁用占位。
    const entry = element("btn-pause-settings") as HTMLButtonElement;
    entry.disabled = false;
    entry.textContent = "操 作 设 置";
    entry.onclick = () => this.openSettings();
    // 触屏没有键盘，暂停键去掉快捷键后缀，并按下文的 .touch-mode 放大点击区
    element("btn-pause").textContent = "暂停";
    window.addEventListener("resize", this.layout);
    window.addEventListener("orientationchange", this.layout);
  }

  /** 指针坐标换算到舞台局部坐标（与 #stage 内绝对定位控件同一坐标系） */
  private toLocal(event: PointerEvent) {
    const rect = this.canvas.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  /** 按舞台尺寸重算摇杆半径与固定锚点；视口变化后必须重算，否则半径会错位 */
  private layout = () => {
    if (!this.enabled) return;
    const rect = this.canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    this.radius = Math.max(24, Math.min(64, rect.height * JOYPAD.radiusRatio));
    this.joy.radius = this.radius;
    this.bounds = { width: rect.width, height: rect.height };
    // 锚点取更偏左下：贴近拇指自然落点，同时给底部面板留出空间
    this.joy.anchor = this.clampCenter({
      x: rect.width * 0.15,
      y: rect.height * 0.78,
    });
    // 冲刺键文字按按钮实际尺寸定，避免沿用 vmin 在手机上缩到不可读
    this.dash.style.fontSize = `${Math.round(Math.max(11, rect.height * 0.042))}px`;
    this.paintBase();
  };

  /**
   * 把摇杆中心压回舞台内，保证整个底盘不越界。
   * 浮动模式下手指可能按在边缘，不夹紧会出现底盘被裁掉一半、帽子贴边到看不见。
   */
  private clampCenter(point: { x: number; y: number }) {
    if (!this.bounds) return point;
    const r = this.radius;
    return {
      x: Math.min(Math.max(point.x, r + 4), this.bounds.width - r - 4),
      y: Math.min(Math.max(point.y, r + 4), this.bounds.height - r - 4),
    };
  }

  private showBase(center: { x: number; y: number }) {
    const size = this.radius * 2;
    this.base.style.width = `${size}px`;
    this.base.style.height = `${size}px`;
    this.base.style.left = `${center.x}px`;
    this.base.style.top = `${center.y}px`;
    this.base.classList.remove("hidden");
    this.knob.style.width = `${this.radius * 0.62}px`;
    this.knob.style.height = `${this.radius * 0.62}px`;
  }

  private hideBase() {
    this.base.classList.add("hidden");
    this.centerKnob();
  }

  /** 固定模式下常显锚点作为位置提示；浮动模式只在按下后出现 */
  private paintBase() {
    if (this.joy.mode === "fixed") {
      this.showBase(this.joy.anchor);
      this.centerKnob();
    } else if (!this.joy.active) {
      this.hideBase();
    }
  }

  /** 帽子回中：用 transform 定位，避免依赖父容器的绝对坐标 */
  private centerKnob() {
    this.knob.style.transform = "translate(-50%, -50%)";
  }

  private paintKnob() {
    // knobOffset 在此兼作方向归一：把 ±1（含对角）压成单位向量，
    // 帽子位置因此与实际生效方向严格一致，不会出现「斜向视觉偏移更远」。
    const dir = knobOffset(this.joy.axis.x, this.joy.axis.y, 1);
    const reach = this.radius * 0.62;
    this.knob.style.transform =
      `translate(calc(-50% + ${dir.x * reach}px), calc(-50% + ${dir.y * reach}px))`;
  }

  private onJoystickDown = (event: PointerEvent) => {
    // 触屏设备上的鼠标（如外接鼠标）不接管，避免误触
    if (event.pointerType === "mouse") return;
    if (this.core.state !== "play") return;
    const point = this.clampCenter(this.toLocal(event));
    if (!this.joy.press(event.pointerId, point.x, point.y)) return;
    event.preventDefault();
    this.capture(this.canvas, event.pointerId);
    this.showBase(this.joy.center);
    this.centerKnob();
    this.applyAxis();
  };

  /**
   * 指针捕获：让手指滑出画布后仍能收到 move/up。
   * 合成事件（自动化测试）的 pointerId 不是活跃指针，捕获会抛错，此处吞掉——
   * 失败只会影响「滑出边界」，不影响正常拖动。
   */
  private capture(target: HTMLElement, pointerId: number) {
    try {
      target.setPointerCapture(pointerId);
    } catch {
      // 非活跃指针：忽略
    }
  }

  private onJoystickMove = (event: PointerEvent) => {
    if (!this.joy.active || this.joy.holdingId !== event.pointerId) return;
    const point = this.toLocal(event);
    this.joy.move(event.pointerId, point.x, point.y);
    if (this.joy.active) this.paintKnob();
    this.applyAxis();
  };

  private onJoystickUp = (event: PointerEvent) => {
    if (!this.joy.release(event.pointerId)) return;
    this.releaseJoystickArtifacts();
  };

  private onJoystickCancel = (event: PointerEvent) => {
    if (!this.joy.release(event.pointerId)) return;
    this.releaseJoystickArtifacts();
  };

  private releaseJoystickArtifacts() {
    this.applyAxis();
    if (this.joy.mode === "fixed") this.paintBase();
    else this.hideBase();
  }

  private applyAxis() {
    this.core.setMoveAxis(this.joy.axis.x, this.joy.axis.y);
  }

  private onDashDown = (event: PointerEvent) => {
    if (event.pointerType === "mouse") return;
    event.preventDefault();
    this.dashPointer = event.pointerId;
    this.capture(this.dash, event.pointerId);
    this.dashHold = true;
    // 极短点击也要能被 60Hz 模拟捕捉到，保底 80ms
    this.dashPulseUntil = performance.now() + 80;
    this.dash.classList.add("pressed");
    this.core.setDashHeld(true);
  };

  private onDashUp = (event: PointerEvent) => {
    if (this.dashPointer !== null && event.pointerId !== this.dashPointer) return;
    this.dashPointer = null;
    this.dashHold = false;
    this.dash.classList.remove("pressed");
    this.core.setDashHeld(performance.now() < this.dashPulseUntil);
  };

  /** 每帧同步：状态门控 + 冲刺键显隐/充能显示。必须在模拟推进前调用。 */
  sync() {
    if (!this.enabled) return;
    if (this.core.state !== "play") {
      if (this.joy.active) this.joy.reset();
      this.dashHold = false;
      this.dashPulseUntil = 0;
      this.dash.classList.remove("pressed");
      this.core.clearTouchInput();
      if (this.joy.mode === "fixed") this.paintBase();
      else this.hideBase();
      return;
    }
    this.core.setMoveAxis(this.joy.axis.x, this.joy.axis.y);
    if (this.joy.active) this.paintKnob();
    // 每帧无条件写入冲刺按住态：只置 true 不置 false 会让按钮「一按到底」，
    // 松手后角色会一直冲刺（脉冲窗口结束后必须回落）。
    this.core.setDashHeld(
      this.dashHold || performance.now() < this.dashPulseUntil,
    );
    this.paintDash();
  }

  private paintDash() {
    const player = this.core.player;
    const visible = player.dashLv > 0;
    // D4：未解锁冲刺天赋时不显示按钮；只在状态变化时改 class，避免每帧触发布局
    if (this.dash.classList.contains("hidden") !== !visible)
      this.dash.classList.toggle("hidden", !visible);
    if (!visible) return;
    this.dash.classList.toggle("empty", player.dashCharges <= 0);
    this.dashCount.textContent = `${player.dashCharges}`;
  }

  /** 失焦 / 切后台 / 场景关闭时强制回中，避免「回来还在走」 */
  reset() {
    if (!this.enabled) return;
    this.joy.reset();
    this.dashHold = false;
    this.dashPulseUntil = 0;
    this.dashPointer = null;
    this.core.clearTouchInput();
    this.dash.classList.remove("pressed");
    if (this.joy.mode === "fixed") this.paintBase();
    else this.hideBase();
  }

  private setMode(mode: JoypadMode) {
    this.joy.mode = mode;
    this.settings.write(mode);
    this.joy.reset();
    this.core.clearTouchInput();
    this.renderMode();
    if (mode === "fixed") {
      this.showBase(this.joy.anchor);
      this.centerKnob();
    } else this.hideBase();
  }

  private renderMode() {
    for (const mode of ["float", "fixed"] as const) {
      const button = this.modeButtons[mode];
      const on = this.joy.mode === mode;
      button.classList.toggle("on", on);
      button.setAttribute("aria-pressed", on ? "true" : "false");
    }
    this.modeDesc.textContent =
      this.joy.mode === "float"
        ? "浮动：左半屏任意位置按下即在该处生成摇杆中心（推荐）"
        : "固定：摇杆固定显示在左下角，按住该区域拖动";
  }

  private openSettings() {
    this.reset();
    this.settingsOverlay.classList.remove("hidden");
  }

  private closeSettings() {
    this.settingsOverlay.classList.add("hidden");
  }

  dispose() {
    if (!this.enabled) return;
    this.canvas.removeEventListener("pointerdown", this.onJoystickDown);
    this.canvas.removeEventListener("pointermove", this.onJoystickMove);
    this.canvas.removeEventListener("pointerup", this.onJoystickUp);
    this.canvas.removeEventListener("pointercancel", this.onJoystickCancel);
    this.dash.removeEventListener("pointerdown", this.onDashDown);
    this.dash.removeEventListener("pointerup", this.onDashUp);
    this.dash.removeEventListener("pointercancel", this.onDashUp);
    this.dash.removeEventListener("pointerleave", this.onDashUp);
    for (const mode of ["float", "fixed"] as const)
      this.modeButtons[mode].onclick = null;
    element("btn-input-close").onclick = null;
    (element("btn-pause-settings") as HTMLButtonElement).onclick = null;
    window.removeEventListener("resize", this.layout);
    window.removeEventListener("orientationchange", this.layout);
    document.getElementById("stage")?.classList.remove("touch-mode");
    element("btn-pause").textContent = "⏸ 暂停 (P)";
    this.core.clearTouchInput();
  }
}
