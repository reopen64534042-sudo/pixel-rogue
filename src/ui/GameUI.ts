import type { GameCore } from "../game/core/GameCore";
import { CHANGELOG, CURRENT_VERSION } from "../game/data/changelog";
import {
  UPGRADES,
  TIERS,
  TIER_VAL,
  CAT_COLOR,
  CAT_ICO,
} from "../game/data/talents";
import { fmtTime } from "../game/data/constants";
import { boltDamage, critMultiplier } from "../game/core/DamageMath";
import { COMBAT_BALANCE } from "../game/data/combatBalance";
import { element, elementWithin } from "./dom";
import { CodexUI } from "./CodexUI";
const DMG_NAMES: Record<string, string> = {
  bullet: "🏹魔弹",
  orbit: "🗡️飞刃",
  chain: "🌩️闪电",
  meteor: "☄️陨星",
  explode: "💣爆炸",
  thorns: "🌵荆棘",
  burn: "♨️灼烧",
  shock: "💥反震",
  reflect: "🌀飞刃反弹",
};
const show = (id: string) => element(id).classList.remove("hidden");
const hide = (id: string) => element(id).classList.add("hidden");
export class GameUI {
  /** 图鉴面板：开始界面与暂停界面共用同一实例（Issue #78） */
  readonly codex: CodexUI;
  /** 重新开始的二次确认态（Issue #81） */
  private restartArmed = false;
  private restartTimer: number | undefined;
  constructor(public core: GameCore) {
    this.codex = new CodexUI(core);
    core.view = {
      reset: () => this.reset(),
      started: () => {
        ["ov-start", "ov-over", "ov-pause", "ov-stats"].forEach(hide);
      },
      paused: (p) => {
        if (p) {
          this.renderPause();
          show("ov-pause");
        } else {
          // 防御：恢复游戏时若图鉴仍开着，一并收起，避免盖住战斗画面
          this.codex.close();
          hide("ov-pause");
        }
      },
      stats: (open) => {
        if (open) {
          // Issue #100：从暂停进入时是「返回暂停」，文案不能写返回战斗
          element("btn-statclose").textContent =
            this.core.statsFrom === "pause" ? "返 回" : "返回战斗 (C)";
          this.buildStats();
          show("ov-stats");
        } else {
          hide("ov-stats");
          document.getElementById("talent-tooltip")?.classList.add("hidden");
        }
      },
      level: () => this.openLevelPanel(),
      rest: () => this.showRestBar(),
      over: () => {
        element("over-stats").innerHTML =
          `存活时间 <span class="accent">${fmtTime(core.time)}</span> ｜ 击杀 <span class="accent">${core.kills}</span> ｜ 等级 <span class="accent">${core.player.lvl}</span>`;
        show("ov-over");
        if (core.storage.lastError) {
          const warning = document.createElement("p");
          warning.textContent = "战绩未保存：" + core.storage.lastError;
          element("over-stats").append(warning);
        }
      },
    };
    element("btn-start").onclick = () => this.core.startGame();
    // Issue #55：开始界面版本号 + 更新日志面板
    element("start-version").textContent =
      `Pixel Rogue · ${CURRENT_VERSION} · 试玩版`;
    element("btn-changelog").onclick = () => {
      element("changelog-list").innerHTML = CHANGELOG.map(
        (e) =>
          `<div class="cl-entry"><div class="cl-head">${e.version} · ${e.date} · ${e.title}</div><ul>${e.items
            .map((it) => `<li>${it}</li>`)
            .join("")}</ul></div>`,
      ).join("");
      show("ov-changelog");
    };
    element("btn-changelog-close").onclick = () => hide("ov-changelog");
    element("btn-retry").onclick = () => this.core.startGame();
    element("btn-resume").onclick = () => this.core.togglePause();
    element("btn-pause-codex").onclick = () => this.codex.open();
    // Issue #100：触屏没有 C 键，属性面板从暂停界面进入
    element("btn-pause-stats").onclick = () => this.core.openStatsFromPause();
    // 设置入口本期只占位：保持 disabled，不绑空的 onclick（避免出现死按钮）
    element("btn-restart").onclick = () => {
      if (!this.restartArmed) {
        this.armRestart();
        return;
      }
      this.disarmRestart();
      this.core.startGame();
    };
    element("btn-statclose").onclick = () => this.core.toggleStats();
    element("btn-pause").onclick = () => {
      element("btn-pause").blur();
      this.core.togglePause();
    };
    element("bp-swapbtn").onclick = () => {
      if (!this.core.openSwap()) return;
      // Issue #69：两步式——先选材料，目标稀有度自动推导
      element("sw-hint").textContent = "置换: 点击下方库存，选择要失去的天赋（2 个等级）";
      element("sw-form").classList.remove("hidden");
      element("sw-result").classList.add("hidden");
      element("bp-swap").classList.remove("hidden");
      this.renderSwInv();
    };
    element("sw-melt").onclick = () => {
      const output = this.core.melt();
      if (output) {
        element("bp-swap").classList.remove("hidden");
        element("sw-form").classList.add("hidden");
        const resEl = element("sw-result");
        resEl.classList.remove("hidden");
        const p = this.core.player;
        const lv = p.upCounts[output.n] || 1;
        const curDesc = output.cur ? output.cur(p) : output.d;
        element("sw-result-card").className = `sw-card t${output.t}`;
        element("sw-result-card").innerHTML = `
          <div class="sw-tier">${TIERS[output.t]} · ${output.cat}</div>
          <div class="sw-ico">${output.ico}</div>
          <div class="sw-name">${output.n} Lv.${lv}</div>
          <div class="sw-desc">${output.d}</div>
          <div class="sw-cur">${curDesc}</div>
        `;
      }
    };
    element("sw-confirm").onclick = () => {
      element("bp-swap").classList.add("hidden");
      element("sw-result").classList.add("hidden");
      element("sw-form").classList.remove("hidden");
    };
    element("bp-boxskip").onclick = () => {
      this.core.drainBoxPicks();
      this.core.bpMode = null;
      this.core.slots = [];
      if (this.core.wavePhase === "rest") this.showRestBar();
      else this.openLevelPanel();
    };
    element("bp-next").onclick = () => {
      if (!this.core.startNextWave()) return;
      element("bottom-bar").classList.add("hidden");
      element("bp-rest").classList.add("hidden");
      element("bp-swap").classList.add("hidden");
    };
    (element("btn-start") as HTMLButtonElement).disabled = false;
    element("btn-start").removeAttribute("aria-busy");
  }
  reset() {
    ["bottom-bar", "bp-level", "bp-rest", "bp-swap"].forEach(hide);
  }
  choose(index: number) {
    this.core.chooseSlot(index);
  }
  dispose() {
    this.core.view = {
      reset() {},
      started() {},
      paused() {},
      stats() {},
      level() {},
      rest() {},
      over() {},
    };
    for (const node of document.querySelectorAll<HTMLElement>(
      "#stage button, #bp-cards .card, #sw-inv span, #talent-list",
    )) {
      node.onclick = null;
      node.onmouseover = null;
      node.onmousemove = null;
      node.onmouseleave = null;
    }
    const overlay = document.getElementById("ov-stats");
    if (overlay) overlay.onpointerdown = null;
  }
  drawCards() {
    const box = element("bp-cards");
    box.innerHTML = "";
    this.core.slots.forEach((s, i) => {
      const u = s.u;
      const lv = this.core.player.upCounts[u.n] || 0;
      const el = document.createElement("div");
      // Issue #35：本局首次选卡时全部标 NEW，之后仅机制型 Lv.0 标记
      const firstPick = this.core.player.picks.length === 0;
      el.className =
        "card r" + u.t + (lv === 0 && (u.mech || firstPick) ? " new" : "");
      el.tabIndex = 0;
      el.setAttribute("role", "button");
      el.setAttribute("aria-label", `${u.n}，${TIERS[u.t]}，${u.d}`);
      el.onkeydown = (event) => {
        if (event.target === el && ["Enter", " "].includes(event.key)) {
          event.preventDefault();
          this.choose(i);
        }
      };
      el.innerHTML = `<div class="tier">${TIERS[u.t]}</div>
      <div class="cat" style="color:${CAT_COLOR[u.cat]}">${CAT_ICO[u.cat]} ${u.cat}</div>
      <div class="ico">${u.ico}</div><div class="nm">${u.n}${u.mech && lv === 0 ? " ✦NEW" : ""}</div>
      <div class="ds">${u.d}</div><div class="up"></div><div class="lv"></div>`;
      elementWithin(el, ".up").textContent = u.pv(this.core.player); // 动态数值预览
      elementWithin(el, ".lv").textContent = `Lv.${lv} → ${lv + 1}`;
      if (!s.used && this.core.bpMode === "level") {
        // 每张卡独立刷新 1 次（阻止冒泡，避免误触发"选卡"）；宝箱不提供刷新。
        // 用文字而非 🔄：Press Start 2P 不含 emoji，部分环境会渲染成方块。
        const rb = document.createElement("button");
        rb.className = "refr";
        rb.textContent = "刷新";
        rb.setAttribute("aria-label", `刷新第 ${i + 1} 张卡片（限一次）`);
        rb.onclick = (e) => {
          e.stopPropagation();
          this.core.refreshSlot(i);
        };
        el.appendChild(rb);
      }
      el.onclick = () => {
        this.choose(i);
      };
      box.appendChild(el);
    });
  }
  buildStats() {
    const p = this.core.player;
    // S3-C：UI 与战斗系统同源——魔弹读 DamageMath.boltDamage、暴伤读有效值
    // critMultiplier（含致命觉醒），不再各自复算公式；基础攻击与增伤乘区分展示
    const pct = (v: number) => (v * 100).toFixed(0) + "%";
    const resist = p.resistances ?? {};
    const typeBonus = p.typeDamageBonus ?? {};
    const formBonus = p.formDamageBonus ?? {};
    const physMit = (def: number) =>
      Math.round(
        (1 -
          COMBAT_BALANCE.armorK / (COMBAT_BALANCE.armorK + Math.max(0, def))) *
          100,
      );
    const combatRows: [string, string | number][] = [
      ["❤️ 生命", `${Math.ceil(p.hp)} / ${p.maxhp}`],
      ["📘 下级所需经验", p.xpNext],
      ["🌊 当前波次", this.core.waveN + "（配额 " + this.core.quota + "）"],
      // 文案更名（S3-C）：p.damage 是攻击基线（技能系数/raw），非 globalDamageBonus
      ["⚔️ 基础攻击", p.damage.toFixed(1)],
      [
        "🔥 魔弹伤害",
        boltDamage(p).toFixed(1) +
          (p.boltDmgMul > 1 ? ` ×${p.boltDmgMul.toFixed(2)}` : ""),
      ],
      [
        "⚡ 攻速",
        (p.fireRate * (1 + p.haste * 0.1)).toFixed(2) +
          " /秒" +
          (p.haste ? ` (狂热 +${p.haste * 10}%)` : ""),
      ],
      [
        "💥 暴击/暴伤",
        (p.crit * 100).toFixed(0) + "% / ×" + critMultiplier(p).toFixed(1),
      ],
      ["🔱 弹道/穿透", `${p.multishot} / ${p.pierce}`],
      ["🌐 施法范围", "×" + p.area.toFixed(2)],
      ["🪃 弹射次数", p.ricochet ? `${p.ricochet} 次` : "—"],
      ["👟 移动速度", Math.round(p.speed)],
      ["🧲 拾取范围", Math.round(p.magnet)],
      ["❄️ 冰冻减速", p.slow ? (p.slow * 100).toFixed(0) + "%" : "—"],
      ["♨️ 灼烧", p.burn ? "Lv." + p.burn : "—"],
      ["🌩️ 闪电链", p.chain ? "Lv." + p.chain : "—"],
      [
        "☄️ 陨星",
        p.meteor
          ? "每 " + Math.max(2.2, 4.6 - p.meteor * 0.4).toFixed(1) + " 秒"
          : "—",
      ],
      ["💣 击杀爆炸", p.explode ? "Lv." + p.explode : "—"],
      ["🍀 幸运", p.luck ? "Lv." + p.luck : "—"],
      // S3-C：独立增伤乘区展示（与 p.damage 基线区分；0 值按既有惯例显示 —）
      [
        "✴️ 全局增伤",
        p.globalDamageBonus ? "+" + pct(p.globalDamageBonus) : "—",
      ],
      ["⚔️ 物理增伤", typeBonus.physical ? "+" + pct(typeBonus.physical) : "—"],
      ["🌡️ 火焰增伤", typeBonus.fire ? "+" + pct(typeBonus.fire) : "—"],
      [
        "🌩️ 雷电增伤",
        typeBonus.lightning ? "+" + pct(typeBonus.lightning) : "—",
      ],
      ["🗡️ 近战增伤", formBonus.melee ? "+" + pct(formBonus.melee) : "—"],
      ["🏹 远程增伤", formBonus.ranged ? "+" + pct(formBonus.ranged) : "—"],
    ];
    const defenseRows: [string, string | number][] = [
      ["🛡️ 护盾", p.shieldMax ? `${p.shield} / ${p.shieldMax}` : "—"],
      ["🧱 壁垒", p.barrierLv ? "每波 " + p.barrierLv + " 层临时盾" : "—"],
      ["🌀 闪避", p.dodge ? (p.dodge * 100).toFixed(0) + "%" : "—"],
      [
        "🥋 减伤",
        p.tough ? (Math.min(0.6, p.tough) * 100).toFixed(0) + "%" : "—",
      ],
      // S3-C：护甲/元素抗性与战斗计算同公式（K/(K+DEF)，与减伤乘算）
      [
        "🪨 护甲",
        p.defense ? `${p.defense}（物理 -${physMit(p.defense)}%）` : "—",
      ],
      // PR #4 评审 P3：显示值同样受 resistanceCap 裁剪（与战斗实际减伤一致）
      [
        "🌋 火焰抗性",
        resist.fire
          ? pct(Math.min(resist.fire, COMBAT_BALANCE.resistanceCap))
          : "—",
      ],
      [
        "🌩️ 雷电抗性",
        resist.lightning
          ? pct(Math.min(resist.lightning, COMBAT_BALANCE.resistanceCap))
          : "—",
      ],
      ["✨ 生命回复", p.regen ? p.regen.toFixed(1) + " /秒" : "—"],
      ["🦷 吸血", p.lifesteal ? (p.lifesteal * 100).toFixed(1) + "%" : "—"],
      ["🌵 荆棘反伤", p.thorns ? `${p.thorns}` : "—"],
      [
        "💨 冲刺",
        p.dashLv
          ? `充能 ${p.dashCharges}/${1 + p.dashChargeLv} · 冷却 ${p.dashMax.toFixed(1)}s`
          : "—",
      ],
      ["😡 战意", p.rageLv ? "受伤攻速 +" + p.rageLv * 20 + "% (3秒)" : "—"],
      [
        "🏅 不屈",
        p.nd ? (p.ndUsed ? "免死(本波已触发)" : "每波一次免死") : "—",
      ],
    ];

    const renderRows = (items: [string, string | number][]) =>
      items
        .map(([k, v]) => {
          const isDim = v === "—" || v === "未学习";
          return `<div class="row${isDim ? " dim" : ""}"><span class="k">${k}</span><span class="v${isDim ? " dim" : ""}">${v}</span></div>`;
        })
        .join("");

    const combatEl = document.getElementById("stat-combat");
    const defenseEl = document.getElementById("stat-defense");
    if (combatEl) combatEl.innerHTML = renderRows(combatRows);
    if (defenseEl) defenseEl.innerHTML = renderRows(defenseRows);

    const tl = element("talent-list");
    const learned = Object.entries(p.upCounts).filter(([, lv]) => lv > 0);
    if (!learned.length) {
      tl.innerHTML = '<div class="talent-empty">暂未习得任何天赋</div>';
    } else {
      const CAT_ORDER = ["攻击", "增幅", "技能", "防御"];
      let html = "";
      for (const cat of CAT_ORDER) {
        const inCat = learned.filter(([n]) => {
          const u = UPGRADES.find((item) => item.n === n);
          return u && u.cat === cat;
        });
        // Issue #46：组内按稀有度从低到高，同稀有度按等级从高到低
        const tierOf = (n: string) =>
          UPGRADES.find((item) => item.n === n)?.t ?? 0;
        inCat.sort((x, y) => tierOf(x[0]) - tierOf(y[0]) || y[1] - x[1]);
        if (!inCat.length) continue;
        const catIco = CAT_ICO[cat] || "";
        const catColor = CAT_COLOR[cat] || "#e8fbff";
        html += `<div class="talent-cat-group">`;
        html += `<div class="talent-cat-header" style="color:${catColor}">${catIco} ${cat} (${inCat.length})</div>`;
        html += `<div class="talent-cat-tags">`;
        for (const [n, lv] of inCat) {
          const u = UPGRADES.find((item) => item.n === n)!;

          html += `<span class="talent-tag t${u.t}" data-n="${n}">${u.ico} ${n} Lv.${lv}</span>`;
        }
        html += `</div></div>`;
      }
      tl.innerHTML = html;
    }

    const tooltip = document.getElementById("talent-tooltip");
    const stage = document.getElementById("stage");
    const statsOverlay = document.getElementById("ov-stats");

    const updateTooltipPosition = (e: MouseEvent) => {
      if (!tooltip || !stage) return;
      const stageRect = stage.getBoundingClientRect();
      const ttWidth = tooltip.offsetWidth || 260;
      const ttHeight = tooltip.offsetHeight || 180;

      let x = e.clientX - stageRect.left + 16;
      let y = e.clientY - stageRect.top + 16;

      if (x + ttWidth > stageRect.width - 8) {
        x = e.clientX - stageRect.left - ttWidth - 16;
      }
      if (y + ttHeight > stageRect.height - 8) {
        y = e.clientY - stageRect.top - ttHeight - 16;
      }
      if (x < 8) x = 8;
      if (y < 8) y = 8;

      tooltip.style.left = `${x}px`;
      tooltip.style.top = `${y}px`;
    };

    const renderTooltip = (tag: HTMLElement) => {
      if (!tooltip) return;
      const u = UPGRADES.find((item) => item.n === tag.dataset.n)!;
      const lv = p.upCounts[u.n] || 0;
      const curDesc = u.cur ? u.cur(p) : u.d;
      const catColor = CAT_COLOR[u.cat] || "#57e6ff";

      tooltip.className = `talent-tooltip tt-t${u.t}`;
      tooltip.innerHTML = `
        <div class="tt-header">
          <span class="tt-ico">${u.ico}</span>
          <div class="tt-title-wrap">
            <div class="tt-name t${u.t}">${u.n}</div>
            <div class="tt-sub">
              <span class="tt-tier t${u.t}">${TIERS[u.t]}</span>
              <span class="tt-cat" style="color:${catColor}">[${u.cat}]</span>
              <span class="tt-lvl">Lv.${lv}${u.max ? " / " + u.max : ""}</span>
            </div>
          </div>
        </div>
        <div class="tt-divider"></div>
        <div class="tt-section">
          <div class="tt-label">天赋机制说明</div>
          <div class="tt-desc">${u.d}</div>
        </div>
        <div class="tt-cur-box">
          <div class="tt-label">当前等级生效效果 (Lv.${lv})</div>
          <div class="tt-cur-val">${curDesc}</div>
        </div>
        ${
          lv < u.max
            ? `<div class="tt-next-box">
                 <div class="tt-label">下级提升预览</div>
                 <div class="tt-next-val">${u.pv(p)}</div>
               </div>`
            : `<div class="tt-maxed">★ 已达最高等级 ★</div>`
        }
      `;
      tooltip.classList.remove("hidden");
    };

    const hideTooltip = () => {
      if (tooltip) tooltip.classList.add("hidden");
    };

    /**
     * Issue #96（M2-2）：触屏没有 mouseleave，「点开就关不掉」。
     *
     * 分工：
     * - 鼠标：沿用 hover 展开（onmouseover/mousemove/mouseleave），不动 PC 手感；
     * - 触控/笔：pointerdown 切换（点开 / 再点收起 / 点空白收起），并跳过随后的 click。
     * `shownTag` 只在 pointerdown 与 click 里写，hover 不写——否则 PC 上「鼠标已经展开 + 点击」
     * 会立刻命中同一条而被误判成收起。
     */
    let shownTag: HTMLElement | null = null;
    let skipNextClick = false;
    const isVisible = () =>
      tooltip !== null && !tooltip.classList.contains("hidden");
    const tagOf = (target: EventTarget | null) =>
      target instanceof Element
        ? target.closest<HTMLElement>("span[data-n]")
        : null;
    const clearActive = () => {
      tl.querySelectorAll(".talent-tag.active").forEach((el) =>
        el.classList.remove("active"),
      );
    };
    const closeTooltip = () => {
      shownTag = null;
      clearActive();
      hideTooltip();
    };
    const showTag = (sp: HTMLElement, e: MouseEvent) => {
      clearActive();
      sp.classList.add("active");
      renderTooltip(sp);
      updateTooltipPosition(e);
      shownTag = sp;
    };
    /** 触屏的确定性开关：点开、再点收起，都与「当前展示的是不是这一条」比较 */
    const toggleTag = (sp: HTMLElement, e: MouseEvent) => {
      if (shownTag === sp && isVisible()) closeTooltip();
      else showTag(sp, e);
    };

    tl.onmouseover = (e) => {
      const sp = tagOf(e.target);
      if (!sp) {
        hideTooltip();
        return;
      }
      clearActive();
      sp.classList.add("active");
      renderTooltip(sp);
      updateTooltipPosition(e);
    };

    tl.onmousemove = (e) => {
      const sp = tagOf(e.target);
      if (sp && isVisible()) updateTooltipPosition(e);
    };

    tl.onmouseleave = () => {
      clearActive();
      hideTooltip();
      shownTag = null;
    };

    tl.onpointerdown = (e) => {
      // 鼠标交给 hover 逻辑，避免 PC 上点一下就收起
      if (e.pointerType === "mouse") return;
      // 触控本轮由这里决定开关，随后的 click 不再重复处理
      skipNextClick = true;
      const sp = tagOf(e.target);
      if (!sp) {
        closeTooltip();
        return;
      }
      toggleTag(sp, e as unknown as MouseEvent);
    };

    tl.onclick = (e) => {
      if (skipNextClick) {
        skipNextClick = false;
        return;
      }
      const sp = tagOf(e.target);
      if (!sp) {
        closeTooltip();
        return;
      }
      // 鼠标点击同样支持切换（无 hover 能力的设备走不到这里，但有键盘/辅助技术在）
      toggleTag(sp, e);
    };

    /*
     * 点属性面板空白处收起：触屏上浏览器补发的 mouseover 不可靠，
     * 这里用 pointerdown（鼠标/触摸都触发）做确定性关闭。
     */
    if (statsOverlay)
      statsOverlay.onpointerdown = (e) => {
        const inside =
          e.target instanceof Element &&
          e.target.closest("#talent-list span[data-n]") !== null;
        if (!inside) closeTooltip();
      };
  }
  openLevelPanel() {
    const mode = this.core.bpMode;
    if (mode !== "level" && mode !== "box") {
      this.closeLevelPanelIfDone();
      return;
    }
    // Issue #71：跳过按钮仅宝箱模式显示
    element("bp-boxskip").classList.toggle("hidden", mode !== "box");
    // 升级面板与宝箱面板共用同一套卡片，只换标题文案
    const box = mode === "box";
    const title = document.querySelector<HTMLElement>("#bp-level .bp-title");
    if (title)
      title.textContent = box
        ? `🎁 开启宝箱 · 剩余 ${this.core.boxPicks} 次强化 · 强化一项已学天赋`
        : "⬆ 等级提升！选择一项天赋强化";
    const hint = document.querySelector<HTMLElement>(
      "#bp-level .level-subhint",
    );
    if (hint)
      hint.textContent = box
        ? "只强化已学天赋 · 键盘 1 / 2 / 3 快捷选取"
        : "模拟不暂停 · 键盘 1 / 2 / 3 快捷选取 · 点击卡片下方「刷新」换一张";
    this.drawCards();
    element("bp-level").classList.remove("hidden");
    element("bp-rest").classList.add("hidden");
    element("bottom-bar").classList.remove("hidden");
  }
  closeLevelPanelIfDone() {
    if (this.core.pendingLevels > 0) return;
    element("bp-level").classList.add("hidden");
    // Issue #71：升级选完后若仍有宝箱点数 → 依次开箱
    if (this.core.boxPicks > 0) {
      this.core.openBoxPanel();
      return;
    }
    if (this.core.wavePhase === "rest") {
      this.showRestBar();
    } else {
      element("bottom-bar").classList.add("hidden");
    }
  }
  showRestBar() {
    // 伤害统计: 合计突出 + 按占比降序
    const damage = this.core.waveDamage();
    const total = Object.values(damage).reduce((a, b) => a + b, 0);
    const items = Object.keys(DMG_NAMES)
      .map((k) => ({
        k,
        v: damage[k as keyof typeof damage] || 0,
      }))
      .filter((x) => x.v > 0.5);
    items.sort((a, b) => b.v - a.v);
    let html = `<span class="tot">合计 ${Math.round(total)}</span>`;
    for (const it of items)
      html += `<span class="it">${DMG_NAMES[it.k]} <b>${Math.round(it.v)}</b> (${((it.v / total) * 100).toFixed(0)}%)</span>`;
    if (total < 0.5) html = '<span class="it">本波没有造成伤害</span>';
    element("bp-report").innerHTML = html;
    // 置换入口: 本波没用过 且 存在可换的目标档位
    const can =
      !this.core.swapUsedThisRest &&
      ((this.core.cardsOfTier(0) >= 2 && this.core.availTalents(1).length) ||
        (this.core.cardsOfTier(1) >= 2 && this.core.availTalents(2).length) ||
        (this.core.cardsOfTier(2) >= 2 && this.core.availTalents(3).length));
    element("bp-swapbtn").style.display = can ? "" : "none";
    element("bp-swap").classList.add("hidden");
    element("bp-level").classList.add("hidden");
    element("bp-rest").classList.remove("hidden");
    element("bottom-bar").classList.remove("hidden");
  }
  setSwTarget(t: number) {
    if (!this.core.setSwapTarget(t)) {
      element("sw-hint").textContent = `${TIERS[t - 1]}卡不足 2 张！`;
      return;
    }
    element("sw-hint").textContent =
      `投入 2 张${TIERS[t - 1]}卡 → 随机熔出 1 张${TIERS[t]}卡（点击下方库存选卡）`;
    this.renderSwInv();
  }
  swSelCount() {
    return this.core.selectedCount();
  }
  renderSwInv() {
    const inv = element("sw-inv");
    const entries = Object.entries(this.core.player.upCounts).sort(
      ([a], [b]) =>
        TIER_VAL[UPGRADES.find((u) => u.n === a)!.t] -
        TIER_VAL[UPGRADES.find((u) => u.n === b)!.t],
    );
    inv.innerHTML = entries.length
      ? entries
          .map(([n, lv]) => {
            const u = UPGRADES.find((u) => u.n === n)!;
            const sel = this.core.swSel[n] || 0;
            return `<span class="t${u.t}${sel ? " sel" : ""}" data-n="${n}" data-t="${u.t}">${u.ico} ${n} Lv.${lv}${sel ? ` (选${sel})` : ""}</span>`;
          })
          .join("")
      : "<span>无库存</span>";
    [...inv.querySelectorAll<HTMLElement>("span[data-n]")].forEach((sp) => {
      sp.onclick = () => {
        const n = sp.dataset.n!;
        if (!this.core.selectMaterial(n)) {
          // Issue #74：两步式下最常见的拒绝原因是材料稀有度不一致
          element("sw-hint").textContent =
            "材料稀有度须一致——请继续选同稀有度的天赋";
          return;
        }
        this.updateSwapHint();
        this.renderSwInv();
      };
    });
    this.updateSwapHint();
  }
  /** Issue #69：根据已选材料更新提示与熔炼按钮状态 */
  updateSwapHint() {
    const count = this.swSelCount();
    const hint = element("sw-hint");
    const mb = element("sw-melt") as HTMLButtonElement;
    mb.textContent = `🔥 熔 炼 (${count}/2)`;
    if (count < 2) {
      hint.textContent = `再选 ${2 - count} 个等级的材料（可重复点同一张）`;
      mb.disabled = true;
      mb.style.opacity = "0.4";
      return;
    }
    if (!this.core.swTarget) {
      hint.textContent = "两块材料稀有度不同，无法置换——请换选同稀有度的材料";
      mb.disabled = true;
      mb.style.opacity = "0.4";
      return;
    }
    hint.textContent = `可随机熔出 1 张${TIERS[this.core.swTarget]}天赋 · 点击熔炼确认`;
    mb.disabled = !this.core.availTalents(this.core.swTarget).length;
    mb.style.opacity = mb.disabled ? "0.4" : "1";
  }

  /** 关闭最上层覆盖面板；返回是否关闭了某层（键位路由据此决定是否继续处理）。 */
  dismissOverlay(): boolean {
    if (this.codex.isOpen) {
      this.codex.close();
      return true;
    }
    return false;
  }

  /** 是否有覆盖面板打开：用于屏蔽 C 键等战斗内快捷键。 */
  hasOverlay(): boolean {
    return this.codex.isOpen;
  }

  private renderPause(): void {
    this.disarmRestart();
    const core = this.core;
    const talentCount = Object.keys(core.player.upCounts).length;
    element("pause-stats").textContent =
      `第 ${core.waveN} 波 · ${fmtTime(core.time)} · Lv.${core.player.lvl} ｜ 击杀 ${core.kills} · 天赋 ${talentCount}`;
    element("pause-version").textContent = `Pixel Rogue · ${CURRENT_VERSION}`;
  }

  /** 重新开始需二次确认：首次点击只改按钮文案，4 秒内没有第二次点击则自动复原。 */
  private armRestart(): void {
    this.restartArmed = true;
    const button = element("btn-restart");
    button.textContent = "再点一次确认";
    button.classList.add("armed");
    window.clearTimeout(this.restartTimer);
    this.restartTimer = window.setTimeout(() => this.disarmRestart(), 4000);
  }

  private disarmRestart(): void {
    this.restartArmed = false;
    window.clearTimeout(this.restartTimer);
    this.restartTimer = undefined;
    const button = element("btn-restart");
    button.textContent = "重 新 开 始";
    button.classList.remove("armed");
  }
}
