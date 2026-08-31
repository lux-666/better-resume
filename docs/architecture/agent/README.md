# Agent 持续对话

[返回架构 Map](../README.md)

| 项目 | 当前结论 |
| --- | --- |
| 当前判断 | Evidence、Lead、Probe、Question 与 Skill 已进入同一 Answer 主链，Demo/LLM 来源可追踪 |
| 已验证 | 五类回答语义、Lead 连续追问、Probe coverage、两次 low-yield 退出和确定性 Profile |
| 主缺口 | 尚未用配置的真实 Provider 执行长程 Profile；失败调用尚无独立持久化事件表 |
| 下一验收 | 强、弱、矛盾 Profile 经同一真实模型完成且全部可追踪 |

本板块只建设“一个候选人 ↔ 一个 Interview Agent”的持续会话。Multi-Agent、Agent 间通信和跨候选人长期记忆不在当前边界内。

具体设计见[会话与模型契约](conversation-contract.md)。
