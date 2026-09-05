# Task 4.2：长文本记忆

[返回 Phase 4](README.md)

## 目标

让 Interview Agent 在 15 轮、多项目的面试后期仍能引用早期回答、发现跨项目不一致、避免重复提问，而不是只看最近四轮。记忆是从 `InterviewState` 派生的两层结构，随 State 重建，不成为第二份事实。

## 当前问题

Interview Agent 的输入是最近四轮加轻量字段索引；Report Agent 只看当前项目。双项目 12 轮 Session 中，第 10 轮的 Agent 看不到第 2 轮候选人对同一技能的表述。上下文成本优化 v0.1 用切片换取了体积下降，代价是长程一致性判断没有依据。

## 两层记忆

### 滚动摘要

`InterviewState` 新增 `memory.summary`：

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

每轮 `edit_report` 接受后由 Report Agent 顺带更新，输入是旧摘要与本轮 Evidence，输出受 1500 字符预算与 evidenceId 存在性校验。摘要替代 `recentTurns` 中较早的部分：Interview Agent 输入变为“摘要 + 最近两轮全文”。

### 语义索引

复用 4.1 的嵌入与 SQLite 层，为每个 Session 建 `session_chunks`：

- 每个 turn 的 question + answer 为一块；
- 每条 Evidence 的 statement 为一块，元数据带 projectId、competencyId、depthLevel；
- Session 完成后可按保留策略删除索引，State 不受影响。

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
- 每轮每 Agent 最多两次调用；命中内容只作为参考，Evidence 仍只能引用当前回答。

## 上下文预算

| 输入 | v0.1 | 4.2 目标 |
| --- | --- | --- |
| Interview Agent 单次上下文 | ≈ 2.5k token 最大 | ≤ 3k token，15 轮时不增长 |
| 最近全文轮数 | 4 | 2 + 摘要 |
| 跨项目历史 | 无 | 按需 recall ≤ 5 条 |

## 追踪

复用统一 Trace/Span 增加 recall、summary_update 与索引更新；展示召回条目、摘要版本、来源 State 版本、上下文预算与延迟增量。

## 评测

- 新增 `long_horizon` 固定 Profile：三项目、14 轮，第 2 轮与第 11 轮对同一技能给出不一致说法；期望有记忆配置检出 `cross_project` contradiction，无记忆配置作为对照；
- 新增 `repeat_guard` Profile：候选人在不同项目用近似措辞回答，期望不出现语义重复问题；
- 指标：跨项目矛盾检出率、Lead 跟进率、重复问题率、单次上下文 token、每轮总延迟；
- Gate：有记忆配置矛盾检出率与 Lead 跟进率高于对照且 Critical 为 0；单次上下文不超预算；每轮总延迟增幅 ≤ 20%。

## 验收

- 摘要每轮更新且通过 evidenceId 校验，超预算被拒绝并重试一次；
- 删除 `session_chunks` 后从 State 全量重建结果一致；
- `long_horizon` 与 `repeat_guard` 通过 Gate；
- 现有七个 Profile 与三个发布场景不退化。
