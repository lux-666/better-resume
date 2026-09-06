---
id: "interview-bagu-ai-agent-q06-chain-of-thought"
kind: "competency"
domains: ["ai_engineering", "llm", "prompt_engineering"]
fieldKinds: ["mechanism", "measurement"]
depthLevels: [1, 2, 3, 4]
sourceUrl: "https://github.com/xyma2003/interview-bagu/blob/06a0473e5520eba7dcb75d6f417b9f715582fca6/ai-agent/ai_agent.md#q6-什么是-chain-of-thoughtcot它为什么能提升复杂推理的准确率"
sourceCommit: "06a0473e5520eba7dcb75d6f417b9f715582fca6"
sourceTitle: "AI Agent 开发面试八股题库 · Q6"
originalQuestion: "什么是 Chain-of-Thought（CoT）？它为什么能提升复杂推理的准确率？"
sourceFocus: "CoT 的机制原理（context 作为工作内存）；何时使用 CoT（复杂推理 vs 简单分类）；Self-Consistency 与 CoT 的配合。"
---

# 分步推理的效果与成本

本项目整理（非上游原文）

适用场景：候选人声称分步提示提高准确率。
核验重点：区分提示形式变化、增加示例和增加采样预算的贡献；观察最终正确率、延迟与失败样本。
可追问方向：问同一任务集上与直接作答的对比，再按回答追问简单任务或错误传播的反例。
浅层信号：展示更长的解释不等于更准确，可追问是否只统计最终答案。
避免预设：不默认可见推理文本忠实反映内部计算，也不认定所有模型都受益。
