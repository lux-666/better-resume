# API 与持久化

[返回 Platform](README.md) · [返回架构 Map](../README.md)

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
| `GET /api/health` | 返回服务存活状态 |
| `GET /api/roles` | 返回可选择的 Role Pack |
| `POST /api/interviews` | 创建 `draft` Session，返回 `201` |
| `POST /api/interviews/:id/start` | 选择 Anchor Project，返回首个 Step |
| `POST /api/interviews/:id/answer` | 提交一次 Answer，返回下一 Step |
| `GET /api/interviews/:id/state` | 返回持久化的完整 State |

创建接口当前接受可选的 `candidateName`，最长 100 字符；回答接口要求非空 `answer`，最长 10,000 字符；JSON 请求体最大 1 MB。

## 错误语义

| 状态码 | 含义 |
| --- | --- |
| `400` | 请求体格式、类型或长度无效 |
| `404` | Interview、Role 或路由不存在 |
| `409` | 命令与 Session 状态冲突 |
| `422` | 模型输出未通过领域校验 |
| `503` | 模型提供商在重试后仍不可用 |
| `500` | 未预期的服务器或持久化失败 |

错误响应不得包含 Provider Secret、无关候选人数据、完整 Prompt 或 Stack Trace。服务端必须按此表分类错误，不能把所有异常压成同一个状态码。

## 存储模型

```sql
CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  state TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
```

`state` 是完整 InterviewState 的 JSON。Session 行是恢复与原子更新边界，不把 Project、Evidence 或 Trace 分拆成独立权威表。

## 持久化规则

- 创建 Session 时同时写入 ID、完整 State 和时间戳；
- Start 与 Answer 成功后保存完整 State；
- Raw Answer 在模型推理开始前必须可恢复；
- 接受的 Evidence 与 Claim、Competency、Gap、Trace 更新一起提交；
- Provider 失败后恢复到等待处理该 Raw Answer 的状态；
- 进程重启后从 SQLite 恢复当前 Question 和 State；
- Schema Migration 必须显式执行并保留 Raw Turns。

## 一致性

同一 Session 的写命令必须串行化。写入采用事务或等效的比较并交换条件，避免两个 Answer 都基于同一旧 State 成功。客户端读取到 State 不代表获得写锁。

跨 Session 报表可以使用派生表或离线索引；所有派生数据必须能从 Session State 重建。
