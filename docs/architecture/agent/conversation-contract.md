# 会话与模型契约

[返回 Agent 板块](README.md) · [返回架构 Map](../README.md)

## 目标与当前事实

目标是一个 Interview Agent 在同一 Session 内持续交流 6–10 轮。每轮利用必要历史，但事实、评分和下一目标始终由 InterviewState 与确定性 Policy 控制。

当前已有 `createInterviewAgent`、结构化 `submit_evidence` 与 `submit_question`、五类 Answer disposition、Lead/Probe 连续追问、Quote/ID 校验和候选人可见问题约束。根目录 `.env` 配置模型后，Start 和 Answer 都使用 Pi；未配置时保留确定性 Demo fallback。每次调用从持久化 InterviewState 重建选择性上下文，不保存第二份模型状态。

## 双状态边界

```text
InterviewState                      ConversationWindow
authoritative                       derived, disposable
├── raw Turns                       ├── system instruction
├── accepted Evidence               ├── Role rubric subset
├── Claims / Gaps / Leads           ├── active Project / Topic / Gap
├── Probe coverage                  ├── active Lead / selected Probe
├── CompetencyState                 ├── relevant Evidence
└── DecisionTrace                   └── recent Turns + older summary
```

ConversationWindow 每次调用前从持久化状态构建，可以丢弃和重建。较早对话可以压缩为版本化 Summary，但 Claim、矛盾、评分和 Gap 必须保留在结构化状态中，不能只存在于 Summary。

## Answer 命令

`POST /api/interviews/:id/answer` 按固定顺序执行：

```text
validate request and session
  → persist pending Answer Command and raw answer
  → build selective ConversationWindow
  → Pi analyzes Evidence, Probe coverage and follow-up Leads
  → validate schema, IDs, ranges and sourceQuote
  → Core updates Claim / Competency / Gap / Lead
  → Policy selects Gap, Lead, Probe and Skill
  → Pi generates one Question
  → append DecisionTrace
  → atomically persist State
  → return InterviewStep
```

命令输入包含 `answer`、`questionId`、`commandId` 与 `expectedStateVersion`。同一 Question 只能被一个 Command 占用；已完成 Command 重放原响应，不再次追加 Turn。

Raw Answer 必须在 Provider 调用前可恢复。Provider 失败不产生 Evidence；格式重试复用同一个 Turn。

## Evidence Extraction

提取器只接收当前 Question 与 Answer、active Project/Topic、相关 Claims、open Gaps、相关 Competency Rubric，以及维持局部语义所需的最近 Turns。

输出先分类 `substantive | vague | denial | contradiction | irrelevant`，再提交 Evidence：

```json
{
  "answerDisposition": "substantive",
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
  ],
  "probeCoverage": [
    { "probe": "ownership_boundary", "status": "sufficient", "sourceQuote": "我负责检索架构设计" }
  ],
  "followUpLeads": [
    {
      "text": "hybrid search",
      "sourceQuote": "hybrid search",
      "signal": "mechanism",
      "probeCoverage": [
        { "probe": "technical_mechanism", "status": "partial", "sourceQuote": "hybrid search" }
      ]
    }
  ]
}
```

验证规则：

- Claim 与 Competency ID 必须属于本轮上下文；
- 三个数值必须是 `[0, 1]` 内的有限数；
- polarity 只能是 `support | weakness | invalidate`；
- denial/contradiction 必须包含 invalidate Evidence，irrelevant 不得生成 Evidence；
- `sourceQuote` 非空且逐字存在于当前 Answer；
- Lead 只标识值得追的回答线索，不能携带换 Topic、关 Gap、评分或结束指令；
- Probe coverage 只能是 `partial | sufficient`，并且同样要求逐字 Quote；
- 非法 item 整体拒绝，不能由服务器改写成事实；
- Schema 无效时最多格式重试一次；
- 零条 Evidence 是合法结果。

## Conversation Policy

```text
contradiction
  → contradiction_clarification
active Lead + uncovered Probe + lowYieldCount < 2
  → continue the same Lead
otherwise
  → existing Gap / Topic / Project / Finish policy
```

Gap 决定为什么问，Lead 决定追什么，Probe 决定从哪个角度问，Question Agent 只决定怎么说。Lead 连续两次没有新增 Probe coverage 后标记为 `low_value`，Policy 退出该 Lead。Gap 关闭、Topic/Project 切换、评分和结束仍由 Core 决定。

## Question Generation

生成器只接收 InterviewDecision、active 上下文、target Gap、selected Lead/Probe、上一条 Answer、相关 Evidence 和最近 Questions。输出为可选的中性 `acknowledgement` 与一个 `question`。表达应自然、冷静、专业，但不假装成人类；不能夸奖、判分、确认未验证 Claim、泄露内部术语或组合多个主问题。

Question 只有连同 DecisionTrace 持久化后才成为当前问题。

## 版本与观测

每次模型调用记录 provider、modelId、promptVersion、schemaVersion、latency、retryCount 和结果。回归数据保存输入、结构化输出与验收结果；Prompt 或 Schema 改变时显式更新版本。

## 验收

- 一个真实模型完成 6–10 轮固定 Profile；
- 进程重启后继续同一 Session；
- 每轮只有一个不重复的主问题；
- active Lead 的问题必须沿 selected Probe 引用上一轮回答中的具体线索；
- 同一 Lead 连续两次 low-yield 后必须退出；
- 每条 Evidence 有逐字 Quote；
- 每个 Question 有 Policy、Gap、Skill 和 Trace；
- 超时重试不丢失或重复 Turn；
- Agent 无法写状态或调用未授权工具。
