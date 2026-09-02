# 产品 Session

[返回架构 Map](../README.md)

| 项目 | 当前结论 |
| --- | --- |
| 当前判断 | Session 恢复、Answer 幂等和招聘方可读的 Report JSON/Markdown 已运行 |
| 已验证 | Web 刷新恢复、HTTP 续跑、SQLite 租约、Provider 单次重试和报告 Evidence 完整性 |
| 主缺口 | 真实输入的真实模型长程回归、账户所有权和失败调用事件 |
| 下一验收 | Phase 2.4 真实端到端发布 Gate |

API 是请求信任与持久化边界，SQLite Session 是唯一耐久状态；Web 不决定下一问题或能力分数。

具体设计见[API、持久化、安全与观测](session-contract.md)和[候选人评估报告输出契约](report-output-contract.md)。
