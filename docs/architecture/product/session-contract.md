# API、持久化、安全与观测

[返回产品板块](README.md) · [返回架构 Map](../README.md)

## 当前事实

Web 可以创建、开始和完成固定两轮 Demo，并展示 Project、Topic、Gap、Decision、Skill、Evidence 和 Competency。TypeBox 已定义 Create、Answer、State/Step 与 Error 的可执行 Schema；SQLite 同时保存 InterviewState 和 pending/completed Answer Command。

浏览器刷新仍不会恢复 Session；Provider 失败需要客户端重试同一 Command；多进程并发和账户所有权尚未建设。单进程内的重放、旧问题、旧版本和同 Question 竞争已受保护。

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
{ questionId, commandId, expectedStateVersion, answer }
  → validate ownership and state
  → reject consumed question or duplicate command
  → persist pending Command and raw answer
  → run Agent and Domain transition
  → atomically persist State
  → return State version and next Question
```

`commandId` 使网络重试返回同一结果；`questionId` 防止回答旧问题；State version 防止旧状态覆盖新状态。同一 Session 的写命令串行执行，两个并发 Answer 只能有一个成功。

目标浏览器只保存 `sessionId`，刷新后通过 State API 恢复，不维护第二份权威 InterviewState；当前尚未写入浏览器存储。

## SQLite

```sql
CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  state TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE answer_commands (
  session_id TEXT,
  command_id TEXT,
  question_id TEXT,
  expected_state_version INTEGER,
  answer TEXT,
  status TEXT,
  response TEXT,
  PRIMARY KEY (session_id, command_id),
  UNIQUE (session_id, question_id)
);
```

Session 行是领域状态边界；Answer Command 行是幂等和 Provider 失败恢复边界。两者在成功 Answer 时原子提交。

持久化规则：

- 创建、Start 和成功 Answer 后保存完整 State；
- Raw Answer 在 Provider 调用前以 pending Command 保存；
- Evidence 与 Claim、Competency、Gap、Trace 一起提交；
- Provider 失败保留可重试的 Raw Turn，不报告成功；
- Schema Migration 显式执行并保留 Raw Turns。

## 错误语义

| 状态码 | 含义 |
| --- | --- |
| `400` | `INVALID_REQUEST`：Body 格式、类型或长度无效 |
| `404` | `NOT_FOUND`：Interview、Role 或路由不存在 |
| `409` | `STATE_CONFLICT`：命令与 Session 状态冲突 |
| `422` | `MODEL_OUTPUT_INVALID`：模型输出未通过校验 |
| `503` | `PROVIDER_UNAVAILABLE`：Provider 不可用 |
| `500` | `INTERNAL_ERROR`：未预期的服务或持久化失败 |

错误统一返回 `{ code, message, retryable }`，不返回 Secret、无关候选人数据、完整 Prompt 或 Stack Trace。

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
