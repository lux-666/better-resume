# API、持久化、安全与观测

[返回产品板块](README.md) · [返回架构 Map](../README.md)

## HTTP API

```text
GET  /api/health                         # 包含 knowledge 状态
POST /api/knowledge/search                # {query, fieldKind?, targetDepth?}
POST /api/interviews                    # 可选 resume:{consent:true,text}、timeBudgetMinutes
GET  /api/interviews                    # 数据库历史
GET  /api/interviews/:id/export
DELETE /api/interviews/:id
DELETE /api/interviews/:id/resume-index
GET  /api/metrics
POST /api/interviews/:id/start
POST /api/interviews/:id/answer
GET  /api/interviews/:id/state
GET  /api/interviews/:id/report
```

`POST /api/interviews` 接收结构化 Candidate（姓名、技能、至少一个 Project）和可选结构化 Job（岗位、岗位介绍、职责、要求）。文件在浏览器提取；API 不接收原始文件。默认只上传回填字段，显式 resume.consent=true 才上传提取全文用于本会话检索。State/Step 响应包含会话级 `InterviewIntake`、`InterviewRole`、显式 Runtime、Candidate Report 进度、当前问题与 DecisionTrace。`coveragePercent` 由非 missing Report field 与当前 Session Role 的核心 Competency 共同计算；轮数单独展示。

`GET /api/interviews/:id/report` 从当前持久化 State 确定性生成 Candidate Report 和 Markdown；已结束面试会异步生成有引用约束的叙述层。报告包含综合判断、优势、关注项、证据缺口和招聘方下一步建议；完整性校验要求结论能够沿 `Field → Evidence → Turn → Answer Quote` 追溯。接口不输出系统自评分。

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

`sessions` 保存完整 InterviewState，包括结构化 Candidate、结构化 Job 与会话级 Role；不保存上传文件或文件名。简历全文在 consent=true 时保存在 session_documents，向量、哈希和模型指纹在 session_chunks；全文不直接进入 State，引用过的未验证简历 Claim 可随回答核验留存。`answer_commands` 保存幂等键、原始 Answer、状态、响应和过期租约。成功 Answer 时两者在同一事务提交。

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

应用从 GitHub 下载后在本机运行，不引入联网服务账户。已有 Session 数据持续存入 SQLite；历史列表、打开/继续、导出/删除已接通数据库，浏览器缓存只记录最近打开的会话。

`knowledge_chunks` 保存可重建的公共知识卡片、来源、元数据、完整文件与语义输入哈希、embedding 模型指纹及 Float64 BLOB。上游原题、考察点、URL/commit 单独保存在 `source_metadata`，随命中写入 Trace；URL/commit 不参与 embedding。来源变化更新元数据，语义输入变化才重建向量。启动后台索引期间或失败时提供静态追问策略，健康接口区分 unconfigured/indexing/ready/failed。只有完整索引事务提交后才可检索；失败不影响 Session 或已接受 Evidence。

技术视图同时显示当前索引状态和所选执行的历史 retrieval/embedding Span。命中快照保存在 Trace；知识 ID 引用保存在已接受 Decision 中，后续卡片变更不改变旧 Trace 的命中文本。

## 会话记忆与岗位调查

`memory.summary` 是 1500 字符内的确定性原话摘录，来源为当前 State。两个 Agent 可按需 recall，先读取 Report，每轮各最多两次（跨重试与备用模型共享预算）。会话向量仅作缓存；正文从本次 State 投影，不能使用未提交结果构造事实。跨项目纠正默认不限定 projectId。

提供 JD 时创建 Role Pack，逐条保留要求原文并冻结字段与能力映射；失败会在草稿、页面与报告中明确说明使用通用调查。`requirementMatrix` 从 Field/Evidence 确定性派生，冲突优先，must 冲突不允许直接进入下一招聘环节。Role Pack 和检索信息都不是 Evidence。

本地历史默认不失效。删除前拒绝活动回答/创建，取消叙述任务，再事务清理会话及派生表。会话 JSON 是查阅格式，数据库完整恢复通过 SQLite backup；见根 README。
