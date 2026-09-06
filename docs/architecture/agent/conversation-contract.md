# 会话与工具契约

[返回 Agent 板块](README.md) · [返回架构 Map](../README.md)

## 目标

Interview Agent 每一步读取当前 Candidate Report 和最近对话，判断 Report 最缺什么或上一轮暴露了什么高价值线索，然后自主提问或请求结束。

## 工具循环

```text
start:
  read_report (compact interview view) → ask_candidate | finish_interview

answer:
  read_report (active-project view) → edit_report
  read_report (compact interview view) → ask_candidate | finish_interview
```

工具职责：

- `read_report`：工具名保持不变，但视图按 consumer 切分。两个视图都包含当前 Session 的 Role 来源；Report Agent 只读取当前 Project 的描述、Claim、Report field、grounded Evidence 和相关矛盾；Interview Agent 额外读取候选人技能、全局轻量字段索引和当前焦点 Project 描述，不包含姓名、全量 Evidence 历史和 `sourceQuote`。旧 Project 上的角色、技术和成果字段不进入两个 Agent 投影。
- `edit_report`：提交本轮 Answer 的结构化 Evidence edit；模型不能直接改 State。
- `retrieve_probe_knowledge`：Interview Agent 主动构造查询，按字段类型/深度检索最多三张公共知识卡；每轮最多两次，预算跨 Provider 重试共享。失败返回静态策略，不进入 Report Agent 上下文。
- `ask_candidate`：选择一个 Report field，并提交一个候选人可见问题。
- `finish_interview`：请求结束；Completion Validator 可返回 blockers，Agent 随后必须继续调查。

LLM 模式没有 `Gap → Lead → Probe → Question` 调度器。某个具体方法、决策或约束是否值得继续纵向深入，是 Agent 基于轻量调查索引、最近 Answer 和预期信息价值做的即时判断，不持久化为 reasoning 状态。Project 是一级切片边界，Report field 是项目内的焦点；只追加原话线索和已接受 Decision 的线索引用；跟进与未展开状态派生，不复制 Lead/Probe 路由状态。

## 当前输入边界

- 问题只能依据当前 Session 的 Role、JD、候选人技能、项目经历和已产生 Answer；
- `role.source = generic` 时不得假设存在未提交的 Job Description；
- 不得补入默认岗位、职级、雇主、教育经历或技术栈；
- 候选人资料与 Candidate Input Claim 只是调查线索，不能直接作为 Evidence；
- 测试用企业 RAG、客服 Agent 与 `llm_application_engineer` Fixture 不进入生产 Server。

## Report edit

```json
{
  "answerDisposition": "substantive",
  "evidence": [{
    "reportFieldIds": ["project_enterprise_rag:mechanism"],
    "claimIds": [],
    "competencyId": "rag_engineering",
    "statement": "候选人说明使用 BM25 与 dense 召回后通过 RRF 融合。",
    "polarity": "support",
    "strength": 0.8,
    "specificity": 0.9,
    "evaluatorConfidence": 0.8,
    "sourceQuote": "BM25 和 embedding 各召回 50 条，然后通过 RRF 融合"
  }]
}
```

约束：

- `reportFieldIds` 和 `claimIds` 必须属于当前 Project 上下文；
- Evidence Competency 必须与目标 Report field 一致；
- `sourceQuote` 必须逐字存在于当前 Answer；
- vague 只能产生 weakness，irrelevant 不得产生 Evidence；
- denial/contradiction 必须包含 Claim-linked invalidate Evidence；
- 一个 Answer 可以同时更新多个 Report field。

## 调查决策

`ask_candidate` 同时包含 `targetFieldId`、`reason`、可选中性 acknowledgement 和 question。Agent 可以调查 missing/weak field、澄清矛盾，也可以沿上一轮新出现的方法、决策、约束、问题或结果继续深挖，即使目标字段已得到初步支持。每个 question 只能索取一个事实、决策、原因、方法或结果，不得把职责、决策、交付、指标和原因拼成一个复合问题。

`finish_interview` 不具有最终决定权。Core 检查重要字段、每个核心 Project 的 Evidence、未解决矛盾、Evidence grounding 和硬上限。

## 上下文与持久化

InterviewState 是唯一权威状态。模型上下文每次从 Report、Turns 和 Evidence 重建；不保存第二份模型记忆。Report Agent 获得当前 Project 的完整 Evidence 切片，Interview Agent 只获得跨 Project 的轻量索引与一个焦点 Project，两个投影不共用同一个大对象。Answer Command 在 Provider 调用前持久化，成功的 Report edit 与下一 Decision 原子提交。


## 知识与 Evidence 边界

检索结果只提供追问角度，不能成为关于候选人的事实假设。`ask_candidate.knowledgeIds` 仅能引用当前尝试真正命中的卡片；接受后记录到 DecisionTrace，并标记 retrieval Span 的引用关系。检索查询由 Agent 显式提供，不在系统中按候选人内容自动生成。

Report Agent 不获得知识卡片或检索工具。其 Evidence 仍必须有当前 Answer 的原文来源，不能把题库内容复制成候选人回答；共享术语本身不构成污染，是否忠实描述回答仍由原有事实与报告质量约束检查。

命中 `text` 为本项目整理的原子化核验卡，`source` 为上游素材。Agent 先检查适用场景，选一个核验方向并遵守避免预设说明；原题不是可照抄的下一问，浅层信号不是对候选人的能力结论。
