---
id: "interview-bagu-ai-agent-q13-langgraph"
kind: "competency"
domains: ["ai_engineering", "agent", "architecture"]
fieldKinds: ["mechanism", "ownership", "failure"]
depthLevels: [1, 2, 3, 4, 5]
sourceUrl: "https://github.com/xyma2003/interview-bagu/blob/06a0473e5520eba7dcb75d6f417b9f715582fca6/ai-agent/ai_agent.md#q13-langgraph-和-langchain-的关系是什么langgraph-的核心设计理念是什么"
sourceCommit: "06a0473e5520eba7dcb75d6f417b9f715582fca6"
sourceTitle: "AI Agent 开发面试八股题库 · Q13"
originalQuestion: "LangGraph 和 LangChain 的关系是什么？LangGraph 的核心设计理念是什么？"
sourceFocus: "StateGraph 的状态管理机制；Checkpointer 的工作原理；interrupt() 的 HITL 机制；何时用 LangGraph vs 简单 LangChain。"
---

# 状态图中的暂停与恢复

本项目整理（非上游原文）

适用场景：候选人用 LangGraph 实现有分支的工作流。
核验重点：区分图节点、共享状态与持久化边界；恢复时哪些节点或外部操作会重放。
可追问方向：请其沿一次中断恢复描述执行位置，再追问恢复后怎样避免重复副作用。
浅层信号：只会画图或列框架名，可追问状态由谁更新以及何时落盘。
避免预设：不默认 checkpoint 等于业务事务，也不假设简单顺序任务必须采用图框架。
