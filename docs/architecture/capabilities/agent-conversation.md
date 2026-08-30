# Agent 持续对话

[返回能力建设 Map](README.md) · [Runtime 契约](../runtime/README.md)

## 目标

一个 Interview Agent 在同一 Session 内与候选人持续交流 6–10 轮。每轮都能利用必要的历史信息，但事实、评分和下一步目标仍由 InterviewState 与确定性 Policy 控制。

Multi-Agent、Agent 间通信和跨候选人长期记忆不在当前边界内。

## 当前事实

- `createInterviewAgent` 已封装 Pi Agent Core；
- Agent 只有只读 `get_interview_state` 工具，并顺序执行工具；
- `EvidenceExtractionSchema` 已定义结构化输出；
- `validateEvidenceExtraction` 已校验 Schema、上下文 ID、数值范围和逐字 Quote；
- Answer API 尚未调用 Pi，当前问题与 Evidence 来自确定性 Demo 路径；
- Agent 对话历史尚未持久化或从 Session 重建；
- Web 尚未消费流式 Question 输出。

因此本方向是“基础就绪”，不是可用的模型持续对话。

## 状态设计

```text
InterviewState                      ConversationWindow
authoritative                       derived, disposable
├── raw Turns                       ├── system instruction
├── accepted Evidence               ├── Role rubric subset
├── Claims / Gaps                   ├── active Project / Topic / Gap
├── CompetencyState                 ├── relevant Evidence
└── DecisionTrace                   └── recent Turns + older summary
```

InterviewState 是唯一事实来源。ConversationWindow 每次模型调用前从持久化状态构建；它可以被丢弃和重建，不能反向覆盖 Raw Turn 或 Evidence。

较早对话可以压缩为版本化 Summary，但 Summary 是可重建投影。涉及 Claim、矛盾、评分和 Gap 的信息仍通过结构化状态传递，不能只存在于自然语言 Summary 中。

## 每轮主链

```text
persist Raw Answer
  → build selective ConversationWindow
  → Pi extracts Evidence proposal
  → validate proposal
  → Core updates Claim / Competency / Gap
  → Policy selects next target and Skill
  → Pi generates one Question
  → persist State and Trace
  → stream or return Question
```

Provider 超时不能制造 Evidence。重试必须复用同一 Raw Turn，不能重复追加 Turn。

## 下一验收点

使用一个真实模型完成 6–10 轮固定 Profile 面试，并同时满足：

- 进程重启后从 SQLite 继续当前 Session；
- 每轮只有一个主问题；
- Question 与最近历史不重复；
- 每条 Evidence 有逐字 Quote；
- 每个 Question 有 Policy、Gap、Skill 和 Trace；
- 超时重试不丢失或重复 Turn；
- Agent 无法写状态或调用未授权工具。
