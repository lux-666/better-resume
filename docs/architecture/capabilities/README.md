# 能力建设 Map

[返回架构 Map](../README.md)

本板块按产品能力而不是代码目录观察系统。每个方向只记录当前可验证事实、稳定目标和下一验收点，不保留开发过程或废弃方案。

## 状态定义

| 状态 | 含义 |
| --- | --- |
| `运行闭环` | 目标路径端到端可运行，并有自动或人工验证 |
| `局部闭环` | 受限场景可运行，关键主链仍有明确缺口 |
| `基础就绪` | 数据结构或边界契约存在，但没有进入产品主链 |
| `未建设` | 产品仍使用 Fixture、常量或不存在该入口 |

## 当前能力面

| 方向 | 状态 | 已有可验证能力 | 下一验收点 |
| --- | --- | --- | --- |
| [Agent 持续对话](agent-conversation.md) | `基础就绪` | Pi Agent 入口、只读状态工具、Evidence 输出校验 | 一个 Session 经真实模型完成 6–10 轮，并可在进程重启后继续 |
| [胜任力与证据](competency-and-evidence.md) | `局部闭环` | 8 个能力维度、Evidence 链、score/confidence、固定闭环 | Role Pack 的行为锚点和证据要求真正驱动评分与停止条件 |
| [Interview Policy 与 Skills](interview-policy-and-skills.md) | `局部闭环` | Project/Topic/Gap 路由、Trace、两轮 Ownership→Metric | 三个核心 Skill 与矛盾、Scenario、多 Project 路由通过回归 |
| [简历理解](resume-understanding.md) | `未建设` | 固定 Candidate Fixture | 一份真实简历稳定生成可审阅的 Project、Claim、Topic 和 Gap |
| [产品 Session](product-session.md) | `局部闭环` | Web、HTTP、SQLite、实时上下文面板 | 重载恢复、命令幂等和 Provider 失败恢复通过集成测试 |
| [Evaluation 与真人准入](evaluation-readiness.md) | `基础就绪` | 4 个自动测试、构建检查、固定答案走查 | 模型语义回归和 HTTP 恢复测试通过后开放小样本真人测试 |

## 能力依赖

```text
Role Pack ───────────────┐
                        ├─► InterviewState ─► Policy ─► Skill ─► Question
Resume Understanding ───┘          ▲                         │
                                   │                         ▼
                            Validated Evidence ◄──── Agent Conversation
                                   │
                                   ├─► Competency / Claim / Gap update
                                   └─► Trace + SQLite + UI + Evaluation
```

胜任力契约必须先于模型 Prompt 稳定；否则 Agent 只能改善语言流畅度，不能改善评估有效性。持续对话与简历理解都向同一个 InterviewState 提供输入，不能各自维护第二份候选人事实。

## 当前构建顺序

1. 补全一个 Role Pack 的行为锚点、证据要求和覆盖阈值；
2. 将 Pi Extraction 与 Question Generation 接入 Answer 主链；
3. 从持久化 Turn、Evidence 和 Trace 重建选择性对话上下文；
4. 接入真实简历到 CandidateProfile 的受控转换；
5. 用模型语义回归、HTTP 恢复测试和小样本真人测试验证整体闭环。

这里不引入 Multi-Agent。当前目标是一个 Interview Agent 与一个候选人在一个可恢复 Session 中持续交流。
