---
id: "interview-bagu-ai-agent-q14-function-calling"
kind: "competency"
domains: ["ai_engineering", "agent", "tool_use"]
fieldKinds: ["mechanism", "ownership"]
depthLevels: [1, 2, 3, 4, 5]
sourceUrl: "https://github.com/xyma2003/interview-bagu/blob/06a0473e5520eba7dcb75d6f417b9f715582fca6/ai-agent/ai_agent.md#q14-什么是-function-calling它的工作原理是什么如何设计高质量的-tool-description"
sourceCommit: "06a0473e5520eba7dcb75d6f417b9f715582fca6"
sourceTitle: "AI Agent 开发面试八股题库 · Q14"
originalQuestion: "什么是 Function Calling？它的工作原理是什么？如何设计高质量的 Tool Description？"
sourceFocus: "Function Calling 的通信流程；并行工具调用（Parallel Tool Use）；Tool description 对调用准确率的影响。"
---

# 工具调用的参数与执行边界

本项目整理（非上游原文）

适用场景：候选人设计过 Function Calling 工具。
核验重点：模型输出调用意图和参数，应用执行后返回结果；描述、参数约束及错误反馈影响调用质量。
可追问方向：问一次选错工具或参数错误如何被发现，再追问如何修改描述或执行约束。
浅层信号：只说模型能自动调接口，可要求展开一次完整请求和结果回传。
避免预设：不预设 schema 合法就语义正确；并行调用要先确认操作之间没有依赖。
