import Phaser from "phaser";
import { GameCore } from "../core/GameCore";
import { FixedClock } from "../core/FixedClock";
import { GameUI } from "../../ui/GameUI";
import { PixelPainter } from "../rendering/PixelPainter";
import { draw } from "../rendering/draw";
import { SPR } from "../rendering/sprites";
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
    this.painter = new PixelPainter(this);
    this.ui = new GameUI(this.core);
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
