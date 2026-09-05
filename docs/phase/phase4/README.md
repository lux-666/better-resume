# Phase 4：面试官知识 RAG、长文本记忆与产品化

[返回 Phase 索引](../README.md)

**状态：Planned。前置条件：Phase 3 退出标准达成。**

## 业务目标

Phase 3 之后系统能探测能力边界并写出可读报告，但两项能力仍然缺失并且在文档中被明确否认：检索增强与长文本记忆。Phase 4 以“对追问深度真实有帮助”为唯一取舍标准交付这两项，同时把四个通用调查字段升级为按岗位要求生成的调查计划，使报告能给出逐条岗位匹配结论。

Phase 4 结束后，文档才允许声称系统结合了 RAG 与长文本记忆。

## 设计原则

- **RAG 服务面试官，不服务候选人画像。** 检索的是追问策略、领域能力词典和技术方案的关键取舍点，目的是让 Agent 问出更准的核验问题；不建立候选人跨 Session 的画像库。
- **记忆是派生物，不是第二份事实。** 摘要与向量索引都从 `InterviewState` 重建，State 是唯一权威；任何记忆内容进入模型上下文前都能指回 turn 或 Evidence。
- **检索结果是线索，不是证据。** 检索到的知识只能生成问题，不能生成 Evidence；Evidence 仍必须逐字来自候选人回答。
- **每次检索可解释。** 技术视图展示查询、命中片段、相似度与最终是否被 Agent 引用。

运行体验目标：复用 Phase 3 的 Trace/Span 与进度通道覆盖检索、记忆、Role Pack、索引和备用模型；统一聚合端到端性能与运行质量。

## Tasks

| Task | 状态 | 依赖 | 交付结果 |
| --- | --- | --- | --- |
| [4.1 面试官知识 RAG](task-4.1-interviewer-knowledge-rag.md) | Planned | 3.1 | 策略库与能力词典索引、`retrieve_probe_knowledge` 工具、命中追踪与准确率评测 |
| [4.2 长文本记忆](task-4.2-long-context-memory.md) | Planned | 3.1 | 滚动摘要、对话与 Evidence 语义索引、`recall` 工具、15 轮长程 Profile |
| [4.3 Role Pack 与简历全文](task-4.3-role-pack-and-resume.md) | Planned | 4.1 | JD 逐条要求映射、按岗位生成调查字段、可选简历全文索引、岗位匹配矩阵 |
| [4.4 产品化与稳定性](task-4.4-productization.md) | Planned | 4.1–4.3 | 备用模型降级、账户与 Session 归属、并发与延迟指标、发布 Gate |

执行顺序：

```text
4.1 面试官知识 RAG      索引与检索基础设施先落地，同时服务 4.2 与 4.3
4.2 长文本记忆          复用同一嵌入与索引层
4.3 Role Pack 与简历    依赖检索层做要求匹配
4.4 产品化              收口
```

## 关键边界

- 嵌入模型与向量存储必须能在本地单进程运行，默认方案是 `node:sqlite` 加纯 JS 余弦检索，规模上限在 4.1 冻结；外部向量库只作为可选 Provider；
- 简历全文索引必须由候选人显式同意，Session 结束后可删除，不进入任何跨 Session 结构；
- 记忆与检索内容不进入 Evidence 的 `sourceQuote`，完整性校验不变；
- 所有新工具的失败不能静默降级：检索失败时 Agent 收到明确错误并继续无检索提问，Trace 记录失败；
- 不做 LLM-as-judge 替代人工 Rubric；自动评测只覆盖可确定性判定的指标。

## Phase 退出标准

- 四类追问策略与能力词典的检索在冻结查询集上 Top-3 命中率 ≥ 85%；
- 15 轮长程 Profile 在有记忆与无记忆两种配置下对比，有记忆配置的跨项目一致性矛盾检出与线索跟进率显著更高，且 Critical 为 0；
- 至少两个真实 JD 的 Role Pack 生成调查字段并完成端到端面试，报告输出逐条要求匹配矩阵；
- 备用模型降级在故障注入下不产生重复 Evidence 或部分 State 变化；
- 人工 Rubric 全部项目不低于 Phase 3 基线；
- `npm test`、typecheck、build 通过。
