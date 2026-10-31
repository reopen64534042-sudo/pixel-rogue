import { createLaserState } from "../game/data/laser";
import type { GameCore } from "../game/core/GameCore";
import {
  UPGRADES,
  chainDisplayLayer,
  displayTalentTier,
  TIER_COLOR,
} from "../game/data/talents";
import type { Talent } from "../game/core/types";

/**
 * 开发者作弊面板（**仅 DEV 构建**）。
 *
 * 用途：测试时随时学习任意天赋、加属性次数、快速重开，不用等波次发放。
 * 边界：
 * - `GameScene` 只在 `import.meta.env.DEV` 下实例化，生产包既没有入口、
 *   也不会加载控制桥（与 AGENTS「生产不得暴露控制接口」一致）。
 * - 走 `core.learnTalent()`，因此属性投影 / 图鉴 / upCounts 都是正常路径。
 * - 面板自己的 `prereq` 仍检查职业/战士流派、前置、互斥和变体组，避免点到
 *   另一流派的卡；仅属性次数等数值校验被绕过，用于开发环境组合测试。
 */
const GROUPS: { key: string; label: string }[] = [
  { key: "legacy", label: "旧表（retired/hidden）" },
  { key: "shooter", label: "射手" },
  { key: "mage", label: "法师" },
  { key: "warrior", label: "战士" },
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
      this.core.attributePoints += 5;
      this.core.attrPicks += 5;
      // 立即弹出属性选择面板，不用等到休整环节；若当前已有面板，
      // openAttrPanel 会早退，这 5 点仍排在波末使用。
      if (this.core.state === "play") this.core.openAttrPanel();
    });
    mk("重开本局", () => {
      this.core.startGame(this.core.prof, this.core.warriorStyle, this.core.shooterWeapon);
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

    // 允许复活（仅 DEV）：死亡自动按当前波满血复活，保留构筑。
    const tools2 = el("div", "display:flex;gap:6px;margin-bottom:6px");
    const revive = el(
      "button",
      "flex:1;background:" +
        (this.core.devRevive ? "#2a4a2a" : "#1d2440") +
        ";color:#cfe0ff;border:1px solid " +
        (this.core.devRevive ? "#57e86b" : "#3a4a7a") +
        ";border-radius:3px;padding:3px 4px;cursor:pointer",
      "复活：" + (this.core.devRevive ? "开" : "关"),
    ) as HTMLButtonElement;
    revive.addEventListener("click", () => {
      this.core.devRevive = !this.core.devRevive;
      revive.textContent = "复活：" + (this.core.devRevive ? "开" : "关");
      revive.style.background = this.core.devRevive ? "#2a4a2a" : "#1d2440";
      revive.style.borderColor = this.core.devRevive ? "#57e86b" : "#3a4a7a";
    });
    tools2.appendChild(revive);
    const clearTalents = el(
      "button",
      "flex:1;background:#3a2020;color:#ffb4b4;border:1px solid #7a3a3a;border-radius:3px;padding:3px 4px;cursor:pointer",
      "清空天赋",
    );
    clearTalents.title = "清空已学天赋，保留属性 / 等级 / 强化箭";
    clearTalents.addEventListener("click", () => {
      this.core.devClearTalents();
      this.render();
    });
    tools2.appendChild(clearTalents);
    root.appendChild(tools2);

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

    // 直接跳上一波 / 下一波（保留当前构筑）。
    const waveBtns = el("div", "display:flex;gap:6px;margin-bottom:6px");
    const mkWave = (label: string, delta: number) => {
      const button = el(
        "button",
        "flex:1;background:#1d2440;color:#cfe0ff;border:1px solid #3a4a7a;border-radius:3px;padding:3px 4px;cursor:pointer",
        label,
      );
      button.addEventListener("click", () => this.jumpWave(delta));
      waveBtns.appendChild(button);
    };
    mkWave("← 上一波", -1);
    mkWave("下一波 →", 1);
    root.appendChild(waveBtns);

    // 强化箭阶段：直接回退/跳到指定等级，并按阶段重建升级。
    const specialRow = el(
      "div",
      "display:flex;gap:4px;margin-bottom:6px;align-items:center",
    ) as HTMLDivElement;
    specialRow.appendChild(el("span", "color:#7d8ec4", this.core.shooterWeapon === "laser" ? "激光" : "强化箭"));
    const specialSel = document.createElement("select");
    specialSel.style.cssText =
      "flex:1;background:#0e1430;color:#cfe0ff;border:1px solid #3a4a7a;border-radius:3px;padding:2px 4px;font:11px ui-monospace,Consolas,monospace";
    for (let i = 1; i <= 12; i++) {
      const option = document.createElement("option");
      option.value = String(i);
      option.textContent = `Lv.${i}`;
      specialSel.appendChild(option);
    }
    specialSel.value = String(this.core.shooterWeapon === "laser" ? this.core.laserLevel : this.core.specialLevel);
    specialSel.addEventListener("keydown", (e) => e.stopPropagation());
    specialSel.addEventListener("keyup", (e) => e.stopPropagation());
    specialRow.appendChild(specialSel);
    const specialGo = el(
      "button",
      "background:#1d2440;color:#cfe0ff;border:1px solid #3a4a7a;border-radius:3px;padding:2px 6px;cursor:pointer",
      "应用",
    );
    specialGo.title = "按阶段重建升级（L4 起每级 1 条）";
    specialGo.addEventListener("click", () => {
      if (this.core.shooterWeapon === "laser") this.core.devSetLaserLevel(Number(specialSel.value));
      else this.core.devSetSpecialLevel(Number(specialSel.value));
      this.render();
    });
    specialRow.appendChild(specialGo);
    root.appendChild(specialRow);

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
  private startAtWave(n: number) {    const c = this.core;
    // 只有「开始 / 结算」界面没有可保留的局，先正常开局；
    // 游玩中跳波**保留当前构筑**（天赋/属性/等级），只清场并把波次拨到 n。
    if (c.state !== "play" && c.state !== "pause" && c.state !== "stats")
      c.startGame(c.prof, c.warriorStyle, c.shooterWeapon);
    c.enemies = [];
    c.ebullets = [];
    c.bullets = [];
    c.gems = [];
    c.boxes = [];
    c.potions = [];
    c.meteors = [];
    c.burnZones = [];
    c.trailZones = [];
    c.webZones = [];
    c.mageMeteors = [];
    c.mageDomains = [];
    c.mageDecoys = [];
    // 上游 v74 新增：导弹/激光是瞬态对象，跳波时必须清掉，
    // 否则旧目标/旧弹道会带进新波；specialLevel/Upgrades 属于构筑，保留。
    c.missiles = [];
    c.lasers = [];
    c.laser = createLaserState();
    c.shotCounter = 0;
    c.dashFireBoostT = 0;
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

  /** 直接跳上一波 / 下一波；保留当前构筑（走 startAtWave 的游玩中分支）。 */
  private jumpWave(delta: number) {
    const target = Math.max(1, this.core.waveN + delta);
    this.lastWave = target;
    this.startAtWave(target);
    this.render();
  }

  /**
   * 正常游玩的前置判定：职业归属、战士流派、`requires`（链前置）、`req`（自定义条件）、
   * 互斥（双向）与变体组 N 选 1（含 `variantBypass` 豁免）。
   * 职业/流派也必须匹配：法师局不再能点射手卡；大剑局不能点太刀卡（v128 用户要求）。
   */
  private prereq(u: Talent): { ok: boolean; hint: string } {
    if (u.prof && u.prof !== "common" && u.prof !== this.core.prof)
      return { ok: false, hint: "职业不符" };
    if (
      u.warriorStyle &&
      (this.core.prof !== "warrior" ||
        this.core.warriorStyle !== u.warriorStyle)
    )
      return { ok: false, hint: "流派不符" };
    if (u.prof === "shooter" && (u.shooterWeapon ?? "charged") !== this.core.shooterWeapon)
      return { ok: false, hint: "主武器不符" };
    const picks = this.core.player.picks;
    if (u.requires && !picks.includes(u.requires))
      return { ok: false, hint: `需 ${u.requires}` };
    if (u.req && !u.req(this.core.player))
      return { ok: false, hint: u.reqHint ?? "前置未满足" };
    if (u.excludes?.some((n) => picks.includes(n)))
      return { ok: false, hint: "与已选卡互斥" };
    if (UPGRADES.some((o) => o.excludes?.includes(u.n) && picks.includes(o.n)))
      return { ok: false, hint: "与已选卡互斥" };
    if (u.variant) {
      const bypass = UPGRADES.some(
        (o) => o.variantBypass === u.variant && picks.includes(o.n),
      );
      if (
        !bypass &&
        UPGRADES.some((o) => o.variant === u.variant && picks.includes(o.n))
      )
        return { ok: false, hint: "同组已选" };
    }
    return { ok: true, hint: "" };
  }

  private render() {
    const body = this.body;
    if (!body) return;
    // 只有数量/职业/流派变化才重建 DOM（避免无意义的 74 行重排，也保住滚动位置）
    const sig =
      `${this.core.prof}|${this.core.warriorStyle}|` +
      UPGRADES.map((u) => this.core.player.upCounts[u.n] || 0).join(",");
    if (sig === this.sig) return;
    this.sig = sig;
    body.innerHTML = "";
    for (const g of GROUPS) {
      const cards = UPGRADES.filter((u) => (u.prof ?? "legacy") === g.key);
      if (!cards.length) continue;
      const sections =
        g.key === "warrior"
          ? [
              {
                label: "太刀",
                cards: cards.filter((u) => u.warriorStyle === "katana"),
              },
              {
                label: "大剑",
                cards: cards.filter((u) => u.warriorStyle === "greatsword"),
              },
              {
                label: "公共",
                cards: cards.filter((u) => !u.warriorStyle),
              },
            ].filter((s) => s.cards.length > 0)
          : [{ label: g.label, cards }];
      for (const section of sections) {
        body.appendChild(
          el(
            "div",
            "margin:6px 0 2px;color:#7d8ec4;border-bottom:1px solid #23305a",
            `${g.label} · ${section.label} · ${section.cards.length}`,
          ),
        );
        for (const u of section.cards) {
          const lv = this.core.player.upCounts[u.n] || 0;
          const maxed = lv >= u.max;
          // 前置未满足：灰显 + 不可点，和正常游玩的链规则一致
          const pre = this.prereq(u);
          const locked = !maxed && !pre.ok;
          const displayTier = displayTalentTier(u, UPGRADES);
          const chainLayer = chainDisplayLayer(u, UPGRADES);
          const frameColor =
            displayTier === 0
              ? "#3d4a7a"
              : TIER_COLOR[displayTier] ?? "#3d4a7a";
          const row = el(
            "div",
            "display:flex;gap:4px;align-items:center;padding:1px 2px;border-radius:2px;" +
              `border:1px solid ${frameColor};` +
              (maxed || locked
                ? "opacity:.4"
                : "cursor:pointer") +
              ";background:" +
              (lv > 0 ? "rgba(87,230,255,.10)" : "transparent"),
          );
          row.appendChild(el("span", "flex:1", `${u.ico ? u.ico + " " : ""}${u.n}`));
          if (locked)
            row.appendChild(el("span", "color:#c8a06a", pre.hint));
          else if (chainLayer)
            row.appendChild(el("span", "color:#6d7fb5", `L${chainLayer}`));
          row.appendChild(
            el(
              "span",
              "color:" +
                (maxed ? "#6d7fb5" : "#9fe1ff") +
                ";min-width:26px;text-align:right",
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
}
