---
id: "interview-bagu-ai-agent-q20-agent-testing"
kind: "competency"
domains: ["ai_engineering", "agent", "evaluation", "testing"]
fieldKinds: ["mechanism", "measurement", "failure"]
depthLevels: [1, 2, 3, 4, 5]
sourceUrl: "https://github.com/xyma2003/interview-bagu/blob/06a0473e5520eba7dcb75d6f417b9f715582fca6/ai-agent/ai_agent.md#q20-如何对-ai-agent-进行系统性测试有哪些评估维度和工具"
sourceCommit: "06a0473e5520eba7dcb75d6f417b9f715582fca6"
sourceTitle: "AI Agent 开发面试八股题库 · Q20"
originalQuestion: "如何对 AI Agent 进行系统性测试？有哪些评估维度和工具？"
sourceFocus: "如何 Mock LLM 调用加速测试；Trajectory Evaluation 的意义；生产环境的 A/B 测试设计。"
---

# Agent 测试的可重现失败

本项目整理（非上游原文）

适用场景：候选人说测试保障了 Agent 可靠性。
核验重点：确定性工具测试与真实模型行为评估分开；关注任务成功、错误副作用和轨迹中的失败环节。
可追问方向：问一次线上失败如何变成回归样本，再追问模型更新后怎样判断退化。
浅层信号：只有 mock 通过或展示成功案例，可问真实模型与故障路径的覆盖。
避免预设：不预设每次正确执行必须走同一轨迹；固定输出断言不能替代任务结果与副作用检查。
