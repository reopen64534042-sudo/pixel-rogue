import Phaser from "phaser";
import { GameCore } from "../core/GameCore";
import { FixedClock } from "../core/FixedClock";
import { GameUI } from "../../ui/GameUI";
import { PixelPainter } from "../rendering/PixelPainter";
import { draw } from "../rendering/draw";
import { SPR } from "../rendering/sprites";
import { registerSprite } from "../rendering/assetRegistry";
import { W, H, WORLD } from "../data/constants";
import { UPGRADES } from "../data/talents";
import type { Talent } from "../core/types";

declare global {
  interface Window {
    __PIXEL_ROGUE__?: {
      core: GameCore;
      scene: GameScene;
      talents: readonly Talent[];
      counts: () => { graphics: number; images: number; text: number };
    };
  }
}

/** 外部贴图清单：由 scripts/pixelize.mjs 在入库时维护，缺失即表示全部使用程序化贴图。 */
const SPRITE_MANIFEST = "assets/sprites/manifest.json";

function loadImageElement(url: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`贴图解码失败: ${url}`));
    image.src = url;
  });
}

export class GameScene extends Phaser.Scene {
  readonly core = new GameCore();
  private painter!: PixelPainter;
  private ui!: GameUI;
  private clock = new FixedClock();
  private stars = Array.from({ length: 60 }, () => ({
    x: Math.random() * W,
    y: Math.random() * H,
    v: Math.random() * 6 + 2,
    s: Math.random() * 2 + 0.5,
  }));
  constructor() {
    super("Game");
  }
  create() {
    for (const [key, canvas] of Object.entries(SPR))
      this.textures.addCanvas(key, canvas);
    this.painter = new PixelPainter(this);    this.ui = new GameUI(this.core);
    this.cameras.main.setBounds(0, 0, WORLD.w, WORLD.h).setRoundPixels(true);
    const down = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      if (
        [" ", "arrowup", "arrowdown", "arrowleft", "arrowright"].includes(key)
      )
        event.preventDefault();
      this.core.keys[key] = true;
      if (event.repeat) return;
      if (key === "p") this.core.togglePause();
      if (key === "c" || (key === "escape" && this.core.state === "stats"))
        this.core.toggleStats();
      if (key === "m") {
        this.core.audio.muted = !this.core.audio.muted;
        this.core.addText(
          this.core.player.x,
          this.core.player.y - 14,
          this.core.audio.muted ? "静音" : "声音开",
          "#9aa3c7",
        );
      }
      if (
        this.core.state === "play" &&
        this.core.bpMode === "level" &&
        ["1", "2", "3"].includes(key)
      )
        this.ui.choose(Number(key) - 1);
      if (this.core.state === "over" && key === "r") this.core.startGame();
    };
    const up = (event: KeyboardEvent) => {
      this.core.keys[event.key.toLowerCase()] = false;
    };
    const clear = () => {
      this.core.keys = {};
      this.clock.reset();
    };
    const hidden = () => {
      clear();
      if (document.hidden && this.core.state === "play")
        this.core.togglePause();
    };
    this.input.keyboard?.on("keydown", down).on("keyup", up);
    window.addEventListener("blur", clear);
    document.addEventListener("visibilitychange", hidden);
    this.events.once("shutdown", () => {
      this.input.keyboard?.off("keydown", down).off("keyup", up);
      window.removeEventListener("blur", clear);
      document.removeEventListener("visibilitychange", hidden);
      this.ui.dispose();
      this.core.audio.dispose();
      if (import.meta.env.DEV) delete window.__PIXEL_ROGUE__;
    });
    // Explicit test mode only; production bundles contain no control bridge.
    if (import.meta.env.DEV && import.meta.env.MODE === "e2e")
      window.__PIXEL_ROGUE__ = {
        core: this.core,
        scene: this,
        talents: UPGRADES,
        counts: () => this.painter.counts,
      };
    void this.loadSpriteOverrides();
  }

  /**
   * 加载外部像素贴图，覆盖程序化 Canvas 贴图。
   *
   * 设计取舍：
   * - 用 fetch + Image 而不是 Phaser Loader：清单本身决定要加载哪些文件，走 Loader 需要两阶段加载；
   * - 异步且失败不影响启动：清单缺失（当前常态）或单张失败时保持程序化贴图；
   * - 换纹理只影响绘制，不影响任何规则状态。
   */
  private async loadSpriteOverrides() {
    let files: Record<string, string>;
    try {
      const response = await fetch(SPRITE_MANIFEST, { cache: "no-cache" });
      if (!response.ok) return;
      const data = (await response.json()) as { sprites?: Record<string, string> };
      files = data.sprites ?? {};
    } catch {
      // 清单不存在是正常状态（尚未产出任何位图贴图），静默回退到程序化贴图。
      return;
    }
    await Promise.all(
      Object.entries(files).map(async ([key, file]) => {
        try {
          const image = await loadImageElement(`assets/sprites/${file}`);
          const tex = registerSprite(key, image);
          if (this.textures.exists(tex)) this.textures.remove(tex);
          this.textures.addImage(tex, image);
        } catch (error) {
          if (import.meta.env.DEV)
            console.warn(`[assets] 贴图覆盖失败，保留程序化版本: ${key}`, error);
        }
      }),
    );
  }
  update(_now: number, delta: number) {
    if (!this.painter) return;
    if (this.core.state === "play")
      this.clock.advance(delta / 1000, (dt) => this.core.step(dt));
    else this.clock.reset();
    this.painter.begin();
    if (this.core.state === "start") {
      this.cameras.main.setScroll(0, 0);
      this.painter.fillStyle = "#0b0c14";
      this.painter.fillRect(0, 0, W, H);
      for (const s of this.stars) {
        s.y += s.v * Math.min(delta / 1000, 0.033);
        if (s.y > H) {
          s.y = -2;
          s.x = Math.random() * W;
        }
        this.painter.fillStyle = s.s > 2 ? "#57e6ff" : "#3d4a7a";
        this.painter.fillRect(Math.round(s.x), Math.round(s.y), 1, 1);
      }
    } else {
      const shake = this.core.shake;
      this.cameras.main.setScroll(
        this.core.cam.x + (shake ? (Math.random() - 0.5) * shake : 0),
        this.core.cam.y + (shake ? (Math.random() - 0.5) * shake : 0),
      );
      draw.call(this.core, this.painter);
    }
  }
}
