# 产品 Session

[返回架构 Map](../README.md)

| 项目 | 当前结论 |
| --- | --- |
| 当前判断 | Session 恢复、Answer 幂等、运行模式、进度投影和跨进程租约已运行 |
| 已验证 | Web 刷新恢复、六轮 HTTP 重启续跑、执行来源 Trace、SQLite 租约与 Provider 单次重试 |
| 主缺口 | 真实模型长程回归、账户所有权、失败调用事件和长调用租约心跳 |
| 下一验收 | 强、弱、矛盾 Profile 在同一真实模型下完成且无重复主问题 |

API 是请求信任与持久化边界，SQLite Session 是唯一耐久状态；Web 不自行计算下一问题或能力分数。

具体设计见[API、持久化、安全与观测](session-contract.md)。
