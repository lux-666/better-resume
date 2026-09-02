# Task 1.5-A：Observability

[返回 Phase 1.5](README.md)

## 目标

建立 Agent 运行可观测能力，使一次 `/start` 或 `/answer` 调用可以从 HTTP 入口追踪到 Agent、Provider、Tool、State update 和最终响应。

**v0.1 实现状态：代码已接入，真实 Provider 数据采集待运行。**

## Trace 层级

```text
Turn Trace
├── Interview Agent Span（start 或 next decision）
│   ├── Model Request Span 1
│   ├── Tool Span: read_report
│   ├── Model Request Span 2
│   └── Tool Span: ask_candidate | finish_interview
├── Report Agent Span（answer only）
│   ├── Model Request Span 1
│   ├── Tool Span: read_report
│   ├── Model Request Span 2
│   └── Tool Span: edit_report
├── State Apply Span: record_answer / apply_decision
└── State Persist Span: complete_command / save_state
```

一个 Agent 调用内部可能发生多次 Provider 请求和 Tool correction，因此只有 Agent Span 不够；token、cache 和 response ID 必须记录在每个 Model Request Span 上，再聚合到 Agent Span 和 Turn Trace。

## 标识

| 字段 | 语义 |
|---|---|
| `traceId` | 一次 `/start` 或 `/answer` orchestration 的 UUID |
| `spanId` | 当前 Span UUID |
| `parentSpanId` | 父 Span；Agent 属于 Turn，Model/Tool 属于 Agent |
| `sessionId` | 面试 Session |
| `commandId` | Answer Command 幂等键；`/start` 为空 |
| `turnId` | Answer 成功落库后的业务 Turn ID；开始阶段可为空 |
| `operation` | `report_agent`、`interview_agent`、`model_request`、具体 Tool、具体 State 操作 |

`commandId` 不能代替 `traceId`：同一个 Command 可能因恢复或重试产生多个执行 Trace。

## 每个 Model Request 记录

- provider、requested model、provider 返回的 response model；
- response ID；
- startedAt、durationMs、retry attempt、stop reason；
- input tokens、output tokens、reasoning tokens（Provider 有返回时）；
- cache read tokens、cache write tokens（Provider 有返回时）；
- canonical context chars、bytes 和约算 token；
- `contextFingerprint = sha256(canonical model-visible request)`；
- 成功、失败、aborted 状态。

v0.1 对每次实际传入 `streamFn` 的完整 `Context` 做一个 SHA-256。序列化会递归排序对象键，并剔除 timestamp、usage、responseId、diagnostics 等不进入下一次模型语义输入的运行元数据；system prompt、messages、tool name/description/schema 和 tool result 均仍在 hash 覆盖范围内。Trace 只保存 hash 与大小，不保存正文。

当前 `pi-ai` 已经把 Responses usage 标准化为：

```text
usage.input
usage.output
usage.cacheRead
usage.cacheWrite
usage.reasoning
usage.totalTokens
```

其中 `usage.input` 是扣除 cache read/write 后的普通输入量。统计完整输入时使用：

```text
totalInputTokens = input + cacheRead + cacheWrite
```

Provider 或兼容网关不返回某项 usage 时，该字段必须为 `null/unavailable`，不能用 0 表示“没有消耗”。

官方 Prompt Caching 依赖相同的稳定前缀；本地 fingerprint 只能证明请求内容是否一致，不能证明 Provider 实际命中缓存。缓存命中只认 Provider usage。

## Context fingerprint

Fingerprint 覆盖当前 `pi-agent-core` 传入 Provider adapter 的 canonical context：

- system/developer prompt；
- tool name、description 和 parameters；
- 当前 Agent 初始输入；
- Tool Result，包括 consumer-scoped `read_report` view；
- Provider request 中的消息顺序。

对象键排序、时间戳和响应诊断字段剔除后，相同逻辑 Context 不会因为这些运行噪声无意义改变 hash。Tool Call ID 仍属于对话协议的一部分，因此保留。

## Error taxonomy

| 分类 | 示例 |
|---|---|
| `api_error` | timeout、429、5xx、连接失败、流提前结束 |
| `tool_error` | Schema 错误、非法 Field/Claim、问题格式错误、finish 被拒绝 |
| `state_error` | lease 丢失、State conflict、Evidence apply、事务回滚失败 |
| `aborted` | 请求取消或进程退出 |

每个错误记录 stage、稳定 error code、是否 retryable、sanitized message 和对应 span；不得记录 API Key、Authorization header 或 Chain-of-Thought。

## 存储与导出

- Telemetry 写入 SQLite `telemetry_traces` 独立表，不塞进 `InterviewState`；每次执行使用新的 UUID，正常路径不会覆盖旧 Trace；
- 默认只保存结构、计数、hash 和错误摘要，不复制完整 Prompt/Answer；
- `GET /api/interviews/:sessionId/traces` 按 Session 导出；`GET /api/traces/:traceId` 导出单个 Trace；
- Pilot Session JSON 可引用 Trace，但业务 State 与 Telemetry 仍是两个数据域。

## 验收

- `/start` Trace 包含一个 Interview Agent Span；
- `/answer` Trace 包含 Report Agent、State update、Interview Agent 及其子 Span；
- Agent tool loop 中每次 Provider 请求都有独立 usage 和 context fingerprint；
- usage 可用时聚合值与 `pi-ai` AssistantMessage usage 一致；不可用时明确显示 unavailable；
- API、Tool、State update 三类错误均有回归测试并可定位到 Span；
- Trace 导出不包含密钥、Authorization header 或隐藏推理；
- 现有 InterviewState 恢复和 Answer Command 幂等语义不改变。

## v0.1 已实现与未完成

已实现：

- `/answer` 的 Report Agent 和 Interview Agent 共用同一个 Turn Trace；
- 每次 `streamFn` 调用产生独立 Model Span，记录请求模型、响应模型、response ID、stop reason、usage、duration 和 context hash；
- Agent 生命周期事件产生 Tool Span，工具校验错误保留在对应 Span；
- State apply / persist 单独记录，异常归类为 `state_error`；
- Trace 独立持久化与两种 JSON 查询入口；
- Faux Provider 与 HTTP 恢复测试覆盖基本链路，Trace 中不出现候选人答案正文。

待真实模型验证：

- 不同 Provider 对 cached token、response model 和 reasoning token 的实际返回完整度；
- 真实 `/answer` Trace 的模型请求数量、延迟和缓存命中；
- timeout、429/5xx 和事务失败的故障注入样本。

注意：`pi-ai` 的 `usage.input/output/cacheRead/cacheWrite` 是标准化数值。若底层 adapter 已将“Provider 未给细分”归一成 0，v0.1 无法从最终 `AssistantMessage` 反推出“真实 0”还是“上游未提供”；因此跨 Provider 比较前必须先用一条真实响应确认该 adapter 的 usage 语义，不能仅凭本地 0 宣称缓存未命中。

## 参考

- [OpenAI Prompt Caching](https://developers.openai.com/api/docs/guides/prompt-caching)
