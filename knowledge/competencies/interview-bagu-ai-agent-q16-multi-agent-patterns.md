---
id: "interview-bagu-ai-agent-q16-multi-agent-patterns"
kind: "competency"
domains: ["ai_engineering", "agent", "architecture"]
fieldKinds: ["mechanism", "ownership"]
depthLevels: [1, 2, 3, 4, 5]
sourceUrl: "https://github.com/xyma2003/interview-bagu/blob/06a0473e5520eba7dcb75d6f417b9f715582fca6/ai-agent/ai_agent.md#q16-多-agent-协作有哪些主要模式各自的适用场景是什么"
sourceCommit: "06a0473e5520eba7dcb75d6f417b9f715582fca6"
sourceTitle: "AI Agent 开发面试八股题库 · Q16"
originalQuestion: "多 Agent 协作有哪些主要模式？各自的适用场景是什么？"
sourceFocus: "各模式的通信机制（同步 vs 异步）；任务分解的粒度设计；Agent 间冲突解决策略。"
sourceExplanation: "多 Agent 系统是 AI Agent 岗位的高级考察点，体现候选人的系统设计能力。"
---

# 多 Agent 分工的协调代价

本项目整理（非上游原文）

适用场景：候选人将任务分给多个智能体。
核验重点：分工边界、通信结果与冲突处理是否清晰；收益要与单 Agent 或普通工作流比较。
可追问方向：问一次两个 Agent 结论冲突如何处理，再追问分工带来的成本或延迟。
浅层信号：只列编排器、工作者角色，可要求说明一个必须分工的任务依赖。
避免预设：不默认多 Agent 优于单 Agent；角色名称不等于可独立验证的职责。
