# 产品 Session

[返回架构 Map](../README.md)

| 项目 | 当前结论 |
| --- | --- |
| 当前判断 | Phase 2 发布 Gate 已通过，可发布 `v0.1.0` 本地 Demo |
| 已验证 | 三类真实输入、真实模型访谈、Session 恢复、Answer 幂等、Provider 单次重试和报告完整性 |
| 主缺口 | 公开服务的账户所有权、更多真实候选人样本和失败调用事件 |
| 下一验收 | `v0.1.0` 发布检查与真实使用反馈 |

API 是请求信任与持久化边界，SQLite Session 是唯一耐久状态；Web 不决定下一问题或能力分数。

具体设计见[API、持久化、安全与观测](session-contract.md)和[候选人评估报告输出契约](report-output-contract.md)。
