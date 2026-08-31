# API、持久化、安全与观测

[返回产品板块](README.md) · [返回架构 Map](../README.md)

## 当前事实

Web 可以创建、开始、刷新恢复和完成多 Project 面试，并展示证据覆盖进度、显式 Demo/LLM 模式、Project、Topic、Gap、Lead、Probe、Decision、Skill、Evidence 和 Competency。TypeBox 逐字段定义 Create、Answer、State/Step、Runtime、Progress 与 Error 的可执行 Schema；SQLite 同时保存 InterviewState 和 pending/completed Answer Command。

浏览器通过本地 `sessionId` 从 State API 恢复 Session 和 pending Answer，也可主动清除本地引用并新建 Session。Provider 基础设施失败自动重试一次，随后可由客户端继续重试同一 Command；配置 LLM 后不允许静默退回 Demo。SQLite 租约保护多进程 Answer。账户所有权尚未建设。

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
| `GET /api/health` | 服务存活状态与非敏感 Runtime 信息 |
| `GET /api/roles` | 可选择的 Role Pack |
| `POST /api/interviews` | 创建 `draft` Session，返回 `201` |
| `POST /api/interviews/:id/start` | 选择 Anchor Project 并返回首个 InterviewStep |
| `POST /api/interviews/:id/answer` | 提交一个 Answer 命令并返回下一 InterviewStep |
| `GET /api/interviews/:id/state` | 返回持久化的完整 State |

创建接口当前接受最长 100 字符的可选 `candidateName`；Answer 最长 10,000 字符；JSON Body 最大 1 MB。

State 与 Step 响应都包含：

```text
runtime: { mode, provider?, modelId? }
progress: {
  stage, coveragePercent, turns,
  projects, topics, gaps, coreCompetencies,
  contradictionsOpen
}
```

`coveragePercent` 由已关闭 Gap 与达到最低可信度的核心 Competency Evidence 共同计算。轮数单独展示，不能冒充能力覆盖度。Progress 每次响应时从 InterviewState 与 Role Pack 派生，不持久化第二份状态。

## 命令一致性

```text
{ questionId, commandId, expectedStateVersion, answer }
  → validate command and state
  → reject consumed question or duplicate command
  → persist pending Command, raw answer and expiring lease
  → run Agent and Domain transition
  → atomically persist State
  → return State version and next Question
```

`commandId` 使网络重试返回同一结果；`questionId` 防止回答旧问题；State version 防止旧状态覆盖新状态。Answer Command 的 SQLite 租约跨服务进程串行化同一问题；进程退出后，过期租约可由重试接管。

浏览器只在 `localStorage` 保存 `sessionId`，刷新后通过 State API 恢复，不维护第二份权威 InterviewState。State 响应在必要时带回 pending Command 的原始 Answer 与幂等键。

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
  lease_owner TEXT,
  lease_expires_at INTEGER,
  PRIMARY KEY (session_id, command_id),
  UNIQUE (session_id, question_id)
);
```

Session 行是领域状态边界；Answer Command 行是幂等、Provider 失败恢复和跨进程租约边界。两者在成功 Answer 时原子提交。SQLite 使用 WAL 与 5 秒 busy timeout；旧数据库启动时显式补充租约列。租约默认 120 秒，可用 `COMMAND_LEASE_MS` 调整。

持久化规则：

- 创建、Start 和成功 Answer 后保存完整 State；
- Raw Answer 在 Provider 调用前以 pending Command 保存；
- Evidence 与 Claim、Competency、Gap、Trace 一起提交；
- Provider 基础设施失败自动重试一次；再次失败时释放租约、保留可重试的 Raw Answer 且不报告成功；
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

成功提交的每轮 DecisionTrace 已记录 Demo/LLM 模式、provider、modelId，以及 Evidence/Question 各自的 source、latency 和 retryCount。失败调用只通过错误响应暴露，尚未进入独立的持久化运行事件表；Prompt/Schema 版本和 Evidence 拒绝数也尚未记录。

目标运行指标仍包括请求错误率、Provider 错误率、模型延迟、重试次数、Evidence 拒绝率、Session 完成率和平均 Turn 数。日志通过 ID 关联 Session 原文，不重复存储候选人敏感文本。

## 验收

- 浏览器刷新与 API 重启后继续当前 Session；
- 重复 commandId 不重复追加 Turn；
- 旧 questionId 返回 `409`；
- 并发 Answer 只有一个提交成功；
- Provider 超时后安全重试同一 Turn；
- 错误按契约映射且不泄露 Prompt、Stack 或 Secret。
