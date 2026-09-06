---
id: "interview-bagu-ai-agent-q07-react"
kind: "competency"
domains: ["ai_engineering", "agent"]
fieldKinds: ["mechanism", "ownership"]
depthLevels: [1, 2, 3, 4, 5]
sourceUrl: "https://github.com/xyma2003/interview-bagu/blob/06a0473e5520eba7dcb75d6f417b9f715582fca6/ai-agent/ai_agent.md#q7-什么是-react-模式它如何让-agent-更可控"
sourceCommit: "06a0473e5520eba7dcb75d6f417b9f715582fca6"
sourceTitle: "AI Agent 开发面试八股题库 · Q7"
originalQuestion: "什么是 ReAct 模式？它如何让 Agent 更可控？"
sourceFocus: "ReAct 循环的 Thought/Action/Observation 三要素；与 Function Calling 的层次关系；如何设计 tool description 提升工具调用准确率。"
---

# ReAct 循环的停止与纠错

本项目整理（非上游原文）

适用场景：候选人实现了工具调用和观察循环。
核验重点：一次行动的结果怎样影响下一步；工具失败、重复行动与结束条件在哪里处理。
可追问方向：让其展开一次失败工具调用后的路径，再追问为何重试、换工具或停止。
浅层信号：只复述思考、行动、观察，可追问一个实际循环的输入和终止原因。
避免预设：不预设循环越多越聪明；Function Calling 能力本身不等于完整调度循环。
