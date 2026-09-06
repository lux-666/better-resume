---
id: "interview-bagu-ai-agent-q17-consistency-idempotency"
kind: "competency"
domains: ["ai_engineering", "agent", "reliability"]
fieldKinds: ["mechanism", "ownership", "failure"]
depthLevels: [2, 3, 4, 5]
sourceUrl: "https://github.com/xyma2003/interview-bagu/blob/06a0473e5520eba7dcb75d6f417b9f715582fca6/ai-agent/ai_agent.md#q17-在多-agent-系统中如何处理状态一致性和任务幂等性问题"
sourceCommit: "06a0473e5520eba7dcb75d6f417b9f715582fca6"
sourceTitle: "AI Agent 开发面试八股题库 · Q17"
originalQuestion: "在多 Agent 系统中如何处理状态一致性和任务幂等性问题？"
sourceFocus: "Checkpointing 的持久化机制；幂等工具设计原则；失败恢复策略。"
sourceExplanation: "分布式多 Agent 的工程可靠性问题，考察候选人的工程化思维。"
---

# 幂等与 checkpoint 的故障窗口

本项目整理（非上游原文）

适用场景：候选人提到 Redis 幂等键、订单重试或状态恢复。
核验重点：区分去重键、执行结果和 checkpoint 的提交时机；外部副作用成功不代表本地已记录。
可追问方向：先问外部操作成功但写 checkpoint 前崩溃时怎样恢复，再按回答追问键过期或并发重试。
浅层信号：只说有锁或有键就不会重复，可问结果未知时如何确认操作已完成。
避免预设：不默认锁提供恰好一次语义，也不预设外部接口支持事务或幂等。
