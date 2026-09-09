# 系统架构

## 边界与事实来源

| 位置 | 职责 |
| --- | --- |
| `apps/web` | 输入校对、问答、报告、历史与技术视图 |
| `apps/server` | HTTP、模型调用编排、SQLite、命令恢复与检索 |
| `packages/interview-core` | InterviewState、Evidence、报告派生与确定性护栏 |
| `packages/pi-runtime` | 两类 Agent 的上下文、工具和输出校验 |
| `packages/api-contract` | 可执行 HTTP Schema 与遥测契约 |
| `knowledge/cards.json` | 公共知识源；SQLite 中的知识索引可重建 |

`InterviewState` 是已接受面试事实的唯一来源。Candidate Report 是调查工作区；模型只提交提案，Core 校验后才能改变状态。公共知识、岗位映射、简历与模型叙述都不能直接成为候选人 Evidence。

## 输入与岗位

候选人表单包含姓名、技能和至少一个项目（名称、经历）；Job 整体可选，提供时包含岗位、介绍、职责、要求。上传文件在浏览器提取，支持文本、文本型 PDF 与图片 OCR；原始文件不上传。简历在客户端预填，JD 提取文本经 `/api/intake/job` 调用 Report 模型回填四项；连接中断或服务端暂时失败时最多重试一次，两次尝试共用默认 180 秒截止时间。只有完整结果才回填，失败显示具体错误类别并保留原表单，用户校对后提交。复杂版式的多项目自动分段尚无准确率基线。

每段项目经历形成初始为 `unverified` 的 `candidate_input` Claim，保留原句。无 JD 时使用通用 Role；有 JD 时创建并冻结 Role Pack，逐字保留要求非空行并映射调查字段。失败时显式降级为通用调查。每个项目仍有 `ownership / mechanism / measurement / failure` 四个通用字段；执行时读取当前会话的 Role，不读取评测 fixture。

## Agent 与提交

```text
开始：read_report → ask_candidate | finish_interview
回答：持久化 pending Answer
      → Report Agent: read_report → edit_report
      → Core 校验 Evidence
      → Interview Agent: read_report → ask_candidate | finish_interview
      → 原子提交 State 与 completed Command
```

Report Agent 读取当前项目的描述、Claim、字段、Evidence 和相关矛盾；Interview Agent 读取跨项目轻量字段索引、焦点项目、最近回答和来源摘要。两者不共用一份全量历史上下文。摘要从 State 即时派生，同一份用于输入和遥测，不另存模型记忆。

Interview Agent 自主选择项目与核验方向；Core 不使用固定问题路由器。`retrieve_probe_knowledge` 仅向 Interview Agent 提供公共追问素材，每轮最多两次；`knowledgeIds` 只能引用本次尝试实际命中的卡片。两类 Agent 均可在读取 Report 后按需 `recall` 本会话早期回答、证据或获准使用的简历，每轮各最多两次，预算跨重试及备用模型共享。检索流程见[知识库](../knowledge/README.md)。

追问校验区分独立的多个请求与单个请求中的嵌套判断，允许讨论项目本身的数据字段、评分算法和任务标记；明确的内部评分话术、诱导赞扬、重复追问及无效目标仍被拒绝。`targetDepth` 使用 1–5 的整数，语义校验失败时向 Agent 返回具体修改要求。Interview Agent 最多容许三次工具校验失败，使先修正标点、再修正问题焦点的两次调整能完成；仍受整轮截止时间约束，第三次失败后终止。

`commandId` 保证幂等重放，`questionId` 拒绝旧问题，`expectedStateVersion` 防止旧状态覆盖。Provider 失败保留待处理原始回答并释放租约，不提交半份 Evidence 或下一问题。恢复仍走同一校验与事务。

## Evidence 与护栏

Evidence 包含 Turn、Project、Report field、Claim、Competency 引用，以及 `statement / polarity / strength / specificity / evaluatorConfidence / sourceQuote`。必须满足：

- Quote 逐字来自对应回答，所有 ID 有效且项目与能力匹配；本轮 edit 只能引用当前回答。
- Raw Turn 与已接受 Evidence 只追加；Claim 与字段结论通过 Evidence 更新。
- vague 只能产生 weakness，irrelevant 不产生 Evidence；denial/contradiction 需要 Claim-linked invalidate。
- 一次回答可更新多个字段；一个问题只核验一个点，不泄露 rubric、内部字段，不重复已问问题，不把待核验 Claim 当成事实。

三种状态有不同语义：`Claim.status` 保留累计核验历史，有过 invalidate 时可继续 contradicted；`ReportField.status` 表示最近一次 accepted edit 的结论；`ReportContradiction.status` 表示说法是否仍待澄清。后续另一次回答可解决矛盾，但不删除历史反证，也不自动证明原主张为真。同一回答不能解决自己刚建立的矛盾。

正常完成检查重要字段覆盖、项目 Evidence、深度或已核验边界、未决矛盾与逐字引用。weak 表示已调查但证据不足，不必强行升级。候选人要求换项目时立即暂停当前项目；连续跨问题两次说不清、跳过或重复回答时也暂停。暂停项目和已饱和字段适用明确的完成例外，报告仍保留未覆盖内容和矛盾，规则由 `validateCompletion` 统一执行。

调查完成后进入开放交流，允许补充经历与反问；新经历可继续调查。明确结束或达到轮次上限才关闭。上限可设 5–50 轮、默认 15，包含开放交流。20–60 分钟时长预算只提醒，不强制结束。

## 报告

报告从已接受 State 确定性派生；结论可沿 `Field → Evidence → Turn → Answer Quote` 追溯，并检查双向引用、项目一致性及矛盾引用。结束后异步生成带引用的叙述层；生成失败保留事实报告及已有叙述。叙述不能写回 Evidence 或提升字段、岗位要求的结论。

报告输出综合评价、优势与关注项、项目分析、证据缺口、核验建议和能力提升任务；支持 JSON、Markdown、打印/PDF。没有 JD 不生成岗位匹配结论；missing 表示未充分调查，不代表能力不足。页面不输出比赛系统自评分。

雷达图使用可靠支持证据的最高展示深度，五档映射为 20/40/60/80/100；未评估与冲突不当作零分。岗位匹配按要求状态 100/60/25/0 计点，must/should/bonus 权重为 3/2/1，只对已调查要求加权，另列覆盖率与必须要求缺口。无 JD、无映射或引用校验失败不出匹配分；冲突优先，must 冲突阻止直接建议进入下一环节。这是尚未经真实招聘结果校准的规则评分。

## 持久化与观测

SQLite 保存 Session、回答命令、叙述、独立 Trace 及索引。每个数据库只运行一个 API 进程；当前产品面向本地使用，未实现公开多租户的账户所有权。

简历全文仅在 `resume.consent=true` 时进入 `session_documents` 和会话索引，不直接写入 State。经回答核验的简历 Claim 可留在会话记录。删除简历索引清除原始全文及向量，不改已接受记录。公共知识和单会话记忆共享 embedding 客户端，但检索范围与删除生命周期独立，不能混查。

删除会话时先拒绝活动回答/创建、取消叙述任务，再事务清理会话及派生表。JSON 导出含 State、回答命令、Trace 和叙述，不含独立简历全文；数据库备份含全部本地数据。备份与恢复见[启动说明](../README.md)。

关键接口：

| 接口 | 用途 |
| --- | --- |
| `GET /api/health`、`GET /api/metrics` | 索引状态、延迟、请求、错误与备用模型统计 |
| `POST /api/knowledge/search` | 公共知识检索，接受 query、fieldKind、targetDepth |
| `POST /api/intake/job` | JD 表单回填 |
| `POST /api/interviews`、`GET /api/interviews` | 创建与历史列表 |
| `POST /api/interviews/:id/start`、`POST /api/interviews/:id/answer` | 开始与回答 |
| `GET /api/interviews/:id/state`、`GET /api/interviews/:id/report` | 会话状态与报告 |
| `GET /api/interviews/:id/export` | 会话 JSON |
| `DELETE /api/interviews/:id`、`DELETE /api/interviews/:id/resume-index` | 删除会话或简历全文索引 |

Trace 独立记录模型、工具、检索、错误、重试、备用尝试与耗时；业务事务决定执行是否成功。知识命中文本是历史快照，卡片更新不改写旧 Trace。Provider Key 只在服务端；Agent 不持有 Shell、文件写入或任意网络工具。配置真实 LLM 后，模型失败返回错误，不静默切换为 Demo。
