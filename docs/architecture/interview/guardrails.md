# Agent 决策与 Guardrail 契约

[返回 Interview 板块](README.md) · [返回架构 Map](../README.md)

## 职责

```text
Agent               decides what to investigate and how to ask
Candidate Report    stores missing, weak, supported, contradicted findings
Core guardrails     validate edits, questions, completion and hard limits
```

Core 不选择 Project、Topic、Lead 或 Probe，也不映射固定问题模板。Demo 模式保留一个确定性最小替身，只用于无模型环境的端到端验证，不代表生产调查策略。

## Session 状态

```text
DRAFT --activate--> ACTIVE
ACTIVE --ask_candidate--> ACTIVE
ACTIVE --finish_interview accepted--> COMPLETED
ACTIVE --15 turns--> COMPLETED
```

## Completion Validator

正常结束必须满足：

1. `importance >= 0.8` 的 Report field 不再是 `missing`；
2. 每个 Project 至少有一条候选人 Evidence；
3. 没有 open contradiction；
4. 每条 Evidence 都能在对应 Answer 中找到逐字 `sourceQuote`。

`weak` 代表已经调查但候选人没有提供强证据，因此不阻止结束；它必须保留为负面或低置信结果。达到 15 轮时 Runtime 强制结束，避免 Agent 无限调查。

## Question Guard

- 一个问题，且只有一个末尾问号；
- acknowledgement 不能包含问题；
- 不暴露 rubric、评分、内部字段或调查术语；
- 不使用虚假赞美或把未验证 Claim 当事实；
- 不重复已经问过的标准化问题；
- `targetFieldId` 必须存在，但允许 Agent 继续深化已 supported field。
