import type { GameCore } from "../game/core/GameCore";
import { UPGRADES } from "../game/data/talents";

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
      el("div", "flex:1;color:#7d8ec4;letter-spacing:1px", "DEV · 天赋作弊"),
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
    root.appendChild(tools);

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
        const row = el(
          "div",
          "display:flex;gap:4px;align-items:center;padding:1px 2px;border-radius:2px;" +
            (maxed
              ? "opacity:.4"
              : "cursor:pointer") +
            ";background:" +
            (lv > 0 ? "rgba(87,230,255,.10)" : "transparent"),
        );
        row.appendChild(el("span", "flex:1", `${u.ico ? u.ico + " " : ""}${u.n}`));
        if (u.layer) row.appendChild(el("span", "color:#6d7fb5", `L${u.layer}`));
        row.appendChild(
          el(
            "span",
            "color:" + (maxed ? "#6d7fb5" : "#9fe1ff") + ";min-width:26px;text-align:right",
            `${lv}/${u.max}`,
          ),
        );
        if (!maxed)
          row.addEventListener("click", () => {
            if (this.core.learnTalent(u)) this.render();
          });
        body.appendChild(row);
      }
    }
  }
}
