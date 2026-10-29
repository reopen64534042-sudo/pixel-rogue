import type { GameCore } from "../game/core/GameCore";
import { UPGRADES } from "../game/data/talents";
import type { Talent } from "../game/core/types";

/**
 * 开发者作弊面板（**仅 DEV 构建**）。
 *
 * 用途：测试时随时学习任意天赋、加属性次数、快速重开，不用等波次发放。
 * 边界：
 * - `GameScene` 只在 `import.meta.env.DEV` 下实例化，生产包既没有入口、
 *   也不会加载控制桥（与 AGENTS「生产不得暴露控制接口」一致）。
 * - 走 `core.learnTalent()`，因此属性投影 / 图鉴 / upCounts 都是正常路径；
 *   但它**不经过 `canOffer`**——职业、前置、互斥、变体组都会被绕过，这正是
 *   作弊面板的用途（组合出正常流程拿不到的状态）。
 * - 不做任何数值校验（属性次数上限也绕过），只用于开发环境。
 */
const GROUPS: { key: string; label: string }[] = [
  { key: "legacy", label: "旧表（retired/hidden）" },
  { key: "shooter", label: "射手" },
  { key: "mage", label: "法师" },
  { key: "warrior", label: "战士（无池）" },
  { key: "common", label: "通用" },
];

const el = (tag: string, style: string, text = ""): HTMLElement => {
  const e = document.createElement(tag);
  e.style.cssText = style;
  if (text) e.textContent = text;
  return e;
};

export class DevPanel {
  private root: HTMLDivElement | null = null;
  private body: HTMLDivElement | null = null;
  /** 面板打开时轮询「已学数量」的签名，正常游玩选卡也能实时反映 */
  private timer: ReturnType<typeof setInterval> | null = null;
  private sig = "";
  /** 「起始波次」输入框的保留值（面板重开时还原） */
  private lastWave = 1;
  private readonly onKey = (e: KeyboardEvent) => {
    if (e.key === "F2") {
      e.preventDefault();
      this.toggle();
    }
  };

  constructor(private core: GameCore) {
    window.addEventListener("keydown", this.onKey);
  }

  /** 场景销毁：摘掉快捷键并关闭面板 */
  dispose() {
    window.removeEventListener("keydown", this.onKey);
    this.close();
  }

  /** 关闭面板但**保留 F2 监听**（之前误用 dispose，导致只能开一次） */
  private close() {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.root?.remove();
    this.root = null;
    this.body = null;
    this.sig = "";
  }

  private toggle() {
    if (this.root) this.close();
    else this.build();
  }

  private build() {
    const root = el(
      "div",
      "position:fixed;right:8px;top:8px;width:270px;max-height:82vh;overflow:auto;" +
        "background:rgba(8,12,24,.94);border:1px solid #3a4a7a;border-radius:4px;" +
        "padding:8px;color:#cfe0ff;font:11px/1.5 ui-monospace,Consolas,monospace;" +
        "z-index:200;box-shadow:0 4px 16px rgba(0,0,0,.5)",
    ) as HTMLDivElement;
    const head = el("div", "display:flex;align-items:center;gap:6px;margin-bottom:6px");
    head.appendChild(
      el("div", "flex:1;color:#7d8ec4;letter-spacing:1px", "DEV · 作弊面板"),
    );
    const close = el(
      "button",
      "background:#1d2440;color:#cfe0ff;border:1px solid #3a4a7a;border-radius:3px;padding:2px 6px;cursor:pointer",
      "关闭",
    );
    close.addEventListener("click", () => this.close());
    head.appendChild(close);
    root.appendChild(head);

    const tools = el("div", "display:flex;gap:6px;margin-bottom:6px");
    const mk = (label: string, fn: () => void) => {
      const b = el(
        "button",
        "flex:1;background:#1d2440;color:#cfe0ff;border:1px solid #3a4a7a;border-radius:3px;padding:3px 4px;cursor:pointer",
        label,
      );
      b.addEventListener("click", () => {
        fn();
        this.render();
      });
      tools.appendChild(b);
    };
    mk("属性 +5", () => {
      this.core.attrPicks += 5;
    });
    mk("重开本局", () => {
      this.core.startGame(this.core.prof);
    });
    // 无敌：只影响 damagePlayer（DEV 门控），跨重开保留
    const god = el(
      "button",
      "flex:1;background:" +
        (this.core.devInvincible ? "#2a4a2a" : "#1d2440") +
        ";color:#cfe0ff;border:1px solid " +
        (this.core.devInvincible ? "#57e86b" : "#3a4a7a") +
        ";border-radius:3px;padding:3px 4px;cursor:pointer",
      "无敌：" + (this.core.devInvincible ? "开" : "关"),
    ) as HTMLButtonElement;
    god.addEventListener("click", () => {
      this.core.devInvincible = !this.core.devInvincible;
      god.textContent = "无敌：" + (this.core.devInvincible ? "开" : "关");
      god.style.background = this.core.devInvincible ? "#2a4a2a" : "#1d2440";
      god.style.borderColor = this.core.devInvincible ? "#57e86b" : "#3a4a7a";
    });
    tools.appendChild(god);
    root.appendChild(tools);

    // 起始波次：直接从第 N 波开打，避免每次都从 1 波刷上去。
    const waveRow = el(
      "div",
      "display:flex;gap:4px;margin-bottom:6px;align-items:center",
    ) as HTMLDivElement;
    waveRow.appendChild(el("span", "color:#7d8ec4", "起始波次"));
    const waveInput = document.createElement("input");
    waveInput.type = "number";
    waveInput.min = "1";
    waveInput.max = "999";
    waveInput.value = String(this.lastWave);
    waveInput.style.cssText =
      "width:56px;background:#0e1430;color:#cfe0ff;border:1px solid #3a4a7a;border-radius:3px;padding:2px 4px;font:11px ui-monospace,Consolas,monospace";
    // 输入数字不能被游戏当成选卡快捷键（GameScene 监听 window keydown）
    waveInput.addEventListener("keydown", (e) => e.stopPropagation());
    waveInput.addEventListener("keyup", (e) => e.stopPropagation());
    waveRow.appendChild(waveInput);
    const waveGo = el(
      "button",
      "flex:1;background:#1d2440;color:#cfe0ff;border:1px solid #3a4a7a;border-radius:3px;padding:3px 4px;cursor:pointer",
      "从该波开始",
    ) as HTMLButtonElement;
    waveGo.addEventListener("click", () => {
      this.lastWave = Math.max(1, Math.min(999, Number(waveInput.value) || 1));
      this.startAtWave(this.lastWave);
      this.render();
    });
    waveRow.appendChild(waveGo);
    root.appendChild(waveRow);

    const body = el("div", "") as HTMLDivElement;
    root.appendChild(body);

    document.body.appendChild(root);
    this.root = root;
    this.body = body;
    this.sig = "";
    this.render();
    // 正常游玩时选卡不会通知本面板：轮询「已学数量」签名，变了才重绘。
    this.timer = setInterval(() => this.render(), 400);
  }

  /**
   * 从第 n 波重新开局（仅开发工具）。
   *
   * 走 `startGame` + `startNextWave` 的正常链路，保证配额、敌人权重、
   * 精英配额、属性额度都按该波生成；只跳过开局天赋面板并把波次拨到 n。
   */
  private startAtWave(n: number) {
    const c = this.core;
    // 只有「开始 / 结算」界面没有可保留的局，先正常开局；
    // 游玩中跳波**保留当前构筑**（天赋/属性/等级），只清场并把波次拨到 n。
    if (c.state !== "play" && c.state !== "pause" && c.state !== "stats")
      c.startGame(c.prof);
    c.enemies = [];
    c.ebullets = [];
    c.bullets = [];
    c.gems = [];
    c.boxes = [];
    c.potions = [];
    c.meteors = [];
    c.burnZones = [];
    c.trailZones = [];
    c.mageMeteors = [];
    c.mageDomains = [];
    c.mageDecoys = [];
    c.parts = [];
    c.texts = [];
    c.slashes = [];
    c.bolts = [];
    // 中断可能正在进行的施法/陨星计时，避免跨波结算
    c.castPhase = "idle";
    c.castT = 0;
    c.castCd = 0;
    c.mageMeteorT = 0;
    c.pendingLevels = 0;
    c.startTalentPending = false;
    c.bpMode = null;
    c.state = "play";
    c.wavePhase = "rest";
    c.waveN = n - 1;
    c.startNextWave();
    for (const id of [
      "bp-level",
      "bp-attr",
      "bp-rest",
      "bottom-bar",
      "ov-pause",
      "ov-stats",
    ])
      document.getElementById(id)?.classList.add("hidden");
  }

  /** 正常游玩的前置判定：`requires`（链前置）与 `req`（自定义条件）。 */
  private prereq(u: Talent): { ok: boolean; hint: string } {
    if (u.requires && !this.core.player.picks.includes(u.requires))
      return { ok: false, hint: `需 ${u.requires}` };
    if (u.req && !u.req(this.core.player))
      return { ok: false, hint: u.reqHint ?? "前置未满足" };
    return { ok: true, hint: "" };
  }

  private render() {
    const body = this.body;
    if (!body) return;
    // 只有数量变化才重建 DOM（避免无意义的 74 行重排，也保住滚动位置）
    const sig = UPGRADES.map((u) => this.core.player.upCounts[u.n] || 0).join(
      ",",
    );
    if (sig === this.sig) return;
    this.sig = sig;
    body.innerHTML = "";
    for (const g of GROUPS) {
      const cards = UPGRADES.filter((u) => (u.prof ?? "legacy") === g.key);
      if (!cards.length) continue;
      body.appendChild(
        el(
          "div",
          "margin:6px 0 2px;color:#7d8ec4;border-bottom:1px solid #23305a",
          `${g.label} · ${cards.length}`,
        ),
      );
      for (const u of cards) {
        const lv = this.core.player.upCounts[u.n] || 0;
        const maxed = lv >= u.max;
        // 前置未满足：灰显 + 不可点，和正常游玩的链规则一致
        const pre = this.prereq(u);
        const locked = !maxed && !pre.ok;
        const row = el(
          "div",
          "display:flex;gap:4px;align-items:center;padding:1px 2px;border-radius:2px;" +
            (maxed || locked
              ? "opacity:.4"
              : "cursor:pointer") +
            ";background:" +
            (lv > 0 ? "rgba(87,230,255,.10)" : "transparent"),
        );
        row.appendChild(el("span", "flex:1", `${u.ico ? u.ico + " " : ""}${u.n}`));
        if (locked)
          row.appendChild(el("span", "color:#c8a06a", pre.hint));
        else if (u.layer)
          row.appendChild(el("span", "color:#6d7fb5", `L${u.layer}`));
        row.appendChild(
          el(
            "span",
            "color:" + (maxed ? "#6d7fb5" : "#9fe1ff") + ";min-width:26px;text-align:right",
            `${lv}/${u.max}`,
          ),
        );
        if (!maxed && !locked)
          row.addEventListener("click", () => {
            if (this.core.learnTalent(u)) this.render();
          });
        body.appendChild(row);
      }
    }
  }
}
