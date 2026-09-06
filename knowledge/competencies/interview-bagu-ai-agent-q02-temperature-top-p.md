---
id: "interview-bagu-ai-agent-q02-temperature-top-p"
kind: "competency"
domains: ["ai_engineering", "llm"]
fieldKinds: ["mechanism", "measurement"]
depthLevels: [1, 2, 3, 4, 5]
sourceUrl: "https://github.com/xyma2003/interview-bagu/blob/06a0473e5520eba7dcb75d6f417b9f715582fca6/ai-agent/ai_agent.md#q2-llm-的温度参数temperature和-top-p-采样有什么区别如何选择"
sourceCommit: "06a0473e5520eba7dcb75d6f417b9f715582fca6"
sourceTitle: "AI Agent 开发面试八股题库 · Q2"
originalQuestion: "LLM 的温度参数（Temperature）和 Top-P 采样有什么区别？如何选择？"
sourceFocus: "Temperature 对 softmax 分布的数学影响；Top-P 自适应候选集的优势；不同场景的参数选择经验。"
---

# 采样参数与可重复评估

本项目整理（非上游原文）

适用场景：候选人提到调温度或 Top-P 改善输出。
核验重点：温度改变分布尖锐程度，Top-P 按累计概率裁剪候选集；效果要落到任务指标。
可追问方向：选一次真实调参，问固定输入和模型时如何比较改动，随后追问质量与多样性的取舍。
浅层信号：只说温度越低越准确，可要求一个反例或重复试验结果。
避免预设：不把温度零视为所有服务上完全确定，也不预设参数同时调整更优。
