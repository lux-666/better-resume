---
id: "interview-bagu-ai-agent-q01-transformer"
kind: "competency"
domains: ["ai_engineering", "llm"]
fieldKinds: ["mechanism"]
depthLevels: [1, 2, 3, 4, 5]
sourceUrl: "https://github.com/xyma2003/interview-bagu/blob/06a0473e5520eba7dcb75d6f417b9f715582fca6/ai-agent/ai_agent.md#q1-请解释-transformer-的核心架构以及-self-attention-的计算过程"
sourceCommit: "06a0473e5520eba7dcb75d6f417b9f715582fca6"
sourceTitle: "AI Agent 开发面试八股题库 · Q1"
originalQuestion: "请解释 Transformer 的核心架构，以及 Self-Attention 的计算过程"
sourceFocus: "Self-Attention 的 QKV 计算公式及缩放原因；Multi-Head 的意义（多视角特征）；位置编码的必要性（Attention 本身无位置感知）；Encoder-only / Decoder-only / Encoder-Decoder 的适用场景。"
---

# 注意力缩放与长序列行为

本项目整理（非上游原文）

适用场景：候选人解释 Attention 或改过注意力实现。
核验重点：能沿 Q、K、V 张量说明计算；缩放控制分数幅度，位置表示提供顺序信息。
可追问方向：让其解释为何按键维度缩放，再按回答追问长序列下的数值或位置问题。
浅层信号：只背公式或说多头更强，可追问一个具体维度变化的影响；暂不能据此断言做过实现。
避免预设：不默认其训练过模型；公式记忆不等于能调试注意力。
