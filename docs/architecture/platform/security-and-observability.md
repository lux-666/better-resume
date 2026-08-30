# 安全与可观测性

[返回 Platform](README.md) · [返回架构 Map](../README.md)

## 信任边界

```text
Candidate Input ──untrusted──► API validation
Model Output    ──untrusted──► Schema + domain validation
Role / Skill    ──controlled─► Runtime context
Validated State ──trusted────► SQLite
```

候选人输入是数据，不是可执行指令。模型输出在同时通过结构校验和领域校验前不具备事实地位。

## 安全规则

- 面试 Agent 不获得 Shell、文件写入、代码编辑或无限制网络工具；
- Pi 工具默认只读，并返回完成任务所需的最小状态；
- Provider Key 只存在于服务端环境变量，不进入 Web Bundle、日志或 State；
- API 限制简历、姓名、Answer 和 JSON Body 大小；
- 所有模型返回的 ID 必须属于当前 Session 和 active 上下文；
- 日志不复制完整简历、Answer、Prompt 或 `sourceQuote`；
- 账户接入后，所有 Session 路由必须校验 Session 所有权。

## 每轮记录

每个模型驱动 Turn 记录：

```text
sessionId
turnId
action
projectId
topicId
targetGap
selectedSkill
selectedProbe
provider
modelId
promptVersion
schemaVersion
latencyMs
retryCount
acceptedEvidenceCount
rejectedEvidenceCount
result: success | validation_error | provider_error
```

日志通过 ID 关联 Session 内的原文，不重复存储候选人敏感文本。

## 追踪关系

```text
Question
  └── DecisionTrace
      ├── Policy action
      ├── target Gap
      └── selected Skill / Probe

Evidence
  ├── source Turn
  ├── exact sourceQuote
  ├── linked Claims
  └── linked Competency
```

一次质量问题必须能沿这两条链定位到输入、确定性决策、模型版本和最终状态变化。缺少任一引用的记录都不进入评估结果。

## 运行信号

最低运行面板应包含：请求错误率、Provider 错误率、模型延迟、重试次数、Evidence 拒绝率、Session 完成率和平均 Turn 数。指标按版本与错误类型聚合，不按候选人原文聚合。
