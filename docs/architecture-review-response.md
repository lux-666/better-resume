# 架构审阅答复

审阅的核心结论成立：当前提交是骨架，不是 Evidence-Driven MVP。此前 README 对 Pi 的措辞过度，现已纠正。以下决定以“先闭合价值链，再扩展架构”为准。

| # | 意见 | 决定 | 答复 |
|---|---|---|---|
| 1 | Pi Runtime 价值不清晰 | 接受 | 当前单文件适配只是 API 与工具白名单实验，不声称已集成 Session、Skill Loading 或 Compaction。暂不删除，因为产品已选择 Pi；若首个真实模型闭环仍不使用它，就删除该包。 |
| 2 | Evidence 核心循环未闭合 | 接受，P0 | 下一次开发只做 Answer → Evidence → Competency → Gap → Policy → Question 的纵切片。 |
| 3 | Hierarchical Policy 名不副实 | 部分接受 | 目前只有确定性 Policy。层级首先是控制流，不需要五个只有一个实现的类。闭环先用一个编排函数；职责发生独立变化时再拆 Controller / Router。 |
| 4 | Claim 与 Evidence 未建立关系 | 接受，P0 | 提取结果必须携带 Claim ID 与原文 `sourceQuote`，状态更新负责双向写入 Evidence ID。 |
| 5 | 动态 Topic Discovery 缺失 | 接受，P1 | 它不是首轮闭环的阻塞项。先固定两个 Topic；回答中确实出现新线索后再加入结构化 Topic Lead。 |
| 6 | Competency 更新与 Rubric 缺失 | 接受，P0 | 首版使用固定 Role JSON 和透明的基础聚合公式，并测试分数、置信度和证据引用；不提前实现贝叶斯模型。 |
| 7 | Skill 只是 Markdown | 部分接受 | 在 Pi 中 Markdown 本来就是给 Agent 执行的调查指令，不必同时复制一套 Skill 类。真正缺的是加载和路由；首个闭环只接一个 Skill，第二个 Skill 出现时再实现通用加载。 |
| 8 | RAG 缺失 | 接受现状，拒绝现在实现 | 审阅自己的建议是正确的：固定 Rubric 足够。Evidence 与 Scoring 跑通前不建 `rag/` 空目录。 |
| 9 | LLM 调用抽象缺失 | 接受问题，拒绝万能接口 | Evidence Extraction 需要可替换的结构化推理边界，但不会创建同时服务 Question、Report 等所有任务的 `generate<T>` 万能接口。先从一个真实调用点抽取最小端口。 |
| 10 | 测试不足 | 接受 | 每增加一段确定性逻辑就增加一个失败保护；不按文件数或覆盖率数字堆测试。首个闭环必须有端到端测试。 |
| 11 | API 不完整 | 接受 P0 的一半 | `start` 和 `answer` 是闭环必需。`trace` 随状态返回即可；`finish` 和 `report` 在闭环后添加，当前创建空端点没有价值。 |
| 12 | MVP 过大 | 完全接受 | [01-mvp.md](01-mvp.md) 已把 MVP 缩成一个 Profile、一个 Project、两个 Claim 和一条多轮证据链。 |
| 13 | 文档与代码不一致 | 接受 | 3400 行原文保留为完整愿景；README 和 `01-mvp.md` 成为当前状态与短期范围的事实来源。 |

## 下一步的唯一目标

[01-mvp.md](01-mvp.md) 的六条验收条件已由确定性 Demo 闭合。下一步只把关键词 Evidence 提取替换为 Pi 结构化输出；Topic Discovery、RAG、完整报告和多个 Skills 不并行推进。
