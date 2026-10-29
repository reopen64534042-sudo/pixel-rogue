import { describe, expect, it } from "vitest";
import { fresh, learn, ticks } from "./helpers";
import { JOYPAD, Joypad, knobOffset, snapAxis } from "../src/input/joystick";
import { isTouchPrimary, resolveTouchMode } from "../src/input/touchDevice";
import { JOYPAD_KEY, JoypadSettings } from "../src/input/joypadSettings";

/**
 * Issue #95：八向触控输入层。
 *
 * 覆盖三层：
 * 1. 纯数学（扇区吸附、死区、迟滞）——摇杆正确性的根；
 * 2. 指针状态机（单指持有、固定模式容差、回中）；
 * 3. 核心接缝（八向量与键盘同构、互不覆盖、冲刺按住态）。
 */
const OCTANT_VECTORS = [
  [1, 0],
  [1, 1],
  [0, 1],
  [-1, 1],
  [-1, 0],
  [-1, -1],
  [0, -1],
  [1, -1],
] as const;

/** 按角度造一个半径 r 上的点（屏幕坐标：y 向下） */
function pointAt(deg: number, radius: number) {
  const rad = (deg * Math.PI) / 180;
  return { dx: Math.cos(rad) * radius, dy: Math.sin(rad) * radius };
}

describe("joystick octant snapping", () => {
  it("maps the eight sector centers to the expected unit vectors", () => {
    for (let i = 0; i < 8; i++) {
      const { dx, dy } = pointAt(i * 45, 40);
      const result = snapAxis(dx, dy, 40);
      expect(result.octant).toBe(i);
      expect(result.axis).toEqual({
        x: OCTANT_VECTORS[i][0],
        y: OCTANT_VECTORS[i][1],
      });
    }
  });

  it("treats the dead zone as no input", () => {
    const inside = snapAxis(40 * JOYPAD.deadzone * 0.9, 0, 40);
    expect(inside.axis).toBeNull();
    expect(inside.octant).toBeNull();
    const outside = snapAxis(40 * JOYPAD.deadzone * 1.2, 0, 40);
    expect(outside.axis).toEqual({ x: 1, y: 0 });
  });

  it("keeps the current sector inside the hysteresis band", () => {
    // 已处于扇区 0（右）；30° 落在 22.5°+8° 的粘滞区间内，不应切到右下
    const sticky = snapAxis(pointAt(30, 40).dx, pointAt(30, 40).dy, 40, 0);
    expect(sticky.octant).toBe(0);
    // 越过迟滞边界后正常切换
    const switched = snapAxis(pointAt(40, 40).dx, pointAt(40, 40).dy, 40, 0);
    expect(switched.octant).toBe(1);
    // 无历史扇区时按最近扇区吸附
    const fresh40 = snapAxis(pointAt(40, 40).dx, pointAt(40, 40).dy, 40, null);
    expect(fresh40.octant).toBe(1);
  });

  it("never reports a direction for an unusable radius", () => {
    expect(snapAxis(10, 10, 0).axis).toBeNull();
  });

  it("normalizes the knob offset for drawing", () => {
    const diag = knobOffset(1, 1, 1);
    expect(Math.hypot(diag.x, diag.y)).toBeCloseTo(1, 8);
    expect(knobOffset(0, 0, 10)).toEqual({ x: 0, y: 0 });
    expect(knobOffset(3, 0, 10)).toEqual({ x: 3, y: 0 });
  });
});

describe("joypad pointer state machine", () => {
  it("tracks one finger from press to release in float mode", () => {
    const joy = new Joypad("float");
    joy.radius = 40;
    expect(joy.press(1, 100, 100)).toBe(true);
    expect(joy.active).toBe(true);
    expect(joy.center).toEqual({ x: 100, y: 100 });
    joy.move(1, 100, 140);
    expect(joy.axis).toEqual({ x: 0, y: 1 });
    expect(joy.release(1)).toBe(true);
    expect(joy.active).toBe(false);
    expect(joy.axis).toEqual({ x: 0, y: 0 });
  });

  it("ignores a second finger while the first holds the stick", () => {
    const joy = new Joypad("float");
    joy.radius = 40;
    joy.press(1, 100, 100);
    joy.move(1, 140, 100);
    expect(joy.axis).toEqual({ x: 1, y: 0 });
    expect(joy.press(2, 300, 300)).toBe(false);
    joy.move(2, 300, 220);
    expect(joy.axis).toEqual({ x: 1, y: 0 });
    expect(joy.release(2)).toBe(false);
    expect(joy.active).toBe(true);
    expect(joy.release(1)).toBe(true);
  });

  it("requires the fixed anchor to be grabbed near it", () => {
    const joy = new Joypad("fixed");
    joy.radius = 40;
    joy.anchor = { x: 60, y: 300 };
    expect(joy.press(1, 400, 40)).toBe(false);
    expect(joy.press(1, 70, 310)).toBe(true);
    // 固定模式下中心锁在锚点，手指偏移超过半径才算满速
    expect(joy.center).toEqual({ x: 60, y: 300 });
    joy.move(1, 60, 260);
    expect(joy.axis).toEqual({ x: 0, y: -1 });
  });

  it("resets to neutral on demand", () => {
    const joy = new Joypad("float");
    joy.radius = 40;
    joy.press(7, 0, 0);
    joy.move(7, 0, 30);
    joy.reset();
    expect(joy.active).toBe(false);
    expect(joy.holdingId).toBeNull();
    expect(joy.axis).toEqual({ x: 0, y: 0 });
  });
});

describe("touch device detection", () => {
  const match = (coarse: boolean, noHover: boolean) => (query: string) => ({
    matches: query === "(pointer: coarse)" ? coarse : noHover,
  });

  it("accepts a real touch device", () => {
    expect(
      isTouchPrimary({ matchMedia: match(true, true), maxTouchPoints: 5 }),
    ).toBe(true);
  });

  it("rejects a desktop without touch points", () => {
    expect(
      isTouchPrimary({ matchMedia: match(false, false), maxTouchPoints: 0 }),
    ).toBe(false);
  });

  it("rejects a touch laptop whose primary pointer is a mouse", () => {
    // 这是 D5 的核心场景：有触点，但主指针是 fine + hover，不能当成手机
    expect(
      isTouchPrimary({ matchMedia: match(false, false), maxTouchPoints: 10 }),
    ).toBe(false);
  });

  it("rejects environments without matchMedia", () => {
    expect(isTouchPrimary({ maxTouchPoints: 5 })).toBe(false);
  });

  it("allows a dev-only override for local mobile debugging", () => {
    expect(resolveTouchMode({ maxTouchPoints: 0 }, "?touch=1")).toBe(true);
    expect(
      resolveTouchMode({ matchMedia: match(true, true), maxTouchPoints: 5 }, "")
    ).toBe(true);
  });
});

describe("joypad settings persistence", () => {
  function memoryStore(initial: string | null = null) {
    let raw = initial;
    return {
      getItem: () => raw,
      setItem: (_key: string, value: string) => {
        raw = value;
      },
      peek: () => raw,
    };
  }

  it("defaults to float and round-trips the fixed mode", () => {
    const store = memoryStore();
    const settings = new JoypadSettings(store);
    expect(settings.read()).toBe("float");
    expect(settings.write("fixed")).toBe(true);
    expect(JSON.parse(store.peek()!)).toEqual({ v: 1, mode: "fixed" });
    expect(settings.read()).toBe("fixed");
  });

  it("falls back to the default without overwriting damaged data", () => {
    const store = memoryStore("{not json");
    const settings = new JoypadSettings(store);
    expect(settings.read()).toBe("float");
    expect(settings.lastError).not.toBeNull();
    expect(store.peek()).toBe("{not json");
  });

  it("treats an unknown schema version as damaged", () => {
    const store = memoryStore(JSON.stringify({ v: 2, mode: "fixed" }));
    const settings = new JoypadSettings(store);
    expect(settings.read()).toBe("float");
    expect(settings.lastError).not.toBeNull();
    expect(JSON.parse(store.peek()!)).toEqual({ v: 2, mode: "fixed" });
  });

  it("uses its own key, independent from records and codex", () => {
    expect(JOYPAD_KEY).toBe("pixelrogue_joypad");
  });
});

describe("core touch input seam", () => {
  it("moves in all eight directions at the same speed", () => {
    for (const [x, y] of OCTANT_VECTORS) {
      const g = fresh();
      const p = g.player;
      const x0 = p.x;
      const y0 = p.y;
      g.setMoveAxis(x, y);
      ticks(g, 30); // 0.5s，未到首波生成时间，避免敌人干扰
      const dx = p.x - x0;
      const dy = p.y - y0;
      // 对角归一用既有的 0.7071 近似（非 1/√2），故按 3 位精度比较等速
      expect(Math.hypot(dx, dy)).toBeCloseTo(p.speed * 0.5, 3);
      if (x === 0) expect(dx).toBe(0);
      else expect(Math.sign(dx)).toBe(x);
      if (y === 0) expect(dy).toBe(0);
      else expect(Math.sign(dy)).toBe(y);
    }
  });

  it("only accepts eight-direction values from the touch layer", () => {
    const g = fresh();
    g.setMoveAxis(0.3, -2);
    expect(g.moveX).toBe(0);
    expect(g.moveY).toBe(-1);
    g.setMoveAxis(0.7, 0.6);
    expect(g.moveX).toBe(1);
    expect(g.moveY).toBe(1);
  });

  it("takes priority over the keyboard without overwriting key state", () => {
    const g = fresh();
    g.keys.d = true;
    g.setMoveAxis(-1, 0);
    const x0 = g.player.x;
    ticks(g, 10);
    expect(g.player.x).toBeLessThan(x0);
    // 物理键盘按下态必须保持，摇杆不能反向清理它
    expect(g.keys.d).toBe(true);
    g.setMoveAxis(0, 0);
    const x1 = g.player.x;
    ticks(g, 10);
    expect(g.player.x).toBeGreaterThan(x1);
  });

  it("triggers a dash while the touch button is held", () => {
    const g = fresh();
    learn(g, "疾影步");
    const p = g.player;
    expect(p.dashCharges).toBe(1);
    g.setDashHeld(true);
    ticks(g, 1);
    expect(p.dashT).toBeGreaterThan(0);
    expect(p.dashCharges).toBe(0);
  });

  // 基线更新依据：Issue #137——开局自带基础冲刺，触屏冲刺键无需解锁即可用
  it("triggers the base dash from the touch button without any talent", () => {
    const g = fresh();
    const p = g.player;
    expect(p.dashLv).toBe(1);
    g.setDashHeld(true);
    ticks(g, 1);
    expect(p.dashT).toBeGreaterThan(0);
    expect(p.dashCharges).toBe(0);
  });

  it("clears touch input on reset and on demand", () => {
    const g = fresh();
    g.setMoveAxis(1, 1);
    g.setDashHeld(true);
    g.clearTouchInput();
    expect([g.moveX, g.moveY, g.dashHeld]).toEqual([0, 0, false]);
    g.setMoveAxis(-1, 0);
    g.setDashHeld(true);
    g.startGame();
    expect([g.moveX, g.moveY, g.dashHeld]).toEqual([0, 0, false]);
  });
});
