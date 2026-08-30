# 会话与模型契约

[返回 Agent 板块](README.md) · [返回架构 Map](../README.md)

## 目标与当前事实

目标是一个 Interview Agent 在同一 Session 内持续交流 6–10 轮。每轮利用必要历史，但事实、评分和下一目标始终由 InterviewState 与确定性 Policy 控制。

当前已有 `createInterviewAgent`、只读 `get_interview_state` 工具、顺序工具执行、`EvidenceExtractionSchema` 和 `validateEvidenceExtraction`。配置 `PI_PROVIDER` 与 `PI_MODEL` 后，Answer API 通过结构化 `submit_evidence` 工具消费 Pi 提案；未配置时保留确定性 Demo fallback。模型历史仍不能从 Session 重建。

## 双状态边界

```text
InterviewState                      ConversationWindow
authoritative                       derived, disposable
├── raw Turns                       ├── system instruction
├── accepted Evidence               ├── Role rubric subset
├── Claims / Gaps                   ├── active Project / Topic / Gap
├── CompetencyState                 ├── relevant Evidence
└── DecisionTrace                   └── recent Turns + older summary
```

ConversationWindow 每次调用前从持久化状态构建，可以丢弃和重建。较早对话可以压缩为版本化 Summary，但 Claim、矛盾、评分和 Gap 必须保留在结构化状态中，不能只存在于 Summary。

## Answer 命令

`POST /api/interviews/:id/answer` 按固定顺序执行：

```text
validate request and session
  → persist Raw Turn
  → build selective ConversationWindow
  → Pi extracts Evidence proposal
  → validate schema, IDs, ranges and sourceQuote
  → Core updates Claim / Competency / Gap
  → Policy selects target and Skill
  → Pi generates one Question
  → append DecisionTrace
  → atomically persist State
  → return InterviewStep
```

命令输入包含 `answer`，并由产品 Session 补充 `questionId` 与 `commandId`。同一 Session 的 Answer 串行执行；已消费 Question 或重复命令不能再次追加 Turn。

Raw Answer 必须在 Provider 调用前可恢复。Provider 失败不产生 Evidence；格式重试复用同一个 Turn。

## Evidence Extraction

提取器只接收当前 Question 与 Answer、active Project/Topic、相关 Claims、open Gaps、相关 Competency Rubric，以及维持局部语义所需的最近 Turns。

输出结构为：

```json
{
  "evidence": [
    {
      "claimIds": ["claim_rag_ownership"],
      "competencyId": "software_engineering",
      "statement": "候选人说明了本人负责的实现。",
      "polarity": "support",
      "strength": 0.8,
      "specificity": 0.75,
      "evaluatorConfidence": 0.8,
      "sourceQuote": "我负责检索架构设计，并独立实现……"
    }
  ]
}
```

验证规则：

- Claim 与 Competency ID 必须属于本轮上下文；
- 三个数值必须是 `[0, 1]` 内的有限数；
- polarity 只能是 `support | weakness | invalidate`；
- `sourceQuote` 非空且逐字存在于当前 Answer；
- 非法 item 整体拒绝，不能由服务器改写成事实；
- Schema 无效时最多格式重试一次；
- 零条 Evidence 是合法结果。

## Question Generation

生成器只接收 InterviewDecision、selected Skill、active 上下文、target Gap、相关 Evidence 和避免重复所需的最近 Turns。输出必须是一个主问题，不能泄露 Rubric、假定未验证 Claim、暗示期待答案、组合多个主问题或偏离 Policy 目标。

Question 只有连同 DecisionTrace 持久化后才成为当前问题。

## 版本与观测

每次模型调用记录 provider、modelId、promptVersion、schemaVersion、latency、retryCount 和结果。回归数据保存输入、结构化输出与验收结果；Prompt 或 Schema 改变时显式更新版本。

## 验收

- 一个真实模型完成 6–10 轮固定 Profile；
- 进程重启后继续同一 Session；
- 每轮只有一个不重复的主问题；
- 每条 Evidence 有逐字 Quote；
- 每个 Question 有 Policy、Gap、Skill 和 Trace；
- 超时重试不丢失或重复 Turn；
- Agent 无法写状态或调用未授权工具。
