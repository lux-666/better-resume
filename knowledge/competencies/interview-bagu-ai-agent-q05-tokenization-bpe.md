---
id: "interview-bagu-ai-agent-q05-tokenization-bpe"
kind: "competency"
domains: ["ai_engineering", "llm"]
fieldKinds: ["mechanism", "measurement"]
depthLevels: [1, 2, 3, 4]
sourceUrl: "https://github.com/xyma2003/interview-bagu/blob/06a0473e5520eba7dcb75d6f417b9f715582fca6/ai-agent/ai_agent.md#q5-解释-tokenization-的原理bpe-算法如何工作为什么-llm-对中文的处理效率低于英文"
sourceCommit: "06a0473e5520eba7dcb75d6f417b9f715582fca6"
sourceTitle: "AI Agent 开发面试八股题库 · Q5"
originalQuestion: "解释 Tokenization 的原理，BPE 算法如何工作？为什么 LLM 对中文的处理效率低于英文？"
sourceFocus: "BPE 训练过程；中英文 token 消耗差异的原因；对实际 API 成本的影响。"
---

# 分词成本的实测边界

本项目整理（非上游原文）

适用场景：候选人因中文 token 成本优化提示。
核验重点：BPE 合并规则与词表由训练决定；同一语义内容的 token 数依赖具体 tokenizer 和文本分布。
可追问方向：请其给出一次实际计数及使用的 tokenizer，再问压缩内容是否损失任务信息。
浅层信号：只说中文一定比英文低效，可追问换模型或等义翻译后是否仍成立。
避免预设：上游题干的中英文比较不是普遍结论；不把字符数直接当 token 数。
