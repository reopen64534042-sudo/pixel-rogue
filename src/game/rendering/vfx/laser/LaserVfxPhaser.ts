import Phaser from "phaser";
import { LASER_ATLAS_KEY, LASER_CLIPS, laserSpriteCrop } from "./laserAssets";
import { LaserVfxPlayer, type LaserVfxCommand } from "./LaserVfxPlayer";
import { LaserV137Bridge, type LaserV137CoreSnapshot } from "./LaserV137Bridge";

/** Optional preload example. No gameplay scene imports this module yet. */
export function preloadLaserVfx(scene: Phaser.Scene, baseUrl = import.meta.env.BASE_URL) {
  const base = `${baseUrl.replace(/\/$/, "")}/assets/vfx/laser/`;
  scene.load.atlas(LASER_ATLAS_KEY, `${base}laser.atlas.png`, `${base}laser.atlas.json`);
}

/** Reuses Images/Graphics and honors caller-provided simulation snapshots, not Phaser animations. */
export class PhaserLaserVfxView {
  private images: Phaser.GameObjects.Image[] = [];
  private graphics: Phaser.GameObjects.Graphics[] = [];
  private commands: readonly LaserVfxCommand[] = [];
  private bridge = new LaserV137Bridge();
  private player = new LaserVfxPlayer();

  constructor(private scene: Phaser.Scene, private baseDepth = 50) {}

  /** Invoke once after each fixed simulation step, including steps with no rendered frame. */
  capture(core: LaserV137CoreSnapshot) {
    const packet = this.bridge.capture(core);
    if (packet.reset) this.player.reset();
    this.commands = this.player.update(packet.frame, packet.releases);
  }

  /** False means preload is incomplete; caller should keep its existing renderer until ready. */
  draw(commands: readonly LaserVfxCommand[] = this.commands): boolean {
    for (const image of this.images) image.setVisible(false);
    for (const graphics of this.graphics) graphics.setVisible(false).clear();
    if (!this.scene.textures.exists(LASER_ATLAS_KEY)) return false;
    this.scene.textures.get(LASER_ATLAS_KEY).setFilter(Phaser.Textures.FilterMode.NEAREST);
    let imageIndex = 0, graphicIndex = 0, depth = this.baseDepth;
    let batch: Phaser.GameObjects.Graphics | null = null;
    for (const command of commands) {
      if (command.kind === "sprite") {
        batch = null;
        const clip = LASER_CLIPS[command.clip];
        const crop = laserSpriteCrop(command.clip, command.cropX, command.cropWidth);
        if (crop.width <= 0) continue;
        // setCrop retains its local X offset; translate the Image back along the beam.
        const offset = crop.x * command.scaleX;
        const image = this.images[imageIndex] ?? this.scene.add.image(0, 0, LASER_ATLAS_KEY);
        this.images[imageIndex++] = image;
        image.setTexture(LASER_ATLAS_KEY, clip.frames[command.frame]).setVisible(true)
          .setOrigin(clip.anchor[0] / clip.width, clip.anchor[1] / clip.height)
          .setPosition(command.x - Math.cos(command.angle) * offset,
            command.y - Math.sin(command.angle) * offset).setRotation(command.angle)
          .setScale(command.scaleX, command.scaleY).setAlpha(command.alpha).setDepth(depth++);
        image.setCrop();
        if (command.cropX !== undefined || command.cropWidth !== undefined) image.setCrop(crop.x, 0, crop.width, clip.height);
        continue;
      }
      if (!batch) {
        batch = this.graphics[graphicIndex] ?? this.scene.add.graphics();
        this.graphics[graphicIndex++] = batch;
        batch.setVisible(true).setDepth(depth++);
      }
      const color = Number.parseInt(command.color.slice(1), 16);
      if (command.kind === "beam") {
        batch.lineStyle(command.width, color, command.alpha).beginPath()
          .moveTo(command.x, command.y).lineTo(command.x2, command.y2).strokePath();
      } else if (command.kind === "arc") {
        batch.lineStyle(1, color, command.alpha).beginPath()
          .arc(command.x, command.y, command.radius, command.start, command.end).strokePath();
      } else batch.fillStyle(color, command.alpha).fillRect(command.x, command.y, 1, 1);
    }
    return true;
  }

  reset() { this.bridge.reset(); this.player.reset(); this.commands = []; this.draw([]); }
  destroy() {
    for (const image of this.images) image.destroy();
    for (const graphics of this.graphics) graphics.destroy();
    this.images = []; this.graphics = []; this.bridge.reset(); this.player.reset(); this.commands = [];
  }
}
