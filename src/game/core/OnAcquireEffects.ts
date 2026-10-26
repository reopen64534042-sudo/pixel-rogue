import type { Player } from "./types";

/**
 * Combat Foundation S4-C C3-A/C3-B/C3-C：生命/护盾/狂热卡获得时效果（OnAcquireEffect）。
 *
 * 契约 docs/pixel-rogue-S4C-C3-contract-v1.md §5.2：成功学习卡牌后执行的
 * **一次性效果**，与属性贡献正交——属性写入永远由 TalentStatSources 权威
 * 投影承担，本模块绝不写 maxHp/shieldMax/hasteLv/dashLv 等属性字段。
 *
 * 调用时机：`TalentSystem.learnTalent` 内属性投影**之后**（生命之泉的回满
 * 依赖新有效 maxhp；能量护盾赠层不依赖上限——与旧 f 一致无条件 +1，但保持
 * 「投影 → OnAcquire」的统一时序）；melt 的输出卡路径经 learnTalent 自动
 * 复用；`recompute` **绝不**调用本模块（D-C3-02/03：重算不得重放获得时效果）。
 *
 * 分发范围：C3-A 登记两张生命卡、C3-B 登记能量护盾、C3-C 登记击杀狂热
 * （首级 Buff）；未迁移卡牌对其为 no-op（仍由旧 f 承载全部语义）。
 *
 * 纯函数约束：不掷随机数、无 DOM/Phaser/GameCore 依赖、不管理天赋来源、
 * 不重复计算 maxHp（只读取投影结果）。
 */
export function applyOnAcquireEffect(
  name: string,
  p: Player,
  lvBefore: number,
): void {
  switch (name) {
    case "生命之泉": // 旧 f（data/talents.ts）：maxhp += 20（属性，已迁移投影）；
      // hp = maxhp（回满至新有效上限）。lvBefore 不参与判定——每次获得都回满。
      p.hp = p.maxhp;
      break;
    case "巨人血脉": // 旧 f：maxhp += 30（属性，已迁移投影）；hp += 30。
      // 保持旧实现**不主动夹紧** HP：hp_old ≤ maxhp_old = maxhp_new − 30，
      // 故 +30 后不可能越过新上限（契约 §5.2 逐字等价论证）。
      p.hp += 30;
      break;
    case "能量护盾": // 旧 f：shieldMax++（属性，C3-B 起已迁移投影）；
      // shield++（无条件赠 1 层，与旧 f 逐字一致——不检查当前层数、不回满、
      // 不刷新恢复 CD；与 shieldMax 同级增长，不存在超上限问题，契约 §5.2）。
      // lvBefore 不参与判定——每级获得都赠 1 层（B4：已消耗态升级仍 +1）。
      p.shield += 1;
      break;
    case "击杀狂热": // 旧 f：hasteLv++（属性，C3-C 起已迁移投影）+ 首级
      // 条件分支 `if (hasteLv === 1) { haste = 1; hasteT = 3; }`。获得前
      // 等级 lvBefore 在 upCounts 递增前捕获：lvBefore===0（首次获得）时
      // 触发首级 Buff——与旧 f 逐字一致；lvBefore>0（升级路径）时旧 f 的
      // 条件不成立 → 不改变当前 haste/hasteT（B7：不刷新、不重触发）。
      // recompute 绝不经过此处（D-C3-03：重算永不触发 Buff）。
      if (lvBefore === 0) {
        p.haste = 1;
        p.hasteT = 3;
      }
      break;
    default:
      // 未登记卡牌均为 no-op，分两类：已迁移但无获得时效果（疾影步——解锁
      // 等级与冷却由属性投影承担，本无运行副作用）；未迁移天赋（星辰坠落、
      // 穿透之矢等——属性与效果仍全部由旧 f 承载，本模块不参与）。
      void lvBefore;
      break;
  }
}
