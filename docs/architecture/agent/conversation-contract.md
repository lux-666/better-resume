# 会话与工具契约

[返回 Agent 板块](README.md) · [返回架构 Map](../README.md)

## 目标

Interview Agent 每一步读取当前 Candidate Report 和最近对话，判断 Report 最缺什么或上一轮暴露了什么高价值线索，然后自主提问或请求结束。

## 工具循环

```text
start:
  read_report → ask_candidate | finish_interview

answer:
  read_report → edit_report
  read_report → ask_candidate | finish_interview
```

工具职责：

- `read_report`：读取 Project、Claim、Report field、grounded Evidence 和矛盾；只读。
- `edit_report`：提交本轮 Answer 的结构化 Evidence edit；模型不能直接改 State。
- `ask_candidate`：选择一个 Report field，并提交一个候选人可见问题。
- `finish_interview`：请求结束；Completion Validator 可返回 blockers，Agent 随后必须继续调查。

LLM 模式没有 `Gap → Lead → Probe → Question` 调度器。某个具体技术点是否值得继续纵向深入，是 Agent 基于 Report、最近 Answer 和预期信息价值做的即时判断，不持久化为 reasoning 状态。

## Report edit

```json
{
  "answerDisposition": "substantive",
  "evidence": [{
    "reportFieldIds": ["project_enterprise_rag:mechanism"],
    "claimIds": [],
    "competencyId": "rag_engineering",
    "statement": "候选人说明使用 BM25 与 dense 召回后通过 RRF 融合。",
    "polarity": "support",
    "strength": 0.8,
    "specificity": 0.9,
    "evaluatorConfidence": 0.8,
    "sourceQuote": "BM25 和 embedding 各召回 50 条，然后通过 RRF 融合"
  }]
}
```

约束：

- `reportFieldIds` 和 `claimIds` 必须属于当前 Project 上下文；
- Evidence Competency 必须与目标 Report field 一致；
- `sourceQuote` 必须逐字存在于当前 Answer；
- vague 只能产生 weakness，irrelevant 不得产生 Evidence；
- denial/contradiction 必须包含 Claim-linked invalidate Evidence；
- 一个 Answer 可以同时更新多个 Report field。

## 调查决策

`ask_candidate` 同时包含 `targetFieldId`、`reason`、可选中性 acknowledgement 和 question。Agent 可以调查 missing/weak field、澄清矛盾，也可以沿上一轮新出现的机制、决策、代价、失败或测量继续深挖，即使目标字段已得到初步支持。

`finish_interview` 不具有最终决定权。Core 检查重要字段、每个核心 Project 的 Evidence、未解决矛盾、Evidence grounding 和硬上限。

## 上下文与持久化

InterviewState 是唯一权威状态。模型上下文每次从 Report、Turns 和 Evidence 重建；不保存第二份模型记忆。Answer Command 在 Provider 调用前持久化，成功的 Report edit 与下一 Decision 原子提交。
