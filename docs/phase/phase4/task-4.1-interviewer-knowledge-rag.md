# Task 4.1：面试官知识 RAG

[返回 Phase 4](README.md)

## 目标

让 Interview Agent 在提问前能检索到与候选人刚提到的机制、指标或决策相关的核验要点，把 Phase 3.1 的静态 playbook 注入升级为按需检索，并把检索过程作为可展示、可评测的技术链路。

## 知识库内容

三类文档，全部为仓库内 Markdown，由 Git 跟踪，可审计：

| 类别 | 目录 | 内容 | 粒度 |
| --- | --- | --- | --- |
| 追问策略 | `skills/*/` | 3.1 的四类 playbook，拆为“回避模式 → 追问方向”的条目 | 每条 100–300 字 |
| 能力词典 | `knowledge/competencies/` | 按领域列出常见能力项、其可验证信号、常见夸大方式 | 每能力一条 |
| 方案取舍卡 | `knowledge/tradeoffs/` | 常见技术方案的关键取舍点与追问方向，如 RRF vs 加权融合、reranker 位置、幂等键、状态机持久化 | 每方案一条 |

每条文档带 frontmatter：`kind`、`domains`、`fieldKinds`、`depthLevels`。初始规模控制在 300 条以内，先覆盖软件与 AI 应用工程领域，后续按真实 Session 中出现的机制词补充。

## 索引与检索

- 嵌入：通过现有 `openai_compatible` Provider 的 embeddings 接口，模型由 `LLM_EMBEDDING_MODEL` 配置；未配置时检索工具不可用，Agent 退回 3.1 静态注入，健康接口标明；
- 存储：`node:sqlite` 新表 `knowledge_chunks(id, kind, domains, field_kinds, depth_levels, text, embedding BLOB, source_path, content_hash)`；启动时按 `content_hash` 增量重建；
- 检索：纯 JS 余弦相似度加元数据过滤，先按 `fieldKinds` 与 `depthLevels` 过滤再排序，返回 Top-3；300 条规模下单次检索目标 < 20ms；
- 查询构造：由 Interview Agent 显式调用，不由系统隐式拼接，保持 Agent 是主驾驶。

## Agent 工具

Interview Agent 新增工具：

```ts
retrieve_probe_knowledge({
  query: string;          // 候选人原话中的机制/指标/决策短语，或 Agent 的调查意图
  fieldKind?: FieldKind;
  targetDepth?: 1 | 2 | 3 | 4 | 5;
}) → { hits: Array<{ id, kind, text, score }> }
```

约束：

- 每轮最多调用两次；
- 工具结果只能用于构造问题，`ask_candidate` 新增可选 `knowledgeIds: string[]` 记录引用了哪些命中；
- prompt 明确：命中内容是提问参考，不得作为对候选人的事实假设，问题里不得出现“通常应该”“标准做法是”类预设。

## 追踪

复用统一 Trace/Span：查询嵌入与本地检索分别计时（<20ms 仅指本地检索）；记录不可用、失败和降级状态。Telemetry 新增 `retrieval` span：查询、过滤条件、命中 ID 与分数、耗时、是否被 `ask_candidate` 引用。技术视图展示本轮检索与引用关系。

## 评测

- 冻结查询集：从 Phase 1–3 真实 Session 与固定 Profile 中抽取 100 条候选人机制短语，人工标注期望命中的知识条目；
- 指标：Top-1 / Top-3 命中率、无关命中率、平均耗时；
- 对比实验：相同 frozen State 下，有检索与无检索两种配置的 Interview Agent 输出，由人工 Rubric 评“追问是否针对该机制的关键取舍”；
- Gate：Top-3 命中率 ≥ 85%；有检索配置的追问针对性均分不低于无检索配置；Critical 为 0。

## 验收

- 知识库 300 条内，启动增量重建 < 5s；
- 检索工具在未配置嵌入模型时明确不可用，不静默退化；
- 每次命中在 Trace 与技术视图可见；
- 检索内容不出现在任何 Evidence 的 `sourceQuote` 或 `statement` 中，由完整性校验保证。
