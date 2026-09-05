# Task 4.1：面试官知识 RAG

[返回 Phase 4](README.md)

**状态：20 题试用链路已实现；完整 100 条查询与人工追问 Rubric 尚待扩大验收。**

本轮范围按用户要求缩为 [20 张 AI Agent 题库卡片](../../../knowledge/README.md)，不扩成 300 条。四类既有 playbook 保留作无检索降级；策略拆条和独立 tradeoff 库留待下一批。

## 目标

让 Interview Agent 在提问前能检索到与候选人刚提到的机制、指标或决策相关的核验要点，把 Phase 3.1 的静态 playbook 注入升级为按需检索，并把检索过程作为可展示、可评测的技术链路。

## 知识库内容

三类文档，全部为仓库内 Markdown，由 Git 跟踪，可审计：

| 类别 | 目录 | 内容 | 粒度 |
| --- | --- | --- | --- |
| 追问策略 | `skills/*/` | 3.1 的四类 playbook，拆为“回避模式 → 追问方向”的条目 | 每条 100–300 字 |
| 能力词典 | `knowledge/competencies/` | 按领域列出常见能力项、其可验证信号、常见夸大方式 | 每能力一条 |
| 方案取舍卡 | `knowledge/tradeoffs/` | 常见技术方案的关键取舍点与追问方向，如 RRF vs 加权融合、reranker 位置、幂等键、状态机持久化 | 每方案一条 |

每条文档带 frontmatter：稳定 `id`、`kind`、`domains`、`fieldKinds`、`depthLevels` 与固定来源；当前读取器接受逐行 JSON 值。初始规模控制在 300 条以内，先覆盖软件与 AI 应用工程领域，后续按真实 Session 中出现的机制词补充。

## 索引与检索

- 嵌入：通过现有 `openai_compatible` Provider 的 embeddings 接口，模型由 `LLM_EMBEDDING_MODEL` 配置，支持独立 `LLM_EMBEDDING_BASE_URL` / `LLM_EMBEDDING_API_KEY`（为空时继承对话配置）；未配置时检索工具不可用，Agent 退回 3.1 静态注入，健康接口标明；
- 存储：`node:sqlite` 新表 `knowledge_chunks(id, kind, domains, field_kinds, depth_levels, text, embedding BLOB, source_path, content_hash, embedding_fingerprint)`；启动时按 `content_hash` 增量重建，更换模型/端点时全量重建，删除卡片同步清理；
- 检索：纯 JS 余弦相似度加元数据过滤，先按 `fieldKinds` 与 `depthLevels` 过滤再排序，返回 Top-3；300 条规模下单次检索目标 < 20ms；
- 查询构造：由 Interview Agent 显式调用，不由系统隐式拼接，保持 Agent 是主驾驶。

## Agent 工具

Interview Agent 新增工具：

```ts
retrieve_probe_knowledge({
  query: string;          // 候选人原话中的机制/指标/决策短语，或 Agent 的调查意图
  fieldKind?: "ownership" | "mechanism" | "measurement" | "failure";
  targetDepth?: 1 | 2 | 3 | 4 | 5;
}) → { hits: Array<{ id, kind, text, score }> }
```

约束：

- 每轮最多执行两次检索，预算跨 Provider 重试共享；第三次返回上限提示与静态策略，不调用 embedding；
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
- 检索只提供给 Interview Agent，不注入 Report Agent，也不作为 Evidence 数据源；Evidence 的 `sourceQuote` 继续逐字核验候选人 Answer。候选人自己说出的相同技术术语可以成为证据，不能按文本相似度一律排除；`statement` 语义是否忠实仍属于原有报告质量评估。


## 20 题试用结果（2026-09-05）

- 模型：`qwen3.7-text-embedding-flash`，实际向量维度 1024；20 张卡片全部建索引。
- 冻结查询：[phase4-knowledge-pilot.json](../../../data/evaluation-corpus/phase4-knowledge-pilot.json)，20 条人工编写的改写短语。不是 100 条真实 Session benchmark。
- Top-1：19/20（95%）；Top-3：20/20（100%）。
- 首次索引 384ms；无变更检查 2.6ms；本地检索均值 1.96ms、最大 2.97ms；含查询 embedding 的均值 74.94ms。本次小样本的端点时延不可视作稳定 SLA。
- `npm run eval:knowledge` 可重跑，详细结果保存在 `data/evaluations/phase4-knowledge-pilot.json`；脚本在 Top-3 < 85% 时失败。
- `npm run eval:knowledge:questions` 对三个相同 frozen State 生成有/无检索问题与 Trace；人工针对性评分不自动填写，不使用 LLM-as-judge。
- 无关命中率、100 条真实查询和人工 Rubric 尚未验收，因此不宣布完整 Task 4.1 Gate 或整个 Phase 4 完成。

### 真实 Interview 模型对照

使用当前配置的 `gpt-5.6-sol`，三个合成状态各生成一对问题；有检索侧 3/3 主动调用工具且引用相应知识卡，两个配置都通过现有问题/状态约束。下面保留问题对供人工审阅；这不等于人工 Rubric 已通过。

| 场景 | 无检索 | 有检索 |
| --- | --- | --- |
| rag | 你选择 BM25、向量检索和 reranker 这套组合的主要依据是什么？ | 在这个 RAG 模块中，你当时基于什么原因决定同时采用 BM25、向量召回和 reranker？ |
| idempotency | 你为什么选择幂等键配合 checkpoint，而不是只依赖重试或事务回滚？ | 你具体如何处理 checkpoint 已保存但订单接口实际执行状态不一致的情况？ |
| prompt-cache | 在这项优化中，你本人实际做的第一个具体改动是什么？ | 你具体怎样组织请求内容，才能让需要复用的前缀保持一致并获得缓存命中？ |

验证：`npm test` 79/79 通过，typecheck/build 通过；浏览器中已检查知识索引状态、查询/过滤、命中正文、相似度及已引用标记。
