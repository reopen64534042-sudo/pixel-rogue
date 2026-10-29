import Phaser from "phaser";
import { GameCore } from "../core/GameCore";
import { FixedClock } from "../core/FixedClock";
import { GameUI } from "../../ui/GameUI";
import { DevPanel } from "../../ui/DevPanel";
import { TouchControls } from "../../ui/TouchControls";
import { OrientationGate } from "../../ui/OrientationGate";
import { PixelPainter } from "../rendering/PixelPainter";
import { draw } from "../rendering/draw";
import { SPR } from "../rendering/sprites";
import { registerSprite } from "../rendering/assetRegistry";
import { W, H, WORLD } from "../data/constants";
import { UPGRADES } from "../data/talents";
import { SPECIAL_LEVELS, SPECIAL_UPGRADES } from "../data/specialShot";
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
  /** Issue #95：触控操作层，非触屏设备下内部不启用（所有方法为空操作） */
  private touch?: TouchControls;
  /** Issue #96：竖屏引导闸门，与触控层共用同一套设备判定 */
  private orient?: OrientationGate;
  /** 开发者作弊面板：仅 DEV 构建存在（生产包无入口、无控制桥） */
  private dev?: DevPanel;
  private clock = new FixedClock();
  private specialTest = false;
  private testReady = false;
  private testAnchors: { x: number; y: number }[] = [];
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
    if (import.meta.env.DEV) this.dev = new DevPanel(this.core);
    this.touch = new TouchControls(this.core, this.game.canvas);
    // 与触控层共用判定结果：桌面拖窄窗口不该弹横屏提示
    this.orient = new OrientationGate(this.core, this.touch.active);
    this.cameras.main.setBounds(0, 0, WORLD.w, WORLD.h).setRoundPixels(true);
    const down = (event: KeyboardEvent) => {
      // v79：设置面板/改键捕获优先；返回 true 时游戏不处理本事件。
      if (this.ui.handleSettingsKey(event)) return;
      const key = event.key.toLowerCase();
      if (
        [" ", "arrowup", "arrowdown", "arrowleft", "arrowright"].includes(key)
      )
        event.preventDefault();
      this.core.keys[key] = true;
      if (event.repeat) return;
      // 覆盖层优先：图鉴打开时暂停键 / Esc 只关闭图鉴，不恢复游戏（Issue #78 / #81）
      if (key === this.core.keybinds.pause || key === "escape") {
        if (this.ui.dismissOverlay()) return;
        if (key === this.core.keybinds.pause) this.core.togglePause();
        else if (this.core.state === "stats") this.core.toggleStats();
        else if (this.core.state === "pause") this.core.togglePause();
        return;
      }
      // 图鉴打开时不响应属性面板，避免两层 overlay 互相遮挡
      if (key === this.core.keybinds.stats && !this.ui.hasOverlay())
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
      // S1：属性面板是四选一，所以多一个键位
      if (
        this.core.state === "play" &&
        this.core.bpMode === "attr" &&
        ["1", "2", "3", "4"].includes(key)
      )
        this.core.chooseAttr(Number(key) - 1);
      if (this.core.state === "over" && key === "r") this.core.startGame();
    };
    const up = (event: KeyboardEvent) => {
      this.core.keys[event.key.toLowerCase()] = false;
    };
    const clear = () => {
      this.core.keys = {};
      // Issue #95：触控方向同样必须清零，否则失焦回来后角色会继续走
      this.touch?.reset();
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
      this.touch?.dispose();
      this.orient?.dispose();
      this.dev?.dispose();
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
    this.specialTest =
      import.meta.env.DEV &&
      import.meta.env.MODE === "e2e" &&
      new URLSearchParams(window.location.search).get("test") ===
        "special-max";
    if (this.specialTest) this.core.startGame();
  }

  private tickSpecialTest() {
    const core = this.core;
    if (!this.testReady) {
      if (core.state !== "play" || core.phase !== "play") return;
      core.specialLevel = SPECIAL_LEVELS.length;
      core.specialXp = 0;
      core.specialUpgrades = SPECIAL_UPGRADES.map((upgrade) => upgrade.id);
      core.quota = 0;
      core.spawnedThisWave = 0;
      core.wavePhase = "fight";
      core.enemies = [];
      core.bullets = [];
      core.ebullets = [];
      core.gems = [];
      core.potions = [];
      core.boxes = [];
      core.burnZones = [];
      core.missiles = [];
      core.lasers = [];
      this.testAnchors = [{ x: core.player.x + 110, y: core.player.y }];
      for (const anchor of this.testAnchors) this.spawnTestElite(anchor);
      core.addText(
        core.player.x,
        core.player.y - 30,
        "测试：强化箭 Lv.12 · 全升级 · 10000 HP 精英",
        "#ffd24a",
        true,
      );
      this.testReady = true;
      return;
    }
    core.quota = 0;
    core.spawnedThisWave = 0;
    core.wavePhase = "fight";
    if (core.bpMode) core.bpMode = null;
    core.gems = [];
    core.boxes = [];
    core.potions = [];
    const living = core.enemies.filter((e) => e.elite && !e.dead);
    this.testAnchors.forEach((anchor, index) => {
      const e = living[index];
      if (e) {
        e.x = anchor.x;
        e.y = anchor.y;
        e.kx = 0;
        e.ky = 0;
      } else {
        this.spawnTestElite(anchor);
      }
    });
  }

  private spawnTestElite(anchor: { x: number; y: number }) {
    const core = this.core;
    core.spawnEnemy("brute", true);
    const e = core.enemies[core.enemies.length - 1];
    e.maxhp = 10000;
    e.hp = 10000;
    e.speed = 0;
    e.dmg = 0;
    e.x = anchor.x;
    e.y = anchor.y;
    e.kx = 0;
    e.ky = 0;
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
    // Issue #95：输入在模拟推进前落盘，否则摇杆方向会晚一帧生效
    this.touch?.sync();
    if (this.core.state === "play")
      this.clock.advance(delta / 1000, (dt) => this.core.step(dt));
    else this.clock.reset();
    if (this.specialTest) this.tickSpecialTest();
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
    // v77：低血量屏幕边缘提示（DOM 覆盖层；只改 opacity，不碰画布）
    this.ui.syncLowHp();
    // v83：新手教程 HUD（练习场内分步指引）
    this.ui.syncTutorial();
  }
}
