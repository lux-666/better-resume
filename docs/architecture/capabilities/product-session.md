# 产品 Session

[返回能力建设 Map](README.md) · [API 与持久化](../platform/api-and-persistence.md)

## 目标

候选人可以创建、继续和完成一次面试；每轮状态在刷新、进程重启、模型超时和客户端重试后保持一致。

## 当前事实

- Web 可以创建、开始和完成固定两轮 Demo；
- UI 展示当前 Project、Topic、Gap、Decision、Skill、Evidence 和 Competency；
- HTTP API 支持 create、start、answer 和 state 读取；
- SQLite 每行保存一个完整 InterviewState；
- API 进程重启后 State 仍可读取；
- Web 刷新后不会恢复已有 Session；
- Answer 命令没有 Question 版本或 idempotency key；
- 同一 Session 没有并发写保护；
- Provider 失败恢复尚未进入主链；
- 服务端尚未完整区分 `409`、`422`、`503` 和 `500`；
- 没有账户、授权或 Session 所有权边界。

## Session 命令设计

```text
Client submits { sessionId, questionId, answer, commandId }
  → validate ownership and state
  → reject consumed question or duplicate command
  → persist Raw Turn
  → run Agent and Domain transition
  → atomically persist resulting State
  → return State version and next Question
```

`commandId` 使网络重试返回同一结果；`questionId` 防止两个客户端同时回答旧问题；State version 防止旧状态覆盖新状态。

Raw Answer 在 Provider 调用前可恢复，但只有完整通过 Evidence 校验和 Domain 转换后才对外报告成功。

## UI 状态

浏览器只保存当前 `sessionId`，刷新后通过 State API 恢复。客户端不缓存第二份权威 InterviewState，也不自行推断下一 Question。

账户功能尚未进入产品边界；在引入账户前，系统只适合本地或受控内部环境。

## 下一验收点

- 浏览器刷新后恢复当前 Question、进度和 Evidence；
- API 重启后同一 Session 可继续 Answer；
- 重复 `commandId` 不重复追加 Turn；
- 旧 `questionId` 返回 `409`；
- 两个并发 Answer 只有一个提交成功；
- Provider 超时后可安全重试同一 Turn；
- 错误按 API 契约映射且不泄露 Prompt、Stack 或 Secret。
