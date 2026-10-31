import Phaser from "phaser";
import { MISSILE_ATLAS_KEY, MISSILE_CLIPS } from "./missileAssets";
import { missileVfxCommands, type MissileVfxCommand, type MissileVfxSnapshot } from "./MissileVfxPlayer";

/** GameScene preload; the optional standalone view below shares the same commands. */
export function preloadMissileVfx(scene: Phaser.Scene, baseUrl = import.meta.env.BASE_URL) {
  const base = `${baseUrl.replace(/\/$/, "")}/assets/vfx/missile/`;
  scene.load.atlas(MISSILE_ATLAS_KEY, `${base}missile.atlas.png`, `${base}missile.atlas.json`);
}

/** Reuses Images and Graphics; callers provide only real simulation snapshots. */
export class PhaserMissileVfxView {
  private images: Phaser.GameObjects.Image[] = [];
  private graphics: Phaser.GameObjects.Graphics[] = [];
  private commands: readonly MissileVfxCommand[] = [];
  constructor(private scene: Phaser.Scene, private baseDepth = 45) {}
  capture(snapshot: MissileVfxSnapshot) { this.commands = missileVfxCommands(snapshot); }
  draw(): boolean {
    for (const image of this.images) image.setVisible(false);
    for (const graphic of this.graphics) graphic.setVisible(false).clear();
    if (!this.scene.textures.exists(MISSILE_ATLAS_KEY)) return false;
    this.scene.textures.get(MISSILE_ATLAS_KEY).setFilter(Phaser.Textures.FilterMode.NEAREST);
    let imageIndex = 0, graphicIndex = 0, depth = this.baseDepth;
    let batch: Phaser.GameObjects.Graphics | null = null;
    for (const command of this.commands) {
      if (command.kind === "sprite") {
        batch = null;
        const c = MISSILE_CLIPS[command.clip];
        const image = this.images[imageIndex] ?? this.scene.add.image(0, 0, MISSILE_ATLAS_KEY);
        this.images[imageIndex++] = image;
        image.setTexture(MISSILE_ATLAS_KEY, c.frames[command.frame]).setVisible(true)
          .setOrigin(c.anchor[0] / c.width, c.anchor[1] / c.height).setPosition(command.x, command.y)
          .setRotation(command.angle).setScale(command.scaleX, command.scaleY).setAlpha(command.alpha).setDepth(depth++);
      } else {
        if (!batch) {
          batch = this.graphics[graphicIndex] ?? this.scene.add.graphics();
          this.graphics[graphicIndex++] = batch; batch.setVisible(true).setDepth(depth++);
        }
        batch.lineStyle(command.width, Number.parseInt(command.color.slice(1), 16), command.alpha).beginPath()
          .moveTo(command.x, command.y).lineTo(command.x2, command.y2).strokePath();
      }
    }
    return true;
  }
  reset() { this.commands = []; this.draw(); }
  destroy() {
    for (const image of this.images) image.destroy();
    for (const graphic of this.graphics) graphic.destroy();
    this.images = []; this.graphics = []; this.commands = [];
  }
}
