---
id: "interview-bagu-ai-agent-q11-hnsw-ivf"
kind: "competency"
domains: ["ai_engineering", "rag", "retrieval"]
fieldKinds: ["mechanism", "measurement"]
depthLevels: [2, 3, 4, 5]
sourceUrl: "https://github.com/xyma2003/interview-bagu/blob/06a0473e5520eba7dcb75d6f417b9f715582fca6/ai-agent/ai_agent.md#q11-向量数据库的索引算法-hnsw-和-ivf-有什么区别如何选择"
sourceCommit: "06a0473e5520eba7dcb75d6f417b9f715582fca6"
sourceTitle: "AI Agent 开发面试八股题库 · Q11"
originalQuestion: "向量数据库的索引算法 HNSW 和 IVF 有什么区别？如何选择？"
sourceFocus: "两种索引的核心区别（图 vs 聚类）；内存、速度、召回率三者的 trade-off；实际选择依据（数据规模、更新频率）。"
---

# HNSW 与 IVF 的选型依据

本项目整理（非上游原文）

适用场景：候选人实际比较过向量索引。
核验重点：图导航与聚类倒排影响搜索范围；召回、延迟、内存还受参数、数据分布及更新方式影响。
可追问方向：问固定召回目标时如何比较资源消耗，再追问一次参数或更新频率变化。
浅层信号：只背图快、聚类省内存，可问使用的参数、语料规模和精确搜索基线。
避免预设：不预设某算法永远更优；避免将量化带来的误差直接归因于 IVF 本身。
