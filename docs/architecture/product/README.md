# 产品 Session

[返回架构 Map](../README.md)

| 项目 | 当前结论 |
| --- | --- |
| 当前判断 | 本地两轮 Session 可运行，恢复与并发契约未实现 |
| 已验证 | Web、HTTP API、SQLite 和实时上下文面板 |
| 主缺口 | 浏览器恢复、命令幂等、并发保护和 Provider 失败恢复 |
| 下一验收 | 刷新、重试、并发和进程重启均不丢失或重复 Session 数据 |

API 是请求信任与持久化边界，SQLite Session 是唯一耐久状态；Web 不自行计算下一问题或能力分数。

具体设计见[API、持久化、安全与观测](session-contract.md)。
