---
id: "interview-bagu-ai-agent-q09-few-shot"
kind: "competency"
domains: ["ai_engineering", "llm", "prompt_engineering"]
fieldKinds: ["mechanism", "measurement"]
depthLevels: [1, 2, 3, 4]
sourceUrl: "https://github.com/xyma2003/interview-bagu/blob/06a0473e5520eba7dcb75d6f417b9f715582fca6/ai-agent/ai_agent.md#q9-few-shot-和-zero-shot-各有什么适用场景如何选择示例example-selection"
sourceCommit: "06a0473e5520eba7dcb75d6f417b9f715582fca6"
sourceTitle: "AI Agent 开发面试八股题库 · Q9"
originalQuestion: "Few-shot 和 Zero-shot 各有什么适用场景？如何选择示例（example selection）？"
sourceFocus: "动态 Few-shot 的检索机制；示例质量的评估方式；示例数量与 context 长度的权衡。"
---

# Few-shot 示例选择与收益

本项目整理（非上游原文）

适用场景：候选人通过增加或动态检索示例改善任务。
核验重点：示例是否覆盖边界案例、标签是否一致；评估集需独立，避免把相似重复样本当泛化。
可追问方向：问一次示例选择依据，再追问移除某类示例后错误怎样变化。
浅层信号：只说示例越多越好，可问相同 token 预算下与零样本基线的比较。
避免预设：不预设动态检索优于人工挑选，也不把测试样本进入提示后的涨分当有效收益。
