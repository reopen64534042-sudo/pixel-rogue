/**
 * Issue #95：八向摇杆纯逻辑（不依赖 DOM / Phaser）。
 *
 * 设计要点：
 * - 产出 `-1 | 0 | 1` 的八向量，与键盘 `keys` 派生的 `mx / my` 完全同构，
 *   下游 `PlayerSystem` 的对角 `×0.7071` 归一与移动规则一字不改；
 * - 吸附带迟滞：只有越过「22.5° + 迟滞」才切扇区，避免手指停在扇区边界时方向抖动；
 * - 死区按半径比例判定，回中即视为无输入（`axis = null`）。
 *
 * 该模块可被 Vitest 直接覆盖，UI 层只负责把指针坐标喂进来。
 */

export type JoypadMode = "float" | "fixed";

export interface Axis {
  x: number;
  y: number;
}

export const JOYPAD = {
  /** 死区占摇杆半径的比例 */
  deadzone: 0.25,
  /** 扇区切换迟滞（度）。基础半扇区 22.5°，加该值构成粘滞区间 */
  hysteresisDeg: 8,
  /** 摇杆半径占舞台短边的比例（UI 层据此换算像素） */
  radiusRatio: 0.125,
  /** 固定模式的拖拽吸附容差（相对半径）：落在锚点该范围内即可接管 */
  grabTolerance: 1.8,
} as const;

/** 扇区表：索引 × 45° = 屏幕角度（y 轴向下，0° 指向右） */
const OCTANTS: readonly Axis[] = [
  { x: 1, y: 0 },
  { x: 1, y: 1 },
  { x: 0, y: 1 },
  { x: -1, y: 1 },
  { x: -1, y: 0 },
  { x: -1, y: -1 },
  { x: 0, y: -1 },
  { x: 1, y: -1 },
];

export interface SnapResult {
  /** 八向量；死区内为 null */
  axis: Axis | null;
  /** 命中的扇区索引（0–7）；死区内为 null */
  octant: number | null;
}

/**
 * 把指针相对摇杆中心的位移吸附成八向量。
 *
 * @param prevOctant 上一次命中的扇区，用于迟滞；首次按下传 null
 */
export function snapAxis(
  dx: number,
  dy: number,
  radius: number,
  prevOctant: number | null = null,
  deadzone: number = JOYPAD.deadzone,
  hysteresisDeg: number = JOYPAD.hysteresisDeg,
): SnapResult {
  const distance = Math.hypot(dx, dy);
  if (radius <= 0 || distance < radius * deadzone) {
    return { axis: null, octant: null };
  }
  let deg = (Math.atan2(dy, dx) * 180) / Math.PI;
  if (deg < 0) deg += 360;
  if (prevOctant !== null) {
    let delta = Math.abs(deg - prevOctant * 45);
    if (delta > 180) delta = 360 - delta;
    if (delta <= 22.5 + hysteresisDeg)
      return { axis: OCTANTS[prevOctant], octant: prevOctant };
  }
  const octant = Math.round(deg / 45) % 8;
  return { axis: OCTANTS[octant], octant };
}

/** 摇杆帽子视觉偏移：限制在半径内，只用于绘制 */
export function knobOffset(dx: number, dy: number, radius: number): Axis {
  const distance = Math.hypot(dx, dy);
  if (distance <= radius || distance === 0) return { x: dx, y: dy };
  const k = radius / distance;
  return { x: dx * k, y: dy * k };
}

/**
 * 摇杆指针状态机：一次只允许一根手指持有摇杆，
 * 第二根手指的 down 会被忽略，避免「双指交替」把方向打乱。
 */
export class Joypad {
  /** 当前生效的中心（浮动模式下随按下位置变化） */
  center: Axis = { x: 0, y: 0 };
  /** 固定模式的锚点，由 UI 层按舞台尺寸写入 */
  anchor: Axis = { x: 0, y: 0 };
  /** 半径（舞台像素），由 UI 层按舞台尺寸写入 */
  radius = 40;
  axis: Axis = { x: 0, y: 0 };
  private pointerId: number | null = null;
  private prevOctant: number | null = null;

  constructor(public mode: JoypadMode = "float") {}

  get active(): boolean {
    return this.pointerId !== null;
  }

  get holdingId(): number | null {
    return this.pointerId;
  }

  /**
   * 按下。返回 false 表示本次按下未被接管（已有手指持杆，或固定模式下离锚点太远）。
   */
  press(pointerId: number, x: number, y: number): boolean {
    if (this.pointerId !== null) return false;
    if (this.mode === "fixed") {
      const reach = this.radius * JOYPAD.grabTolerance;
      if (Math.hypot(x - this.anchor.x, y - this.anchor.y) > reach) return false;
      this.center = { x: this.anchor.x, y: this.anchor.y };
    } else {
      this.center = { x, y };
    }
    this.pointerId = pointerId;
    this.prevOctant = null;
    this.axis = { x: 0, y: 0 };
    return true;
  }

  /** 拖动。非持有者的事件忽略。 */
  move(pointerId: number, x: number, y: number): void {
    if (pointerId !== this.pointerId) return;
    const result = snapAxis(
      x - this.center.x,
      y - this.center.y,
      this.radius,
      this.prevOctant,
    );
    this.prevOctant = result.octant;
    this.axis = result.axis ?? { x: 0, y: 0 };
  }

  /** 抬起 / 取消。非持有者的事件忽略。 */
  release(pointerId: number): boolean {
    if (pointerId !== this.pointerId) return false;
    this.reset();
    return true;
  }

  /** 强制回中（失焦、切后台、暂停、面板打开时调用） */
  reset(): void {
    this.pointerId = null;
    this.prevOctant = null;
    this.axis = { x: 0, y: 0 };
  }
}
