# Phase 2：真实输入、上下文解耦与候选人评估报告

[返回 Phase 索引](../README.md)

**状态：Completed — Task 2.4 发布 Gate 已通过，可发布 `v0.1.0` 本地 Demo**

## 业务目标

把 Phase 1 已验证的 Interview Agent 接到真实候选人和真实岗位输入上，最终交付一份招聘方可读、客观、维度完整、建议可执行的候选人评估报告。

比赛的 `30 / 30 / 20 / 20` 是评委对整个系统的评分标准，不属于候选人报告内容。产品不能输出系统自评分，也不能把技术实现、Prompt、RAG 或拟人度混入候选人评价。

## Task 划分

| Task | 状态 | 交付 |
| --- | --- | --- |
| 2.1 候选人/JD Intake 与上传回填 | Completed | 普通填写、可选 Resume/JD 上传、结构化确认 |
| 2.2 Session Role 与 Agent 上下文解耦 | Completed | 移除固定岗位和固定候选人语义，问题只读取当前 Session |
| 2.3 候选人评估报告 | Completed | 客观、完整、可追溯且可指导招聘决策的 JSON/Markdown 报告 |
| 2.4 真实端到端发布 Gate | Completed | 三类真实输入与三类候选人行为通过真实模型、恢复和报告 Gate |

## Task 2.1：候选人/JD Intake 与上传回填

**状态：Completed。**

- 候选人普通填写只包含姓名、技能和 `Project[]`；至少一个项目，每个项目只要求名称和一段项目经历；
- JD 整体可选；一旦填写，岗位、岗位介绍、职责和要求四块必须完整；
- 文本文件、Markdown 和文本型 PDF 在浏览器内一次性解析并回填表单；
- 用户确认或修正后，只提交结构化 `InterviewIntake`；
- Server 不接收、不保存上传文件、文件名或 Resume/JD 全文；
- 每段项目经历生成一条初始为 `unverified` 的 `candidate_input` Claim，不能直接成为 Evidence；
- Session 创建不调用额外 LLM 拆分项目角色、技术或成果。

上传解析只是便捷预填，不是权威 Parser。扫描 PDF、OCR 和复杂版式识别不在当前范围。

## Task 2.2：Session Role 与 Agent 上下文解耦

**状态：Completed。**

- 生产 Session 不再加载固定 `llm_engineer` Role；结构化 JD 生成当前 Session 的 `InterviewRole`；
- 未提供 JD 时使用明确标记的通用 Role，不暗中注入工程师岗位或固定技术栈；
- Candidate、Project、Role、Competency 和 Report 全部属于当前 Session；
- Report Agent 只读取当前 Project 的紧凑投影；Interview Agent 读取跨项目索引、当前 Report、最近对话和完成阻塞项；
- 问题采用跨岗位的个人贡献、方法与决策、结果与验证、问题解决语义；
- 旧 Session 读取时迁移为兼容 Role/Intake。

Report 目前仍使用四个跨岗位通用调查字段。由不同 Role Pack 定义 required/optional field 属于后续增强，不阻塞当前闭环。

## Task 2.3：候选人评估报告

**状态：Completed。**

### 设计目标

评委会从“是否客观、维度是否全面、建议是否具有指导意义”评价报告质量。因此报告直接围绕这三件事设计，而不是把这三个词做成一张系统自评分表。

### 客观

- 每个非 missing 结论必须链接 Evidence ID、Turn ID、原问题和候选人逐字 Answer Quote；
- 候选人填写的技能和项目经历只是待核验输入，不自动成为已证明能力；
- missing 表示没有足够信息，不能解释为能力不足；
- weak、contradicted 和 supported 分开呈现；
- 完整性检查覆盖 `Field → Evidence → Turn → Answer Quote`、项目归属和 contradiction 引用。

### 维度完整

报告包含：

1. 候选人、岗位和评估范围；
2. 综合判断与建议；
3. 已验证优势；
4. 风险与关注项；
5. 证据缺口；
6. 招聘方下一步建议；
7. 按项目展开的职责边界、方法与决策、结果与验证、问题解决；
8. 原问题、候选人原话和 Evidence 判断；
9. 矛盾记录；
10. 评估依据、报告边界和完整性结果。

当前通用字段不是逐条 JD 要求匹配。报告会明确这个限制，不伪造岗位匹配结论。

### 建议具有指导意义

综合建议只允许四种状态：

```text
insufficient_evidence       证据不足，暂不判断
continue_process            可进入下一招聘环节
continue_with_verification  可继续流程，但需定向核验
hold_for_clarification      暂缓判断，先澄清冲突
```

每个 missing、weak 或 contradicted 维度都生成具体下一步：要求补充什么事实、个人动作、判断依据、可验证结果，或者如何澄清冲突。报告不给候选人编造分数，也不在证据不足时直接给出录用或淘汰结论。

### API 与 UI

```text
GET /api/interviews/:id/report
  → report
  → markdown
```

JSON 只包含 Candidate Report；Markdown 是同一份报告的人类可读渲染。面试草稿、进行中和完成状态均可下载当前报告。

### 验收

- API 响应经过可执行 Schema 校验；
- 非 missing 结论全部能回到逐字回答；
- 篡改 Answer 导致 Quote 失去来源时，完整性校验失败；
- 未决字段全部生成具体核验建议；
- missing 不被写成候选人能力失败；
- 导出结果不存在 System Scorecard、技术实现分或系统自评分。

## Task 2.4：真实端到端发布 Gate

**状态：Completed。** 结果见 [Task 2.4 发布 Gate](task-2.4-release-gate.md)。

### 目标

证明 `结构化输入 → Session Role → Interview → Candidate Report → 导出` 是可恢复、可审计、质量不退化的完整产品流程，并让评委评分要求有真实证据支撑。

### 验证内容

- 三份真实结构的固定 Resume/JD：单项目、多项目和信息缺失；
- strong、weak、contradictory 三类候选人行为；
- 页面刷新、Server 重启、Answer 幂等重放、Provider 单次重试和 Report 导出；
- Phase 1 Critical/Major Gate 回归；
- 人工评价追问是否能识别能力边界；
- 人工评价报告是否客观、完整、建议可执行；
- 人工评价交互的自然度、职业感和情商；
- 用 Trace、Token、Context、Session 恢复和上下文切片证明技术实现，不在候选人报告中展示技术自评分。

### 验收

- 三类候选人与三类真实输入全链路通过；
- Critical grounding、引用、数据隔离和 contradiction 状态错误为 0；
- Candidate Report 全部可追溯，JSON/Markdown 可下载；
- 人工评审没有阻塞性的追问、报告或交互问题；
- 形成明确 Go/No-Go 和剩余风险清单。

## Phase 退出标准

- Task 2.4 发布 Gate 通过；
- Candidate Report 的 Schema 和建议口径稳定；
- 产品流程可在进程重启和 Provider 可重试失败后继续；
- 比赛评分材料与真实运行链路一致，不在产品报告内自评。

以上退出标准已满足。Phase 2 的发布结论为 `v0.1.0` 本地 Demo **Go**；公开多租户服务不在本次发布范围。

## 明确不做

当前不建设系统自评分、候选人总分、OCR、复杂 PDF 模板、LLM-as-judge 或第二套严格 Field 提取模式。只有真实 Gate 证明必要后再增加复杂度。
