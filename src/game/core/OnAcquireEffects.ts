import type { Player } from "./types";

/**
 * Combat Foundation S4-C C3-A：生命卡获得时效果（OnAcquireEffect）。
 *
 * 契约 docs/pixel-rogue-S4C-C3-contract-v1.md §5.2：成功学习卡牌后执行的
 * **一次性效果**，与属性贡献正交——属性写入永远由 TalentStatSources 权威
 * 投影承担，本模块绝不写 maxHp/shieldMax 等属性字段。
 *
 * 调用时机：`TalentSystem.learnTalent` 内属性投影**之后**（生命之泉的回满
 * 依赖新有效 maxhp）；melt 的输出卡路径经 learnTalent 自动复用；
 * `recompute` **绝不**调用本模块（D-C3-02/03：重算不得重放获得时效果）。
 *
 * 分发范围：C3-A 仅登记两张生命卡；未迁移卡牌对其为 no-op（仍由旧 f 承载
 * 全部语义），后续批次按契约登记，不在此预测实现。
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
    default:
      // 未迁移卡牌：C3-A 不登记，no-op（未迁移卡仍走旧 f）。
      void lvBefore;
      break;
  }
}
