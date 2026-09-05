# Better Resume 架构 Map

## 系统目标

系统的目标不是生成下一道题，而是完成一份可信、完整、每个重要判断都能指向候选人原话的 Candidate Report。

```text
Candidate Report
  → Agent 判断当前最值得调查的内容
  → ask_candidate
  → raw Answer
  → edit_report with grounded Evidence
  → Agent 继续调查或 finish_interview
  → deterministic guardrails accept / reject
```

Agent 是主驾驶。Core 不保存 Probe、selectedProbe、saturation 或问题路由状态；可保存有原话来源的线索事实，其跟进状态由已接受 Decision 引用派生；它只保存事实工作区并执行 Evidence grounding、完成校验、问题约束、硬轮次和持久化边界。

## 系统地图

```text
Candidate UI → Application API → Interview Agent Runtime
                         ├──────→ Interview Core / Candidate Report
                         └──────→ SQLite Session
```

## 文档地图

| 板块 | 唯一职责 |
| --- | --- |
| [Agent 持续对话](agent/README.md) | Report 驱动的 Agent 工具循环与模型边界 |
| [胜任力与证据](competency/README.md) | Candidate Report、Claim、Evidence 与评分含义 |
| [Interview Guardrails](interview/README.md) | 完成校验、问题约束和硬运行边界 |
| [简历理解](resume/README.md) | Resume 到 Candidate、Claim 与初始 Report 的转换 |
| [产品 Session](product/README.md) | Web、API、SQLite、安全与可观测性 |
| [Evaluation 与真人准入](evaluation/README.md) | 自动化、模型回归与真人测试门槛 |

## 依赖方向

```text
web → server → interview-core
             → pi-runtime → interview-core types
             → SQLite
```

## 硬边界

- Raw Turn 与已接受 Evidence 只追加。
- Resume Claim 初始为 `unverified`，不能直接成为 Evidence。
- 每条 Evidence 的 `sourceQuote` 必须是对应 Answer 的原文子串。
- Evidence 只能更新已知且 Competency 匹配的 Report field。
- Agent 决定调查目标和问题；Core 不实现问题路由 Policy。
- `finish_interview` 必须经过重要字段、Project Evidence、矛盾和 grounding 校验。
- 一个问题、一个末尾问号、无 rubric 泄露、无虚假赞美。
- 15 轮硬上限强制结束。
- Demo 与 LLM 运行模式显式区分，失败不能静默降级。
