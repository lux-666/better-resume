# API、持久化、安全与观测

[返回产品板块](README.md) · [返回架构 Map](../README.md)

## HTTP API

```text
GET  /api/health                         # 包含 knowledge 状态
POST /api/knowledge/search                # {query, fieldKind?, targetDepth?}
POST /api/interviews
POST /api/interviews/:id/start
POST /api/interviews/:id/answer
GET  /api/interviews/:id/state
GET  /api/interviews/:id/report
```

`POST /api/interviews` 接收结构化 Candidate（姓名、技能、至少一个 Project）和可选结构化 Job（岗位、岗位介绍、职责、要求）。上传文件在浏览器回填后即丢弃，API 不接收文件或原始文档。State/Step 响应包含会话级 `InterviewIntake`、`InterviewRole`、显式 Runtime、Candidate Report 进度、当前问题与 DecisionTrace。`coveragePercent` 由非 missing Report field 与当前 Session Role 的核心 Competency 共同计算；轮数单独展示。

`GET /api/interviews/:id/report` 从当前持久化 State 生成 Candidate Report 和 Markdown，不额外调用模型。报告包含综合判断、优势、关注项、证据缺口和招聘方下一步建议；完整性校验要求结论能够沿 `Field → Evidence → Turn → Answer Quote` 追溯。接口不输出系统自评分。

## Answer 事务

```text
validate command
  → persist pending raw Answer and lease
  → read_report + edit_report
  → Core applies grounded Evidence edit
  → read_report + ask_candidate | finish_interview
  → Core validates decision
  → atomically persist State and completed Command
```

`commandId` 提供幂等重放，`questionId` 拒绝旧问题，`expectedStateVersion` 防止旧状态覆盖。Provider 失败时保留 pending Answer、释放租约，不保存内存中的部分 edit。

## SQLite

`sessions` 保存完整 InterviewState，包括结构化 Candidate、结构化 Job 与会话级 Role；不保存上传文件、文件名或原始 Resume/JD 文本。`answer_commands` 保存幂等键、原始 Answer、状态、响应和过期租约。成功 Answer 时两者在同一事务提交。

## 安全边界

- Candidate Input 与模型输出均不可信；
- `edit_report` 的 Field/Claim ID、Competency、数值和 Quote 全部校验；
- `ask_candidate` 的 Field ID、问题格式、重复和内部术语全部校验；
- Agent 无 Shell、文件写入或任意网络工具；
- Provider Key 只存在于服务端；
- 配置 LLM 后失败返回错误，不退回 Demo。

## 观测

每个 DecisionTrace 记录 action、targetFieldId、reason、问题和 Evidence/Decision 模型调用的来源、延迟与重试数。独立 telemetry_traces 已保存执行与失败 Span。Phase 3 补齐生命周期、实时进度、统一聚合与恢复；遥测独立于业务 State，业务提交才决定执行成功。


## 本地知识索引

应用从 GitHub 下载后在本机运行，不引入联网服务账户。已有 Session 数据持续存入 SQLite；历史列表/删除入口属于 Phase 4.4。

`knowledge_chunks` 保存可重建的公共知识卡片、来源、元数据、完整文件与语义输入哈希、embedding 模型指纹及 Float64 BLOB。上游原题、考察点、URL/commit 单独保存在 `source_metadata`，随命中写入 Trace；URL/commit 不参与 embedding。来源变化更新元数据，语义输入变化才重建向量。启动后台索引期间或失败时提供静态追问策略，健康接口区分 unconfigured/indexing/ready/failed。只有完整索引事务提交后才可检索；失败不影响 Session 或已接受 Evidence。

技术视图同时显示当前索引状态和所选执行的历史 retrieval/embedding Span。命中快照保存在 Trace；知识 ID 引用保存在已接受 Decision 中，后续卡片变更不改变旧 Trace 的命中文本。
