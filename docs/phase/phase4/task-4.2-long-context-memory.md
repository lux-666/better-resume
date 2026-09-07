# Task 4.2：长文本记忆

[返回 Phase 4](README.md)

## 目标

让 Interview Agent 在 15 轮、多项目的面试后期仍能引用早期回答、发现跨项目不一致、避免重复提问，而不是只看最近四轮。记忆是从 `InterviewState` 派生的两层结构，随 State 重建，不成为第二份事实。

## 当前交付状态

MVP 已接入两个 Agent、事务提交与技术视图。采用确定性摘要与按需索引，先验证真实工具链；长期效果与延迟 Gate 待后续评测。

## 解决的问题

Interview Agent 的输入是最近四轮加轻量字段索引；Report Agent 只看当前项目。双项目 12 轮 Session 中，第 10 轮的 Agent 看不到第 2 轮候选人对同一技能的表述。上下文成本优化 v0.1 用切片换取了体积下降，代价是长程一致性判断没有依据。

## 两层记忆

### 滚动摘要

`buildSummary(State)` 生成只用于本次 Agent 输入的摘要，不持久化为第二份会话状态：

```ts
interface InterviewSummary {
  version: number;                 // 等于生成时的 turns.length
  perProject: Array<{
    projectId: string;
    coveredDepth: Record<FieldKind, number>;
    keyStatements: Array<{ text: string; evidenceId: string }>;   // ≤ 5 条
    openLeads: string[];
    contradictions: string[];
  }>;
  candidateStyle: string;          // 一句，描述回答习惯，不含评价
  charBudget: 1500;
}
```

Interview Agent 每次决策前，由 Core 从当前 State 确定性生成摘要；同一摘要用于模型输入和遥测统计，不增加 LLM 摘要调用，也不写入 State。摘录逐条校对原始 Answer 与 evidenceId，JSON 总长不超过 1500 字符，超出部分省略并标记 `truncated`。同一项目最多五条原话摘录，每条最多 100 字符；候选人风格仅记录作答/澄清次数，不作判断。

`version` 为生成时的 turns.length，`sourceStateVersion` 为生成时的 traces.length：回答已在内存接受、下一次 Decision 尚未追加时，二者不是同一个计数。失败尝试的摘要统计保留在对应失败 Trace 中，但不会成为后续事实。旧会话中的 memory 缓存在加载时丢弃，回答与证据完整保留。摘要配合最近两轮回答（每轮最多 4000 字符并标记截断）。

### 语义索引

复用 4.1 的嵌入与 SQLite 层，为每个 Session 建 `session_chunks`：

- 每个 turn 的 question + answer 为一块（当前索引投影最多 1400 字符，完整原话仍在 State）；
- 每条 Evidence 的 statement、sourceQuote、能力与深度为一块；
- 首次 recall 时按范围生成向量，后续以文本哈希与模型指纹增量缓存；不在每次回答提交时额外调用 embedding；
- 表中只缓存向量、哈希和标识，召回正文始终从调用时的 State 投影，未提交/失败命令的缓存不会成为事实来源；
- 完成后持续保留，由用户删除会话时清理。删除向量缓存后可从 State 按需重建。

## Agent 工具

Interview Agent 与 Report Agent 共用：

```ts
recall({
  query: string;
  scope: "turns" | "evidence" | "both";
  projectId?: string;          // 缺省为跨项目
  limit?: number;              // ≤ 5
}) → { hits: Array<{ kind, id, text, projectId, turnIndex, score }> }
```

- Interview Agent 用于：切换项目前检查同一技能的早期表述、决定是否发起 `cross_project` 一致性追问、避免重复问题；
- Report Agent 用于：判定当前回答与其他项目已接受 Evidence 是否冲突，支撑 3.1 定义的 `cross_project` contradiction；
- 每轮每 Agent 最多两次调用，重试与主备模型共用预算；先 `read_report` 再 recall；
- 跨项目核验默认省略 projectId；Report Agent 看到可召回的项目名称/ID/轮数索引，过滤无命中时可在预算内放宽过滤；
- 命中 Evidence 或 Turn 能提供指向历史已接受证据的 claimId，当前回答仍是新 Evidence 唯一原话来源；
- embedding 未配置或失败时显式返回 unavailable，继续使用摘要与当前资料。

## 上下文预算

| 输入 | v0.1 | 4.2 目标 |
| --- | --- | --- |
| Interview Agent 单次上下文 | ≈ 2.5k token 最大 | ≤ 3k token，15 轮时不增长 |
| 最近全文轮数 | 4 | 2 + 摘要 |
| 跨项目历史 | 无 | 按需 recall ≤ 5 条 |

3k token 与延迟增幅 ≤20% 是后续目标，目前没有全量上下文硬限制或达标结论；长项目资料、工具返回仍会增加输入。1400/4000 字符投影是 MVP 限制，后续需评估片段选择策略。

## 追踪

复用统一 Trace/Span 增加 recall、summary_update 与索引更新；展示召回标识、分数、查询与过滤条件、摘要版本/字符数/截断、来源 State 版本、模型上下文字节数和延迟。简历查询内容不记录正文，使用固定省略标识。

## 评测

- 新增 `long_horizon` 固定 Profile：三项目、14 轮，第 2 轮与第 11 轮对同一技能给出不一致说法；期望有记忆配置检出 `cross_project` contradiction，无记忆配置作为对照；
- 新增 `repeat_guard` Profile：候选人在不同项目用近似措辞回答，期望不出现语义重复问题；
- 指标：跨项目矛盾检出率、Lead 跟进率、重复问题率、单次上下文 token、每轮总延迟；
- Gate：有记忆配置矛盾检出率与 Lead 跟进率高于对照且 Critical 为 0；单次上下文不超预算；每轮总延迟增幅 ≤ 20%。

## 验收

- 摘要在每次实际 Interview Agent 决策前确定性生成，摘录逐字核验、超预算部分不加入；
- 删除 `session_chunks` 后从 State 全量重建结果一致；
- `long_horizon` 与 `repeat_guard` 通过 Gate；
- 现有七个 Profile 与三个发布场景不退化。

## 本轮验证

- 自动化覆盖三项目 14 轮摘要预算、早期证据超出最近 10 条时的 recall→cross_project、会话范围、缓存复用/重建、失败预算与原话边界。
- `npm run eval:phase4` 的真实 Report 与 embedding 冒烟：一份三项目、14 轮合成样本，Agent 自主 recall 一次，形成 cross_project，报告完整性通过。
- 无记忆对照、repeat_guard 真人评审、延迟增幅和大样本 Gate 未执行，不据此声称稳定提高检出率。
