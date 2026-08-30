# API、持久化、安全与观测

[返回产品板块](README.md) · [返回架构 Map](../README.md)

## 当前事实

Web 可以创建、开始和完成固定两轮 Demo，并展示 Project、Topic、Gap、Decision、Skill、Evidence 和 Competency。API 提供 create/start/answer/state，SQLite 每行保存完整 InterviewState，进程重启后 State 仍可读取；配置 Pi 模型后 Answer 使用已校验的模型 Evidence 提案。

浏览器刷新不会恢复 Session；Answer 没有 questionId、commandId、并发写保护或 Provider 失败恢复；错误尚未完整区分 `409`、`422`、`503` 和 `500`；账户与 Session 所有权尚未建设。

## HTTP API

```text
GET  /api/health
GET  /api/roles
POST /api/interviews
POST /api/interviews/:id/start
POST /api/interviews/:id/answer
GET  /api/interviews/:id/state
```

| 路由 | 成功语义 |
| --- | --- |
| `GET /api/health` | 服务存活状态 |
| `GET /api/roles` | 可选择的 Role Pack |
| `POST /api/interviews` | 创建 `draft` Session，返回 `201` |
| `POST /api/interviews/:id/start` | 选择 Anchor Project 并返回首个 InterviewStep |
| `POST /api/interviews/:id/answer` | 提交一个 Answer 命令并返回下一 InterviewStep |
| `GET /api/interviews/:id/state` | 返回持久化的完整 State |

创建接口当前接受最长 100 字符的可选 `candidateName`；Answer 最长 10,000 字符；JSON Body 最大 1 MB。

## 命令一致性

```text
{ sessionId, questionId, answer, commandId }
  → validate ownership and state
  → reject consumed question or duplicate command
  → persist Raw Turn
  → run Agent and Domain transition
  → atomically persist State
  → return State version and next Question
```

`commandId` 使网络重试返回同一结果；`questionId` 防止回答旧问题；State version 防止旧状态覆盖新状态。同一 Session 的写命令串行执行，两个并发 Answer 只能有一个成功。

浏览器只保存 `sessionId`，刷新后通过 State API 恢复，不维护第二份权威 InterviewState。

## SQLite

```sql
CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  state TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
```

Session 行是恢复和原子更新边界。分析表只能是可重建投影，不能成为 Project、Evidence 或 Trace 的第二份事实来源。

持久化规则：

- 创建、Start 和成功 Answer 后保存完整 State；
- Raw Answer 在 Provider 调用前可恢复；
- Evidence 与 Claim、Competency、Gap、Trace 一起提交；
- Provider 失败保留可重试的 Raw Turn，不报告成功；
- Schema Migration 显式执行并保留 Raw Turns。

## 错误语义

| 状态码 | 含义 |
| --- | --- |
| `400` | Body 格式、类型或长度无效 |
| `404` | Interview、Role 或路由不存在 |
| `409` | 命令与 Session 状态冲突 |
| `422` | 模型输出未通过领域校验 |
| `503` | Provider 重试后仍不可用 |
| `500` | 未预期的服务或持久化失败 |

错误不返回 Secret、无关候选人数据、完整 Prompt 或 Stack Trace。

## 安全边界

- Candidate Input 与 Model Output 都是不可信数据；
- Agent 没有 Shell、文件写入、代码编辑或无限制网络工具；
- Pi 工具默认只读并返回最小必要状态；
- Provider Key 只存在于服务端环境；
- 模型返回的 ID 必须属于当前 Session 和 active 上下文；
- 日志不复制完整 Resume、Answer、Prompt 或 sourceQuote；
- 引入账户后，所有 Session 路由校验所有权。

账户功能进入前，系统只适合本地或受控内部环境。

## 观测

每轮记录 sessionId、turnId、action、Project、Topic、Gap、Skill、Probe、provider、modelId、Prompt/Schema 版本、latency、retryCount、Evidence 接受/拒绝数和结果。

最低运行指标包括请求错误率、Provider 错误率、模型延迟、重试次数、Evidence 拒绝率、Session 完成率和平均 Turn 数。日志通过 ID 关联 Session 原文，不重复存储候选人敏感文本。

## 验收

- 浏览器刷新与 API 重启后继续当前 Session；
- 重复 commandId 不重复追加 Turn；
- 旧 questionId 返回 `409`；
- 并发 Answer 只有一个提交成功；
- Provider 超时后安全重试同一 Turn；
- 错误按契约映射且不泄露 Prompt、Stack 或 Secret。
