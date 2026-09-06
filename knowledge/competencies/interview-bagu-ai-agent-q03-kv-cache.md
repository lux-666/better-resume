---
id: "interview-bagu-ai-agent-q03-kv-cache"
kind: "competency"
domains: ["ai_engineering", "llm", "performance"]
fieldKinds: ["mechanism", "measurement"]
depthLevels: [1, 2, 3, 4, 5]
sourceUrl: "https://github.com/xyma2003/interview-bagu/blob/06a0473e5520eba7dcb75d6f417b9f715582fca6/ai-agent/ai_agent.md#q3-什么是-kv-cache它在推理中如何节省计算"
sourceCommit: "06a0473e5520eba7dcb75d6f417b9f715582fca6"
sourceTitle: "AI Agent 开发面试八股题库 · Q3"
originalQuestion: "什么是 KV Cache？它在推理中如何节省计算？"
sourceFocus: "KV Cache 复用的原理和内存开销；Prompt Caching 在 API 调用层面的工程价值；与批推理（batching）的配合。"
---

# KV Cache 的计算与显存取舍

本项目整理（非上游原文）

适用场景：候选人说缓存加速了解码。
核验重点：区分 prefill 与逐 token 解码；缓存避免重复投影历史 K/V，却随上下文和并发占用显存。
可追问方向：让其定位被省掉的计算，再追问长上下文或增加并发后观察到的瓶颈。
浅层信号：只报加速倍数，可追问输入长度、输出长度及基线是否相同。
避免预设：不混同单次请求 KV Cache 与跨请求提示缓存，不默认所有注意力计算都被省掉。
