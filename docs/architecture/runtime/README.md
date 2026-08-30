# Runtime 板块

[返回架构 Map](../README.md)

Runtime 把确定性的 `InterviewDecision` 与语言模型连接起来。代码边界是 `packages/pi-runtime`，服务端通过它执行受控的语言任务。

## 职责

- 从 Answer 提取结构化 Evidence proposal；
- 从 Policy 决策和 Skill 生成一个自然问题；
- 维护模型需要的局部对话上下文；
- 加载 Policy 已选定的 Skill 指令；
- 流式传递模型输出；
- 记录模型、Prompt 与 Schema 版本。

## 不负责

- 不选择 Project、Topic、Gap 或 Skill；
- 不给 Competency 打最终分；
- 不直接改变 Claim、Gap 或 Session 状态；
- 不写数据库；
- 不向面试 Agent 暴露 Shell、任意文件写入或任意网络访问。

## 运行关系

```text
Interview Core ── InterviewDecision ──► Pi Runtime
       ▲                                  │
       │                                  ├─ load selected Skill
       │                                  ├─ extract Evidence proposal
       │                                  └─ generate one Question
       └──── validated proposal ──────────┘
```

Pi 的输出始终是不可信 proposal。API 校验后才允许 Core 接收；Pi 从不拥有权威状态。

## 当前接入面

`createInterviewAgent` 只提供只读的 `get_interview_state` 工具，并强制顺序执行工具。`EvidenceExtractionSchema` 与 `validateEvidenceExtraction` 已实现 Schema、上下文 ID、数值范围和逐字 Quote 校验。回答接口的可运行闭环仍使用 Core 内的确定性提取器；模型提取接入该校验后才能进入 Domain。

## 细节入口

- [回答命令](answer-command.md)：一次 Answer 的序列化处理与失败边界；
- [模型契约](model-contracts.md)：模型最小上下文、结构化输出与校验规则。
