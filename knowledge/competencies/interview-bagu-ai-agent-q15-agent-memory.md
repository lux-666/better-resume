---
id: "interview-bagu-ai-agent-q15-agent-memory"
kind: "competency"
domains: ["ai_engineering", "agent", "memory"]
fieldKinds: ["mechanism", "ownership", "failure"]
depthLevels: [1, 2, 3, 4, 5]
sourceUrl: "https://github.com/xyma2003/interview-bagu/blob/06a0473e5520eba7dcb75d6f417b9f715582fca6/ai-agent/ai_agent.md#q15-如何实现-agent-的记忆系统短期记忆长期记忆episodic-memory-有什么区别"
sourceCommit: "06a0473e5520eba7dcb75d6f417b9f715582fca6"
sourceTitle: "AI Agent 开发面试八股题库 · Q15"
originalQuestion: "如何实现 Agent 的记忆系统？短期记忆、长期记忆、Episodic Memory 有什么区别？"
sourceFocus: "四类记忆的存储机制和检索方式；记忆写入的时机和异步处理；记忆的更新/遗忘策略（避免记忆无限增长）。"
---

# 记忆更新与过期信息

本项目整理（非上游原文）

适用场景：候选人说智能体支持长期记忆。
核验重点：区分会话上下文、摘要与跨次保存的信息；关注写入依据、召回来源及更新冲突。
可追问方向：问同一事实被用户修正后怎样避免召回旧值，再追问能否追溯原始会话。
浅层信号：只说向量库会记住所有内容，可追问重复、过期或错误记录的处理。
避免预设：不预设全部对话值得长期保存；相似度高不能证明记忆正确或仍然有效。
