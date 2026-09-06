---
id: "interview-bagu-ai-agent-q04-hallucination"
kind: "competency"
domains: ["ai_engineering", "llm", "rag"]
fieldKinds: ["mechanism", "failure"]
depthLevels: [1, 2, 3, 4, 5]
sourceUrl: "https://github.com/xyma2003/interview-bagu/blob/06a0473e5520eba7dcb75d6f417b9f715582fca6/ai-agent/ai_agent.md#q4-解释-llm-的幻觉hallucination产生原因以及工程层面的缓解手段"
sourceCommit: "06a0473e5520eba7dcb75d6f417b9f715582fca6"
sourceTitle: "AI Agent 开发面试八股题库 · Q4"
originalQuestion: "解释 LLM 的幻觉（Hallucination）产生原因，以及工程层面的缓解手段"
sourceFocus: "幻觉的多种根本原因；RAG 的防幻觉机制；生产中的 Guardrail 设计。"
sourceExplanation: "幻觉是 LLM 在生产应用中最核心的挑战，AI Agent 岗位必考。"
---

# 幻觉的检索与生成归因

本项目整理（非上游原文）

适用场景：候选人称 RAG 或护栏降低了幻觉。
核验重点：区分资料缺失、召回错误、上下文有依据但生成不忠实；每类故障需要不同验证。
可追问方向：选一个真实错误回答，先问如何确认依据是否进入上下文，再沿其定位结果追问修复。
浅层信号：只说接入知识库就解决幻觉，可追问有资料仍答错的样本。
避免预设：不假设 RAG 消除幻觉；候选人未提供故障案例时不虚构其线上事故。
