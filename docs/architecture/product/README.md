# 产品 Session

[返回架构 Map](../README.md)

| 项目 | 当前结论 |
| --- | --- |
| 当前判断 | Answer Command 契约、幂等重放和旧问题拒绝已运行 |
| 已验证 | Web、可执行 HTTP Schema、SQLite Command/Session 与实时上下文面板 |
| 主缺口 | 浏览器刷新恢复、Provider 失败自动重试和多进程并发保护 |
| 下一验收 | 刷新、重试、并发和进程重启均不丢失或重复 Session 数据 |

API 是请求信任与持久化边界，SQLite Session 是唯一耐久状态；Web 不自行计算下一问题或能力分数。

具体设计见[API、持久化、安全与观测](session-contract.md)。
