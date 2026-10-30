import Phaser from "phaser";

interface TextDrawState {
  fontSize: number;
  fillStyle: string;
  alpha: number;
  depth: number;
  scrollFactor: number;
  textAlign: CanvasTextAlign;
}

/**
 * 一组 Phaser Text label。浮动文字用固定槽位池，HUD 用顺序池。
 *
 * Phaser Text 每次 setText/setFontSize/setColor/setStroke 都会重绘内部 canvas
 * 并上传纹理；固定槽位让一条浮动文字在生命周期内复用同一个 label，
 * 只有内容真正变化（新文字占用该槽）时才重建。
 */
class TextLabelPool {
  private labels: Phaser.GameObjects.Text[] = [];
  private labelVal: string[] = [];
  private labelSize: number[] = [];
  private labelColor: string[] = [];
  constructor(private scene: Phaser.Scene) {}
  begin() {
    for (const label of this.labels) label.setVisible(false);
  }
  draw(index: number, value: string, x: number, y: number, state: TextDrawState) {
    let label = this.labels[index];
    if (!label) {
      label = this.scene.add.text(0, 0, "", {
        fontFamily: '"Press Start 2P", monospace',
        fontSize: 8,
        resolution: 1,
      });
      this.labels[index] = label;
    }
    if (this.labelVal[index] !== value) {
      label.setText(value);
      this.labelVal[index] = value;
    }
    if (this.labelSize[index] !== state.fontSize) {
      label.setFontSize(state.fontSize);
      this.labelSize[index] = state.fontSize;
    }
    if (this.labelColor[index] !== state.fillStyle) {
      label.setColor(state.fillStyle);
      this.labelColor[index] = state.fillStyle;
    }
    label.setOrigin(
      state.textAlign === "center"
        ? 0.5
        : state.textAlign === "right"
          ? 1
          : 0,
      0.8,
    );
    label
      .setPosition(x, y)
      .setVisible(true)
      .setAlpha(state.alpha)
      .setDepth(state.depth)
      .setScrollFactor(state.scrollFactor);
  }
  get count() {
    return this.labels.length;
  }
}

/** Retained-mode Phaser objects, batched and reused. No per-frame Canvas texture upload. */
export class PixelPainter {
  fillStyle = "#ffffff";
  strokeStyle = "#ffffff";
  globalAlpha = 1;
  font = "8px monospace";
  textAlign: CanvasTextAlign = "left";
  private graphics: Phaser.GameObjects.Graphics[] = [];
  private images: Phaser.GameObjects.Image[] = [];
  private hudLabels: TextLabelPool;
  private floatLabels: TextLabelPool;
  private gi = 0;
  private ii = 0;
  private hudIndex = 0;
  private depth = 0;
  private hud = false;
  private active: Phaser.GameObjects.Graphics | null = null;
  constructor(private scene: Phaser.Scene) {
    this.hudLabels = new TextLabelPool(scene);
    this.floatLabels = new TextLabelPool(scene);
  }
  begin() {
    for (const g of this.graphics) g.setVisible(false).clear();
    for (const i of this.images) i.setVisible(false);
    this.hudLabels.begin();
    this.floatLabels.begin();
    this.gi = 0;
    this.ii = 0;
    this.hudIndex = 0;
    this.depth = 0;
    this.hud = false;
    this.active = null;
    this.globalAlpha = 1;
  }
  screen() {
    this.active = null;
    this.hud = true;
  }
  private batch() {
    if (!this.active) {
      const g = this.graphics[this.gi] ?? this.scene.add.graphics();
      this.graphics[this.gi++] = g;
      g.setVisible(true)
        .setDepth(this.depth++)
        .setScrollFactor(this.hud ? 0 : 1);
      this.active = g;
    }
    return this.active;
  }
  private color(s: string) {
    return Number.parseInt(s.replace("#", ""), 16);
  }
  fillRect(x: number, y: number, w: number, h: number) {
    this.batch()
      .fillStyle(this.color(this.fillStyle), this.globalAlpha)
      .fillRect(x, y, w, h);
  }
  beginPath() {
    this.batch()
      .lineStyle(1, this.color(this.strokeStyle), this.globalAlpha)
      .beginPath();
  }
  moveTo(x: number, y: number) {
    this.batch().moveTo(x, y);
  }
  lineTo(x: number, y: number) {
    this.batch().lineTo(x, y);
  }
  arc(x: number, y: number, r: number, start: number, end: number) {
    this.batch().arc(x, y, r, start, end);
  }
  stroke() {
    this.batch().strokePath();
  }
  /**
   * 批量绘制陨石预警：圆环 + 十字（#112）。
   * 原先每个陨石要 2 次 beginPath + 2 次 strokePath，多个陨石时会反复打断批次；
   * 合并为一次 lineStyle + 一次 strokePath。pts 为扁平数组 [x,y,r, ...]。
   */
  meteorRing(pts: readonly number[], color: string, alpha: number) {
    if (pts.length < 3) return;
    this.active = null;
    const g = this.batch();
    g.lineStyle(1, this.color(color), alpha);
    g.beginPath();
    for (let i = 0; i + 2 < pts.length; i += 3) {
      const x = pts[i],
        y = pts[i + 1],
        r = pts[i + 2];
      // arc 会从上一条子路径的终点连线过来，先 moveTo 到弧起点断开
      g.moveTo(x + r, y);
      g.arc(x, y, r, 0, Math.PI * 2);
      g.moveTo(x - 6, y);
      g.lineTo(x + 6, y);
      g.moveTo(x, y - 6);
      g.lineTo(x, y + 6);
    }
    g.strokePath();
  }
  /**
   * 批量绘制三点折线（#112）。
   * 同色同 alpha 的折线合并到一次 lineStyle + beginPath + strokePath，
   * 避免每条线都走一遍 Path 生命周期而反复打断 Image 批次。
   * pts 为扁平数组 [x1,y1,mx,my,x2,y2, ...]，避免为每条线新建对象。
   */
  polyline3(pts: readonly number[], color: string, alpha: number) {
    if (pts.length < 6) return;
    this.active = null;
    const g = this.batch();
    g.lineStyle(1, this.color(color), alpha);
    g.beginPath();
    for (let i = 0; i + 5 < pts.length; i += 6) {
      g.moveTo(pts[i], pts[i + 1]);
      g.lineTo(pts[i + 2], pts[i + 3]);
      g.lineTo(pts[i + 4], pts[i + 5]);
    }
    g.strokePath();
  }
  sprite(key: string, x: number, y: number, w?: number, h?: number) {
    this.active = null;
    const img =
      this.images[this.ii] ?? this.scene.add.image(0, 0, key).setOrigin(0);
    this.images[this.ii++] = img;
    img
      .setTexture(key)
      .setPosition(x, y)
      .setVisible(true)
      .setAlpha(this.globalAlpha)
      // 对象池跨帧复用：必须把 spriteRot 留下的旋转与「居中原点」复位。
      // 否则飞刃用过的槽位被普通贴图复用时，会带着上一帧的旋转角绘制（画面整体转动），
      // 并按中心定位导致坐标偏移半个贴图（主角偏离视觉中心）。见 Issue #85。
      .setOrigin(0)
      .setRotation(0)
      .setDepth(this.depth++)
      .setScrollFactor(this.hud ? 0 : 1);
    if (w !== undefined && h !== undefined) img.setDisplaySize(w, h);
    else img.setScale(1);
  }
  /** 居中原点 + 旋转的精灵（Issue #3：环绕飞刃刀形绘制） */
  spriteRot(
    key: string,
    cx: number,
    cy: number,
    angle: number,
    scale = 1,
  ) {
    this.active = null;
    const img =
      this.images[this.ii] ?? this.scene.add.image(0, 0, key);
    this.images[this.ii++] = img;
    img
      .setTexture(key)
      .setVisible(true)
      .setAlpha(this.globalAlpha)
      .setOrigin(0.5)
      .setPosition(cx, cy)
      .setRotation(angle)
      .setScale(scale)
      .setDepth(this.depth++)
      .setScrollFactor(this.hud ? 0 : 1);
  }
  private textState(): TextDrawState {
    return {
      fontSize: Number.parseInt(this.font, 10),
      fillStyle: this.fillStyle,
      alpha: this.globalAlpha,
      depth: this.depth++,
      scrollFactor: this.hud ? 0 : 1,
      textAlign: this.textAlign,
    };
  }
  fillText(value: string, x: number, y: number) {
    this.active = null;
    this.hudLabels.draw(this.hudIndex++, value, x, y, this.textState());
  }
  /** 浮动文字专用：slot 在文字生命周期内保持稳定，避免每帧重建纹理。 */
  fillTextSlot(slot: number, value: string, x: number, y: number) {
    this.active = null;
    this.floatLabels.draw(slot, value, x, y, this.textState());
  }
  /** 素材类特效按帧绘制前先确认纹理已加载，避免首帧丢图。 */
  hasTexture(key: string) {
    return this.scene.textures.exists(key);
  }
  get counts() {
    return {
      graphics: this.graphics.length,
      images: this.images.length,
      text: this.hudLabels.count + this.floatLabels.count,
    };
  }
}
