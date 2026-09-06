---
id: "interview-bagu-ai-agent-q08-prompt-injection"
kind: "competency"
domains: ["ai_engineering", "agent", "security"]
fieldKinds: ["mechanism", "failure"]
depthLevels: [1, 2, 3, 4, 5]
sourceUrl: "https://github.com/xyma2003/interview-bagu/blob/06a0473e5520eba7dcb75d6f417b9f715582fca6/ai-agent/ai_agent.md#q8-如何设计防止-prompt-注入攻击的系统"
sourceCommit: "06a0473e5520eba7dcb75d6f417b9f715582fca6"
sourceTitle: "AI Agent 开发面试八股题库 · Q8"
originalQuestion: "如何设计防止 Prompt 注入攻击的系统？"
sourceFocus: "直接注入 vs 间接注入的区别；深度防御而非单点防护；Agent 中工具权限最小化原则。"
sourceExplanation: "Prompt 注入是 LLM 应用的重要安全问题，AI Agent 岗位会考察安全意识。"
---

# 提示注入与工具权限边界

本项目整理（非上游原文）

适用场景：候选人提到提示注入或检索文档中的恶意指令。
核验重点：区分外部数据与系统指令；工具执行权限应由应用侧控制，不能只靠模型承诺。
可追问方向：选其处理过的外部输入，问它如何到达工具调用，再追问哪一层实际阻断越权。
浅层信号：只说加一句忽略恶意提示，可追问间接注入样本和失败结果。
避免预设：不默认其已部署某种防护；关注真实权限边界，不索取候选人系统的敏感配置。
