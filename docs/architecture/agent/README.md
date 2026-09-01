# Agent 持续对话

[返回架构 Map](../README.md)

| 项目 | 当前结论 |
| --- | --- |
| 当前判断 | Agent 已以 Candidate Report 完成为目标，自主选择调查内容与结束时机 |
| 已验证 | `read_report`、`edit_report`、`ask_candidate`、`finish_interview` 工具边界和固定 Profile |
| 主缺口 | 尚未用配置的真实 Provider 执行三类长程回归 |
| 下一验收 | 同一真实模型完成强、弱、矛盾 Profile，问题不重复且 Evidence 全部可追溯 |

本板块只建设一个候选人与一个 Interview Agent 的持续 Session。

具体设计见[会话与工具契约](conversation-contract.md)。
