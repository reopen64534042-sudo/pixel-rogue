import Phaser from "phaser";
/** Retained-mode Phaser objects, batched and reused. No per-frame Canvas texture upload. */
export class PixelPainter {
  fillStyle = "#ffffff";
  strokeStyle = "#ffffff";
  globalAlpha = 1;
  font = "8px monospace";
  textAlign: CanvasTextAlign = "left";
  private graphics: Phaser.GameObjects.Graphics[] = [];
  private images: Phaser.GameObjects.Image[] = [];
  private labels: Phaser.GameObjects.Text[] = [];
  /** 每个 label 槽位上次写入的内容/字号/颜色，用于跳过无效重建（#106 性能） */
  private labelVal: string[] = [];
  private labelSize: number[] = [];
  private labelColor: string[] = [];
  private gi = 0;
  private ii = 0;
  private ti = 0;
  private depth = 0;
  private hud = false;
  private active: Phaser.GameObjects.Graphics | null = null;
  constructor(private scene: Phaser.Scene) {}
  begin() {
    for (const g of this.graphics) g.setVisible(false).clear();
    for (const i of this.images) i.setVisible(false);
    for (const t of this.labels) t.setVisible(false);
    this.gi = 0;
    this.ii = 0;
    this.ti = 0;
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
  fillText(value: string, x: number, y: number) {
    this.active = null;
    const i = this.ti;
    let label = this.labels[i];
    if (!label) {
      label = this.scene.add.text(0, 0, "", {
        fontFamily: '"Press Start 2P", monospace',
        fontSize: 8,
        resolution: 1,
      });
      this.labels[i] = label;
    }
    this.ti++;
    const size = Number.parseInt(this.font, 10);
    // 只在真正变化时写属性：每次 setText/setFontSize/setColor 都会让 Phaser
    // 重建文字 canvas 并重新上传纹理（texImage2D），HUD 值不变时纯属浪费。
    if (this.labelVal[i] !== value) {
      label.setText(value);
      this.labelVal[i] = value;
    }
    if (this.labelSize[i] !== size) {
      label.setFontSize(size);
      this.labelSize[i] = size;
    }
    if (this.labelColor[i] !== this.fillStyle) {
      label.setColor(this.fillStyle);
      this.labelColor[i] = this.fillStyle;
    }
    label.setOrigin(
      this.textAlign === "center" ? 0.5 : this.textAlign === "right" ? 1 : 0,
      0.8,
    );
    label
      .setPosition(x, y)
      .setVisible(true)
      .setAlpha(this.globalAlpha)
      .setDepth(this.depth++)
      .setScrollFactor(this.hud ? 0 : 1);
  }
  get counts() {
    return {
      graphics: this.graphics.length,
      images: this.images.length,
      text: this.labels.length,
    };
  }
}
