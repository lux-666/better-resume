# API、持久化、安全与观测

[返回产品板块](README.md) · [返回架构 Map](../README.md)

## HTTP API

```text
GET  /api/health
GET  /api/roles
POST /api/interviews
POST /api/interviews/:id/start
POST /api/interviews/:id/answer
GET  /api/interviews/:id/state
```

State/Step 响应包含显式 Runtime、Candidate Report 进度、当前问题与 DecisionTrace。`coveragePercent` 由非 missing Report field 与有最低可信 Evidence 的核心 Competency 共同计算；轮数单独展示。

## Answer 事务

```text
validate command
  → persist pending raw Answer and lease
  → read_report + edit_report
  → Core applies grounded Evidence edit
  → read_report + ask_candidate | finish_interview
  → Core validates decision
  → atomically persist State and completed Command
```

`commandId` 提供幂等重放，`questionId` 拒绝旧问题，`expectedStateVersion` 防止旧状态覆盖。Provider 失败时保留 pending Answer、释放租约，不保存内存中的部分 edit。

## SQLite

`sessions` 保存完整 InterviewState；`answer_commands` 保存幂等键、原始 Answer、状态、响应和过期租约。成功 Answer 时两者在同一事务提交。

## 安全边界

- Candidate Input 与模型输出均不可信；
- `edit_report` 的 Field/Claim ID、Competency、数值和 Quote 全部校验；
- `ask_candidate` 的 Field ID、问题格式、重复和内部术语全部校验；
- Agent 无 Shell、文件写入或任意网络工具；
- Provider Key 只存在于服务端；
- 配置 LLM 后失败返回错误，不退回 Demo。

## 观测

每个 DecisionTrace 记录 action、targetFieldId、reason、问题和 Evidence/Decision 模型调用的来源、延迟与重试数。失败调用尚未进入独立事件表。
