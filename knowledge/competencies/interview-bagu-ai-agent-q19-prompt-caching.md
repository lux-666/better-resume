---
id: "interview-bagu-ai-agent-q19-prompt-caching"
kind: "competency"
domains: ["ai_engineering", "llm", "performance"]
fieldKinds: ["mechanism", "measurement", "ownership"]
depthLevels: [1, 2, 3, 4, 5]
sourceUrl: "https://github.com/xyma2003/interview-bagu/blob/06a0473e5520eba7dcb75d6f417b9f715582fca6/ai-agent/ai_agent.md#q19-什么是-prompt-caching如何在工程中最大化缓存命中率"
sourceCommit: "06a0473e5520eba7dcb75d6f417b9f715582fca6"
sourceTitle: "AI Agent 开发面试八股题库 · Q19"
originalQuestion: "什么是 Prompt Caching？如何在工程中最大化缓存命中率？"
sourceFocus: "缓存的命中条件（前缀必须完全相同）；费用计算（写入 vs 命中的差异）；在对话系统中保持缓存有效的设计。"
sourceExplanation: "Prompt Caching 是 LLM 成本优化的重要手段，AI Agent 工程师必须掌握。"
---

# 提示缓存的命中与实际收益

本项目整理（非上游原文）

适用场景：候选人通过 Prompt Caching 降本或降低首 token 延迟。
核验重点：区分缓存输入与最终答案缓存；命中受前缀、最小长度、生命周期及 Provider 规则影响。
可追问方向：问请求里哪些内容保持稳定，再追问如何从 usage 和计费观察真实收益。
浅层信号：只报理论折扣，可问冷请求、写入成本与未命中请求是否纳入比较。
避免预设：不默认所有服务支持同样的缓存规则，也不将缓存命中理解为省掉生成过程。
