---
id: "interview-bagu-ai-agent-q18-streaming"
kind: "competency"
domains: ["ai_engineering", "frontend", "backend", "performance"]
fieldKinds: ["mechanism", "ownership", "failure"]
depthLevels: [1, 2, 3, 4, 5]
sourceUrl: "https://github.com/xyma2003/interview-bagu/blob/06a0473e5520eba7dcb75d6f417b9f715582fca6/ai-agent/ai_agent.md#q18-如何实现-llm-流式输出streamingsse-和-websocket-怎么选择"
sourceCommit: "06a0473e5520eba7dcb75d6f417b9f715582fca6"
sourceTitle: "AI Agent 开发面试八股题库 · Q18"
originalQuestion: "如何实现 LLM 流式输出（Streaming）？SSE 和 WebSocket 怎么选择？"
sourceFocus: "SSE 的实现（Content-Type: text/event-stream，data: 格式）；前端 EventSource API 的使用；流式中断处理（用户取消）。"
---

# 流式响应的断连与取消

本项目整理（非上游原文）

适用场景：候选人实现 SSE 或 WebSocket 输出。
核验重点：区分网络断连、用户取消和服务端任务结束；重连时需要明确事件顺序与重复处理。
可追问方向：问浏览器断开后模型请求是否仍运行，再追问继续读取或主动取消的实现。
浅层信号：只展示逐字输出，可问流中途失败时用户看到什么以及如何恢复。
避免预设：不把断开连接等同业务回滚；也不假设所有客户端的事件流都由原生 EventSource 接收。
