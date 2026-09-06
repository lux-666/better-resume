---
id: "interview-bagu-ai-agent-q12-ragas"
kind: "competency"
domains: ["ai_engineering", "rag", "evaluation"]
fieldKinds: ["measurement", "mechanism"]
depthLevels: [1, 2, 3, 4, 5]
sourceUrl: "https://github.com/xyma2003/interview-bagu/blob/06a0473e5520eba7dcb75d6f417b9f715582fca6/ai-agent/ai_agent.md#q12-如何评估-rag-系统的质量ragas-框架的核心指标是什么"
sourceCommit: "06a0473e5520eba7dcb75d6f417b9f715582fca6"
sourceTitle: "AI Agent 开发面试八股题库 · Q12"
originalQuestion: "如何评估 RAG 系统的质量？RAGAS 框架的核心指标是什么？"
sourceFocus: "四个指标分别衡量的维度；如何构建评估数据集（无标注 vs 有标注）；在线评估 vs 离线评估。"
sourceExplanation: "评估能力是 AI 工程师的核心素养，会系统性评估说明候选人具备工程化思维。"
---

# RAG 评估的故障定位能力

本项目整理（非上游原文）

适用场景：候选人报告 RAGAS 分数或 RAG 质量提升。
核验重点：区分检索相关性、上下文覆盖和回答忠实性；明确指标版本、标注依据及评估样本来源。
可追问方向：问某个低分样本如何定位到检索或生成，再追问自动打分与人工判断不一致的情况。
浅层信号：只报综合分，可追问原始样本和失败类型分布。
避免预设：不把框架名称当作评估充分，不默认所有指标版本和参考答案要求相同。
