---
id: "interview-bagu-ai-agent-q10-rag-stack"
kind: "competency"
domains: ["ai_engineering", "rag"]
fieldKinds: ["mechanism", "ownership", "measurement"]
depthLevels: [1, 2, 3, 4, 5]
sourceUrl: "https://github.com/xyma2003/interview-bagu/blob/06a0473e5520eba7dcb75d6f417b9f715582fca6/ai-agent/ai_agent.md#q10-请详细介绍-rag-的完整技术栈以及各个环节的优化点"
sourceCommit: "06a0473e5520eba7dcb75d6f417b9f715582fca6"
sourceTitle: "AI Agent 开发面试八股题库 · Q10"
originalQuestion: "请详细介绍 RAG 的完整技术栈，以及各个环节的优化点"
sourceFocus: "Chunking 策略选择的依据；混合检索的优势；Reranker 的必要性；RAG 的评估指标。"
sourceExplanation: "RAG 是 AI Agent 岗位最核心的工程实践，面试官会深挖每个环节。"
---

# 混合召回与重排的增量价值

本项目整理（非上游原文）

适用场景：候选人提到 BM25、dense、RRF 或 reranker。
核验重点：区分召回漏检与排序错误；融合解决的互补性需由查询样本支持，重排有额外延迟。
可追问方向：先问哪类查询让其保留两路召回，再按回答追问去掉重排后的质量与延迟变化。
浅层信号：只列组件或说效果更好，可追问一个基线失败而组合成功的查询。
避免预设：不默认用过 RRF、不默认必须重排；只围绕已确认的组件一次问一个取舍。
