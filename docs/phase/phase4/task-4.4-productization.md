# Task 4.4：产品化与稳定性

[返回 Phase 4](README.md)

## 目标

把本地 Demo 推进到可供小范围真实招聘团队使用的状态：模型调用在故障下可降级、Session 有归属、延迟与并发有度量、发布有明确 Gate。

## 备用模型降级

Phase 1.5-C 定义了 Strong fallback 的原则，4.4 实现：

- 配置 `LLM_FALLBACK_MODEL`，同 Provider；
- 触发条件只允许机器可验证事件：Provider error 达到单次重试上限、`edit_report` 或 `ask_candidate` 校验失败达到上限、超时；
- 降级流程：主模型尝试不修改 State → 失败 → 备用模型用同一 frozen State 与 answer 重试 → 只提交一次业务状态变化；
- Trace 记录主模型与备用模型各自的 token、耗时、错误与最终采用者；
- 备用模型仍失败时返回 503，Answer Command 释放租约，候选人可重试，行为与当前一致。

## 账户与归属

- 招聘方账户：邮箱加一次性登录码，Session 归属账户；
- 候选人链接：每个 Session 生成一次性访问 token，候选人凭链接作答，不需要账户；
- 报告与技术视图只对归属账户可见；候选人在完成态只看到 closing 与 `candidateFeedback`；
- 数据保留：Session 默认保留 90 天，账户可提前删除；简历索引跟随 4.3 的删除接口。

## 并发与延迟

- 每轮延迟目标：两次 Agent 调用合计 p95 ≤ 25s，含 4.1 检索与 4.2 记忆；
- 并发目标：单进程 20 个活动 Session 无租约冲突、无 SQLite busy 超时；
- 新增 `GET /api/metrics`：按小时聚合的轮次数、p50/p95 延迟、Provider 错误率、降级率、校验拒绝率；
- 技术视图读取该接口展示趋势。

## 长时间运行

- Session 断点续做：候选人关闭页面后 24 小时内凭链接恢复；已有 Answer 租约机制覆盖进程重启，4.4 补 UI 层的恢复提示与超时说明；
- 面试时长上限：Session 创建时可配置 20–60 分钟，到时 Agent 收到 `timeBudgetExhausted`，在下一轮优先 finish，硬轮次上限 15 不变。

## 发布 Gate

| 检查 | 标准 |
| --- | --- |
| 自动化 | `npm test`、typecheck、build 通过；全部固定 Profile 与发布场景 Critical/Major 为 0 |
| 故障注入 | Provider 错误、超时、校验失败三类注入下降级正确，无重复 Evidence、无部分 State |
| 并发 | 20 Session 并发脚本 30 分钟无冲突、无数据串话 |
| 隔离 | 跨账户访问全部 403，测试覆盖 |
| 人工 | 两个真实招聘团队各完成 3 场面试，Rubric 不低于 Phase 3 基线，无阻塞反馈 |

## 明确不做

- 多租户组织与权限体系、SSO；
- 视频或语音面试；
- 候选人跨 Session 画像或人才库；
- 模型微调。

## 验收

- 发布 Gate 五项全部通过，形成 `v1.0.0` 小范围可用结论与剩余风险清单；
- 文档中“不为评分虚报 RAG 或长期记忆”的声明更新为实际交付的能力描述，并链接到 4.1、4.2 的评测结果。
