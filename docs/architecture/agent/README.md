# Agent 持续对话

[返回架构 Map](../README.md)

| 项目 | 当前结论 |
| --- | --- |
| 当前判断 | Evidence 与 Question 模型契约已进入可选 Answer 主链 |
| 已验证 | 结构化 Evidence、五类回答语义、自然问题约束与状态追踪 |
| 主缺口 | 尚无真实模型语义回归和 6–10 轮固定 Profile |
| 下一验收 | 一个 Session 经真实模型完成 6–10 轮，重启后可继续且全部可追踪 |

本板块只建设“一个候选人 ↔ 一个 Interview Agent”的持续会话。Multi-Agent、Agent 间通信和跨候选人长期记忆不在当前边界内。

具体设计见[会话与模型契约](conversation-contract.md)。
