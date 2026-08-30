# Agent 持续对话

[返回架构 Map](../README.md)

| 项目 | 当前结论 |
| --- | --- |
| 当前判断 | 边界契约已验证，模型尚未进入 Answer 主链 |
| 已验证 | Pi Agent 入口、只读状态工具、Evidence 输出校验 |
| 主缺口 | Answer 主链尚未调用 Pi，也不能从持久化状态恢复模型上下文 |
| 下一验收 | 一个 Session 经真实模型完成 6–10 轮，重启后可继续且全部可追踪 |

本板块只建设“一个候选人 ↔ 一个 Interview Agent”的持续会话。Multi-Agent、Agent 间通信和跨候选人长期记忆不在当前边界内。

具体设计见[会话与模型契约](conversation-contract.md)。
