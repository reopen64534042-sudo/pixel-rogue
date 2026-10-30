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
import { IAI_SPIN_SLASH, registerIaiSpinSlash } from "../rendering/vfx/iaiSpinSlash";
import {
  GREATSWORD_SLASH_SHEETS,
  registerGreatswordSlash,
} from "../rendering/vfx/greatswordSlash";
import { KATANA_DASH, registerKatanaDash } from "../rendering/vfx/katanaDash";
import { W, H, WORLD, SHAKE_MAX, clamp } from "../data/constants";
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

/** 太刀刀光素材（PR #172）：10 帧 32×32 横向精灵表，透明度已烘焙。 */
const TAIDAO_SLASH_SHEETS = [
  ["taidao-slash-", "assets/vfx/taidao-slash-32x32-10f.png"],
  ["taidao-slash-ccw-", "assets/vfx/taidao-slash-ccw-32x32-10f.png"],
] as const;
const TAIDAO_SLASH_FRAMES = 10;
const TAIDAO_SLASH_SIZE = 32;

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
  private specialTest:
    | "special-max"
    | "dash-special"
    | "special-swarm"
    | "enemy-demo"
    | "partial-true"
    | null = null;
  private testReady = false;
  private testAnchors: { x: number; y: number }[] = [];
  /** special-swarm 沙盒的目标怪数量 */
  private readonly swarmTarget = 80;
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
      // 教程快捷键优先于普通输入；F 下一步 / 开始正式战斗，X 跳过。
      if (this.ui.handleTutorialKey(key)) {
        event.preventDefault();
        return;
      }
      // e2e 真伤对比：T 切换「完全真实伤害」，无需刷新页面。
      if (this.specialTest === "partial-true" && key === "t") {
        const fullTrue = this.core.specialUpgrades.includes("trueDamage");
        this.core.specialUpgrades = fullTrue
          ? ["partialTrue"]
          : ["partialTrue", "trueDamage"];
        this.core.specialLoaded = true;
        this.core.addText(
          this.core.player.x,
          this.core.player.y - 20,
          fullTrue ? "完全真实伤害：关" : "完全真实伤害：开",
          "#57e6ff",
          true,
          true,
        );
        event.preventDefault();
        return;
      }
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
      if (this.core.state === "over" && key === "r")
        this.core.startGame(this.core.prof, this.core.warriorStyle);
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
    void this.loadTaidaoSlash();
    void this.loadIaiSpinSlash();
    void this.loadGreatswordSlashes();
    void this.loadKatanaDash();
    const testName = new URLSearchParams(window.location.search).get("test");
    this.specialTest =
      import.meta.env.DEV && import.meta.env.MODE === "e2e"
        ? testName === "dash-special"
          ? "dash-special"
          : testName === "special-swarm"
            ? "special-swarm"
            : testName === "special-max"
              ? "special-max"
              : testName === "enemy-demo"
                ? "enemy-demo"
                : testName === "partial-true"
                  ? "partial-true"
                  : null
        : null;
    if (this.specialTest) this.core.startGame();
  }

  private tickSpecialTest() {
    const core = this.core;
    if (!this.testReady) {
      if (
        core.state !== "play" ||
        (core.phase !== "play" &&
          this.specialTest !== "enemy-demo" &&
          this.specialTest !== "partial-true")
      )
        return;
      core.specialLevel = SPECIAL_LEVELS.length;
      core.specialXp = 0;
      core.specialUpgrades =
        this.specialTest === "dash-special"
          ? []
          : this.specialTest === "partial-true"
            ? SPECIAL_UPGRADES.filter((u) => u.id === "partialTrue").map(
                (u) => u.id,
              )
            : SPECIAL_UPGRADES.map((upgrade) => upgrade.id);
      if (this.specialTest === "dash-special") {
        const dash = UPGRADES.find((u) => u.n === "疾行");
        if (dash) core.learnTalent(dash);
      }
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
      core.trailZones = [];
      core.webZones = [];
      core.missiles = [];
      core.lasers = [];
      core.texts = [];
      if (this.specialTest === "special-swarm") {
        for (let i = 0; i < this.swarmTarget; i++) this.spawnSwarmEnemy(i);
        core.addText(
          core.player.x,
          core.player.y - 30,
          `测试：满级强化弹 · ${this.swarmTarget} 只高血量沙包 · 伤害 0`,
          "#ffd24a",
          true,
        );
      } else if (this.specialTest === "enemy-demo") {
        this.setupEnemyDemo();
      } else if (this.specialTest === "partial-true") {
        core.player.maxhp = 9999;
        core.player.hp = 9999;
        core.player.crit = 0.5;
        core.specialLoaded = true;
        core.pendingLevels = 0;
        core.startTalentPending = false;
        core.bpMode = null;
        core.slots = [];
        for (const id of [
          "bp-level",
          "bp-attr",
          "bp-rest",
          "bottom-bar",
          "start-screen",
        ])
          document.getElementById(id)?.classList.add("hidden");
        this.testAnchors = [{ x: core.player.x + 110, y: core.player.y }];
        for (const anchor of this.testAnchors) this.spawnTestElite(anchor);
        core.addText(
          core.player.x,
          core.player.y - 30,
          "测试：附带真实伤害 · 50% 暴击 · 按 T 切换完全真实伤害",
          "#ffd24a",
          true,
        );
      } else {
        this.testAnchors = [{ x: core.player.x + 110, y: core.player.y }];
        for (const anchor of this.testAnchors) this.spawnTestElite(anchor);
        core.addText(
          core.player.x,
          core.player.y - 30,
          this.specialTest === "dash-special"
            ? "测试：疾行 · 冲刺后下一发强化弹 · 10000 HP 精英"
            : `测试：强化弹 Lv.${SPECIAL_LEVELS.length} · 全升级 · 10000 HP 精英`,
          "#ffd24a",
          true,
        );
      }
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
    if (this.specialTest === "special-swarm") {
      const living = core.enemies.filter((e) => !e.dead).length;
      for (let i = living; i < this.swarmTarget; i++) this.spawnSwarmEnemy(i);
      return;
    }
    if (this.specialTest === "enemy-demo") {
      const living = core.enemies.filter((e) => !e.dead).length;
      for (let i = living; i < 6; i++) this.spawnDemoEnemy();
      if (core.player.maxhp < 9999) {
        core.player.maxhp = 9999;
        core.player.hp = 9999;
      }
      return;
    }
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

  private setupEnemyDemo() {
    const core = this.core;
    core.player.x = 700;
    core.player.y = 520;
    core.player.maxhp = 9999;
    core.player.hp = 9999;
    core.specialLoaded = true;
    core.pendingLevels = 0;
    core.startTalentPending = false;
    core.bpMode = null;
    core.slots = [];
    core.webZones = [];
    for (let i = 0; i < 8; i++) this.spawnDemoEnemy(i);
    // 一只带随机词缀的精英，方便直接看第 8 波后的新机制。
    core.waveN = 8;
    core.spawnEnemy("brute", true);
    const elite = core.enemies[core.enemies.length - 1];
    core.waveN = 1;
    elite.x = core.player.x - 120;
    elite.y = core.player.y - 80;
    elite.maxhp = 12000;
    elite.hp = elite.maxhp;
    for (const id of [
      "bp-level",
      "bp-attr",
      "bp-rest",
      "bottom-bar",
      "start-screen",
    ])
      document.getElementById(id)?.classList.add("hidden");
    core.addText(
      core.player.x,
      core.player.y - 38,
      "演示：怪物会移动 · 玩家 9999 HP · 满级强化弹",
      "#ffd24a",
      true,
    );
  }

  /** 持续补充的混合怪；血量按类型分档，保证演示里既有沙包也有会被打死的裂胶/自爆虫。 */
  private spawnDemoEnemy(index = -1) {
    const core = this.core;
    const types = [
      "slime",
      "spinner",
      "burrower",
      "charger",
      "splitter",
      "drummer",
      "shooter",
      "brute",
      "bomber",
      "bat",
    ];
    const type =
      index >= 0
        ? types[index % types.length]
        : types[Math.floor(Math.random() * types.length)];
    core.spawnEnemy(type);
    const enemy = core.enemies[core.enemies.length - 1];
    const angle =
      index >= 0
        ? (index / 8) * Math.PI * 2
        : Math.random() * Math.PI * 2;
    const radius = index >= 0 ? 100 : 95 + Math.random() * 35;
    enemy.x = clamp(core.player.x + Math.cos(angle) * radius, 32, WORLD.w - 32);
    enemy.y = clamp(core.player.y + Math.sin(angle) * radius, 32, WORLD.h - 32);
    const hp: Record<string, number> = {
      slime: 800,
      bat: 600,
      brute: 6000,
      shooter: 1500,
      bomber: 400,
      splitter: 600,
      charger: 2500,
      drummer: 1200,
      spinner: 900,
      burrower: 1800,
    };
    enemy.maxhp = hp[type] ?? 1500;
    enemy.hp = enemy.maxhp;
    // 演示只展示玩家输出，不让敌人反伤数字淹没画面；玩家仍保持 9999 HP 的真实数值。
    enemy.dmg = 0;
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

  private spawnSwarmEnemy(index: number) {
    const core = this.core;
    core.spawnEnemy("slime");
    const e = core.enemies[core.enemies.length - 1];
    const angle = index * 2.399963;
    const ring = 50 + (index % 8) * 14;
    e.x = Math.max(
      20,
      Math.min(WORLD.w - 20, core.player.x + Math.cos(angle) * ring),
    );
    e.y = Math.max(
      20,
      Math.min(WORLD.h - 20, core.player.y + Math.sin(angle) * ring),
    );
    e.maxhp = 5000;
    e.hp = 5000;
    e.speed = 0;
    e.dmg = 0;
    e.xp = 0;
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
  /** 太刀精灵表按帧切为独立纹理，draw 按 slash 进度取帧，无需逐次创建动画。 */
  private async loadTaidaoSlash() {
    for (const [prefix, url] of TAIDAO_SLASH_SHEETS) {
      try {
        const image = await loadImageElement(url);
        for (let i = 0; i < TAIDAO_SLASH_FRAMES; i++) {
          const key = `${prefix}${i}`;
          if (this.textures.exists(key)) continue;
          const canvas = document.createElement("canvas");
          canvas.width = TAIDAO_SLASH_SIZE;
          canvas.height = TAIDAO_SLASH_SIZE;
          const g = canvas.getContext("2d");
          if (!g) continue;
          g.imageSmoothingEnabled = false;
          g.drawImage(
            image,
            i * TAIDAO_SLASH_SIZE,
            0,
            TAIDAO_SLASH_SIZE,
            TAIDAO_SLASH_SIZE,
            0,
            0,
            TAIDAO_SLASH_SIZE,
            TAIDAO_SLASH_SIZE,
          );
          this.textures.addCanvas(key, canvas);
        }
      } catch (error) {
        if (import.meta.env.DEV)
          console.warn(`[assets] 太刀刀光加载失败: ${url}`, error);
      }
    }
  }

  /** Load the ready-to-use spin VFX without binding it to a combat trigger. */
  private async loadIaiSpinSlash() {
    try {
      const image = await loadImageElement(IAI_SPIN_SLASH.image);
      if (!this.sys.isActive()) return;
      registerIaiSpinSlash(this.textures, image);
    } catch (error) {
      if (import.meta.env.DEV)
        console.warn("[assets] Iai spin slash loading failed", error);
    }
  }

  /** Preload sweeps, heavy slashes and landing impact; playback uses core slash time. */
  private async loadGreatswordSlashes() {
    await Promise.all(GREATSWORD_SLASH_SHEETS.map(async (sheet) => {
      try {
        const image = await loadImageElement(sheet.image);
        if (!this.sys.isActive()) return;
        registerGreatswordSlash(this.textures, image, sheet);
      } catch (error) {
        if (import.meta.env.DEV)
          console.warn(`[assets] Greatsword slash loading failed: ${sheet.image}`, error);
      }
    }));
  }

  /** Preload once; both dash phases are driven by the existing simulation state. */
  private async loadKatanaDash() {
    try {
      const image = await loadImageElement(KATANA_DASH.image);
      if (!this.sys.isActive()) return;
      registerKatanaDash(this.textures, image);
    } catch (error) {
      if (import.meta.env.DEV)
        console.warn("[assets] Katana dash loading failed; using procedural blade", error);
    }
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
      const shake = Math.min(this.core.shake, SHAKE_MAX);
      // 震屏偏移必须取整：小数滚动会让画布做亚像素采样，整屏的字和精灵一起发糊。
      // 高攻速时多次命中叠加震屏，不取整会糊成「屏幕全花、看不清怪」（用户实机反馈）。
      this.cameras.main.setScroll(
        Math.round(this.core.cam.x + (shake ? (Math.random() - 0.5) * shake : 0)),
        Math.round(this.core.cam.y + (shake ? (Math.random() - 0.5) * shake : 0)),
      );
      draw.call(this.core, this.painter);
    }
    // v77：低血量屏幕边缘提示（DOM 覆盖层；只改 opacity，不碰画布）
    this.ui.syncLowHp();
    // v83：新手教程 HUD（练习场内分步指引）
    this.ui.syncTutorial();
  }
}
