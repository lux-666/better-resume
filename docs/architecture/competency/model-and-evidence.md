# 领域模型与 Evidence 契约

[返回胜任力板块](README.md) · [返回架构 Map](../README.md)

## 当前事实

`llm_application_engineer` Role Pack 已定义 8 个 Competency、权重和 `core` 标记。Domain 已有 Claim、Evidence、EvidenceGap、CompetencyState 与 DecisionTrace；固定闭环实际更新 `software_engineering` 和 `evaluation`。

Role 权重尚未进入评分、Policy 或停止条件。Competency 没有行为锚点、反向指标、必要证据类型和覆盖阈值；当前 scorer 是未版本化的演示算法。

## 聚合与所有权

```text
InterviewState
├── CandidateProfile
│   └── Project[]
│       ├── Claim[]
│       └── TopicThread[]
│           ├── EvidenceGap[] + ProbeCoverage
│           └── FollowUpLead[] + ProbeCoverage
├── InterviewTurn[]
├── Evidence[]
├── CompetencyState[]
├── DecisionTrace[]
├── status
└── currentQuestion
```

InterviewState 是一次面试的聚合根。`candidate.projects` 是 Project 的唯一权威集合，其他对象只通过 ID 引用。

## 核心对象

### CandidateProfile 与 Project

CandidateProfile 保存简历事实、经历、技能与 Project。Project 保存候选人角色、技术、结果、Claims、Topics、能力映射、状态和岗位相关度。

### Claim

Claim 是来自 Resume 或 Answer 的可证伪陈述，保存来源、文本、状态、相关 Competency，以及支持、弱化和矛盾 Evidence ID。Resume Claim 初始为 `unverified`，只能由关联 Evidence 改变状态。

### TopicThread 与 EvidenceGap

TopicThread 是 Project 内有边界的调查线索，保存 Turn/Evidence 引用、open Gaps、pending Leads、相关 Competency、饱和度与预期信息增益。EvidenceGap 描述能力判断仍缺少的具体证据；FollowUpLead 保存候选人回答中值得继续追问的具体对象。ProbeCoverage 用 `partial | sufficient` 记录某个提问角度已被回答到什么程度。

### InterviewTurn

InterviewTurn 保存不可变的 Question、Answer、时间和 Project/Topic 引用。摘要和 ConversationWindow 可以派生，但不能替换原文。

### Evidence

```text
id
turnId
projectId?
topicId?
claimIds[]
competencyId
statement
polarity: support | weakness | invalidate
strength: 0..1
specificity: 0..1
evaluatorConfidence: 0..1
sourceQuote
```

`statement` 是解释，`sourceQuote` 才是可审计来源；Quote 必须逐字存在于对应 Answer。

### CompetencyState

- `score`：Evidence 加权后的能力估计；
- `confidence`：Evidence 是否足够具体且一致；
- `evidenceIds`：计算依据；
- `missingEvidence`：尚未关闭的 Gap；
- `contradictoryEvidence`：未解决的反向 Evidence。

### DecisionTrace

Trace 保存 action、Project、Topic、Gap、Lead、Skill、Probe、reason 和 generatedQuestion，回答“为什么问这个问题”。模型与 Prompt 版本由运行记录补充，不改变领域判断。

## Role Pack

```text
Role
└── Competency[]
    ├── id / name
    ├── weight / core
    ├── behavioralAnchors
    ├── positiveIndicators
    ├── negativeIndicators
    ├── requiredEvidenceTypes
    └── coverageThreshold
```

Behavioral Anchor 描述可观察的决策、行动、约束或结果，不使用“优秀”“深入理解”等不可验证形容词。

## 更新与评分

```text
Raw Answer
  → validated Evidence
  → Claim linkage
  → score / confidence / coverage / contradiction
  → open Gap update
```

当前 score 使用 `strength × specificity`，support 将估计推向 100，weakness/invalidate 将估计推向 0；同一 Competency 取平均并四舍五入。confidence 使用 `evaluatorConfidence × specificity` 的平均值，上限 `0.95`。

Claim 更新严格区分 polarity：support → `supported`，weakness → `weakened`，invalidate → `contradicted`。invalidate 同时创建高优先级 contradiction Gap，Policy 必须先澄清再继续普通 Gap。

目标 scorer 必须版本化，并保持 score、confidence 和 coverage 三个独立量。总体结论要求核心 Competency 达到 coverageThreshold、重要矛盾已处理且等级可追溯到 Evidence ID；权重不能补偿核心能力完全无证据。

## 不变量

1. Raw Turn 与已接受 Evidence 只追加。
2. Resume Claim 不直接影响 score。
3. Evidence 必须引用存在的 Turn、Competency 和逐字 Quote。
4. Claim 状态只能由关联 Evidence 改变。
5. score、confidence 和 coverage 只能由 Evidence 与 Role 契约推导。
6. 已解决 Gap 能定位到解决它的 Evidence。
7. 模型失败不生成 Evidence 或推测事实。

## 验收

- 每个核心 Competency 有行为锚点和必要证据类型；
- 相同 Evidence 集和 scorer 版本产生相同结果；
- score 高但 coverage 低时不能产生高置信结论；
- contradicting Evidence 在结果和 UI 中可见；
- 强、弱、矛盾三个固定 Profile 产生预期差异；
- Policy 能根据缺失的必要证据选择下一 Gap。
