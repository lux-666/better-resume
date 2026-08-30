# Platform 板块

[返回架构 Map](../README.md)

Platform 承载用户交互、HTTP 信任边界和 Session 的持久化恢复。代码位于 `apps/web` 与 `apps/server`。

## Web 职责

- 创建和恢复 Interview Session；
- 展示当前 Project、Topic、Question 和进度；
- 提交候选人 Answer；
- 展示 Evidence、Competency、Gap 和 DecisionTrace。

Web 不评分、不选 Topic、不生成权威状态，也不直接访问数据库。

## API 职责

- 校验请求类型、长度和 Session 状态；
- 串行执行一次 Session 命令；
- 调用 Domain 与 Runtime；
- 将完整 InterviewState 原子持久化；
- 把领域、模型和存储失败映射为稳定 HTTP 语义。

API 是唯一允许写 Session 的组件。

## Session Store 职责

SQLite 每行保存一个完整序列化 InterviewState，使一轮更新和一次恢复都以 Session 为单位。面向分析的规范化表只能是可重建投影，不能成为第二份权威状态。

## 细节入口

- [API 与持久化](api-and-persistence.md)：路由、响应、存储和恢复契约；
- [安全与可观测性](security-and-observability.md)：信任边界、秘密、日志与模型调用记录。
